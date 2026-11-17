/* 화면에서 뺀 것들이 정말 없는가 (2026-09-05 선미 · 설계서 8·9장)

   ★ 무엇을 지키는 검사인가 — 세 가지를 화면에서 뺐다. 다시 기어들어오는 것을 막는다.

     ① 기한 — donation.deadline · checklist_item.due_date 는 **값을 넣는 코드가 없다.**
        새 건은 전부 '—' 이고, 값이 있는 건 db.js 에 하드코딩된 데모뿐이다(날짜도 6~7월이라
        전부 '경과' 로 떴다). '기한 임박순' 은 **정렬한다고 말하면서 정렬하지 않는** 버튼이었다.
        → 화면 6곳에서 뺐다. DB 컬럼과 daysUntil() 은 남긴다(되살릴 때 그대로 쓴다).
     ② 접수 링크 발송 페이지 설명문 — 문구 규칙 3번(미리 설명하지 않는다).
     ③ 지침 근거 딱지 — 문구 규칙 2번(왜는 쓰지 않는다). 담당자 화면·후원자 화면 둘 다.
        단 **관리자 기준자료의 '근거' 열은 남긴다** — 그 화면은 근거가 본문이다.

   데모 데이터로 돈다 — 서버·DB 불필요.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-copy-cleanup.mjs
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

const staff = (screen, caseId) => {
  window.DB.role = 'staff'; window.DB.screen = screen;
  if (caseId) window.DB.caseId = caseId;
  return window.renderStaff();
};
/* 검수 실행을 마친 건이라야 항목 카드가 그려진다 */
const inspected = window.DB.cases.filter(window.isRegistered)
  .find(c => c.inspectedAt || c.state === '완결') || window.DB.cases.find(window.isRegistered);

console.log('\n[① 기한 — 화면 6곳]');
const home = staff('home');
const list = staff('list');
const detail = staff('case', inspected.id);
window.DB.tab = 'receipts';
const receipts = staff('case', inspected.id);
window.DB.tab = 'checklist';
window.DB.role = 'admin';
const admin = window.renderAdmin();
window.DB.role = 'staff';

check('홈 표 헤더에 기한 칸이 없다', !/<th>기한<\/th>/.test(home), (home.match(/<th>[^<]*<\/th>/g) || []).join(''));
check('목록 헤더에 기한 칸이 없다', !/<th>기한<\/th>/.test(list), (list.match(/<th>[^<]*<\/th>/g) || []).join(''));
check('관리자 기준자료에 기한 열이 없다', !/<th>기한<\/th>/.test(admin), (admin.match(/<th>[^<]*<\/th>/g) || []).join(''));
check("관리자 문구에 '기한 단축' 이 없다", !admin.includes('기한 단축'), '(남아 있음)');
check("정렬 버튼에 '기한 임박순' 이 없다", !list.includes('기한 임박순'), '(남아 있음)');
check('경과·D- 알약이 없다', !/경과 \d+일|>D-\d+</.test(list), (list.match(/경과 \d+일|>D-\d+</g) || []));
check('항목 카드에 기한 배지가 없다', !/기한 \d{4}-\d{2}-\d{2}/.test(detail), (detail.match(/기한 [^<]*/g) || []).slice(0, 3));
check('수취 현황에 기한 배지가 없다', !/· 기한 /.test(receipts), (receipts.match(/· 기한 [^<]*/g) || []).slice(0, 3));

console.log('\n[① -2 기본 정렬은 오래된 순]');
window.DB.listSort = null;
const listDefault = staff('list');
check('기본 정렬 버튼이 [오래된 순] 이다',
  /class="on" onclick="setListSort\('oldest'\)"/.test(listDefault),
  (listDefault.match(/class="on" onclick="setListSort\('[a-z]+'\)"/g) || []));
/* ★ '급한 순' 은 지웠다 (2026-09-05) — 이름이 기준을 말하지 못했다("무슨 기준이지?").
     탭이 흐름을 말하므로 탭 안에서는 날짜 하나면 된다. caseUrgency 도 함께 사라졌다. */
check("'급한 순' 버튼이 없다", !listDefault.includes('급한 순'), '(남아 있음)');
check('caseUrgency 가 사라졌다', typeof window.caseUrgency === 'undefined', typeof window.caseUrgency);

console.log('\n[② 접수 링크 발송 설명문]');
const send = staff('send');
check("'유형을 정하면…' 문장이 없다", !send.includes('유형을 정하면'), '(남아 있음)');
check('제목은 그대로 있다 (9/11 「신규 접수」로 개명)', send.includes('<h2>신규 접수</h2>'), '(제목 없음)');

console.log('\n[③ 지침 근거 딱지 — 담당자·후원자에서 사라지고 관리자에는 남는다]');
const BASIS = ['기관 업무지침 · 유형별 필수서류', '기관 업무지침 · 사업자번호 (코드 검증)', '기관 업무지침 · 물품사진',
               '기관 업무지침 · 증빙불가 서류', '기관 업무지침 · 인수증 양식', '기관 업무지침 · 결과보고서 양식'];
BASIS.forEach(b => check('  발송 필요서류에 "' + b + '" 없음', !send.includes(b), b));
check('필요 서류 목록 자체는 남아 있다', send.includes('필요 서류'), '(없음)');

/* 후원자 화면 — 첨부 카드 */
window.DB.role = 'donor'; window.DB.screen = 'donorForm';
window.DB.donorForm.linkCaseId = inspected.id;
const donor = window.viewDonorForm(true);   /* 미리보기로 연다 (링크 없이도 그려진다) */
window.DB.role = 'staff';
BASIS.forEach(b => check('  후원자 화면에 "' + b + '" 없음', !donor.includes(b), b));
check('후원자 화면이 실제로 그려졌다', donor.length > 2000, donor.length);

check('★ basis-tag 클래스가 어디에도 안 쓰인다',
  !/basis-tag/.test(home + list + detail + send + donor + admin), '(남아 있음)');

check('★ 관리자 기준자료의 근거 열은 남아 있다', /<th>근거<\/th>/.test(admin), '(사라짐)');
check('  관리자에 실제 근거 값이 보인다',
  BASIS.some(b => admin.includes(b)) || /지침|업무지침|별첨/.test(admin), '(없음)');

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 뺀 것이 화면에 없고, 남길 것은 남아 있다');
process.exit(fail ? 1 : 0);
