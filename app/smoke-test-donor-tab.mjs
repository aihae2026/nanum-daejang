/* 후원자 폼 — Tab 이 다음 칸으로 간다, 크롬의 이벤트 순서에서도 (2026-09-11 선미 실주행)

   ★ 왜 만들었나 — 후원일자에서 Tab 을 누르면 기부법인명(맨 위)으로 되돌아갔다. 9/10 승희의 초점 보존 장치가
       jsdom 에서는 맞았지만 크롬에서는 빗나갔다: 크롬은 Tab 때 옛 칸에서 초점을 **먼저 떼고**(activeElement=body)
       change 를 쏜다 → "초점이 칸에 있을 때만 미룬다" 가 거짓 → render() 가 바로 돌아 새 칸이 초점을 받기 전에 DOM 이 갈렸다.
   ★ 고친 것 — change 뒤 render 는 언제나 한 틱 미룬다 · Tab keydown 때 목적지를 적어 두었다가 초점을 잃었으면 거기로.

   세 가지 순서를 다 본다: ① jsdom 순서(옛 칸에 초점 둔 채 change) ② 크롬 순서(초점 뗀 뒤 change, 새 칸은 나중에)
   ③ 최악(초점 뗀 뒤 change, 새 칸이 초점을 영영 못 받음 — DOM 이 먼저 갈린 경우) → Tab 의도로 되돌아가야 한다.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-donor-tab.mjs
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
const dom = new JSDOM(readFileSync(APP + 'index.html', 'utf8'), {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost:8788/'});
const {window} = dom; const doc = window.document;
window.HTMLCanvasElement.prototype.getContext = function(){const n=()=>{};return{lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n};};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
for (const f of appScripts()) window.eval(readFileSync(APP + f, 'utf8'));
const W = window, DB = W.DB;
let fail = 0;
const check = (n, ok, got) => { console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got))); if (!ok) fail++; };
const tick = () => new Promise(r => setTimeout(r, 5));

DB.role = 'staff'; DB.screen = 'send';
Object.assign(DB.req, {donorType:'법인', path:'구매', donorName:'(주)검사', phone:'010-1234-1234', channel:'copy', verifyLast4:'1234'});
W.sendLink();
Object.assign(DB.donorForm, {linkCaseId:DB.req.caseId, submittedId:null, verified:true, verifyInput:'', verifyTries:0});
DB.role = 'donor'; DB.screen = 'donorForm';
W.render();
const inputs = () => Array.from(doc.querySelectorAll('#phoneBody input:not([disabled])'));
const byKey = k => inputs().find(i => (i.getAttribute('onchange')||'').includes("'"+k+"'"));
const keyOf = el => el && (el.getAttribute('onchange') || el.id || el.tagName);
const change = el => el.dispatchEvent(new window.Event('change', {bubbles:true}));
const tabKey = (el, shift) => el.dispatchEvent(new window.KeyboardEvent('keydown', {key:'Tab', shiftKey:!!shift, bubbles:true}));
check('후원자 폼이 떠 있다 (후원일자·주소 칸)', !!byKey('donDate') && !!byKey('addr'));

console.log('\n── ① jsdom 순서 — 옛 칸에 초점 둔 채 change → 새 칸 focus ──');
{
  const a = byKey('donDate'), b = byKey('addr');
  a.focus(); a.value = '2026-09-11'; tabKey(a); change(a); b.focus();
  await tick();
  check('후원일자 →Tab→ 주소', keyOf(doc.activeElement) === keyOf(byKey('addr')), keyOf(doc.activeElement));
}
console.log('\n── ② 크롬 순서 — 초점 뗀 뒤(body) change → 새 칸은 그 다음에 focus ──');
{
  const a = byKey('bizNo'), b = byKey('donDate');
  a.focus(); a.value = '128-81-45907'; tabKey(a); a.blur();
  check('change 시점에 초점이 body 다 (크롬 재현)', doc.activeElement === doc.body);
  change(a);
  check('render 가 바로 돌지 않았다 (옛 칸이 아직 DOM 에 있다)', doc.contains(a));
  b.focus();
  await tick();
  check('사업자번호 →Tab→ 후원일자', keyOf(doc.activeElement) === keyOf(byKey('donDate')), keyOf(doc.activeElement));
  check('값은 저장됐다', DB.donorForm.bizNo === '128-81-45907', DB.donorForm.bizNo);
}
console.log('\n── ③ 최악 — 초점 뗀 뒤 change, 새 칸은 초점을 못 받음 → Tab 의도로 되돌린다 ──');
{
  const a = byKey('addr');
  a.focus(); a.value = '서울'; tabKey(a); a.blur(); change(a);
  await tick();
  check('주소 →Tab→ 연락처 (의도 복원)', keyOf(doc.activeElement) === keyOf(byKey('phone')), keyOf(doc.activeElement));
  check('맨 위 칸으로 가지 않았다', doc.activeElement !== inputs()[0]);
}
console.log('\n── ④ Shift+Tab — 거꾸로도 ──');
{
  const a = byKey('donDate');
  a.focus(); a.value = '2026-09-12'; tabKey(a, true); a.blur(); change(a);
  await tick();
  check('후원일자 →Shift+Tab→ 사업자번호', keyOf(doc.activeElement) === keyOf(byKey('bizNo')), keyOf(doc.activeElement));
}
console.log('\n── ⑤ Tab 의도는 한 번 쓰면 버려진다 / 오래되면 안 쓴다 ──');
{
  check('의도가 비워졌다', W.tabIntent === null, W.tabIntent);
  W.tabIntent = {tag:'INPUT', key:"setDonor('purpose',this.value)|", s:null, e:null, at:Date.now() - 5000};
  doc.body.focus(); W.render(); await tick();
  check('5초 지난 의도는 쓰지 않는다', keyOf(doc.activeElement) !== keyOf(byKey('purpose')), keyOf(doc.activeElement));
  W.tabIntent = null;
}
console.log('\n' + (fail ? '❌ ' + fail + '항목 실패' : '✅ 전부 통과'));
process.exit(fail ? 1 : 0);
