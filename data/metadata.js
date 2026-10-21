/*
 * 「대학까지 몇 점?」 설정 파일 (관리자용)
 * - 공식 성적표 모드를 켜려면 official.enabled 를 true 로 바꾸십시오.
 * - 공식 점수 대응표(선택)가 생기면 official.files 에 경로를 넣으십시오. (docs/UPDATE_GUIDE.md 참고)
 */
window.UDATA = window.UDATA || {};
window.UDATA.config = {
  appName: "대학까지 몇 점?",
  appVersion: "1.2.1",
  ruleVersion: "1.2.1",
  updatedAt: "2026-10-22",
  schoolName: "",                      // 보고서 머리글에 표시할 학교명(비워 두면 표시 안 함)
  datasets: {
    g1: { file: "data/grade1.js", label: "고1", target: 2029 },
    g2: { file: "data/grade2.js", label: "고2", target: 2028 },
    g3: { file: "data/grade3.js", label: "고3", target: 2027 }
  },
  gachae: { enabled: true, label: "가채점 원점수" },
  referenceVersion: "2026-10-22-gachae", // 공식 성적 입력과 배치표 개정판은 별개 관리
  official: {
    enabled: false,                    // ← 성적표 배부 후 true 로 변경
    label: "공식 성적표",
    pendingText: "공식 성적표 준비 중 — 성적표 배부 후 열립니다.",
    // 공식 점수 대응표(표준점수↔백분위↔등급). 없으면 학생이 입력한 값만 사용합니다.
    files: { g1: null, g2: null, g3: null }
  },
  // 근접 판정 규칙: |점수 차이| < near 이면 '근접'. 척도별로 지정
  nearRule: { raw: 3, std: 3, pct: 3 },
  compareMode: "auto", // auto|std|pct|common
  ranges: [5, 10, 15, 20],
  defaultRange: 10,
  pageSize: 30
};
