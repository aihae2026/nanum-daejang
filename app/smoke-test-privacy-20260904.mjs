/* 2026-09-04 코칭 후 결정이 코드에 실제로 걸려 있는가 (선미)

   ★ 무엇을 지키는 검사인가 — 결정 세 개를 코드가 어기지 않는지 본다.
     문서에만 적힌 결정은 다음 사람이 모른다. 여기 걸어두면 어긴 순간 빨개진다.

     ① AI 전송 — 신청서는 어떤 경우에도 모델로 보내지 않는다
        "AI 전송은 폼에 입력된 내용 중 개인정보를 제외한 정보만 되도록 한정한다
         (신청서 파일을 통째로 보내는 일은 없도록)"
     ② 법인 신청서 — **전자서명 또는 인감 서면 스캔본, 둘 중 하나**
        (9/4 저녁 보완 — 낮에는 "법인은 무조건 인감" 이었으나 전자서명을 쓰는 법인도 있다)
        ⚠️ 둘 다 없는 상태는 통과시키지 않는다 (기관 업무지침)
     ③ 파기 — 삭제 수단이 실제로 있다 (9/1 에 막아둔 것을 풀었다)

   ⚠️ 이 검사는 **부숴서 잡히는지**까지 본다 (팀 관례).
     차단 목록을 비우면 신청서가 전송 대상에 들어오는 것을 확인한다 —
     그래야 이 검사가 '늘 통과하는 검사' 가 아님이 증명된다.

   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-privacy-20260904.mjs
*/
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';   /* ⚠️ .pathname 은 한글 폴더를 %ED… 로 인코딩해 파일을 못 찾는다 (2026-09-05 집 PC 실측) */
import { appScripts } from './app-scripts.mjs';   /* 스크립트 목록은 index.html 에서 읽는다 — 손으로 베끼지 않는다 (2026-09-05 · 정본 ⑥) */
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
/* ⚠️ 2026-09-04 — pdf-form.js 가 빠져 있었다. screen-donor.js 가 그 안의 함수를 부르는 순간
     이 검사가 **한 항목도 못 찍고 죽는다**(그날 오전 smoke-test-silent 이 그렇게 죽었다).
     근본은 정본 ⑥ — 스크립트 목록이 index.html 과 검사 19곳에 따로 적혀 있다. */
for (const f of appScripts())
  window.eval(readFileSync(APP + f, 'utf8'));

const judgeSrc  = readFileSync(APP + 'functions/judge.js', 'utf8');
const patchSrc  = readFileSync(APP + 'patch-20260904-purge.sql', 'utf8');
const dbSrc     = readFileSync(APP + 'db.js', 'utf8');

let fail = 0;
const check = (n, ok, got) => {
  console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got)));
  if (!ok) fail++;
};

/* 첨부가 붙은 것처럼 꾸민 항목 하나 — judgeableFileId 가 blob 을 보므로 가짜 blob 을 등록한다 */
function withFile(key, name, kind){
  const id = 'f_' + key;
  window.FILES[id] = {id, name:name || (key + '.png'), type:'image/png', size:10, blob:{}};
  return {key, n:name || key, kind:kind || 'A', included:true, stage:'접수',
          r:{st:'miss', fileIds:[id], orgUpload:{status:'none'}}};
}

console.log('\n════════ ① AI 전송 — 신청서는 보내지 않는다 ════════');

console.log('\n[화면 쪽 차단 — api.js]');
check('★ 차단 목록에 신청서 4종이 다 있다',
      ['appl_corp','appl_indiv','appl_g','appl_corp_scan']
        .every(k => window.AI_BLOCKED_KEYS.indexOf(k) >= 0),
      window.AI_BLOCKED_KEYS);

const caseCorp = {checklist:[
  withFile('appl_corp_scan', '법인인감(직인) 날인 이미지'),
  withFile('proof_buy',      '구매영수증 또는 매입세금계산서'),
  withFile('photo',          '물품사진')
]};
const sent = window.extractableItems(caseCorp).map(i => i.key);
check('★★ 신청서 스캔본이 전송 대상에서 빠진다',
      sent.indexOf('appl_corp_scan') < 0, sent);
check('가액 증빙·물품사진은 그대로 간다 (AI 검수가 죽지 않는다)',
      sent.indexOf('proof_buy') >= 0 && sent.indexOf('photo') >= 0, sent);
check('★ E1 판정 대상에도 안 들어간다',
      window.judgeableItems(caseCorp).every(i => i.key !== 'appl_corp_scan'),
      window.judgeableItems(caseCorp).map(i => i.key));

console.log('\n[신청서가 파일(A)로 서 있어도 막히는가 — 키로 막기 때문]');
const asFile = [{key:'appl_indiv', n:'물품기부신청서(법인 외용)', kind:'A', included:true, stage:'접수',
                 r:{st:'miss', fileIds:['f_paper'], orgUpload:{status:'none'}}}];
window.FILES['f_paper'] = {id:'f_paper', name:'신청서.png', type:'image/png', size:10, blob:{}};
check('★★ kind 가 A 여도 전송 대상이 아니다 (kind 가 아니라 키를 보기 때문)',
      window.extractableItems({checklist:asFile}).length === 0,
      window.extractableItems({checklist:asFile}).map(i => i.key));

console.log('\n[부숴서 잡히는가 — 차단 목록을 비우면 신청서가 들어온다]');
const keep = window.AI_BLOCKED_KEYS.slice();
window.AI_BLOCKED_KEYS.length = 0;
check('★ 차단을 걷어내면 신청서가 전송 대상에 들어온다 (검사가 진짜다)',
      window.extractableItems(caseCorp).map(i => i.key).indexOf('appl_corp_scan') >= 0,
      window.extractableItems(caseCorp).map(i => i.key));
keep.forEach(k => window.AI_BLOCKED_KEYS.push(k));
check('되돌리면 다시 막힌다',
      window.extractableItems(caseCorp).map(i => i.key).indexOf('appl_corp_scan') < 0,
      window.extractableItems(caseCorp).map(i => i.key));

console.log('\n[서버 쪽 차단 — functions/judge.js (화면을 우회해도 막힌다)]');
check('★ 서버에 신청서 차단 규칙이 있다', /AI_BLOCKED_DOC_RE/.test(judgeSrc), false);
check('★ 모델을 부르기 전에 끊는다 (callGemini/extractFacts 앞에 선다)',
      judgeSrc.indexOf('AI_BLOCKED_DOC_RE.test(docType)') < judgeSrc.indexOf('mode === "extract"'),
      [judgeSrc.indexOf('AI_BLOCKED_DOC_RE.test(docType)'), judgeSrc.indexOf('mode === "extract"')]);
/* ★ 정규식을 여기 다시 적지 않는다 (2026-09-10) — 전에는 /신청서/ 를 그대로 옮겨 적었다.
     judge.js 를 고치면 이 검사만 옛 규칙을 보게 되어, 정작 지켜야 할 것을 안 지킨다.
     그래서 **원본에서 읽어온다** — 규칙은 judge.js 한 곳에만 산다. */
const blockReSrc = (judgeSrc.match(/const AI_BLOCKED_DOC_RE = \/(.+?)\/;/) || [])[1];
check('★ 서버 차단 정규식을 읽어올 수 있다 (모양이 바뀌면 여기서 먼저 깨진다)', !!blockReSrc, blockReSrc);
const blockRe = new RegExp(blockReSrc || '$^');
const docNames = [];
Object.values(window.DOC_MATRIX).forEach(byPath =>
  Object.values(byPath).forEach(list => list.forEach(d => docNames.push(d))));
window.DIST_DOCS.forEach(d => docNames.push(d));
const wrongly = docNames.filter(d => blockRe.test(d.name) && window.AI_BLOCKED_KEYS.indexOf(d.key) < 0);
check('★ 이름으로 막아도 오차단이 없다 (신청서 아닌 서류에 "신청서" 가 안 들어 있다)',
      wrongly.length === 0, wrongly.map(d => d.key + ':' + d.name));
const missed = docNames.filter(d => window.AI_BLOCKED_KEYS.indexOf(d.key) >= 0 && !blockRe.test(d.name));
check('★ 반대로 놓치는 것도 없다 (차단 키의 이름이 전부 서버 정규식에 걸린다)',
      missed.length === 0, missed.map(d => d.key + ':' + d.name));

console.log('\n════════ ② 법인 신청서 — 직인 날인 필수 (2026-09-10 재설계) ════════');

console.log('\n[체크리스트가 폼 + 직인 칸을 둘 다 세우는가 — 직인은 언제나 필수]');
for (const path of ['구매', '제조·유통']){
  const cl = window.autoChecklist('법인', path, true, 'foundation').map(i => i.key);
  check(path + ' — 폼(appl_corp)이 있다', cl.indexOf('appl_corp') >= 0, cl);
  check(path + ' — ★ 직인 날인 칸(appl_corp_scan)이 있다 (언제나 필수)', cl.indexOf('appl_corp_scan') >= 0, cl);
}
const clIndiv = window.autoChecklist('법인외', '구매', true, 'foundation').map(i => i.key);
check('★ 법인 외에는 스캔본 칸이 아예 없다 (인감이 필요한 법인으로 한정)',
      clIndiv.indexOf('appl_corp_scan') < 0, clIndiv);

console.log('\n[스캔본이 첨부 칸(A)으로 서는가 — 여기 서야 파일을 받을 수 있다]');
const scanItem = window.autoChecklist('법인', '구매', true, 'foundation')
  .find(i => i.key === 'appl_corp_scan');
check('kind 가 A 다', scanItem && scanItem.kind === 'A', scanItem && scanItem.kind);
check('접수 단계다', scanItem && scanItem.stage === '접수', scanItem && scanItem.stage);
check('★ 안내에 "AI로 전송하지 않습니다" 가 적혀 있다 (후원자가 읽는 문장)',
      /AI로 전송하지 않습니다/.test((scanItem && scanItem.note) || ''), scanItem && scanItem.note);
/* 2026-09-11 선미 — 안내를 한 줄로 줄였다. "법인은 필수" 는 첨부 카드 머리말이, PDF 날인은 직인 카드 태그·미리보기가 말한다.
   여기서는 줄인 문장 자체와, 줄이면서도 잃으면 안 되는 것(AI 미전송)을 본다. */
check('★ 안내가 한 줄로 줄었다 — "부분만 스캔하여 업로드"',
      /법인인감\(직인\) 부분만 스캔하여 업로드/.test((scanItem && scanItem.note) || ''), scanItem && scanItem.note);
check('★ 줄이면서도 "AI로 전송하지 않습니다" 는 남겼다 (국외 이전 동의문의 짝)',
      /AI로 전송하지 않습니다/.test((scanItem && scanItem.note) || ''), scanItem && scanItem.note);
check('   전자서명 대안을 더는 말하지 않는다',
      !/전자서명을 하지 않으시는 경우/.test((scanItem && scanItem.note) || ''), scanItem && scanItem.note);

console.log('\n[규칙 함수 corpApplRoute — 직인 하나]');
check('직인이 있으면 seal',
      window.corpApplRoute({signed:false, files:{appl_corp_scan:['x']}}) === 'seal',
      window.corpApplRoute({signed:false, files:{appl_corp_scan:['x']}}));
check('★★ 전자서명이 있어도 직인이 없으면 null (서명으로 갈음되지 않는다)',
      window.corpApplRoute({signed:true, files:{}}) === null, window.corpApplRoute({signed:true, files:{}}));
check('직인 파일 id 를 집어 준다 (PDF 날인이 같은 자리를 본다)',
      window.corpSealFileId({files:{appl_corp_scan:['abc']}}) === 'abc',
      window.corpSealFileId({files:{appl_corp_scan:['abc']}}));
check('★★ 직인이 없으면 null (통과시키지 않는다)',
      window.corpApplRoute({signed:false, files:{}}) === null, window.corpApplRoute({signed:false, files:{}}));
check('서명이 같이 있어도 판정은 직인이다 (서명은 법인 경로에서 무시된다)',
      window.corpApplRoute({signed:true, files:{appl_corp_scan:['x']}}) === 'seal',
      window.corpApplRoute({signed:true, files:{appl_corp_scan:['x']}}));

console.log('\n[제출 검증 — 법인은 직인 필수, 법인 외는 서명 필수]');
/* ★ donDate 를 적어 둔다 (2026-09-06 M-1) — 폼 기본값이 오늘이던 때에는 없어도 통과했다.
     지금은 후원자가 직접 넣는 칸이라 비면 막힌다. 이 검사가 보는 것은 서명/인감뿐이므로 채워 준다. */
const baseForm = () => ({donorType:'법인', path:'구매', donorName:'(주)나눔', itemName:'즉석밥', qty:10, donDate:'2026-09-04',
  unitBook:1000, unitSale:1000, agreePurpose:true, agreeDouble:true, privacyTransfer:true, corpAck:true, privacy:true,
  /* 영수증 미희망 — 희망하면 주민번호 칸이 따로 필수다(양식 규칙). 여기서 보는 것은 서명/인감뿐이라 끈다 */
  wantsReceipt:false, rrn:'', under14:false, guardian:false, note:'', giftVal:'', saleVal:'',
  signed:false, signImg:null, files:{proof_buy:['x'], photo:['x']}});
const donorErrsFor = (patch) => {
  window.DB.req.donorType = patch.donorType || '법인';
  window.DB.req.path = '구매';
  window.DB.donorForm = Object.assign(window.DB.donorForm, baseForm(), patch);
  window.DB.donorForm.linkCaseId = null;
  return window.donorErrors(window.DB.donorForm);
};

let errs = donorErrsFor({});
check('★★ 법인 — 직인 날인이 없으면 막힌다',
      errs.some(e => /직인.*날인이 원본 증빙/.test(e)), errs);
check('   전수 검사에서도 같이 잡힌다 (조건부 예외를 없앴다 · 2026-09-10)',
      errs.some(e => /첨부가 필요한 서류/.test(e)), errs);

errs = donorErrsFor({signed:true});
check('★★ 법인 — 전자서명만으로는 제출되지 않는다 (직인을 대신하지 못한다)',
      errs.some(e => /직인/.test(e)), errs);

errs = donorErrsFor({signed:false, files:{proof_buy:['x'], photo:['x'], appl_corp_scan:['x']}});
check('★★ 법인 — 직인 날인만으로 제출된다 (서명을 요구하지 않는다)', errs.length === 0, errs);

errs = donorErrsFor({donorType:'법인외', donorName:'홍길동', signed:false});
check('★★ 법인 외는 여전히 서명을 요구한다 (면제가 번지지 않는다)',
      errs.some(e => /서명 또는 날인이 없는/.test(e)), errs);
errs = donorErrsFor({donorType:'법인외', donorName:'홍길동', signed:true});
check('   서명하면 통과한다', errs.length === 0, errs);

console.log('\n[대리 작성(직접 등록) 경로가 아예 없는가 — 2026-09-04 선미 결정]');
const staffSrc = readFileSync(APP + 'screen-staff.js', 'utf8');
const donorSrc = readFileSync(APP + 'screen-donor.js', 'utf8');
check('★★ 담당자가 후원자 대신 쓰는 화면이 없다 (viewProxyForm 삭제)',
      typeof window.viewProxyForm === 'undefined', typeof window.viewProxyForm);
check('★ 재진입 입구도 없다 (openProxy 삭제)',
      typeof window.openProxy === 'undefined', typeof window.openProxy);
check('★ 신청서를 파일로 바꾸던 함수가 없다 (paperizeChecklist 삭제)',
      typeof window.paperizeChecklist === 'undefined', typeof window.paperizeChecklist);
check('★★ 발송 채널에 [직접 등록]이 없다 (들어올 문이 없다)',
      window.SEND_CHANNELS.every(c => c.id !== 'direct'),
      window.SEND_CHANNELS.map(c => c.id));
check('★ 화면 코드에 paperIntake 를 읽는 곳이 없다',
      !/paperIntake/.test(staffSrc) && !/paperIntake/.test(donorSrc), 'paperIntake 가 남아 있다');
check('★★ 본인확인 값 없이는 접수를 만들 수 없다 (전에는 직접 등록이 이 검사를 건너뛰었다)',
      /if \(!reqVerifyOk\(r\)\)/.test(staffSrc), '검사가 조건부다');

console.log('\n[대신 후원자 화면은 미리보기로 본다 — 없애면서 볼 길까지 막으면 안 된다]');
window.DB.role = 'staff'; window.DB.screen = 'send';
window.DB.req = Object.assign(window.DB.req, {donorType:'법인', path:'구매'});
const sendHtml = window.renderStaff();
/* ★ 2026-09-11 선미 — 문구가 아니라 **길**을 본다.
     전에는 버튼 이름('후원자에게 보이는 화면 미리보기')과 openPreview('donor') 라는
     **구현 방법**을 글자 그대로 봤다. 9/11 에 미리보기를 ② 옆 칸 안으로 옮기면서
     이름과 여는 방법이 둘 다 바뀌어 걸렸는데, 이 검사가 지키려던 것("없애면서 볼 길까지 막지 말 것")은
     그대로였다. 그래서 여는 장치(toggleSendPreview)가 조건 없이 그려지는지로 바꾼다.
   ⚠️ 폰에서는 그 장치가 전체화면(openPreview)으로 보낸다 — 아래 셋째 줄이 그 길을 지킨다. */
check('★★ 발송 화면에 후원자 미리보기를 여는 길이 있다',
      /toggleSendPreview\(\)/.test(sendHtml), '여는 버튼이 없다');
check('   링크를 발급하기 전에도 열린다 (조건 분기 없이 그려진다)',
      /미리보기 열기|미리보기 닫기/.test(sendHtml), '조건부다');
check('★ 폰에서는 전체화면 미리보기로 간다 (칸 안 스크롤 상자를 두지 않는다 · 9/4 연수·9/5 선미 결정)',
      /isPhoneWidth\(\)\)\{ openPreview\('donor'\)/.test(staffSrc), '폰 갈래가 없다');
window.DB.preview = {kind:'donor'};
const pvHtml = window.renderStaff();
check('★ 미리보기는 역할을 바꾸지 않는다 (담당자 그대로 — 9/3 에 걷어낸 지름길과 다른 점)',
      /역할은 <b>담당자 그대로<\/b>/.test(pvHtml), '역할 표기가 없다');
check('★★ 미리보기에서는 제출 버튼이 비활성이다 (쓰기가 일어나지 않는다)',
      /disabled/.test(pvHtml), '활성이다');
window.DB.preview = null;

console.log('\n[후원자 화면을 실제로 여는 길이 화면에 적혀 있는가]');
window.DB.role = 'staff'; window.DB.screen = 'send';
window.DB.req = Object.assign(window.DB.req, {donorType:'법인', path:'구매',
  donorName:'(주)검사', channel:'copy', verifyLast4:'1234', phone:'010-1111-1234'});
window.sendLink();
const sentCase = window.DB.cases[window.DB.cases.length - 1];
sentCase.linkToken = 'tok' + sentCase.id;
const afterSend = window.renderStaff();
/* ★ 2026-09-11 선미 — 안내 문구를 걷었다. 9/3 에 "심사위원에게 유일한 길" 로 둔 것을 뒤집은 결정이다.
     길 자체는 살아 있어야 한다: [링크 복사] 버튼과 "본인확인을 거쳐야 열리고…" 힌트. 그것을 본다. */
check('★★ 발급 후 "후원자 화면을 직접 써 보려면" 안내는 없다 (9/11 선미)',
      !/후원자 화면을 직접 써 보려면/.test(afterSend), '옛 안내가 남아 있다');
check('★★ 그래도 링크로 가는 길은 살아 있다 — [링크 복사] + 본인확인 힌트',
      /링크 복사/.test(afterSend) && /본인확인을 거쳐야 열리고/.test(afterSend), '길이 사라졌다');
check('   [다음 접수] 는 없다 — 우측 상단 [＋ 신규생성] 이 그 일을 한다',
      !/다음 접수/.test(afterSend) && /신규생성/.test(afterSend), afterSend.match(/다음 접수|신규생성/g));
/* 9/11: [테스트] 를 뺐다 → 9/13 선미: [오발송]·[중복접수] 도 [접수 취소] 하나로 합쳤다 —
   사유가 DB 에 안 남는데 고르게 하는 것은 거짓 선택이었다 (cancelReasonButtons 주석) */
check('   취소 버튼은 [접수 취소] 하나뿐 — 오발송·중복접수·테스트 없음',
      />접수 취소</.test(afterSend) && !/>(오발송|중복접수|테스트)</.test(afterSend), afterSend.match(/>(접수 취소|오발송|중복접수|테스트)</g));
check('★★ 버튼 없이 남아 있던 옛 캡션이 없다 (없는 것을 있다고 말하지 않는다)',
      !/데모 전용 지름길 — 실서비스에서는/.test(afterSend), '옛 캡션이 남아 있다');
window.DB.role = 'donor';

console.log('\n[검수 화면 문구 — 제출본이 어느 쪽이었나에 따라 달라진다]');
const stScan = window.itemStatus({key:'appl_corp', r:{st:'miss', formSubmit:{status:'submitted', signed:false}}});
/* ★ 문구가 바뀌었다 (선미 결정 2026-09-06) — 폼으로 낸 신청서는 이제 '수취완료' 다.
     지키는 것은 그대로다: **인감으로 낸 건에 "전자서명을 확인하라" 고 하지 않는다.**
     담당자가 있지도 않은 서명을 찾다가 반려하는 것을 막는 것이 이 검사의 목적이다. */
check('★★ 법인 건은 직인 날인 항목을 가리킨다 (없는 서명을 찾게 하지 않는다)',
      /직인/.test(stScan.meta) && /전자서명을 쓰지 않습니다/.test(stScan.meta), stScan.meta);
check('   전자서명이 있다고 말하지 않는다', !/전자서명 확인/.test(stScan.meta), stScan.meta);
/* ★ 2026-09-10 이전에 전자서명으로 접수된 법인 건이 DB 에 남아 있다 —
     지난 기록을 다시 쓰지 않는다. 그 줄은 그때 있었던 그대로 보여야 한다. */
const stSign = window.itemStatus({key:'appl_corp', r:{st:'miss', formSubmit:{status:'submitted', signed:true}}});
check('★ 옛 전자서명 법인 건(9/10 이전)은 "전자서명 확인" 그대로 보인다',
      /전자서명 확인/.test(stSign.meta), stSign.meta);
const stIndiv = window.itemStatus({key:'appl_indiv', r:{st:'miss', formSubmit:{status:'submitted', signed:true}}});
check('법인 외는 그대로 "전자서명 확인" 이다', /전자서명 확인/.test(stIndiv.meta), stIndiv.meta);

console.log('\n[신청서 칸이 둘로 늘지 않는다]');
const clCorp = window.autoChecklist('법인', '구매', true, 'foundation');
/* ★ 2026-09-10 — 신청서는 이제 폼(S) 하나뿐이고, 첨부로 받는 것은 직인 날인 이미지다.
     그래서 이 검사가 세는 대상이 바뀌었다: '신청서' 이름의 첨부 칸은 **0개**여야 하고,
     원본 증빙 칸(appl_corp_scan)은 정확히 1개여야 한다. 둘 중 하나라도 늘면 후원자가
     같은 것을 두 번 내게 된다 — 이 검사가 막으려던 일은 그대로다. */
const applSlots = clCorp.filter(i => i.kind === 'A' && /신청서/.test(i.n));
check('★ "신청서" 이름의 첨부 칸은 없다 (신청서는 폼 S 하나뿐)',
      applSlots.length === 0, applSlots.map(i => i.key + ':' + i.n));
const sealSlots = clCorp.filter(i => i.kind === 'A' && i.key === window.CORP_SCAN_KEY);
check('★ 원본 증빙(직인 날인) 첨부 칸은 하나뿐이다',
      sealSlots.length === 1, sealSlots.map(i => i.key + ':' + i.n));
check('폼(appl_corp)은 S 로 남는다', clCorp.find(i => i.key === 'appl_corp').kind === 'S',
      clCorp.find(i => i.key === 'appl_corp').kind);

console.log('\n════════ ③ 파기 — 지울 수단이 실제로 있는가 ════════');

console.log('\n[SQL 패치]');
check('★ delete 정책을 만든다 (9/1 에 안 만든 것)', /for delete to anon/.test(patchSrc), false);
check('★ Storage 파일도 지울 수 있다', /storage\.objects for delete/.test(patchSrc), false);
check('★ 파기 예정일이 기부일자 + 1년이다',
      /donation_date[\s\S]{0,120}interval '1 year'/.test(patchSrc), false);
check('★ 기부일자가 비어도 예정일이 빈칸으로 남지 않는다 (접수일로 물러선다)',
      /coalesce\(new\.donation_date, new\.in_date/.test(patchSrc), false);
check('★★ 삭제 기록을 남긴다 (결정: "삭제 기록만 남으면 됨")',
      /purge\.execute/.test(patchSrc), false);
check('★ 감사 기록 자체는 못 지운다 (audit_log 에 delete 정책 없음)',
      !/'audit_log'/.test(patchSrc.split('-- ── 2.')[0]), false);
check('★ 신청서 PDF 도 파기 대상이다 (개인정보가 든 유일한 파일)',
      /pdf_key = null/.test(patchSrc), false);

console.log('\n[앱에서 실행할 수단 — db.js]');
check('★ 파기 실행 함수가 있다', typeof window.purgeDonation === 'function', typeof window.purgeDonation);
check('★ 파기 대상 조회가 있다', typeof window.listPurgeCandidates === 'function', typeof window.listPurgeCandidates);
check('★ 저장소 파일 삭제가 있다', typeof window.sbDeleteFile === 'function', typeof window.sbDeleteFile);
check('★★ 파일을 먼저 지우고 DB 를 나중에 건드린다 (반대면 고아 파일이 남는다)',
      dbSrc.indexOf('keys.map(sbDeleteFile)') < dbSrc.indexOf('rpc/purge_donation'),
      [dbSrc.indexOf('keys.map(sbDeleteFile)'), dbSrc.indexOf('rpc/purge_donation')]);
check('★ 파일 삭제가 실패하면 DB 파기를 하지 않는다 (반쪽 파기 금지)',
      /failed\.length[\s\S]{0,300}파기를 중단했습니다/.test(dbSrc), false);

console.log('\n[DB 미연결이면 조용히 성공하지 않는다]');
const savedCfg = window.SUPABASE_CONFIG;
window.SUPABASE_CONFIG = {url:'', key:''};
const r = await window.purgeDonation(1, 'test');
check('★ 미연결이면 실패로 돌려준다', r.ok === false && /미연결/.test(r.error || ''), r);
window.SUPABASE_CONFIG = savedCfg;

console.log('\n' + '─'.repeat(60));
if (fail){ console.log('❌ ' + fail + '건 실패'); process.exit(1); }
console.log('✅ 2026-09-04 결정 — 전부 코드에 걸려 있습니다');
