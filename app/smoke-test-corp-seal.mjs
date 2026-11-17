/* 법인 신청서 — 전자서명을 빼고 직인 날인으로 (2026-09-10 · 연수 발견 · 선미 요청)

   ★ 무엇을 바꿨나
     전에는 법인이 **전자서명 또는 인감 스캔본** 중 골랐다(2026-09-04). 그런데 법인 명의
     서류의 효력은 직인에서 나온다 — 고를 수 있게 두면 '날인 없는 법인 신청서' 가 접수되고,
     기관 업무지침이 막으라고 한 상태를 화면이 스스로 만든다.
     그래서 법인 경로에서 **서명 패드를 없애고**, 직인 날인 이미지를 **언제나 필수**로 받는다.
     올린 이미지는 신청서 PDF 하단 '기부자(명칭/성명)' 줄의 (인) 자리에 찍힌다.

   ★ 그래서 여섯을 본다
     ① 후원자 화면이 갈린다 — 법인엔 서명 캔버스가 없고, 법인 외엔 그대로 있다
     ② 규칙 함수 — corpApplRoute 는 'seal' 하나뿐이고 서명으로 갈음되지 않는다
     ③ 제출 검증이 갈린다 — 법인은 직인, 법인 외는 서명. 완화가 서로 번지지 않는다
     ④ PDF 데이터 — 직인 blob 이 실린다(이미지일 때만). 법인 외는 안 실린다
     ⑤ embedSealImage — PNG·JPEG 를 매직넘버로 가르고, 그 외는 **던지지 않고** null
     ⑥ ★ 진짜 PDF 를 만들어 본다 — 날인이 실제로 박히는가(이미지 XObject 가 하나 는다)
     ⑦ AI 전송 차단이 이름을 바꾼 뒤에도 살아 있는가 (키·정규식 둘 다)

   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-corp-seal.mjs
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
  { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost:8788/' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function(){ const n=()=>{}; return {lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n}; };
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
for (const f of appScripts()) window.eval(readFileSync(APP + f, 'utf8'));

let fail = 0;
const check = (n, ok, got) => { console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got))); if (!ok) fail++; };

/* 진짜 PNG·JPEG 바이트 — 매직넘버가 맞아야 pdf-lib 가 받는다.
   1×1 투명 PNG / 1×1 흰 JPEG (base64) */
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPG_1PX = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

/* 파일 레지스트리(common.js FILES)에 넣는다 — pickFiles 를 안 거치고 직접 세운다 */
function putFile(id, name, type, buf){
  window.FILES[id] = {id, name, type, size: buf.length,
    blob: new window.Blob([new Uint8Array(buf)], {type})};
  return id;
}

console.log('\n════════ ① 후원자 화면 — 법인엔 서명 캔버스가 없다 ════════');

/* ⚠️ 미리보기(pv=true)로 그리면 안 된다 — viewDonorForm 은 `ro = pv || done` 이라
     **미리보기에서는 아무에게도 서명 캔버스를 안 그린다.** 그걸로 "법인엔 캔버스가 없다" 를
     통과시키면 헛통과다(2026-09-10 이 검사를 쓰다가 실제로 겪었다).
     그래서 진짜 후원자 경로로 그린다 — 링크 건을 세우고 linkCaseId 로 잇는다. */
let SEQ = 0;
function donorHtml(donorType, files){
  const id = 'T' + (++SEQ);
  window.DB.role = 'donor';
  window.DB.req = Object.assign(window.DB.req || {}, {donorType, path:'구매'});
  window.DB.cases = (window.DB.cases || []).filter(c => c.id !== id);
  window.DB.cases.push({id, state:'접수 대기', donorType, acqPath:'구매',
    donor:'(제출 대기)', checklist: window.autoChecklist(donorType, '구매', false, 'foundation')});
  window.DB.donorForm = Object.assign(window.DB.donorForm || {}, {
    donorType, path:'구매', donorName: donorType === '법인' ? '(주)한결식품' : '홍길동',
    itemName:'컵라면', qty:400, donDate:'2026-09-10', unitBook:2500, unitSale:2500,
    agreePurpose:true, agreeDouble:true, privacyTransfer:true, corpAck:true, privacy:true, wantsReceipt:false,
    signed:false, signImg:null, files: files || {},
    linkCaseId:id, submittedId:null, verified:true, verifyInput:'', verifyTries:0
  });
  const h = window.viewDonorForm();
  /* 본인확인 벽에 막히면 폼이 아니다 — 검사가 엉뚱한 화면을 재고 있지 않은지 먼저 본다 */
  if (h.indexOf('card-b') < 0) throw new Error('폼이 안 그려졌다 — 검사 준비가 틀렸다: ' + h.slice(0, 200));
  return h;
}

let h = donorHtml('법인', {});
check('★★ 법인 — 서명 캔버스(signCanvas)가 없다', h.indexOf('signCanvas') < 0, h.indexOf('signCanvas'));
check('★★ 법인 — 직인 날인 카드가 뜬다', /법인인감\(직인\) 날인/.test(h), false);
/* 설명 배너는 2026-09-11 선미 결정으로 뺐다 — 카드 제목·태그·미리보기가 말한다. 배너가 되살아나지 않는지 본다 */
check('   설명 배너("전자서명을 쓰지 않습니다")는 없다 (9/11 선미)', !/전자서명을 쓰지 않습니다\.<\/b>/.test(h), false);
check('   날인이 없으면 잠금 안내가 뜬다', /날인 이미지를 올려야 제출됩니다/.test(h), false);
check('   태그가 "날인 필요" 다', /날인 필요/.test(h), false);
check('★ 서명 지우기 버튼도 없다 (법인은 서명 자체가 없다)', h.indexOf('clearSign()') < 0, true);

const sealId = putFile('seal-1', '법인인감.png', 'image/png', PNG_1PX);
h = donorHtml('법인', {appl_corp_scan:[sealId]});
check('★★ 직인을 올리면 태그가 "날인 확인됨" 으로 바뀐다', /날인 확인됨/.test(h), false);
check('   잠금 안내가 걷힌다', !/날인 이미지를 올려야 제출됩니다/.test(h), false);
/* "PDF 하단에 찍힙니다" 줄은 뺐다 (2026-09-12 선미) — 남는 한 줄은 "AI 검수로 전송하지 않습니다" 뿐 */
check('   AI 검수로 보내지 않는다고만 알려 준다', /직인 이미지는 AI 검수로 전송하지 않습니다/.test(h) && !/PDF 하단에 이 날인이/.test(h), false);
check('★ 여전히 서명 캔버스는 없다', h.indexOf('signCanvas') < 0, true);

h = donorHtml('법인외', {});
check('★★ 법인 외 — 서명 캔버스가 그대로 있다 (완화가 번지지 않는다)', h.indexOf('signCanvas') >= 0, false);
check('★★ 법인 외 — 직인 카드는 없다', !/법인인감\(직인\) 날인/.test(h), false);

console.log('\n════════ ② 규칙 함수 — seal 하나뿐 ════════');
check('직인이 있으면 seal', window.corpApplRoute({files:{appl_corp_scan:['x']}}) === 'seal',
      window.corpApplRoute({files:{appl_corp_scan:['x']}}));
check('★★ 전자서명이 있어도 직인이 없으면 null', window.corpApplRoute({signed:true, files:{}}) === null,
      window.corpApplRoute({signed:true, files:{}}));
check('아무것도 없으면 null', window.corpApplRoute({files:{}}) === null, window.corpApplRoute({files:{}}));
check('corpSealFileId 가 첫 파일을 집어 준다',
      window.corpSealFileId({files:{appl_corp_scan:['a','b']}}) === 'a',
      window.corpSealFileId({files:{appl_corp_scan:['a','b']}}));
check('직인이 없으면 null 을 돌린다', window.corpSealFileId({files:{}}) === null, window.corpSealFileId({files:{}}));

console.log('\n════════ ③ 제출 검증 — 법인은 직인 · 법인 외는 서명 ════════');
const baseForm = (t) => ({donorType:t, path:'구매', donorName: t === '법인' ? '(주)나눔' : '홍길동',
  itemName:'즉석밥', qty:10, donDate:'2026-09-10', unitBook:1000, unitSale:1000,
  agreePurpose:true, agreeDouble:true, privacyTransfer:true, corpAck:true, privacy:true, wantsReceipt:false, rrn:'',
  under14:false, guardian:false, note:'', giftVal:'', saleVal:'',
  signed:false, signImg:null, files:{proof_buy:['x'], photo:['x']}});
const errsFor = (patch) => {
  const t = patch.donorType || '법인';
  window.DB.req.donorType = t; window.DB.req.path = '구매';
  window.DB.donorForm = Object.assign(window.DB.donorForm, baseForm(t), patch);
  window.DB.donorForm.linkCaseId = null;
  return window.donorErrors(window.DB.donorForm);
};
let e = errsFor({});
check('★★ 법인 — 직인이 없으면 막힌다', e.some(x => /직인/.test(x)), e);
e = errsFor({signed:true});
check('★★ 법인 — 전자서명을 해도 막힌다 (서명이 직인을 대신하지 못한다)', e.some(x => /직인/.test(x)), e);
e = errsFor({files:{proof_buy:['x'], photo:['x'], appl_corp_scan:['x']}});
check('★★ 법인 — 직인만 있으면 통과한다 (서명을 요구하지 않는다)', e.length === 0, e);
e = errsFor({donorType:'법인외', signed:false});
check('★★ 법인 외 — 서명이 없으면 막힌다', e.some(x => /서명 또는 날인이 없는/.test(x)), e);
check('   법인 외에게 직인을 요구하지 않는다', !e.some(x => /직인/.test(x)), e);
e = errsFor({donorType:'법인외', signed:true});
check('★★ 법인 외 — 서명하면 통과한다 (직인 없이)', e.length === 0, e);

console.log('\n════════ ④ 체크리스트 — 직인은 언제나 켜져 있다 ════════');
for (const path of ['구매', '제조·유통']){
  const cl = window.autoChecklist('법인', path, false, 'foundation');
  const it = cl.find(i => i.key === 'appl_corp_scan');
  check(path + ' — 직인 칸이 있고 included 다', !!it && it.included === true, it && it.included);
  check(path + ' — 이름이 "법인인감(직인) 날인 이미지" 다', it && it.n === '법인인감(직인) 날인 이미지', it && it.n);
  check(path + ' — 첨부(A) 칸이다', it && it.kind === 'A', it && it.kind);
}
const clIndiv = window.autoChecklist('법인외', '구매', false, 'foundation').map(i => i.key);
check('★ 법인 외 체크리스트엔 직인 칸이 없다', clIndiv.indexOf('appl_corp_scan') < 0, clIndiv);

console.log('\n════════ ④-2 담당자 검수 — 직인이 완결을 막는가 ════════');
/* 선미 요청의 핵심 한 줄: "담당자가 검수 페이지로 돌아와서 전자서명 없이
   법인 스캔본 날인이 필수 항목으로 들어오게" — 화면에 뜨는 것만으로는 부족하다.
   **안 왔으면 완결이 막혀야** 필수다. 게이트(blocksComplete)로 확인한다. */
function corpCase(sealSt){
  return {id:'901', dbId:1, state:'검수 대기', donorType:'법인', acqPath:'구매',
    orgId:1, orgName:'늘봄지역아동센터',
    donation:{itemName:'컵라면', qty:400, unitPrice:2500, book:1000000, fair:1000000,
              arriveDate:'2026-09-10', donationDate:'2026-09-10'},
    checklist:[
      {key:'bizno_fmt',      n:'사업자등록번호 형식', kind:'F', stage:'접수', included:true, r:{st:'done'}},
      {key:'appl_corp',      n:'물품기부신청서(법인용)', kind:'S', stage:'접수', included:true, r:{st:'done'}},
      {key:'appl_corp_scan', n:'법인인감(직인) 날인 이미지', kind:'A', stage:'접수', included:true, r:{st:sealSt}},
      {key:'proof_buy',      n:'구매영수증 또는 매입세금계산서', kind:'A', stage:'접수', included:true, r:{st:'done'}},
      {key:'photo',          n:'물품사진', kind:'A', stage:'접수', included:true, r:{st:'done'}},
      {key:'inss',           n:'인수증', kind:'A', stage:'배분', included:true, distId:1, r:{st:'done'}},
      {key:'dist_photo',     n:'배분 물품 사진', kind:'A', stage:'배분', included:true, distId:1, r:{st:'done'}},
      {key:'report_dom',     n:'배분 결과보고서(국내지원)', kind:'A', stage:'배분', included:true, distId:1, r:{st:'miss'}}
    ]};
}
check('★★ 직인이 안 오면 완결이 막힌다 (그래서 "필수" 다)',
      window.inspect(corpCase('miss'), window.TODAY).canComplete === false,
      window.inspect(corpCase('miss'), window.TODAY).canComplete);
check('★★ 직인을 받으면 완결이 열린다',
      window.inspect(corpCase('done'), window.TODAY).canComplete === true,
      window.inspect(corpCase('done'), window.TODAY).verdict);
check('★ 게이트 예외 목록에 직인이 없다 (결과보고서만 예외다)',
      window.GATE_OPTIONAL_KEYS.indexOf('appl_corp_scan') < 0, window.GATE_OPTIONAL_KEYS);
check('   결과보고서는 미수취여도 막지 않는다 (9/8 규칙이 그대로다)',
      window.blocksComplete({key:'report_dom'}) === false, window.blocksComplete({key:'report_dom'}));
check('   직인은 막는다', window.blocksComplete({key:'appl_corp_scan'}) === true,
      window.blocksComplete({key:'appl_corp_scan'}));

console.log('\n════════ ⑤ PDF 데이터 — 직인 blob 이 실린다 ════════');
const caseCorp = {id:'901', donorType:'법인', acqPath:'구매'};
const fCorp = Object.assign(baseForm('법인'), {files:{proof_buy:['x'], photo:['x'], appl_corp_scan:[sealId]}});
let pd = window.donorFormPdfData(fCorp, caseCorp, {submittedAt:'2026-09-10T09:00:00Z'});
check('★★ 법인 — sealBlob 이 실린다', !!pd.sealBlob, !!pd.sealBlob);
check('   formType 이 법인이다', pd.formType === '법인', pd.formType);
check('   signed 는 false 다 (법인은 서명하지 않는다)', pd.signed === false, pd.signed);

const pdfId = putFile('seal-pdf', '스캔본.pdf', 'application/pdf', Buffer.from('%PDF-1.4 fake'));
let pd2 = window.donorFormPdfData(Object.assign({}, fCorp, {files:{appl_corp_scan:[pdfId]}}), caseCorp, {});
check('★ 이미지가 아니면(PDF) sealBlob 을 안 싣는다 (억지로 넣으면 깨진다)', pd2.sealBlob === null, pd2.sealBlob);

const caseIndiv = {id:'902', donorType:'법인외', acqPath:'구매'};
let pd3 = window.donorFormPdfData(Object.assign(baseForm('법인외'), {signed:true, signImg:'data:image/png;base64,S'}), caseIndiv, {});
check('★★ 법인 외 — sealBlob 이 없다 (직인 경로가 번지지 않는다)', !pd3.sealBlob, pd3.sealBlob);

console.log('\n════════ ⑥ embedSealImage — 매직넘버로 가른다 ════════');
const fakeDoc = {
  embedPng: (b) => Promise.resolve({kind:'png', width:1, height:1, bytes:b.length}),
  embedJpg: (b) => Promise.resolve({kind:'jpg', width:1, height:1, bytes:b.length})
};
const blobOf = (buf, type) => new window.Blob([new Uint8Array(buf)], {type});
const r1 = await window.embedSealImage(fakeDoc, blobOf(PNG_1PX, 'image/png'));
check('★ PNG 는 embedPng 로 간다', r1 && r1.kind === 'png', r1);
const r2 = await window.embedSealImage(fakeDoc, blobOf(JPG_1PX, 'image/jpeg'));
check('★ JPEG 는 embedJpg 로 간다', r2 && r2.kind === 'jpg', r2);
/* ⚠️ 확장자가 아니라 바이트로 가른다 — .png 로 저장된 JPEG 가 실제로 온다 */
const r3 = await window.embedSealImage(fakeDoc, blobOf(JPG_1PX, 'image/png'));
check('★★ 확장자가 거짓이어도 바이트를 믿는다 (.png 라 적힌 JPEG)', r3 && r3.kind === 'jpg', r3);
const r4 = await window.embedSealImage(fakeDoc, blobOf(Buffer.from('not an image'), 'image/png'));
check('★★ 이미지가 아니면 던지지 않고 null (신청서 PDF 자체는 나와야 한다)', r4 === null, r4);
const r5 = await window.embedSealImage(fakeDoc, null);
check('   blob 이 없으면 null', r5 === null, r5);

console.log('\n════════ ⑦ 진짜 PDF — 날인이 실제로 박히는가 ════════');
/* pdf-lib·fontkit 을 실제로 싣고 진짜 A4 를 만든다. 이미지 XObject 개수로 확인한다 —
   날인이 들어가면 로고(1장)보다 하나 많아야 한다. */
window.eval(readFileSync(APP + 'assets/vendor/pdf-lib.min.js', 'utf8'));
window.eval(readFileSync(APP + 'assets/vendor/fontkit.umd.min.js', 'utf8'));
check('pdf-lib 이 실렸다', typeof window.PDFLib !== 'undefined', typeof window.PDFLib);
check('fontkit 이 실렸다', typeof window.fontkit !== 'undefined', typeof window.fontkit);

/* ⚠️ node 의 Uint8Array 를 그대로 넘기면 pdf-lib 이 "type NaN" 이라며 거절한다 —
     jsdom 은 다른 realm 이라 instanceof 가 안 맞는다. window 쪽 생성자로 만든다. */
const toWinBytes = (buf) => { const u = new window.Uint8Array(buf.length); u.set(buf); return u; };
const assets = {
  font: toWinBytes(readFileSync(APP + 'assets/fonts/NDJSans-Regular.ttf')),
  logo: toWinBytes(readFileSync(APP + 'assets/brand/logo-color.png'))
};
const countImages = (bytes) => {
  const s = Buffer.from(bytes).toString('latin1');
  return (s.match(/\/Subtype\s*\/Image/g) || []).length;
};
const pdfBase = Object.assign({}, pd, {sealBlob:null});
const bytesNoSeal = await window.buildDonorFormPdf(pdfBase, assets);
const bytesSeal   = await window.buildDonorFormPdf(pd, assets);
const nNo = countImages(bytesNoSeal), nYes = countImages(bytesSeal);
/* ⚠️ "하나 는다" 로 못 박지 않는다 — 알파 채널이 있는 PNG 는 SMask 까지 만들어 둘이 는다.
     보려는 것은 개수가 아니라 **날인이 문서 안에 실제로 들어갔는가** 다. */
check('★★ 날인이 들어가면 이미지가 는다 (문서에 실제로 박혔다)', nYes > nNo, {날인없음:nNo, 날인있음:nYes});
check('★ PDF 가 실제로 만들어졌다 (%PDF 로 시작)',
      Buffer.from(bytesSeal).slice(0, 4).toString() === '%PDF', Buffer.from(bytesSeal).slice(0, 4).toString());
/* ★ 늘어난 이미지가 정말 '직인' 때문인지 못 박는다 — 이미지가 아닌 파일을 주면
     embedSealImage 가 null 을 돌리므로 개수가 날인 없을 때와 같아야 한다.
     이게 맞아야 위 검사가 우연이 아니다(로고가 늘었을 뿐일 수도 있으니). */
const pdfBadSeal = Object.assign({}, pd, {sealBlob: blobOf(Buffer.from('not an image'), 'image/png')});
const nBad = countImages(await window.buildDonorFormPdf(pdfBadSeal, assets));
check('★★ 이미지가 아닌 파일이면 개수가 그대로다 (늘어난 것은 직인이 맞다)',
      nBad === nNo, {날인없음:nNo, 못심음:nBad, 날인있음:nYes});
/* ⚠️ 크기로는 못 본다 — 날인이 들어가면 대체 문구가 빠져 폰트 서브셋이 줄고, 되레 작아질 수 있다.
     실제로 그랬다(55,724 → 55,647). 크기 비교를 검사로 쓰지 않는다. */

console.log('\n════════ ⑧ AI 전송 차단 — 이름을 바꾼 뒤에도 살아 있는가 ════════');
const judgeSrc = readFileSync(APP + 'functions/judge.js', 'utf8');
const blockReSrc = (judgeSrc.match(/const AI_BLOCKED_DOC_RE = \/(.+?)\/;/) || [])[1];
const blockRe = new RegExp(blockReSrc || '$^');
check('★★ 서버 정규식이 새 이름을 잡는다 (이름을 바꾸며 뚫렸던 자리)',
      blockRe.test('법인인감(직인) 날인 이미지'), blockReSrc);
check('   옛 이름도 그대로 잡는다 (지난 건이 남아 있다)',
      blockRe.test('물품기부신청서 서면 스캔본(법인인감 날인)'), blockReSrc);
check('★ 오차단이 없다 — 인수증은 안 걸린다', !blockRe.test('인수증'), blockReSrc);
check('   구매영수증도 안 걸린다', !blockRe.test('구매영수증 또는 매입세금계산서'), blockReSrc);
check('   물품사진도 안 걸린다', !blockRe.test('물품사진'), blockReSrc);
check('★★ 화면 쪽은 키로 막는다 (이름과 무관하게 산다)',
      window.AI_BLOCKED_KEYS.indexOf('appl_corp_scan') >= 0, window.AI_BLOCKED_KEYS);
const caseSend = {checklist:[
  {key:'appl_corp_scan', n:'법인인감(직인) 날인 이미지', kind:'A', included:true, r:{st:'miss', fileIds:[sealId], orgUpload:{status:'none'}}},
  {key:'proof_buy', n:'구매영수증 또는 매입세금계산서', kind:'A', included:true, r:{st:'miss', fileIds:[sealId], orgUpload:{status:'none'}}}
]};
check('★★ 직인은 AI 전송 대상에서 빠진다',
      window.extractableItems(caseSend).map(i => i.key).indexOf('appl_corp_scan') < 0,
      window.extractableItems(caseSend).map(i => i.key));
check('   영수증은 그대로 전송된다 (차단이 번지지 않는다)',
      window.extractableItems(caseSend).map(i => i.key).indexOf('proof_buy') >= 0,
      window.extractableItems(caseSend).map(i => i.key));

console.log('\n' + '─'.repeat(60));
console.log(fail ? `❌ ${fail}개가 어긋납니다` : '✅ 법인 직인 경로가 개인 경로와 갈려 제대로 돕니다');
process.exit(fail ? 1 : 0);
