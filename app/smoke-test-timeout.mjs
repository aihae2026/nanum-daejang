/* AI 호출 — 시간을 재서 끊는가 · 재시도가 옳은 때만 도는가 (2026-09-02 유진)

   ★ 확인하는 것: **응답이 안 오면 실제로 끊는가.**
     전에는 끊는 코드가 없었다. 화면은 안 멈추지만 그 항목 카드의 '판독 중' 스피너가
     영영 돈다 — 담당자는 기다려야 하는지 실패한 것인지 알 수 없다.

   ★ 함께 확인: 429 에 재시도하지 않는가.
     무료 키는 분당 20회다. 한도 초과에 다시 보내면 다음 항목까지 무너뜨린다.

   서버·키가 필요 없다 — fetch 를 갈아끼워 느린 응답·429 를 만든다.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-timeout.mjs
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
/* 검사에서는 짧게 줄인다 — 실제 값은 60초 */
window.eval('JUDGE_TIMEOUT_MS = 120; JUDGE_RETRY_WAIT = 10;');

console.log('\n[① 응답이 안 오면 끊는다]');
let aborted = false, calls = 0;
window.fetch = (u, o) => { calls++; return new Promise((_, rej) => {
  o.signal.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); });
}); };
let t0 = Date.now();
let r = await window.postJudge({x:1}).then(() => 'resolved').catch(e => e.message);
let dt = Date.now() - t0;
check('★ 시간 초과로 끊긴다 (영영 돌지 않는다)', /시간 초과/.test(r), r);
check('★ 요청을 실제로 abort 한다 (서버 쪽 낭비도 없앤다)', aborted);
check('두 번 시도한다 (끊긴 것은 한 번 더)', calls === 2, calls);
check('끊는 시간이 지켜진다 (120ms×2 + 대기)', dt < 1000, dt);

console.log('\n[② 429 는 다시 보내지 않는다 — 한도를 더 깎는다]');
calls = 0;
window.fetch = () => { calls++; return Promise.reject(new Error('HTTP 429 quota')); };
r = await window.postJudge({x:1}).then(() => 'resolved').catch(e => e.message);
check('★ 재시도 없이 한 번만', calls === 1, calls);
check('429 를 그대로 올린다', /429/.test(r), r);

console.log('\n[③ 잠깐 끊긴 것은 두 번째에 성공한다]');
calls = 0;
window.fetch = () => { calls++;
  return calls === 1 ? Promise.reject(new Error('Failed to fetch'))
                     : Promise.resolve({ok:true, json:() => Promise.resolve({ok:1})}); };
const ok = await window.postJudge({x:1}).then(x => x.ok).catch(e => 'X:' + e.message);
check('두 번째 시도가 성공한다', ok === true, ok);
check('두 번 불렀다', calls === 2, calls);

console.log('\n[④ 실패를 무엇으로 기록하나 — 짐작이 아니라 사실로]');
const kind = (m) => window.judgeFailKind(new Error(m));
check('★ 시간 초과 → timeout', kind('AI 응답이 60초 안에 오지 않았습니다 (시간 초과)') === 'timeout');
check('★ 429 → quota', kind('HTTP 429 quota') === 'quota');
check('★ 그 밖 → error (전에는 전부 timeout 이었다)', kind('HTTP 500 서버 오류') === 'error',
      kind('HTTP 500 서버 오류'));

console.log('\n[⑤ 담당자가 읽을 문장에 다음 행동이 있는가]');
const text = (m) => window.judgeFailText(new Error(m));
check('한도 초과 — 기다리라고 말한다', /1분 뒤/.test(text('HTTP 429 quota')), text('HTTP 429 quota'));
check('시간 초과 — 다시 누르라고 말한다', /다시 판정/.test(text('시간 초과')));

console.log('\n[⑦ 424 "location is not supported" — 감지·문구 · 자동 재시도는 0 (9/7 밤 실측: 같은 연결은 같은 데이터센터)]');
const COLO = '{"error":"판정 실패","detail":"Gemini HTTP 400 — {\\"error\\": {\\"code\\": 400, \\"message\\": \\"User location is not supported for the API use.\\", \\"status\\": \\"FAILED_PRECONDITION\\"}}"}';
const res424 = (body) => ({ok:false, status:424, text:()=>Promise.resolve(body), json:()=>Promise.resolve(JSON.parse(body))});
const realRetries = Number(readFileSync(APP + 'api.js', 'utf8').match(/var JUDGE_COLO_RETRIES = (\d+)/)[1]);
check('★ 실제 설정은 자동 재시도 0 — 효과 없이 4초를 끌던 것(9/7 밤 #228 5항목 × 3회 전부 홍콩)', realRetries === 0, realRetries);
calls = 0;
let warns = [];
const oWarn = console.warn; console.warn = (...a) => { warns.push(a.join(' ')); };
window.fetch = () => { calls++; return Promise.resolve(res424(COLO)); };
const r7a = await window.postJudge({x:1});
const t7a = await r7a.text();
console.warn = oWarn;
check('★ 홍콩 424 는 한 번만 보내고 사실대로 올린다 (본문을 다시 읽을 수 있다)', calls === 1 && r7a.ok === false && r7a.status === 424 && /location is not supported/.test(t7a), {calls, ok:r7a.ok, status:r7a.status});
check('"다시 보냅니다" 경고를 찍지 않는다 — 안 보내면서 보낸다고 말하지 않는다', !warns.some(w => /다시 보냅니다/.test(w)), warns);
check('담당자 문장 — "몇 분 뒤 다시 판정" · "지금 바로는 같은 곳"', /몇 분 뒤/.test(text('HTTP 424 — ' + COLO)) && /다시 판정/.test(text('HTTP 424 — ' + COLO)) && /같은 곳/.test(text('HTTP 424 — ' + COLO)), text('HTTP 424 — ' + COLO));
/* 장치 자체는 살아 있어야 한다 — 값을 올리면 다시 돈다(Edge Function 전까지 쓸 일은 없지만 죽은 코드가 되면 안 된다) */
window.eval('JUDGE_COLO_RETRIES = 2;');
calls = 0;
window.fetch = () => { calls++; return Promise.resolve(calls < 3 ? res424(COLO) : {ok:true, status:200, json:()=>Promise.resolve({verdict:'이상 없음'}), text:()=>Promise.resolve('')}); };
let r7 = await window.postJudge({x:1}).then(x => x.ok).catch(e => 'X:' + e.message);
check('재시도 장치(값 2): 홍콩 두 번 → 세 번째가 성공한다', r7 === true && calls === 3, {r7, calls});
calls = 0;
window.fetch = () => { calls++; return Promise.resolve(res424('{"error":"판정 실패","detail":"Gemini HTTP 400 — Unable to process input image"}')); };
const r7c = await window.postJudge({x:1});
check('★ 다른 424(이미지 못 읽음)는 값이 2여도 재시도하지 않는다', calls === 1 && r7c.status === 424, {calls, status:r7c.status});
window.eval('JUDGE_COLO_RETRIES = 0;');

console.log('\n[⑥ 실제 설정값이 실측 최대치보다 넉넉한가]');
const real = Number(readFileSync(APP + 'api.js', 'utf8').match(/var JUDGE_TIMEOUT_MS = (\d+)/)[1]);
check('★ 60초 (실측 최대 39초의 1.5배 — 정상 응답을 죽이지 않는다)', real >= 45000, real);

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
