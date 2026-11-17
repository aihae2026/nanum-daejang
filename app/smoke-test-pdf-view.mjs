/* 신청서 PDF 열람 검사 (담당자 화면) — 2026-09-04 선미

   ★ 확인하는 것 넷:
     ① 데모: 제출 직후 담당자가 [신청서 PDF 열기] → 뷰어에 PDF 가 뜬다
     ② 실DB 흉내: 열람 기록(pdf.view)이 실패하면 **열지 않는다** (주소도 안 받는다)
     ③ 기록이 되면 열리고, 다시 열면 기록이 또 남는다 (열 때마다 한 줄)
     ④ 주소 자동 갱신(refreshExpiringUrls)이 신청서 PDF 는 건너뛴다 — 기록 없는 주소가 생기면 안 된다

   실제 Supabase 는 건드리지 않는다 — sbReady·logPdfView·sbSignedUrl 을 흉내로 바꿔 끼운다.
   돌리는 법:  JSDOM_FROM=<jsdom 이 설치된 폴더> node smoke-test-pdf-view.mjs
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
window.URL.createObjectURL = () => 'blob:demo-pdf';   /* jsdom 에 없다 */
window.fetch = (url) => {
  const p = APP + String(url).replace(/^\.?\//, '');
  try { const b = readFileSync(p); return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) }); }
  catch (e) { return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('no ' + p) }); }
};
for (const f of appScripts({ vendor: true }))
  window.eval(readFileSync(APP + f, 'utf8'));

const W = window, DB = W.DB;
let fail = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✘ ') + msg); if (!cond) fail++; };
const tick = () => new Promise(r => setTimeout(r, 20));

/* 법인외 후원자가 접수 링크로 제출 (smoke-test-pdf-submit 와 같은 준비) */
const c = DB.cases.find(x => x.donorType !== '법인') || DB.cases[0];
Object.assign(c, { donorType: '법인외', acqPath: '구매', state: '제출 대기', awaitingSubmit: true, paperIntake: false });
c.checklist = W.autoChecklist('법인외', '구매', true, DB.promptProfile);
DB.role = 'donor'; DB.screen = 'donorForm';
const f = DB.donorForm; f.linkCaseId = c.id; f.donorType = '법인외'; f.path = '구매';
W.prefillDonor();
f.signImg = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='; f.signed = true;
W.submitDonor();
for (let i = 0; i < 100 && !c.formPdf; i++) await new Promise(r => setTimeout(r, 100));

console.log('① 데모 — 담당자가 연다');
DB.role = 'staff'; DB.screen = 'case'; DB.caseId = c.id;
ok(!!c.formPdf, '제출로 PDF 가 메모리에 있음');
ok(/신청서 PDF 열기/.test(W.formPdfButtonsHtml(c)), '[S] 항목·원문 팝업에 버튼이 나옴');
W.openFormPdf(c.id);
ok(DB.viewer && DB.viewer.ids[0] === 'fpdemo' + c.id, '뷰어가 신청서 PDF 로 열림');
ok(W.fileKind('fpdemo' + c.id) === 'pdf' && W.fileUrl('fpdemo' + c.id) === 'blob:demo-pdf', 'PDF 로 인식되고 주소가 있음');
W.renderViewer();
const vw = W.document.getElementById('viewerWrap');
ok(vw && /<iframe/.test(vw.innerHTML) && /신청서 PDF · 개인정보/.test(vw.innerHTML), '뷰어 본문에 iframe + 개인정보 표시');
W.closeViewer();

console.log('② 실DB 흉내 — 기록 실패면 열지 않는다');
W.sbReady = () => true;                                 /* 이 아래는 라이브 경로로 분기한다 */
c.dbId = 1;
W.FILES['fp9'] = { id: 'fp9', name: '물품기부신청서(법인외).pdf', type: 'application/pdf', size: 0, blob: null, demo: false,
                   storageKey: 'forms/1/abc.pdf', formPdf: true, submissionId: 9, formType: '물품기부신청서(법인외)', submittedAt: '2026-09-04T14:22:00' };
c.formPdfIds = ['fp9'];
let logged = 0, signed = 0, logOk = false;
W.logPdfView = () => logOk ? (logged++, Promise.resolve({})) : Promise.reject(new Error('audit down'));
W.sbSignedUrl = () => { signed++; return Promise.resolve('https://signed.example/x?n=' + signed); };
W.openFormPdf(c.id, 'fp9'); await tick(); await tick();
ok(!DB.viewer, '뷰어가 열리지 않음');
ok(signed === 0, '주소를 받지 않음 (signed=' + signed + ')');
ok(DB.toast && /열람 기록/.test(DB.toast.msg), '담당자에게 이유를 말함 — ' + (DB.toast && DB.toast.msg));
ok(DB.pdfBusy === null, '버튼 잠금이 풀림');

console.log('③ 기록되면 열린다 · 열 때마다 기록');
logOk = true; DB.toast = null;
W.openFormPdf(c.id, 'fp9'); await tick(); await tick();
ok(DB.viewer && DB.viewer.ids[0] === 'fp9', '뷰어가 열림');
ok(logged === 1 && signed === 1, '기록 1 · 주소 1 (logged=' + logged + ', signed=' + signed + ')');
ok(W.FILES.fp9.url === 'https://signed.example/x?n=1', '받은 주소가 파일에 붙음');
W.closeViewer();
W.openFormPdf(c.id, 'fp9'); await tick(); await tick();
ok(logged === 2 && signed === 2, '다시 열면 기록이 또 남음 (logged=' + logged + ')');
ok(/신청서 PDF 열기 · 2026-09-04 14:22/.test(W.formPdfButtonsHtml(c)), '버튼에 제출 시각 표시');

console.log('④ 자동 갱신은 신청서 PDF 를 건너뛴다');
W.FILES.fp9.urlExpiresAt = Date.now() + 1000;           /* 곧 만료 — 첨부라면 갱신 대상 */
W.FILES['dbX'] = { id: 'dbX', name: 'a.png', type: 'image/png', storageKey: 'attachments/1/x.png', urlExpiresAt: Date.now() + 1000 };
const before = signed;
await W.refreshExpiringUrls();
ok(signed === before + 1, '첨부만 갱신됨 · 신청서 PDF 는 그대로 (signed ' + before + '→' + signed + ')');

console.log(fail ? '\n✘ 실패 ' + fail + '건' : '\n✔ 통과');
process.exit(fail ? 1 : 0);
