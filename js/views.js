/* =========================================================
 * views.js — 목표 분석 · 점수 실험 · 내 보관함 화면
 * ========================================================= */
(function (global) {
  "use strict";
  const Calc = global.Calc, Search = global.Search, Store = global.Store, Sim = global.Sim, Report = global.Report;
  const cfg = global.UDATA.config;
  const App = global.App;
  const $ = (s, el) => (el || document).querySelector(s);
  const isNum = Calc.isNum;
  const St = () => Store.state;
  const H = () => App.h;
  const V = {};

  /* ===================== 공통 ===================== */
  function rowsFromFavs() { return H().favs().map((f) => App.D.byId.get(f.id)).filter(Boolean); }
  function gapText(d) {
    if (!isNum(d)) return "–";
    if (d >= 0) return `<span class="delta-up">${H().fmt(d)}점 여유</span>`;
    return `<span class="delta-down">${H().fmt(-d)}점 더 필요</span>`;
  }
  function compareBlock(ids) {
    const rows = ids.map((id) => App.D.byId.get(id)).filter(Boolean);
    if (!rows.length) return `<p class="muted">관심 목록에서 비교할 모집단위를 최대 5개 고르세요.</p>`;
    const P = App.prof, s = App.scale, h = H();
    const items = rows.map((r) => ({ r, c: Calc.compareRow(r, P, s, cfg) }));
    const ratio = (r) => r.x ? ["kor", "math", "eng", "tam", "his"].filter((k) => isNum(r.x.w[k]) && r.x.w[k] > 0).map((k) => ({ kor: "국", math: "수", eng: "영", tam: "탐", his: "한" }[k] + r.x.w[k])).join(" ") || "자료 없음" : "자료 없음(고1·고2 참고표)";
    const fields = [
      ["모집군", (r) => r.group + "군"], ["전형", (r) => r.adm], ["계열", (r) => r.field + " · " + r.subfield], ["모집인원", (r) => (r.quota ?? "–") + "명"],
      ["참고점수", (r, c) => (c && c.status === "exact" ? h.fmt(c.ref) : s ? h.fmt(r.ref[s]) : "–")], ["점수 차이", (r, c) => (c.status === "exact" ? `<b class="diff ${c.tone}" style="font-size:16px">${h.sgn(c.diff)}</b>` : "추가 입력 필요")],
      ["반영 비율", (r) => ratio(r)], ["영어", (r) => (r.x ? r.x.engRule || "–" : "–")], ["최저기준", (r) => (r.x && r.x.minimum) || "없음/자료 없음"]
    ];
    const cards = items.map(({ r, c }) => `<div class="card" style="box-shadow:none"><h3>${h.esc(h.rowLabel(r))}</h3><p class="sub" style="margin:2px 0 8px">${h.esc(r.unit)}</p><dl class="kv">${fields.map(([k, fn]) => `<dt>${k}</dt><dd>${fn(r, c)}</dd>`).join("")}</dl></div>`).join("");
    const table = `<table class="res"><thead><tr><th>항목</th>${items.map(({ r }) => `<th>${h.esc(h.rowLabel(r))}<br><small>${h.esc(r.unit)}</small></th>`).join("")}</tr></thead><tbody>${fields.map(([k, fn]) => `<tr><td><b>${k}</b></td>${items.map(({ r, c }) => `<td>${fn(r, c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    return `<div class="hscroll mob-only">${cards}</div><div class="desk-only scroll-x">${table}</div>`;
  }

  /* ===================== 목표 분석 ===================== */
  V.goal = function (el) {
    const h = H(), D = App.D, P = App.prof, s = App.scale, g = St().grade;
    const tid = St().target[h.gkey()];
    const tr = tid ? D.byId.get(tid) : null;
    const favRows = rowsFromFavs();
    let html = `<div class="card stack"><h2>목표 모집단위</h2>
      ${favRows.length ? `<div><span class="lbl">관심 목록에서 고르기</span><div class="chips">${favRows.map((r) => `<button class="chip" type="button" data-act="goal-pick" data-id="${r.id}" aria-pressed="${r.id === tid}">${h.esc(r.univ)} ${h.esc(r.unit)}</button>`).join("")}</div></div>` : ""}
      <div class="field ac"><label for="goalSearch">대학 또는 학과 이름으로 찾기</label><input id="goalSearch" type="search" placeholder="예: 부산대 기계" autocomplete="off"><div class="ac-list" id="goalList" hidden></div></div></div>`;

    if (tr) {
      const c = Calc.compareRow(tr, P, s, cfg);
      const scales = ["std", "pct", "raw"].filter((k) => isNum(tr.ref[k]));
      html += `<div class="card stack"><div class="row"><h2 style="flex:1">${h.esc(h.rowLabel(tr))} · ${h.esc(tr.unit)}</h2><button class="btn small" type="button" data-act="detail" data-id="${tr.id}">상세</button></div>
        <p class="sub" style="margin:0">${h.esc(tr.group)}군 · ${h.esc(tr.adm)} · ${tr.quota ?? "–"}명 · ${h.esc(tr.region)}</p>
        <div class="bigscore">${scales.map((k) => { const mine = P.totals[k]; const d = isNum(mine) ? Calc.r2(mine - tr.ref[k]) : null; return `<div class="big ${k === s ? "on" : ""}"><div class="k">${Calc.SCALE_SHORT[k]}</div><div class="v">${h.fmt(tr.ref[k])}<small>기준</small></div><div class="s">내 점수 ${h.fmt(mine)} · ${isNum(d) ? gapText(d) : "추가 입력 필요"}</div></div>`; }).join("")}</div>
        ${c.area ? `<div class="notice">이 모집단위의 반영영역(${h.esc(tr.x.areaRule)}) 기준: 내 ${Calc.SCALE_NAME[c.area.scale]} ${h.fmt(c.area.mine)} / 기준 ${h.fmt(c.area.ref)} → ${gapText(c.area.diff)}</div>` : ""}
        ${reverseBlock(tr)}</div>`;
    } else {
      html += `<div class="card empty"><b>목표 모집단위를 고르세요.</b>대학 찾기 결과의 상세 화면에서 '목표로 분석하기'를 누르거나, 위에서 검색하면 됩니다.</div>`;
    }

    // 유리한 모집단위
    html += `<div class="card stack"><h2>내 점수에 유리한 모집단위 Top 5</h2>${top5Block()}</div>`;
    // 유사 학과
    html += `<div class="card stack"><h2>같은·관련 학과 찾기</h2>
      <div class="row" style="flex-wrap:nowrap"><input id="simKw" type="search" placeholder="예: 컴퓨터공학" value="${h.esc(App._simKw || (tr ? h.coreName(tr.unit) : ""))}" aria-label="학과 키워드"><button class="btn small" type="button" data-act="sim-go">찾기</button></div>
      <div id="simOut"></div></div>`;
    // 비교
    html += `<div class="card stack"><h2>관심 모집단위 비교 (최대 5개)</h2>
      ${favRows.length ? `<div class="chips">${favRows.map((r) => `<button class="chip" type="button" data-act="cmp-pick" data-id="${r.id}" aria-pressed="${App.compareSel.includes(r.id)}">${h.esc(r.univ)} ${h.esc(r.unit)}</button>`).join("")}</div>` : `<p class="muted" style="margin:0">대학 찾기에서 ☆을 눌러 관심 목록에 담으면 비교할 수 있습니다.</p>`}
      ${compareBlock(App.compareSel)}</div>`;
    el.innerHTML = html;

    const gs = $("#goalSearch"), gl = $("#goalList");
    gs.addEventListener("input", () => {
      const q = gs.value.trim().split(/\s+/).filter(Boolean);
      if (!q.length) { gl.hidden = true; return; }
      const hits = D.rows.filter((r) => q.every((w) => (r.univ + " " + r.unit + " " + (r.campus || "")).includes(w))).slice(0, 20);
      gl.innerHTML = hits.length ? hits.map((r) => `<button type="button" data-act="goal-pick" data-id="${r.id}">${h.esc(h.rowLabel(r))} ${h.esc(r.unit)} <span class="muted">${h.esc(r.group)}군 · ${h.esc(r.adm)}</span></button>`).join("") : `<div class="muted" style="padding:10px">이 지원참고표에 맞는 모집단위가 없습니다.</div>`;
      gl.hidden = false;
    });
    if (App._simKw || tr) simSearch();
    $("#simKw").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); App._simKw = e.target.value; simSearch(); } });
  };

  function reverseBlock(tr) {
    const h = H(), P = App.prof, s = App.scale, ctx = h.ctx(), g = St().grade;
    if (!s) return `<div class="notice">목표까지의 거리를 계산하려면 ${(Calc.neededInputs(P) || { list: [] }).list.join(", ")} 성적이 더 필요합니다.</div>`;
    const targetCmp = Calc.compareRow(tr,P,s,cfg);
    const target = targetCmp.status === "exact" ? targetCmp.ref : null;
    if (!isNum(target)) return `<p class="notice">이 모집단위의 목표 점수 역산에 필요한 성적이 부족합니다.</p>`;
    if (g === 3 && targetCmp.basis !== "공통 국수탐(2)") return `<div class="notice">${h.esc(targetCmp.basis)} 기준 현재 점수 ${h.fmt(targetCmp.mine)} · 참고점수 ${h.fmt(target)} · 차이 ${h.sgn(targetCmp.diff)}점. 고3의 선택 영역 점수는 단순 총점 증가로 역산할 수 없어 과목별 목표값을 임의로 만들지 않습니다.</div>`;
    const gap = Calc.r2(target - P.totals[s]);
    let rows = "";
    let note = "";
    if (St().mode === "gachae" && g < 3 && (s === "std" || s === "pct")) {
      rows = h.subs().map((sb) => {
        const r = Calc.neededRawForTarget(ctx, Store.inputs(), P, sb.k, s, target);
        const cur = P.subj[sb.k].raw;
        if (!r) return `<tr><td>${sb.n}</td><td>${h.fmt(cur)}</td><td colspan="2">계산 불가</td></tr>`;
        if (!r.reachable) return `<tr><td>${sb.n}</td><td>${h.fmt(cur)}</td><td colspan="2"><span class="muted">이 과목만으로는 도달 불가 (만점이어도 부족)</span></td></tr>`;
        return `<tr><td>${sb.n}</td><td>${h.fmt(cur)}</td><td><b>${r.raw}점</b> ${r.gain > 0 ? `(+${r.gain})` : "(이미 도달)"}</td><td>표준 ${r.std} · 백분위 ${r.pct} · ${r.grade}등급</td></tr>`;
      }).join("");
      note = `다른 과목은 그대로 두고 한 과목만 올릴 때 필요한 <b>최소 원점수</b>입니다. 가채점 변환표(원표백등)에 있는 점수만 사용해 정확히 계산했습니다.`;
      return `<h3>목표 역산 — ${gap > 0 ? `${Calc.SCALE_SHORT[s]} ${h.fmt(gap)}점 더 필요` : "이미 기준점수 이상"}</h3><div class="scroll-x"><table class="mini-table"><thead><tr><th>과목</th><th>현재 원점수</th><th>필요한 원점수</th><th>그때 성적</th></tr></thead><tbody>${rows}</tbody></table></div><p class="muted" style="margin:0">${note}</p>`;
    }
    // 고3 원점수, 공식 성적표(표준·백분위): 같은 척도 안에서 과목 하나에 몰아줄 때
    const metric = s;
    rows = h.subs().map((sb) => {
      const cur = P.subj[sb.k][metric];
      const factor = metric === "pct" && Calc.tamKeys(g).includes(sb.k) ? 2 : 1;
      const need = Calc.r2(cur + Math.max(0, gap) * factor);
      const lim = Calc.limits(sb, metric);
      const over = metric !== "std" && need > lim.max;
      return `<tr><td>${sb.n}</td><td>${h.fmt(cur)}</td><td>${gap <= 0 ? "이미 도달" : over ? `<span class="muted">이 과목만으로는 도달 불가</span>` : `<b>${h.fmt(need)}</b> (+${h.fmt(need - cur)})`}</td></tr>`;
    }).join("");
    note = metric === "raw" ? "원점수 합 기준입니다. 고3 원점수는 표준점수로 바꾸는 변환표가 없어 원점수로만 계산합니다." : `${Calc.SCALE_NAME[metric]} 기준입니다. 원점수가 몇 점 올라야 하는지는 공식 점수 대응표가 없어 계산하지 않습니다.${metric === "pct" ? " 탐구 백분위는 2과목 평균으로 들어가므로 한 과목은 두 배가 필요합니다." : ""}`;
    return `<h3>목표 역산 — ${gap > 0 ? `${Calc.SCALE_SHORT[s]} ${h.fmt(gap)}점 더 필요` : "이미 기준점수 이상"}</h3><div class="scroll-x"><table class="mini-table"><thead><tr><th>과목</th><th>현재 ${Calc.SCALE_NAME[metric]}</th><th>이 과목만 올릴 때</th></tr></thead><tbody>${rows}</tbody></table></div><p class="muted" style="margin:0">${note}</p>`;
  }

  function top5Block() {
    const h = H(), D = App.D, P = App.prof, s = App.scale;
    if (!s) return `<p class="muted" style="margin:0">국수탐 합을 계산할 수 있어야 추천할 수 있습니다. 서로 다른 대학의 환산점수 총점은 비교하지 않습니다.</p>`;
    const useHope = Search.hasHope(St().hope) && App._top5Hope !== false;
    let pool = D.rows.filter((r) => (useHope ? Search.matchHope(r, St().hope) : true)).map((r) => ({ row: r, cmp: Calc.compareRow(r, P, s, cfg) })).filter((x) => x.cmp.status === "exact");
    const reached = pool.filter((x) => x.cmp.diff >= 0).sort((a, b) => (b.cmp.scale===a.cmp.scale ? b.cmp.ref-a.cmp.ref : a.cmp.scale.localeCompare(b.cmp.scale)) || a.cmp.diff - b.cmp.diff).slice(0, 5);
    let html = `${Search.hasHope(St().hope) ? `<div class="seg" role="group"><button type="button" data-act="top5-hope" data-v="1" aria-pressed="${useHope}">희망 조건 안에서</button><button type="button" data-act="top5-hope" data-v="0" aria-pressed="${!useHope}">전체에서</button></div>` : ""}
      <h3>① 기준점수에 도달한 곳 중 기준점수가 높은 순</h3>
      <p class="muted" style="margin:0">같은 척도(${Calc.SCALE_SHORT[s]})의 지원참고점수 차이만 비교했습니다.</p>
      ${reached.length ? `<div class="cards">${reached.map(h.cardHtml).join("")}</div>` : `<p class="muted">기준점수에 도달한 모집단위가 없습니다.</p>`}`;
    if (St().grade === 3) {
      // 반영 비율과 내 과목별 강점의 궁합(점수가 아니라 방향 지표)
      const S = P.subj;
      const str = {};
      const usePct = ["kor", "math", "t1", "t2"].every((k) => isNum(S[k].pct));
      for (const k of ["kor", "math", "t1", "t2"]) {
        const sb = h.subs().find((x) => x.k === k);
        str[k] = usePct ? S[k].pct : isNum(S[k].raw) ? (S[k].raw / sb.rawMax) * 100 : null;
      }
      if (["kor", "math", "t1", "t2"].every((k) => isNum(str[k]))) {
        const p = { kor: str.kor, math: str.math, tam: (str.t1 + str.t2) / 2 };
        const mean = (p.kor + p.math + p.tam) / 3;
        const fit = pool.filter((x) => x.row.x && ["kor", "math", "tam"].every((k) => isNum(x.row.x.w[k])) && Math.abs(x.cmp.diff) <= St().range)
          .map((x) => { const w = x.row.x.w; const ws = w.kor + w.math + w.tam; return ws > 0 ? { ...x, fit: (w.kor * p.kor + w.math * p.math + w.tam * p.tam) / ws - mean } : null; })
          .filter(Boolean).sort((a, b) => b.fit - a.fit).slice(0, 5);
        const strong = Object.entries(p).sort((a, b) => b[1] - a[1])[0][0];
        html += `<h3>② 반영 비율이 내 강점과 맞는 곳 (±${St().range}점 안)</h3>
          <p class="muted" style="margin:0">내 과목별 ${usePct ? "백분위" : "원점수 득점률"}: 국어 ${Calc.r2(p.kor)} · 수학 ${Calc.r2(p.math)} · 탐구 ${Calc.r2(p.tam)} → 가장 강한 영역 <b>${{ kor: "국어", math: "수학", tam: "탐구" }[strong]}</b>. 대학이 강한 과목에 비중을 많이 둘수록 위에 옵니다. 대학별 환산점수를 계산한 것은 아니며 방향을 보는 참고 지표입니다.</p>
          ${fit.length ? `<div class="cards">${fit.map((x) => h.cardHtml(x).replace('<div class="meta">', `<div class="meta">반영 국${x.row.x.w.kor}·수${x.row.x.w.math}·탐${x.row.x.w.tam}${isNum(x.row.x.w.eng) ? "·영" + x.row.x.w.eng : ""} · `)).join("")}</div>` : `<p class="muted">조건에 맞는 모집단위가 없습니다.</p>`}`;
        const areaWin = D.rows.map((r) => ({ row: r, cmp: Calc.compareRow(r, P, s, cfg) })).filter((x) => x.cmp.area && x.cmp.status === "exact" && x.cmp.diff < 0 && x.cmp.area.diff >= 0).slice(0, 5);
        if (areaWin.length) html += `<h3>③ 국수탐 합으로는 낮지만 반영영역 기준으로는 도달</h3><div class="cards">${areaWin.map(h.cardHtml).join("")}</div>`;
      }
    }
    return html;
  }
  function simSearch() {
    const h = H(), kwEl = $("#simKw"); if (!kwEl) return;
    const kw = kwEl.value.trim(); const out = $("#simOut");
    if (!kw) { out.innerHTML = ""; return; }
    const items = [];
    for (const r of App.D.rows) {
      const m = Search.matchHope(r, { depts: [kw], related: true });
      if (m) items.push({ row: r, cmp: Calc.compareRow(r, App.prof, App.scale, cfg), match: m });
    }
    const name = items.filter((x) => x.match.kind === "name"), rel = items.filter((x) => x.match.kind === "related");
    Search.sort(name, "near", App.scale || "std"); Search.sort(rel, "near", App.scale || "std");
    const rl = Search.related(kw);
    out.innerHTML = `<p class="sub" style="margin:0"><b>학과명 일치</b> ${name.length}개 · <b>관련 분야</b> ${rel.length}개${rl.length ? ` (관련어: ${rl.slice(0, 10).map(h.esc).join(", ")})` : ""}</p>
      ${name.length ? `<h3>학과명 일치 (가까운 순 15개)</h3><div class="cards">${name.slice(0, 15).map(h.cardHtml).join("")}</div>` : ""}
      ${rel.length ? `<details class="fold"><summary>관련 분야 포함 (${rel.length}개 중 15개)</summary><div class="fold-in"><div class="cards">${rel.slice(0, 15).map(h.cardHtml).join("")}</div></div></details>` : ""}`;
  }

  /* ===================== 점수 실험 ===================== */
  V.lab = function (el) {
    const h = H(), D = App.D, P = App.prof, ctx = h.ctx(), g = St().grade;
    const metric = Sim.metricFor(ctx, P);
    const base = Store.inputs();
    const subs = h.subs();
    const active = subs.filter((s) => isNum(P.subj[s.k][metric]) && (metric !== "raw" || isNum((base[s.k] || {}).raw)));
    if (!active.length) {
      el.innerHTML = `<div class="card empty"><b>먼저 대학 찾기에서 성적을 입력하세요.</b>${St().mode === "gachae" ? "원점수" : "표준점수 또는 백분위"}를 넣으면 점수를 바꿔 보며 위치 변화를 볼 수 있습니다.</div>${compareModesBlock()}`;
      return;
    }
    const deltas = App.labDeltas;
    const nin = Sim.apply(base, deltas, metric, subs);
    const NP = Calc.resolve(ctx, nin);
    const s = App.scale && isNum(NP.totals[App.scale]) ? App.scale : Calc.defaultScale(NP);
    const mname = Calc.SCALE_NAME[metric];
    const stepRows = active.map((sb) => {
      const b = P.subj[sb.k][metric], a = NP.subj[sb.k][metric];
      const d = Calc.r2(a - b);
      return `<div class="sim-row"><div><b>${sb.n}</b></div><button class="step" type="button" data-act="lab-step" data-k="${sb.k}" data-v="-1" aria-label="${sb.n} 내리기">−</button>
        <div class="val">${h.fmt(a)}<small>${mname} ${d ? `(${d > 0 ? "+" : ""}${d})` : "현재"}${g < 3 && metric === "raw" && isNum(NP.subj[sb.k].std) ? ` · 표 ${NP.subj[sb.k].std} · 백 ${NP.subj[sb.k].pct} · ${NP.subj[sb.k].grade}등급` : ""}${NP.subj[sb.k].noTable ? " · 변환표에 없는 점수" : ""}</small></div>
        <button class="step" type="button" data-act="lab-step" data-k="${sb.k}" data-v="1" aria-label="${sb.n} 올리기">+</button></div>`;
    }).join("");
    const quick = metric === "raw" ? `<div class="row" style="font-size:13px"><span class="muted">한 문제 더:</span>${active.map((sb) => (sb.tam && g < 3 ? [1.5, 2, 2.5, 3] : [2, 3, 4]).map((p) => `<button class="chip" type="button" data-act="lab-add" data-k="${sb.k}" data-v="${p}">${sb.n.replace("통합", "통")} +${p}</button>`).join("")).join("")}</div>
      <p class="muted" style="margin:0">문항별 배점 자료가 없어 실제 문항과 연결하지 않고 원점수를 올려 봅니다. ${g < 3 ? "변환표에 없는 점수(나올 수 없는 점수)가 되면 표시됩니다. ± 버튼은 변환표에 있는 바로 위·아래 점수로 움직입니다." : ""}</p>` : `<p class="muted" style="margin:0">${mname}를 1점씩 바꿉니다. 다른 지표(백분위·등급)는 서로 임의로 변환하지 않습니다.</p>`;

    const scales = ["std", "pct", "raw"].filter((k) => isNum(P.totals[k]) || isNum(NP.totals[k]));
    const commonReached = p => s && Calc.isNum(p.totals[s]) ? D.rows.filter(r=>{const c=Calc.compareRow(r,p,s,{...cfg,compareMode:"common"});return c.status==="exact"&&c.diff>=0;}).length : null;
    const reachB=commonReached(P),reachA=commonReached(NP);
    const tid = St().target[h.gkey()], tr = tid ? D.byId.get(tid) : null;
    const totTable = `<div class="scroll-x"><table class="mini-table"><thead><tr><th>척도</th><th>지금</th><th>실험</th><th>변화</th>${P.cum.std ? "<th>상위누적 지금→실험</th>" : ""}</tr></thead><tbody>${scales.map((k) => {
      const cb = P.cum[k] && P.cum[k].kms, ca = NP.cum[k] && NP.cum[k].kms;
      return `<tr><td>${Calc.SCALE_SHORT[k]}</td><td>${h.fmt(P.totals[k])}</td><td><b>${h.fmt(NP.totals[k])}</b></td><td>${isNum(P.totals[k]) && isNum(NP.totals[k]) ? h.sgn(Calc.r2(NP.totals[k] - P.totals[k])) : "–"}</td>${P.cum.std ? `<td>${cb && isNum(cb.p) ? cb.p : "–"}% → <b>${ca && isNum(ca.p) ? ca.p : "–"}%</b></td>` : ""}</tr>`;
    }).join("")}</tbody></table></div>`;
    let between = "";
    if (s && isNum(P.totals[s]) && isNum(NP.totals[s])) {
      const lo = Math.min(P.totals[s], NP.totals[s]), hi = Math.max(P.totals[s], NP.totals[s]);
      const list = Sim.between(D, lo, hi, s, St().filter);
      const byG = ["가", "나", "다"].map((gg) => ({ gg, items: list.filter((x) => x.row.group === gg) }));
      between = `<div class="card stack"><h2>지금 ~ 실험 점수 사이 모집단위</h2>
        <p class="sub" style="margin:0">${Calc.SCALE_SHORT[s]} ${h.fmt(lo)} ~ ${h.fmt(hi)}점. ● 현재 점수와 기준이 같음 · ↓ 사이 · ☆ 실험 점수와 기준이 같음 (원본 '한문제더'와 같은 표시)${St().filter.regions.length || St().filter.groups.length || St().filter.fields.length ? " · 대학 찾기의 필터 적용 중" : ""}</p>
        ${hi === lo ? `<p class="muted">점수를 바꾸면 그 사이에 있는 모집단위를 보여 줍니다.</p>` : `<div class="two" style="gap:10px">${byG.map(({ gg, items }) => `<div><h3>${gg}군 <span class="muted">${items.length}개</span></h3><ul style="margin:6px 0;padding-left:0;list-style:none;font-size:14px">${items.slice(0, 40).map((x) => `<li style="padding:4px 0;border-bottom:1px solid var(--line)"><b style="display:inline-block;width:20px">${x.sym}</b><button class="link" type="button" data-act="detail" data-id="${x.row.id}" style="border:0;background:none;padding:0;text-align:left;color:var(--ink)"><b>${h.esc(x.row.univ)}</b> ${h.esc(x.row.unit)}</button> <span class="muted">${h.fmt(x.ref)}</span></li>`).join("")}${items.length > 40 ? `<li class="muted">… ${items.length - 40}개 더</li>` : ""}</ul></div>`).join("")}</div>`}</div>`;
    }
    const sc = St().scenarios[h.gkey()][St().mode];
    el.innerHTML = `<div class="card stack"><h2>점수 실험 <span class="pill blue">${mname} 조절</span></h2>
        ${stepRows}${quick}
        <div class="row"><button class="btn small" type="button" data-act="lab-reset">처음 점수로</button><button class="btn small" type="button" data-act="lab-save">시나리오 저장 (${sc.length}/3)</button><button class="btn small primary" type="button" data-act="lab-apply">이 점수로 대학 다시 찾기</button></div></div>
      <div class="card stack"><h2>성적 변화</h2>${totTable}
        ${s ? `<p class="sub" style="margin:0">공통 기준점수에 도달한 모집단위(${Calc.SCALE_SHORT[s]}): <b>${reachB ?? "–"}개 → ${reachA ?? "–"}개</b>${isNum(reachA) && isNum(reachB) && reachA !== reachB ? ` (${reachA > reachB ? "+" : ""}${reachA - reachB})` : ""}</p>` : ""}
        ${tr && s ? (()=>{const before=Calc.compareRow(tr,P,s,cfg),after=Calc.compareRow(tr,NP,s,cfg);return before.status==="exact"&&after.status==="exact"&&before.scale===after.scale?`<div class="notice">목표 <b>${h.esc(tr.univ)} ${h.esc(tr.unit)}</b> (${h.esc(before.basis)}, ${h.fmt(before.ref)}): 지금 ${gapText(before.diff)} → 실험 ${gapText(after.diff)}</div>`:`<div class="notice">선택한 모집단위의 목표 점수 비교에 추가 성적이 필요합니다.</div>`;})() : ""}
        ${NP.errors.length ? `<div class="notice err">${NP.errors.map(h.esc).join("<br>")}</div>` : ""}</div>
      ${between}
      ${scenarioBlock(sc)}
      ${compareModesBlock()}`;
    App._labNP = NP; App._labMetric = metric;
  };
  function scenarioBlock(sc) {
    const h = H();
    if (!sc.length) return `<div class="card"><h2>시나리오 비교</h2><p class="muted" style="margin:6px 0 0">점수를 바꾼 뒤 '시나리오 저장'을 누르면 최대 3개까지 나란히 비교할 수 있습니다.</p></div>`;
    const D = App.D, ctx = h.ctx();
    const cols = sc.map((x) => { const prof = Calc.resolve(ctx, Sim.apply(Store.inputs(), x.deltas, x.metric, h.subs())); return { x, prof }; });
    const s = App.scale;
    const tid = St().target[h.gkey()], tr = tid ? D.byId.get(tid) : null;
    const line = (label, fn) => `<tr><td><b>${label}</b></td><td>${fn(App.prof, null)}</td>${cols.map((c) => `<td>${fn(c.prof, c.x)}</td>`).join("")}</tr>`;
    return `<div class="card stack"><h2>시나리오 비교</h2><div class="scroll-x"><table class="res"><thead><tr><th></th><th>지금</th>${cols.map((c, i) => `<th>${h.esc(c.x.name)} <button class="btn small ghost" type="button" data-act="lab-del" data-v="${i}" aria-label="시나리오 삭제">삭제</button></th>`).join("")}</tr></thead><tbody>
      ${line("변화", (p, x) => (x ? Object.entries(x.deltas).filter(([, d]) => d).map(([k, d]) => `${h.subs().find((sb) => sb.k === k).n} ${d > 0 ? "+" : ""}${d}`).join(", ") || "변화 없음" : "–"))}
      ${["std", "pct", "raw"].map((k) => line(Calc.SCALE_SHORT[k], (p) => h.fmt(p.totals[k]))).join("")}
      ${App.prof.cum.std ? line("국수탐 상위누적", (p) => (p.cum.std && p.cum.std.kms && isNum(p.cum.std.kms.p) ? p.cum.std.kms.p + "%" : "–")) : ""}
      ${s ? line("공통 척도 도달 수", (p) => (isNum(p.totals[s]) ? D.rows.filter(r=>{const c=Calc.compareRow(r,p,s,{...cfg,compareMode:"common"});return c.status==="exact"&&c.diff>=0;}).length+"개" : "–")) : ""}
      ${tr && s ? line("목표까지", (p) => {const c=Calc.compareRow(tr,p,s,cfg);return c.status==="exact"?gapText(c.diff):"추가 성적 필요";}) : ""}
    </tbody></table></div></div>`;
  }
  /* 가채점 예상 vs 공식 성적표 */
  function compareModesBlock() {
    const h = H(), g = St().grade, D = App.D;
    const gin = St().inputs["g" + g].gachae, oin = St().inputs["g" + g].official;
    const has = (o) => Object.values(o || {}).some((c) => c && Object.values(c).some(isNum));
    if (!has(gin) || !has(oin)) return h.officialOn() ? `<div class="card"><h2>가채점 예상 vs 공식 성적표</h2><p class="muted" style="margin:6px 0 0">두 성적 종류에 모두 입력하면 같은 지표끼리 차이를 보여 줍니다.</p></div>` : "";
    const gp = Calc.resolve({ grade: g, mode: "gachae", data: D }, gin), op = Calc.resolve({ grade: g, mode: "official", data: D, official: D.official }, oin);
    const rows = h.subs().map((sb) => {
      const a = gp.subj[sb.k], b = op.subj[sb.k];
      const cell = (m) => (isNum(a[m]) && isNum(b[m]) ? `${a[m]} → <b>${b[m]}</b> (${h.sgn(Calc.r2(b[m] - a[m]))})` : isNum(b[m]) ? `– → <b>${b[m]}</b>` : "–");
      return `<tr><td>${sb.n}</td><td>${cell("std")}</td><td>${cell("pct")}</td><td>${cell("grade")}</td></tr>`;
    }).join("");
    const tot = ["std", "pct"].map((k) => `<tr><td>${Calc.SCALE_SHORT[k]}</td><td colspan="3">${isNum(gp.totals[k]) && isNum(op.totals[k]) ? `${gp.totals[k]} → <b>${op.totals[k]}</b> (${h.sgn(Calc.r2(op.totals[k] - gp.totals[k]))})` : "같은 척도 값이 양쪽에 모두 있어야 비교합니다"}</td></tr>`).join("");
    const favRows = rowsFromFavs();
    const sc = ["std", "pct"].find((k) => isNum(gp.totals[k]) && isNum(op.totals[k]));
    const favT = sc && favRows.length ? `<h3>관심 모집단위 결과 변화 (${Calc.SCALE_SHORT[sc]})</h3><div class="scroll-x"><table class="mini-table"><thead><tr><th>모집단위</th><th>가채점</th><th>공식</th></tr></thead><tbody>${favRows.map((r) => { const a = Calc.compareRow(r, gp, sc, cfg), b = Calc.compareRow(r, op, sc, cfg); return `<tr><td>${h.esc(r.univ)} ${h.esc(r.unit)}</td><td>${h.sgn(a.diff)}</td><td><b>${h.sgn(b.diff)}</b></td></tr>`; }).join("")}</tbody></table></div>` : "";
    return `<div class="card stack"><h2>가채점 예상 vs 공식 성적표</h2><p class="muted" style="margin:0">원점수와 표준점수처럼 다른 척도는 비교하지 않고, 같은 지표끼리만 차이를 계산합니다.</p>
      <div class="scroll-x"><table class="mini-table"><thead><tr><th>과목</th><th>표준점수</th><th>백분위</th><th>등급</th></tr></thead><tbody>${rows}${tot}</tbody></table></div>${favT}</div>`;
  }

  /* ===================== 내 보관함 ===================== */
  V.box = function (el) {
    const h = H(), D = App.D, P = App.prof, s = App.scale, g = St().grade;
    const list = h.favs();
    const q = (App._favQ || "").trim();
    const rows = list.map((f) => ({ f, r: D.byId.get(f.id) })).filter((x) => x.r && (!q || (x.r.univ + x.r.unit).includes(q)));
    const combo = St().combos[h.gkey()];
    const favRows = rowsFromFavs();
    const comboSel = (gg) => {
      const opts = favRows.filter((r) => r.group === gg);
      const cur = combo[gg] && D.byId.get(combo[gg]);
      const c = cur ? Calc.compareRow(cur, P, s, cfg) : null;
      return `<div class="card" style="box-shadow:none"><h3><span class="gbadge">${gg}</span>${gg}군</h3>
        <select data-combo="${gg}" aria-label="${gg}군 선택" style="margin-top:6px"><option value="">선택 안 함</option>${opts.map((r) => `<option value="${r.id}"${combo[gg] === r.id ? " selected" : ""}>${h.esc(h.rowLabel(r))} ${h.esc(r.unit)} (${h.esc(r.adm)})</option>`).join("")}</select>
        ${cur ? `<div class="row" style="margin-top:8px">${h.diffHtml(c)} ${h.statusPill(c)}</div>${cur.x && cur.x.stage !== "일괄합산" ? `<p class="muted" style="margin:4px 0 0">${h.esc(cur.x.stage)} 선발입니다.</p>` : ""}` : opts.length ? "" : `<p class="muted" style="margin:6px 0 0">관심 목록에 ${gg}군 모집단위가 없습니다.</p>`}</div>`;
    };
    const chosen = ["가", "나", "다"].map((gg) => combo[gg] && D.byId.get(combo[gg])).filter(Boolean);
    const warns = [];
    const univCount = {};
    chosen.forEach((r) => (univCount[r.univ] = (univCount[r.univ] || 0) + 1));
    Object.entries(univCount).forEach(([u, n]) => { if (n > 1) warns.push(`${u}에 ${n}개 군을 함께 지원하는 조합입니다. 대학별 복수 지원 허용 여부를 모집요강에서 확인하세요.`); });
    chosen.forEach((r) => { if (r.x && r.x.stage === "1단계") warns.push(`${r.univ} ${r.unit}은(는) 단계별 선발의 1단계 기준입니다. 2단계 기준도 함께 확인하세요.`); });
    const ok = chosen.length ? chosen.filter((r) => { const c = Calc.compareRow(r, P, s, cfg); return c.status === "exact"; }) : [];
    const tones = ok.map((r) => Calc.compareRow(r, P, s, cfg).tone);

    el.innerHTML = `
      <div class="card stack"><h2>관심 목록 <span class="muted">${list.length}개</span></h2>
        ${list.length ? `<input id="favQ" type="search" placeholder="관심 목록에서 찾기" value="${h.esc(q)}" aria-label="관심 목록 검색">` : ""}
        ${rows.length ? `<div class="cards">${rows.map(({ f, r }) => { const c = Calc.compareRow(r, P, s, cfg); return `<div class="stack" style="border:1px solid var(--line);border-radius:11px;padding:10px">${h.cardHtml({ row: r, cmp: c }).replace('class="rcard', 'style="border:0" class="rcard')}
            <textarea data-fav-memo="${r.id}" placeholder="이 모집단위 상담 메모" aria-label="${h.esc(r.univ)} ${h.esc(r.unit)} 메모" style="min-height:52px">${h.esc(f.memo || "")}</textarea>
            <div class="row"><button class="btn small" type="button" data-act="set-target" data-id="${r.id}">목표로</button><button class="btn small" type="button" data-act="cmp-pick" data-id="${r.id}" aria-pressed="${App.compareSel.includes(r.id)}">${App.compareSel.includes(r.id) ? "비교에서 빼기" : "비교에 넣기"}</button><button class="btn small ghost" type="button" data-act="fav" data-id="${r.id}">관심 해제</button></div></div>`; }).join("")}</div>`
        : `<div class="empty"><b>${list.length ? "찾는 모집단위가 없습니다." : "관심 목록이 비어 있습니다."}</b>대학 찾기 결과에서 ☆을 누르면 여기에 모입니다. (고${g} 목록)</div>`}
      </div>
      ${App.compareSel.length ? `<div class="card stack"><h2>대학 비교 (${App.compareSel.length}/5)</h2>${compareBlock(App.compareSel)}</div>` : ""}
      <div class="card stack"><h2>가·나·다군 지원 조합</h2>
        ${g < 3 ? `<p class="notice" style="margin:0">군별 조합은 고3 지원 전략용입니다. 고${g}는 학년 목표를 정리하는 참고용으로만 쓰세요.</p>` : ""}
        <div class="two" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));display:grid;gap:10px">${["가", "나", "다"].map(comboSel).join("")}</div>
        ${chosen.length ? `<p class="sub" style="margin:0">조합 상태: ${tones.map((t) => `<span class="pill ${t}">${Calc.TONE_TEXT[t]}</span>`).join(" ") || "점수 비교 불가"}</p>` : ""}
        ${warns.length ? `<div class="notice warn">${warns.map(h.esc).join("<br>")}</div>` : ""}
        <p class="muted" style="margin:0">정시는 군마다 1개씩 최대 3개 모집단위에 지원합니다. 실제 지원 가능 여부는 해당 모집연도의 대학별 모집요강으로 확인하세요.</p></div>
      <div class="card stack"><h2>상담 메모와 보고서</h2>
        <div class="field"><label for="memoAll">상담 메모</label><textarea id="memoAll" placeholder="상담 내용, 다음 목표, 확인할 일">${h.esc(St().memo)}</textarea></div>
        <div class="field"><label for="repName">학생 이름 (선택 — 비워 두면 익명)</label><input id="repName" type="text" value="${h.esc(St().studentName)}" autocomplete="off"></div>
        <button class="btn primary" type="button" data-act="print-report">상담보고서 인쇄 · PDF 저장</button>
        <p class="muted" style="margin:0">A4 한 장으로 인쇄됩니다. PDF는 인쇄 창에서 'PDF로 저장'을 고르세요. 파일 이름에 학생 이름을 넣지 않습니다.</p></div>
      <div class="card stack"><h2>저장한 검색 조건</h2>${St().savedSearches.length ? St().savedSearches.map((x, i) => `<div class="row" style="border-bottom:1px solid var(--line);padding:6px 0"><div style="flex:1;min-width:0;font-size:14px"><b>고${x.grade} · ±${x.range}점</b> ${h.esc([...x.hope.univs, ...x.hope.depts, ...x.hope.fields].join(", ") || "희망 조건 없음")}<br><span class="muted">${h.esc(x.when)}</span></div><button class="btn small" type="button" data-act="load-search" data-v="${i}">불러오기</button><button class="btn small ghost" type="button" data-act="del-search" data-v="${i}">삭제</button></div>`).join("") : `<p class="muted" style="margin:0">대학 찾기 결과에서 '조건 저장'을 누르면 여기에 남습니다.</p>`}</div>
      <div class="card stack"><h2>이 기기 저장</h2><p class="sub" style="margin:0">${Store.remember ? "지금 이 기기에 입력값과 보관함을 기억하고 있습니다." : "지금은 화면을 닫으면 입력값과 보관함이 사라집니다."}</p>
        <div class="row"><button class="btn small" type="button" data-act="toggle-remember">${Store.remember ? "기억 끄기(저장값 삭제)" : "이 기기에 기억하기"}</button></div></div>`;
    const fq = $("#favQ");
    if (fq) fq.addEventListener("input", () => { App._favQ = fq.value; clearTimeout(App._fqT); App._fqT = setTimeout(() => { V.box(el); const n = $("#favQ"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 300); });
    el.querySelectorAll("textarea[data-fav-memo]").forEach((t) => t.addEventListener("input", () => { const f = list.find((x) => x.id === t.dataset.favMemo); if (f) { f.memo = t.value; Store.save(); } }));
    $("#memoAll").addEventListener("input", (e) => { St().memo = e.target.value; Store.save(); });
    $("#repName").addEventListener("input", (e) => { St().studentName = e.target.value; Store.save(); });
    el.querySelectorAll("select[data-combo]").forEach((sel) => sel.addEventListener("change", () => { combo[sel.dataset.combo] = sel.value || null; Store.save(); V.box(el); }));
  };

  /* ===================== 보고서 데이터 ===================== */
  V.reportData = function (o) {
    // o: { grade, mode, prof, scale, D, name, memo, favIds, hope, targetId }
    const g = o.grade, P = o.prof, D = o.D, s = o.scale;
    const subs = Calc.subjects(g);
    const f = (v) => (isNum(v) ? (Math.round(v * 100) / 100).toString() : "");
    const subjRows = subs.map((sb) => { const c = P.subj[sb.k]; return [sb.n, f(c.raw), f(c.std), f(c.pct), f(c.grade), f(c.cum)]; })
      .concat(Calc.extras.filter((e) => isNum(P.extra[e.k].grade)).map((e) => [e.n, f(P.extra[e.k].raw), "", "", f(P.extra[e.k].grade), ""]));
    const totals = ["std", "pct", "raw"].filter((k) => isNum(P.totals[k])).map((k) => [Calc.SCALE_SHORT[k], f(P.totals[k]), P.cum[k] && P.cum[k].kms && isNum(P.cum[k].kms.p) ? P.cum[k].kms.p : ""]);
    if (!totals.length) totals.push(["국수탐 합", "계산 불가(성적 일부만 입력)", ""]);
    const picks = (o.favIds || []).map((id) => D.byId.get(id)).filter(Boolean).slice(0, 8).map((r) => {
      const c = Calc.compareRow(r, P, s, cfg);
      return { group: r.group, univ: r.univ + (r.campus ? "(" + r.campus + ")" : ""), adm: r.adm, unit: r.unit, ref: c.status === "exact" ? c.ref : null, mine: c.mine, diff: c.diff, status: c.status === "exact" ? Calc.TONE_TEXT[c.tone] : "추가 입력 필요" };
    });
    let targets = [], targetName = "";
    const tr = o.targetId && D.byId.get(o.targetId);
    if (tr && s && isNum(P.totals[s])) {
      targetName = `${tr.univ} ${tr.unit}, ${Calc.SCALE_SHORT[s]} 기준 ${tr.ref[s]}`;
      const gap = tr.ref[s] - P.totals[s];
      targets = subs.map((sb) => {
        if (o.mode === "gachae" && g < 3 && s !== "raw") {
          const r = Calc.neededRawForTarget({ grade: g, mode: o.mode, data: D }, null, P, sb.k, s, tr.ref[s]);
          return [sb.n, "원점수 " + f(P.subj[sb.k].raw), r ? (r.reachable ? `원점수 ${r.raw}${r.gain > 0 ? " (+" + r.gain + ")" : " (도달)"}` : "이 과목만으로 도달 불가") : "–"];
        }
        const factor = s === "pct" && Calc.tamKeys(g).includes(sb.k) ? 2 : 1;
        return [sb.n, f(P.subj[sb.k][s]), gap <= 0 ? "이미 도달" : `${Calc.SCALE_NAME[s]} ${f(P.subj[sb.k][s] + gap * factor)}`];
      });
    }
    const h = o.hope || {};
    const hopeText = [...(h.univs || []), ...(h.depts || []), ...(h.fields || [])].join(", ");
    return {
      today: Report.today(), examName: D.meta.examName, gradeLabel: `고${g} (${cfg.datasets["g" + g].target}학년도 대입)`, modeLabel: o.mode === "gachae" ? "가채점" : "공식 성적표",
      name: o.name || "", school: cfg.schoolName, subjRows, totals, hope: hopeText, picks, scaleLabel: s ? Calc.SCALE_SHORT[s] : "비교 척도 없음", targets, targetName,
      memo: o.memo || "", source: D.meta.source + " · " + D.meta.sourceFile, baseDate: D.meta.baseDate, refYear: D.meta.refAdmissionYear, targetYear: cfg.datasets["g" + g].target
    };
  };

  /* ===================== 화면 동작 ===================== */
  App.viewAction = function (act, b) {
    const h = H(), el = (id) => $("#view-" + id);
    switch (act) {
      case "goal-pick": St().target[h.gkey()] = b.dataset.id; Store.save(); V.goal(el("goal")); break;
      case "sim-go": App._simKw = $("#simKw").value; simSearch(); break;
      case "top5-hope": App._top5Hope = b.dataset.v === "1"; V.goal(el("goal")); break;
      case "cmp-pick": {
        const id = b.dataset.id, i = App.compareSel.indexOf(id);
        if (i >= 0) App.compareSel.splice(i, 1);
        else if (App.compareSel.length >= 5) { App.toast("비교는 최대 5개까지입니다."); return; }
        else App.compareSel.push(id);
        App.renderView(); break;
      }
      case "lab-step": {
        const k = b.dataset.k, dir = Number(b.dataset.v), metric = App._labMetric;
        const base = Store.inputs()[k] || {};
        const cur = Number(base[metric]) + (App.labDeltas[k] || 0);
        let next;
        if (metric === "raw" && St().grade < 3 && App.D.conv) next = Sim.nextRaw(App.D.conv[k], cur, dir);
        else { const sb = h.subs().find((x) => x.k === k); next = cur + dir * (metric === "raw" ? sb.rawStep : 1); const lim = Calc.limits(sb, metric); if (next < lim.min || next > lim.max) next = null; }
        if (next == null) { App.toast(dir > 0 ? "더 올릴 수 없습니다." : "더 내릴 수 없습니다."); return; }
        App.labDeltas[k] = Calc.r2(next - Number(base[metric]));
        V.lab(el("lab")); break;
      }
      case "lab-add": { const k = b.dataset.k; App.labDeltas[k] = Calc.r2((App.labDeltas[k] || 0) + Number(b.dataset.v)); V.lab(el("lab")); break; }
      case "lab-reset": App.labDeltas = {}; V.lab(el("lab")); break;
      case "lab-save": {
        const sc = St().scenarios[h.gkey()][St().mode];
        if (sc.length >= 3) { App.toast("시나리오는 3개까지 저장됩니다. 하나를 지운 뒤 저장하세요."); return; }
        if (!Object.values(App.labDeltas).some((d) => d)) { App.toast("점수를 바꾼 뒤 저장하세요."); return; }
        sc.push({ name: "시나리오 " + (sc.length + 1), deltas: { ...App.labDeltas }, metric: App._labMetric });
        Store.save(); V.lab(el("lab")); break;
      }
      case "lab-del": St().scenarios[h.gkey()][St().mode].splice(Number(b.dataset.v), 1); Store.save(); V.lab(el("lab")); break;
      case "lab-apply": {
        const NP = App._labNP; if (!NP) return;
        const inp = Sim.apply(Store.inputs(), App.labDeltas, App._labMetric, h.subs());
        // 실험 점수는 원래 입력을 바꾸지 않고 보여주기만 한다 → 사용자가 원할 때만 반영
        if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "입력값을 실험 점수로 바꿉니다. 한 번 더 누르세요"; return; }
        St().inputs[h.gkey()][St().mode] = inp; App.labDeltas = {}; Store.save();
        h.renderInputs(); App.recompute(); App.searched = true; App.setView("find"); App.toast("실험 점수로 대학을 다시 찾았습니다."); break;
      }
      case "toggle-remember": Store.setRemember(!Store.remember); $("#rememberChk").checked = Store.remember; V.box(el("box")); break;
      case "print-report": {
        const d = V.reportData({ grade: St().grade, mode: St().mode, prof: App.prof, scale: App.scale, D: App.D, name: St().studentName, memo: St().memo, favIds: h.favs().map((f) => f.id), hope: St().hope, targetId: St().target[h.gkey()] });
        Report.print([d]); break;
      }
    }
  };

  global.Views = V;
})(window);
