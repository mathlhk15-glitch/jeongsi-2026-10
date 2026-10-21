/* =========================================================
 * simulator.js — 점수 실험(한 문제 더), 시나리오, 목표 역산
 * ========================================================= */
(function (global) {
  "use strict";
  const Sim = {};
  const Calc = () => global.Calc;

  /* 실험에서 조절하는 지표: 가채점 → 원점수, 공식 → 표준점수(없으면 백분위) */
  Sim.metricFor = function (ctx, prof) {
    if (ctx.mode === "gachae") {
      if (ctx.grade === 3 && prof && Calc().isNum(prof.totals.std) && !Calc().isNum(prof.totals.raw)) return "std";
      return "raw";
    }
    if (prof && Calc().isNum(prof.totals.std)) return "std";
    if (prof && Calc().isNum(prof.totals.pct)) return "pct";
    return "std";
  };

  /* 기본 입력 + 과목별 변화량 → 새 입력 */
  Sim.apply = function (inputs, deltas, metric, subs) {
    const out = JSON.parse(JSON.stringify(inputs || {}));
    for (const s of subs) {
      const d = Number(deltas[s.k] || 0);
      if (!d) continue;
      const cell = out[s.k] || (out[s.k] = {});
      if (!Calc().isNum(cell[metric])) continue;
      const lim = Calc().limits(s, metric);
      let v = Number(cell[metric]) + d;
      v = Math.max(lim.min, Math.min(lim.max, v));
      cell[metric] = Math.round(v * 10) / 10;
      // 공식 모드: 바꾼 지표와 다른 지표가 함께 있으면 서로 모순이 되므로 실험에서는 다른 지표를 비운다
      if (metric !== "raw") for (const m of ["std", "pct", "grade"]) if (m !== metric) delete cell[m];
    }
    return out;
  };

  /* 변환표에서 '바로 위' 원점수 (나올 수 있는 점수만) */
  Sim.nextRaw = function (table, raw, dir) {
    if (!table || !Calc().isNum(raw)) return null;
    const list = table.map((r) => r[0]).sort((a, b) => a - b);
    if (dir > 0) return list.find((v) => v > raw) ?? null;
    const lower = list.filter((v) => v < raw);
    return lower.length ? lower[lower.length - 1] : null;
  };

  /* 현재 점수 ~ 기대 점수 사이 모집단위 (엑셀 '한문제더'와 같은 규칙)
     ● = 기준점수가 현재 점수와 같음, ↓ = 현재 < 기준 < 기대, ☆ = 기준점수가 기대 점수와 같음 */
  Sim.between = function (D, lo, hi, scale, filter) {
    if (!Calc().isNum(lo) || !Calc().isNum(hi) || hi < lo) return [];
    const out = [];
    for (const row of D.rows) {
      const ref = row.ref[scale];
      if (!Calc().isNum(ref)) continue;
      if (filter && !global.Search.passFilter(row, filter)) continue;
      if (ref >= lo - 1e-9 && ref <= hi + 1e-9) {
        const sym = Math.abs(ref - lo) < 1e-9 ? "●" : Math.abs(ref - hi) < 1e-9 ? "☆" : "↓";
        out.push({ row, sym, ref });
      }
    }
    // 엑셀 매크로와 같은 정렬: 기준점수 오름차순 → 대학 → 전형 → 모집단위 (문자 코드 순, vbBinaryCompare)
    const ko = (a, b) => { a = a || ""; b = b || ""; return a < b ? -1 : a > b ? 1 : 0; };
    out.sort((a, b) => a.ref - b.ref || ko(a.row.univ, b.row.univ) || ko(a.row.adm, b.row.adm) || ko(a.row.unit, b.row.unit));
    return out;
  };

  /* 기준점수 이상(차이 ≥ 0)인 모집단위 수 */
  Sim.countReached = function (D, total, scale) {
    if (!Calc().isNum(total)) return null;
    let n = 0;
    for (const row of D.rows) if (Calc().isNum(row.ref[scale]) && total - row.ref[scale] >= -1e-9) n++;
    return n;
  };

  global.Sim = Sim;
})(window);
