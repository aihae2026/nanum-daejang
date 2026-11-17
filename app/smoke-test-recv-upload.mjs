/* 담당자 수취 등록 실제 업로드 + 올릴 수 없는 파일 형식을 고르는 순간 말하는가 (2026-09-07 밤 선미 · #226·#228 실측)

   ★ 왜 — dev 에서 둘을 봤다.
       ① 담당자 수취 등록에 "파일 선택 (데모)" 뿐이었다. 실 DB #226 에 "증빙_226_….pdf (312KB)" 가
          사실인 것처럼 남았는데 그 파일은 어디에도 없다. 올리고 싶어도 못 올렸다.
       ② 배분처가 결과보고서를 docx 로 올렸다. 버킷(PDF·PNG·JPEG·WEBP)이 거절했고 폼은 "제출 완료" 로
          넘어간 뒤 담당자 화면에 미수취로 섰다. 고를 때 아무 말이 없었다.
   ★ 검사 원칙: 옛 코드에서 빨간지 + 긍정 케이스(데모 모드에서 데모 버튼이 산다 · 정상 파일은 올라간다) 둘 다.

   실 DB 를 읽지 않는다 — saveAttachment 를 갈아끼운다.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-recv-upload.mjs
*/
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { appScripts } from './app-scripts.mjs';
const require = createRequire(process.env.JSDOM_FROM
  ? process.env.JSDOM_FROM.replace(/\/?$/, '/') + 'package.json'
  : new URL('../prototype/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const APP = fileURLToPath(new URL('./', import.meta.url));
const dom = new JSDOM(readFileSync(APP + 'index.html', 'utf8'),
  {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost:8788/'});
const {window} = dom;
window.HTMLCanvasElement.prototype.getContext = function(){const n=()=>{};return{lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n};};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
for (const f of appScripts())
  window.eval(readFileSync(APP + f, 'utf8'));
const W = window, DB = W.DB;
let fail = 0;
const check = (n, ok, got) => {
  console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got)));
  if (!ok) fail++;
};
const mk = (name, type, size) => new W.File([new Uint8Array(size || 10)], name, {type: type || ''});
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

console.log('\n[① 올릴 수 없는 형식은 고르는 순간 말한다]');
check('★ docx 거절 — PDF 로 저장하라고 말한다', /PDF·PNG·JPG·JPEG·WEBP/.test(W.uploadRejectReason(mk('결과보고서.docx', DOCX))) && /PDF 로 저장/.test(W.uploadRejectReason(mk('결과보고서.docx', DOCX))));
check('hwp 거절', !!W.uploadRejectReason(mk('결과보고서.hwp', '')));
check('gif 거절 (image/* 였으면 통과했을 것)', !!W.uploadRejectReason(mk('사진.gif', 'image/gif')));
check('pdf 통과', W.uploadRejectReason(mk('보고서.pdf', 'application/pdf')) === '');
check('png·jpg·webp 통과', ['a.png|image/png', 'b.jpg|image/jpeg', 'c.webp|image/webp'].every(s => { const [n,t] = s.split('|'); return W.uploadRejectReason(mk(n, t)) === ''; }));
check('type 이 비어도 확장자로 통과 (일부 브라우저)', W.uploadRejectReason(mk('영수증.JPG', '')) === '');
check('10MB 초과 거절', /10MB/.test(W.uploadRejectReason(mk('big.pdf', 'application/pdf', 10 * 1024 * 1024 + 1))));

console.log('\n[② 배분처 폼 — docx 는 목록에 안 들어가고 토스트로 이유를 말한다 · png 는 들어간다]');
DB.preview = false; DB.orgForm.files = {};
W.pickOrgFiles('report_dom', [mk('결과보고서.docx', DOCX), mk('결과보고서.png', 'image/png')]);
const rd = DB.orgForm.files.report_dom || [];
check('★ png 하나만 들어갔다', rd.length === 1 && W.FILES[rd[0]].name === '결과보고서.png', rd.map(i => W.FILES[i] && W.FILES[i].name));
check('★ 토스트가 docx 를 이유와 함께 말한다', DB.toast && /올릴 수 없는 파일 1건/.test(DB.toast.msg) && /docx/.test(DB.toast.cap), DB.toast);
DB.toast = null;
DB.donorForm.files = {};
W.pickFiles('proof_buy', [mk('영수증.hwp', ''), mk('영수증.pdf', 'application/pdf')]);
check('후원자 폼도 같은 규칙 (hwp 거절 · pdf 통과)', (DB.donorForm.files.proof_buy || []).length === 1 && DB.toast && /1건/.test(DB.toast.msg), {files:DB.donorForm.files.proof_buy, toast:DB.toast});
check('파일 input 의 accept 가 버킷 형식과 같다', /accept="[^"]*\.pdf[^"]*image\/webp/.test(W.UPLOAD_ACCEPT ? 'accept="' + W.UPLOAD_ACCEPT + '"' : ''), W.UPLOAD_ACCEPT);

console.log('\n[③ 담당자 수취 등록 — 실 DB 에서는 실제 파일 · 데모 버튼은 데모 모드에서만]');
window.eval("SUPABASE_CONFIG = {url:'https://x.supabase.co', key:'k'}; DB_SOURCE = 'Supabase';");
DB.role = 'staff';
const c = DB.cases.find(x => x.checklist.some(it => it.kind === 'A' && it.included && W.itemStatus(it).code !== 'done'));
DB.caseId = c.id; DB.recvForm = {caseId:null, itemKey:'', file:'', fileId:null, date:W.TODAY, memo:''};
let html = W.viewReceive();
check('★ 실 DB: "파일 선택 (데모)" 가 없다', html.indexOf('pickRecvFile()') < 0);
check('★ 실 DB: 실제 파일 input 이 있고 accept 가 붙어 있다', /pickRecvRealFile\(this\.files\)/.test(html) && /accept="[^"]*pdf/.test(html));
window.eval("DB_SOURCE = undefined;");
html = W.viewReceive();
check('데모 모드: 데모 버튼이 산다 (지운 게 아니라 감싼 것)', html.indexOf('pickRecvFile()') >= 0);
window.eval("DB_SOURCE = 'Supabase';");

console.log('\n[④ ★★ 실제 파일은 저장소에 올라간 뒤에만 수취완료가 된다]');
const it = c.checklist.find(x => x.kind === 'A' && x.included && W.itemStatus(x).code !== 'done');
let saved = [], statusSaved = 0;
const oSave = W.saveAttachment, oStatus = W.saveItemStatus, oGo = W.go, oSign = W.signFile;
W.saveItemStatus = () => { statusSaved++; return Promise.resolve({ok:true}); };
W.go = () => {};
W.signFile = () => Promise.resolve(true);
W.saveAttachment = (cc, item, m, role) => { saved.push({name:m.name, role, item:item.uid || item.key}); return Promise.resolve({ok:true, storageKey:'attachments/1/x.pdf'}); };
DB.recvForm.itemKey = it.uid || it.key;
W.pickRecvRealFile([mk('인수증_스캔.pdf', 'application/pdf')]);
check('고른 파일 이름이 폼에 보인다', DB.recvForm.file === '인수증_스캔.pdf' && !!DB.recvForm.fileId, DB.recvForm);
await W.markReceived();
check('★★ saveAttachment 가 staff 역할로 불렸다', saved.length === 1 && saved[0].role === 'staff' && saved[0].name === '인수증_스캔.pdf', saved);
check('★ 올라간 뒤 항목이 수취완료', it.r.st === 'done' && it.r.by === '담당자', it.r);
check('★ fileIds 에 붙어 검수 화면·ZIP 이 본다', (it.r.fileIds || []).length === 1, it.r.fileIds);
check('상태 저장(saveItemStatus)이 불렸다', statusSaved === 1, statusSaved);
check('폼이 비워졌다', DB.recvForm.file === '' && !DB.recvForm.fileId, DB.recvForm);

console.log('\n[⑤ ★ 업로드가 실패하면 수취완료로 만들지 않는다 — 파일 없는 수취는 없다]');
const it2 = c.checklist.find(x => x.kind === 'A' && x.included && x !== it && W.itemStatus(x).code !== 'done');
W.saveAttachment = () => Promise.resolve({ok:false, reason:'버킷이 허용하지 않는 파일 형식입니다'});
statusSaved = 0;
DB.recvForm.itemKey = it2.uid || it2.key;
W.pickRecvRealFile([mk('사진.png', 'image/png')]);
await W.markReceived();
check('★ 항목이 그대로 (수취완료 아님)', it2.r.st !== 'done', it2.r.st);
check('★ 상태 저장을 안 한다', statusSaved === 0, statusSaved);
check('이유를 토스트로 말한다', DB.toast && /저장되지 않아 수취 처리하지 않았습니다/.test(DB.toast.msg) && /형식/.test(DB.toast.cap), DB.toast);
check('폼의 파일은 남아 있다 (다시 시도할 수 있게)', DB.recvForm.file === '사진.png', DB.recvForm.file);
check('올리는 중 표시가 풀렸다', !DB.recvBusy, DB.recvBusy);

console.log('\n[⑥ 데모 모드 — 옛 길(이름만)은 그대로 산다]');
window.eval("DB_SOURCE = undefined; SUPABASE_CONFIG = {url:'', key:''};");
const it3 = c.checklist.find(x => x.kind === 'A' && x.included && x !== it && x !== it2 && W.itemStatus(x).code !== 'done') || it2;
saved = []; DB.recvForm.itemKey = it3.uid || it3.key; DB.recvForm.fileId = null;
W.pickRecvFile();
W.markReceived();
check('데모: 업로드 없이 수취완료 (시연이 멈추지 않는다)', it3.r.st === 'done' && saved.length === 0, {st:it3.r.st, saved});
W.saveAttachment = oSave; W.saveItemStatus = oStatus; W.go = oGo; W.signFile = oSign;

console.log(fail ? `\n❌ ${fail}개 실패` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
