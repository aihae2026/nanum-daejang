/* 건 표시 상태 — **완결한 건과 완결할 수 있는 건이 갈리는가** (2026-09-05 선미)

   ★ 무엇을 막는 검사인가
     inspect() 는 caseObj.state 를 보지 않는다 (common.js:284~308).
     그래서 [완결 처리] 를 눌러 확정한 건과, 아직 안 누른 건이 **둘 다 verdict === '완결'** 이다.
     홈만 그 둘을 갈랐고(casePill), 목록은 verdictPill 로 **둘 다 '완결'** 이라고 찍었다.
     → 담당자가 목록에서 [완결 N] 을 누르면 **아직 안 끝난 건이 섞여** 나온다. 끝났다고 믿고 넘어간다.

   ★ 그래서 네 가지를 본다
     ① 같은 건이라도 state 가 '완결' 이면 다른 값이 된다
     ② 홈·목록·건상세가 **같은 값**을 찍는다 (셋이 갈리면 "완결이라면서요?" 가 난다)
     ③ 목록 필터 [완결] 에 미확정 건이 섞이지 않는다
     ④ 집계 숫자와 실제 걸러진 행 수가 같다 (CASE_FILTERS 전수)
     ⑤ **홈 카운터와 목록 필터가 같은 표(CASE_FILTERS)를 본다**
        — 홈이 "증빙 미수취 2건" 인데 목록에 1건이면 담당자는 어느 쪽이 맞는지 알 수 없다

   데모 데이터로 돈다 — 서버·DB 불필요.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-case-state.mjs
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

/* 완결 가능한(=미수취·확인필요가 없는) 건을 찾는다 */
const cand = window.DB.cases.filter(window.isRegistered)
  .map(c => ({ c, r: window.inspectView(c, window.TODAY) }))
  .find(x => x.r.verdict === '완결');
if (!cand) { console.log('❌ 완결 가능한 데모 건이 없다 — 검사가 성립하지 않는다'); process.exit(1); }
const c = cand.c;
console.log(`\n대상: 건 ${c.id} · verdict='${cand.r.verdict}' · state='${c.state}'`);

console.log('\n[① state 가 표시 상태를 가른다]');
const before = c.state;
c.state = '검수중';
const kOpen = window.caseStateKey(c, window.inspectView(c, window.TODAY));
c.state = '완결';
const kDone = window.caseStateKey(c, window.inspectView(c, window.TODAY));
check("완결 처리 전 → '완결가능'", kOpen === '완결가능', kOpen);
check("완결 처리 후 → '완결확정'", kDone === '완결확정', kDone);
check('★ 두 값이 다르다', kOpen !== kDone, [kOpen, kDone]);
check('verdict 는 둘 다 그대로 (inspect 는 state 를 모른다)',
  window.inspectView(c, window.TODAY).verdict === '완결', window.inspectView(c, window.TODAY).verdict);

console.log('\n[② 목록 행 — 흐름 배지 + 남은 것 한 줄]');
/* ★ 배지는 흐름 3단계(후원접수중·배분진행중·완결)뿐이다. '완결가능' 같은 세부는
     배지가 아니라 stageDetail 한 줄이 말한다 — 한 행에 알약이 다섯이던 것을 줄인 결과다. */
c.state = '검수중';
window.DB.listFilter = 'all';
window.DB.screen = 'list';
const listHtml = window.viewList();
/* ⚠️ 페이지 전체에서 글자를 찾으면 안 된다 — 탭 라벨에도 같은 말이 있다. 그 건의 **행 안**만 본다. */
const rowOf = (html, id) => {
  const m = html.match(new RegExp('<tr[^>]*>(?:(?!</tr>)[\\s\\S])*class="tb-item">#' + id + '<[\\s\\S]*?</tr>'));
  return m ? m[0] : '';
};
const row = rowOf(listHtml, c.id);
check('목록에서 그 건의 행을 찾았다', row.length > 0, '(행 없음)');
check("★ 배지가 '배분진행중'", row.includes('배분진행중'), row.slice(-160));
check("★ 아직 '완결' 이라고 찍지 않는다", !/>완결</.test(row), (row.match(/>완결</g) || []).length);
check("남은 것이 '완결 처리만 남음' 으로 보인다", row.includes('완결 처리만 남음'), row.slice(-160));

c.state = '완결';
const rowDone = rowOf(window.viewList(), c.id);
check("★ 완결 처리하면 배지가 '완결'", /class="pill ok"><span class="pd"><\/span>완결</.test(rowDone), rowDone.slice(-160));
c.state = '검수중';

console.log('\n[③ 흐름 3단계는 배타적이고 빠짐이 없다]');
const live = window.DB.cases.filter(window.isRegistered).map(window.caseView);
const bucket = {};
live.forEach(x => { const g = window.caseStage(x.c, x.r); bucket[g] = (bucket[g] || 0) + 1; });
console.log('   ' + JSON.stringify(bucket));
check('모든 건이 3단계 중 하나', live.every(x => window.CASE_STAGES.includes(window.caseStage(x.c, x.r))), bucket);
check('★ 한 건이 두 탭에 걸리지 않는다',
  live.every(x => window.CASE_FILTERS.filter(f => f.id !== 'all' && f.test(x)).length <= 1),
  live.filter(x => window.CASE_FILTERS.filter(f => f.id !== 'all' && f.test(x)).length > 1).map(x => x.c.id));
check('★ 완결확정 건은 탭에 안 걸린다 (전체에서만 본다)',
  live.filter(x => window.caseStage(x.c, x.r) === '완결')
      .every(x => !window.caseFilter('intake').test(x) && !window.caseFilter('dist').test(x)), '(걸림)');
check('탭 합 + 완결 = 전체',
  live.filter(window.caseFilter('intake').test).length
  + live.filter(window.caseFilter('dist').test).length
  + (bucket['완결'] || 0) === live.length, { bucket, total: live.length });

console.log('\n[④ 탭 숫자 = 실제 걸러진 행 수]');
const rowsOf = (html) => (html.match(/class="tb-item">#/g) || []).length;
/* 흐름 바는 구간 번호(fb-n)와 건수(fb-c)를 따로 그린다 — 건수 쪽을 집는다.
   'all' 은 구간이 아니라 합계 칩(tn)이다. 앞 판의 [^0-9]* 는 번호를 먼저 물었다. */
const tabCount = (html, id) => {
  const m = html.match(new RegExp("setListFilter\\('" + id + "'\\)\"[\\s\\S]*?class=\"(?:fb-c|tn)\">(\\d+)<"));
  return m ? Number(m[1]) : -1;
};
window.CASE_FILTERS.forEach(f => {
  window.DB.listFilter = f.id;
  const html = window.viewList();
  const shown = rowsOf(html);
  const counted = tabCount(html, f.id);
  check(`  ${f.label}: 탭 ${counted} = 행 ${shown}`, counted === shown, { counted, shown });
});

console.log('\n[⑤ 홈 갈래의 건수 = 목록 탭 건수 — 같은 표를 쓰는가]');
window.DB.role = 'staff'; window.DB.screen = 'home';
const homeH = window.renderStaff();
[['intake', window.caseFilter('intake').label], ['dist', window.caseFilter('dist').label]].forEach(([id, label]) => {
  const m = homeH.match(new RegExp('<b>(\\d+)</b>건 ' + label));
  window.DB.listFilter = id;
  const shown = rowsOf(window.viewList());
  const counted = m ? Number(m[1]) : -1;
  check(`  ${label}: 홈 ${counted} = 목록 ${shown}`, counted === shown, { counted, shown });
});

window.DB.listFilter = 'all';
c.state = before;
console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 완결한 건과 완결할 수 있는 건이 갈린다');
process.exit(fail ? 1 : 0);
