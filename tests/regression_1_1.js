/* v1.1 신규 회귀 검사: node tests/regression_1_1.js */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'); const ctx={window:{},console};ctx.window.window=ctx.window;vm.createContext(ctx);
for(const f of ['data/metadata.js','data/grade1.js','data/grade2.js','data/grade3.js','js/calculator.js','js/search.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
(async()=>{
const {Calc,Search,UDATA}=ctx.window;let checks=0;
function test(label,fn){fn();checks++;console.log('PASS',label)}
const d1=await Search.loadGrade(1),d3=await Search.loadGrade(3);
test('고3 국수탐 원점수 정수 입력',()=>{for(const s of Calc.subjects(3))assert.strictEqual(s.rawStep,1)});
test('고1 통합사회·과학 원래 0.5점 단위 유지',()=>{for(const s of Calc.subjects(1).slice(2))assert.strictEqual(s.rawStep,0.5)});
test('고3 1단계 기본 숨김, 선택 가능',()=>{const r=d3.rows.find(x=>x.x&&x.x.stage==='1단계');assert(r);const f={regions:[],groups:[],fields:[],adm:'',text:'',showStage1:false};assert(!Search.passFilter(r,f));f.showStage1=true;assert(Search.passFilter(r,f))});
test('지역인재 전형 필터',()=>{const f={regions:[],groups:[],fields:[],adm:'지역인재',text:''};const rows=d3.rows.filter(r=>Search.passFilter(r,f));assert(rows.every(r=>r.adm.includes('지역인재'))); });
test('부분 공식 성적 입력에서 모르는 값 자동 생성 금지',()=>{const P=Calc.resolve({grade:3,mode:'official',data:d3,official:null},{kor:{std:124},math:{pct:91},t1:{grade:2}});assert.strictEqual(P.subj.kor.std,124);assert.strictEqual(P.subj.kor.pct,null);assert.strictEqual(P.subj.math.std,null);assert.strictEqual(P.totals.std,null)});
test('고1 가채점 데이터와 등급컷/평균 자료 존재',()=>{assert(d1.gradeCut.length>0);assert(d1.convStats.kor.mean>0)});
test('학과 유사어 정보 단독 오탐 제거',()=>{assert(!Search.SYNONYMS[0].includes('정보'));assert(Search.SYNONYMS[0].includes('정보보호'))});
test('앱 버전 갱신',()=>assert(UDATA.config.appVersion.startsWith('1.2')));
console.log(`신규 회귀 검사 ${checks}건 통과`);
})().catch(e=>{console.error(e);process.exit(1)});
