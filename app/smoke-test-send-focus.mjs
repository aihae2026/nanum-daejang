/* 접수 링크 발송 — 텍스트 칸을 떠날 때 화면이 다시 그려져 포커스를 잃지 않는가 (2026-09-11 선미 실주행)

   ★ 왜 만들었나 — 후원자명을 적고 연락처 칸을 누르면 **두 번** 눌러야 커서가 들어갔고, Tab 은 포커스를 잃었다.
       setReq 가 매번 render() 로 화면 전체를 다시 그리는데, 텍스트 칸은 onchange 라 **칸을 떠나는 순간** 발동한다.
       그 순간 방금 누른 칸이 새 DOM 으로 바뀌어 클릭이 허공에 떨어졌다.
   ★ 고친 것 — 텍스트 칸 4개(후원자명·연락처·본인확인·이메일)는 setReqQuiet 로 값만 저장하고 그리지 않는다.
       연락처 → 본인확인 값 자동 채움은 그 칸의 DOM 을 직접 갱신한다. 발급 뒤 값을 고치면(링크 무효) 그때만 그린다.

   여기서 보는 것
     ① 후원자명에 입력해도 DOM 이 바뀌지 않는다 (같은 요소가 그대로 · 포커스 유지)
     ② 연락처 입력 → 본인확인 칸이 뒷 4자리로 채워진다 — 화면을 다시 그리지 않고
     ③ 후원자명·연락처가 DOM 순서로 붙어 있다 (Tab 이 자연스럽게 넘어간다)
     ④ 링크를 발급한 뒤 후원자명을 고치면 링크가 무효가 되고, 그때는 다시 그리되 포커스가 그 칸으로 돌아온다
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-send-focus.mjs
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
for (const f of appScripts()) window.eval(readFileSync(APP + f, 'utf8'));
const W = window, DB = W.DB, doc = window.document;

let fail = 0;
const check = (n, ok, got) => {
  console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got)));
  if (!ok) fail++;
};
const type = (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new window.Event('input', {bubbles:true})); };

DB.role = 'staff'; DB.screen = 'send';
W.startNewReq(); W.render();
let renders = 0; const origRender = W.render; W.render = function(){ renders++; return origRender.apply(this, arguments); };

console.log('\n── ① 후원자명 입력 — 화면을 다시 그리지 않는다 ──');
{
  const name = doc.getElementById('req-donorName');
  check('후원자명 칸에 id 가 있다', !!name);
  type(name, '(주)검사');
  check('값이 DB.req 에 들어갔다', DB.req.donorName === '(주)검사', DB.req.donorName);
  check('render 가 불리지 않았다', renders === 0, renders);
  check('같은 DOM 요소가 살아 있다 (포커스 유지)', doc.getElementById('req-donorName') === name && doc.activeElement === name);
}

console.log('\n── ② 연락처 → 본인확인 값 자동 채움 — 다시 그리지 않고 ──');
{
  const phone = doc.getElementById('req-phone');
  type(phone, '01011115678');
  check('연락처가 하이픈 붙어 저장됐다', /010-1111-5678/.test(DB.req.phone), DB.req.phone);
  check('본인확인 값이 5678', DB.req.verifyLast4 === '5678', DB.req.verifyLast4);
  check('본인확인 칸의 DOM 값도 5678', doc.getElementById('req-verify4').value === '5678');
  check('render 가 여전히 0', renders === 0, renders);
  check('연락처 칸 포커스 유지', doc.activeElement === phone);
  /* ★ 9/11 실주행 회귀 — 값이 채워졌는데 발급 버튼이 잠긴 채 남았다. 다시 그리지 않으면서도 잠금은 풀려야 한다 */
  const btn = doc.getElementById('req-send-btn');
  check('발급 버튼이 풀렸다 (본인확인 값이 채워졌으므로)', btn && btn.disabled === false, btn && btn.disabled);
  check('"본인확인 값을 넣어야 발급됩니다" 힌트가 사라졌다', doc.getElementById('req-verify-hint').style.display === 'none');
  const v4 = doc.getElementById('req-verify4');
  type(v4, '');
  check('본인확인 값을 지우면 버튼이 다시 잠긴다', btn.disabled === true, btn.disabled);
  check('힌트가 다시 보인다', doc.getElementById('req-verify-hint').style.display === '');
  type(v4, '5678');
  check('다시 넣으면 다시 풀린다', btn.disabled === false, btn.disabled);
}

console.log('\n── ③ Tab 순서 — 후원자명 바로 다음이 연락처 ──');
{
  const inputs = Array.from(doc.querySelectorAll('input, button, select, textarea')).filter(e => !e.disabled);
  const i = inputs.indexOf(doc.getElementById('req-donorName'));
  check('후원자명 다음 포커스 대상이 연락처', inputs[i + 1] && inputs[i + 1].id === 'req-phone', inputs[i + 1] && (inputs[i + 1].id || inputs[i + 1].textContent));
}

console.log('\n── ④ 발급 뒤 값을 고치면 — 링크 무효 + 다시 그리되 포커스 복귀 ──');
{
  W.sendLink();
  const c = DB.cases[DB.cases.length - 1];
  c.linkToken = 'tok' + c.id;
  check('발급됨 (sent · caseId)', DB.req.sent === true && !!DB.req.caseId, DB.req);
  W.render(); renders = 0;
  const name = doc.getElementById('req-donorName');
  type(name, '(주)검사2');
  check('링크가 무효가 됐다 (sent=false · caseId=null)', DB.req.sent === false && DB.req.caseId === null, DB.req);
  check('이때는 다시 그린다 (1회)', renders === 1, renders);
  const again = doc.getElementById('req-donorName');
  check('새 칸에 값이 남아 있다', again.value === '(주)검사2', again.value);
  check('포커스가 그 칸으로 돌아왔다', doc.activeElement === again, doc.activeElement && doc.activeElement.id);
  type(again, '(주)검사3');
  check('그 뒤 입력은 다시 조용하다', renders === 1, renders);
}

console.log('\n' + (fail ? '❌ ' + fail + '항목 실패' : '✅ 전부 통과'));
process.exit(fail ? 1 : 0);
