/* 후원자 폼의 두 칸 — 후원일자·연락처 (2026-09-06 선미 지적 M-1·M-2)

   ★ 무엇이 있었나
     ① 후원일자 칸에 **오늘 날짜가 이미 박혀 있었다**(`donorForm.donDate:TODAY`).
        다른 칸은 흐린 예시(placeholder)인데 이 칸만 실제 값이라,
        후원자에게는 **남이 써 놓은 값을 고치는 모양**이 된다. 그대로 두고 넘어가면
        기부한 날이 아니라 '폼을 연 날' 이 기록으로 남는다.
     ② 자유 텍스트라 `20260905` · `2026.09.05` · `2026-09-05` 가 다 들어갔다.
        `toDate()` 가 셋은 알아보지만 **DB 로는 원문이 그대로 나갔고**,
        `2026년 9월 5일` 같은 것은 조용히 '판단 보류' 가 됐다.

   ★ type="date" 를 먼저 넣었다가 물렸다 (2026-09-05 선미 · 브라우저에서 보고).
     날짜 선택기는 뜨지만 **값이 이미 채워진 것처럼 보이고 흐린 예시가 안 뜬다** —
     M-1 이 없애려던 "남이 써 놓은 값을 고치는 모양" 이 그대로 남는다.
     그래서 숫자만 받고 하이픈은 칸이 붙이는 방식(maskDate)으로 바꿨다.

   ★ 그래서 일곱을 본다
     ① 폼 기본값의 후원일자가 비어 있다 (박힌 값이 아니다)
     ② 화면이 형식을 지정한다 — 숫자만 받고 하이픈은 칸이 붙인다 · 흐린 예시가 보인다
     ③ 후원일자가 비면 제출이 막힌다 (빈 채로 조용히 나가지 않는다)
     ④ 못 알아보는 날짜('2026년 9월 5일')도 막힌다 — 조용한 '판단 보류' 를 만들지 않는다
     ⑤ 알아보는 다른 표기('2026.09.05')는 제출 직전에 YYYY-MM-DD 로 정규화돼 기록된다
     ⑥ prefillDonor(데모 전용 기본값 채우기)는 그대로 오늘을 채운다 — 시연용이라 건드리지 않는다
     ⑦ 금액 칸은 콤마를 그 자리에서 붙이고, **저장은 콤마를 뗀 숫자**다 (2026-09-15 · 테스트 참여자 의견)

   데모 데이터로 돈다 — 서버·DB 불필요.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-donor-input.mjs
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

/* 그 라벨이 붙은 칸 하나만 꺼낸다 — 페이지 전체를 뒤지면 다른 칸의 속성에 우연히 통과한다
   (9/5 에 그 방식으로 두 번 거짓 통과했다) */
function fieldOf(html, label){
  const re = new RegExp('<div class="field"><label>' + label + '[\\s\\S]*?<\\/div>');
  const m = html.match(re);
  return m ? m[0] : '';
}

console.log('\n[⓪ 담당자 발송 화면도 값이 박혀 있지 않다 (2026-09-06 선미)]');
/* ★ 후원자명 칸에 '주식회사 온누리식품' 이 **실제 값**으로 들어 있었다.
     흐린 예시가 아니라 값이라, 담당자가 지우고 써야 한다. 안 지우고 넘어가면
     **엉뚱한 이름으로 접수가 만들어진다.** 후원일자(M-1)와 같은 자리다. */
check('★ 발송 화면 후원자명이 비어 있다', !window.DB.req.donorName, {donorName: window.DB.req.donorName});
check('   연락처도 비어 있다', !window.DB.req.phone, {phone: window.DB.req.phone});
window.DB.role = 'staff'; window.DB.screen = 'send';
const sendHtml = window.viewSend();
check('★ 흐린 예시로는 남아 있다 (무엇을 적는 칸인지는 보인다)',
  sendHtml.includes('placeholder="예: 주식회사 온누리식품"'), '(예시가 없다)');
check('★ 연락처도 숫자만 받고 하이픈은 칸이 붙인다',
  /oninput="this\.value=maskPhone/.test(sendHtml), '(마스크 없음)');

console.log('\n[① 폼 기본값의 후원일자가 비어 있다]');
const init = window.DB.donorForm.donDate;
check("★ 값이 박혀 있지 않다", !init, {donDate: init});
check("★ 오늘(TODAY)이 아니다", init !== window.TODAY, {donDate: init, TODAY: window.TODAY});

/* 담당자가 링크를 발급하고, 후원자가 그 링크로 폼을 연 상태를 만든다 */
Object.assign(window.DB.req, {donorType:'법인외', path:'구매', donorName:'김초록',
  phone:'010-1234-1234', channel:'copy', verifyLast4:'1234'});
window.sendLink();
const id = window.DB.req.caseId;
const f = window.DB.donorForm;
f.linkCaseId = id;
window.DB.role = 'donor'; window.DB.screen = 'donorForm';

console.log('\n[② 화면이 입력 형식을 지정한다]');
const html = window.viewDonorForm();
const fDate = fieldOf(html, '후원일자'), fTel = fieldOf(html, '연락처');
check('후원일자 칸을 찾았다', !!fDate, html.slice(0, 200));
check('연락처 칸을 찾았다', !!fTel, html.slice(0, 200));
/* 숫자 키패드가 뜨고, 글자를 칠 때마다 칸이 하이픈을 붙인다 */
check('★ 후원일자가 숫자 입력이다', /<input[^>]*inputmode="numeric"/.test(fDate), fDate);
check('★ 후원일자에 maskDate 가 걸려 있다', /oninput="this\.value=maskDate/.test(fDate), fDate);
check('★ 연락처에 maskPhone 이 걸려 있다', /oninput="this\.value=maskPhone/.test(fTel), fTel);
/* ★ 값이 아니라 **흐린 예시**여야 한다 — 주민등록번호 칸과 같은 모양 (선미 2026-09-05) */
check('★ 후원일자가 흐린 예시다 (value 는 비어 있다)',
  /value=""/.test(fDate) && /placeholder="0000-00-00"/.test(fDate), fDate);
check('★ type="date" 가 아니다 (값이 채워진 것처럼 보인다)', !/type="date"/.test(fDate), fDate);

console.log('\n[②-2 마스크가 숫자만 받고 하이픈을 붙인다]');
[['20260905', '2026-09-05'], ['2026.09.05', '2026-09-05'], ['2026', '2026'],
 ['abc2026', '2026'], ['', '']].forEach(([raw, want]) =>
  check(`  maskDate(${JSON.stringify(raw)}) = ${JSON.stringify(want)}`, window.maskDate(raw) === want, window.maskDate(raw)));
[['01012345678', '010-1234-5678'], ['0212345678', '02-1234-5678'], ['010', '010']].forEach(([raw, want]) =>
  check(`  maskPhone(${JSON.stringify(raw)}) = ${JSON.stringify(want)}`, window.maskPhone(raw) === want, window.maskPhone(raw)));

/* 후원일자를 뺀 나머지를 전부 채운다 — 이제 막히는 이유는 후원일자 하나뿐이다 */
Object.assign(f, {donorType:'법인외', path:'구매', donorName:'김초록',
  addr:'서울시 중구 무교로 20', phone:'01012341234', wantsReceipt:true, rrn:'910216-1234213',
  purpose:'지역아동 생필품 지원', itemName:'우산', qty:'100', pkg:'5박스', unitSale:'5000',
  signed:true, signImg:'data:image/png;base64,S',
  agreePurpose:true, agreeDouble:true, privacyTransfer:true, corpAck:true, privacy:true});
['proof_buy','photo'].forEach(k => { f.files[k] = ['demo:' + k]; });

const errsWith = (v) => { f.donDate = v; return window.donorErrors(f); };
const hasDateErr = (v) => errsWith(v).some(e => e.includes('후원일자'));

console.log('\n[③ 비면 막힌다]');
check('★ 빈 후원일자로는 제출할 수 없다', hasDateErr(''), errsWith(''));

console.log('\n[④ 못 알아보는 표기도 막힌다]');
check("toDate('2026년 9월 5일') 가 못 알아본다 (전제)", window.toDate('2026년 9월 5일') === null, window.toDate('2026년 9월 5일'));
check('★ 알아볼 수 없는 날짜로는 제출할 수 없다', hasDateErr('2026년 9월 5일'), errsWith('2026년 9월 5일'));

console.log('\n[⑤ 알아보는 표기는 정규화된다]');
check("'2026.09.05' 는 막히지 않는다", !hasDateErr('2026.09.05'), errsWith('2026.09.05'));
f.donDate = '2026.09.05';
await window.submitDonor();
const c = window.getCase(id);
/* ⚠️ 화면 메모리의 `c.donation` 에는 `donationDate` 자리가 없다 — 제출 시점에 안 채운다(§14 M-6).
     그래서 여기서는 같은 값이 들어가는 `arriveDate` 로 본다. DB 로 나가는 값은 정규화된 f.donDate 다. */
check('★ 원장에 2026-09-05 로 들어갔다', (c.donation || {}).arriveDate === '2026-09-05', (c.donation || {}).arriveDate);
check('★ 폼에 남은 값도 정규화됐다 (PDF·제출본이 같은 값을 본다)', f.donDate === '2026-09-05', f.donDate);

/* ★ 폼으로 낸 신청서는 그 자리에서 수취완료다 (선미 결정 2026-09-06) —
     상태를 DB(status 칸)에도 '수취완료' 로 남겨야 새로고침에 안 되돌아간다 */
const applItem = (c.checklist || []).find(it => it.kind === 'S' && it.included);
check('신청서 항목이 있다 (전제)', !!applItem, (c.checklist || []).map(it => it.kind));
check('★ 신청서가 수취완료로 확정된다', !!applItem && applItem.r.st === 'done', applItem && applItem.r);
check('   무엇으로 확정했는지 남는다', /폼 제출/.test((applItem || {r:{}}).r.by || ''), applItem && applItem.r.by);

console.log('\n[⑥ 제출 완료 화면 — 낸 사람이 확인하고 싶은 것 (2026-09-05 선미)]');
/* ★ 제출 직후 화면이다. 여기서 후원자가 보는 것은 "내가 무엇을 어떻게 냈나" 다.
     그래서 ⓐ '입고 예정일'(물류 일정처럼 읽힌다) 대신 신청일자,
     ⓑ '필요 서류 N항목'(개수) 대신 낸 서류의 이름,
     ⓒ 눌러도 막히는 [신청서 화면으로] 는 없다. */
window.DB.screen = 'donorDone';
const done = window.viewDonorDone();
check('★ "입고 예정일" 이 아니라 "신청일자"', !done.includes('입고 예정일') && done.includes('신청일자'),
  (done.match(/<span class="muted">[^<]*<\/span>/g) || []));
check('   그 값이 후원일자다', done.includes('2026-09-05'), '(없음)');
check('★ "필요 서류 N항목" 개수 표기가 없다', !/필요 서류/.test(done), (done.match(/필요 서류[^<]*/g) || []));
check('★ 낸 서류의 이름이 나온다', done.includes('낸 서류'), '(없음)');
check('   신청서는 파일이 아니라 이 화면이 원본이라고 말한다', done.includes('이 화면으로 작성·서명'), '(없음)');
check('★ [신청서 화면으로] 버튼이 없다 (눌러도 막히는 버튼)', !done.includes('신청서 화면으로'), '(남아 있음)');

console.log('\n[⑦ prefillDonor(데모)는 그대로 오늘을 채운다]');
window.DB.donorForm.submittedId = null;
window.prefillDonor();
check('데모 기본값은 오늘', window.DB.donorForm.donDate === window.TODAY,
  {donDate: window.DB.donorForm.donDate, TODAY: window.TODAY});

/* ═══════════════════════════════════════════════════════════════
   ⑧ 금액 칸 천 단위 표기 (2026-09-15 선미 · 테스트 참여자 의견)
     "금액(숫자) 입력할 때 천단위 표기가 자동으로 되면 입력하기 더 쉬울 것 같아요"

   ★ 급소는 **저장값**이다. maskPhone·maskBizNo 는 마스크한 값을 그대로 저장하지만
     금액은 giftValOf 가 `Number(f.giftVal) || 0` 으로 읽는다 —
     '1,820,000' 을 저장하면 Number() 가 NaN 을 내고 **기부가액이 조용히 0 이 된다.**
     donorErrors 의 numBad() 도 "숫자만 적어 주세요" 로 막는다.
     그래서 화면은 maskMoney, 저장은 moneyDigits 로 가른다. 아래가 그 경계를 지킨다.
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[⑧-1 maskMoney · moneyDigits — 순수 함수]');
check('★ 콤마를 붙인다', window.maskMoney('1820000') === '1,820,000', window.maskMoney('1820000'));
check('   세 자리 이하는 그대로', window.maskMoney('500') === '500', window.maskMoney('500'));
check('   숫자가 아닌 것은 버린다', window.maskMoney('1,8a2b0,0 00') === '1,820,000', window.maskMoney('1,8a2b0,0 00'));
check('   앞의 0 을 떨어낸다', window.maskMoney('007') === '7', window.maskMoney('007'));
check("   '0' 하나는 남긴다", window.maskMoney('0') === '0', window.maskMoney('0'));
check('★ 빈 칸은 빈 칸으로 — 자동계산으로 돌아가는 길이다',
  window.maskMoney('') === '' && window.moneyDigits('') === '',
  [window.maskMoney(''), window.moneyDigits('')]);
check('   빈 칸은 직접입력으로 세지 않는다', window.isOverridden(window.moneyDigits('')) === false,
  window.isOverridden(window.moneyDigits('')));
check('★ 저장값에는 콤마가 없다', window.moneyDigits('1,820,000') === '1820000', window.moneyDigits('1,820,000'));
check('★ 저장값이 숫자로 읽힌다 (NaN → 0 사고를 막는다)',
  Number(window.moneyDigits('1,820,000')) === 1820000, Number(window.moneyDigits('1,820,000')));
check('   13자리에서 자른다', window.moneyDigits('1'.repeat(20)).length === 13, window.moneyDigits('1'.repeat(20)).length);

console.log('\n[⑧-2 경계 — 콤마로 친 값이 기부가액에 그대로 들어간다]');
window.DB.role = 'donor'; window.DB.screen = 'donorForm';
const mf = window.DB.donorForm;
mf.qty = '400'; mf.unitBook = window.moneyDigits('12,500'); mf.unitSale = window.moneyDigits('13,500');
check('★ 단가도 콤마 없이 저장된다', mf.unitBook === '12500', mf.unitBook);
check('★ 자동계산이 돈다 (400 × 12,500 = 5,000,000)',
  window.autoGift(mf, true) === 5000000, window.autoGift(mf, true));
mf.giftVal = window.moneyDigits('1,820,000');
check('★ 직접 입력한 기부가액이 0 이 되지 않는다',
  window.giftValOf(mf, true) === 1820000, window.giftValOf(mf, true));
check('   직접 입력으로 잡힌다', window.isOverridden(mf.giftVal) === true, mf.giftVal);
check('★ "숫자만 적어 주세요" 가 뜨지 않는다',
  !window.donorErrors(mf).some(e => /숫자만/.test(e)), window.donorErrors(mf).filter(e => /숫자만/.test(e)));
mf.giftVal = '';
check('   비우면 자동계산으로 돌아간다',
  window.giftValOf(mf, true) === window.autoGift(mf, true), window.giftValOf(mf, true));
/* ★ 경계 너머 — 신청서 PDF 와 DB 제출본까지 숫자로 도착하나 (2026-09-15 전반 점검에서 손으로 확인한 것을 검사로)
     submissionPayload 의 '단가' 는 Number(f.unitBook) || Number(f.unitSale) || null 이라 콤마면 **null** 이 된다.
     인수증(orgReceiptPdfData)에는 금액 칸이 없다 — 수량만 있고, 수량은 마스크 대상이 아니다. */
mf.giftVal = window.moneyDigits('1,820,000');
const pdc = {id:'901', donorType:'법인', acqPath:'제조·유통'};
const pd = window.donorFormPdfData(mf, pdc);
check('★ 신청서 PDF — 단가 12500 · 합계 5000000 · total 1820000 (전부 숫자)',
  pd.items[0].unitPrice === 12500 && pd.items[0].amountBook === 5000000 && pd.total === 1820000,
  {unit: pd.items[0].unitPrice, amountBook: pd.items[0].amountBook, total: pd.total});
const pl = window.submissionPayload(mf, pdc, Number(mf.qty) || 0, window.giftValOf(mf, true), window.saleValOf(mf));
check("★ DB 제출본 — '단가' 12500 (콤마였으면 null)", pl['단가'] === 12500, pl['단가']);
check("   '장부가액' 1820000", pl['장부가액'] === 1820000, pl['장부가액']);
const rd = window.orgReceiptPdfData({recvQty:'400', recvPkg:'5박스'}, {id:'901', orgName:'늘봄'});
check('   인수증에는 금액 칸이 없다 · 수량 400 (숫자)',
  !('total' in rd) && !('unitPrice' in rd) && rd.qty === 400, Object.keys(rd));
mf.giftVal = '';

console.log('\n[⑧-3 화면 — 칸에 콤마가 보이고, 예시도 콤마로 적혀 있다]');
mf.giftVal = '1820000';
const mh = window.viewDonorForm();
check('★ 금액 칸 값에 콤마가 붙어 보인다', /value="1,820,000"/.test(mh),
  (mh.match(/value="[0-9,]{5,}"/g) || []));
check('★ 금액 칸이 콤마를 그 자리에서 붙인다 (oninput)',
  /oninput="this\.value=maskMoney\(this\.value\)"/.test(mh), '(없음)');
check('★ 칸을 떠날 때 저장은 콤마를 뗀다 (onchange)',
  /onchange="setDonor\('giftVal',moneyDigits\(this\.value\)\)"/.test(mh), '(없음)');
/* 단가 칸은 유형마다 다른 칸이다 — 법인외는 단가(판매가액), 법인은 단가(장부가액). 둘 다 본다. */
check('   단가(판매가액) 칸도 같다 — 법인외',
  /onchange="setDonor\('unitSale',moneyDigits\(this\.value\)\)"/.test(mh), '(없음)');
check('   폰 숫자 키패드가 뜬다 (inputmode)', (mh.match(/inputmode="numeric"/g) || []).length >= 3,
  (mh.match(/inputmode="numeric"/g) || []).length);
check('★ 흐린 예시도 콤마로 형식을 보여준다 — 법인외', /placeholder="예: 13,500"/.test(mh), '(없음)');
check('   수량 칸에는 콤마를 붙이지 않는다 (금액이 아니다)',
  /placeholder="예: 400"/.test(mh), '(없음)');
/* ⚠️ f.donorType 은 그릴 때마다 링크 건에서 덮어쓴다 (PRD Q3 — 유형은 담당자가 지정).
     그래서 폼이 아니라 **링크 건**의 유형을 바꿔야 법인 화면이 나온다. */
const lcase = window.linkCase();
const wasType = lcase ? lcase.donorType : null;
if (lcase) lcase.donorType = '법인';
const mhCorp = window.viewDonorForm();
check('   단가(장부가액) 칸도 같다 — 법인',
  /onchange="setDonor\('unitBook',moneyDigits\(this\.value\)\)"/.test(mhCorp), '(없음)');
check('★ 흐린 예시도 콤마로 형식을 보여준다 — 법인', /placeholder="예: 12,500"/.test(mhCorp), '(없음)');
if (lcase) lcase.donorType = wasType;
mf.giftVal = '';

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 후원일자는 후원자가 넣고, 형식은 화면이 지정한다');
process.exit(fail ? 1 : 0);
