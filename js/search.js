/* =========================================================
 * search.js — 데이터 불러오기, 모집단위 정규화, 검색·필터·정렬
 * ========================================================= */
(function (global) {
  "use strict";
  const S = {};
  const cache = {};

  /* 데이터 파일(script)을 필요할 때 불러온다. file:// 에서도 동작한다. */
  S.loadScript = function (src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src + (src.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(global.UDATA.config.appVersion); el.async = true;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(src + " 파일을 불러오지 못했습니다."));
      document.head.appendChild(el);
    });
  };

  S.loadGrade = async function (g) {
    if (cache[g]) return cache[g];
    const cfg = global.UDATA.config;
    const key = "g" + g;
    if (!global.UDATA[key]) await S.loadScript(cfg.datasets[key].file);
    const raw = global.UDATA[key];
    const D = { grade: g, meta: raw.meta, conv: raw.conv || null, cum: raw.cum || null, gradeCut: raw.gradeCut || null, convStats: raw.convStats || null };
    D.rows = g === 3 ? normalize3(raw) : normalizeLower(raw);
    D.byId = new Map(D.rows.map((r) => [r.id, r]));
    D.univs = [...new Set(D.rows.map((r) => r.univ))].sort((a, b) => a.localeCompare(b, "ko"));
    D.regions = [...new Set(D.rows.map((r) => r.region))].sort((a, b) => a.localeCompare(b, "ko"));
    D.fields = [...new Set(D.rows.map((r) => r.field))].filter(Boolean);
    D.subfields = [...new Set(D.rows.map((r) => r.subfield))].filter(Boolean).sort((a, b) => a.localeCompare(b, "ko"));
    // 공식 대응표(있을 때만)
    const of = cfg.official.files && cfg.official.files[key];
    if (of) {
      try { await S.loadScript(of); D.official = global.UDATA[key + "_official"] || null; } catch (e) { D.official = null; }
    }
    cache[g] = D;
    return D;
  };

  function normalizeLower(raw) {
    // [id, code, region, univ, adm, group, field, subfield, unit, campus, quota, raw, std, pct]
    return raw.rows.map((a) => ({
      id: a[0], code: a[1], region: a[2], univ: a[3], adm: a[4], group: a[5], field: a[6], subfield: a[7], unit: a[8], campus: a[9],
      quota: a[10], ref: { raw: a[11], std: a[12], pct: a[13] }, x: null
    }));
  }
  function normalize3(raw) {
    const ix = {}; raw.cols.forEach((c, i) => (ix[c] = i));
    return raw.rows.map((a) => {
      const g = (k) => a[ix[k]];
      return {
        id: g("id"), code: g("code"), region: g("region"), univ: g("univ"), adm: g("adm"), group: g("group"), field: g("field"), subfield: g("subfield"),
        unit: g("unit"), campus: g("campus"), quota: g("quota"), ref: { raw: g("raw"), std: g("std"), pct: g("pct") },
        x: {
          stage: g("stage"), total: g("total"), ratio: { suneung: g("rSuneung"), hak: g("rHak"), interview: g("rInterview"), etc: g("rEtc") },
          areaRule: g("areaRule"), area: { raw: g("aRaw"), std: g("aStd"), pct: g("aPct") }, useScore: g("useScore"), realCombo: g("realCombo"), tamCount: g("tamCount"),
          w: { kor: g("wKor"), math: g("wMath"), eng: g("wEng"), tam: g("wTam"), his: g("wHis") }, mathSel: g("mathSel"),
          gasan: { stat: g("gStat"), calc: g("gCalc"), geo: g("gGeo"), soc: g("gSoc"), sci: g("gSci") }, tamType: g("tamType"), note: g("note"), minimum: g("minimum"),
          engRule: g("engRule"), eng: g("eng"), engMin: g("engMin"), hisRule: g("hisRule"), his: g("his"), hisMin: g("hisMin"), compet: g("compet")
        }
      };
    });
  }

  /* ---------- 학과 유사어 ---------- */
  S.SYNONYMS = [
    ["컴퓨터", "소프트웨어", "SW", "인공지능", "AI", "데이터", "정보보호", "정보통신", "전산", "사이버", "보안", "IT", "게임"],
    ["전자", "전기", "반도체", "통신", "디스플레이", "로봇", "시스템", "임베디드"],
    ["기계", "자동차", "항공", "우주", "모빌리티", "로봇", "메카트로닉스", "조선"],
    ["화학", "화공", "신소재", "재료", "고분자", "에너지", "배터리", "이차전지"],
    ["생명", "바이오", "의생명", "분자", "유전", "식품", "제약"],
    ["의예", "의학", "치의예", "한의예", "수의예", "약학"],
    ["간호", "보건", "물리치료", "작업치료", "임상병리", "방사선", "치위생", "응급구조", "재활"],
    ["경영", "경제", "회계", "세무", "무역", "금융", "재무", "경상", "상경", "통상"],
    ["행정", "정치", "외교", "법", "공공", "경찰", "사회과학"],
    ["미디어", "언론", "신문방송", "커뮤니케이션", "광고", "홍보", "콘텐츠"],
    ["교육", "교대", "초등", "유아", "특수"],
    ["심리", "상담", "아동", "복지", "가족"],
    ["건축", "토목", "건설", "도시", "환경", "조경", "부동산"],
    ["수학", "통계", "빅데이터", "수리", "데이터사이언스"],
    ["물리", "천문", "지구", "해양", "대기", "지질"],
    ["영어", "영문", "영미"],
    ["중국", "중문", "일본", "일어", "독일", "프랑스", "스페인", "러시아", "아랍", "베트남", "어문", "통번역"],
    ["국어", "국문", "문예", "문학", "창작"],
    ["역사", "사학", "고고", "철학", "윤리", "인문"],
    ["디자인", "미술", "공예", "패션", "의상", "시각"],
    ["체육", "스포츠", "운동", "레저"],
    ["관광", "호텔", "외식", "조리", "항공서비스"],
    ["자유전공", "자율전공", "광역", "계열", "통합모집", "무전공"]
  ];
  S.related = function (kw) {
    const k = kw.trim().toLowerCase();
    if (!k) return [];
    const set = new Set();
    for (const grp of S.SYNONYMS) {
      if (grp.some((w) => w.toLowerCase().includes(k) || k.includes(w.toLowerCase()))) grp.forEach((w) => set.add(w));
    }
    set.delete(kw.trim());
    return [...set];
  };

  /* 희망 조건 일치 여부. 반환: null(불일치) 또는 {kind:'name'|'related', why:[...]} */
  const UNIV_ALIASES={"경상대":"경상국립대","서울과기대":"서울과학기술대","고대":"고려대","연대":"연세대"};
  S.matchHope = function (row, hope) {
    const conds = [];
    const why = [];
    let kind = "name";
    if (hope.univs && hope.univs.length) {
      const ok = hope.univs.some(u=>row.univ.includes(UNIV_ALIASES[u]||u));
      conds.push(ok); if (ok) why.push("대학");
    }
    if (hope.depts && hope.depts.length) {
      const name = (row.unit || "").toLowerCase();
      let ok = hope.depts.some((d) => name.includes(d.toLowerCase()));
      if (!ok && hope.related) {
        const rel = hope.depts.flatMap((d) => S.related(d)).filter(w => w.length > 1);
        if (rel.some((w) => name.includes(w.toLowerCase()) || (row.subfield || "").toLowerCase().includes(w.toLowerCase()))) { ok = true; kind = "related"; }
      }
      conds.push(ok); if (ok) why.push(kind === "related" ? "관련 분야" : "학과명");
    }
    if (hope.fields && hope.fields.length) {
      const ok = hope.fields.includes(row.field) || hope.fields.includes(row.subfield);
      conds.push(ok); if (ok) why.push("계열");
    }
    if (!conds.length) return null;
    const hit = hope.logic === "and" ? conds.every(Boolean) : conds.some(Boolean);
    return hit ? { kind, why } : null;
  };
  S.hasHope = (h) => !!(h && ((h.univs && h.univs.length) || (h.depts && h.depts.length) || (h.fields && h.fields.length)));

  /* 공통 필터 */
  S.passFilter = function (row, f) {
    if (!f) return true;
    if (!f.showStage1 && row.x && row.x.stage === "1단계") return false;
    if (f.regions && f.regions.length && !f.regions.includes(row.region)) return false;
    if (f.groups && f.groups.length && !f.groups.includes(row.group)) return false;
    if (f.fields && f.fields.length && !f.fields.includes(row.field)) return false;
    if (f.adm && !(row.adm || "").includes(f.adm)) return false;
    if (f.text) {
      const t = f.text.trim().toLowerCase();
      if (t && !(`${row.univ} ${row.unit} ${row.adm} ${row.subfield} ${row.campus}`.toLowerCase().includes(t))) return false;
    }
    return true;
  };

  S.SORTS = {
    near: { label: "내 점수와 가까운 순" },
    refDesc: { label: "기준점수 높은 순" },
    refAsc: { label: "기준점수 낮은 순" },
    univ: { label: "대학명순" },
    unit: { label: "학과명순" },
    quota: { label: "모집인원 많은 순" }
  };
  S.sort = function (items, how, scale) {
    const ko = (a, b) => (a || "").localeCompare(b || "", "ko");
    const ref = (it) => (it.cmp.ref == null ? -Infinity : it.cmp.ref);
    const fns = {
      near: (a, b) => (a.cmp.diff == null) - (b.cmp.diff == null) || Math.abs(a.cmp.diff ?? 0) - Math.abs(b.cmp.diff ?? 0) || ref(b) - ref(a) || ko(a.row.univ, b.row.univ),
      refDesc: (a, b) => ref(b) - ref(a) || ko(a.row.univ, b.row.univ) || ko(a.row.unit, b.row.unit),
      refAsc: (a, b) => ref(a) - ref(b) || ko(a.row.univ, b.row.univ) || ko(a.row.unit, b.row.unit),
      univ: (a, b) => ko(a.row.univ, b.row.univ) || ko(a.row.unit, b.row.unit),
      unit: (a, b) => ko(a.row.unit, b.row.unit) || ko(a.row.univ, b.row.univ),
      quota: (a, b) => (b.row.quota || 0) - (a.row.quota || 0) || ko(a.row.univ, b.row.univ)
    };
    return items.sort(fns[how] || fns.near);
  };

  /* 탭 A: 내 점수 주변 (|차이| ≤ 범위, 경계 포함) */
  S.near = function (D, prof, scale, range, filter, cfg) {
    if (!scale) return [];
    const out = [];
    for (const row of D.rows) {
      if (!S.passFilter(row, filter)) continue;
      const cmp = global.Calc.compareRow(row, prof, scale, cfg);
      const common = D.grade === 3 ? global.Calc.compareRow(row, prof, scale, {...cfg,compareMode:"common"}) : cmp;
      if (common.status === "exact" && Math.abs(common.diff) <= range + 1e-9) out.push({ row, cmp });
    }
    return out;
  };
  /* 탭 B: 희망 조건 전체 (점수 범위로 제외하지 않음) */
  S.hope = function (D, prof, scale, hope, filter, cfg) {
    const out = [];
    if (!S.hasHope(hope)) return out;
    for (const row of D.rows) {
      if (hope.regions && hope.regions.length && !hope.regions.includes(row.region)) continue;
      if (!S.passFilter(row, filter)) continue;
      const m = S.matchHope(row, hope);
      if (!m) continue;
      out.push({ row, cmp: global.Calc.compareRow(row, prof, scale, cfg), match: m });
    }
    return out;
  };

  global.Search = S;
})(window);
