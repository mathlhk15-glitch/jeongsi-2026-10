/* =========================================================
 * app.js — 화면 구성과 사용자 동작
 * ========================================================= */
(function (global) {
  "use strict";
  const cfg = global.UDATA.config;
  const Calc = global.Calc, Search = global.Search, Store = global.Store, Sim = global.Sim, Report = global.Report;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const esc = Report.esc;
  const isNum = Calc.isNum;

  const App = { D: null, prof: null, scale: null, view: "find", shown: cfg.pageSize, searched: false, labDeltas: {}, compareSel: [] };
  global.App = App;
  const St = () => Store.state;

  /* ---------- 공통 ---------- */
  const DISCLAIMER = "이 분석은 해당 학력평가 성적과 제공된 대학 지원참고표를 비교한 참고자료입니다. 점수 차이는 합격 확률을 뜻하지 않습니다. 실제 지원 시에는 모집연도별 대학 모집요강, 수능 반영방법, 모집인원, 지원 자격 등을 반드시 확인해야 합니다.";
  function toast(msg) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
    document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
  }
  App.toast = toast;
  const fmt = (v) => (isNum(v) ? (Math.round(v * 100) / 100).toString() : "–");
  const sgn = (v) => (isNum(v) ? (v > 0 ? "+" : "") + fmt(v) : "–");
  const officialOn = () => !!(cfg.official.enabled || St().officialPreview);
  const ctx = () => ({ grade: St().grade, mode: St().mode, data: App.D, official: App.D && App.D.official });
  const gkey = () => "g" + St().grade;
  const favs = () => St().favorites[gkey()];
  const isFav = (id) => favs().some((f) => f.id === id);
  const subs = () => Calc.subjects(St().grade);
  const rowLabel = (r) => `${r.univ}${r.campus ? "(" + r.campus + ")" : ""}`;
  const STATUS_TEXT = { exact: "① 지원참고표 산출기준 비교", partial: "② 일부 분석 가능", need: "③ 추가 입력 필요", condition:"응시 조건 확인" };

  /* ---------- 브라우저 뒤로가기: 중첩 화면부터 닫기 ---------- */
  let navigatingBack = false;
  function markOverlay(type) {
    if (navigatingBack) return;
    history.pushState({ scoreOverlay: type, scoreView: App.view }, "", location.pathname + location.search + "#" + App.view);
  }
  function rawCloseOverlays() { $("#scrim").hidden = true; $("#sheet").hidden = true; $("#drawer").hidden = true; }
  window.addEventListener("popstate", (e) => {
    navigatingBack = true; const priorScroll=App._detailScroll;
    if (!$("#panel").hidden) closePanel(true);
    else if (!$("#sheet").hidden || !$("#drawer").hidden) { const sh=!$("#sheet").hidden;rawCloseOverlays(); if(sh&&Number.isFinite(priorScroll))requestAnimationFrame(()=>window.scrollTo(0,priorScroll)); }
    else if (["find", "goal", "lab", "box"].includes(e.state && e.state.scoreView)) setView(e.state.scoreView, true);
    else setView("find", true);
    navigatingBack = false;
  });
  /* ---------- 초기화 ---------- */
  App.init = async function () {
    Store.load();
    if (cfg.official.enabled && !Store.remember) St().mode = "official";
    if (!officialOn() && St().mode === "official") St().mode = "gachae";
    $("#footDisclaimer").textContent = DISCLAIMER;
    $("#rememberChk").checked = Store.remember;
    bindStatic();
    await App.setGrade(St().grade, true);
  };

  App.setGrade = async function (g, first) {
    if (St().grade !== g) { St().scale = "auto"; App.compareSel = []; App._quickHope = null; }
    St().grade = g;
    $("#ctxChip").textContent = "자료 불러오는 중…";
    try { App.D = await Search.loadGrade(g); }
    catch (e) { $("#ctxChip").textContent = "자료 오류"; $("#yearBanner").innerHTML = `<b>자료 파일을 불러오지 못했습니다.</b> ${esc(e.message)}`; return; }
    App.shown = cfg.pageSize; App.labDeltas = {};
    if (!first) { App.searched = false; showInputCard(true); }
    renderTop(); renderInputs(); recompute(); Store.save();
    if (first && St().inputs[gkey()][St().mode] && hasAnyInput()) { /* 저장된 값이 있어도 사용자가 '대학 찾기'를 눌러야 결과 표시 */ }
    renderView();
  };
  function hasAnyInput() { const i = Store.inputs(); return Object.values(i).some((c) => c && Object.values(c).some(isNum)); }

  function bindStatic() {
    $("#gradeSeg").addEventListener("click", (e) => { const b = e.target.closest("button[data-g]"); if (b) App.setGrade(Number(b.dataset.g)); });
    $("#modeSeg").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-m]"); if (!b || b.disabled) return;
      if (St().mode === b.dataset.m) return;
      St().mode = b.dataset.m; St().scale = "auto"; App._quickHope = null; App.searched = false; App.labDeltas = {}; showInputCard(true);
      renderTop(); renderInputs(); recompute(); renderView(); Store.save();
      toast(b.dataset.m === "official" ? "공식 성적표 입력으로 바꿨습니다. 가채점 입력은 그대로 보관됩니다." : "가채점 입력으로 바꿨습니다. 공식 성적표 입력은 그대로 보관됩니다.");
    });
    $("#goBtn").addEventListener("click", runSearch);
    $("#editBtn").addEventListener("click", () => { showInputCard(true); $("#inputCard").scrollIntoView({ behavior: "smooth", block: "start" }); });
    $("#resetInputsBtn").addEventListener("click", () => {
      const btn = $("#resetInputsBtn");
      if (btn.dataset.confirm !== "1") { btn.dataset.confirm = "1"; btn.textContent = "한 번 더 누르면 지움"; setTimeout(() => { btn.dataset.confirm = ""; btn.textContent = "입력 초기화"; }, 3000); return; }
      St().inputs[gkey()][St().mode] = {}; btn.dataset.confirm = ""; btn.textContent = "입력 초기화";
      App.searched = false; renderInputs(); recompute(); renderView(); Store.save(); toast("이 학년·성적 종류의 입력을 지웠습니다.");
    });
    $("#brandBtn").addEventListener("click", () => { setView("find"); window.scrollTo({ top: 0, behavior: "smooth" }); });
    $$(".bottomnav button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
    $("#menuBtn").addEventListener("click", openDrawer);
    $("#scrim").addEventListener("click", closeOverlays);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeOverlays(); });
    $("#drawer").addEventListener("click", (e) => { const b = e.target.closest("[data-panel]"); if (b) { rawCloseOverlays(); history.replaceState({scoreView:App.view},"",location.pathname+location.search+"#"+App.view); openPanel(b.dataset.panel); } });
    $("#rememberChk").addEventListener("change", (e) => { Store.setRemember(e.target.checked); toast(e.target.checked ? "이 기기에 입력값을 기억합니다. 공용 PC에서는 끄세요." : "기억하지 않습니다. 저장된 값을 지웠습니다."); renderView(); });
    $("#wipeBtn").addEventListener("click", () => {
      const b = $("#wipeBtn");
      if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "정말 지우려면 한 번 더 누르세요"; setTimeout(() => { b.dataset.confirm = ""; b.textContent = "모든 입력값 지우기"; }, 3500); return; }
      Store.wipe(); b.dataset.confirm = ""; b.textContent = "모든 입력값 지우기"; $("#rememberChk").checked = false;
      closeOverlays(); App.searched = false; App.setGrade(3); toast("모든 입력값과 보관함을 지웠습니다.");
    });
    $("#rangeSeg").addEventListener("click", (e) => { const b = e.target.closest("button[data-r]"); if (!b) return; St().range = Number(b.dataset.r); App.shown = cfg.pageSize; renderRange(); if (App.searched) renderResults(); Store.save(); });
    // 결과·상세 공통 동작(이벤트 위임)
    document.addEventListener("click", onAction);
    window.addEventListener("hashchange", () => { const v = location.hash.replace("#", ""); if (["find", "goal", "lab", "box"].includes(v)) setView(v, true); });
  }

  /* ---------- 상단 · 학년 · 모드 ---------- */
  function renderTop() {
    const g = St().grade, m = St().mode, meta = App.D.meta;
    $$("#gradeSeg button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.g) === g)));
    const offBtn = $('#modeSeg button[data-m="official"]');
    offBtn.disabled = !officialOn();
    $("#officialSmall").textContent = cfg.official.enabled ? "성적표 배부 후" : St().officialPreview ? "미리보기" : "준비 중";
    $$("#modeSeg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === m)));
    $("#ctxChip").textContent = `고${g} · ${m === "gachae" ? "가채점" : "공식 성적표"}`;
    const target = cfg.datasets[gkey()].target;
    $("#yearBanner").innerHTML = `<b>${esc(meta.examName)} · 고${g} · ${St().mode === "official" ? "공식 성적표 입력" : "가채점"}</b> — ${target}학년도 대입 대상입니다. 비교 기준은 <b>${meta.refAdmissionYear}학년도 지원참고표</b>(${esc(meta.source)}, 자료 기준일 ${esc(meta.baseDate)})${target !== meta.refAdmissionYear ? "로, 실제 대입 연도와 모집연도가 다릅니다. 대학 수준을 가늠하는 참고용으로만 보세요." : "입니다."}`;
    const note = $("#modeNote");
    if (m === "official") {
      note.hidden = false; note.className = "notice";
      note.innerHTML = `<b>성적표에서 확인한 값만 입력하세요.</b> 과목마다 표준점수·백분위·등급 중 <b>하나 이상</b>이면 됩니다. 비워 둔 칸은 오류가 아닙니다.${App.D.official ? "" : " 아직 공식 점수 대응표가 등록되지 않아, 입력하지 않은 지표를 자동으로 채우지 않습니다."}${cfg.official.enabled ? "" : " <b>(미리보기 상태)</b>"}`;
    } else if (g === 3) {
      note.hidden = false; note.className = "notice";
      note.innerHTML = "<b>고3 원점수 합은 선택과목별 유불리가 반영되지 않는 대략적인 참고 비교입니다.</b> 고3 지원참고표에는 원점수 변환표가 없습니다. <b>원점수 합</b>으로 바로 비교하고, 가채점 분석기관에서 확인한 표준점수·백분위가 있으면 '추가 성적'에 넣어 같은 척도로 비교할 수 있습니다.";
    } else note.hidden = true;
    renderRange();
  }
  function renderRange() {
    $("#rangeSeg").innerHTML = cfg.ranges.map((r) => `<button type="button" data-r="${r}" aria-pressed="${St().range === r}">±${r}점</button>`).join("");
  }

  /* ---------- 성적 입력 ---------- */
  function cellInput(subj, metric, val, opts) {
    const lim = Calc.limits(subj, metric);
    const id = `in-${St().grade}-${St().mode}-${subj.k}-${metric}`;
    const tag = { raw: "원점수", std: "표준점수", pct: "백분위", grade: "등급" }[metric];
    return `<div class="cellbox"><span class="tag">${tag}</span><input id="${id}" data-s="${subj.k}" data-m="${metric}" type="text" inputmode="${lim.step < 1 ? "decimal" : "numeric"}" autocomplete="off" aria-label="${subj.n} ${tag}" placeholder="${opts && opts.ph ? opts.ph : lim.min + "~" + lim.max}" value="${isNum(val) ? val : ""}"></div>`;
  }
  function renderInputs() {
    const g = St().grade, m = St().mode, inp = Store.inputs();
    const box = $("#scoreInputs");
    let html = "";
    if (m === "gachae") {
      html += subs().map((s) => `<div class="score-row"><div class="sname">${s.n}<small>${s.rawMax}점 만점</small></div><div><div class="score-cells" style="--cols:1">${cellInput(s, "raw", (inp[s.k] || {}).raw)}</div><div class="conv" id="conv-${s.k}"></div></div></div>`).join("");
      if (g === 3) {
        html += `<details class="fold" id="addFold"${subs().some((s) => ["std", "pct", "grade"].some((k) => isNum((inp[s.k] || {})[k]))) ? " open" : ""}><summary>추가 성적 (선택) — 표준점수·백분위·등급</summary><div class="fold-in">
          <p class="muted" style="margin:0">가채점 분석기관에서 확인한 값만 넣으세요. 하나만 알아도 됩니다. 원점수로 추정해 채우지 않습니다.</p>
          <div class="headrow"><div></div><div class="score-cells" style="--cols:3"><div>표준점수</div><div>백분위</div><div>등급</div></div></div>
          ${subs().map((s) => `<div class="score-row"><div class="sname">${s.n}</div><div class="score-cells" style="--cols:3">${["std", "pct", "grade"].map((k) => cellInput(s, k, (inp[s.k] || {})[k], { ph: "" })).join("")}</div></div>`).join("")}
        </div></details>`;
      }
    } else {
      html += `<div class="headrow"><div></div><div class="score-cells" style="--cols:3"><div>표준점수</div><div>백분위</div><div>등급</div></div></div>`;
      html += subs().map((s) => `<div class="score-row"><div class="sname">${s.n}</div><div><div class="score-cells" style="--cols:3">${["std", "pct", "grade"].map((k) => cellInput(s, k, (inp[s.k] || {})[k], { ph: "" })).join("")}</div><div class="conv" id="conv-${s.k}"></div></div></div>`).join("");
    }
    box.innerHTML = html;
    // 영어·한국사
    const ex = Calc.extras.map((e) => {
      const c = inp[e.k] || {};
      if (m === "gachae") return `<div class="score-row"><div class="sname">${e.n}<small>${e.rawMax}점 · 절대평가</small></div><div><div class="score-cells" style="--cols:2">${cellInput(e, "raw", c.raw)}${cellInput(e, "grade", c.grade, { ph: "" })}</div><div class="conv" id="conv-${e.k}"></div></div></div>`;
      return `<div class="score-row"><div class="sname">${e.n}</div><div><div class="score-cells" style="--cols:1">${cellInput(e, "grade", c.grade, { ph: "1~9" })}</div><div class="conv" id="conv-${e.k}"></div></div></div>`;
    }).join("");
    $("#extraInputs").innerHTML = `<p class="muted" style="margin:0">영어·한국사는 국수탐 합에 들어가지 않습니다. ${g === 3 ? "고3은 대학별 영어·한국사 등급 점수를 상세 화면에서 보여 줍니다." : "상담보고서에 함께 기록됩니다."}${m === "gachae" ? " 원점수를 넣으면 절대평가 기준으로 등급을 계산합니다." : ""}</p>${ex}`;
    // 고3 선택과목
    const ch = $("#g3Choices");
    if (g === 3) {
      const c = Store.choices();
      ch.hidden = false;
      ch.innerHTML = `<details class="fold"${c.mathSel || c.t1Type || c.t2Type ? " open" : ""}><summary>선택과목 (선택) — 지원 조건 확인용</summary><div class="fold-in"><div class="row" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
        ${selectHtml("korSel", "국어 선택", ["", "화작", "언매"], c.korSel)}
        ${selectHtml("mathSel", "수학 선택", ["", "확통", "미적", "기하"], c.mathSel)}
        ${selectHtml("t1Subject", "탐구1 과목", G3_TAM, c.t1Subject)}
        ${selectHtml("t2Subject", "탐구2 과목", G3_TAM, c.t2Subject)}
      </div><p class="muted" style="margin:0">대학이 정한 수학·탐구 응시 조건과 맞지 않으면 상세 화면에 알려 줍니다. 점수 계산에는 쓰지 않습니다.</p></div></details>`;
    } else { ch.hidden = true; ch.innerHTML = ""; }
    renderHopePanel();
  }
  const G3_TAM = ["", "생활과윤리", "윤리와사상", "한국지리", "세계지리", "동아시아사", "세계사", "경제", "정치와법", "사회문화", "물리학Ⅰ", "물리학Ⅱ", "화학Ⅰ", "화학Ⅱ", "생명과학Ⅰ", "생명과학Ⅱ", "지구과학Ⅰ", "지구과학Ⅱ", "농업기초기술", "공업일반", "상업경제", "수산해운산업기초", "인간발달"];
  const tamTypeOf = s => !s ? "" : /학[ⅠⅡ]/.test(s) ? "과학" : ["농업기초기술","공업일반","상업경제","수산해운산업기초","인간발달"].includes(s) ? "직업" : "사회";
  function selectHtml(k, label, opts, val) {
    return `<div class="field"><label for="ch-${k}">${label}</label><select id="ch-${k}" data-choice="${k}">${opts.map((o) => `<option value="${o}"${o === val ? " selected" : ""}>${o || "모름"}</option>`).join("")}</select></div>`;
  }
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.matches("input[data-s][data-m]") && t.closest("#inputCard")) {
      const inp = Store.inputs();
      const k = t.dataset.s, m = t.dataset.m;
      const v = t.value.trim().replace(",", ".");
      inp[k] = inp[k] || {};
      if (v === "") delete inp[k][m];
      else if (isNum(v)) inp[k][m] = Number(v);
      else { inp[k][m] = NaN; }
      t.classList.toggle("bad", v !== "" && !isNum(v));
      recompute(); updateConvLines(); updateInputMsgs();
      if (App.searched) debouncedResults();
      Store.save();
    }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.matches("select[data-choice]")) { const c=Store.choices(); c[t.dataset.choice]=t.value; if(t.dataset.choice==="t1Subject" || t.dataset.choice==="t2Subject") { c.t1Type=tamTypeOf(c.t1Subject);c.t2Type=tamTypeOf(c.t2Subject); const e=document.getElementById("tamDuplicateMsg"); if(e)e.remove(); if(c.t1Subject && c.t1Subject===c.t2Subject){t.insertAdjacentHTML("afterend",'<span id="tamDuplicateMsg" class="notice">동일한 탐구 과목을 두 번 선택할 수 없습니다.</span>'); c[t.dataset.choice]=""; t.value=""; c.t1Type=tamTypeOf(c.t1Subject); c.t2Type=tamTypeOf(c.t2Subject);} } Store.save(); }
  });
  let resTimer = null;
  function debouncedResults() { clearTimeout(resTimer); resTimer = setTimeout(() => { renderProfile(); renderResults(); renderSummary(); }, 300); }

  function recompute() {
    cfg.choices = St().grade === 3 ? Store.choices() : {};
    App.prof = Calc.resolve(ctx(), Store.inputs());
    const want = St().scale;
    const av = Calc.availableScales(App.prof);
    App.scale = want !== "auto" && av.includes(want) ? want : Calc.defaultScale(App.prof);
    if(St().grade===3 && !App.scale && App.prof.anyInput) App.scale="std";
  }
  App.recompute = recompute;

  function updateConvLines() {
    const P = App.prof;
    for (const s of subs()) {
      const el = $("#conv-" + s.k); if (!el) continue;
      const c = P.subj[s.k];
      if (St().mode === "gachae" && St().grade < 3) {
        el.innerHTML = isNum(c.std) ? `표준 <b>${c.std}</b> · 백분위 <b>${c.pct}</b> · <b>${c.grade}</b>등급 · 상위 ${c.cum}%` : c.noTable ? `<span style="color:var(--down)">변환표에 없는 점수</span>` : "";
      } else if (St().mode === "official") {
        const filled = ["std", "pct", "grade"].filter((m) => c.src[m] === "official");
        el.innerHTML = filled.length ? `대응표로 채움: ${filled.map((m) => ({ std: "표준", pct: "백분위", grade: "등급" }[m]) + " " + c[m]).join(" · ")}` : "";
      } else el.innerHTML = "";
    }
    for (const e of Calc.extras) {
      const el = $("#conv-" + e.k); if (!el) continue;
      const c = P.extra[e.k];
      el.innerHTML = c.src.grade === "absolute" ? `절대평가 <b>${c.grade}</b>등급` : "";
    }
  }
  function updateInputMsgs() {
    if (!App.prof) recompute();
    const P = App.prof, box = $("#inputMsgs");
    const parts = [];
    if (P.errors.length) parts.push(`<div class="notice err">${P.errors.map(esc).join("<br>")}</div>`);
    if (P.warnings.length) parts.push(`<div class="notice warn">${P.warnings.map(esc).join("<br>")}</div>`);
    if (P.anyInput && !App.scale) {
      const need = Calc.neededInputs(P);
      parts.push(`<div class="notice">아직 국수탐 합을 계산할 수 없습니다. ${need && need.list.length ? `<b>${need.list.join(", ")} ${Calc.SCALE_NAME[need.scale]}</b>를 입력하면 ±점수 검색을 쓸 수 있습니다.` : ""} 지금은 희망 대학 검색과 과목별 성적 확인을 할 수 있습니다.</div>`);
    }
    box.innerHTML = parts.join("");
    const hc = $("#hopeCount"); const h = St().hope;
    const n = h.univs.length + h.depts.length + h.fields.length;
    hc.hidden = !n; hc.textContent = n + "개";
  }

  /* ---------- 희망 조건 ---------- */
  function renderHopePanel() {
    const h = St().hope, D = App.D;
    const chips = (arr, kind) => arr.map((v) => `<span class="chip" aria-pressed="true">${esc(v)}<button class="x" type="button" data-act="hope-del" data-kind="${kind}" data-v="${esc(v)}" aria-label="${esc(v)} 지우기">×</button></span>`).join("");
    $("#hopePanel").innerHTML = `
      <div class="field ac"><label for="hopeUniv">희망 대학 (여러 개 가능)</label><input id="hopeUniv" type="search" placeholder="예: 부산대" autocomplete="off"><div class="ac-list" id="hopeUnivList" hidden></div></div>
      <div class="chips">${chips(h.univs, "univs")}</div>
      <div class="field"><label for="hopeDept">희망 학과 키워드 (입력 후 Enter 또는 추가)</label><div class="row" style="flex-wrap:nowrap"><input id="hopeDept" type="search" placeholder="예: 컴퓨터, 간호" autocomplete="off"><button class="btn small" type="button" data-act="hope-add-dept">추가</button></div></div>
      <div class="chips">${chips(h.depts, "depts")}</div>
      <label class="row" style="font-size:14px"><input type="checkbox" id="hopeRelated" ${h.related ? "checked" : ""} style="width:20px;height:20px;min-height:0"> 관련 분야 학과도 함께 찾기 (예: 컴퓨터 → 소프트웨어·인공지능)</label>
      <div><span class="lbl">희망 계열</span><div class="chips">${["인문", "자연", "공통"].map((f) => `<button type="button" class="chip" data-act="hope-field" data-v="${f}" aria-pressed="${h.fields.includes(f)}">${f}</button>`).join("")}</div></div>
      <details class="fold"><summary>상세 계열 · 지역 · 검색 방식</summary><div class="fold-in">
        <div class="field"><label for="hopeSub">상세 계열 추가</label><select id="hopeSub"><option value="">선택하세요</option>${D.subfields.map((s) => `<option${h.fields.includes(s) ? " disabled" : ""}>${esc(s)}</option>`).join("")}</select></div>
        <div class="chips">${chips(h.fields.filter((f) => !["인문", "자연", "공통"].includes(f)), "fields")}</div>
        <div><span class="lbl">희망 지역 (선택, 고르지 않으면 전국)</span><div class="chips">${D.regions.map((r) => `<button type="button" class="chip" data-act="hope-region" data-v="${r}" aria-pressed="${h.regions.includes(r)}">${r}</button>`).join("")}</div></div>
        <div><span class="lbl">대학·학과·계열 조건 결합</span><div class="seg" role="group"><button type="button" data-act="hope-logic" data-v="or" aria-pressed="${h.logic !== "and"}">하나라도 일치(OR)</button><button type="button" data-act="hope-logic" data-v="and" aria-pressed="${h.logic === "and"}">모두 일치(AND)</button></div></div>
      </div></details>`;
    const ui = $("#hopeUniv"), list = $("#hopeUnivList");
    ui.addEventListener("input", () => {
      const q = ui.value.trim();
      if (!q) { list.hidden = true; return; }
      const aliases = {"경상대":"경상국립대","서울과기대":"서울과학기술대","고대":"고려대","연대":"연세대"}; const needle=aliases[q]||q; const hits = D.univs.filter((u) => u.includes(needle) && !h.univs.includes(u)).slice(0, 12);
      list.innerHTML = hits.length ? hits.map((u) => `<button type="button" data-act="hope-univ" data-v="${esc(u)}">${esc(u)} <span class="muted">${D.rows.filter((r) => r.univ === u).length}개 모집단위</span></button>`).join("") : `<div class="muted" style="padding:10px">'${esc(q)}' 대학이 이 지원참고표에 없습니다.</div>`;
      list.hidden = false;
    });
    ui.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const first = list.querySelector("button"); if (first) first.click(); } });
    $("#hopeDept").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addDept(); } });
    $("#hopeRelated").addEventListener("change", (e) => { h.related = e.target.checked; afterHope(); });
    $("#hopeSub").addEventListener("change", (e) => { if (e.target.value && !h.fields.includes(e.target.value)) { h.fields.push(e.target.value); afterHope(true); } });
    updateInputMsgs();
  }
  function addDept() {
    const el = $("#hopeDept"); const v = el.value.trim();
    if (v && !St().hope.depts.includes(v)) { St().hope.depts.push(v); afterHope(true); setTimeout(() => $("#hopeDept") && $("#hopeDept").focus(), 0); }
  }
  function afterHope(rerender) {
    Store.save(); if (rerender) renderHopePanel(); else updateInputMsgs();
    if (App.searched) renderResults();
  }

  /* ---------- 검색 실행 ---------- */
  function runSearch() {
    if (App._quickHope) { St().hope = App._quickHope; App._quickHope = null; renderHopePanel(); }
    recompute(); updateInputMsgs();
    const P = App.prof;
    if (P.errors.length) { $("#inputMsgs").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (!P.anyInput && !Search.hasHope(St().hope)) { $("#inputMsgs").innerHTML = `<div class="notice warn">과목 성적을 하나 이상 입력하거나, 희망 대학·학과를 추가하세요.</div>`; return; }
    App.searched = true; App.shown = cfg.pageSize;
    if (!App.scale && Search.hasHope(St().hope)) St().tab = "hope";
    else if (App.scale && !Search.hasHope(St().hope)) St().tab = "near";
    showInputCard(false);
    renderSummary(); renderProfile(); renderResults();
    setTimeout(() => $("#inputSummary").scrollIntoView({ behavior: "smooth", block: "start" }), 30);
    Store.save();
  }
  function showInputCard(show) {
    $("#inputCard").hidden = !show;
    $("#inputSummary").hidden = show || !App.searched;
    $("#profileCard").hidden = !App.searched;
    $("#resultCard").hidden = !App.searched;
  }
  function renderSummary() {
    const P = App.prof;
    const parts = subs().map((s) => {
      const c = P.subj[s.k];
      const v = St().mode === "gachae" && isNum(c.raw) ? c.raw : isNum(c.std) ? "표" + c.std : isNum(c.pct) ? "백" + c.pct : isNum(c.grade) ? c.grade + "등급" : "–";
      return `${s.n.replace("통합", "통")} <b>${v}</b>`;
    });
    $("#summaryText").innerHTML = `<span class="pill blue">고${St().grade} ${St().mode === "gachae" ? "가채점" : "공식"}</span> ${parts.join(" · ")}`;
  }

  /* ---------- 내 성적 요약 ---------- */
  function renderProfile() {
    const P = App.prof, el = $("#profileCard");
    const av = Calc.availableScales(P);
    const comboName = { kms: "국수탐", ks: "국탐", ms: "수탐", km: "국수" };
    let tiles = ["std", "pct", "raw"].filter((s) => av.includes(s)).map((s) => {
      const cum = P.cum[s] && P.cum[s].kms;
      const cumTxt = cum && isNum(cum.p) ? `전국 상위 ${cum.p}%${cum.edge === "top" ? " 이내" : ""}` : cum && cum.edge === "bottom" ? "상위누적 자료 범위 밖" : P.mode === "gachae" && P.grade === 3 ? "상위누적 자료 없음(고3)" : P.mode === "official" ? "공식 분포 자료 없음" : "";
      return `<button type="button" class="big ${App.scale === s ? "on" : ""}" data-act="scale" data-v="${s}" aria-pressed="${App.scale === s}" style="text-align:left"><div class="k">${Calc.SCALE_SHORT[s]}${App.scale === s ? " · 비교 기준" : ""}</div><div class="v">${fmt(P.totals[s])}<small>점</small></div><div class="s">${cumTxt}</div></button>`;
    }).join("");
    if (!tiles) {
      const need = Calc.neededInputs(P);
      tiles = `<div class="notice" style="grid-column:1/-1"><b>② 일부 분석 가능</b> — 입력한 성적으로는 국수탐 합을 정확히 계산할 수 없어 ±점수 검색을 하지 않습니다.${need && need.list.length ? ` <b>${need.list.join(", ")} ${Calc.SCALE_NAME[need.scale]}</b>를 더 입력하면 비교할 수 있습니다.` : ""} 희망 조건 검색 결과는 '추가 입력 필요'로 표시됩니다.</div>`;
    }
    const rows = subs().map((s) => {
      const c = P.subj[s.k];
      const src = (m) => (c.src[m] === "input" ? "" : c.src[m] === "table" ? "" : c.src[m] === "official" ? '<span class="src-tag">공식표</span>' : "");
      return `<tr><td>${s.n}</td><td>${fmt(c.raw)}</td><td>${fmt(c.std)}${src("std")}</td><td>${fmt(c.pct)}${src("pct")}</td><td>${fmt(c.grade)}</td><td>${isNum(c.cum) ? c.cum : "–"}</td></tr>`;
    }).join("") + Calc.extras.map((e) => { const c = P.extra[e.k]; return isNum(c.grade) || isNum(c.raw) ? `<tr><td>${e.n}</td><td>${fmt(c.raw)}</td><td>–</td><td>–</td><td>${fmt(c.grade)}</td><td>–</td></tr>` : ""; }).join("");
    let cumTable = "";
    if (P.cum && P.cum.std) {
      const sc = ["std", "pct", "raw"].filter((s) => P.cum[s]);
      cumTable = `<details class="fold"><summary>나의 전국 위치 (영역 조합별 상위누적)</summary><div class="fold-in scroll-x"><table class="mini-table"><thead><tr><th>조합</th>${sc.map((s) => `<th>${Calc.SCALE_NAME[s]}</th>`).join("")}</tr></thead><tbody>${Object.keys(comboName).map((c) => `<tr><td>${comboName[c]}</td>${sc.map((s) => { const x = P.cum[s][c]; return `<td>${x ? fmt(x.value) + "점<br><small>" + (isNum(x.p) ? "상위 " + x.p + "%" : "범위 밖") + "</small>" : "–"}</td>`; }).join("")}</tr>`).join("")}</tbody></table><p class="muted">상위누적 %는 전국에서 내 점수 이상인 학생의 비율입니다. '전국 몇 등'(석차)은 원자료가 없어 계산하지 않습니다. 탐구는 통합사회·통합과학 2과목, 백분위는 두 과목 평균으로 합산합니다(원본 엑셀과 같은 방식).</p></div></details>`;
    }
    let subjectContext = "";
    if (P.mode === "gachae" && P.grade < 3 && App.D.gradeCut) {
      const cuts = App.D.gradeCut;
      const col = { kor: 1, math: 4, soc: 7, sci: 10 };
      const more = subs().map(sb => {
        const c = P.subj[sb.k], k = col[sb.k];
        if (!isNum(c.raw)) return "";
        const cut = cuts.filter(a => /^[1-9]등급$/.test(a[0]) && Number(a[k]) > c.raw)
          .sort((a,b) => Number(a[k]) - Number(b[k]))[0];
        const gap = cut ? ` · 다음 등급컷까지 ${fmt(Number(cut[k]) - c.raw)}점 (${esc(cut[0])} 기준)` : " · 1등급컷 이상 또는 상위 경계";
        const stats = App.D.convStats && App.D.convStats[sb.k];
        const avg = stats && isNum(stats.mean) ? ` · 전국 평균 ${fmt(stats.mean)}점 대비 ${sgn(Calc.r2(c.raw - stats.mean))}점` : "";
        return `<div class="subject-context"><b>${sb.n}</b>: ${fmt(c.raw)}점${gap}${avg}</div>`;
      }).filter(Boolean);
      if (more.length) subjectContext = `<details class="fold"><summary>과목별 다음 등급컷·전국 평균 보기</summary><div class="fold-in">${more.join("")}<p class="muted">이투스 10월 가채점 추정 등급컷·평균이며 확정 성적이 아닙니다.</p></div></details>`;
    }
    el.innerHTML = `<h2>내 성적</h2><div class="bigscore">${tiles}</div>
      ${av.length > 1 ? `<p class="muted" style="margin:0">위 칸을 누르면 비교 기준 척도를 바꿀 수 있습니다. 서로 다른 척도는 섞어 비교하지 않습니다.</p>` : ""}
      ${isNum(P.gradeAvg) ? `<p class="sub" style="margin:0">국·수·탐 평균 등급 <b>${P.gradeAvg}</b> (탐구 2과목 평균 반영)</p>` : ""}
      <div class="scroll-x"><table class="mini-table"><thead><tr><th>과목</th><th>원점수</th><th>표준</th><th>백분위</th><th>등급</th><th>상위누적%</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${P.mode === "gachae" && P.grade < 3 ? `<p class="muted" style="margin:0">표준점수·백분위·등급은 이투스 가채점 변환표(원표백등)로 바꾼 값입니다.</p>` : ""}
      ${subjectContext}${cumTable}`;
  }

  /* ---------- 결과 ---------- */
  function currentFilter() { return St().filter; }
  function getResults() {
    cfg.choices = St().grade === 3 ? Store.choices() : {};
    const D = App.D, P = App.prof;
    const near = App.scale ? Search.near(D, P, App.scale, St().range, currentFilter(), cfg) : [];
    const hope = Search.hope(D, P, App.scale, St().hope, currentFilter(), cfg);
    return { near, hope };
  }
  App.getResults = getResults;

  function renderResults() {
    const el = $("#resultCard");
    const { near, hope } = getResults();
    const tab = St().tab === "hope" ? "hope" : "near";
    const list = Search.sort(tab === "near" ? near : hope, St().sort, App.scale || "std");
    const f = St().filter;
    const statusCounts={exact:list.filter(x=>x.cmp.status==="exact").length,condition:list.filter(x=>x.cmp.status==="condition").length,need:list.filter(x=>x.cmp.status!=="exact"&&x.cmp.status!=="condition").length};
    const nf = f.regions.length + f.groups.length + f.fields.length + (f.adm ? 1 : 0) + (f.text ? 1 : 0) + (f.showStage1 ? 1 : 0);
    const D = App.D;
    let body = "";
    if (tab === "near" && !App.scale) {
      body = `<div class="empty"><b>±점수 검색을 하려면 국수탐 합이 필요합니다.</b>${esc((Calc.neededInputs(App.prof) || { list: [] }).list.join(", "))} 성적을 더 입력하거나, '희망 조건 전체' 탭에서 희망 대학을 확인하세요.</div>`;
    } else if (tab === "hope" && !Search.hasHope(St().hope)) {
      body = `<div class="empty"><b>희망 대학·학과·계열을 입력하면 열립니다.</b>점수 차이와 관계없이 조건에 맞는 모집단위를 모두 보여 줍니다.<br><button class="btn small" type="button" data-act="open-hope" style="margin-top:10px">희망 조건 추가하기</button></div>`;
    } else if (!list.length) {
      body = tab === "near"
        ? `<div class="empty"><b>±${St().range}점 안에 있는 모집단위가 없습니다.</b>${nf ? "필터를 줄이거나 " : ""}범위를 넓혀 보세요.<div class="row" style="justify-content:center;margin-top:10px">${cfg.ranges.filter((r) => r > St().range).map((r) => `<button class="btn small" type="button" data-act="range" data-v="${r}">±${r}점으로 넓히기</button>`).join("")}${nf ? `<button class="btn small" type="button" data-act="clear-filter">필터 해제</button>` : ""}</div></div>`
        : `<div class="empty"><b>희망 조건에 맞는 모집단위가 이 지원참고표에 없습니다.</b>학과 키워드를 줄이거나 '관련 분야 학과도 함께 찾기'를 켜 보세요.</div>`;
    } else {
      const shown = list.slice(0, App.shown);
      const groupsInfo = tab === "hope" && list.length > 60 ? `<div class="row" style="font-size:13px">많아서 나눠 보기: ${["가", "나", "다"].map((g) => `<button class="chip" type="button" data-act="filter-group" data-v="${g}" aria-pressed="${f.groups.includes(g)}">${g}군 ${list.filter((x) => x.row.group === g).length}</button>`).join("")} ${["인문", "자연", "공통"].map((g) => `<button class="chip" type="button" data-act="filter-field" data-v="${g}" aria-pressed="${f.fields.includes(g)}">${g} ${list.filter((x) => x.row.field === g).length}</button>`).join("")}</div>` : "";
      body = `${groupsInfo}<div class="cards mob-only">${shown.map(cardHtml).join("")}</div><div class="desk-only scroll-x">${tableHtml(shown, tab)}</div>
        ${list.length > shown.length ? `<button class="btn block" type="button" data-act="more">더 보기 (${shown.length} / ${list.length})</button>` : `<p class="muted" style="text-align:center;margin:0">${list.length}개 모두 표시</p>`}`;
    }
    const scaleNote = App.scale ? (St().grade === 3 ? `모집단위별 산출기준 우선 적용 · 비교 가능할 때만 차이 표시` : `비교 기준: <b>${Calc.SCALE_SHORT[App.scale]}</b> ${fmt(App.prof.totals[App.scale])}점`) : "비교할 수 있는 국수탐 합이 없습니다.";
    el.innerHTML = `
      ${App._quickHope ? `<div class="notice">임시로 다른 모집단위를 검색 중입니다. 원래 희망 조건은 보존되어 있습니다. <button type="button" class="btn small" data-act="restore-hope">원래 조건으로</button></div>` : ""}
      <div class="tabs" role="tablist">
        <button type="button" role="tab" data-act="tab" data-v="near" aria-selected="${tab === "near"}">내 점수 주변<span class="cnt">${App.scale ? near.length : "–"}</span></button>
        <button type="button" role="tab" data-act="tab" data-v="hope" aria-selected="${tab === "hope"}">희망 조건 전체<span class="cnt">${Search.hasHope(St().hope) ? hope.length : "–"}</span></button>
      </div>
      <p class="sub" style="margin:0">${scaleNote}${St().grade === 3 && App.scale === "raw" ? " · 고3 원점수: 선택과목 차이를 반영하지 않은 참고 비교" : ""}${St().mode === "official" ? " · 공식 입력 성적을 가채점 지원참고표와 비교(확정 배치표 아님)" : ""}${tab === "near" && App.scale ? ` · 차이 ±${St().range}점 이내(경계 포함)` : tab === "hope" ? " · 점수 범위로 빼지 않고 모두 표시" : ""}</p>
      <p class="muted" style="margin:0">비교 가능 ${statusCounts.exact}건 · 조건 확인 ${statusCounts.condition}건 · 추가 성적 필요 ${statusCounts.need}건</p>
      <div class="toolbar">
        <select id="sortSel" aria-label="정렬">${Object.entries(Search.SORTS).map(([k, v]) => `<option value="${k}"${St().sort === k ? " selected" : ""}>${v.label}</option>`).join("")}</select>
        <button class="btn small" type="button" data-act="toggle-filter">필터${nf ? ` <span class="pill blue">${nf}</span>` : ""}</button>
        <button class="btn small ghost" type="button" data-act="save-search">조건 저장</button><button class="btn small ghost" type="button" data-act="share-summary">요약 복사</button>
      </div>
      <div id="filterBox" hidden>${filterHtml()}</div>
      <div class="legend"><span><i style="background:var(--up)"></i>기준보다 높음(+${cfg.nearRule[App.scale || "std"]} 이상)</span><span><i style="background:var(--near)"></i>근접(±${cfg.nearRule[App.scale || "std"]} 미만)</span><span><i style="background:var(--down)"></i>기준보다 낮음</span><span><i style="background:var(--na)"></i>계산 불가</span></div>
      ${St().grade === 3 ? `<p class="notice" style="margin:0"><b>고3 점수 차이는 공통 배치표 점수척도에 따른 참고 비교</b>입니다. 대학별 영어·한국사·가산점·반영비율을 모두 적용한 최종 환산점수나 합격 예측을 의미하지 않습니다.</p>` : ""}
      ${body}
      <p class="disclaimer" style="margin:0">${DISCLAIMER}</p>`;
    $("#sortSel").addEventListener("change", (e) => { St().sort = e.target.value; Store.save(); renderResults(); });
    if (App._filterOpen) $("#filterBox").hidden = false;
    bindFilterBox();
  }
  App.renderResults = renderResults;

  function statusPill(cmp) {
    if (cmp.status === "exact") return `<span class="pill ${cmp.tone}">${Calc.TONE_TEXT[cmp.tone]}</span>`;
    if (cmp.status === "partial") return `<span class="pill ${cmp.area.tone}">반영영역 기준 ${sgn(cmp.area.diff)}</span>`;
    if(cmp.status === "condition") return `<span class="pill na">응시 조건 확인</span>`;
    return `<span class="pill na">추가 입력 필요</span>`;
  }
  function diffHtml(cmp) {
    if (cmp.status === "exact") return `<span class="diff ${cmp.tone}">${sgn(cmp.diff)}</span>`;
    if (cmp.status === "condition") return `<span class="diff na">조건 확인</span>`;
    if (cmp.status === "partial") return `<span class="diff na">일부 분석</span>`;
    return `<span class="diff na" aria-hidden="true">–</span>`;
  }
  function cardHtml(it) {
    const r = it.row, c = it.cmp;
    const tone = c.status === "exact" ? c.tone : "na";
    return `<div class="rcard ${tone}"><div class="bar"></div>
      <button class="body" type="button" data-act="detail" data-id="${r.id}" aria-label="${esc(r.univ)} ${esc(r.unit)} 상세 보기">
        <div class="u"><span class="gbadge">${esc(r.group)}</span>${esc(rowLabel(r))}<small>${esc(r.adm)}${r.x && r.x.stage !== "일괄합산" ? " · " + esc(r.x.stage) : ""}</small></div>
        <div class="d">${esc(r.unit)}</div>
        <div class="meta">${esc(r.region)} · ${esc(r.field)} · ${r.quota ?? "–"}명 · ${c.status === "exact" ? `산출 ${esc(c.basis)} · ${esc(Calc.SCALE_SHORT[c.scale] || c.scale)} · 기준 ${fmt(c.ref)}` : "추가 성적 필요"}${it.match && it.match.kind === "related" ? ' · <span class="pill blue">관련 분야</span>' : ""}</div>
      </button>
      <div class="side">${diffHtml(c)}${statusPill(c)}${starBtn(r.id)}</div></div>`;
  }
  function starBtn(id) {
    const on = isFav(id);
    return `<button class="star" type="button" data-act="fav" data-id="${id}" aria-pressed="${on}" aria-label="${on ? "관심 목록에서 빼기" : "관심 목록에 추가"}"><svg viewBox="0 0 24 24" stroke-width="1.8"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg></button>`;
  }
  function tableHtml(items, tab) {
    const s = App.scale;
    const th = (k, label, cls) => `<th class="${cls || ""}"><button type="button" data-act="sort" data-v="${k}">${label}${St().sort === k ? " ▾" : ""}</button></th>`;
    return `<table class="res"><thead><tr><th>군</th><th>지역</th>${th("univ", "대학")}<th>전형</th>${th("unit", "모집단위")}<th>계열</th>${th("quota", "인원", "r")}${th(St().sort === "refAsc" ? "refDesc" : "refAsc", "기준점수", "r")}<th class="r">내 점수</th>${th("near", "차이", "r")}<th>상태</th><th></th></tr></thead><tbody>
      ${items.map((it) => { const r = it.row, c = it.cmp; return `<tr><td><span class="gbadge">${esc(r.group)}</span></td><td>${esc(r.region)}</td><td><button class="link" type="button" data-act="detail" data-id="${r.id}">${esc(rowLabel(r))}</button></td><td>${esc(r.adm)}${r.x && r.x.stage !== "일괄합산" ? "<br><small>" + esc(r.x.stage) + "</small>" : ""}</td><td><button class="link" type="button" data-act="detail" data-id="${r.id}" style="font-weight:500">${esc(r.unit)}</button>${it.match && it.match.kind === "related" ? ' <span class="pill blue">관련</span>' : ""}</td><td>${esc(r.field)}</td><td class="r">${r.quota ?? "–"}</td><td class="r">${fmt(c.ref)}</td><td class="r">${fmt(c.mine)}</td><td class="r">${diffHtml(c)}</td><td>${statusPill(c)}</td><td>${starBtn(r.id)}</td></tr>`; }).join("")}
    </tbody></table>`;
  }
  const REGION_GROUPS={"전국":[],"부울경":["부산","울산","경남"],"수도권":["서울","경기","인천"],"대경권":["대구","경북"],"충청권":["대전","세종","충북","충남"],"호남권":["광주","전북","전남"],"강원·제주":["강원","제주"]};
  function filterHtml() {
    const f = St().filter, D = App.D;
    return `<div class="stack" style="border:1px solid var(--line);border-radius:10px;padding:12px">
      <div class="field"><label for="fText">결과 안에서 찾기</label><input id="fText" type="search" value="${esc(f.text)}" placeholder="대학, 학과, 전형 이름"></div>
      ${St().grade === 3 ? `<div class="row" style="align-items:center"><button class="chip" type="button" data-act="stage-one" aria-pressed="${!!f.showStage1}">1단계 모집도 보기 ${f.showStage1 ? "✓" : ""}</button><span class="muted">기본은 2단계·일괄 모집 중심</span></div>` : ""}
      <div><span class="lbl">모집군</span><div class="chips">${["가", "나", "다"].map((g) => `<button class="chip" type="button" data-act="filter-group" data-v="${g}" aria-pressed="${f.groups.includes(g)}">${g}군</button>`).join("")}</div></div>
      <div><span class="lbl">계열</span><div class="chips">${D.fields.map((g) => `<button class="chip" type="button" data-act="filter-field" data-v="${g}" aria-pressed="${f.fields.includes(g)}">${g}</button>`).join("")}</div></div>
      
      <div><span class="lbl">권역 빠른 선택</span><div class="chips">${Object.keys(REGION_GROUPS).map(k=>`<button class="chip" type="button" data-act="region-group" data-v="${k}">${k}</button>`).join("")}</div></div>
      <div><span class="lbl">지역</span><div class="chips">${D.regions.map((g) => `<button class="chip" type="button" data-act="filter-region" data-v="${g}" aria-pressed="${f.regions.includes(g)}">${g}</button>`).join("")}</div></div>
      <div class="field"><label for="fAdm">전형명에 들어간 말</label><input id="fAdm" type="search" value="${esc(f.adm)}" placeholder="예: 지역인재, 일반"></div>
      <p class="muted" style="margin:0">모집단위별 산출기준으로 비교합니다. 영어·한국사와 가산점 등 최종 대학별 환산과는 다를 수 있습니다.</p>
      <button class="btn small" type="button" data-act="clear-filter">필터 모두 해제</button></div>`;
  }
  function bindFilterBox() {
    const t = $("#fText"), a = $("#fAdm");
    let tm;
    const upd = () => { clearTimeout(tm); tm=setTimeout(()=>{ if(document.activeElement===t||document.activeElement===a)return;St().filter.text=t.value;St().filter.adm=a.value;App.shown=cfg.pageSize;Store.save();renderResults();},200); };
    for(const el of [t,a]) if(el){el.addEventListener("input",e=>{if(!e.isComposing)upd();});el.addEventListener("compositionend",upd);el.addEventListener("change",()=>{St().filter.text=t.value;St().filter.adm=a.value;App.shown=cfg.pageSize;Store.save();renderResults();});el.addEventListener("blur",()=>{St().filter.text=t.value;St().filter.adm=a.value;App.shown=cfg.pageSize;Store.save();renderResults();});}
  }
  function toggleIn(arr, v) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }

  /* ---------- 이벤트 위임 ---------- */
  function onAction(e) {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act, v = b.dataset.v, h = St().hope, f = St().filter;
    switch (act) {
      case "tab": St().tab = v; App.shown = cfg.pageSize; renderResults(); Store.save(); break;
      case "more": App.shown += cfg.pageSize; renderResults(); break;
      case "range": St().range = Number(v); renderRange(); renderResults(); Store.save(); break;
      case "scale": St().scale = v; recompute(); renderProfile(); renderResults(); if (App.view !== "find") renderView(); Store.save(); break;
      case "sort": St().sort = v; renderResults(); Store.save(); break;
      case "toggle-filter": App._filterOpen = !App._filterOpen; $("#filterBox").hidden = !App._filterOpen; break;
      case "filter-group": toggleIn(f.groups, v); App.shown = cfg.pageSize; renderResults(); Store.save(); break;
      case "filter-field": toggleIn(f.fields, v); App.shown = cfg.pageSize; renderResults(); Store.save(); break;
      case "stage-one": f.showStage1 = !f.showStage1; App.shown = cfg.pageSize; renderResults(); Store.save(); break;
      case "region-talent": f.adm = f.adm === "지역인재" ? "" : "지역인재"; App.shown = cfg.pageSize; renderResults(); Store.save(); break;
      case "region-group": f.regions=(REGION_GROUPS[v]||[]).filter(r=>App.D.regions.some(x=>x.includes(r))); App.shown=cfg.pageSize;renderResults();Store.save();break;
      case "filter-region": toggleIn(f.regions, v); App.shown = cfg.pageSize; renderResults(); Store.save(); break;
      case "clear-filter": St().filter = { regions: [], groups: [], fields: [], adm: "", text: "", showStage1: false }; renderResults(); Store.save(); break;
      case "save-search": saveSearch(); break;
      case "open-hope": showInputCard(true); $("#hopeFold").open = true; $("#hopeFold").scrollIntoView({ behavior: "smooth" }); break;
      case "hope-univ": if (!h.univs.includes(v)) h.univs.push(v); afterHope(true); setTimeout(() => $("#hopeUniv") && $("#hopeUniv").focus(), 0); break;
      case "hope-add-dept": addDept(); break;
      case "hope-del": toggleIn(h[b.dataset.kind], v); afterHope(true); break;
      case "hope-field": toggleIn(h.fields, v); afterHope(true); break;
      case "hope-region": toggleIn(h.regions, v); afterHope(true); break;
      case "hope-logic": h.logic = v; afterHope(true); break;
      case "detail": openDetail(b.dataset.id); break;
      case "fav": toggleFav(b.dataset.id); break;
      case "close": closeOverlays(); break;
      case "close-panel": closePanel(); break;
      case "set-target": St().target[gkey()] = b.dataset.id; Store.save(); closeOverlays(); setView("goal"); toast("목표 모집단위로 정했습니다."); break;
      case "same-univ": closeOverlays(); setView("find"); quickHope({ univs: [b.dataset.v] }); break;
      case "same-unit": closeOverlays(); setView("find"); quickHope({ depts: [b.dataset.v] }); break;
      case "restore-hope": St().hope = App._quickHope; App._quickHope = null; St().tab = "hope"; renderHopePanel(); renderResults(); Store.save(); break;
      case "share-summary": { const list = App.getResults(); const rows = (St().tab === "hope" ? list.hope : list.near).slice(0, 5); const summary = [`대학까지 몇 점? · 고${St().grade} · ${St().mode === "official" ? "공식 성적표" : "가채점"}`, `비교 척도: ${App.scale ? Calc.SCALE_NAME[App.scale] : "계산 불가"}`, ...rows.map(x => `${x.row.univ} ${x.row.unit}: ${isNum(x.cmp.diff) ? sgn(x.cmp.diff) + "점" : "추가 입력 필요"}`), "참고자료이며 합격 가능성 예측이 아닙니다."]; navigator.clipboard.writeText(summary.join("\n")).then(() => toast("개인 식별정보를 제외한 결과 요약을 복사했습니다.")).catch(() => toast("복사를 지원하지 않는 환경입니다.")); break; }
      case "load-search": loadSearch(Number(v)); break;
      case "del-search": St().savedSearches.splice(Number(v), 1); Store.save(); renderView(); break;
      default: if (App.viewAction) App.viewAction(act, b, e);
    }
  }
  function quickHope(o) {
    if (!App._quickHope) App._quickHope = JSON.parse(JSON.stringify(St().hope));
    const h = St().hope;
    h.univs = o.univs || []; h.depts = o.depts || []; h.fields = []; h.regions = []; h.logic = "or";
    St().tab = "hope"; App.searched = true; showInputCard(false); renderHopePanel(); renderSummary(); renderProfile(); renderResults();
    setTimeout(() => $("#resultCard").scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }
  function saveSearch() {
    const s = St();
    s.savedSearches.unshift({ when: Report.today() + " " + new Date().toTimeString().slice(0, 5), grade: s.grade, range: s.range, hope: JSON.parse(JSON.stringify(s.hope)), filter: JSON.parse(JSON.stringify(s.filter)), sort: s.sort, tab: s.tab });
    s.savedSearches = s.savedSearches.slice(0, 10); Store.save(); toast("검색 조건을 저장했습니다. 내 보관함에서 다시 쓸 수 있습니다.");
  }
  function loadSearch(i) {
    const x = St().savedSearches[i]; if (!x) return;
    const go = async () => {
      Object.assign(St(), { range: x.range, hope: JSON.parse(JSON.stringify(x.hope)), filter: JSON.parse(JSON.stringify(x.filter)), sort: x.sort, tab: x.tab });
      setView("find"); renderInputs(); recompute(); App.searched = true; showInputCard(false); renderRange(); renderSummary(); renderProfile(); renderResults(); Store.save();
    };
    if (x.grade !== St().grade) App.setGrade(x.grade).then(go); else go();
  }
  function toggleFav(id) {
    const list = favs(); const i = list.findIndex((f) => f.id === id);
    if (i >= 0) { list.splice(i, 1); toast("관심 목록에서 뺐습니다."); }
    else { list.push({ id, memo: "" }); toast("관심 목록에 추가했습니다."); }
    Store.save();
    $$(`.star[data-id="${id}"]`).forEach((s) => { s.setAttribute("aria-pressed", String(i < 0)); s.setAttribute("aria-label", i < 0 ? "관심 목록에서 빼기" : "관심 목록에 추가"); });
    if (App.view === "box" || App.view === "goal") renderView();
  }
  App.toggleFav = toggleFav;

  /* ---------- 상세 패널 ---------- */
  function openDetail(id) {
    App._detailScroll = window.scrollY;
    const r = App.D.byId.get(id); if (!r) return;
    const P = App.prof, c = Calc.compareRow(r, P, App.scale, cfg), x = r.x;
    const scales = ["std", "pct", "raw"].filter((s) => isNum(r.ref[s]));
    const refRows = scales.map((s) => { const scored = Calc.compareRow(r,P,s,{...cfg,compareMode:St().grade===3?"auto":"common"}); const mine = scored.scale === s && scored.status === "exact" ? scored.mine : P.totals[s]; const d = scored.scale === s && scored.status === "exact" ? scored.diff : (St().grade===3 ? null : (isNum(mine) ? Calc.r2(mine-r.ref[s]) : null)); const tone = Calc.tone(d, s, cfg); return `<tr><td>${Calc.SCALE_SHORT[s]}${s === App.scale ? " <b>(기준)</b>" : ""}</td><td>${fmt(scored.scale === s && scored.status === "exact" ? scored.ref : r.ref[s])}</td><td>${fmt(mine)}</td><td>${isNum(d) ? `<b class="diff ${tone}" style="font-size:15px">${sgn(d)}</b>` : `<span class="muted">추가 입력 필요</span>`}</td></tr>`; }).join("");
    const formula = App.scale ? formulaText(App.scale) : "";
    let sec3 = "";
    if (x) {
      const w = x.w, tot = ["kor", "math", "eng", "tam", "his"].reduce((a, k) => a + (isNum(w[k]) ? w[k] : 0), 0);
      const ratio = tot > 0 ? `<div class="ratio" aria-label="수능 반영 비율">${[["kor", "국"], ["math", "수"], ["eng", "영"], ["tam", "탐"], ["his", "한"]].filter(([k]) => isNum(w[k]) && w[k] > 0).map(([k, n]) => `<span class="r-${k}" style="width:${(w[k] / tot) * 100}%">${n} ${w[k]}</span>`).join("")}</div>` : `<p class="muted" style="margin:0">반영 비율: 자료 없음(${esc(x.useScore || "")})</p>`;
      const ep = Calc.extraPoints(r, P) || {};
      const ptable = (o, name) => o ? `<div><b style="font-size:13.5px">${name} (${esc(o.rule || "자료 없음")})</b>${o.mine != null ? ` — 내 ${o.grade}등급 → <b>${o.mine}점</b>` : o.grade ? "" : ` <span class="muted">· ${name} 등급을 넣으면 내 점수를 표시합니다</span>`}<div class="scroll-x"><table class="ptable"><tr>${o.table.map((_, i) => `<th>${i + 1}</th>`).join("")}</tr><tr>${o.table.map((v, i) => `<td class="${o.grade === i + 1 ? "me" : ""}">${v ?? "–"}</td>`).join("")}</tr></table></div></div>` : "";
      const area = x.areaRule && x.areaRule !== "국수탐(2)"
        ? `<dt>반영영역 기준</dt><dd>${esc(x.areaRule)} — 원점수 ${fmt(x.area.raw)} · 표준 ${fmt(x.area.std)} · 백분위 ${fmt(x.area.pct)}${c.area ? `<br>내 ${Calc.SCALE_NAME[c.area.scale]} ${fmt(c.area.mine)} → <b class="diff ${c.area.tone}" style="font-size:14px">${sgn(c.area.diff)}</b>` : Calc.areaComputable(x.areaRule) ? "<br><span class='muted'>필요한 과목 성적을 넣으면 계산합니다</span>" : "<br><span class='muted'>선택·가중 규칙이 있어 정확한 계산 불가(원본에 계산 방식 없음)</span>"}</dd>` : "";
      const warn = [];
      const ch = Store.choices();
      if (x.mathSel && ch.mathSel && !x.mathSel.split("/").includes(ch.mathSel)) warn.push(`수학 선택과목 조건: <b>${esc(x.mathSel)}</b> (내 선택: ${esc(ch.mathSel)})`);
      const tmap = { 사회: "사", 과학: "과", 직업: "직" };
      if (x.tamType) for (const t of [ch.t1Type, ch.t2Type]) if (t && !x.tamType.split("/").includes(tmap[t])) { warn.push(`탐구 응시 조건: <b>${esc(x.tamType)}</b> (내 선택에 ${esc(t)} 포함)`); break; }
      sec3 = `
      ${warn.length ? `<div class="notice warn">${warn.join("<br>")}<br>모집요강에서 지원 자격을 꼭 확인하세요.</div>` : ""}
      <div class="sec"><h3>대학별 반영방법</h3>
        <dl class="kv"><dt>선발 방식</dt><dd>${esc(x.stage)} · 전형 총점 ${fmt(x.total)}</dd>
        <dt>전형 비율</dt><dd>수능 ${esc(x.ratio.suneung ?? "–")} · 학생부 ${esc(x.ratio.hak ?? "–")} · 면접 ${esc(x.ratio.interview ?? "–")} · 기타 ${esc(x.ratio.etc ?? "–")}</dd>
        <dt>수능 활용점수</dt><dd>${esc(x.useScore || "자료 없음")}</dd>
        <dt>실제 반영 영역</dt><dd>${esc(x.realCombo || "자료 없음")} (탐구 ${x.tamCount ?? "–"}과목)</dd>
        ${area}
        <dt>수학 선택</dt><dd>${esc(x.mathSel || "제한 없음/자료 없음")}</dd>
        <dt>수학 가산점</dt><dd>확통 ${esc(x.gasan.stat || "–")} · 미적 ${esc(x.gasan.calc || "–")} · 기하 ${esc(x.gasan.geo || "–")}</dd>
        <dt>탐구 유형</dt><dd>${esc(x.tamType || "자료 없음")}</dd>
        <dt>탐구 가산점</dt><dd>사회 ${esc(x.gasan.soc || "–")} · 과학 ${esc(x.gasan.sci || "–")}</dd>
        ${x.note ? `<dt>특이사항</dt><dd>${esc(x.note)}</dd>` : ""}
        ${x.minimum ? `<dt>최저학력기준</dt><dd>${esc(x.minimum)}</dd>` : ""}
        </dl>${ratio}</div>
      <div class="sec"><h3>영어·한국사 처리</h3>${ptable(ep.eng, "영어")}${x.engMin ? `<p class="muted" style="margin:0">영어 최저기준: ${x.engMin}등급</p>` : ""}${ptable(ep.his, "한국사")}${x.hisMin ? `<p class="muted" style="margin:0">한국사 최저기준: ${x.hisMin}등급</p>` : ""}
        <p class="muted" style="margin:0">표의 값은 대학이 정한 등급별 점수(원본 그대로)입니다. 대학 총점에 그대로 더해지는지는 '적용기준'을 확인하세요.</p></div>`;
    }
    const sheet = $("#sheet");
    sheet.innerHTML = `<div class="grab"></div>
      <div class="sheet-head"><h2>${esc(rowLabel(r))} <small>${esc(r.unit)}</small></h2>${starBtn(r.id)}<button class="icon-btn" type="button" data-act="close" aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="sec"><div class="row">${diffHtml(c)} ${statusPill(c)} <span class="pill na">${STATUS_TEXT[c.status]}</span></div>
        <dl class="kv"><dt>대학·캠퍼스</dt><dd>${esc(r.univ)}${r.campus ? " · " + esc(r.campus) : ""} (${esc(r.region)})</dd>
        <dt>모집단위</dt><dd>${esc(r.unit)}</dd><dt>계열</dt><dd>${esc(r.field)} · ${esc(r.subfield)}</dd>
        <dt>전형 · 모집군</dt><dd>${esc(r.adm)} · ${esc(r.group)}군</dd><dt>모집인원</dt><dd>${r.quota ?? "자료 없음"}명</dd>
        ${x ? `<dt>전년도 경쟁률</dt><dd>${isNum(x.compet) ? x.compet + " : 1" : "자료 없음"}</dd>` : ""}</dl></div>
      <div class="sec"><h3>지원참고점수와 내 점수 (고3: 모집단위별 산출 기준)</h3>${St().grade === 3 ? `<p class="muted">주 비교: ${esc(c.basis)} · ${esc(Calc.SCALE_NAME[c.scale]||"확인 필요")} / 척도별 다른 행의 결과는 공통 국수탐 비교와 섞지 않습니다.</p>` : ""}
        <div class="scroll-x"><table class="mini-table"><thead><tr><th>척도</th><th>참고점수</th><th>내 점수</th><th>차이</th></tr></thead><tbody>${refRows}</tbody></table></div>
        ${formula ? `<details class="fold"><summary>계산식 자세히 보기</summary><div class="fold-in"><p style="margin:0;font-size:13.5px">${formula}</p><p class="muted" style="margin:0">점수 차이 = 내 점수 − 대학 지원참고점수. 근접은 차이가 ±${cfg.nearRule[App.scale]}점 미만일 때입니다. 합격 확률이 아닙니다.</p></div></details>` : ""}
        ${c.status === "need" ? `<div class="notice">${needText(r)}</div>` : ""}</div>
      ${St().grade < 3 ? `<div class="sec"><p class="muted">고1·고2 지원참고표에는 대학별 세부 수능 반영방법이 수록되어 있지 않습니다.</p></div>` : ""}
      ${sec3}
      <div class="sec"><div class="row"><button class="btn small primary" type="button" data-act="set-target" data-id="${r.id}">목표로 분석하기</button><button class="btn small" type="button" data-act="same-univ" data-v="${esc(r.univ)}">이 대학 전체 모집단위</button><button class="btn small" type="button" data-act="same-unit" data-v="${esc(coreName(r.unit))}">같은 학과 다른 대학</button></div></div>
      <div class="sec"><p class="muted" style="margin:0">자료 출처: ${esc(App.D.meta.source)} · ${esc(App.D.meta.sourceFile)} · 자료 기준일 ${esc(App.D.meta.baseDate)} · ${App.D.meta.refAdmissionYear}학년도 모집 기준 · 모집단위 ID ${esc(r.id)}</p></div>`;
    $("#scrim").hidden = false; sheet.hidden = false; sheet.scrollTop = 0; markOverlay("sheet");
    const close = sheet.querySelector('[data-act="close"]'); close && close.focus();
  }
  App.openDetail = openDetail;
  function coreName(u) { return (u || "").replace(/\(.*?\)/g, "").split("-")[0].replace(/(학과|학부|전공|과|계열)$/, "").trim() || u; }
  function needText(r) {
    const need = Calc.neededInputs(App.prof);
    if (!need || !need.list.length) return "성적을 입력하면 비교할 수 있습니다.";
    return `${esc(r.univ)} 지원참고점수와 비교하려면 <b>${need.list[0]} ${Calc.SCALE_NAME[need.scale]}</b>가 추가로 필요합니다.${need.list.length > 1 ? ` (그다음: ${need.list.slice(1).join(", ")})` : ""}`;
  }
  function formulaText(s) {
    const P = App.prof, [ta, tb] = Calc.tamKeys(St().grade), S = P.subj, nm = Object.fromEntries(subs().map((x) => [x.k, x.n]));
    if (s === "pct") return `백분위 합 = 국어 ${S.kor.pct} + 수학 ${S.math.pct} + (${nm[ta]} ${S[ta].pct} + ${nm[tb]} ${S[tb].pct}) ÷ 2 = <b>${fmt(P.totals.pct)}</b>`;
    return `${Calc.SCALE_NAME[s]} 합 = 국어 ${S.kor[s]} + 수학 ${S.math[s]} + ${nm[ta]} ${S[ta][s]} + ${nm[tb]} ${S[tb][s]} = <b>${fmt(P.totals[s])}</b>`;
  }
  function openDrawer() { $("#scrim").hidden = false; $("#drawer").hidden = false; $("#drawer button").focus(); markOverlay("drawer"); }
  function closeOverlays() { const wasOpen = !$("#sheet").hidden || !$("#drawer").hidden; const wasSheet = !$("#sheet").hidden; rawCloseOverlays(); if(wasSheet && Number.isFinite(App._detailScroll)) requestAnimationFrame(()=>window.scrollTo(0,App._detailScroll)); if (wasOpen && history.state && history.state.scoreOverlay && !navigatingBack) history.replaceState({scoreView:App.view},"",location.pathname+location.search+"#"+App.view); }
  function openPanel(name) {
    const p = $("#panel"); p.hidden = false; document.body.style.overflow = "hidden"; markOverlay("panel");
    const head = (t) => `<div class="panel-head"><button class="icon-btn" type="button" data-act="close-panel" aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button><h2>${t}</h2></div>`;
    let html = "";
    if (name === "teacher") { html = head("교사용 도구") + `<div id="teacherRoot" class="stack"></div>`; p.innerHTML = `<div class="panel-in">${html}</div>`; global.Teacher.render($("#teacherRoot")); p.scrollTop = 0; return; }
    if (name === "source") html = head("자료 출처 및 업데이트") + sourceHtml();
    if (name === "howto") html = head("사용 방법") + howtoHtml();
    if (name === "validation") html = head("데이터 검증 정보") + validationHtml();
    if (name === "privacy") html = head("개인정보 안내") + privacyHtml();
    p.innerHTML = `<div class="panel-in">${html}</div>`; p.scrollTop = 0;
  }
  App.openPanel = openPanel;
  function closePanel(fromBack) { const wasOpen = !$("#panel").hidden; $("#panel").hidden = true; document.body.style.overflow = ""; if (wasOpen && !fromBack && history.state && history.state.scoreOverlay === "panel" && !navigatingBack) history.replaceState({scoreView:App.view},"",location.pathname+location.search+"#"+App.view); }
  App.closePanel = closePanel;

  /* ---------- 화면 전환 ---------- */
  function setView(v, fromHash) {
    App.view = v;
    $$(".bottomnav button").forEach((b) => { if (b.dataset.view === v) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    ["find", "goal", "lab", "box"].forEach((k) => ($("#view-" + k).hidden = k !== v));
    if (!fromHash && location.hash !== "#" + v) history.replaceState({ scoreView: v }, "", "#" + v);
    renderView(); window.scrollTo({ top: 0 });
  }
  App.setView = setView;
  function renderView() {
    if (App.view === "find") { if (App.searched) { renderSummary(); renderProfile(); renderResults(); } showInputCard(!App.searched || !$("#inputCard").hidden); updateConvLines(); updateInputMsgs(); }
    else if (App.view === "goal") global.Views.goal($("#view-goal"));
    else if (App.view === "lab") global.Views.lab($("#view-lab"));
    else if (App.view === "box") global.Views.box($("#view-box"));
  }
  App.renderView = renderView;

  /* ---------- 정보 패널 ---------- */
  function sourceHtml() {
    const rows = ["g1", "g2", "g3"].map((k) => { const m = (global.UDATA[k] || {}).meta; const ds = cfg.datasets[k]; return `<tr><td>${ds.label}</td><td>${m ? esc(m.sourceFile) : "아직 불러오지 않음"}</td><td>${m ? m.baseDate : "–"}</td><td>${m ? m.rowCount : "–"}</td><td>${m ? m.refAdmissionYear : "–"} / ${ds.target}</td><td>${m && m.conversionVersion ? esc(m.conversionVersion) : "변환표 없음"}</td></tr>`; }).join("");
    return `<div class="card prose"><p>시험: <b>2026년 10월 전국연합학력평가</b> · 성적 모드: 가채점(공식 성적표는 ${cfg.official.enabled ? "사용 중" : "준비 중"}) · 계산 규칙 버전 ${cfg.ruleVersion} · 프로그램 ${cfg.appVersion} (${cfg.updatedAt})</p>
      <div class="scroll-x"><table class="mini-table"><thead><tr><th>학년</th><th>원본 파일</th><th>자료 기준일</th><th>모집단위 수</th><th>참고표 모집연도 / 실제 대입</th><th>점수 변환표</th></tr></thead><tbody>${rows}</tbody></table></div>
      <h3>업데이트 방식</h3><ul><li>새 시험·공식 성적표 자료가 오면 <code>tools/build_data.py</code>로 데이터 파일만 다시 만들고 <code>data/</code> 폴더를 교체합니다.</li><li>공식 성적표 모드는 <code>data/metadata.js</code>의 <code>official.enabled</code>를 <code>true</code>로 바꾸면 열립니다.</li><li>가채점 입력과 공식 성적표 입력은 따로 보관되어 섞이지 않습니다.</li></ul>
      <p class="muted">이 자료는 이투스 지원참고표를 바탕으로 합니다. 지원참고점수는 입시기관의 예측치이며, 대학의 공식 합격선이 아닙니다.</p></div>`;
  }
  function howtoHtml() {
    return `<div class="card prose">
      <h3>학생·학부모</h3><ol><li><b>학년</b>을 고르고, 가채점 <b>원점수</b>를 과목별로 넣습니다.</li><li><b>점수 차이 범위</b>(기본 ±10점)를 고르고 <b>대학 찾기</b>를 누릅니다.</li><li>'내 점수 주변' 탭에서 내 점수와 가까운 모집단위를, '희망 조건 전체' 탭에서 원하는 대학·학과를 점수 차이와 관계없이 봅니다.</li><li>☆을 눌러 관심 목록에 담고, <b>목표 분석</b>에서 목표까지 몇 점이 필요한지 확인합니다.</li><li><b>점수 실험</b>에서 한 문제 더 맞혔을 때 달라지는 위치를 봅니다.</li></ol>
      <h3>색과 표시</h3><ul><li><span class="pill up">기준보다 높음</span> 내 점수가 참고점수보다 ${cfg.nearRule.std}점 이상 높음</li><li><span class="pill near">기준과 근접</span> 차이가 ±${cfg.nearRule.std}점 미만</li><li><span class="pill down">기준보다 낮음</span> ${cfg.nearRule.std}점 이상 낮음</li><li><span class="pill na">추가 입력 필요</span> 성적이 부족해 계산하지 않음</li></ul><p>점수 차이는 <b>합격 확률이 아닙니다.</b></p>
      <h3>공식 성적표가 나오면</h3><p>성적 종류를 '공식 성적표'로 바꾸고 성적표의 표준점수·백분위·등급 중 아는 것만 넣으세요. 과목마다 하나만 알아도 됩니다. 가채점 입력은 그대로 남아 비교할 수 있습니다.</p>
      <h3>담임교사</h3><p>메뉴 ▸ 교사용 도구에서 CSV 파일로 반 학생 성적을 한꺼번에 분석하고, 학생별 보고서를 인쇄할 수 있습니다. 모든 계산은 이 브라우저 안에서만 이루어집니다.</p></div>`;
  }
  function validationHtml() {
    const V = global.UDATA.validation || { issues: [] };
    return `<div class="card prose"><p>원본 엑셀 5개 파일의 시트·열·수식·숨김 시트·매크로를 검사했습니다. 원본 값은 고치지 않았고, 의심되는 항목을 아래에 기록했습니다. (검사일 ${esc(V.generated || "")})</p>
      <ul><li>고1·고2: '원표백등' 시트와 '한문제더' 숨김 시트의 변환표가 행 단위로 일치함 (각 99행 × 4과목)</li><li>고1·고2: '대학지원가능점수' 4,214행과 '한문제더' 숨김 '지원참고표' 4,214행이 일치함</li><li>고3: 4,281행 (고1·고2에 없는 단계별 모집 1단계 67행 포함), 모집단위 ID 중복 없음</li><li>같은 대학·군·모집단위라도 전형·캠퍼스·단계가 다르면 따로 표시함 (197개 조합)</li><li>합산 방식: 원점수·표준점수는 국+수+탐1+탐2, 백분위는 국+수+(탐1+탐2)÷2 — '한문제더' 수식과 같음</li></ul></div>
      <div class="card scroll-x"><table class="mini-table"><thead><tr><th>학년</th><th>위치</th><th>원본값</th><th>유형</th><th>처리</th></tr></thead><tbody>${V.issues.map((i) => `<tr><td>고${i.grade}</td><td>${esc(i.where)}</td><td style="max-width:260px;overflow-wrap:anywhere;font-size:12px">${esc(i.value)}</td><td>${esc(i.type)}</td><td>${esc(i.status)}</td></tr>`).join("")}</tbody></table></div>
      <div class="card prose"><h3>계산하지 않는 것</h3><ul><li>고3 원점수 → 표준점수·백분위 변환 (고3 파일에 변환표 없음)</li><li>등급만으로 표준점수·백분위 추정</li><li>대학별 환산점수 총점 (대학별 변환표준점수·환산식 원자료 없음)</li><li>검증되지 않은 대학별 최종 환산점수 및 미수록 산출기준</li><li>전국 석차(몇 등) — 원자료 없음</li><li>공식 성적표 모드의 전국 상위누적 — 공식 분포 자료 등록 전</li></ul></div>`;
  }
  function privacyHtml() {
    return `<div class="card prose"><ul><li>입력한 성적은 <b>서버로 보내지 않습니다.</b> 모든 계산은 지금 쓰는 브라우저 안에서만 합니다.</li><li>성적과 상담 메모는 '이 기기에 입력값 기억하기'를 켠 경우에만 저장됩니다. 관심 대학의 ID는 편의를 위해 자동 보관되지만 이름과 상담 메모는 동의 없이 저장하지 않습니다.</li><li>공용 PC를 썼다면 메뉴 ▸ <b>모든 입력값 지우기</b>를 누르세요.</li><li>주소(URL)나 공유 링크에는 성적을 넣지 않습니다.</li><li>상담보고서는 기본이 익명이며, 이름은 원할 때만 적고 파일 이름에는 넣지 않습니다.</li><li>교사용 도구는 화면을 숨겨 둔 것일 뿐 비밀번호 보호가 아닙니다(GitHub Pages는 서버 인증을 지원하지 않음). 학생 성적 CSV는 학교의 개인정보 처리 기준에 맞게 다루고, 학생 이름 대신 익명 코드를 쓰세요.</li></ul></div>`;
  }

  App.h = { fmt, sgn, esc, cardHtml, starBtn, statusPill, diffHtml, ctx, gkey, favs, isFav, subs, rowLabel, DISCLAIMER, STATUS_TEXT, officialOn, coreName, renderInputs, renderTop, showInputCard };

  document.addEventListener("DOMContentLoaded", () => App.init().then(() => { const v = location.hash.replace("#", ""); if (["goal", "lab", "box"].includes(v)) setView(v, true); }));
})(window);
