/* =========================================================
 * teacher.js — 담임교사용 도구 (CSV 일괄 분석, 반 분포, 학생별 보고서)
 * 학생 자료는 이 브라우저 메모리에서만 처리하며 저장·전송하지 않는다.
 * ========================================================= */
(function (global) {
  "use strict";
  const Calc = global.Calc, Search = global.Search, Store = global.Store, Report = global.Report;
  const cfg = global.UDATA.config;
  const esc = Report.esc;
  const isNum = Calc.isNum;
  const T = { students: [], grade: null, mode: "gachae", memos: {}, sel: new Set() };
  const $ = (s, el) => (el || document).querySelector(s);

  /* CSV 머리글 인식 */
  const ALIASES = {
    code: ["학생코드", "코드", "번호", "학번", "id", "code"],
    kor: ["국어", "국어원점수", "국어_원점수"], math: ["수학", "수학원점수", "수학_원점수"],
    t1: ["탐구1", "탐구1원점수", "통합사회", "사회탐구", "탐1"], t2: ["탐구2", "탐구2원점수", "통합과학", "과학탐구", "탐2"],
    eng: ["영어", "영어원점수"], his: ["한국사", "한국사원점수"]
  };
  const METRIC_SUFFIX = { std: ["표준", "표준점수", "표점"], pct: ["백분위", "백"], grade: ["등급"] };
  function norm(s) { return String(s || "").replace(/\s|\n|\(|\)|원점수$/g, "").toLowerCase(); }
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const rows = []; let cur = [], val = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { val += '"'; i++; } else q = false; } else val += ch; }
      else if (ch === '"') q = true;
      else if (ch === "," || ch === "\t") { cur.push(val); val = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; cur.push(val); rows.push(cur); cur = []; val = ""; }
      else val += ch;
    }
    if (val !== "" || cur.length) { cur.push(val); rows.push(cur); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  }
  function mapHeader(hdr, grade) {
    const map = {};
    hdr.forEach((h, i) => {
      const n = norm(h);
      for (const [key, al] of Object.entries(ALIASES)) {
        for (const a of al) {
          const an = norm(a);
          if (n === an) map[i] = { key, metric: key === "code" ? null : "raw" };
          for (const [m, sfx] of Object.entries(METRIC_SUFFIX)) for (const s of sfx) if (n === an + "_" + s || n === an + s) map[i] = { key, metric: m };
        }
      }
    });
    // 고1·고2: 탐구1/2 → 통합사회/통합과학
    if (grade < 3) for (const i in map) { if (map[i].key === "t1") map[i].key = "soc"; if (map[i].key === "t2") map[i].key = "sci"; }
    return map;
  }

  T.template = function (grade, mode) {
    const subs = Calc.subjects(grade).map((s) => s.n);
    if (mode === "gachae") return ["학생코드", ...subs, "영어", "한국사"].join(",") + "\n" + ["S01", ...subs.map((_, i) => (i < 2 ? "" : "")), "", ""].join(",") + "\n";
    const cols = ["학생코드"];
    for (const n of subs) for (const m of ["표준", "백분위", "등급"]) cols.push(n + "_" + m);
    cols.push("영어_등급", "한국사_등급");
    return cols.join(",") + "\n";
  };
  function download(name, text) {
    const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  async function analyze(text) {
    const g = T.grade, D = await Search.loadGrade(g);
    const rows = parseCSV(text);
    if (rows.length < 2) return { err: "머리글과 학생 자료가 한 줄 이상 있어야 합니다." };
    const map = mapHeader(rows[0], g);
    if (!Object.values(map).some((m) => m.key === "code")) return { err: "'학생코드' 열을 찾지 못했습니다. 서식 파일을 내려받아 머리글을 맞춰 주세요." };
    const out = [];
    const seen = new Set();
    for (const r of rows.slice(1)) {
      const inputs = {}; let code = "";
      r.forEach((v, i) => {
        const m = map[i]; if (!m) return;
        if (m.key === "code") { code = String(v).trim(); return; }
        const t = String(v).trim(); if (t === "") return;
        inputs[m.key] = inputs[m.key] || {};
        inputs[m.key][m.metric] = isNum(t) ? Number(t) : NaN;
      });
      if (!code) continue;
      if (seen.has(code)) code = code + "(중복)";
      seen.add(code);
      if (T.mode === "official") for (const k in inputs) delete inputs[k].raw;
      const ctx = { grade: g, mode: T.mode, data: D, official: D.official };
      const prof = Calc.resolve(ctx, inputs);
      const scale = Calc.defaultScale(prof);
      const range = Store.state.range;
      let near = 0, reached = null, best = [];
      if (scale) {
        const items = [];
        for (const row of D.rows) { const c = Calc.compareRow(row, prof, scale, {...cfg,choices:{}}); if (c.status === "exact") { if (Math.abs(c.diff) <= range) { near++; items.push({ row, c }); } } }
        reached = D.rows.filter(row=>{const c=Calc.compareRow(row,prof,scale,{...cfg,choices:{},compareMode:"common"});return c.status==="exact"&&c.diff>=0;}).length;
        best = items.sort((a, b) => Math.abs(a.c.diff) - Math.abs(b.c.diff) || a.row.univ.localeCompare(b.row.univ, "ko")).slice(0, 3).map((x) => `${x.row.univ} ${x.row.unit}`);
      }
      out.push({ code, inputs, prof, scale, near, reached, best });
    }
    return { students: out };
  }

  function bins(students, scale) {
    const vals = students.map((s) => s.prof.totals[scale]).filter(isNum);
    if (!vals.length) return null;
    const w = 10, lo = Math.floor(Math.min(...vals) / w) * w, hi = Math.floor(Math.max(...vals) / w) * w;
    const b = [];
    for (let x = lo; x <= hi; x += w) b.push({ x, n: vals.filter((v) => v >= x && v < x + w).length });
    return { b, max: Math.max(...b.map((y) => y.n)), w };
  }

  T.render = function (root) {
    if (T.grade == null) { T.grade = Store.state.grade; T.mode = Store.state.mode; }
    const offOn = !!(cfg.official.enabled || Store.state.officialPreview);
    const S = T.students;
    const scaleCounts = {}; S.forEach((s) => { if (s.scale) scaleCounts[s.scale] = (scaleCounts[s.scale] || 0) + 1; });
    const mainScale = Object.entries(scaleCounts).sort((a, b) => b[1] - a[1])[0];
    const hist = mainScale ? bins(S, mainScale[0]) : null;
    const cumBands = [[0, 4], [4, 11], [11, 23], [23, 40], [40, 60], [60, 77], [77, 89], [89, 100]];
    const cumVals = S.map((s) => s.prof.cum.std && s.prof.cum.std.kms && s.prof.cum.std.kms.p).filter(isNum);
    root.innerHTML = `
      <div class="notice warn"><b>개인정보 안내</b> — 학생 성적은 이 브라우저 안에서만 계산하며 서버로 보내거나 저장하지 않습니다. 창을 닫으면 사라집니다. 이 화면은 메뉴 속에 둔 것일 뿐 비밀번호로 보호되지 않습니다. 학생 이름 대신 <b>익명 학생 코드</b>를 쓰세요.</div>
      <div class="card stack"><h2>1. 학년과 성적 종류</h2>
        <div class="seg" role="group">${[1, 2, 3].map((g) => `<button type="button" data-t="grade" data-v="${g}" aria-pressed="${T.grade === g}">고${g}</button>`).join("")}</div>
        <div class="seg" role="group"><button type="button" data-t="mode" data-v="gachae" aria-pressed="${T.mode === "gachae"}">가채점 원점수</button><button type="button" data-t="mode" data-v="official" aria-pressed="${T.mode === "official"}" ${offOn ? "" : "disabled"}>공식 성적표${offOn ? "" : " (준비 중)"}</button></div>
        <label class="row" style="font-size:14px"><input type="checkbox" id="offPrev" ${Store.state.officialPreview ? "checked" : ""} style="width:20px;height:20px;min-height:0"> 공식 성적표 모드 미리보기 (이 기기에서만, 점검용)</label></div>
      <div class="card stack"><h2>2. CSV 파일 넣기</h2>
        <p class="sub" style="margin:0">엑셀에서 '다른 이름으로 저장 ▸ CSV UTF-8'로 저장한 파일을 넣으세요. ${T.mode === "gachae" ? "과목별 원점수" : "과목별 표준·백분위·등급(아는 값만)"} 열이 필요합니다.</p>
        <div class="row"><button class="btn small" type="button" data-t="template">서식 파일 내려받기</button><label class="btn small primary" for="csvFile" style="cursor:pointer">CSV 파일 선택</label><input id="csvFile" type="file" accept=".csv,text/csv,.txt" hidden></div>
        <details class="fold"><summary>또는 붙여넣기</summary><div class="fold-in"><textarea id="csvPaste" placeholder="학생코드,국어,수학,${Calc.subjects(T.grade)[2].n},${Calc.subjects(T.grade)[3].n}&#10;S01,80,76,41,39"></textarea><button class="btn small" type="button" data-t="paste">분석하기</button></div></details>
        <div id="tMsg"></div></div>
      ${S.length ? `
      <div class="card stack"><h2>3. 반 전체 분포 <span class="muted">${S.length}명</span></h2>
        ${hist ? `<p class="sub" style="margin:0">${Calc.SCALE_SHORT[mainScale[0]]} (${hist.w}점 구간)</p><div class="hist">${hist.b.map((y) => `<div style="height:${hist.max ? (y.n / hist.max) * 100 : 0}%"><span>${y.n || ""}</span></div>`).join("")}</div><div class="hist-x">${hist.b.map((y) => `<span>${y.x}</span>`).join("")}</div>` : `<p class="muted">국수탐 합을 계산할 수 있는 학생이 없습니다.</p>`}
        ${cumVals.length ? `<h3>전국 상위누적 구간 (표준점수 국수탐)</h3><div class="scroll-x"><table class="mini-table"><thead><tr>${cumBands.map(([a, b]) => `<th>${a}~${b}%</th>`).join("")}</tr></thead><tbody><tr>${cumBands.map(([a, b]) => `<td>${cumVals.filter((v) => v > a && v <= b || (a === 0 && v === 0)).length}명</td>`).join("")}</tr></tbody></table></div>` : ""}</div>
      <div class="card stack"><h2>4. 학생별 결과</h2>
        <div class="row"><button class="btn small" type="button" data-t="export">결과 CSV 내보내기</button><button class="btn small" type="button" data-t="print-sel">선택 학생 보고서 인쇄${T.sel.size ? ` (${T.sel.size})` : ""}</button><button class="btn small" type="button" data-t="sel-all">${T.sel.size === S.length ? "선택 해제" : "모두 선택"}</button><button class="btn small ghost" type="button" data-t="clear" style="color:var(--down)">학생 자료 지우기</button></div>
        <div class="scroll-x"><table class="res"><thead><tr><th></th><th>코드</th><th class="r">표준합</th><th class="r">백분위합</th><th class="r">원점수합</th><th class="r">상위누적</th><th class="r">평균등급</th><th class="r">±${Store.state.range}점</th><th class="r">도달</th><th>기준 도달 상위 3</th><th>메모</th><th></th></tr></thead><tbody>
          ${S.map((s, i) => `<tr><td><input type="checkbox" data-sel="${i}" ${T.sel.has(i) ? "checked" : ""} aria-label="${esc(s.code)} 선택" style="width:20px;height:20px;min-height:0"></td><td><b>${esc(s.code)}</b>${s.prof.errors.length ? `<br><span class="pill down" title="${esc(s.prof.errors.join(" "))}">입력 확인</span>` : ""}${s.prof.warnings.length ? `<br><span class="pill near">지표 모순 의심</span>` : ""}</td><td class="r">${fmt(s.prof.totals.std)}</td><td class="r">${fmt(s.prof.totals.pct)}</td><td class="r">${fmt(s.prof.totals.raw)}</td><td class="r">${s.prof.cum.std && s.prof.cum.std.kms && isNum(s.prof.cum.std.kms.p) ? s.prof.cum.std.kms.p + "%" : "–"}</td><td class="r">${fmt(s.prof.gradeAvg)}</td><td class="r">${s.scale ? s.near : "–"}</td><td class="r">${s.reached ?? "–"}</td><td class="best" style="font-size:12.5px">${s.best.map(esc).join("<br>") || (s.scale ? "–" : "추가 입력 필요")}</td><td><input type="text" data-memo="${esc(s.code)}" value="${esc(T.memos[s.code] || "")}" aria-label="${esc(s.code)} 메모" style="min-width:120px;min-height:36px;font-size:14px"></td><td><button class="btn small" type="button" data-t="open" data-v="${i}">상담 열기</button></td></tr>`).join("")}
        </tbody></table></div>
        <p class="muted" style="margin:0">'상담 열기'는 이 학생의 성적을 개별 상담 화면에 불러옵니다(지금 화면의 고${T.grade} ${T.mode === "gachae" ? "가채점" : "공식"} 입력을 덮어씁니다).</p></div>` : ""}`;

    root.onclick = async (e) => {
      const b = e.target.closest("[data-t]"); if (!b) return;
      const t = b.dataset.t, v = b.dataset.v;
      if (t === "grade") { T.grade = Number(v); T.students = []; T.sel.clear(); T.render(root); }
      if (t === "mode") { if (b.disabled) return; T.mode = v; T.students = []; T.sel.clear(); T.render(root); }
      if (t === "template") download(`학생성적_서식_고${T.grade}_${T.mode === "gachae" ? "가채점" : "공식"}.csv`, T.template(T.grade, T.mode));
      if (t === "paste") run($("#csvPaste").value);
      if (t === "export") exportCSV();
      if (t === "sel-all") { if (T.sel.size === T.students.length) T.sel.clear(); else T.students.forEach((_, i) => T.sel.add(i)); T.render(root); }
      if (t === "clear") { T.students = []; T.memos = {}; T.sel.clear(); T.render(root); }
      if (t === "print-sel") printSel();
      if (t === "open") openStudent(Number(v));
    };
    root.onchange = (e) => {
      if (e.target.id === "csvFile" && e.target.files[0]) { const fr = new FileReader(); fr.onload = () => run(String(fr.result)); fr.readAsText(e.target.files[0], "utf-8"); }
      if (e.target.id === "offPrev") { Store.state.officialPreview = e.target.checked; Store.save(); global.App.h.renderTop(); if (!e.target.checked && Store.state.mode === "official" && !cfg.official.enabled) { Store.state.mode = "gachae"; global.App.setGrade(Store.state.grade); } T.render(root); }
      if (e.target.dataset.sel != null) { const i = Number(e.target.dataset.sel); if (e.target.checked) T.sel.add(i); else T.sel.delete(i); }
    };
    root.oninput = (e) => { if (e.target.dataset.memo != null) T.memos[e.target.dataset.memo] = e.target.value; };
    async function run(text) {
      const msg = $("#tMsg");
      msg.innerHTML = `<p class="muted">분석 중…</p>`;
      const res = await analyze(text);
      if (res.err) { msg.innerHTML = `<div class="notice err">${esc(res.err)}</div>`; return; }
      T.students = res.students; T.sel.clear();
      T.render(root);
      const m2 = $("#tMsg"); if (m2) m2.innerHTML = `<div class="notice">${res.students.length}명을 분석했습니다. ${res.students.filter((s) => s.prof.errors.length).length ? "입력 확인이 필요한 학생이 있습니다." : ""}</div>`;
    }
  };
  const fmt = (v) => (isNum(v) ? (Math.round(v * 100) / 100).toString() : "–");

  function exportCSV() {
    const r = Store.state.range;
    const head = ["학생코드", "학년", "성적종류", "표준점수합", "백분위합", "원점수합", "국수탐 상위누적(%)", "평균등급", "비교척도", `±${r}점 모집단위 수`, "기준점수 도달 수", "내 점수와 가까운 3곳", "메모", "입력 확인"];
    const q = (x) => { let s = String(x ?? ""); if (/^[\s\u0000-\u001f]*[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
    const lines = [head.map(q).join(",")].concat(T.students.map((s) => [s.code, "고" + T.grade, T.mode === "gachae" ? "가채점" : "공식", s.prof.totals.std, s.prof.totals.pct, s.prof.totals.raw, s.prof.cum.std && s.prof.cum.std.kms ? s.prof.cum.std.kms.p : "", s.prof.gradeAvg, s.scale ? Calc.SCALE_NAME[s.scale] : "계산 불가", s.scale ? s.near : "", s.reached, s.best.join(" / "), T.memos[s.code] || "", s.prof.errors.join(" ")].map(q).join(",")));
    download(`반분석_고${T.grade}_${Report.today()}.csv`, lines.join("\n"));
  }
  function printSel() {
    const idx = T.sel.size ? [...T.sel] : T.students.map((_, i) => i);
    if (!idx.length) return;
    Search.loadGrade(T.grade).then((D) => {
      const list = idx.map((i) => { const s = T.students[i]; return global.Views.reportData({ grade: T.grade, mode: T.mode, prof: s.prof, scale: s.scale, D, name: s.code, memo: T.memos[s.code] || "", favIds: [], hope: {}, targetId: null }); });
      // 관심 모집단위 대신 기준 도달 상위 3을 표로 보여준다
      list.forEach((d, j) => {
        const s = T.students[idx[j]];
        if (!s.scale) return;
        const items = D.rows.map((row) => ({ row, c: Calc.compareRow(row, s.prof, s.scale, {...cfg,choices:{}}) })).filter((x) => x.c.status === "exact" && Math.abs(x.c.diff) <= Store.state.range).sort((a, b) => Math.abs(a.c.diff) - Math.abs(b.c.diff)).slice(0, 10);
        d.picks = items.map((x) => ({ group: x.row.group, univ: x.row.univ, adm: x.row.adm, unit: x.row.unit, ref: x.c.ref, mine: x.c.mine, diff: x.c.diff, status: Calc.TONE_TEXT[x.c.tone] }));
        d.scaleLabel = Calc.SCALE_SHORT[s.scale] + ` · 내 점수와 가까운 10개`;
      });
      Report.print(list);
    });
  }
  async function openStudent(i) {
    const s = T.students[i]; if (!s) return;
    const st = Store.state;
    if (T.mode === "official" && !(cfg.official.enabled || st.officialPreview)) return;
    st.inputs["g" + T.grade][T.mode] = JSON.parse(JSON.stringify(s.inputs));
    st.mode = T.mode;
    global.App.closePanel();
    await global.App.setGrade(T.grade);
    global.App.setView("find");
    global.App.toast(`${s.code} 학생 성적을 불러왔습니다. '대학 찾기'를 누르세요.`);
  }

  global.Teacher = T;
})(window);
