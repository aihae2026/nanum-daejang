/* 신청서 PDF 왕복 실측 — 2026-09-05 선미

   후원자 제출 → 제출본(pdf_key 빈칸) → PDF 만들기 → Storage forms/ 올리기 → pdf_key 채우기
   → **새로고침** → 담당자 목록 되살리기 → [신청서 PDF 열기](pdf.view 기록 → 서명 주소 → 뷰어)
   → 내려받아 바이트 대조 → ZIP 목록.

   ★ 왜 있나 — 9/4 에 만든 PDF 사슬은 조각 검사(smoke-test-pdf-*)와 실제 브라우저의 '부품 미리받기' 까지만
     봤다. **실 Supabase 에 진짜로 올라가고 담당자가 진짜로 여는지** 본 기록이 없었다.
     e2e-test-live·roundtrip-test-live 는 PDF 를 안 본다. 이 파일이 그 빈칸이다.

   ⚠️ 실제 Supabase 에 진짜로 올린다. 검사용 건 **#901** 만 쓴다(roundtrip-test-live 와 같은 규칙 · 9/2 선미 ④안).
     찍히는 개인정보는 전부 가상 값이다(prefillDonor 의 900101-1234567 · 데모 주소).
   ⚠️ 돌릴 때마다 쌓인다 — forms/{건}/ 에 PDF 한 장, form_submission 한 줄, audit_log(pdf.view) 두 줄.
     지우지 않는다(anon 삭제는 9/7 RLS 재작업 때 닫힌다 — 검사가 삭제에 기대면 그날 죽는다).
   ★ submitDonor() 를 통째로 부르지 않는다 — 그러면 #901 의 donation 값·체크리스트까지 픽스처로 덮어쓴다.
     대신 submitDonor 의 ①②(saveFormSubmission → runDonorFormPdf)를 **같은 함수·같은 순서**로 부른다.
     화면 쪽 안내(donorPdfOk/Fail)는 여기서 보지 않는다 — smoke-test-silent ⑱ 이 본다.

   돌리는 법:  JSDOM_FROM=<jsdom 29 가 설치된 폴더> node roundtrip-test-pdf-live.mjs
     config.local.js 에 실제 URL·anon 키가 있어야 한다. 없으면 **빨갛게** 멈춘다(조용히 초록이 되지 않는다).
*/
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { appScripts } from './app-scripts.mjs';
import { staffLogin } from './test-staff-login.mjs';   /* 권한 3단계부터 담당자 동선 검사는 로그인해서 본다 (2026-09-08 승희) */   /* 스크립트 목록은 index.html 에서 읽는다 — 손으로 베끼지 않는다 (2026-09-05 · 정본 ⑥) */
const APP = fileURLToPath(new URL('./', import.meta.url));
const require = createRequire(process.env.JSDOM_FROM
  ? process.env.JSDOM_FROM.replace(/\/?$/, '/') + 'package.json'
  : new URL('../prototype/package.json', import.meta.url));
const { JSDOM, VirtualConsole } = require('jsdom');

const vc = new VirtualConsole(); vc.on('jsdomError', () => {}); vc.forwardTo(console, { jsdomErrors: 'none' });
const ORIGIN = 'http://localhost:8788/';
const dom = new JSDOM(readFileSync(APP + 'index.html', 'utf8'),
  { runScripts: 'dangerously', pretendToBeVisual: true, url: ORIGIN, virtualConsole: vc });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function(){const n=()=>{};return{lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n};};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
window.URL.createObjectURL = () => 'blob:x';   /* jsdom 에 없다 — 뷰어가 부른다 */
/* 상대 주소(폰트·로고)는 디스크에서, 절대 주소(Supabase)는 진짜 네트워크로 */
window.fetch = (u, o) => {
  const s = String(u);
  if (/^https?:/.test(s) && !s.startsWith(ORIGIN)) return fetch(s, o);
  const p = APP + s.replace(ORIGIN, '').replace(/^\.?\//, '');
  try { const b = readFileSync(p); return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) }); }
  catch (e) { return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('no ' + p) }); }
};
/* ⚠️ Blob 은 jsdom 것이 아니라 Node 것을 쓴다 — jsdom Blob 을 Node fetch 에 넘기면 '[object Blob]' 13바이트로
   뭉개져 올라가고 업로드는 200 이라 **초록으로 거짓 통과한다**(roundtrip-test-live 2026-09-01 실측).
   그래서 아래 ④ 에서 바이트를 대조한다. */
window.Blob = Blob;
/* 라이브러리는 브라우저처럼 전역으로(loadPdfLibs 가 있으면 건너뛴다). config.local.js 를 **읽는다** — 여기가 실측이다. */
for (const f of appScripts({ vendor: true, config: true }))
  window.eval(readFileSync(APP + f, 'utf8'));

const W = window, DB = W.DB;
let fail = 0;
const check = (n, ok, got) => { console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got))); if (!ok) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!W.sbReady()){
  console.log('❌ config.local.js 에 실제 Supabase URL·anon 키가 없습니다 — app/config.local.js 의 두 값을 채우세요.');
  process.exit(1);
}

await staffLogin(W, { what: 'roundtrip-test-pdf-live.mjs' });   /* anon 은 링크 없이는 0건 — 담당자로 읽는다 */
await W.loadCasesFromSupabase();
const TESTBED = '901';
const c = DB.cases.find(x => String(x.id) === TESTBED && x.dbId);
if (!c){
  console.log('\n⏭ 건너뜁니다 — 검사용 건 #' + TESTBED + ' 이(가) 실 DB 에 없습니다 (seed-e3-verify-20260902.sql).');
  console.log('   ⚠️ 시연 건에 올리지 않습니다 — 주민번호가 든 PDF 가 시연 건의 제출본 자리를 차지합니다.');
  process.exit(0);
}
console.log(`\n대상: 건 ${c.id} (dbId ${c.dbId}) · 이미 있는 신청서 PDF ${(c.formPdfIds || []).length}장`);

/* 접수 링크로 들어온 법인외 후원자 흉내 (smoke-test-pdf-submit 와 같은 준비 · 화면 값만, DB 에 안 쓴다) */
c.donorType = '법인외'; c.acqPath = '구매';
DB.role = 'donor'; DB.screen = 'donorForm';
const f = DB.donorForm; f.linkCaseId = c.id; f.donorType = '법인외'; f.path = '구매';
W.prefillDonor();
/* 서명 — 캔버스 스텁이 준 'S' 는 PNG 가 아니라 pdf-lib 이 못 넣는다. 1×1 투명 PNG 로 바꾼다 */
f.signImg = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='; f.signed = true;
f.wantsReceipt = true;   /* 주민번호 칸이 열린다 — PDF 에만 찍히는지 ④ 에서 본다 */
const pdfData = W.donorFormPdfData(f, c, { submittedAt: new Date().toISOString() });
const payload = W.submissionPayload(f, c, Number(f.qty), 0, 0);
check('DB 로 가는 제출본(payload)에 주민번호·주소가 없다', JSON.stringify(payload).indexOf(f.rrn) < 0 && JSON.stringify(payload).indexOf(f.addr) < 0, payload);
check('PDF 데이터에는 있다', pdfData.idNo === f.rrn && pdfData.addr === f.addr && !!pdfData.signImg);

/* 사슬 안쪽을 엿본다 — 전역 함수라 바꿔 끼우면 runDonorFormPdf 가 이쪽을 부른다 */
let bytesUp = null, attachArgs = null;
const oUpload = W.uploadFormPdf, oAttach = W.attachFormPdfKey;
W.uploadFormPdf = (cc, b) => { bytesUp = b; return oUpload(cc, b); };
W.attachFormPdfKey = (id, k) => { attachArgs = [id, k]; return oAttach(id, k); };
const K = W.COL.formSubmission, TF = W.T.formSubmission;
const readRow = id => W.sbGet(TF, 'select=' + [K.id, K.pdfKey, K.formType, K.submitterRole].join(',') + '&' + K.id + '=eq.' + id).then(r => r[0]);

console.log('\n[① 제출본 먼저 — 주소 칸은 빈칸]');
const jobForm = W.saveFormSubmission(c, { formType: '물품기부신청서(' + pdfData.formType + ')', payload, signed: true, role: 'donor', pdfKey: null })
  .catch(err => { console.log('   제출본 저장 실패: ' + err.message); return null; });
const form = await jobForm;
check('★ 제출본 줄이 생겼다', form && form.id, form);
if (!form || !form.id){ console.log('\n❌ 제출본이 없어 PDF 는 올리지 않는다 — 여기서 멈춘다'); process.exit(1); }
console.log('   제출본 id: ' + form.id);
const row0 = await readRow(form.id);
check('★ 이 시점에 pdf_key 는 빈칸이다 (제출본이 PDF 를 기다리지 않는다)', row0 && row0[K.pdfKey] === null, row0);

console.log('\n[② PDF 만들기 → forms/ 올리기 → 빈칸 채우기]');
DB.donorPdf = { state: 'working', caseId: c.id, data: pdfData, formId: null, msg: '' };
const t0 = Date.now();
let r = null, chainErr = null;
try { r = await W.runDonorFormPdf(c, pdfData, Promise.resolve(form)); } catch (e) { chainErr = e; }
const took = (Date.now() - t0) / 1000;
check('★ 사슬이 끝났다 (' + took.toFixed(1) + '초)', r && r.ok === true && !chainErr, chainErr && chainErr.message);
if (chainErr){ console.log('\n❌ ' + chainErr.stack); process.exit(1); }
check('시한(' + W.PDF_WAIT_MS / 1000 + '초) 안이다 — 넘으면 후원자가 "안 됐다" 안내를 본다', took * 1000 < W.PDF_WAIT_MS, took);
check('만든 것이 PDF 다 (%PDF 로 시작 · ' + (bytesUp ? bytesUp.length.toLocaleString() : '?') + ' bytes)',
      bytesUp && String.fromCharCode(...bytesUp.slice(0, 4)) === '%PDF');
const pdfKey = attachArgs && attachArgs[1];
check('★ 경로가 forms/<이 건>/<uuid>.pdf 다', pdfKey && new RegExp('^forms/' + c.dbId + '/[0-9a-f-]{36}\\.pdf$').test(pdfKey), pdfKey);
check('★ 이름·상호가 경로에 없다', pdfKey && !/온누리|즉석밥|법인외/.test(pdfKey), pdfKey);
check('제출본 id 로 채웠다', attachArgs && attachArgs[0] === form.id, attachArgs);
const row1 = await readRow(form.id);
check('★ DB 의 pdf_key 가 그 경로다', row1 && row1[K.pdfKey] === pdfKey, row1);

console.log('\n[②-2 이미 값이 있는 칸은 못 덮는다 — pdf_key=is.null 조건]');
let guarded = null;
try { await oAttach(form.id, 'forms/' + c.dbId + '/00000000-0000-4000-8000-000000000000.pdf'); guarded = false; }
catch (e) { guarded = e.message; }
check('★ 두 번째 채우기는 실패로 돌아온다', typeof guarded === 'string', guarded);
const row2 = await readRow(form.id);
check('값이 그대로다', row2 && row2[K.pdfKey] === pdfKey, row2);

console.log('\n[③ 새로고침 — 담당자 화면이 처음부터 다시 읽는다]');
W.FILES = {}; DB.cases = []; DB.donorPdf = null;
await W.loadCasesFromSupabase();   /* 안에서 restoreFormPdfs 를 부른다 (db.js 1571) */
const c2 = DB.cases.find(x => x.dbId === c.dbId);
const fid = 'fp' + form.id;
check('★ 새로고침해도 신청서 PDF 가 목록에 있다', c2 && (c2.formPdfIds || []).includes(fid), c2 && c2.formPdfIds);
const m = W.FILES[fid];
check('storageKey 가 pdf_key 와 같다', m && m.storageKey === pdfKey, m);
check('★ 주소를 미리 받아 두지 않는다 (기록 없이 열리는 주소가 떠 있으면 안 된다)', m && !m.url && m.blob === null, m && m.url);
DB.role = 'staff'; DB.screen = 'case'; DB.caseId = c2.id;
const btn = W.formPdfButtonsHtml(c2);
check('담당자 화면에 [신청서 PDF] 버튼이 나온다', btn.indexOf(fid) >= 0 && /openFormPdf/.test(btn), btn.slice(0, 200));
check('"신청서 원본 없음" 경고는 안 뜬다', !/어디에도 저장되지 않았습니다/.test(btn));

console.log('\n[④ 담당자가 연다 — 기록(pdf.view) → 주소 → 뷰어 → 진짜 파일]');
const A = W.COL.auditLog;
const countViews = () => W.sbGet(W.T.auditLog, 'select=' + A.id + '&' + A.action + '=eq.pdf.view&' + A.targetType + '=eq.form_submission&' + A.targetId + '=eq.' + form.id).then(r => r.length);
let before = null;
try { before = await countViews(); } catch (e) { console.log('   ⚠️ audit_log 를 anon 으로 읽을 수 없어 기록 수는 못 센다 — ' + e.message); }
W.openFormPdf(c2.id, fid);
for (let i = 0; i < 300 && DB.pdfBusy; i++) await sleep(100);
check('★ 뷰어가 열렸다', DB.viewer && DB.viewer.ids && DB.viewer.ids[0] === fid, DB.toast);
check('서명 주소를 받았다 (10분 만료)', m.url && /token=/.test(m.url) && m.urlExpiresAt > Date.now(), m.url);
/* ⚠️ audit_log 는 '넣기 전용'이다(읽기 정책 없음 — patch-20260907-rls-stage2·close-anon-delete).
   그래서 정상 설치본에서는 담당자도 기록 수를 0 으로 읽는다. 그 경우 셀 수 없음을 밝히고,
   '기록이 실패하면 뷰어를 열지 않는다'(db.js logPdfView → openFormPdf)는 약속으로 갈음한다 —
   위 「뷰어가 열렸다」가 곧 기록 insert 성공이다. (2026-11-10 빈 프로젝트 설치 시험에서 확인) */
let auditUnreadable = false;
if (before !== null){
  const after = await countViews();
  if (before === 0 && after === 0){
    auditUnreadable = true;
    console.log('  ⏭ 열람 기록 수는 셀 수 없습니다 — audit_log 는 넣기 전용(읽기 정책 없음). 뷰어가 열린 것 = 기록 성공(기록 실패 시 열지 않음)');
  } else {
    check('★ 열람 기록(pdf.view)이 한 줄 늘었다', after === before + 1, { before, after });
  }
}
const res = await fetch(m.url);
check('★ 그 주소로 진짜 PDF 가 내려온다', res.ok, res.status);
const got = Buffer.from(await res.arrayBuffer());
check('★ 올린 PDF 와 바이트가 같다', bytesUp && got.length === bytesUp.length && got.equals(Buffer.from(bytesUp)), { 올림: bytesUp && bytesUp.length, 받음: got.length });
/* ⚠️ 창 안의 pdf-lib 은 Node Buffer 를 못 알아본다(다른 realm 의 Uint8Array) — 창의 Uint8Array 로 감싼다. 첫 실행에서 0쪽으로 빨갛게 났던 자리다 */
let pages = 0, loadErr = '';
try { pages = (await W.PDFLib.PDFDocument.load(new W.Uint8Array(got))).getPageCount(); } catch (e) { loadErr = e.message; }
check('내려온 것을 pdf-lib 으로 다시 읽을 수 있다 (' + pages + '쪽)', pages >= 1, loadErr);

console.log('\n[④-2 다시 열면 기록이 또 남는다 — 열 때마다 한 줄]');
W.closeViewer();
W.openFormPdf(c2.id, fid);
for (let i = 0; i < 300 && DB.pdfBusy; i++) await sleep(100);
check('두 번째도 열린다', DB.viewer && DB.viewer.ids && DB.viewer.ids[0] === fid, DB.toast);
if (before !== null && !auditUnreadable){
  const after2 = await countViews();
  check('★ 기록이 두 줄이 됐다', after2 === before + 2, { before, after2 });
}

console.log('\n[⑤ ZIP 에 담긴다]');
const pdfs = await W.loadFormPdfs(c2);
check('loadFormPdfs 가 이 제출본을 준다', pdfs.some(p => p.id === form.id && p.pdfKey === pdfKey), pdfs.map(p => p.id));
const entries = W.caseZipEntries(c2, pdfs);
const ze = entries.find(e => e.meta && e.meta.storageKey === pdfKey);
check('★ ZIP 목록에 신청서 PDF 가 들어간다', !!ze, entries.map(e => e.name));
check('ZIP 안 이름이 <건>_물품기부신청서(법인외).pdf 꼴이다', ze && new RegExp('^' + c2.id + '_물품기부신청서.*\\.pdf$').test(ze.name), ze && ze.name);

console.log('\n[⑥ 인수증 PDF — 같은 사슬을 기관 제출본으로 (2026-09-05)]');
/* 기관이 폼으로 쓴 인수증도 form_submission('인수증') → PDF → forms/ → pdf_key 를 탄다. 갈래(신청서/인수증)가 섞이지 않는지까지 본다 */
const fo = { receiverName:'박수령(검사)', recvQty:'400', recvPkg:'', recvDate:'2026-09-05', signed:true,
  signImg:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' };
const rcData = W.orgReceiptPdfData(fo, c2, { submittedAt:new Date().toISOString(), distId:null, org:'검사용 배분처' });
const rcForm = await W.saveFormSubmission(c2, { formType:'인수증', distId:null, payload:{ '품목':rcData.item, '수량':400, '기관명':'검사용 배분처' }, signed:true, role:'org', pdfKey:null })
  .catch(err => { console.log('   인수증 제출본 저장 실패: ' + err.message); return null; });
check('★ 인수증 제출본 줄이 생겼다', rcForm && rcForm.id, rcForm);
let rcKey = null, rcErr = null;
attachArgs = null;
try { await W.runDonorFormPdf(c2, rcData, Promise.resolve(rcForm), { make:W.createOrgReceiptPdf, demoKey:'orgReceiptPdf', name:'인수증', label:'인수증 PDF', who:'기관' }); rcKey = attachArgs && attachArgs[1]; }
catch (e) { rcErr = e; }
check('★ 인수증 PDF 가 올라가고 pdf_key 가 채워졌다', !rcErr && rcKey && new RegExp('^forms/' + c.dbId + '/[0-9a-f-]{36}\\.pdf$').test(rcKey), rcErr ? rcErr.message : rcKey);
const rcRow = rcForm && await readRow(rcForm.id);
check('DB 의 형식이 "인수증" · pdf_key 가 그 경로', rcRow && rcRow[K.formType] === '인수증' && rcRow[K.pdfKey] === rcKey, rcRow);
W.FILES = {}; DB.cases = [];
await W.loadCasesFromSupabase();
const c3 = DB.cases.find(x => x.dbId === c.dbId);
const rfid = 'fp' + (rcForm && rcForm.id);
check('새로고침 뒤 목록에 인수증 PDF 가 있다', c3 && (c3.formPdfIds || []).includes(rfid), c3 && c3.formPdfIds);
DB.role = 'staff'; DB.screen = 'case'; DB.caseId = c3.id;
const appBtn = W.formPdfButtonsHtml(c3, 'application'), rcBtn = W.formPdfButtonsHtml(c3, 'receipt');
check('★ 신청서 버튼 갈래에 인수증이 섞이지 않는다', appBtn.indexOf(rfid) < 0 && appBtn.indexOf(fid) >= 0, appBtn.slice(0, 160));
check('★ 인수증 버튼 갈래에는 인수증만 있다', rcBtn.indexOf(rfid) >= 0 && rcBtn.indexOf(fid) < 0 && /인수증 PDF/.test(rcBtn), rcBtn.slice(0, 160));
const pdfs2 = await W.loadFormPdfs(c3);
const zips2 = W.caseZipEntries(c3, pdfs2).map(e => e.name);
check('ZIP 목록에 <건>_인수증.pdf 가 들어간다', zips2.some(n => new RegExp('^' + c3.id + '_인수증.*\\.pdf$').test(n)), zips2);

console.log('\n남긴 것: form_submission ' + form.id + ' · ' + pdfKey + ' · 인수증 form_submission ' + (rcForm && rcForm.id) + ' · ' + rcKey + ' · audit_log pdf.view 2줄 (#' + TESTBED + ' 검사용 건 — 지우지 않는다)');
console.log(fail ? `\n❌ 실패 ${fail}건` : '\n✅ 신청서 PDF 왕복 전부 통과');
process.exit(fail ? 1 : 0);
