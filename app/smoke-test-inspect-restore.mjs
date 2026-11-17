/* 검수 결과가 새로고침하면 접힌다 (2026-09-08 연수 · 작업판 「지금 할 일」 4번)

   ★ 무엇이 있었나
     한 번 검수한 건에 다시 들어가면 판정이 안 보이고 [검수 실행] 버튼만 있었다.
     담당자는 같은 건에서 들어올 때마다 다시 눌러야 했다.

     판정 자체는 **부팅 때 이미 읽어 온다** — `loadCasesFromSupabase` 의 중첩 select 가
     `inspection(*, inspection_finding(*))` 까지 가져오고 `rowToFindings` 가 `savedFindings` 에 담는다.
     빠진 것은 **"검수한 적이 있다" 는 표시 하나**였다.
       · `screen-staff.js` 의 결과 노출 게이트는 `!!c.inspectedAt` 만 본다
       · 그런데 `c.inspectedAt` 은 `runInspect()` 가 **실행하는 순간에만** 세운다
       · 부팅 경로에는 그걸 다시 세우는 자리가 없었다
     그래서 화면은 "아직 실행 안 함" 갈래로 떨어져 **복원해 둔 판정을 스스로 감췄다.**
     읽어 오고도 안 보여 주는, 조용한 쪽에 가까운 모양이다.

   ★ 고치면서 같이 지켜야 하는 것 — 조건 없이 복원하면 안 된다
     배분기관이 새 증빙을 내면 `screen-donor.js` 가 `delete c.inspectedAt` 으로 게이트를
     다시 열어, 담당자가 새 증빙까지 대조하게 한다. 그런데 그 삭제는 **기관 브라우저의
     메모리에서만** 일어난다 — 담당자 화면은 늘 새로 부팅한다.
     즉 담당자 쪽에서 게이트를 다시 열어 주던 유일한 힘이 "표시가 복원되지 않는 것" 이었다.
     그냥 복원하면 담당자는 **새 증빙이 빠진 옛 판정**을 결과라고 보게 된다.
     → 그래서 `markStaleInspection()` 이 검수 시각과 증빙 도착 시각을 견준다.

   ★ 그래서 다섯을 본다
     ① 검수 이력이 있으면 `inspectedAt` 이 선다 (새로고침해도 결과가 펼쳐진다)
     ② 검수한 적이 없으면 서지 않는다 (없는 판정을 있다고 하지 않는다)
     ③ 검수 **뒤에** 온 증빙이 있으면 도로 지운다 (옛 판정을 결과라고 하지 않는다)
     ④ 검수 **앞에** 온 증빙뿐이면 그대로 둔다 (이게 흔한 경우다 — 여기서 안 서면 고친 게 아니다)
     ⑤ 화면이 여전히 그 값을 본다 (이름이 갈리면 조용히 원래대로 돌아간다)

   ⚠️ 실 DB 없이 돈다 — 저장소 응답을 검사가 흉내낸다.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-inspect-restore.mjs
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

const D = window.COL.donation, I = window.COL.inspection, A = window.COL.attachment;
const T = window.T;

/* DB 가 주는 donation 한 줄 — 화면 건번호 #225 의 실제 모양을 줄인 것.
   검수 실행 둘(9/7 07:35 · 9/7 22:47)이 이미 저장돼 있다. */
function row(runs){
  return {
    [D.id]:9225, [D.caseNo]:'225', [D.state]:'검수 대기', [D.donorType]:'법인외',
    [D.acquisitionPath]:'구매', [D.itemName]:'롯데월드 어드밴처 티켓', [D.qty]:28,
    [D.unitPrice]:65000, [D.bookValue]:1820000, [D.fairValue]:1820000,
    [D.arriveDate]:'2026-09-07', [D.donationDate]:'2026-09-07',
    distribution: [],
    checklist_item: [
      {id:7201, doc_key:'proof_buy', doc_name:'구매영수증 또는 매입세금계산서',
       kind:'첨부', stage:'접수', owner:'접수', included:true, status:'미수취'},
    ],
    [T.inspection]: runs,
  };
}
const RUNS = [
  {[I.id]:101, [I.startedAt]:'2026-09-07T07:35:19.425+00:00', [I.status]:'success',
   [T.inspectionFinding]:[{id:162, rule_code:'E4', verdict:'이상 없음', reason:'수량 대조'}]},
  {[I.id]:123, [I.startedAt]:'2026-09-07T22:47:58.667+00:00', [I.status]:'success',
   [T.inspectionFinding]:[{id:199, rule_code:'E8', verdict:'판단 보류', reason:'사진 자리에 서류'}]},
];

console.log('\n[① 검수 이력이 있으면 표시가 선다 — 이게 4번의 본체다]');
const c = window.rowToCase(row(RUNS));
check('★ inspectedAt 이 선다 (새로고침해도 결과가 펼쳐진 채로 열린다)', !!c.inspectedAt, c.inspectedAt);
check('★ 가장 늦은 실행을 고른다 (배열 순서가 아니라 시각으로)',
  c.inspectedAt === '2026-09-07', c.inspectedAt);
check('   견줄 원본 시각도 남는다 (날짜만 남기면 같은 날 증빙을 못 가른다)',
  c.lastInspectAt === '2026-09-07T22:47:58.667+00:00', c.lastInspectAt);
check('   판정도 함께 복원돼 있다 (표시만 없었지 값은 원래 왔다)',
  (c.savedFindings || []).length === 2, (c.savedFindings || []).length);

console.log('\n[② 검수한 적이 없으면 서지 않는다]');
const cNone = window.rowToCase(row([]));
check('★ inspectedAt 이 undefined 다 (없는 판정을 있다고 하지 않는다)',
  cNone.inspectedAt === undefined, cNone.inspectedAt);
check('   lastInspectAt 도 비어 있다', !cNone.lastInspectAt, cNone.lastInspectAt);

console.log('\n[③ 검수 뒤에 온 증빙이 있으면 도로 지운다]');
/* 기관이 22:47 검수 뒤인 23:10 에 인수증을 냈다 — 담당자는 다시 검수해야 한다.
   지우지 않으면 새 증빙이 빠진 옛 판정이 '검수 결과' 로 뜬다. */
const cStale = window.rowToCase(row(RUNS));
cStale.lastEvidenceAt = '2026-09-07T23:10:00.000+00:00';
window.markStaleInspection(cStale);
check('★ 검수 뒤 증빙 → 게이트가 다시 열린다', cStale.inspectedAt === undefined, cStale.inspectedAt);

console.log('\n[④ 검수 앞에 온 증빙뿐이면 그대로 둔다 — 흔한 경우다]');
const cFresh = window.rowToCase(row(RUNS));
cFresh.lastEvidenceAt = '2026-09-07T05:52:53.487+00:00';   /* #225 인수증 실제 제출 시각 */
window.markStaleInspection(cFresh);
check('★ 검수가 더 뒤면 결과를 그대로 보여 준다', !!cFresh.inspectedAt, cFresh.inspectedAt);
/* ⚠️ 증빙 시각을 모르는 건(옛 건·데모)은 지우지 않는다 — 모른다고 감추면 ①이 헛돈다 */
const cUnknown = window.rowToCase(row(RUNS));
window.markStaleInspection(cUnknown);
check('   증빙 시각을 모르면 지우지 않는다', !!cUnknown.inspectedAt, cUnknown.inspectedAt);

console.log('\n[⑤ 첨부 복원이 견줄 시각을 실제로 적어 둔다]');
/* restoreAttachments 가 c.lastEvidenceAt 을 안 채우면 ③이 영영 안 돈다 —
   그러면 검사 ③은 초록인데 실제로는 아무것도 안 막힌다. 그 자리를 여기서 막는다. */
const cAtt = window.rowToCase(row(RUNS));
cAtt.checklist.forEach((it, i) => { it.dbId = 7201 + i; });
window.sbReady = () => true;
window.signFile = () => Promise.resolve(null);
window.startUrlRefresh = () => {};
window.sbGet = () => Promise.resolve([
  {[A.id]:82, [A.checklistItemId]:cAtt.checklist[0].dbId, [A.fileName]:'영수증.pdf',
   [A.mimeType]:'application/pdf', [A.fileSize]:900, [A.storageKey]:'k1',
   [A.uploadedByRole]:'donor', [A.uploadedAt]:'2026-09-08T01:00:00.000+00:00'}]);
await window.restoreAttachments(cAtt);
check('★ 첨부 복원이 도착 시각을 건에 적는다',
  cAtt.lastEvidenceAt === '2026-09-08T01:00:00.000+00:00', cAtt.lastEvidenceAt);
window.markStaleInspection(cAtt);
check('★ 그래서 검수 뒤 첨부가 게이트를 다시 연다 (①~④가 실제로 이어진다)',
  cAtt.inspectedAt === undefined, cAtt.inspectedAt);

console.log('\n[⑥ 화면이 여전히 그 값을 본다 — 이름이 갈리면 조용히 원래대로 돌아간다]');
const staff = readFileSync(APP + 'screen-staff.js', 'utf8');
check('★ 결과 노출 게이트가 c.inspectedAt 을 본다',
  /!!c\.inspectedAt/.test(staff), false);
check('   검수 실행이 그 값을 세우는 자리도 그대로다',
  /\.inspectedAt\s*=\s*TODAY/.test(staff), false);
const donor = readFileSync(APP + 'screen-donor.js', 'utf8');
check('★ 새 증빙이 게이트를 다시 여는 자리도 살아 있다 (③이 지키는 설계)',
  /delete c\.inspectedAt/.test(donor), false);

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 한 번 검수한 건은 다시 눌러도 되지 않는다');
process.exit(fail ? 1 : 0);
