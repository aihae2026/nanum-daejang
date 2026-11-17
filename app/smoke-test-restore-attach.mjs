/* 새로고침하면 낸 서류가 사라진다 (2026-09-05 선미 실주행 · #217)

   ★ 무엇이 있었나
     후원자가 제출한 직후 담당자 화면은 항목마다 '확인필요 · 제출됨' 이었다.
     그런데 **새로고침하면 전부 '미수취 · 첨부 없음'** 이 됐다.
     콘솔에는 `[저장소] 첨부 21건을 되살렸습니다` 가 함께 찍혔다 —
     파일은 되살아났는데 **화면이 읽는 자리가 비어 있었다.**

     `restoreAttachments()` 는 `it.r.fileIds` 만 채웠다. 화면은 그 자리를 안 본다:
       · 수취 현황 행       → `it.r.file` (파일 이름)
       · 항목 상태(itemStatus) → `it.r.donorUpload` / `it.r.orgUpload`
     그래서 담당자는 "후원자가 안 냈다" 고 읽는다. 실제로는 냈고 파일도 저장소에 있다.
     (9/6 에 `#216` 으로 한 번, 9/5 에 `#217` 로 또 한 번 밟았다 — §14 M-4)

   ★ 그래서 넷을 본다 — 저장소에서 되살린 뒤
     ① 파일 이름이 항목에 붙는다 (`it.r.file`)
     ② 누가 냈는지가 붙는다 — `uploaded_by_role` 그대로 (donor / org)
     ③ 항목 상태가 '확인필요 · 제출됨' 이다 — **'수취완료' 로 만들지 않는다**(F2)
     ④ 담당자가 이미 수취 처리한 항목은 '수취완료' 그대로다 (되살리기가 확정을 덮지 않는다)
     ⑤ **신청서([S]) 도 같다** — 폼으로 냈으면 '확인필요 · 폼 제출' 이다.
        전에는 화면 위에 "신청서 PDF 열기" 가 떠 있는데 그 아래는 "미수취 상태입니다" 였다
        (`restoreFormPdfs` 가 PDF 만 되살리고 `it.r.formSubmit` 을 안 채웠다)

   ⚠️ 실 DB 없이 돈다 — `sbGet` 을 검사가 대신한다(저장소 응답을 흉내낸다).
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-restore-attach.mjs
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
const dom = new JSDOM(readFileSync(APP + 'index.html', 'utf8'),
  { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost:8788/' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function(){ const n=()=>{}; return {lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n}; };
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
for (const f of appScripts()) window.eval(readFileSync(APP + f, 'utf8'));

let fail = 0;
const check = (n, ok, got) => { console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got))); if (!ok) fail++; };

const A = window.COL.attachment;

/* 저장소에 파일이 있는 건 하나를 만든다 — DB 에서 막 읽어 온 모양 그대로.
   ★ r 은 DB 가 주는 것만 담는다: 상태는 '미수취', donorUpload·file 은 **없다**.
     되살리기가 그 자리를 채우는지가 이 검사의 전부다. */
const c = {id:'T217', dbId:9217, state:'검수 대기', donorType:'법인외', acqPath:'구매',
  donation:{itemName:'우산', qty:100, unitPrice:5000, book:500000, fair:500000, arriveDate:'2026-09-05'},
  checklist:[
    {dbId:7001, key:'proof_buy', n:'구매영수증 또는 매입세금계산서', kind:'A', included:true, r:{st:'miss'}},
    {dbId:7002, key:'photo',     n:'물품사진',                      kind:'A', included:true, r:{st:'miss'}},
    {dbId:7003, key:'inss',      n:'인수증',                        kind:'A', included:true, r:{st:'miss'}},
    /* 담당자가 이미 수취 처리한 항목 — 되살리기가 이걸 되돌리면 안 된다 */
    {dbId:7004, key:'appl_indiv', n:'물품기부신청서(법인 외용)',     kind:'A', included:true,
     r:{st:'done', date:'2026-09-05', by:'담당자'}}]};
window.DB.cases.push(c);

const ROWS = [
  {[A.id]:11, [A.checklistItemId]:7001, [A.fileName]:'영수증.png', [A.mimeType]:'image/png',
   [A.fileSize]:100, [A.storageKey]:'k1', [A.uploadedByRole]:'donor', [A.uploadedAt]:'2026-09-05T01:00:00Z'},
  {[A.id]:12, [A.checklistItemId]:7002, [A.fileName]:'사진1.jpg', [A.mimeType]:'image/jpeg',
   [A.fileSize]:200, [A.storageKey]:'k2', [A.uploadedByRole]:'donor', [A.uploadedAt]:'2026-09-05T01:00:00Z'},
  {[A.id]:13, [A.checklistItemId]:7002, [A.fileName]:'사진2.jpg', [A.mimeType]:'image/jpeg',
   [A.fileSize]:200, [A.storageKey]:'k3', [A.uploadedByRole]:'donor', [A.uploadedAt]:'2026-09-05T01:00:00Z'},
  {[A.id]:14, [A.checklistItemId]:7003, [A.fileName]:'인수증.pdf', [A.mimeType]:'application/pdf',
   [A.fileSize]:300, [A.storageKey]:'k4', [A.uploadedByRole]:'org',   [A.uploadedAt]:'2026-09-05T02:00:00Z'},
  {[A.id]:15, [A.checklistItemId]:7004, [A.fileName]:'신청서.pdf', [A.mimeType]:'application/pdf',
   [A.fileSize]:400, [A.storageKey]:'k5', [A.uploadedByRole]:'donor', [A.uploadedAt]:'2026-09-05T01:00:00Z'},
];

/* 저장소·서명 호출을 검사가 대신한다 — 이 검사가 보는 것은 **되살린 뒤 항목의 모양**이다 */
window.sbReady = () => true;
window.sbGet = () => Promise.resolve(ROWS);
window.signFile = () => Promise.resolve(null);
window.startUrlRefresh = () => {};

const n = await window.restoreAttachments(c);
console.log('\n[되살린 첨부 ' + n + '건]');
const item = (id) => c.checklist.find(it => it.dbId === id);

console.log('\n[① 파일 이름이 항목에 붙는다]');
check('★ 구매영수증 — 첨부 없음이 아니다', item(7001).r.file === '영수증.png', item(7001).r.file);
check('★ 물품사진 — 두 장 다 붙는다', item(7002).r.file === '사진1.jpg · 사진2.jpg', item(7002).r.file);
check('   fileIds 도 그대로 붙어 있다 (원문 보기가 쓰는 자리)',
  (item(7002).r.fileIds || []).length === 2, item(7002).r.fileIds);

console.log('\n[② 누가 냈는지가 붙는다 — uploaded_by_role 그대로]');
check('★ 후원자가 낸 것은 donorUpload', !!item(7001).r.donorUpload && !item(7001).r.orgUpload, item(7001).r);
check('★ 배분기관이 낸 것은 orgUpload', !!item(7003).r.orgUpload && !item(7003).r.donorUpload, item(7003).r);
check('   올린 날짜가 남는다', item(7001).r.donorUpload.date === '2026-09-05', item(7001).r.donorUpload);

console.log('\n[③ 상태가 확인필요다 — 수취완료로 만들지 않는다 (F2)]');
['구매영수증', '물품사진'].forEach((nm, i) => {
  const st = window.itemStatus(item(7001 + i));
  check(`★ ${nm} — 확인필요`, st.code === 'unc', st);
  check(`   ${nm} — 수취완료가 아니다 (담당자 확인이 남아 있다)`, st.status !== '수취완료', st.status);
});

console.log('\n[④ 담당자가 확정한 항목은 그대로다]');
const done = window.itemStatus(item(7004));
check('★ 이미 수취완료면 되살리기가 되돌리지 않는다', done.code === 'done', done);
check('   그 항목에도 파일 이름은 붙는다', item(7004).r.file === '신청서.pdf', item(7004).r.file);

console.log('\n[⑤ 신청서([S])도 되살아난다 — 폼으로 낸 것은 미수취가 아니다]');
/* 신청서는 파일이 아니라 **폼 자체**가 원본이라 attachment 가 없다.
   그 사실은 form_submission(신청서 PDF)에 있다 — 되살리기가 거기서 가져와야 한다. */
const cS = {id:'T218', dbId:9218, state:'검수 대기', donorType:'법인외', acqPath:'구매',
  donation:{itemName:'우산', qty:100, unitPrice:5000, book:500000, fair:500000, arriveDate:'2026-09-05'},
  checklist:[{dbId:7101, key:'appl_indiv', n:'물품기부신청서(법인 외용)', kind:'S', included:true, r:{st:'miss'}}]};
window.DB.cases.push(cS);
window.loadFormPdfs = () => Promise.resolve([
  {id:31, formType:'물품기부신청서(법인외)', pdfKey:'p1', submittedAt:'2026-09-05T05:31:00Z',
   role:'donor', signed:true, distId:null}]);
await window.restoreFormPdfs(cS);
const applItem = cS.checklist[0];
check('신청서 PDF 가 목록에 붙었다 (전제)', (cS.formPdfIds || []).length === 1, cS.formPdfIds);
check('★ 폼으로 냈다는 사실이 되살아난다', !!applItem.r.formSubmit, applItem.r);
const stS = window.itemStatus(applItem);
check('★ 미수취가 아니다', stS.code !== 'miss', stS);
/* ★ 폼으로 낸 신청서는 수취완료다 (선미 결정 2026-09-06).
     이 폼은 다 채우고 서명해야 제출 자체가 된다(donorErrors) — 받은 서류인 것이 이미 확실하다.
     ⚠️ 품목·가액이 타당한가는 없어지지 않았다 — 구매영수증의 AI 대조(E1)와 대조 판정이 본다. */
check('★ 수취완료다 (폼으로 냈으면 받은 것이다)', stS.code === 'done', stS);
check('   폼으로 작성했다고 적힌다', /폼으로 작성/.test(stS.meta || ''), stS.meta);
check('   전자서명 여부가 따라온다', applItem.r.formSubmit.signed === true, applItem.r.formSubmit);

/* 담당자가 이미 확정한 신청서는 되살리기가 되돌리지 않는다 */
const cS2 = JSON.parse(JSON.stringify(cS));
cS2.id = 'T219'; cS2.dbId = 9219; cS2.formPdfIds = [];
cS2.checklist[0].r = {st:'done', date:'2026-09-05', by:'담당자 원문 확인'};
window.DB.cases.push(cS2);
await window.restoreFormPdfs(cS2);
check('★ 이미 확정한 신청서는 수취완료 그대로', window.itemStatus(cS2.checklist[0]).code === 'done',
  window.itemStatus(cS2.checklist[0]));

console.log('\n[⑤\' 인수증도 되살아난다 — 배분 쪽에 같은 버그가 남아 있었다 (2026-09-07 · #225)]');
/* ★ 무엇이 있었나
     9/5 에 ⑤(신청서)를 고쳤는데 **인수증은 그대로 남았다.** 복원 필터가 세 겹으로 걸렀다 —
       ① formType 이 '인수증' 이라 /물품기부신청서/ 에 안 걸림
       ② distId 가 있어 `!p.distId` 에서 빠짐 (인수증은 배분처별)
       ③ kind 가 'A' 라 `it.kind !== 'S'` 에서 빠짐
     증상은 ⑤ 와 글자 그대로 같았다 — "인수증 PDF 열기 · 05:52" 가 화면 바로 위에 떠 있는데
     그 아래는 "미수취 상태입니다". 기관은 냈고 PDF 도 저장소에 있었다.
   ★ 신청서와 갈리는 지점 — 인수증은 **수취완료가 아니라 확인필요**다.
     "파일이 올라왔다 ≠ 그 서류를 받았다"(common.js:269) — 기관 제출분은 담당자가 확인한다. */
const cR = {id:'T225', dbId:9225, state:'검수 대기', donorType:'법인외', acqPath:'구매',
  donation:{itemName:'티켓', qty:28, unitPrice:65000, book:1820000, fair:1820000, arriveDate:'2026-09-07'},
  dists:[{id:19, orgName:'늘봄지역아동센터'}],
  checklist:[{dbId:7201, key:'inss', n:'인수증', kind:'A', included:true, distId:19, r:{st:'miss'}}]};
window.DB.cases.push(cR);
window.loadFormPdfs = () => Promise.resolve([
  {id:41, formType:'인수증', pdfKey:'r1', submittedAt:'2026-09-07T05:52:53Z',
   role:'org', signed:true, distId:19}]);
await window.restoreFormPdfs(cR);
const inss = cR.checklist[0];
check('인수증 PDF 가 목록에 붙었다 (전제)', (cR.formPdfIds || []).length === 1, cR.formPdfIds);
check('★★ 기관이 냈다는 사실이 되살아난다', !!inss.r.orgUpload, inss.r);
const stR = window.itemStatus(inss);
check('★★ 미수취가 아니다 (PDF 는 있는데 미수취이던 그 자리)', stR.code !== 'miss', stR);
check('★ 확인필요다 — 수취완료로 넘기지 않는다 (기관 제출분은 담당자가 확인한다)',
      stR.code === 'unc', stR);
check('   제출한 날짜가 따라온다', inss.r.orgUpload.date === '2026-09-07', inss.r.orgUpload);
/* ★ 이 줄이 요점이다 — 확인필요라야 담당자가 [수취] 한 번으로 confirmUpload 를 탄다.
     미수취면 confirmUpload 가 `itemStatus(it).code !== 'unc'` 에서 그냥 돌아간다(막힌 자리). */
check('★★ 담당자가 원클릭 수취할 수 있는 상태다 (orgUpload + unc)',
      inss.r.orgUpload.status === 'uploaded' && stR.code === 'unc', {up:inss.r.orgUpload, st:stR.code});

/* 기관마다 한 장이다 — 다른 기관 인수증이 내 항목을 채우면 안 된다 */
const cR2 = {id:'T226', dbId:9226, state:'검수 대기', donorType:'법인외', acqPath:'구매',
  donation:{itemName:'티켓', qty:28, unitPrice:65000, book:1820000, fair:1820000, arriveDate:'2026-09-07'},
  dists:[{id:19, orgName:'늘봄'}, {id:20, orgName:'복지관'}],
  checklist:[{dbId:7301, key:'inss', n:'인수증 · 늘봄', kind:'A', included:true, distId:19, r:{st:'miss'}},
             {dbId:7302, key:'inss', n:'인수증 · 복지관', kind:'A', included:true, distId:20, r:{st:'miss'}}]};
window.DB.cases.push(cR2);
window.loadFormPdfs = () => Promise.resolve([
  {id:42, formType:'인수증', pdfKey:'r2', submittedAt:'2026-09-07T06:00:00Z', role:'org', signed:true, distId:19}]);
await window.restoreFormPdfs(cR2);
check('★ 낸 기관 것만 채운다', !!cR2.checklist[0].r.orgUpload, cR2.checklist[0].r);
check('★★ 안 낸 기관은 그대로 미수취다 (셋이 다 확인필요로 서면 안 된다)',
      !cR2.checklist[1].r.orgUpload && window.itemStatus(cR2.checklist[1]).code === 'miss',
      window.itemStatus(cR2.checklist[1]));

/* 담당자가 이미 확정한 인수증은 되살리기가 되돌리지 않는다 */
const cR3 = JSON.parse(JSON.stringify(cR));
cR3.id = 'T227'; cR3.dbId = 9227; cR3.formPdfIds = [];
cR3.checklist[0].r = {st:'done', date:'2026-09-07', by:'담당자 확인'};
window.DB.cases.push(cR3);
await window.restoreFormPdfs(cR3);
check('★ 이미 확정한 인수증은 수취완료 그대로', window.itemStatus(cR3.checklist[0]).code === 'done',
  window.itemStatus(cR3.checklist[0]));

console.log('\n[⑥ 새로고침 뒤에도 AI 가 본다 — 조용히 건너뛰지 않는다]');
/* ★ 무엇이 있었나 (2026-09-05 선미 실주행 · #219)
     `restoreAttachments` 는 파일 바이트(blob)를 안 받는다 — 열지도 않을 파일을
     통째로 내려받지 않으려는 것이고 그 판단은 맞다. 그런데 `judgeableFileId` 가
     **blob 만** 봤다. 그래서 새로고침한 뒤 검수를 실행하면 판정 대상이 0건이 되고
     `judgeItemNow` 가 **아무 표시 없이 그냥 돌아갔다.**
     담당자는 "AI가 보고 아무 말 없다" 로 읽는다 — 사실은 보지도 않았다.
     (그날 신고 500,000원 · 영수증 335,000원 이었는데 금액 지적이 한 줄도 없었다)
   ⚠️ 이 검사는 실호출을 하지 않는다. 보는 것은 **판정 대상으로 세는가**와
     **못 받으면 화면에 세우는가** 둘이다. */
const recp = item(7001);      /* 구매영수증 — 저장소에서 되살린 첨부(blob 없음) */
check('되살린 첨부에는 바이트가 없다 (전제)', !window.FILES[(recp.r.fileIds || [])[0]].blob, '(blob 있음)');
check('★ 그래도 판정 대상이다 (저장소에서 받아올 수 있다)', !!window.judgeableFileId(recp),
  window.judgeableFileId(recp));
check('★ AI 고지가 "실제 판정" 으로 선다 (시뮬레이션이라고 말하지 않는다)',
  window.aiNotice(c) === window.AI_REAL_NOTICE, window.aiNotice(c));

/* ★ 받아온 파일에 **진짜 형식**이 붙어야 한다 (2026-09-06 · dev 에서 /judge 502).
     저장소는 Content-Type 을 application/octet-stream 으로 줄 수 있다. 그대로 두면
     shrinkForJudge 가 "이미지가 아니네" 하고 축소를 건너뛰어 원본 크기가 그대로 가고,
     모델에도 octet-stream 으로 보내진다. 형식은 우리가 안다(attachment.mime_type). */
const fidR = (recp.r.fileIds || [])[0];
const realFetch = window.fetch;
window.fetch = () => Promise.resolve({ok:true, blob: () => Promise.resolve(
  new window.Blob(['x'], {type:'application/octet-stream'}))});
window.sbSignedUrl = () => Promise.resolve('https://example.invalid/x');
const got = await window.ensureBlob(fidR);
window.fetch = realFetch;
check('★ 저장소가 octet-stream 을 줘도 원래 형식을 붙인다',
  !!got && got.type === 'image/png', got && got.type);
delete window.FILES[fidR].blob;   /* 아래 검사를 위해 되돌린다 */
window.FILES[fidR].blob = null;

/* 저장소에서 못 받는 경우 — 조용히 넘어가지 않고 화면에 세운다 */
window.ensureBlob = () => Promise.resolve(null);
await window.judgeItemNow(c, recp);
check('★ 못 받으면 판정 실패로 남는다 (조용히 넘어가지 않는다)',
  !!recp.r.aiJudge && recp.r.aiJudge.state === 'error', recp.r.aiJudge);
check('   담당자가 무엇을 할지 적혀 있다',
  /다시 판정/.test((recp.r.aiJudge || {}).error || ''), (recp.r.aiJudge || {}).error);
check('   그래도 수취 상태는 안 건드린다 (AI 는 의견만 낸다)', recp.r.st !== 'done', recp.r.st);

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 새로고침해도 낸 서류가 그대로 보인다');
process.exit(fail ? 1 : 0);
