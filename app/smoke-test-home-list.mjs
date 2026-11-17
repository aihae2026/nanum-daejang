/* 홈·목록 구조 — **다시 불어나지 않는가** (2026-09-05 선미 · 설계서 7장 G·H)

   ★ 무엇을 지키는 검사인가
     홈은 블록이 5개였고 그중 셋이 같은 건들을 모양만 바꿔 반복했다(파이프라인 개수 ·
     접수 물품 현황 표 · 오늘 할 일). 목록은 표가 둘이라 필터가 두 번 걸렸다.
     여기서 고정하지 않으면 카드 하나씩 다시 붙는다.

     ① 홈에 없어야 할 것 — 금액 KPI · 접수 물품 현황 표 · 체크리스트 통과율 · 파이프라인
     ② 홈은 [내가 할 일] 과 [기다리는 중] 둘로 가른다 — caseUrgency 가 기준이고,
        **상대를 기다리는 건에 액션 버튼이 붙지 않는다** (예전 '오늘 할 일' 의 결함)
     ③ 목록은 표가 **하나**다
     ④ 한 행의 알약이 **두 개를 넘지 않는다** (예전 최대 다섯)
     ⑤ 행 전체가 눌린다 — 홈 표와 같은 조작법

   데모 데이터로 돈다 — 서버·DB 불필요.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-home-list.mjs
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

window.DB.role = 'staff';
window.DB.screen = 'home';
const home = window.renderStaff();
window.DB.screen = 'list';
window.DB.listFilter = 'all';
const list = window.viewList();

console.log('\n[① 홈에서 걷어낸 것들이 돌아오지 않았다]');
[['접수 금액', '금액 KPI'], ['배분 완료 금액', '금액 KPI'],
 ['접수 물품 현황', '전체 나열 표'], ['체크리스트 통과 현황', '통과율 카드'],
 ['검수 완결', '파이프라인 단계'], ['기부가액', '금액 칸']].forEach(([t, why]) =>
  check(`  "${t}" (${why}) 없음`, !home.includes(t), t));
check('★ 홈에 <table> 이 없다', !/<table/.test(home), (home.match(/<table[^>]*>/g) || []));

console.log('\n[② 홈은 나열하지 않는다 — 갈래 둘뿐]');
/* ★ 앞 판(숫자 셋 + [내가 할 일] 목록)은 결국 목록의 복사본이었다.
     그리고 [내가 할 일]/[기다리는 중] 은 코드에 없는 개념이라 기준을 말로 설명할 수 없었다. */
const live = window.DB.cases.filter(window.isRegistered).map(window.caseView);
check('갈래가 정확히 2개', (home.match(/class="home-gate"/g) || []).length === 2,
  (home.match(/class="home-gate"/g) || []).length);
check('[신규 접수] → 접수 링크 발송', /home-gate" onclick="go\('send'\)/.test(home), '(없음)');
check('[검수] → 후원건 목록', /home-gate" onclick="goList\('all'\)/.test(home), '(없음)');
check('★ 홈에 건이 나열되지 않는다',
  live.every(x => !home.includes("go('case','" + x.c.id + "')")), live.map(x => x.c.id));
check("'내가 할 일' 이 없다", !home.includes('내가 할 일'), '(남아 있음)');
check("'기다리는 중' 이 없다", !home.includes('기다리는 중'), '(남아 있음)');
check('검수 갈래가 진행 건수를 보여준다',
  home.includes(window.caseFilter('intake').label) && home.includes(window.caseFilter('dist').label), '(없음)');

console.log('\n[③ 목록은 표가 하나 · 탭은 흐름 3개]');
/* ★ 완결이 셋째 구간으로 섰다 (2026-09-08) — 전에는 탭이 없어 26+5 가 전체 41 과 안 맞았다.
     'all' 은 구간이 아니라 합계라 흐름 바에서 빠진다(stageFilters). */
check('구간이 접수·검수 → 배분 검수 → 완결',
  window.stageFilters().map(f => f.label).join(' → ') === '후원 접수·검수 → 배분 검수 → 완결',
  window.stageFilters().map(f => f.label));
check('★ 구간에 순서가 붙어 있다 (①②③ 은 장식이 아니다)',
  window.stageFilters().map(f => f.step).join('') === '123', window.stageFilters().map(f => f.step));
check('합계는 구간이 아니다', !window.stageFilters().some(f => f.id === 'all'), '(섞였다)');
/* ★ 앞 판은 #103 이 두 필터에 걸리고 제출 대기 건은 어디에도 안 걸렸다 — 상태가 아니라
     조건으로 필터를 정의했기 때문이다. 지금은 inspect() 판정을 접어 쓰므로 배타적이고 빠짐이 없다. */
const stages = live.map(x => window.caseStage(x.c, x.r));
check('★ 모든 건이 흐름 3단계 중 하나', stages.every(g => window.CASE_STAGES.includes(g)), stages);
window.CASE_FILTERS.filter(f => f.id !== 'all').forEach(f => {
  const hit = live.filter(f.test).length;
  check(`  ${f.label} ${hit}건`, true, hit);
});
check('★ 세 구간을 더하면 전체가 된다 (담당자가 암산으로 검증한다)',
  window.stageFilters().reduce((a, f) => a + live.filter(f.test).length, 0) === live.length,
  {구간합:window.stageFilters().reduce((a, f) => a + live.filter(f.test).length, 0), 전체:live.length});
check('★ <table> 이 정확히 1개', (list.match(/<table/g) || []).length === 1, (list.match(/<table/g) || []).length);
check("'배분 확정' 카드가 없다", !list.includes('>배분 확정<'), '(남아 있음)');
check("'배분 전' 카드가 없다", !list.includes('>배분 전<'), '(남아 있음)');
check('헤더가 6칸', (list.match(/<th>/g) || []).length === 6, (list.match(/<th>[^<]*<\/th>/g) || []));

console.log('\n[④ 한 행의 알약이 둘을 넘지 않는다]');
const rows = list.match(/<tr onclick[\s\S]*?<\/tr>/g) || [];
check('행을 찾았다', rows.length > 0, rows.length);
rows.forEach(r => {
  const id = (r.match(/tb-item">#(\d+)/) || [])[1];
  const n = (r.match(/class="pill /g) || []).length;
  check(`  #${id}: 알약 ${n}개`, n <= 2, n);
});

console.log('\n[⑤ 행 전체가 눌린다]');
check('★ 모든 행에 onclick 이 있다',
  rows.length === (list.match(/<tr onclick="go\('case'/g) || []).length, rows.length);
check("'검수 열기' 버튼 칸이 없다", !list.includes('검수 열기'), '(남아 있음)');

console.log('\n[⑥ 판정 배지가 흐름 3단계다]');
const rowPills = [...list.matchAll(/class="pill [a-z]+"><span class="pd"><\/span>([^<]+)</g)]
  .map(m => m[1]);
check('배지가 전부 흐름 3단계 안에 있다',
  rowPills.every(p => window.CASE_STAGES.includes(p)), [...new Set(rowPills)]);

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 홈 2블록 · 목록 표 하나');
process.exit(fail ? 1 : 0);
