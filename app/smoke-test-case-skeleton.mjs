/* 건 상세 골격 — 카드가 상태에 따라 위아래로 옮겨 다니지 않는가 (설계서 §4 F · 2026-09-06)

   ★ 무엇이 있었나 — 같은 화면인데 건의 상태마다 순서가 달랐다.
       · 저장 실패 배너가 판정 요약보다 위에 떴다
       · 배분결정 카드가 항목 카드보다 위에 있었다
       · 배분기관 증빙 링크 카드는 **기관 증빙을 기다리는 동안에만 맨 위로 튀어 올랐다가**
         제출되면 맨 아래로 내려갔다
     담당자는 건마다 다른 화면을 읽게 된다. 무엇이 어디 있는지 매번 찾는다.

   ★ 그래서 순서를 못박는다 (설계서 §4 F)
       ① 판정 요약 · [완결 처리] (검수 전이면 [검수 실행])   ← 늘 맨 위
       ② 저장 실패 배너 (있을 때만)
       ③ 항목 카드 목록                                      ← 이 화면의 본문
       ④ 배분결정 / 배분기관 증빙 링크                        ← 늘 여기
       ⑤ 하단 액션

   ★ 검사 방법 — 상태 다섯 가지를 만들어, **그 화면에 있는 표지들이 늘 이 순서로** 나오는지 본다.
     없는 표지는 건너뛴다(상태마다 있는 카드가 다르다). 순서가 뒤집히면 빨개진다.

   데모 데이터로 돈다 — 서버·DB 불필요.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-case-skeleton.mjs
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

/* 골격의 다섯 자리 — 화면에서 그 자리를 알아보는 표지 */
const SLOTS = [
  ['① 판정 요약 · 완결/검수 실행', h => Math.max(h.indexOf('gate-row'), h.indexOf('runInspect()">검수 실행'))],
  ['② 저장 실패 배너',            h => h.indexOf('저장되지 않았습니다')],
  ['③ 항목 카드 본문',            h => h.indexOf('AI는 <b>금액')],   /* 항목 카드 바로 위의 고지 한 줄 */
  ['④ 배분결정 · 증빙 링크',      h => Math.max(h.indexOf('<h3>배분결정'), h.indexOf('<h3>배분기관 증빙 제출 링크</h3>'))],
  /* ⑤ 하단 액션은 지금 비어 있다 (§4 F — 뭉뚱그린 [수취 등록] 을 뺐다). 자리만 남겨 둔다 */
];
/* ★ 있는 것만 본다 — 상태마다 있는 카드가 다르다. 없는 자리를 요구하면 검사가 상태를 강요하게 된다 */
function orderOk(tag, h){
  const found = SLOTS.map(([n, f]) => [n, f(h)]).filter(([, i]) => i >= 0);
  console.log('   ' + tag + ' — ' + found.map(([n, i]) => n.slice(0, 2) + ':' + i).join(' '));
  for (let k = 1; k < found.length; k++){
    if (found[k][1] < found[k - 1][1]){
      check(tag + ' 순서', false, {앞: found[k - 1][0], 뒤: found[k][0], 자리: [found[k - 1][1], found[k][1]]});
      return;
    }
  }
  check(tag + ' — 골격 순서대로', true);
}

window.DB.role = 'staff'; window.DB.screen = 'case'; window.DB.tab = 'checklist';

console.log('\n[상태가 달라도 순서는 같다]');
window.DB.caseId = '103';
const c = window.getCase('103');
orderOk('검수 전        ', window.viewCase());

/* ② 저장 실패 배너 — 판정 요약보다 아래여야 한다 (전에는 위였다) */
window.DB.caseSaveErr = {'103': {msg: '검사용 — 일부러 세운 실패'}};
orderOk('저장 실패 배너 ', window.viewCase());
window.DB.caseSaveErr = {};

/* ③④ 검수를 마친 건 — 배분결정 카드가 항목 카드보다 아래여야 한다 (전에는 위였다) */
c.checklist.forEach(it => { it.r.st = 'done'; it.r.status = '수취완료'; });
c.inspectedAt = '2026-09-05';
orderOk('검수 후        ', window.viewCase());

/* ④ 배분처를 정한 직후 — 증빙 링크 카드가 **맨 위로 튀어 오르지 않아야** 한다 (전에는 올라왔다) */
window.DB.distForm = {caseId:'103', orgName:'늘봄지역아동센터', qty:String(c.donation.qty), memo:''};
window.decideDist('103');
window.DB.tab = 'checklist';
const hDist = window.viewCase();
orderOk('배분처 지정 후 ', hDist);
check('★ 증빙 링크 카드가 판정 요약보다 아래다',
  hDist.indexOf('<h3>배분기관 증빙 제출 링크</h3>') > Math.max(hDist.indexOf('gate-row'), hDist.indexOf('runInspect()">검수 실행')),
  {링크: hDist.indexOf('<h3>배분기관 증빙 제출 링크</h3>'), 판정: Math.max(hDist.indexOf('gate-row'), hDist.indexOf('runInspect()">검수 실행'))});
check('★ 증빙 링크 카드가 항목 본문보다 아래다',
  hDist.indexOf('<h3>배분기관 증빙 제출 링크</h3>') > hDist.indexOf('AI는 <b>금액'),
  {링크: hDist.indexOf('<h3>배분기관 증빙 제출 링크</h3>'), 본문: hDist.indexOf('AI는 <b>금액')});

/* ⑤ 완결 건 */
window.DB.caseId = '101';
orderOk('완결           ', window.viewCase());

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 건 상세는 늘 같은 순서다');
process.exit(fail ? 1 : 0);
