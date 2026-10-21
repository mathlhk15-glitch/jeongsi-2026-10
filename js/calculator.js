/* =========================================================
 * calculator.js — 성적 변환·합산·상위누적·비교 계산 엔진
 * 원칙: 검증된 대응표가 있을 때만 변환한다. 추정값을 만들지 않는다.
 * ========================================================= */
(function (global) {
  "use strict";
  const C = {};

  /* ---------- 과목 정의 ---------- */
  const KOR = { k: "kor", n: "국어", rawMax: 100, rawStep: 1 };
  const MATH = { k: "math", n: "수학", rawMax: 100, rawStep: 1 };
  C.subjects = function (g) {
    if (g === 3) {
      return [KOR, MATH,
        { k: "t1", n: "탐구1", rawMax: 50, rawStep: 1, tam: true },
        { k: "t2", n: "탐구2", rawMax: 50, rawStep: 1, tam: true }];
    }
    return [KOR, MATH,
      { k: "soc", n: "통합사회", rawMax: 50, rawStep: 0.5, tam: true },
      { k: "sci", n: "통합과학", rawMax: 50, rawStep: 0.5, tam: true }];
  };
  C.extras = [
    { k: "eng", n: "영어", rawMax: 100, rawStep: 1, absolute: true },
    { k: "his", n: "한국사", rawMax: 50, rawStep: 1, absolute: true }
  ];
  C.tamKeys = (g) => (g === 3 ? ["t1", "t2"] : ["soc", "sci"]);
  C.METRICS = ["std", "pct", "grade"];
  C.SCALE_NAME = { raw: "원점수", std: "표준점수", pct: "백분위" };
  C.SCALE_SHORT = { raw: "원점수 합", std: "표준점수 합", pct: "백분위 합" };

  /* 입력 가능 범위 (공식 성적표 표준점수 범위는 시험마다 달라 넉넉하게 둔다) */
  C.limits = function (subj, metric) {
    if (metric === "raw") return { min: 0, max: subj.rawMax, step: subj.rawStep };
    if (metric === "pct") return { min: 0, max: 100, step: 1 };
    if (metric === "grade") return { min: 1, max: 9, step: 1 };
    if (metric === "std") return subj.tam ? { min: 0, max: 100, step: 1 } : { min: 0, max: 200, step: 1 };
    return { min: 0, max: 999, step: 1 };
  };

  /* ---------- 절대평가 등급 (교육부 고시 기준, 추정 아님) ---------- */
  C.absoluteGrade = function (key, raw) {
    if (raw == null || raw === "" || isNaN(raw)) return null;
    raw = Number(raw);
    if (key === "eng") { if (raw >= 90) return 1; return Math.min(9, 10 - Math.floor(raw / 10)); }
    if (key === "his") { if (raw >= 40) return 1; return Math.min(9, 9 - Math.floor(raw / 5)); }
    return null;
  };

  /* 등급 비율 정의(누적 4·11·23·40·60·77·89·96%)를 이용한 '모순 경고'용 백분위 허용 구간.
     값을 변환하는 데는 쓰지 않는다. 동점자 처리로 경계가 흔들리므로 ±3 여유를 둔다. */
  const CUMR = [0, 4, 11, 23, 40, 60, 77, 89, 96, 100];
  C.pctBandForGrade = function (gr) {
    if (!gr) return null;
    return { lo: Math.max(0, 100 - CUMR[gr] - 3), hi: Math.min(100, 100 - CUMR[gr - 1] + 3) };
  };

  const isNum = (v) => v !== null && v !== undefined && v !== "" && !isNaN(v) && isFinite(v);
  C.isNum = isNum;
  const N = (v) => (isNum(v) ? Number(v) : null);
  const r2 = (v) => Math.round(v * 100) / 100;
  C.r2 = r2;

  /* 대응표에서 원점수로 찾기 (표: [raw, std, pct, grade, cum]) */
  C.lookupRaw = function (table, raw) {
    if (!table || !isNum(raw)) return null;
    const x = Number(raw);
    for (const row of table) if (Math.abs(row[0] - x) < 1e-9) return row;
    return null;
  };

  /* 공식 대응표(미래용): 행 [std, pct, grade, cum]. 아는 지표로 걸러서 '모두 같은 값'일 때만 채운다 */
  function fillFromOfficial(table, cell) {
    if (!table) return {};
    const idx = { std: 0, pct: 1, grade: 2, cum: 3 };
    let rows = table;
    let used = false;
    for (const m of ["std", "pct", "grade"]) {
      if (isNum(cell[m])) { rows = rows.filter((r) => r[idx[m]] === Number(cell[m])); used = true; }
    }
    if (!used || rows.length === 0) return { conflict: used && rows.length === 0 };
    const out = {};
    for (const m of ["std", "pct", "grade", "cum"]) {
      if (isNum(cell[m])) continue;
      const vals = [...new Set(rows.map((r) => r[idx[m]]))];
      if (vals.length === 1 && vals[0] != null) out[m] = vals[0];
    }
    return out;
  }

  /* ---------- 상위누적 찾기 ----------
     상위누적 시트는 위에서부터 '상위 p%일 때의 점수'. 학생 점수 S 이하인 값이
     처음 나오는 행의 p를 학생의 상위누적으로 본다. */
  C.cumLookup = function (cum, scale, combo, value) {
    if (!cum || !isNum(value)) return null;
    const arr = cum[scale + "_" + combo];
    if (!arr) return null;
    const P = cum.pct_cum;
    const v = Number(value);
    if (arr[0] != null && v > arr[0]) return { p: P[0], edge: "top" };
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] != null && arr[i] <= v + 1e-9) return { p: P[i], edge: null };
    }
    return { p: null, edge: "bottom" };
  };

  /* ---------- 학생 성적 해석 ----------
     inputs: { kor:{raw,std,pct,grade}, ..., eng:{raw,grade}, his:{raw,grade} }
     ctx: { grade, mode: 'gachae'|'official', data, official }
  */
  C.resolve = function (ctx, inputs) {
    const g = ctx.grade, D = ctx.data;
    const subs = C.subjects(g);
    const out = { grade: g, mode: ctx.mode, subj: {}, extra: {}, totals: {}, missing: {}, cum: {}, errors: [], warnings: [], anyInput: false };
    for (const s of subs) {
      const inp = (inputs && inputs[s.k]) || {};
      const cell = { raw: null, std: null, pct: null, grade: null, cum: null, src: {} };
      if (ctx.mode === "gachae" && isNum(inp.raw)) {
        cell.raw = Number(inp.raw); cell.src.raw = "input"; out.anyInput = true;
        const lim = C.limits(s, "raw");
        if (cell.raw < lim.min || cell.raw > lim.max || (g === 3 && !Number.isInteger(cell.raw))) out.errors.push(`${s.n} 원점수는 ${lim.min}~${lim.max} 사이로 입력하세요.`);
        if (g < 3 && D && D.conv) {
          const row = C.lookupRaw(D.conv[s.k], cell.raw);
          if (row) {
            cell.std = row[1]; cell.pct = row[2]; cell.grade = row[3]; cell.cum = row[4];
            cell.src.std = cell.src.pct = cell.src.grade = cell.src.cum = "table";
          } else if (cell.raw >= lim.min && cell.raw <= lim.max) {
            out.errors.push(`${s.n} 원점수 ${cell.raw}점은 변환표에 없습니다. 이번 시험에서 나올 수 없는 점수인지 확인하세요.`);
            cell.noTable = true;
          }
        }
      }
      // 직접 입력한 표준점수·백분위·등급 (공식 모드, 또는 고3 가채점 '추가 성적')
      const allowManual = ctx.mode === "official" || g === 3;
      if (allowManual) {
        for (const m of C.METRICS) {
          if (isNum(inp[m])) {
            const v = Number(inp[m]);
            const lim = C.limits(s, m);
            if (v < lim.min || v > lim.max || (m === "grade" && !Number.isInteger(v))) {
              out.errors.push(`${s.n} ${m === "std" ? "표준점수" : m === "pct" ? "백분위" : "등급"}는 ${lim.min}~${lim.max} 범위로 입력하세요.`);
              continue;
            }
            cell[m] = v; cell.src[m] = "input"; out.anyInput = true;
          }
        }
        // 공식 대응표가 있으면 비어 있는 지표만 보완
        if (ctx.mode === "official" && ctx.official && ctx.official.conv) {
          const f = fillFromOfficial(ctx.official.conv[s.k], cell);
          if (f.conflict) out.warnings.push(`${s.n}: 입력한 지표끼리 공식 대응표와 맞지 않습니다. 성적표를 다시 확인하세요.`);
          for (const m in f) if (m !== "conflict") { cell[m] = f[m]; cell.src[m] = "official"; }
        }
        // 등급-백분위 모순 경고
        if (isNum(cell.pct) && isNum(cell.grade) && cell.src.pct === "input" && cell.src.grade === "input") {
          const b = C.pctBandForGrade(cell.grade);
          if (b && (cell.pct < b.lo || cell.pct > b.hi)) out.warnings.push(`${s.n}: 백분위 ${cell.pct}와 ${cell.grade}등급이 서로 맞지 않을 수 있습니다. 성적표를 다시 확인하세요.`);
        }
      }
      out.subj[s.k] = cell;
    }
    // 영어·한국사
    for (const e of C.extras) {
      const inp = (inputs && inputs[e.k]) || {};
      const cell = { raw: null, grade: null, src: {} };
      if (ctx.mode === "gachae" && isNum(inp.raw)) {
        cell.raw = Number(inp.raw); cell.src.raw = "input";
        if (cell.raw < 0 || cell.raw > e.rawMax) out.errors.push(`${e.n} 원점수는 0~${e.rawMax} 사이로 입력하세요.`);
        else { cell.grade = C.absoluteGrade(e.k, cell.raw); cell.src.grade = "absolute"; }
      }
      if (isNum(inp.grade) && (ctx.mode === "official" || cell.grade == null)) {
        const v = Number(inp.grade);
        if (v >= 1 && v <= 9 && Number.isInteger(v)) { cell.grade = v; cell.src.grade = "input"; }
        else out.errors.push(`${e.n} 등급은 1~9 사이 정수로 입력하세요.`);
      }
      out.extra[e.k] = cell;
    }

    // 합산 (국수탐 2과목 기준, 원본 엑셀과 동일한 방식)
    const [ta, tb] = C.tamKeys(g);
    const S = out.subj;
    const keys = ["kor", "math", ta, tb];
    const nameOf = (k) => subs.find((s) => s.k === k).n;
    for (const scale of ["raw", "std", "pct"]) {
      const miss = keys.filter((k) => !isNum(S[k][scale]));
      out.missing[scale] = miss.map(nameOf);
      if (miss.length === 0) {
        out.totals[scale] = scale === "pct"
          ? r2(S.kor.pct + S.math.pct + (S[ta].pct + S[tb].pct) / 2)
          : r2(S.kor[scale] + S.math[scale] + S[ta][scale] + S[tb][scale]);
      } else out.totals[scale] = null;
    }
    // 원점수 합은 가채점 모드에서만 의미 있음
    if (ctx.mode !== "gachae") { out.totals.raw = null; out.missing.raw = keys.map(nameOf); }

    // 등급 평균(엑셀 '한문제더'와 같은 방식: (탐 평균 + 국 + 수)/3)
    if (keys.every((k) => isNum(S[k].grade))) out.gradeAvg = r2(((S[ta].grade + S[tb].grade) / 2 + S.kor.grade + S.math.grade) / 3);

    // 상위누적 (가채점 고1·고2 + 해당 표가 있을 때만)
    const cumSrc = ctx.mode === "gachae" ? (D && D.cum) : (ctx.official && ctx.official.cum);
    if (cumSrc) {
      const combos = {
        kms: keys, ks: ["kor", ta, tb], ms: ["math", ta, tb], km: ["kor", "math"]
      };
      for (const scale of ["std", "pct", "raw"]) {
        out.cum[scale] = {};
        for (const c in combos) {
          const ks = combos[c];
          if (!ks.every((k) => isNum(S[k][scale]))) { out.cum[scale][c] = null; continue; }
          let v;
          if (scale === "pct") {
            const hasTam = ks.includes(ta);
            v = ks.filter((k) => k !== ta && k !== tb).reduce((a, k) => a + S[k].pct, 0) + (hasTam ? (S[ta].pct + S[tb].pct) / 2 : 0);
          } else v = ks.reduce((a, k) => a + S[k][scale], 0);
          v = r2(v);
          out.cum[scale][c] = { value: v, ...(C.cumLookup(cumSrc, scale, c, v) || {}) };
        }
      }
    }
    return out;
  };

  /* 비교 척도 결정 */
  C.availableScales = function (prof) {
    return ["std", "pct", "raw"].filter((s) => prof && isNum(prof.totals[s]));
  };
  C.defaultScale = function (prof) {
    const av = C.availableScales(prof);
    if (prof.mode === "gachae" && prof.grade < 3) return av.includes("std") ? "std" : av[0] || null;
    if (prof.mode === "gachae" && prof.grade === 3) return av.includes("std") ? "std" : av.includes("pct") ? "pct" : av.includes("raw") ? "raw" : null;
    return av.includes("std") ? "std" : av.includes("pct") ? "pct" : null;
  };
  /* 정확한 비교에 필요한 추가 입력(가장 적게 필요한 척도 기준) */
  C.neededInputs = function (prof) {
    const opts = prof.mode === "gachae" && prof.grade < 3 ? ["raw"] : prof.mode === "gachae" ? ["raw", "std", "pct"] : ["std", "pct"];
    let best = null;
    for (const s of opts) {
      const m = prof.missing[s] || [];
      if (!best || m.length < best.list.length) best = { scale: s, list: m };
    }
    return best;
  };

  /* ---------- 반영영역 기준 계산 (고3) ----------
     계산 규칙이 확정적인 조합만 계산한다. '中 택N', '탐(1)'처럼 선택·가중이 들어간 규칙은
     원본에서 계산 방식을 확인할 수 없어 계산하지 않는다. */
  /* 고3 지원참고표에 실재하는 산출기준 18종. 탐(1)은 우수 1과목 * 2,
     탐(2)은 표준점수 합 / 백분위 평균. 복수 선택은 같은 척도의 높은 영역 선택. */
  const AREA_RULES = new Set([
    "국수탐(2)","국수탐(1)","국수","국","수탐(2)","수탐(1)","국탐(1)","탐(1)",
    "탐(1)+국/수 中 택1","탐(2)+국/수 中 택1",
    "국/수/탐(2) 中 택2","국/수/탐(1) 中 택2",
    "국/수/탐(2) 中 택1","국/수/탐(1) 中 택1",
    "수+국/탐(1) 中 택1","국+수/탐(1) 中 택1",
    "국+수/탐(2) 中 택1","수+국/탐(2) 中 택1"
  ]);
  C.areaComputable = (rule) => AREA_RULES.has(rule);
  C.areaScore = function (prof, rule, scale) {
    if (!prof || prof.grade !== 3 || !AREA_RULES.has(rule)) return null;
    const S = prof.subj;
    const v = (key) => S[key] && isNum(S[key][scale]) ? Number(S[key][scale]) : null;
    const inquiry = (n) => {
      const t = [v("t1"), v("t2")].filter(isNum).sort((a,b)=>b-a);
      if (n===1) return t.length ? t[0]*(scale === "std" ? 2 : 1) : null;
      if (t.length<2) return null;
      return scale==="pct" ? (t[0]+t[1])/2 : t[0]+t[1];
    };
    const val = (p) => p==="국"?v("kor"):p==="수"?v("math"):p==="탐(1)"?inquiry(1):p==="탐(2)"?inquiry(2):null;
    if (rule==="국수탐(2)"||rule==="국수탐(1)") {const a=v("kor"),b=v("math"),c=inquiry(rule.includes("(1)")?1:2);return [a,b,c].every(isNum)?r2(a+b+c):null;}
    if (rule==="국수") {const a=v("kor"),b=v("math");return [a,b].every(isNum)?r2(a+b):null;}
    if (rule==="국") return val("국");
    if (["수탐(1)","수탐(2)","국탐(1)"].includes(rule)) {const a=val(rule[0]),b=inquiry(rule.endsWith("(1)")?1:2);return [a,b].every(isNum)?r2(a+b):null;}
    if (rule==="탐(1)") return inquiry(1);
    const m=rule.match(/^(?:(국|수|탐\([12]\))\+)?(국\/수|수\/탐\([12]\)|국\/탐\([12]\)|국\/수\/탐\([12]\)) 中 택([12])$/);
    if (!m) return null;
    const fixed=m[1]?val(m[1]):0;
    if (m[1]&&!isNum(fixed)) return null;
    const parts=m[2].split('/').map(val).filter(isNum).sort((a,b)=>b-a);
    const count=Number(m[3]);
    return parts.length>=count?r2(fixed+parts.slice(0,count).reduce((a,b)=>a+b,0)):null;
  };

  /* ---------- 모집단위별 비교 ---------- */
  C.tone = function (diff, scale, cfg) {
    const near = (cfg && cfg.nearRule && cfg.nearRule[scale]) || 3;
    if (diff == null) return "na";
    if (diff >= near) return "up";
    if (diff > -near) return "near";
    return "down";
  };
  C.TONE_TEXT = { up: "기준보다 높음", near: "기준과 근접", down: "기준보다 낮음", na: "추가 입력 필요", area: "반영영역 기준" };

  C.eligibility = function(row, choices) {
    if (!row.x) return {status:"ok",reasons:[]};
    const c=choices||{}, x=row.x, reasons=[];
    if(c.t1Subject&&c.t2Subject&&c.t1Subject===c.t2Subject) reasons.push("탐구 동일 과목 중복");
    if(x.mathSel&&c.mathSel&&!x.mathSel.split("/").includes(c.mathSel)) reasons.push("수학 선택과목 조건 불일치");
    const types=[c.t1Type,c.t2Type].filter(Boolean);
    if(x.tamType && types.length && types.some(t=>!x.tamType.split("/").includes(({사회:"사",과학:"과",직업:"직"})[t]||t))) reasons.push("탐구 유형 조건 불일치");
    // 원본 주석에 과탐 2과목 조건이 명확한 경우에만 적용
    if(/과탐\s*2과목|과학탐구\s*2과목/.test(String(x.note||""))&&types.length===2&&types.some(t=>t!=="과학")) reasons.push("과탐 2과목 응시 조건");
    return {status:reasons.length?"condition":"ok",reasons};
  };
  C.compareRow = function (row, prof, scale, cfg) {
    const res = { status: "need", diff: null, mine: null, ref: null, tone: "na", area: null, scale: scale || null, basis: "공통 국수탐(2)" };
    if (!prof) return res;
    const elig=C.eligibility(row,cfg&&cfg.choices);
    if(elig.status==="condition") {res.status="condition";res.reason=elig.reasons.join(", ");return res;}
    const x = row.x;
    // 고3은 먼저 해당 모집단위의 산출기준 및 산출척도에 맞게 비교한다.
    // 가채점 원점수/표준점수/백분위와 최종 대학 환산점수는 별개임.
    if (prof.grade === 3 && cfg && cfg.compareMode === "common") {
      if (scale && isNum(prof.totals[scale]) && isNum(row.ref[scale])) {res.mine=prof.totals[scale];res.ref=row.ref[scale];res.diff=r2(res.mine-res.ref);res.scale=scale;res.status="exact";res.tone=C.tone(res.diff,scale,cfg);res.basis="공통 국수탐(2)";}
      return res;
    }
    if (prof.grade === 3 && x && C.areaComputable(x.areaRule)) {
      const use = String(x.useScore || "");
      const prefer = use.includes("백분위") ? "pct" : use.includes("표준") ? "std" : null;
      const candidates = (cfg && cfg.compareMode === "common") ? [] :
        (cfg && cfg.compareMode === "std") ? ["std"] :
        (cfg && cfg.compareMode === "pct") ? ["pct"] :
        [...new Set([prefer,scale,"std","pct","raw"].filter(Boolean))];
      for (const sc of candidates) {
        const mine = C.areaScore(prof,x.areaRule,sc), ref=x.area && x.area[sc];
        if (!isNum(mine) || !isNum(ref)) continue;
        res.mine=mine;res.ref=ref;res.diff=r2(mine-ref);res.scale=sc;
        res.basis=x.areaRule;res.tone=C.tone(res.diff,sc,cfg);res.status="exact";
        res.area={scale:sc,mine,ref,diff:res.diff,tone:res.tone};break;
      }
      if(res.status==="exact") return res;
      // 고3의 산출점수가 미완성일 때 공통합으로 정확한 것처럼 대체하지 않는다.
      return res;
    }
    if (scale && isNum(prof.totals[scale]) && isNum(row.ref[scale])) {
      res.mine=prof.totals[scale];res.ref=row.ref[scale];res.diff=r2(res.mine-res.ref);
      res.status="exact";res.tone=C.tone(res.diff,scale,cfg);
    }
    return res;
  };
  C.availableAreaScale = function (prof, rule) {
    for (const s of ["std", "pct", "raw"]) if (isNum(C.areaScore(prof, rule, s))) return s;
    return null;
  };

  /* 영어·한국사 대학별 점수(원본 표에 있는 값만) */
  C.extraPoints = function (row, prof) {
    if (!row.x) return null;
    const res = {};
    const eg = prof && prof.extra.eng.grade, hg = prof && prof.extra.his.grade;
    if (row.x.eng) res.eng = { rule: row.x.engRule, table: row.x.eng, mine: eg ? row.x.eng[eg - 1] : null, grade: eg };
    if (row.x.his) res.his = { rule: row.x.hisRule, table: row.x.his, mine: hg ? row.x.his[hg - 1] : null, grade: hg };
    return res;
  };

  /* ---------- 목표 역산 (고1·고2 가채점: 원점수 → 표준점수/백분위 대응표로 정확 계산) ---------- */
  C.neededRawForTarget = function (ctx, inputs, prof, subjKey, scale, target) {
    const D = ctx.data;
    if (!D || !D.conv || !D.conv[subjKey]) return null;
    const table = D.conv[subjKey];
    const cur = prof.subj[subjKey];
    if (!isNum(cur.raw)) return null;
    // 원점수가 높은 순으로 정렬된 표에서, 현재보다 높고 목표 합을 넘기는 가장 낮은 원점수
    const others = prof.totals[scale] - (scale === "pct" && C.tamKeys(ctx.grade).includes(subjKey) ? cur[scale] / 2 : cur[scale]);
    let best = null;
    for (const row of table) {
      const val = scale === "std" ? row[1] : row[2];
      const contrib = scale === "pct" && C.tamKeys(ctx.grade).includes(subjKey) ? val / 2 : val;
      if (row[0] < cur.raw) continue;
      if (others + contrib >= target - 1e-9) best = row; // 표는 내림차순 → 계속 갱신하면 최소 원점수
    }
    if (!best) return { reachable: false };
    return { reachable: true, raw: best[0], gain: r2(best[0] - cur.raw), std: best[1], pct: best[2], grade: best[3] };
  };

  global.Calc = C;
})(window);
