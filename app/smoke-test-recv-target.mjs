/* 수취 등록 — **누른 항목이 그대로 열리는가** (2026-09-05 선미)

   ★ 무엇을 막는 검사인가
     항목 카드의 [수취 등록으로] 는 go('receive', caseId, it.uid) 로 **어느 서류를 처리하러 왔는지**를 넘긴다.
     그런데 renderStaff 는 화면 함수를 **인자 없이** 부르고(viewReceive()), uid 가 실린 DB.tab 은
     viewReceive 가 읽지 않았다. 그래서 대상 항목이 언제나 pending[0] 으로 떨어졌다.
     → 미수취가 둘 이상인 건에서 **견적서를 눌러 들어가 거래명세서에 파일을 붙일 수 있었다.**
       화면에도 DB 에도 경고가 없다. 조용한 오처리다.

   ★ 그래서 세 가지를 본다
     ① 두 번째 대기 항목으로 이동하면 그 항목이 골라져 있다 (pending[0] 이 아니다)
     ② select 에 실제로 그 항목이 selected 로 그려진다 (상태만 맞고 화면이 다른 경우를 잡는다)
     ③ 담당자가 select 로 바꾼 뒤 재렌더해도 **되돌아가지 않는다**
        (매 렌더마다 uid 를 읽으면 고른 항목을 덮어쓴다 — 고치다 만드는 반대쪽 사고)

   데모 데이터로 돈다 — 서버·DB 불필요.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-recv-target.mjs
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

/* 수취 대기 항목이 둘 이상인 건을 찾는다 — 하나뿐이면 이 사고가 성립하지 않는다 */
const pendingOf = (c) => c.checklist.filter(it =>
  it.kind !== 'S' && it.included &&
  window.itemStatus(it).code !== 'done' && window.itemStatus(it).code !== 'res');

const target = window.DB.cases.filter(window.isRegistered).find(c => pendingOf(c).length > 1);
if (!target) { console.log('❌ 수취 대기 2건 이상인 데모 건이 없다 — 검사가 성립하지 않는다'); process.exit(1); }

const pend = pendingOf(target);
console.log(`\n대상: 건 ${target.id} · 수취 대기 ${pend.length}건`);
pend.forEach((it, i) => console.log(`   [${i}] ${it.uid}  ${it.n}`));

/* ⚠️ **맨 끝**을 고른다. pending[0] 폴백과 다르고, DB.recvForm 의 초기값(db.js:398 itemKey:'inss')과도 다르다.
     처음엔 pend[1] 을 골랐다가 그것이 하필 초기값과 같아, 고치기 전 코드에서도 검사가 통과했다 (9/5). */
const second = pend[pend.length - 1];
console.log(`\n누르는 것: [${pend.length - 1}] ${second.n} (${second.uid})`);

/* ⚠️ 다른 건을 보다가 들어온 상태로 되돌린다 — 이걸 안 하면 남아 있던 값 때문에 검사가 거짓 통과한다 */
window.DB.recvForm.caseId  = '(다른 건)';
window.DB.recvForm.itemKey = '';
window.DB.recvForm.file    = '남아있던파일.pdf';
window.DB.recvForm.memo    = '남아있던 메모';

console.log('\n[① 누른 항목이 폼에 실린다]');
window.go('receive', target.id, second.uid);
const html = window.viewReceive();   /* 담당자가 실제로 보는 화면까지 그린 뒤에 본다 */
check('DB.recvForm.itemKey 가 누른 항목', window.DB.recvForm.itemKey === second.uid, window.DB.recvForm.itemKey);
check('★ pending[0] 로 떨어지지 않았다', window.DB.recvForm.itemKey !== pend[0].uid, window.DB.recvForm.itemKey);
check('앞 건의 파일이 따라오지 않는다', window.DB.recvForm.file === '', window.DB.recvForm.file);

console.log('\n[② 화면 select 에도 그 항목이 골라져 있다]');
const optRe = new RegExp('<option value="' + second.uid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s+selected>');
check('select 의 selected 가 누른 항목', optRe.test(html), html.match(/<option value="[^"]*"\s+selected>[^<]*/) || '(selected 없음)');
check('항목이 이름으로도 보인다', html.includes(second.n), second.n);

console.log('\n[③ 담당자가 바꾸면 그 선택이 유지된다 — 되돌리지 않는다]');
window.DB.recvForm.itemKey = pend[0].uid;      /* select 를 손으로 바꾼 상황 */
window.viewReceive();                           /* 재렌더 */
check('★ 재렌더 후에도 담당자 선택 유지', window.DB.recvForm.itemKey === pend[0].uid, window.DB.recvForm.itemKey);

console.log('\n[④ uid 없이 들어오면 첫 대기 항목 — 기존 동작 유지]');
window.DB.recvForm.itemKey = '';
window.go('receive', target.id);
const html2 = window.viewReceive();
check('첫 대기 항목이 골라진다', window.DB.recvForm.itemKey === pend[0].uid, window.DB.recvForm.itemKey);
check('select 가 그려진다', html2.includes('<option value='), html2.slice(0, 80));

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 누른 항목이 그대로 열린다');
process.exit(fail ? 1 : 0);
