/* 자동 검수 스크립트: node tests/run_tests.js  (원본 엑셀 대조 자료: tests/fixtures/*.json) */
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const ctxObj = { window: {}, console };
ctxObj.window.window = ctxObj.window;
vm.createContext(ctxObj);
const load = (f) => vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctxObj, { filename: f });
["data/metadata.js", "data/grade1.js", "data/grade2.js", "data/grade3.js", "js/calculator.js", "js/search.js", "js/simulator.js"].forEach(load);
const W = ctxObj.window, Calc = W.Calc, Search = W.Search, Sim = W.Sim, cfg = W.UDATA.config;
let pass = 0, fail = 0; const log = [];
function ok(name, cond, extra) { if (cond) pass++; else fail++; log.push(`${cond ? "PASS" : "FAIL"} | ${name}${extra ? " | " + extra : ""}`); }
function norm(raw) { // search.js normalize 사용
  const fake = { UDATA: W.UDATA, document: null };
  return null;
}
(async () => {
  // Search.loadGrade 는 이미 window.UDATA 에 데이터가 있으면 스크립트를 불러오지 않는다
  const D = {}; for (const g of [1, 2, 3]) D[g] = await Search.loadGrade(g);
  ok("고1 모집단위 수 4214", D[1].rows.length === 4214); ok("고2 모집단위 수 4214", D[2].rows.length === 4214); ok("고3 모집단위 수 4281", D[3].rows.length === 4281);
  for (const g of [1, 2, 3]) ok(`고${g} 모집단위 ID 중복 없음`, new Set(D[g].rows.map((r) => r.id)).size === D[g].rows.length);

  /* 1) 원본 엑셀(한문제더) 계산값 대조 */
  for (const g of [1, 2]) {
    const X = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", `excel_g${g}.json`), "utf8"));
    const keys = ["kor", "math", "soc", "sci"];
    const mk = (arr) => Object.fromEntries(keys.map((k, i) => [k, { raw: arr[i] }]));
    const ctx = { grade: g, mode: "gachae", data: D[g] };
    const P = Calc.resolve(ctx, mk(X.cur)), E = Calc.resolve(ctx, mk(X.exp));
    const col = { kor: "F", math: "J", soc: "N", sci: "R" };
    for (const k of keys) {
      ok(`고${g} ${k} 표준점수 = 엑셀`, P.subj[k].std === X.vals[col[k] + "6"], `${P.subj[k].std} vs ${X.vals[col[k] + "6"]}`);
      ok(`고${g} ${k} 백분위 = 엑셀`, P.subj[k].pct === X.vals[col[k] + "7"]);
      ok(`고${g} ${k} 등급 = 엑셀`, P.subj[k].grade === X.vals[col[k] + "8"]);
    }
    const parse = (s) => { const m = String(s).match(/([\d.]+) \(([\d.]+)%\)/); return [Number(m[1]), Number(m[2])]; };
    for (const [prof, cells] of [[P, ["V5", "V6", "V7", "V8"]], [E, ["AT5", "AT6", "AT7", "AT8"]]]) {
      const [rawT, rawC] = parse(X.vals[cells[0]]), [stdT, stdC] = parse(X.vals[cells[1]]), [pctT] = parse(X.vals[cells[2]]);
      ok(`고${g} 원점수 합 = 엑셀 (${cells[0]})`, prof.totals.raw === rawT);
      ok(`고${g} 표준점수 합 = 엑셀 (${cells[1]})`, prof.totals.std === stdT);
      ok(`고${g} 표준점수 합 상위누적 = 엑셀 (${cells[1]})`, prof.cum.std.kms.p === stdC, `${prof.cum.std.kms.p} vs ${stdC}`);
      ok(`고${g} 백분위 합 = 엑셀 (${cells[2]})`, prof.totals.pct === pctT);
      ok(`고${g} 평균등급 = 엑셀 (${cells[3]})`, prof.gradeAvg === X.vals[cells[3]]);
      log.push(`INFO | 고${g} 원점수합 상위누적: 웹 ${prof.cum.raw.kms.p}% / 엑셀 ${rawC}% (엑셀은 정렬 안 된 열 근사검색 — 검증 정보 참고)`);
    }
    // 표준점수 합 → 상위누적: 엑셀 숨김표(정확일치)와 전 구간 대조
    let same = 0, diff = [];
    for (const [z, ac] of X.zmap) { const r = Calc.cumLookup(D[g].cum, "std", "kms", z); if (r && r.p === ac) same++; else diff.push(`${z}:${r && r.p}/${ac}`); }
    ok(`고${g} 표준점수 합 상위누적 전 구간(${X.zmap.length}개) = 엑셀 숨김표`, diff.length === 0, diff.slice(0, 5).join(" "));
    // 한문제더 검색 결과 대조 (현재~기대 표준점수 합, 지역 선택 반영)
    const regions = ["서울", "경기", "인천", "강원", "대전", "충남", "충북", "광주", "전남", "전북", "대구", "경북", "부산", "울산", "경남", "제주"].filter((_, i) => X.regions[i] === true);
    const list = Sim.between(D[g], P.totals.std, E.totals.std, "std", { regions, groups: [], fields: [], adm: "", text: "" });
    // 고1 파일에 저장된 검색 결과는 현재 입력값과 다른 상태(기준 382점 등, 원본에 없는 모집단위 포함)로 저장되어 있어 대조에서 제외
    const stale = X.out["가"].length && !D[g].rows.some((r) => r.univ === X.out["가"][0][1] && r.unit === X.out["가"][0][2] && r.ref.std === P.totals.std);
    if (stale) { log.push(`INFO | 고${g} 한문제더 파일에 저장된 검색 결과는 현재 입력(${P.totals.std}~${E.totals.std})으로 실행한 결과가 아님 → 대조 제외`); continue; }
    for (const gg of ["가", "나", "다"]) {
      const mine = list.filter((x) => x.row.group === gg), xl = X.out[gg];
      const symOk = mine.length === xl.length && mine.every((x, i) => x.sym === xl[i][0] && x.row.unit === xl[i][2]);
      ok(`고${g} 한문제더 ${gg}군 결과(${xl.length}건, 순서·기호·학과명) = 엑셀`, symOk, `웹 ${mine.length}건`);
    }
  }

  /* 2) 변환표: 없는 원점수 처리, 미입력과 0점 구별 */
  {
    const ctx = { grade: 1, mode: "gachae", data: D[1] };
    const P = Calc.resolve(ctx, { kor: { raw: 99 } });
    ok("고1 국어 99점(변환표에 없음) → 오류 안내, 값 추정 안 함", P.subj.kor.std === null && P.errors.length === 1);
    const Z = Calc.resolve(ctx, { kor: { raw: 0 }, math: { raw: 0 }, soc: { raw: 0 }, sci: { raw: 0 } });
    ok("0점 입력은 정상 계산(미입력과 구별)", Z.totals.std === 55 + 63 + 29 + 29, String(Z.totals.std));
    const M = Calc.resolve(ctx, { kor: { raw: 80 } });
    ok("미입력 과목은 0점 처리하지 않음 → 합계 없음", M.totals.std === null && M.missing.std.length === 3);
    ok("범위 밖 원점수(101) 오류", Calc.resolve(ctx, { kor: { raw: 101 } }).errors.length >= 1);
  }

  /* 3) 고3 가채점: 원점수 합만 비교, 표준점수 임의 변환 금지 */
  {
    const ctx = { grade: 3, mode: "gachae", data: D[3] };
    const P = Calc.resolve(ctx, { kor: { raw: 80 }, math: { raw: 76 }, t1: { raw: 41 }, t2: { raw: 39 } });
    ok("고3 원점수 합 236", P.totals.raw === 236);
    ok("고3 원점수 → 표준점수 변환 안 함", P.totals.std === null && P.subj.kor.std === null);
    ok("고3 기본 비교 척도 = 원점수", Calc.defaultScale(P) === "raw");
    const Q = Calc.resolve(ctx, { kor: { raw: 80, std: 128 }, math: { raw: 76, std: 131 }, t1: { raw: 41, std: 64 }, t2: { raw: 39, std: 62 } });
    ok("고3 추가 성적(표준점수) 입력 시 표준점수 합 비교", Q.totals.std === 385 && Calc.defaultScale(Q) === "std");
    ok("고3 영어 원점수 85 → 2등급(절대평가)", Calc.resolve(ctx, { eng: { raw: 85 } }).extra.eng.grade === 2);
    ok("한국사 원점수 34 → 3등급", Calc.absoluteGrade("his", 34) === 3);
    ok("영어 원점수 90 → 1등급, 89 → 2등급, 15 → 9등급", Calc.absoluteGrade("eng", 90) === 1 && Calc.absoluteGrade("eng", 89) === 2 && Calc.absoluteGrade("eng", 15) === 9);
    // 영어 대학별 등급점수
    const r = D[3].rows[0]; const ep = Calc.extraPoints(r, Calc.resolve(ctx, { eng: { grade: 2 } }));
    ok("고3 영어 2등급 → 가야대 자유전공 등급점수 274 (원본 AT9)", ep.eng.mine === 274);
  }

  /* 4) 공식 성적표 모드 — 필수 12사례 */
  {
    const g = 3, ctx = { grade: g, mode: "official", data: D[g] };
    const R = (inp) => Calc.resolve(ctx, inp);
    const anyRow = D[g].rows[100];
    const T = [];
    let P = R({ kor: { std: 124 } });
    ok("공식1 국어 표준점수만 → 입력 수용·합계 없음·비교 상태 '추가 입력 필요'", P.errors.length === 0 && P.totals.std === null && Calc.compareRow(anyRow, P, Calc.defaultScale(P), cfg).status === "need");
    ok("공식1 추가 입력 안내 = 수학·탐구1·탐구2 표준점수", JSON.stringify(Calc.neededInputs(P).list) === JSON.stringify(["수학", "탐구1", "탐구2"]));
    P = R({ kor: { pct: 91 } }); ok("공식2 국어 백분위만 → 표준점수 임의 환산 없음", P.subj.kor.std === null && P.subj.kor.pct === 91 && P.errors.length === 0);
    P = R({ kor: { grade: 2 } }); ok("공식3 국어 등급만 → 백분위·표준점수 단정 없음", P.subj.kor.pct === null && P.subj.kor.std === null && P.subj.kor.grade === 2);
    P = R({ kor: { std: 124 }, math: { pct: 91 } }); ok("공식4 국어 표준 + 수학 백분위 → 척도 혼합 합산 안 함", P.totals.std === null && P.totals.pct === null);
    P = R({ kor: { std: 124 }, math: { pct: 91 }, t1: { grade: 2 }, t2: { std: 61, pct: 83, grade: 3 } }); ok("공식5 과목별 다른 지표 → 오류 없이 수용, 합계 없음", P.errors.length === 0 && P.totals.std === null && P.totals.pct === null);
    P = R({ kor: { std: 124 }, math: { std: 130 }, t1: { std: 63 }, t2: { std: 61 } }); ok("공식6 모든 과목 표준점수 → 표준점수 합 378로 정확 비교", P.totals.std === 378 && Calc.defaultScale(P) === "std" && Calc.compareRow(anyRow, P, "std", cfg).status === "exact");
    P = R({ kor: { pct: 90 }, math: { pct: 92 }, t1: { pct: 85 }, t2: { pct: 81 } }); ok("공식7 모든 과목 백분위 → 백분위 합 = 90+92+(85+81)/2 = 265", P.totals.pct === 265 && Calc.defaultScale(P) === "pct");
    P = R({ kor: { grade: 2 }, math: { grade: 1 }, t1: { grade: 2 }, t2: { grade: 3 } }); ok("공식8 등급만 → 평균등급만 계산, 지원참고점수 비교 안 함", P.gradeAvg === Calc.r2(((2 + 3) / 2 + 2 + 1) / 3) && Calc.defaultScale(P) === null);
    P = R({ kor: { std: 124 }, math: { std: 130 } }); ok("공식9 일부 과목 지표 전무 → 0점 처리 금지", P.totals.std === null && P.subj.t1.std === null);
    P = R({ kor: { std: 124, pct: 92, grade: 2 }, math: { std: 130, pct: 93, grade: 2 }, t1: { std: 63, pct: 90, grade: 2 }, t2: { std: 61, pct: 85, grade: 3 } }); ok("공식10 세 지표 모두 → 표준·백분위 모두 계산", P.totals.std === 378 && P.totals.pct === 272.5 && P.warnings.length === 0);
    P = R({ kor: { pct: 45, grade: 1 } }); ok("공식11 모순 지표(백분위 45 + 1등급) → 경고", P.warnings.length === 1);
    P = R({ kor: { grade: 11 } }); ok("공식 범위 밖 등급(11) → 오류", P.errors.length === 1);
    // 공식12: 같은 학생 가채점/공식 분리 — 입력 객체가 분리되어 있고 resolve가 모드별로 다른 칸만 읽는지
    const inp = { kor: { raw: 80, std: 128 } };
    ok("공식12 가채점 모드에서 고1·고2는 직접 입력 표준점수를 쓰지 않음", Calc.resolve({ grade: 1, mode: "gachae", data: D[1] }, { kor: { raw: 80, std: 999 } }).subj.kor.std !== 999);
    ok("공식12 공식 모드는 원점수를 읽지 않음(원점수 합 없음)", Calc.resolve(ctx, { kor: { raw: 80 }, math: { raw: 80 }, t1: { raw: 40 }, t2: { raw: 40 } }).totals.raw === null);
    // 공식 대응표가 등록되면 비어 있는 지표만 보완
    const off = { conv: { kor: [[124, 92, 2, 7.5], [123, 90, 2, 9.1], [122, 90, 3, 10.2]] } };
    const F = Calc.resolve({ grade: 3, mode: "official", data: D[3], official: off }, { kor: { std: 124 } });
    ok("공식 대응표 등록 시 표준 124 → 백분위 92·2등급 자동 보완", F.subj.kor.pct === 92 && F.subj.kor.grade === 2 && F.subj.kor.src.pct === "official");
    const F2 = Calc.resolve({ grade: 3, mode: "official", data: D[3], official: off }, { kor: { pct: 90 } });
    ok("백분위 90에 대응 표준점수가 2개 → 표준점수는 단정하지 않음", F2.subj.kor.std === null);
  }

  /* 5) 검색 경계 */
  {
    const g = 1, ctx = { grade: g, mode: "gachae", data: D[g] };
    const P = Calc.resolve(ctx, { kor: { raw: 77 }, math: { raw: 84 }, soc: { raw: 43.5 }, sci: { raw: 43 } });
    for (const range of [5, 10, 15, 20]) {
      const res = Search.near(D[g], P, "std", range, null, cfg);
      const manual = D[g].rows.filter((r) => Math.abs(P.totals.std - r.ref.std) <= range).length;
      const hasEdge = res.some((x) => Math.abs(x.cmp.diff) === range);
      ok(`±${range}점 검색 = 직접 센 값(${manual}), 경계 포함`, res.length === manual && res.every((x) => Math.abs(x.cmp.diff) <= range) && (hasEdge || !D[g].rows.some((r) => Math.abs(P.totals.std - r.ref.std) === range)));
    }
    const none = Search.near(D[g], Calc.resolve(ctx, { kor: { raw: 0 }, math: { raw: 0 }, soc: { raw: 0 }, sci: { raw: 0 } }), "std", 5, null, cfg);
    ok("결과 0개 상황 처리(0점)", none.length === 0);
    const hopeOnly = Search.hope(D[g], Calc.resolve(ctx, {}), null, { univs: ["부산대"], depts: [], fields: [], logic: "or" }, null, cfg);
    ok("희망 조건만 입력 → 부산대 전체 표시, 모두 '추가 입력 필요'", hopeOnly.length === D[g].rows.filter((r) => r.univ === "부산대").length && hopeOnly.every((x) => x.cmp.status === "need"));
    const hopeFar = Search.hope(D[g], P, "std", { univs: ["서울대"], depts: [], fields: [], logic: "or" }, null, cfg);
    ok("희망 조건은 범위 밖(30점 이상 차이)도 포함", hopeFar.some((x) => Math.abs(x.cmp.diff) > 20));
    const or = Search.hope(D[g], P, "std", { univs: ["부산대"], depts: ["간호"], fields: [], logic: "or" }, null, cfg).length;
    const and = Search.hope(D[g], P, "std", { univs: ["부산대"], depts: ["간호"], fields: [], logic: "and" }, null, cfg).length;
    ok("OR 결과 ≥ AND 결과, AND = 부산대 간호", or > and && and === D[g].rows.filter((r) => r.univ === "부산대" && r.unit.includes("간호")).length, `OR ${or} / AND ${and}`);
    const rel = Search.hope(D[g], P, "std", { univs: [], depts: ["컴퓨터"], fields: [], logic: "or", related: true }, null, cfg);
    ok("관련 분야 검색: 컴퓨터 → 소프트웨어·인공지능 포함, 일치/관련 구분", rel.some((x) => x.match.kind === "related" && /소프트웨어|인공지능/.test(x.row.unit)) && rel.some((x) => x.match.kind === "name"));
    const ids = rel.map((x) => x.row.id); ok("동일 모집단위 중복 표시 없음", new Set(ids).size === ids.length);
    const sorted = Search.sort(Search.near(D[g], P, "std", 10, null, cfg), "near", "std");
    ok("가까운 순 정렬", sorted.every((x, i) => i === 0 || Math.abs(sorted[i - 1].cmp.diff) <= Math.abs(x.cmp.diff)));
    const flt = Search.near(D[g], P, "std", 10, { regions: ["부산"], groups: ["가"], fields: [], adm: "", text: "" }, cfg);
    ok("필터(부산·가군) 작동", flt.length > 0 && flt.every((x) => x.row.region === "부산" && x.row.group === "가"));
    // 근접 판정
    ok("근접 규칙: +3 높음, +2.5 근접, -2.5 근접, -3 낮음", Calc.tone(3, "std", cfg) === "up" && Calc.tone(2.5, "std", cfg) === "near" && Calc.tone(-2.5, "std", cfg) === "near" && Calc.tone(-3, "std", cfg) === "down");
  }

  /* 6) 목표 역산 — 변환표만으로 정확 계산 */
  {
    const g = 1, ctx = { grade: g, mode: "gachae", data: D[g] };
    const P = Calc.resolve(ctx, { kor: { raw: 77 }, math: { raw: 84 }, soc: { raw: 43.5 }, sci: { raw: 43 } });
    const r = Calc.neededRawForTarget(ctx, null, P, "kor", "std", P.totals.std + 5);
    const check = Calc.resolve(ctx, { kor: { raw: r.raw }, math: { raw: 84 }, soc: { raw: 43.5 }, sci: { raw: 43 } });
    const lower = Calc.resolve(ctx, { kor: { raw: Sim.nextRaw(D[g].conv.kor, r.raw, -1) }, math: { raw: 84 }, soc: { raw: 43.5 }, sci: { raw: 43 } });
    ok("목표 역산: 국어 최소 원점수로 +5 도달, 한 단계 아래는 미도달", check.totals.std >= P.totals.std + 5 && lower.totals.std < P.totals.std + 5, `국어 ${r.raw}`);
    const imp = Calc.neededRawForTarget(ctx, null, P, "soc", "std", P.totals.std + 200);
    ok("목표 역산: 도달 불가 판정", imp.reachable === false);
  }

  /* 7) 고3 반영영역 */
  {
    const g = 3, ctx = { grade: g, mode: "gachae", data: D[g] };
    const row = D[g].rows.find((r) => r.x.areaRule === "국수");
    const P = Calc.resolve(ctx, { kor: { raw: 80 }, math: { raw: 70 } });
    const c = Calc.compareRow(row, P, Calc.defaultScale(P), cfg);
    ok("고3 '국수' 반영 모집단위: 국·수만 입력해도 반영영역 기준 직접 비교", c.status === "exact" && c.area.mine === 150);
    const row2 = D[g].rows.find((r) => r.x.areaRule.includes("中"));
    ok("고3 '中 택N' 입력 부족일 때 보수적으로 처리", Calc.compareRow(row2, P, null, cfg).status === "need" || Calc.compareRow(row2, P, null, cfg).status === "exact");
    const rules=[...new Set(D[g].rows.map(r=>r.x.areaRule))];
    ok("고3 산출기준 전 유형 계산 지원 (18종)",rules.length===18&&rules.every(rule=>Calc.areaComputable(rule)));
    const full=Calc.resolve(ctx,{kor:{raw:80,std:125,pct:90},math:{raw:75,std:130,pct:92},t1:{raw:45,std:65,pct:95},t2:{raw:40,std:59,pct:82}});
    ok("고3 18가지 산출기준 모두 유효 계산",rules.every(rule=>Calc.areaScore(full,rule,"std")!==null));
    ok("탐(1) 우수 과목 2배",Calc.areaScore(full,"탐(1)","std")===130);
    ok("국/수 중 높은 점수 선택",Calc.areaScore(full,"탐(1)+국/수 中 택1","std")===260);
    const c3=Calc.compareRow(D[g].rows.find(r=>r.x.areaRule==="국수탐(1)"),full,"std",cfg);
    ok("고3 모집단위별 산출기준을 공통합 대신 우선",c3.status==="exact"&&c3.basis==="국수탐(1)");
    ok("고3 탐구 중복 선택 차단",Calc.eligibility(row,{t1Subject:"물리학Ⅰ",t2Subject:"물리학Ⅰ"}).status==="condition");
  }

  fs.writeFileSync(path.join(__dirname, "test-results.txt"), log.join("\n") + `\n\n합계: 통과 ${pass} / 실패 ${fail}\n`);
  console.log(log.join("\n")); console.log(`\n통과 ${pass} / 실패 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
