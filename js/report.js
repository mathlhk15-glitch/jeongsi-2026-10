/* =========================================================
 * report.js — A4 1쪽 상담보고서 (인쇄 / PDF 저장)
 * 이름은 선택 입력, 파일명에 이름을 넣지 않는다.
 * ========================================================= */
(function (global) {
  "use strict";
  const R = {};
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const f = (v) => (v === null || v === undefined || v === "" ? "–" : v);
  R.esc = esc;
  R.today = function () { const d = new Date(); const z = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };

  /* d: { today, examName, gradeLabel, modeLabel, name, school, subjRows:[[과목, 원, 표, 백, 등, 누적]], totals:[[척도, 값, 누적]],
          hope, picks:[{group, univ, unit, adm, ref, mine, diff, tone, status}], scaleLabel, targets:[[과목, 현재, 필요]], memo, source, baseDate, refYear, targetYear } */
  R.html = function (d) {
    const subj = d.subjRows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(f(c))}</td>`)).join("")}</tr>`).join("");
    const tots = d.totals.map((r) => `<tr><th>${esc(r[0])}</th><td>${esc(f(r[1]))}</td><td>${esc(f(r[2]))}</td></tr>`).join("");
    const picks = d.picks.length
      ? d.picks.map((p) => `<tr><td>${esc(p.group)}</td><td style="text-align:left">${esc(p.univ)}<br><small>${esc(p.adm)}</small></td><td style="text-align:left">${esc(p.unit)}</td><td>${esc(f(p.ref))}</td><td>${esc(f(p.mine))}</td><td><b>${esc(p.diff == null ? "–" : (p.diff > 0 ? "+" : "") + p.diff)}</b></td><td>${esc(p.status)}</td></tr>`).join("")
      : `<tr><td colspan="7">관심 모집단위가 없습니다.</td></tr>`;
    const tg = d.targets && d.targets.length
      ? `<h2>과목별 목표점수 (${esc(d.targetName || "")})</h2><table><tr><th>과목</th><th>현재</th><th>이 과목만 올릴 때 필요한 점수</th></tr>${d.targets.map((t) => `<tr><td>${esc(t[0])}</td><td>${esc(f(t[1]))}</td><td>${esc(f(t[2]))}</td></tr>`).join("")}</table>`
      : "";
    return `<div class="rep">
      <h1>대학까지 몇 점? 상담보고서</h1>
      <div class="rmeta">상담 기준일 ${esc(d.today)} · ${esc(d.examName)} · ${esc(d.gradeLabel)} · <b>${esc(d.modeLabel)}</b>${d.school ? " · " + esc(d.school) : ""}${d.name ? " · 학생: " + esc(d.name) : " · 익명"}</div>
      <h2>과목별 성적</h2>
      <table><tr><th>과목</th><th>원점수</th><th>표준점수</th><th>백분위</th><th>등급</th><th>상위누적(%)</th></tr>${subj}</table>
      <h2>내 성적 요약</h2>
      <table><tr><th>척도(국수탐 2과목)</th><th>합계</th><th>전국 상위누적(%)</th></tr>${tots}</table>
      <h2>희망 대학·학과</h2>
      <div style="font-size:9pt">${esc(d.hope || "입력하지 않음")}</div>
      <h2>관심 모집단위 점수 차이 (${esc(d.scaleLabel)})</h2>
      <table><tr><th>군</th><th>대학·전형</th><th>모집단위</th><th>지원참고점수</th><th>내 점수</th><th>차이</th><th>상태</th></tr>${picks}</table>
      ${tg}
      <h2>상담 메모</h2>
      <div class="memo">${esc(d.memo || "")}</div>
      <div class="foot">
        자료: ${esc(d.source)} (자료 기준일 ${esc(d.baseDate)}, ${esc(d.refYear)}학년도 지원참고표). ${d.targetYear !== d.refYear ? `이 학생의 실제 대입은 ${esc(d.targetYear)}학년도로, 참고표의 모집연도와 다릅니다. ` : ""}<br>
        이 분석은 해당 학력평가 성적과 제공된 대학 지원참고표를 비교한 참고자료입니다. 점수 차이는 합격 확률을 뜻하지 않습니다. 실제 지원 시에는 모집연도별 대학 모집요강, 수능 반영방법, 모집인원, 지원 자격 등을 반드시 확인해야 합니다.
      </div>
    </div>`;
  };

  R.print = function (list) {
    const area = document.getElementById("printArea");
    area.innerHTML = list.map(R.html).join("");
    const oldTitle = document.title;
    document.title = "상담보고서_" + R.today(); // 이름은 파일명에 넣지 않음
    setTimeout(() => {
      window.print();
      setTimeout(() => { document.title = oldTitle; }, 500);
    }, 50);
  };

  global.Report = R;
})(window);
