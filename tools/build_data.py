# -*- coding: utf-8 -*-
"""
이투스 10월 학평 엑셀(원본) -> 웹앱 데이터 파일(data/grade1.js, grade2.js, grade3.js, metadata.js) 변환기
사용법:  python3 tools/build_data.py <원본폴더>
원본폴더에 이투스 파일을 원래 이름 그대로 넣으면 됩니다.
  (파일명에 '고1'+'지원참고표', '고1'+'한문제더', '고2'..., '고3'+'지원참고표' 가 들어 있으면 자동으로 찾음)
원본 값은 보정하지 않으며, 의심 항목은 data/validation.js 에 기록합니다.
"""
import sys, os, json, datetime, collections, warnings
warnings.filterwarnings("ignore")
import openpyxl
from openpyxl.utils import column_index_from_string as CI

SRC = sys.argv[1] if len(sys.argv) > 1 else "."

def find_file(short):
    """g1_ref.xlsx 같은 짧은 이름 또는 이투스 원래 파일명((이투스) 고1_10월_상위누적_지원참고표(가채점).xlsx 등)을 찾는다."""
    if os.path.exists(os.path.join(SRC, short)): return os.path.join(SRC, short)
    g = short[1]; kind = "한문제더" if "one" in short else "지원참고표"
    for f in sorted(os.listdir(SRC)):
        if f.startswith("~$"): continue
        if f"고{g}" in f and kind in f and f.lower().endswith((".xlsx", ".xlsm")): return os.path.join(SRC, f)
    raise FileNotFoundError(f"{SRC} 폴더에서 고{g} {kind} 파일을 찾지 못했습니다.")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
issues = []
def issue(grade, where, value, kind, status="원본 유지(보정 안 함)"):
    issues.append({"grade": grade, "where": where, "value": str(value), "type": kind, "status": status})

def num(v):
    if isinstance(v, bool): return None
    if isinstance(v, (int, float)): return v if not float(v).is_integer() else int(v)
    if isinstance(v, str):
        s = v.strip()
        try:
            f = float(s); return int(f) if f.is_integer() else f
        except: return None
    return None

def txt(v):
    if v is None: return ""
    if isinstance(v, float) and v.is_integer(): v = int(v)
    return str(v).strip()

def write_js(name, var, obj):
    p = os.path.join(OUT, name)
    with open(p, "w", encoding="utf-8") as f:
        f.write("/* 자동 생성 파일: tools/build_data.py — 직접 수정하지 마십시오 */\n")
        f.write("window.UDATA = window.UDATA || {};\nwindow.UDATA[%s] = " % json.dumps(var))
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("wrote", p, os.path.getsize(p))

# ---------------- 고1/고2 ----------------
def build_lower(g):
    ref = openpyxl.load_workbook(find_file(f"g{g}_ref.xlsx"), data_only=True)
    one = openpyxl.load_workbook(find_file(f"g{g}_one.xlsm"), data_only=False)
    # 1) 원표백등
    ws = ref["원표백등"]
    hdr = [ws.cell(3, c).value for c in range(1, 24)]
    subj_cols = []
    for c, h in enumerate(hdr, start=1):
        if h in ("국어", "수학", "통합사회", "통합과학"): subj_cols.append((h, c))
    keymap = {"국어": "kor", "수학": "math", "통합사회": "soc", "통합과학": "sci"}
    conv = {}
    stats = {}
    for name, c in subj_cols:
        rows = []
        for r in range(4, ws.max_row + 1):
            raw = ws.cell(r, c).value
            if isinstance(raw, str):
                if raw.strip() == "평균": stats.setdefault(keymap[name], {})["mean"] = num(ws.cell(r, c + 1).value)
                if raw.strip() == "표준편차": stats.setdefault(keymap[name], {})["sd"] = num(ws.cell(r, c + 1).value)
                continue
            if raw is None: continue
            vals = [num(ws.cell(r, c + k).value) for k in range(0, 5)]
            if None in vals: issue(g, f"원표백등 {name} {r}행", vals, "결측값"); continue
            rows.append(vals)
        # 단조성 검사
        for a, b in zip(rows, rows[1:]):
            if b[0] >= a[0]: issue(g, f"원표백등 {name} 원점수 {b[0]}", b, "원점수 정렬 이상")
            if b[1] > a[1]: issue(g, f"원표백등 {name} 원점수 {b[0]}", f"표준점수 {a[1]}→{b[1]}", "원점수가 낮은데 표준점수가 높음")
            if b[2] > a[2]: issue(g, f"원표백등 {name} 원점수 {b[0]}", f"백분위 {a[2]}→{b[2]}", "원점수가 낮은데 백분위가 높음")
            if b[3] < a[3]: issue(g, f"원표백등 {name} 원점수 {b[0]}", f"등급 {a[3]}→{b[3]}", "원점수가 낮은데 등급이 높음")
            if b[4] < a[4]: issue(g, f"원표백등 {name} 원점수 {b[0]}", f"상위누적 {a[4]}→{b[4]}", "원점수가 낮은데 상위누적이 작음(원본 그대로 사용)")
        conv[keymap[name]] = rows
    # 2) 등급컷
    ws = ref["등급컷"]
    cuts = []
    for r in range(6, 16):
        lab = txt(ws.cell(r, 2).value)
        vals = [num(ws.cell(r, c).value) for c in range(3, 15)]
        cuts.append([lab] + vals)
    for i, row in enumerate(cuts[1:], start=1):
        if row[0] != f"{i}등급":
            issue(g, f"등급컷 {6+i}행 등급 이름", row[0], f"표기 오류 의심(위치상 {i}등급)", "화면에는 위치 기준 등급으로 표시")
            row[0] = f"{i}등급"
    # 3) 상위누적
    ws = ref["상위누적"]
    top = [txt(ws.cell(3, c).value) for c in range(1, ws.max_column + 1)]
    sub = [txt(ws.cell(4, c).value) for c in range(1, ws.max_column + 1)]
    scale = None; colmap = {}
    sname = {"표준점수": "std", "백분위": "pct", "원점수": "raw"}
    cname = {"국수탐": "kms", "국탐": "ks", "수탐": "ms", "국수": "km"}
    for c in range(2, ws.max_column + 1):
        if top[c - 1] in sname: scale = sname[top[c - 1]]
        if sub[c - 1] in cname and scale: colmap[(scale, cname[sub[c - 1]])] = c
        elif sub[c - 1] == "" and any(ws.cell(r, c).value is not None for r in range(5, 50)):
            issue(g, f"상위누적 {openpyxl.utils.get_column_letter(c)}열", "제목 없음", "제목이 없는 열 — 의미 확인 불가하여 사용하지 않음", "제외")
    cum = {"pct_cum": []}
    for k in colmap: cum[k[0] + "_" + k[1]] = []
    for r in range(5, ws.max_row + 1):
        p = num(ws.cell(r, 1).value)
        if p is None: continue
        cum["pct_cum"].append(p)
        for k, c in colmap.items(): cum[k[0] + "_" + k[1]].append(num(ws.cell(r, c).value))
    # 4) 대학 자료
    ws = ref["대학지원가능점수"]
    base = ws.cell(7, 2).value
    rows = []
    for r in range(9, ws.max_row + 1):
        if ws.cell(r, 5).value is None: continue
        v = lambda L: ws.cell(r, CI(L)).value
        row = [txt(v("B")), txt(v("A")), txt(v("D")), txt(v("E")), txt(v("F")), txt(v("G")), txt(v("H")), txt(v("I")), txt(v("J")), txt(v("K")), num(v("L")), num(v("M")), num(v("N")), num(v("O"))]
        for i, L in ((11, "M"), (12, "N"), (13, "O")):
            if row[i] is None: issue(g, f"대학지원가능점수 {r}행 {L}열", v(L), "점수 결측")
        rows.append(row)
    ids = collections.Counter(r[0] for r in rows)
    for k, n in ids.items():
        if n > 1: issue(g, "모집단위 ID", k, "ID 중복")
    # 5) 한문제더 hidden sheet / 수식 확인 (구조만 기록)
    inp = one["입력용"]
    formulas = {k: inp[k].value for k in ("F6", "V5", "V6", "V7", "V8")}
    return {
        "grade": g, "rows": rows, "conv": conv, "convStats": stats, "gradeCut": cuts, "cum": cum,
        "baseDate": base.strftime("%Y-%m-%d") if isinstance(base, datetime.datetime) else txt(base),
        "excelFormulas": formulas,
    }

# ---------------- 고3 ----------------
def build_g3():
    ref = openpyxl.load_workbook(find_file("g3_ref.xlsx"), data_only=True)
    ws = ref["대학지원가능점수"]
    base = ws.cell(7, 3).value
    rows = []
    cols3 = ["id","code","region","univ","adm","group","field","subfield","unit","campus","quota","raw","std","pct",
             "stage","total","rSuneung","rHak","rInterview","rEtc","areaRule","aRaw","aStd","aPct","useScore","realCombo","tamCount",
             "wKor","wMath","wEng","wTam","wHis","mathSel","gStat","gCalc","gGeo","tamType","gSoc","gSci","note","minimum",
             "engRule","eng","engMin","hisRule","his","hisMin","compet"]
    for r in range(9, ws.max_row + 1):
        if ws.cell(r, 6).value is None: continue
        v = lambda L: ws.cell(r, CI(L)).value
        def nt(L):
            x = v(L); n = num(x)
            return n if n is not None else (txt(x) or None)
        eng = [num(v(L)) for L in ("AS","AT","AU","AV","AW","AX","AY","AZ","BA")]
        his = [num(v(L)) for L in ("BD","BE","BF","BG","BH","BI","BJ","BK","BL")]
        comp = v("BN")
        if comp == "_": comp = None
        if v("AJ") == "": issue(3, f"대학지원가능점수 {r}행 AJ열(확통 가산점)", "빈 문자열", "공백 문자 입력", "자료 없음 처리")
        row = [txt(v("C")), txt(v("B")), txt(v("E")), txt(v("F")), txt(v("G")), txt(v("H")), txt(v("I")), txt(v("J")), txt(v("K")), txt(v("L")), num(v("M")),
               num(v("X")), num(v("Y")), num(v("Z")),
               txt(v("N")), num(v("O")), nt("P"), nt("Q"), nt("R"), nt("S"), txt(v("T")), num(v("U")), num(v("V")), num(v("W")), txt(v("AA")), txt(v("AB")), num(v("AC")),
               nt("AD"), nt("AE"), nt("AF"), nt("AG"), nt("AH"), txt(v("AI")) or None, txt(v("AJ")) or None, txt(v("AK")) or None, txt(v("AL")) or None, txt(v("AM")) or None, txt(v("AN")) or None, txt(v("AO")) or None, txt(v("AP")) or None, txt(v("AQ")) or None,
               txt(v("AR")) or None, eng if any(x is not None for x in eng) else None, num(v("BB")), txt(v("BC")) or None, his if any(x is not None for x in his) else None, num(v("BM")), num(comp) if comp is not None else None]
        for i, L in ((11, "X"), (12, "Y"), (13, "Z")):
            if row[i] is None: issue(3, f"대학지원가능점수 {r}행 {L}열", v(L), "점수 결측")
        if row[24] == "" : issue(3, f"대학지원가능점수 {r}행 AA열", "", "수능활용점수 결측")
        rows.append(row)
    nbn = sum(1 for r in rows if r[-1] is None)
    issue(3, "대학지원가능점수 BN열(전년도 경쟁률)", f"'_' 등 {nbn}건", "자료 없음 표시", "자료 없음으로 표시")
    issue(3, "대학지원가능점수", "1단계 67건", "고1·고2 지원참고표에는 없는 단계별 모집 1단계 행(고3 전용)", "고3에서만 표시")
    return {"grade": 3, "cols": cols3, "rows": rows, "baseDate": base.strftime("%Y-%m-%d") if isinstance(base, datetime.datetime) else txt(base)}

g1 = build_lower(1); g2 = build_lower(2); g3 = build_g3()
issue(1, "한문제더 입력용 V5 수식(원점수합 상위누적)", g1["excelFormulas"]["V5"], "근사 VLOOKUP이 원점수 오름차순이 아닌 열(AB)을 참조 — 결과가 불안정할 수 있음", "웹앱은 상위누적 시트에서 '해당 점수 이하가 처음 나오는 행'으로 계산")
issue(2, "한문제더 입력용 V5 수식(원점수합 상위누적)", g2["excelFormulas"]["V5"], "근사 VLOOKUP이 원점수 오름차순이 아닌 열(AB)을 참조 — 결과가 불안정할 수 있음", "웹앱은 상위누적 시트에서 '해당 점수 이하가 처음 나오는 행'으로 계산")
for g in (1, 2):
    issue(g, "한문제더 입력용 V7 수식(백분위합 상위누적)", "VLOOKUP(...,AA열,근사)", "근사 VLOOKUP이 백분위 오름차순이 아닌 열(AA)을 참조 — 결과가 불안정할 수 있음", "웹앱은 상위누적 시트에서 '해당 점수 이하가 처음 나오는 행'으로 계산")
    issue(g, "한문제더 입력용 V6 수식(표점합 상위누적)", "VLOOKUP(...,0) 정확일치", "표의 범위(최저~최고) 밖이면 #N/A", "웹앱은 범위 밖이면 '자료 범위 밖'으로 표시")

META_COMMON = {"examYear": 2026, "examMonth": 10, "examName": "2026년 10월 전국연합학력평가",
               "source": "이투스 지원참고표(가채점)", "refAdmissionYear": 2027, "ruleVersion": "1.0.0"}
def meta(g, d, fn):
    target = {1: 2029, 2: 2028, 3: 2027}[g]
    return dict(META_COMMON, grade=g, mode="gachae", sourceFile=fn, baseDate=d["baseDate"],
                conversionVersion=(f"etoos-2026-10-g{g}-gachae" if g < 3 else None), targetAdmissionYear=target,
                validation="원본 대조 완료(자동 검사)", rowCount=len(d["rows"]))
g1["meta"] = meta(1, g1, "(이투스) 고1_10월_상위누적_지원참고표(가채점).xlsx / (이투스) 고1_10월_한문제더.xlsm")
g2["meta"] = meta(2, g2, "(이투스) 고2_10월_상위누적_지원참고표(가채점).xlsx / (이투스) 고2_10월_한문제더.xlsm")
g3["meta"] = meta(3, g3, "(이투스) 고3_10월_지원참고표(가채점).xlsx")
for d in (g1, g2): d.pop("excelFormulas")
write_js("grade1.js", "g1", g1); write_js("grade2.js", "g2", g2); write_js("grade3.js", "g3", g3)
write_js("validation.js", "validation", {"generated": datetime.date.today().isoformat(), "issues": issues})
print(len(issues), "issues")
for i in issues[:60]: print(i)
