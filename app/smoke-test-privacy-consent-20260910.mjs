/* 동의 문구 확정안 반영 — 국외 이전 · 수집 항목 · 보유 기간 · 법인 고지 (2026-09-10 선미)

   ★ 무엇이 있었나
     대응안(privacy-response-plan-20260910.docx)에서 네 가지가 확정됐는데
     **문서에만 있고 코드에는 없었다.** 화면과 PDF 는 9/9 문구 그대로였다.
       ① 수집 항목이 전부 '필수정보' 한 줄이었다 — 주민등록번호는 기부금영수증을
          원하는 사람에게만 필요하다. 전부 필수로 적으면 사실과 다르고,
          법 제16조 ③(선택 항목 미동의를 이유로 서비스 거부 금지)에도 걸린다.
       ② 보유 기간이 "후원회원가입일로부터 회원 탈퇴 시까지" 였다 — 물품기부에는
          '가입·탈퇴' 라는 시점이 없다. 재단 보유 기준인 5년으로 적는다.
       ③ **국외 이전 동의가 아예 없었다.** 서류 이미지가 Google LLC·Cloudflare
          (둘 다 미국)로 나가는데 동의도 고지도 없었다 — 법 제28조의8 ① 1호.
          대응안에서 🔴 로 표시된 유일한 항목이다.
       ④ 법인 후원자에게는 동의 카드가 **아예 안 떴다**(if (!corp)). 법인이 내는
          거래명세서·세금계산서에는 담당자 성명·연락처가 섞여 온다(9/3 실서류 12건 확인).

   ★ 그래서 아홉을 본다
     ① 수집 항목이 필수·선택으로 나뉘고, 주민등록번호가 선택 쪽에 있다
     ② 보유 기간이 "물품기부신청일로부터 5년" 이다 (옛 문구가 남아 있지 않다)
     ③ 국외 이전 문구가 상수 하나로 있고, 법이 요구하는 것을 담는다
        (이전 항목 · 받는 자 · 국가 · 시기 · 보유기간 · 거부권과 대체 경로)
     ④ 개인 후원자 화면에 국외 이전 동의 체크박스가 그려진다
     ⑤ 국외 이전에 동의하지 않으면 제출이 막힌다
     ⑥ 법인 후원자 화면에 서류 속 개인정보 고지가 그려진다
     ⑦ 법인이 확인 체크를 하지 않으면 제출이 막힌다
     ⑧ 위탁 안내는 접힌 안내이고 체크박스가 아니다 (위탁은 동의 대상이 아니라 공개 대상)
     ⑨ 문구가 pdf-form.js 한 곳에서 온다 — 화면과 PDF 가 갈리지 않는다(9/5 구조)

   ⚠️ 이 검사는 문구의 '있음' 만 본다. 법령 해석이 맞는지는 재단 부서 회신으로 정해진다
      (대응안 맨 끝 경고). 회신이 오면 문안이 바뀌고 이 검사의 기대값도 같이 바뀐다.

   데모 데이터로 돈다 — 서버·DB 불필요.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-privacy-consent-20260910.mjs
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

const CONSENT = window.DONOR_CONSENT_LINES || [];
const joined = CONSENT.join('\n');

console.log('\n[① 수집 항목이 필수·선택으로 나뉜다]');
check('★ 필수정보 줄이 있다', /필수정보/.test(joined), joined);
check('★ 선택정보 줄이 있다 — 전부 필수가 아니다', /선택정보/.test(joined), joined);
/* 주민등록번호는 기부금영수증을 원할 때만 필요하다 — 필수 줄에 있으면 사실과 다르다 */
const mustLine = CONSENT.find(s => /필수정보/.test(s)) || '';
const optLine  = CONSENT.find(s => /선택정보/.test(s)) || '';
check('★ 주민등록번호가 필수 줄에 없다', !/주민등록번호/.test(mustLine), mustLine);
check('★ 주민등록번호가 선택 줄에 있다', /주민등록번호/.test(optLine), optLine);
check('★ 선택인 이유가 적혀 있다 (기부금영수증)', /기부금영수증/.test(optLine), optLine);

console.log('\n[② 보유 기간이 5년이다]');
check('★ "물품기부신청일로부터 5년" 이 있다', /물품기부신청일로부터 5년/.test(joined), joined);
/* ★ 2026-11-10 (오픈소스 점검 §4-3) — 접수 시스템 사본의 파기(기부일자+1년, purge_donation)도 동의문에 적는다 */
check('★ 접수 시스템 보관분은 "기부일로부터 1년" 뒤 파기한다고 적혀 있다', /기부일로부터 1년[\s\S]{0,20}파기/.test(joined), joined);
check('★ 옛 문구("후원회원가입일…탈퇴")가 남아 있지 않다',
  !/후원회원가입일/.test(joined) && !/탈퇴 시까지/.test(joined), joined);

console.log('\n[③ 국외 이전 문구가 상수 하나로 있다]');
const TR = window.DONOR_TRANSFER_LINES;
check('★ DONOR_TRANSFER_LINES 가 있다', Array.isArray(TR) && TR.length > 0, typeof TR);
const tr = (TR || []).join('\n');
check('  법 제28조의8 을 근거로 든다', /제28조의8/.test(tr), tr);
check('  받는 자 — Google LLC (미국)', /Google LLC/.test(tr) && /미국/.test(tr), tr);
check('  받는 자 — Cloudflare', /Cloudflare/.test(tr), tr);
check('  이전 항목이 증빙서류 이미지로 한정된다', /(영수증|증빙)/.test(tr) && /이미지/.test(tr), tr);
/* ★ 신청서는 안 보낸다는 것을 동의문에서도 말한다 — 두 겹 차단의 근거(9/4 결정) */
check('  신청서는 보내지 않는다고 적혀 있다', /신청서는[\s\S]{0,20}보내지 않습니다/.test(tr), tr);
check('  처리 국가가 가변임을 고지한다 (9/10 확정 형식)', /(지정하는 국가|특정하지)/.test(tr), tr);
/* ★ 거부해도 기부할 수 있어야 동의가 유효하다 — 대체 경로가 없으면 사실상 강제 동의 */
check('★ 거부권이 적혀 있다', /거부/.test(tr), tr);
check('★ 거부 시 대체 경로(서면 신청서)가 적혀 있다', /서면 신청서/.test(tr), tr);

console.log('\n[④ 개인 후원자 화면에 국외 이전 동의가 그려진다]');
Object.assign(window.DB.req, {donorType:'법인외', path:'구매', donorName:'김초록',
  phone:'010-1234-1234', channel:'copy', verifyLast4:'1234'});
window.sendLink();
const id = window.DB.req.caseId;
const f = window.DB.donorForm;
f.linkCaseId = id;
window.DB.role = 'donor'; window.DB.screen = 'donorForm';
f.donorType = '법인외';
const html = window.viewDonorForm();
check('★ 국외 이전 체크박스가 있다', /setDonor\('privacyTransfer'/.test(html), '(없다)');
check('  국외 이전 문구가 화면에 그려진다', /제28조의8/.test(html), '(문구 없음)');
check('★ 위탁 안내가 접힌 안내다 (<details>)', /<details/.test(html), '(없다)');
check('★ 위탁 안내에는 체크박스가 없다 — 위탁은 동의 대상이 아니다',
  !/setDonor\('(entrust|consign)/.test(html), '(체크박스가 있다)');

console.log('\n[⑤ 국외 이전 미동의면 제출이 막힌다]');
Object.assign(f, {donorType:'법인외', path:'구매', donorName:'김초록',
  addr:'서울시 중구 무교로 20', phone:'01012341234', donDate:'2026-09-05',
  wantsReceipt:true, rrn:'910216-1234213',
  purpose:'지역아동 생필품 지원', itemName:'우산', qty:'100', unitSale:'5000',
  signed:true, signImg:'data:image/png;base64,S',
  agreePurpose:true, agreeDouble:true, privacy:true, privacyTransfer:false});
['proof_buy','photo'].forEach(k => { f.files[k] = ['demo:' + k]; });
let errs = window.donorErrors(f);
check('★ 미동의면 막힌다', errs.some(s => /국외/.test(s)), errs);
f.privacyTransfer = true;
errs = window.donorErrors(f);
check('★ 동의하면 그 이유로는 안 막힌다', !errs.some(s => /국외/.test(s)), errs);

console.log('\n[⑥ 법인 후원자에게 서류 속 개인정보 고지가 그려진다]');
/* ★ 유형은 담당자가 링크를 발급할 때 정하고, 후원자는 바꿀 수 없다(PRD Q3).
     viewDonorForm 이 링크 건의 값으로 덮으므로 **법인 링크를 따로 발급해야** 법인 화면이 나온다.
     폼 객체에 donorType 만 넣는 것으로는 안 된다 — 9/10 이 검사를 쓰다 걸린 자리. */
Object.assign(window.DB.req, {donorType:'법인', path:'구매', donorName:'주식회사 온누리식품',
  phone:'010-9999-8888', channel:'copy', verifyLast4:'8888'});
window.sendLink();
const fc = window.DB.donorForm;
fc.linkCaseId = window.DB.req.caseId;
const htmlCorp = window.viewDonorForm();
check('★ 법인에게도 고지 카드가 뜬다', /제출 서류에 포함된 개인정보/.test(htmlCorp), '(안 뜬다)');
check('  확인 체크박스가 있다', /setDonor\('corpAck'/.test(htmlCorp), '(없다)');
/* ★ "동의합니다" 가 아니라 "확인합니다" 다 — 법인은 정보주체가 아니라 동의할 수 없다 */
check('★ "동의" 가 아니라 "확인" 이다', /확인합니다/.test(htmlCorp) , '(문구 다름)');
check('  법인인감 신청서는 AI 로 안 보낸다고 적혀 있다', /법인인감/.test(htmlCorp), '(없다)');

console.log('\n[⑦ 법인이 확인 안 하면 제출이 막힌다]');
Object.assign(fc, {donorType:'법인', path:'구매', donorName:'주식회사 온누리식품',
  donDate:'2026-09-05', purpose:'지역아동 생필품 지원', itemName:'우산', qty:'100',
  unitBook:'4000', unitSale:'5000', signed:true, signImg:'data:image/png;base64,S',
  agreePurpose:true, agreeDouble:true, corpAck:false});
['proof_buy','photo','bizreg'].forEach(k => { fc.files[k] = ['demo:' + k]; });
let ec = window.donorErrors(fc);
check('★ 확인 안 하면 막힌다', ec.some(s => /서류에 포함된 개인정보|확인/.test(s)), ec);
fc.corpAck = true;
ec = window.donorErrors(fc);
check('★ 확인하면 그 이유로는 안 막힌다',
  !ec.some(s => /서류에 포함된 개인정보/.test(s)), ec);

console.log('\n[⑧ 문구는 한 곳에서 온다 — 화면과 PDF 가 갈리지 않는다]');
/* 9/5 구조: pdf-form.js 의 배열 하나를 화면과 PDF 가 같이 읽는다.
   두 군데 적으면 다음 수정 때 반드시 갈린다(대응안 §1-5). */
const pdfSrc = readFileSync(APP + 'pdf-form.js', 'utf8');
const donorSrc = readFileSync(APP + 'screen-donor.js', 'utf8');
check('★ 국외 이전 문구가 pdf-form.js 에 정의돼 있다',
  /var DONOR_TRANSFER_LINES\s*=/.test(pdfSrc), '(없다)');
/* ★ 주석에 조문 번호를 적는 것은 문구를 복제한 것이 아니다 — 근거를 남기는 것이다.
     주석과 문자열을 갈라 보지 않으면 "왜 이렇게 짰나" 를 적을 수 없게 된다(9/10 이 검사를 쓰다 걸린 자리). */
const donorCode = donorSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
check('★ screen-donor.js 가 문구를 따로 갖고 있지 않다 (주석 제외)',
  !/제28조의8/.test(donorCode), '(문구가 화면 쪽 코드에도 있다)');
check('★ 법인 고지 문구도 pdf-form.js 에 있다',
  /var CORP_DOC_NOTICE_LINES\s*=/.test(pdfSrc), '(없다)');

console.log('\n[⑨ PDF 에도 국외 이전 동의가 찍힌다]');
check('★ PDF 가 국외 이전 블록을 그린다',
  /DONOR_TRANSFER_LINES/.test(pdfSrc.slice(pdfSrc.indexOf('function drawDonorFormPdf') >= 0
    ? pdfSrc.indexOf('function drawDonorFormPdf') : 0)), '(PDF 에 없다)');
check('★ 동의 여부(privacyTransfer)가 PDF 에 박힌다',
  /privacyTransfer/.test(pdfSrc), '(없다)');

console.log(fail ? `\n❌ ${fail}개 실패` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
