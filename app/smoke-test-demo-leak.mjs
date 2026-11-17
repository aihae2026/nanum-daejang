/* 데모 잔재 — **실서비스 화면에 시연용이 남아 있지 않은가** (2026-09-05 선미)

   ★ 무엇을 막는 검사인가
     세 자리가 isDemoMode() 게이트 없이 그려지고 있었다. 심사위원은 체험판이 아니라
     실제 서비스를 쓴다(0-A). 실 DB 로 열었는데 화면이 시연용을 보여주면 안 된다.

       ① 케이스 스위처 (screen-staff.js) — 건 상세 **맨 위, 제목보다 위**에 #101 #103 … 버튼.
          심사위원이 건 상세에서 **처음 보는 줄**이 시연 지름길이었다.
       ② 목록의 데모 설명 문구 (DB.demo.subs) — 키가 '101'·'103'·'107' 인데
          **실 DB 에 case_no='101' 이 있다**(db.js:468 주석). 그 건에 "완결 판정 시연" 이 찍혔다.
       ③ body.demo 클래스 — 폰 목업 테두리(styles.css)가 이것으로 갈린다.
          실서비스에서 340px×640px 상자에 신청서가 갇히면 PC 로 여는 심사위원의 손이 걸린다.

   ★ 어떻게 보나 — DB_SOURCE 를 'Supabase' 로 세워 **실서비스와 같은 판단**을 만든 뒤 화면을 그린다.
     (실제 접속은 하지 않는다. isDemoMode() 가 보는 값이 그것 하나다 — common.js)

   데모 데이터로 돈다 — 서버·DB 불필요.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-demo-leak.mjs
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

/* 데모 설명 문구가 붙어 있는 건을 고른다 — 없으면 ② 가 성립하지 않는다 */
const subKeys = Object.keys(window.DB.demo.subs);
const target = window.DB.cases.filter(window.isRegistered).find(c => subKeys.includes(c.id));
if (!target) { console.log('❌ DB.demo.subs 키와 겹치는 건이 없다 — 검사가 성립하지 않는다'); process.exit(1); }
const subText = window.DB.demo.subs[target.id];
console.log(`\n대상: 건 ${target.id} · 데모 문구 "${subText}"`);

const draw = (screen) => {
  window.DB.screen = screen;
  if (screen === 'case') window.DB.caseId = target.id;
  window.setBodyRole(window.DB.role);
  return window.renderStaff();
};

/* ── 데모 모드 (지금까지의 동작 — 여기서는 보여야 한다) ── */
console.log('\n[데모 모드 — 시연용이 보인다]');
window.DB_SOURCE = 'demo';
check('isDemoMode() 가 참', window.isDemoMode() === true, window.isDemoMode());
check('케이스 스위처가 보인다', draw('case').includes('케이스 스위처'), '(없음)');
check('목록에 데모 문구가 보인다', draw('list').includes(subText), '(없음)');
check('body 에 demo 클래스가 붙는다',
  window.document.body.classList.contains('demo'), window.document.body.className);

/* ── 실서비스 모드 (여기서는 하나도 없어야 한다) ── */
console.log('\n[실서비스 모드 — 시연용이 전부 사라진다]');
window.DB_SOURCE = 'Supabase';
check('isDemoMode() 가 거짓', window.isDemoMode() === false, window.isDemoMode());

const caseHtml = draw('case');
check('★ 케이스 스위처가 없다', !caseHtml.includes('케이스 스위처'), '(남아 있음)');
check('★ #' + target.id + ' 지름길 버튼이 없다',
  !/onclick="go\('case','\d+'\)">#/.test(caseHtml), (caseHtml.match(/onclick="go\('case','\d+'\)">#[^<]*/g) || []).slice(0, 3));
check('건 제목은 그대로 나온다', caseHtml.includes('#' + target.id + ' · '), '(제목 없음)');

const listHtml = draw('list');
check('★ 목록에 데모 문구가 없다', !listHtml.includes(subText), subText);
subKeys.forEach(k => {
  const t = window.DB.demo.subs[k];
  check('  "' + t.slice(0, 22) + '…" 없음', !listHtml.includes(t), t);
});
check('목록 행은 그대로 나온다', listHtml.includes('class="tb-item">#'), '(행 없음)');

check('★ body 에 demo 클래스가 없다',
  !window.document.body.classList.contains('demo'), window.document.body.className);

/* render() 가 매 렌더마다 다시 맞추는가 — Supabase 접속 결과는 첫 setBodyRole 뒤에 나온다 */
console.log('\n[접속 결과가 늦게 와도 따라온다]');
window.document.body.className = 'role-staff demo';   /* 접속 전에 붙었던 상태 */
window.render();
check('★ render() 가 demo 를 떼어낸다',
  !window.document.body.classList.contains('demo'), window.document.body.className);

window.DB_SOURCE = 'demo';
window.render();
check('데모로 돌아오면 다시 붙는다',
  window.document.body.classList.contains('demo'), window.document.body.className);

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 실서비스 화면에 시연용이 없다');
process.exit(fail ? 1 : 0);
