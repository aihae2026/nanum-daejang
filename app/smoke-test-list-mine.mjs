/* 목록 [내가 접수한 건만] (2026-09-10 선미)

   ★ 왜 붙였나
     담당자는 원장 전체를 본다(권한 모델 그대로 — 관리자 가이드 3장 「계정 및 권한 체계」).
     그건 맞는 설계지만 "남의 건이 다 보여서 헷갈린다" 는 말이 나올 자리라,
     **권한은 안 건드리고 화면 필터만** 붙였다. 심사위원 시연에서 자기 건만 모아 볼 때도 쓴다.

   ★ 이 검사가 지키는 것
     ① 되읽은 건에 createdBy 가 실린다 — DB 에는 9/7 부터 있었는데 화면 객체로 안 올라왔다
     ② 로그인해서 staff 행이 있어야 토글이 그려진다 — 데모·anon 에는 '나' 가 없다
     ③ 켜면 내 건만 남고, 흐름 바 숫자도 내 건 분포로 바뀐다 (검색처럼 구간을 가로지른다)
     ④ 검색과 같이 걸린다 — 검색 ∩ 내 건
     ⑤ 빈 결과가 거짓말하지 않는다 — "내가 접수한 건이 없습니다 — 전체 N건"
     ⑥ 방금 발급한 건도 되읽기 전에 내 건으로 잡힌다 (sendLink 가 createdBy 를 넣는다)
     ⑦ 끄면 원래대로 — 필터는 화면 상태(DB.listMine)일 뿐이다

   데모 데이터로 돈다 — 서버·DB 불필요.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-list-mine.mjs
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
const count = (html, re) => (html.match(re) || []).length;
const rowsOf = (html) => count(html, /<tr onclick="go\('case'/g);
const flowNums = (html) => [...html.matchAll(/<span class="fb-c">(\d+)<\/span>/g)].map(m => +m[1]);

window.DB.role = 'staff';
window.DB.screen = 'list';
window.DB.listFilter = 'all';
window.DB.listSort = 'oldest';

console.log('\n[① 되읽은 건에 createdBy 가 실린다]');
const D = window.COL.donation;
const row = { [D.id]: 9001, [D.caseNo]: '901', [D.state]: '검수 대기', [D.donorType]: '법인',
  [D.donorName]: '검사법인', [D.itemName]: '검사물품', [D.qty]: 1, [D.inDate]: '2026-09-10',
  [D.createdBy]: 'me-1', distribution: [], checklist_item: [] };
const c = window.rowToCase(row);
check('★ rowToCase 가 createdBy 를 옮긴다', c.createdBy === 'me-1', c.createdBy);
check('created_by 가 비면 null (undefined 아님)', window.rowToCase({ ...row, [D.createdBy]: null }).createdBy === null, null);

/* 데모 건 위에 '누가 만들었나' 를 얹는다 — 앞 셋은 내 것, 나머지는 남의 것 */
const active = window.DB.cases.filter(x => window.isRegistered(x) && x.state !== '취소');
active.forEach((x, i) => { x.createdBy = i < 3 ? 'me-1' : 'other-' + i; });
const total = active.length;

console.log('\n[② 로그인 전에는 토글이 없다]');
window.AUTH.session = null;
window.DB.listMine = true;   /* 켜 두어도 */
let html = window.viewList();
check('★ anon 에는 [내가 접수한 건만] 이 안 그려진다', !html.includes('내가 접수한 건만'), null);
check('켜 둔 상태여도 전체가 보인다 (나 가 없으니 거를 수 없다)', rowsOf(html) === total, {rows: rowsOf(html), total});

console.log('\n[③ 로그인하면 토글이 생기고, 켜면 내 건만]');
window.AUTH.session = { user: { id: 'me-1', email: 't@x' }, staffOk: true, staffName: '테스터', access_token: 'tok', expires_at: Math.floor(Date.now()/1000) + 3600 };
window.DB.listMine = false;
html = window.viewList();
check('★ 로그인한 담당자에게 토글이 그려진다', html.includes('내가 접수한 건만') && html.includes('aria-pressed="false"'), null);
check('꺼져 있으면 전체', rowsOf(html) === total, {rows: rowsOf(html), total});
const sumAll = flowNums(html).reduce((a, b) => a + b, 0);
window.DB.listMine = true;
html = window.viewList();
check('★ 켜면 내 건 3건만', rowsOf(html) === 3, rowsOf(html));
check('버튼이 켜진 상태로 그려진다', html.includes('class="lmine on"') && html.includes('aria-pressed="true"'), null);
const sumMine = flowNums(html).reduce((a, b) => a + b, 0);
check('★ 흐름 바 숫자도 내 건 분포로 (세 구간 합 = 3)', sumMine === 3 && sumAll === total, {sumMine, sumAll, total});
check('합계 칩도 3', /<span class="tn">3<\/span>/.test(html), null);
check('남의 건이 표에 없다', !active.slice(3).some(x => html.includes("go('case','" + x.id + "')")), null);

console.log('\n[④ 검색과 같이 걸린다]');
const mineItem = active[0].item.split(' ')[0];
window.DB.listQuery = mineItem;
html = window.viewList();
const expect = active.slice(0, 3).filter(x => window.caseMatches({c: x, r: {}}, window.normQuery(mineItem))).length;
check('검색 ∩ 내 건 (' + mineItem + ')', rowsOf(html) === expect && expect >= 1, {rows: rowsOf(html), expect});
window.DB.listQuery = '';

console.log('\n[⑤ 빈 결과가 거짓말하지 않는다]');
window.AUTH.session.user.id = 'nobody';
html = window.viewList();
check('★ "내가 접수한 건이 없습니다 — 전체 N건"', html.includes('내가 접수한 건이 없습니다 — 전체 ' + total + '건'), null);
window.AUTH.session.user.id = 'me-1';

console.log('\n[⑥ 방금 발급한 건도 내 건이다]');
window.DB.listMine = true;
const before = rowsOf(window.viewList());
window.DB.req = window.DB.req || {};
Object.assign(window.DB.req, { donorType: '법인', path: '구매', donorName: '검사상사', phone: '010-1234-5678', verifyLast4: '5678', channel: 'copy' });
try { window.sendLink(); } catch (e) { /* 화면 갱신 쪽 예외는 무시 — 건이 push 됐는지만 본다 */ }
const last = window.DB.cases[window.DB.cases.length - 1];
check('★ sendLink 가 createdBy 를 넣는다', last && last.createdBy === 'me-1', last && last.createdBy);
check('켜진 목록에 바로 나타난다', rowsOf(window.viewList()) === before + 1, {before, after: rowsOf(window.viewList())});

console.log('\n[⑦ 끄면 원래대로]');
window.DB.listMine = false;
html = window.viewList();
check('전체로 돌아온다', rowsOf(html) === total + 1, {rows: rowsOf(html), total: total + 1});
check('토글 함수가 상태를 뒤집는다', (window.toggleListMine(), window.DB.listMine === true) && (window.toggleListMine(), window.DB.listMine === false), window.DB.listMine);

console.log(fail ? `\n❌ ${fail}개 실패` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
