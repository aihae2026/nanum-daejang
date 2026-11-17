/* 오늘 날짜가 진짜 오늘인가 (2026-09-06 선미 · 실 DB 오염을 확인하고 고친 것)

   ★ 무엇이 있었나 — common.js 에 `var TODAY = '2026-07-21';` 이 **박혀 있었다.**
     표시만의 문제가 아니다. 이 값이 **기록으로 저장되는 자리**에 쓰인다:
       새 접수의 접수일 · 후원자 제출일 · 취소일 · 수취 처리일 · 배분결정일 ·
       검수 실행일 · 사유 해소 날짜(감사 이력)
     9/6 실 DB 조회에서 28건의 접수일·후원일이 **전부 2026-07-21** 이었다.
     신청서 서명란도 후원일자와 무관하게 늘 "2026. 7. 21." 이었다.

   ★ 그래서 넷을 본다
     ① TODAY 가 오늘(KST)이다 — 박힌 값이 아니다
     ② 새 접수의 접수일이 오늘이다
     ③ 후원자 제출도 오늘로 기록된다
     ④ 서명란 날짜가 오늘이다
        ⚠️ 서명란은 **작성일**이지 후원일자가 아니다 — 종이 양식의
          "위 작성 내용은 사실만을 작성하였음을 아래와 같이 서명합니다 <날짜>" 자리다.
          후원일자를 따라가게 하려면 그것은 **별도 결정**이다(이 검사가 그 결정을 지킨다).

   데모 데이터로 돈다 — 서버·DB 불필요.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-today.mjs
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

/* 검사가 스스로 KST 오늘을 구한다 — 앱 코드를 믿지 않는다 */
const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

console.log('\n[① TODAY 가 오늘이다]');
console.log('   TODAY = ' + window.TODAY + ' · 검사가 구한 KST 오늘 = ' + kstToday);
check('형식이 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(window.TODAY), window.TODAY);
check('★ 오늘과 같다', window.TODAY === kstToday, {TODAY: window.TODAY, kstToday});
check("★ 박혀 있던 '2026-07-21' 이 아니다", window.TODAY !== '2026-07-21', window.TODAY);

console.log('\n[② 새 접수의 접수일이 오늘]');
Object.assign(window.DB.req, {donorType:'법인외', path:'구매', donorName:'김초록',
  phone:'010-1234-1234', channel:'copy', verifyLast4:'1234'});
window.sendLink();
const id = window.DB.req.caseId;
check('접수일 = 오늘', window.getCase(id).inDate === kstToday, window.getCase(id).inDate);
check('발급일 = 오늘', window.DB.req.sentAt === kstToday, window.DB.req.sentAt);

console.log('\n[③ 후원자 제출도 오늘로 기록된다]');
const f = window.DB.donorForm;
f.linkCaseId = id;
Object.assign(f, {donorType:'법인외', path:'구매', donorName:'김초록', donDate:'2026-01-15',
  addr:'서울시 중구 무교로 20', phone:'01012341234', wantsReceipt:true, rrn:'910216-1234213',
  purpose:'지역아동 생필품 지원', itemName:'우산', qty:'100', pkg:'5박스', unitSale:'5000',
  signed:true, signImg:'data:image/png;base64,S',
  agreePurpose:true, agreeDouble:true, privacyTransfer:true, corpAck:true, privacy:true});
['proof_buy','photo'].forEach(k => { f.files[k] = ['demo:' + k]; });

/* ★ 서명란은 제출 **전** 화면에서 본다 — 제출하면 완료 화면으로 넘어간다 */
window.DB.role = 'donor'; window.DB.screen = 'donorForm';
const formHtml = window.viewDonorForm();
console.log('\n[④ 서명란 날짜 = 작성일(오늘)]');
const stamped = kstToday.replace(/-/g, '. ');
check('서명란에 오늘이 찍힌다', formHtml.includes(stamped), (formHtml.match(/사실만을[\s\S]{0,120}/) || [''])[0].replace(/<[^>]+>/g, ' ').trim());
check("★ '2026. 7. 21.' 이 아니다", !formHtml.includes('2026. 7. 21.'), '(남아 있음)');
/* 후원일자(2026-01-15)를 따라가지 않는 것이 **의도**다 — 작성일이기 때문 */
check('후원일자를 따라가지 않는다 (작성일이다)', !formHtml.includes('2026. 01. 15.'), '(후원일자가 찍힘)');

await window.submitDonor();
check('제출 뒤 접수일 = 오늘', window.getCase(id).inDate === kstToday, window.getCase(id).inDate);

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 기록에 오늘이 찍힌다');
process.exit(fail ? 1 : 0);
