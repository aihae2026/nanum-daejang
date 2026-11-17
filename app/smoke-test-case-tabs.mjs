/* 건 상세 — 탭이 진행바로 바뀌어도 "항목 옆에서 처리한다" 는 그대로인가 (2026-09-06 M-5 → 2026-09-11 시안 C)

   ★ 이 검사의 역사
     9/6 (M-5): 탭이 [검수 결과][수취 현황] 순이고 검수 결과가 기본이었다 → [수취 현황] 을 앞·기본으로 뒤집었다.
       담당자가 먼저 하는 일은 "무엇이 들어왔는지 보는 것" 이라서.
     9/11 (시안 C): 두 탭이 같은 체크리스트를 각각 그려 같은 서류를 두 번 훑는 것이 드러났다.
       탭을 없애고 **진행바 6칸이 탭**이 됐다. 건을 열면 지금 단계가 열린다.
       그래서 "수취 현황이 먼저" 는 옛말이 됐고, 이 파일은 **그 결정에서 지금도 참인 것**만 지킨다.
       진행바·단계 매핑·아코디언은 smoke-test-case-steps.mjs 가 본다.

   ★ 지금도 참인 것 셋
     ① 기본값 자리가 **셋**이다(db.js 초기값 · common.js go() · navRestoreSaved) — 전부 'auto' 여야 한다.
        하나만 다르면 "홈에서 들어오면 이 단계, 목록에서 들어오면 저 단계" 가 된다.
     ② 옛 탭 버튼 [수취 현황][검수 결과] 은 없다 — 남아 있으면 없는 화면으로 가는 문이다.
     ③ 수취 등록은 **항목 옆에서만** — uid 를 싣고 간다. 뭉뚱그린 [수취 등록] 은 없다(설계서 §4 F · 9/5 오처리).
        검수 실행 **전**에도 그렇다(전에는 수취 현황 탭이 그 자리였다).

   데모 데이터로 돈다 — 서버·DB 불필요.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-case-tabs.mjs
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

console.log('\n[① 기본값이 자동(auto) — 자리가 셋이다]');
check('★ db.js 초기값이 auto', window.DB.tab === 'auto', window.DB.tab);
window.DB.tab = 'donorRecv';                 /* 어느 단계를 보고 있다가 */
window.go('case', '103');                    /* 건을 새로 연다 */
check('★ go() 기본값도 auto', window.DB.tab === 'auto', window.DB.tab);
window.DB.tab = 'distRecv';
window.sessionStorage.setItem('nd.nav', JSON.stringify({screen:'case', caseId:'103'}));   /* 옛 세션엔 tab 이 없을 수 있다 */
window.navRestoreSaved();
check('★ 세션 복원 기본값도 auto', window.DB.tab === 'auto', window.DB.tab);

console.log('\n[② 옛 탭 버튼은 없다 · 진행바가 있다]');
window.DB.role = 'staff'; window.DB.screen = 'case'; window.DB.caseId = '103'; window.DB.tab = 'auto';
const html = window.viewCase();
check('★ [수취 현황][검수 결과] 버튼이 없다', !/>수취 현황<\/button>|>검수 결과<\/button>/.test(html),
  (html.match(/>[^<]{2,8}<\/button>/g) || []).slice(0, 8));
check('★ 진행바가 있다', html.includes('class="stepbar"'));
check('옛 값 receipts 로 열어도 같은 화면이다 (자동으로 읽힌다)',
  (window.DB.tab = 'receipts', window.viewCase() === html));
window.DB.tab = 'auto';

console.log('\n[③ 수취 등록은 항목 옆에서만 — 검수 실행 전에도]');
const c = window.getCase('103');
check('전제: 검수 실행 전이다', !c.inspectedAt, c.inspectedAt);
const target = c.checklist.filter(it => it.included)
  .find(it => ['miss', 'unc'].includes(window.itemStatus(it).code));
check('전제: 미처리 항목이 있는 건이다', !!target, (c.checklist || []).map(it => window.itemStatus(it).code));
check('★ 그 항목 옆에 [수취 등록] 이 있다 (uid 를 싣고 간다)',
  !!target && html.includes("go('receive','103','" + target.uid + "')"),
  (html.match(/go\('receive'[^)]*\)/g) || []));
check('★ 뭉뚱그린 [수취 등록] 은 없다 (첫 대기 항목으로 떨어지는 경로)',
  !html.includes("go('receive','103')"), (html.match(/go\('receive'[^)]*\)/g) || []));

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 탭은 진행바가 됐고, 처리는 여전히 항목 옆에서 한다');
process.exit(fail ? 1 : 0);
