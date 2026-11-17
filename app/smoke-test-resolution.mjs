/* E3 사유 해소 — 저장이 성립 조건인가 (2026-09-02 유진)

   ★ 확인하는 것: **저장에 실패하면 해소되지 않는가.**
     해소는 완결 게이트를 여는 열쇠다(unresolvedBlocking). 저장이 안 됐는데
     화면만 해소되면 담당자는 완결시키고 DB 에는 왜 넘어갔는지가 없다 —
     감사에서 "이 건 왜 통과시켰나" 에 답을 못 댄다.

   ★ 함께 확인: 재검수로 판정을 새 run 으로 다시 쌓아도 해소가 살아남는가.
     (resFromFindings 가 run 전체를 훑는 이유 — 새 run 만 보면 다시 막힌다)

   실 DB 를 쓰지 않는다 — saveFindingResolution 을 갈아끼워 성공/실패만 만든다.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-resolution.mjs
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
for (const f of appScripts())
  window.eval(readFileSync(APP + f, 'utf8'));

let fail = 0;
const check = (n, ok, got) => {
  console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got)));
  if (!ok) fail++;
};
const wait = () => new Promise(r => setTimeout(r, 20));

/* 해소 대상이 되는 판정 하나를 만든다 — isError && blocksComplete */
const c = window.DB.cases[0];
c.findingRes = {}; window.DB.resolving = {}; window.DB.resolveErr = {}; window.DB.resolveDraft = {};
const FAKE = {rule:'E3', verdict:'확인 권장', isError:true, blocksComplete:true, reason:'시가로 산정'};
window.compareFindings = () => [FAKE];
window.compareBlocking  = () => [FAKE];
window.el = (id) => ({value:'후원처 통화로 산정 경위 확인'});
window.render = () => {};

console.log('\n[① 저장이 실패하면 해소되지 않는다]');
window.saveFindingResolution = () => Promise.reject(new Error('HTTP 401'));
window.resolveFinding(c.id, 'E3');
await wait();
check('★ 실패하면 findingRes 에 안 들어간다', !window.findingRes(c, 'E3'), c.findingRes);
check('★ 완결 게이트가 계속 막혀 있다', window.unresolvedBlocking(c).length === 1);
check('실패 사유가 화면 상태에 남는다', /401/.test(window.DB.resolveErr['E3'] || ''), window.DB.resolveErr);
check('입력한 사유를 지우지 않는다 (다시 타이핑 안 하게)',
      !!window.DB.resolveDraft['E3'], window.DB.resolveDraft);
check('진행중 표시가 풀린다', !window.DB.resolving['E3']);

console.log('\n[② 저장이 성공하면 해소된다]');
window.saveFindingResolution = () => Promise.resolve({ok:true, id:42});
window.resolveFinding(c.id, 'E3');
await wait();
check('★ findingRes 에 들어간다', !!window.findingRes(c, 'E3'), c.findingRes);
check('★ 완결 게이트가 열린다', window.unresolvedBlocking(c).length === 0);
check('실패 표시가 지워진다', !window.DB.resolveErr['E3']);
check('임시 입력값도 지워진다', !window.DB.resolveDraft['E3']);

console.log('\n[③ 사유가 비면 저장을 부르지 않는다]');
let called = 0;
window.saveFindingResolution = () => { called++; return Promise.resolve({ok:true}); };
c.findingRes = {}; window.el = () => ({value:'   '});
window.resolveFinding(c.id, 'E3');
await wait();
check('저장 호출 0건', called === 0, called);
check('해소되지 않는다', !window.findingRes(c, 'E3'));

console.log('\n[④ 재검수로 새 run 이 쌓여도 해소가 살아남는다]');
/* 최신 run 에는 해소가 없고, 이전 run 에만 있다 — 실제로 재검수한 뒤의 모양 */
const rows = [
  {id:9, ruleCode:'E3', resolution:null},                                        /* 최신 run */
  {id:5, ruleCode:'E3', resolution:{reason:'통화 확인', by:'담당자', date:'2026-09-02'}}
];
const res = window.resFromFindings(rows);
check('★ 이전 run 의 해소를 찾아낸다 (안 그러면 재검수 한 번에 다시 막힌다)',
      !!res.E3 && res.E3.reason === '통화 확인', res);
check('해소가 하나도 없으면 빈 표', Object.keys(window.resFromFindings(
      [{id:1, ruleCode:'E3', resolution:null}])).length === 0);
check('최신 것이 이긴다', window.resFromFindings([
      {id:9, ruleCode:'E3', resolution:{reason:'새것', by:'담당자', date:'2026-09-02'}},
      {id:5, ruleCode:'E3', resolution:{reason:'옛것', by:'담당자', date:'2026-09-01'}}
     ]).E3.reason === '새것');

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
