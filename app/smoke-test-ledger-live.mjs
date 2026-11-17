/* 원장 저장 — 실 DB 확인 (2026-09-02 유진 · 연수 지적분)

   ★ 왜 필요한가 (연수 지적) — 단위 검사(smoke-test-ledger)는 sbPost 를 갈아끼운다.
     그리고 화면 데모 건은 c.dbId 가 없어 {ok:true, demo:true} 로 통과한다.
     즉 **실 DB 저장 경로를 아무도 본 적이 없었다.**
     "테스트가 초록인데 거짓일 수 있다"(인수인계 §2④)가 정확히 이 자리다.

   ★ [2026-09-02 15:5x] distribution insert 도 확인한다 —
     선미가 **버려도 되는 건 #901**(생수 2L 300개)을 실 DB 에 넣어 주었다(seed-e3-verify).
     그 전에는 못 했다. RLS 에 delete 정책이 없어 한 번 넣으면 못 지우고,
     시연용 건(#101 등)에 넣으면 E7(배분 합계 = 접수 수량) 대조가 틀어지기 때문이다.
     ⚠️ **#901 에만 넣는다.** 다른 건에는 절대 넣지 않는다.
     ⚠️ 넣은 행은 지워지지 않는다 — 돌릴 때마다 #901 의 배분처가 는다.
        그래서 **이미 있으면 넣지 않는다**(smoke-test-zip 과 같은 방식).

   실 DB 에 쓴다 — donation.state 를 바꿨다가 **반드시 되돌린다.**
   돌리는 법:  node smoke-test-ledger-live.mjs   (JSDOM_FROM 은 아래 require 참조)
*/
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';   /* ⚠️ .pathname 은 한글 폴더를 %ED… 로 인코딩해 파일을 못 찾는다 (2026-09-05 집 PC 실측) */
import { appScripts } from './app-scripts.mjs';
import { staffLogin } from './test-staff-login.mjs';   /* 권한 3단계부터 담당자 동선 검사는 로그인해서 본다 (2026-09-08 승희) */   /* 스크립트 목록은 index.html 에서 읽는다 — 손으로 베끼지 않는다 (2026-09-05 · 정본 ⑥) */
const require = createRequire(process.env.JSDOM_FROM
  ? process.env.JSDOM_FROM.replace(/\/?$/, '/') + 'package.json'
  : new URL('../prototype/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const APP = fileURLToPath(new URL('./', import.meta.url));
const dom = new JSDOM(readFileSync(APP+'index.html','utf8'),
  {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost:8788/'});
const {window} = dom;
window.HTMLCanvasElement.prototype.getContext=function(){const n=()=>{};return{lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n};};
window.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,S';
window.fetch=(u,o)=>fetch(u,o);
process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';
for (const f of appScripts({ config: true }))
  window.eval(readFileSync(APP+f,'utf8'));
window.eval('setBodyRole = function(){}; render = function(){};');

let fail=0; const check=(n,ok,got)=>{console.log((ok?'  ✅ ':'  ❌ ')+n+(ok?'':'   ← '+JSON.stringify(got))); if(!ok)fail++;};

await staffLogin(window, { what: 'smoke-test-ledger-live.mjs' });   /* anon 은 링크 없이는 0건 — 담당자로 읽는다 */
await window.loadCasesFromSupabase();
const c = window.DB.cases.find(x => x.dbId);
console.log('\n대상: 실 DB 건 #' + c.id + ' (dbId ' + c.dbId + ') · 현재 상태 "' + c.state + '"');
const before = c.state;

console.log('\n[① donation PATCH — 실제로 값이 바뀌는가]');
let r = await window.saveDonationFields(c, {state:'완결'}).catch(e => ({err:e.message}));
check('★ 저장이 성공한다 (RLS 아래에서 update 가 통한다)', r && r.ok === true, r);
check('돌아온 행에 값이 실제로 남았다', r && r.row && r.row.state === '완결', r && r.row);

console.log('\n[② 다시 읽어서 확인 — 상태코드 말고 실제 값]');
await window.loadCasesFromSupabase();
const again = window.DB.cases.find(x => x.dbId === c.dbId);
check('★ 다시 읽어도 완결이다 (진짜 남았다)', again.state === '완결', again.state);

console.log('\n[③ 원래대로 되돌린다]');
r = await window.saveDonationFields(again, {state:before}).catch(e => ({err:e.message}));
check('되돌리기 성공', r && r.ok === true, r);
await window.loadCasesFromSupabase();
check('★ 원래 상태로 복구됐다 — 실 DB 를 어지르지 않았다',
      window.DB.cases.find(x=>x.dbId===c.dbId).state === before, before);

console.log('\n[③-2 ★★ 접수 경로가 실 DB 제약을 통과하는가 — 여기서 400 이 났다]');
/* 2026-09-03 연수 실주행이 잡았다 — saveDonationFields 가 화면 문장을 그대로 보내
   donation_submitted_via_check 에 걸렸다(HTTP 400 / 23514).
   그 실패 하나가 뒤의 저장 셋(체크리스트·제출본·첨부)을 통째로 데려갔다.
   ★ jsdom 검사로는 못 잡는다 — PATCH 를 실제로 보내지 않아 제약이 안 걸린다.
     "검사 8종이 전부 초록인데 실 DB 는 400" 이 그래서 나왔다. 이 자리는 실 DB 로만 지킨다. */
const target = window.DB.cases.find(x => x.dbId === c.dbId);
const viaBefore = target.submittedVia;
r = await window.saveDonationFields(target, {submittedVia:'접수 링크 제출(온라인 신청서)'})
      .catch(e => ({err:e.message}));
check('★★ 화면 문장으로 저장해도 400 이 나지 않는다 (경계에서 분류로 바꾼다)',
      r && r.ok === true, r);
check('★ DB 에는 분류로 남는다', r && r.row && r.row.submitted_via === '링크 제출',
      r && r.row && r.row.submitted_via);
r = await window.saveDonationFields(target, {submittedVia:viaBefore}).catch(e => ({err:e.message}));
await window.loadCasesFromSupabase();
check('★ 원래 값으로 되돌렸다 — 실 DB 를 어지르지 않았다',
      window.DB.cases.find(x => x.dbId === c.dbId).submittedVia === viaBefore, viaBefore);

console.log('\n[④ ★ 배분처를 실 DB 에 넣는다 — 버려도 되는 건 #901 에만]');
const c901 = window.DB.cases.find(x => String(x.id) === '901');
if (!c901 || !c901.dbId){
  console.log('  ⏭ #901 이 실 DB 에 없습니다 — seed-e3-verify-20260902.sql 을 먼저 실행하세요');
} else {
  const ORG = '검사용기관_지우지마세요';
  const has = (c901.dists || []).some(d => (d.org_name || d.orgName) === ORG);
  if (has){
    console.log('  ↻ 이미 넣어둔 검사용 배분처가 있습니다 — 새로 넣지 않습니다 (행이 늘지 않게)');
    check('★ 저장된 배분처가 되살아난다', (c901.dists || []).length >= 1, (c901.dists||[]).length);
    const d = (c901.dists || []).find(x => (x.org_name || x.orgName) === ORG);
    check('★ 낱개 수량이 남아 있다 (E7 대조 기준)', Number(d.qty) === 10, d.qty);
  } else {
    const before = (c901.dists || []).length;
    r = await window.saveDistribution(c901, {id:'sd99', orgName:ORG, qty:10,
                                             distDate:'2026-09-02', memo:'실 DB 확인용 · 지우지 마세요'})
          .catch(e => ({err:e.message}));
    check('★★ 배분처 insert 가 실 DB 에서 통한다 (오늘까지 아무도 못 본 경로)',
          r && r.ok === true, r);
    check('★ 화면 임시 id(sd99)가 DB PK 로 바뀐다', typeof r.id === 'number', r.id);

    /* 다시 읽어 확인 — 상태코드가 아니라 실제 행으로 */
    await window.loadCasesFromSupabase();
    const again = window.DB.cases.find(x => String(x.id) === '901');
    check('★ 다시 읽으면 배분처가 늘어 있다 (진짜 저장이다)',
          (again.dists || []).length === before + 1, (again.dists||[]).length);
    const saved = (again.dists || []).find(x => (x.org_name || x.orgName) === ORG);
    check('기관명이 그대로다', !!saved, again.dists);
    check('★ 낱개 수량이 그대로다 (E7 이 이 값으로 대조한다)', saved && Number(saved.qty) === 10, saved && saved.qty);
    check('★ 남은 수량이 줄어든다 (300 - 10 = 290)',
          window.distRemainingQty(again) === 290, window.distRemainingQty(again));
  }
  console.log('\n  ⚠️ 이 행은 지울 수 없습니다 (RLS 에 delete 정책 없음).');
  console.log('     #901 은 버려도 되는 건이라 남아 있어도 시연에 영향이 없습니다.');
}

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과');
process.exit(fail?1:0);
