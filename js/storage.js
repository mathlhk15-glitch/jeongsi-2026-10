/* =========================================================
 * storage.js — 입력 상태 관리
 * - 기본: 화면을 닫으면 사라지는 메모리 저장
 * - 사용자가 '이 기기에 기억하기'를 켠 경우에만 localStorage 에 저장
 * - 가채점/공식 성적표, 학년별 입력은 서로 다른 칸에 따로 보관
 * - 주소(URL)에는 성적을 절대 넣지 않음
 * ========================================================= */
(function (global) {
  "use strict";
  const KEY = "daehak-myeot-jeom.v1";
  const CONSENT = "daehak-myeot-jeom.remember";
  const BOOKMARKS = "daehak-myeot-jeom.bookmarks.v2";

  function blank() {
    return {
      grade: 3, mode: "gachae", scale: "auto", range: 10, tab: "near",
      inputs: { g1: { gachae: {}, official: {} }, g2: { gachae: {}, official: {} }, g3: { gachae: {}, official: {} } },
      choices: { g3: { gachae: { mathSel: "", t1Type: "", t2Type: "" }, official: { mathSel: "", t1Type: "", t2Type: "" } } },
      hope: { univs: [], depts: [], fields: [], regions: [], logic: "or", related: true },
      filter: { regions: [], groups: [], fields: [], adm: "", text: "", showStage1: false },
      sort: "near",
      favorites: { g1: [], g2: [], g3: [] },      // [{id, memo}]
      combos: { g1: {}, g2: {}, g3: {} },          // {가:id, 나:id, 다:id}
      target: { g1: null, g2: null, g3: null },
      scenarios: { g1: { gachae: [], official: [] }, g2: { gachae: [], official: [] }, g3: { gachae: [], official: [] } },
      savedSearches: [],
      memo: "",
      studentName: "",
      officialPreview: false
    };
  }

  const St = {};
  St.state = blank();
  St.remember = false;

  function persistentCopy(s) {
    const copy = JSON.parse(JSON.stringify(s));
    delete copy.studentName; // 이름은 이 기기 기억하기 대상에서 제외
    return copy;
  }

  function merge(base, saved) {
    if (!saved || typeof saved !== "object") return base;
    for (const k of Object.keys(base)) {
      if (!(k in saved)) continue;
      if (base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) base[k] = merge(base[k], saved[k]);
      else base[k] = saved[k];
    }
    return base;
  }

  St.load = function () {
    try { St.remember = localStorage.getItem(CONSENT) === "1"; } catch (e) { St.remember = false; }
    try {
      const f = JSON.parse(localStorage.getItem(BOOKMARKS) || "null");
      if (f && typeof f === "object") {const safe={};for(const g of ["g1","g2","g3"])safe[g]=(Array.isArray(f[g])?f[g]:[]).map(x=>({id:x.id,memo:St.remember?x.memo||"":""}));St.state.favorites=merge(St.state.favorites,safe);}
    } catch(e) {}
    if (!St.remember) return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) St.state = merge(blank(), JSON.parse(raw));
      St.state.studentName = ""; // 구버전에서 저장된 이름도 복원하지 않음
    } catch (e) { /* 저장소를 쓸 수 없는 환경: 메모리만 사용 */ }
  };
  let timer = null;
  St.save = function () {
    try { localStorage.setItem(BOOKMARKS, JSON.stringify(Object.fromEntries(["g1","g2","g3"].map(g=>[g,(St.state.favorites[g]||[]).map(x=>St.remember?x:{id:x.id})])))); } catch(e) {}
    if (!St.remember) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(persistentCopy(St.state))); } catch (e) { /* 무시 */ }
    }, 250);
  };
  St.setRemember = function (on) {
    St.remember = !!on;
    try {
      if (on) { localStorage.setItem(CONSENT, "1"); localStorage.setItem(KEY, JSON.stringify(persistentCopy(St.state))); }
      else { localStorage.removeItem(CONSENT); localStorage.removeItem(KEY); }
    } catch (e) { /* 무시 */ }
  };
  /* 모든 입력값 지우기 (공용 PC용) */
  St.wipe = function () {
    St.state = blank();
    try { localStorage.removeItem(KEY); localStorage.removeItem(CONSENT); localStorage.removeItem(BOOKMARKS); } catch (e) { /* 무시 */ }
    St.remember = false;
  };
  St.blank = blank;
  St.inputs = function (g, mode) {
    const s = St.state;
    g = g || s.grade; mode = mode || s.mode;
    return s.inputs["g" + g][mode];
  };
  St.choices = function (g, mode) {
    const s = St.state;
    g = g || s.grade; mode = mode || s.mode;
    if (!s.choices["g" + g]) s.choices["g" + g] = { gachae: {}, official: {} };
    return s.choices["g" + g][mode];
  };

  global.Store = St;
})(window);
