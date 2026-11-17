/* 신청서 제출 → PDF 생성 사슬 검사 (데모 모드 · DB 미연결) — 2026-09-04 선미

   ★ 확인하는 것 셋:
     ① submitDonor() 가 신청서 PDF 를 만든다 (데모에서는 c.formPdf 에 메모리로 남는다)
     ② 개인정보 분리 — DB 로 가는 값(submissionPayload · submitFields)에 이름·주민번호·연락처·주소가 없고,
        PDF 데이터(donorFormPdfData)에는 있다
     ③ 데모에서는 PDF 실패가 담당자 화면(caseSaveErr)에 오르지 않는다 (콘솔에만)

   실제 Supabase 는 건드리지 않는다. 업로드·form_submission 은 sbReady()=false 로 건너뛴다.
   돌리는 법:  JSDOM_FROM=<jsdom 이 설치된 폴더> node smoke-test-pdf-submit.mjs [서명 PNG]
*/
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { appScripts } from './app-scripts.mjs';   /* 스크립트 목록은 index.html 에서 읽는다 — 손으로 베끼지 않는다 (2026-09-05 · 정본 ⑥) */
const APP = fileURLToPath(new URL('./', import.meta.url));
const require = createRequire(process.env.JSDOM_FROM
  ? process.env.JSDOM_FROM.replace(/\/?$/, '/') + 'package.json'
  : new URL('../prototype/package.json', import.meta.url));
const { JSDOM, VirtualConsole } = require('jsdom');

/* index.html 의 초기화 스크립트는 파일들을 아직 안 읽은 시점에 돌아 ReferenceError 를 낸다 — 기대된 잡음이라 끈다 */
/* ★ 2026-09-04 — `vc.sendTo()` 는 jsdom 24 에서 없어졌다. 여기 jsdom 은 29.1.1 이라
     이 줄에서 TypeError 로 죽었고, 두 검사가 **한 항목도 못 찍고** 있었다(연수 님 발견).
   ⚠️ 죽은 검사는 빨간 줄도 안 낸다 — 오늘만 세 번째다(smoke-test-silent · 여기 둘).
   대체는 forwardTo 다. `jsdomErrors:'none'` 이 예전 `omitJSDOMErrors:true` 자리다. */
const vc = new VirtualConsole(); vc.on('jsdomError', () => {}); vc.forwardTo(console, { jsdomErrors: 'none' });
const dom = new JSDOM(readFileSync(APP + 'index.html', 'utf8'),
  { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost:8788/', virtualConsole: vc });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function(){const n=()=>{};return{lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n};};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
/* 폰트·로고 fetch 를 디스크로 돌린다 (jsdom 에는 fetch 가 없다) */
window.fetch = (url) => {
  const p = APP + String(url).replace(/^\.?\//, '');
  try { const b = readFileSync(p); return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) }); }
  catch (e) { return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('no ' + p) }); }
};
/* 라이브러리는 브라우저처럼 전역으로 (loadPdfLibs 가 있으면 건너뛴다) — config.local.js 는 일부러 안 읽는다(데모) */
for (const f of appScripts({ vendor: true }))
  window.eval(readFileSync(APP + f, 'utf8'));

const W = window, DB = W.DB;
let fail = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✘ ') + msg); if (!cond) fail++; };

/* 접수 링크로 들어온 법인외 후원자 흉내 */
const c = DB.cases.find(x => x.donorType !== '법인') || DB.cases[0];
Object.assign(c, { donorType: '법인외', acqPath: '구매', state: '제출 대기', awaitingSubmit: true, paperIntake: false });
c.checklist = W.autoChecklist('법인외', '구매', true, DB.promptProfile);
DB.role = 'donor'; DB.screen = 'donorForm';
const f = DB.donorForm;
f.linkCaseId = c.id; f.donorType = '법인외'; f.path = '구매';
W.prefillDonor();
/* 서명 PNG — 인자로 주면 그 파일, 없으면 1×1 투명 PNG */
const sign = process.argv[2] ? readFileSync(process.argv[2]).toString('base64')
  : 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
f.signImg = 'data:image/png;base64,' + sign; f.signed = true;
f.under14 = true; f.guardian = true; f.guardianName = '김보호'; f.guardianPhone = '010-1111-2222'; f.guardianRelation = '모';
f.addr = '서울특별시 종로구 창경궁로 000 (가상)'; f.phone = '010-0000-0000';

console.log('① 제출 → PDF');
const errs = W.donorErrors(f);
ok(errs.length === 0, '제출 전 검증 통과' + (errs.length ? ' — ' + errs.join(' / ') : ''));
/* ★ 2026-09-06 — submitDonor 는 이제 **저장이 끝난 뒤에** 제출을 확정한다(링크 폐기·성공 표시).
     그래서 기다려야 한다. 동기로 읽으면 아직 안 정해진 값(null)을 본다. */
await W.submitDonor();
ok(f.submittedId === c.id, '제출 완료 (#' + f.submittedId + ')');
for (let i = 0; i < 100 && !c.formPdf; i++) await new Promise(r => setTimeout(r, 100));
ok(!!c.formPdf, '신청서 PDF 가 만들어짐' + (c.formPdf ? ' · ' + c.formPdf.bytes.length.toLocaleString() + ' bytes' : ' (10초 대기)'));
if (c.formPdf){
  const pages = (await W.PDFLib.PDFDocument.load(c.formPdf.bytes)).getPageCount();
  ok(pages >= 1, 'PDF 를 다시 읽을 수 있음 · ' + pages + '쪽');
}

console.log('② 개인정보 분리');
const pii = [f.donorName, f.rrn, f.phone, f.addr, f.guardianName, f.guardianPhone].filter(Boolean);
const toDb = JSON.stringify([W.submissionPayload(f, c, Number(f.qty), 0, 0), c.donation]);
const leaked = pii.filter(v => toDb.indexOf(v) >= 0);
ok(leaked.length === 0, 'DB 로 가는 값에 개인정보 없음' + (leaked.length ? ' — 샜다: ' + leaked.join(', ') : ''));
const d = W.donorFormPdfData(f, c);
ok(d.donorName === f.donorName && d.idNo === f.rrn && d.addr === f.addr && d.guardian && d.guardian.name === f.guardianName,
   'PDF 데이터에는 이름·주민번호·주소·법정대리인 있음');
ok(!!d.signImg, 'PDF 데이터에 서명 이미지 있음');

console.log('③ 데모 조용함');
ok(!(DB.caseSaveErr && DB.caseSaveErr[c.id]), '담당자 화면에 저장 실패가 오르지 않음');

/* ④ 기관 인수증 제출 → 인수증 PDF (2026-09-05) — 신청서와 같은 사슬. 데모라 c.orgReceiptPdf 에 메모리로 남는다.
     ★ 수령자명·서명은 DB 로 가는 payload 에 없고 PDF 데이터에만 있어야 한다 */
console.log('④ 기관 인수증 → PDF');
const co = DB.cases.find(x => (x.checklist || []).some(i => i.key === 'inss' && i.r.st === 'miss'));
ok(!!co, '인수증 미수취 데모 건이 있음' + (co ? ' (#' + co.id + ')' : ''));
if (co){
  /* 데모 건에는 배분처가 없다 — 실제 흐름(배분결정 → 기관 링크)대로 배분처 하나를 붙이고 인수증 항목을 그 기관 몫으로 묶는다 */
  if (!(co.dists || []).length){
    co.dists = [{ id:'sd1', orgName:'늘봄지역아동센터', qty:(co.donation && co.donation.qty) || 300, distDate:'2026-09-05', memo:'' }];
    co.checklist.filter(i => i.stage === '배분').forEach(i => { i.distId = 'sd1'; if (!i.uid) i.uid = i.key + '#sd1'; });
  }
  const d0 = co.dists[0];
  const KA = W.COL.accessLink;
  DB.linkEntry = { token:'t', link:{ [KA.distributionId]: d0.id }, state:'ok', caseId:co.id, distId:d0.id };
  DB.role = 'org'; DB.screen = 'orgForm';
  DB.orgForm = { linkCaseId:co.id, verified:true, verifyInput:'', verifyTries:0,
    receiverName:'박수령', recvQty:String((co.donation && co.donation.qty) || 300), recvPkg:'', recvDate:'2026-09-05',
    signed:true, signImg:'data:image/png;base64,' + sign, confirm:true, files:{}, submittedId:null };
  W.orgSlots(co).forEach(it => { if (it.key !== 'inss' && W.orgSlotRequired(it.key)) W.addOrgDemoFile(it.key); });
  let saved = null;
  const oSave = W.saveFormSubmission;
  W.saveFormSubmission = (c, o) => { if (o.formType === '인수증') saved = o; return oSave(c, o); };
  const oe = W.orgErrors(DB.orgForm, co);
  ok(oe.length === 0, '기관 제출 전 검증 통과' + (oe.length ? ' — ' + oe.join(' / ') : ''));
  W.submitOrg();
  ok(DB.orgForm.submittedId === co.id, '기관 제출 완료');
  for (let i = 0; i < 100 && !co.orgReceiptPdf; i++) await new Promise(r => setTimeout(r, 100));
  ok(!!co.orgReceiptPdf, '인수증 PDF 가 만들어짐' + (co.orgReceiptPdf ? ' · ' + co.orgReceiptPdf.bytes.length.toLocaleString() + ' bytes' : ' (10초 대기)'));
  if (co.orgReceiptPdf){
    const pg = (await W.PDFLib.PDFDocument.load(co.orgReceiptPdf.bytes)).getPageCount();
    ok(pg === 1, '인수증 PDF 1쪽');
  }
  ok(!!saved && saved.formType === '인수증' && saved.pdfKey === null, '제출본이 형식 "인수증" · pdf_key 빈칸으로 먼저 저장됨');
  const toDbOrg = JSON.stringify(saved && saved.payload);
  ok(toDbOrg.indexOf('박수령') < 0 && toDbOrg.indexOf('base64') < 0, 'DB 로 가는 인수증 payload 에 수령자명·서명 없음');
  ok(saved && saved.payload['기관명'] === d0.orgName, '기관명은 배분처 이름 (' + d0.orgName + ')');
  DB.role = 'staff';
  ok(/인수증 PDF 열기/.test(W.formPdfButtonsHtml(co, 'receipt', d0.id)), '담당자 화면에 [인수증 PDF 열기] 버튼');
  ok(W.formPdfButtonsHtml(co, 'application') === '' || !/인수증/.test(W.formPdfButtonsHtml(co, 'application')), '신청서 버튼 갈래에는 인수증이 섞이지 않음');
  W.URL.createObjectURL = () => 'blob:demo-rc';
  W.openFormPdf(co.id, 'fprdemo' + co.id);
  ok(DB.viewer && DB.viewer.ids[0] === 'fprdemo' + co.id, '뷰어가 인수증 PDF 로 열림');
  W.saveFormSubmission = oSave; DB.linkEntry = null;
}

console.log(fail ? '\n✘ 실패 ' + fail + '건' : '\n✔ 통과');
process.exit(fail ? 1 : 0);
