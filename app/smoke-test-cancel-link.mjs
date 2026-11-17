/* 접수 취소 — 취소한 링크로 제출이 막히는가 (2026-09-13 · #323 유진 실주행)

   ★ 무엇이 났나 — 유진 과장님이 신규 접수에서 링크를 만들고 오발송으로 취소했다.
     복사해 둔 그 링크를 열었더니 **열렸고**, 입력해서 제출하니 **접수됐다.**

   ★ 왜 — cancelCase 가 담당자 브라우저의 메모리(c.state)만 '취소' 로 바꿨다.
     DB 의 건은 '제출 대기' 그대로, 접수 링크(access_link)도 revoked=false 그대로였다.
     후원자 브라우저는 DB 를 읽는다 — 담당자 메모리의 '취소' 를 알 길이 없다.
     (링크 문(enterByLinkToken)은 access_link.revoked 를, 제출(submitDonor)은 donation.state 를 본다 —
      둘 다 DB 값이다. 둘 다 안 바뀌었으니 둘 다 통과했다.)

   ★ 이 검사가 지키는 것 — 취소를 누르면 ① 살아 있는 접수 링크가 무효화되고 ② 건 상태 '취소' 가
     DB 로 나가며 ③ 그 값으로 링크 문과 제출이 실제로 막힌다. 실패하면 화면을 되돌린다.

   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-cancel-link.mjs
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
const {window:W} = dom;
W.HTMLCanvasElement.prototype.getContext = function(){const n=()=>{};return{lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n};};
W.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
for (const f of appScripts()) W.eval(readFileSync(APP + f, 'utf8'));
const wait = () => new Promise(r => setTimeout(r, 20));

let fail = 0;
const check = (n, ok, got) => {
  console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got)));
  if (!ok) fail++;
};

/* ── 가짜 DB: 건 하나 · 살아 있는 접수 링크 하나 ── */
W.SUPABASE_CONFIG = {url:'https://smoke.supabase.co', key:'smoke-key'};
W.render = () => {};
const K = W.COL.accessLink;
const link = {}; link[K.id] = 55; link[K.purpose] = 'intake'; link[K.revoked] = false; link[K.usedAt] = null; link[K.expiresAt] = null;
const dbState = {state:'제출 대기'};
const calls = {revoke:[], patch:[]};
W.loadAccessLinks = () => Promise.resolve([link]);
W.revokeAccessLink = (id) => { calls.revoke.push(id); link[K.revoked] = true; return Promise.resolve({ok:true}); };
W.saveDonationFields = (c, f) => { calls.patch.push(f); Object.assign(dbState, f); return Promise.resolve({ok:true}); };

const c = W.DB.cases[0];
c.dbId = 9001; c.state = '제출 대기'; c.awaitingSubmit = true;

console.log('\n[취소 전 — 링크는 열리고 제출도 된다]');
check('링크 상태 ok', W.accessLinkState(link) === 'ok', W.accessLinkState(link));

console.log('\n[담당자가 접수를 취소한다]');
W.cancelCase(c.id);
await wait(); await wait(); await wait();
check('화면의 건이 취소로 선다', c.state === '취소', c.state);
check('★ 살아 있는 접수 링크를 무효화했다 (전에는 안 했다 — 링크가 그대로 열렸다)',
      calls.revoke.length === 1 && calls.revoke[0] === 55, calls.revoke);
check('★ 건 상태 취소가 DB 로 나간다 (전에는 메모리뿐 — 새로고침하면 사라졌다)',
      calls.patch.some(f => f.state === '취소'), calls.patch);

console.log('\n[그 값으로 후원자가 링크를 열면]');
check('링크 문이 잠긴다 — revoked', W.accessLinkState(link) === 'revoked', W.accessLinkState(link));
check('잠금 문구는 "무효화" 를 말한다', /무효화/.test(W.LINK_STATE_TEXT.revoked), W.LINK_STATE_TEXT.revoked);
check('DB 의 건도 취소라 submitDonor 가 막는다', dbState.state === '취소', dbState);

console.log('\n[취소를 두 번 눌러도 두 번 나가지 않는다]');
W.cancelCase(c.id);
await wait(); await wait();
check('이미 취소된 건은 다시 안 보낸다', calls.revoke.length === 1 && calls.patch.length === 1, calls);

console.log('\n[저장이 실패하면 — 취소했다고 믿게 두지 않는다]');
const c2 = W.DB.cases[1];
c2.dbId = 9002; c2.state = '검수 대기'; c2.awaitingSubmit = false;   /* 제출 뒤 취소하는 건 */
W.saveDonationFields = () => Promise.reject(new Error('HTTP 500'));
W.loadAccessLinks = () => Promise.resolve([]);
W.cancelCase(c2.id);
await wait(); await wait(); await wait();
check('★ 화면 상태를 원래대로 되돌린다 (제출 대기가 아니라 **원래 값**으로)', c2.state === '검수 대기', c2.state);
check('실패를 담당자에게 말한다', /취소하지 못했/.test((W.DB.toast || {}).msg || ''), W.DB.toast);
check('다시 누를 수 있다 (cancelling 이 풀린다)', !c2.cancelling, c2.cancelling);

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
