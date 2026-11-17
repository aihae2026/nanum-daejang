/* 제출이 실패했을 때 **거짓말하지 않는가** (2026-09-06 · #214·#215 실주행)

   ★ 무엇이 있었나
     저장 결과를 기다리지 않고 링크를 폐기하고 "접수되었습니다" 를 띄웠다. 그래서
       · 후원자는 냈다고 믿고 떠나고   · 링크는 죽어 다시 낼 수 없고
       · 담당자는 이름·물품·수량이 빈 건을 받았다
     실패는 DB.caseSaveErr(= **후원자 브라우저 메모리**)에만 남아 담당자는 영영 못 봤다.

   ★ 그래서 셋을 본다
     ① 제출 내용 저장이 실패하면 — 링크를 폐기하지 않는다 · 제출을 완료로 만들지 않는다 ·
        "접수되었습니다" 라고 말하지 않는다 · 후원자에게 사실대로 말한다
     ② 성공하면 예전과 똑같이 — 링크 폐기 · submittedId · 완료 화면
     ③ 쓰기 함수가 **조용히 성공** 이라고 하지 않는다
        (실서비스에서 dbId 가 없으면 실패로 알린다. 데모는 저장할 DB 가 없으니 성공이 맞다)

   데모 데이터로 돈다 — 서버·DB 불필요.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-submit-safety.mjs
*/
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';   /* ⚠️ .pathname 은 한글 폴더를 %ED… 로 인코딩해 파일을 못 찾는다 */
import { appScripts } from './app-scripts.mjs';

const require = createRequire(process.env.JSDOM_FROM
  ? process.env.JSDOM_FROM.replace(/\/?$/, '/') + 'package.json'
  : new URL('../prototype/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const APP = fileURLToPath(new URL('./', import.meta.url));

let fail = 0;
const check = (n, ok, got) => { console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got))); if (!ok) fail++; };

/* 제출을 한 번 돌린다. failFields=true 면 '제출 내용' 저장만 실패시킨다 */
async function run(failFields){
  const dom = new JSDOM(readFileSync(APP + 'index.html', 'utf8'),
    { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost:8788/' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = function(){ const n=()=>{}; return {lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n}; };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
  for (const f of appScripts()) window.eval(readFileSync(APP + f, 'utf8'));

  /* 실제로 터졌던 오류를 그대로 흉내 낸다 */
  if (failFields) window.saveDonationFields = () => Promise.reject(
    new Error('HTTP 400 - {"code":"23514","message":"violates check constraint \\"donation_qty_matches_received\\""}'));

  let linkClosed = false;
  window.markAccessLinkUsed = function(){ linkClosed = true; return Promise.resolve({ok:true}); };

  Object.assign(window.DB.req, {donorType:'법인외', path:'구매', donorName:'김초록',
    phone:'010-1234-1234', channel:'copy', verifyLast4:'1234'});
  window.sendLink();
  const id = window.DB.req.caseId;
  /* 링크로 들어온 상태를 만든다 — closeLinkAfterSubmit 이 이 값을 본다 */
  window.DB.linkEntry = {caseId:id, link:{[window.COL.accessLink.id]:'link-1'}, state:'ok'};

  const f = window.DB.donorForm;
  f.linkCaseId = id;
  Object.assign(f, {donorType:'법인외', path:'구매', donorName:'김초록', donDate:'2026-09-05',
    addr:'서울시 중구 무교로 20', phone:'01012341234', wantsReceipt:true, rrn:'910216-1234213',
    purpose:'지역아동 생필품 지원', itemName:'우산', qty:'100', pkg:'5박스', unitSale:'5000',
    signed:true, signImg:'data:image/png;base64,S',
    agreePurpose:true, agreeDouble:true, privacyTransfer:true, corpAck:true, privacy:true});
  ['proof_buy','photo'].forEach(k => { f.files[k] = ['demo:' + k]; });

  await window.submitDonor();
  return {window, id, f, linkClosed, toast: window.DB.toast, screen: window.DB.screen};
}

console.log('\n[① 저장이 실패하면 — 거짓 성공도, 링크 폐기도 없다]');
{
  const r = await run(true);
  check('★ 링크를 폐기하지 않는다 (후원자가 다시 낼 수 있다)', r.linkClosed === false, r.linkClosed);
  check('★ 제출을 완료로 만들지 않는다 (submittedId 없음)', !r.f.submittedId, r.f.submittedId);
  check('★ 완료 화면으로 넘기지 않는다', r.screen !== 'donorDone', r.screen);
  const msg = (r.toast && r.toast.msg) || '';
  check('★ "접수되었습니다" 라고 말하지 않는다', !/접수되었습니다/.test(msg), msg);
  check('  후원자에게 사실대로 말한다', /저장되지 않았습니다/.test(msg), msg);
  check('  다시 시도할 길을 알려준다', /다시/.test(msg), msg);
  check('  실패 사유가 담긴다', /23514|constraint|400/.test((r.toast && r.toast.cap) || ''), r.toast && r.toast.cap);
  check('  버튼 잠금이 풀린다 (다시 누를 수 있다)', r.window.DB.donorSubmitting === false, r.window.DB.donorSubmitting);
  check('  담당자에게도 남는다 (caseSaveErr)', !!(r.window.DB.caseSaveErr || {})[r.id], Object.keys(r.window.DB.caseSaveErr || {}));
}

console.log('\n[② 저장이 되면 — 예전과 똑같이 완료된다]');
{
  const r = await run(false);
  check('링크를 폐기한다', r.linkClosed === true, r.linkClosed);
  check('제출이 완료로 확정된다', r.f.submittedId === r.id, r.f.submittedId);
  check('완료 화면으로 넘어간다', r.screen === 'donorDone', r.screen);
  check('접수번호를 알려준다', /접수되었습니다/.test((r.toast && r.toast.msg) || ''), r.toast && r.toast.msg);
  check('버튼 잠금이 풀린다', r.window.DB.donorSubmitting === false, r.window.DB.donorSubmitting);
}

console.log('\n[③ 쓰기 함수가 조용히 성공이라고 하지 않는다]');
{
  const r = await run(false);
  const W = r.window;
  /* 데모(DB 미연결) — 저장할 DB 가 없으니 성공이 맞다 */
  const demo = await W.saveDonationFields({id:'x'}, {qty:1});
  check('데모에서는 성공 (저장할 DB 가 없다)', demo && demo.ok === true && demo.demo === true, demo);

  /* 실서비스인데 dbId 가 없다 — 예전에는 여기서도 ok:true 를 줬다 */
  W.sbReady = () => true;
  const names = ['saveDonationFields','saveFormSubmission','saveChecklist',
                 'saveItemStatus','saveDistribution','saveFindingResolution'];
  for (const n of names){
    let threw = null;
    try { await W[n]({id:'x'}, 'E2', '사유', '담당자'); } catch(e){ threw = e; }
    check('  ' + n + ' 이 실패로 알린다',
      !!threw && /dbId 없음/.test(threw.message), threw ? threw.message : '(성공이라고 답함)');
  }
}

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 실패했을 때 거짓말하지 않는다');
process.exit(fail ? 1 : 0);
