const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..'), w={};w.window=w;
const ctx={window:w,console};vm.createContext(ctx);
for(const f of ['data/metadata.js','data/grade3.js','js/calculator.js','js/search.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx);
const C=w.Calc; const P={grade:3,subj:{kor:{raw:85,std:125,pct:95},math:{raw:78,std:120,pct:91},t1:{raw:40,std:61,pct:85},t2:{raw:35,std:57,pct:80}},totals:{raw:238,std:363,pct:268.5}};
const checks={
  '탐1 백분위 배수 적용 안함': C.areaScore(P,'탐(1)','pct')===85,
  '국수탐1 백분위 상한 300': C.areaScore(P,'국수탐(1)','pct')===271,
  '탐1 표준점수 2배': C.areaScore(P,'탐(1)','std')===122,
  '국수탐1 표준점수': C.areaScore(P,'국수탐(1)','std')===367,
  '고3 소수점 원점수 거부': C.resolve({grade:3,mode:'gachae',data:{conv:{}}},{kor:{raw:80.5}}).errors.length>0,
  '공통 비교 분리': C.compareRow({ref:{raw:230,std:360,pct:260},x:{areaRule:'탐(1)',area:{raw:40,std:120,pct:85}}},P,'pct',{compareMode:'common'}).basis==='공통 국수탐(2)',
  '영역별 비교 분리': C.compareRow({ref:{raw:230,std:360,pct:260},x:{areaRule:'탐(1)',area:{raw:40,std:120,pct:84},useScore:'백분위'}},P,'pct',{}).diff===1,
};
let failures=0;for(const [k,v] of Object.entries(checks)){console.log((v?'PASS ':'FAIL ')+k);if(!v)failures++;}process.exitCode=failures?1:0;
