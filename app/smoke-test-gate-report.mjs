/* 결과보고서가 완결을 영구히 막았다 (2026-09-08 연수 발견 · 선미 결정 · #225·#228)

   ★ 무엇이 있었나
     배분처 폼은 결과보고서를 **"선택"** 으로 두고 안 내도 제출시킨다(orgSlotRequired).
     그런데 완결 게이트는 배분 항목이 하나라도 미수취면 '배분진행' 으로 묶었다.
     **미수취 항목은 사유 해소도 안 된다**(확인필요에만 열린다).
     → 기관이 규칙대로 제출을 마쳐도 담당자는 완결을 누를 수 없었다.
       출구가 담당자가 없는 서류를 대신 올리는 것뿐이었다 — #226 이 그렇게 완결됐다.
     #228(기관이 결과보고서를 docx 로 올렸다가 저장소가 거절) 도 같은 자리로 떨어진다.

   ★ 결정 (2026-09-08 선미)
     결과보고서는 기관 업무지침에서 **"인수증 수령이 어려운 경우 대체자료"** 라
     필수로 잡을 근거가 없다. 다만 **체크리스트에서 빼지 않는다** —
     항목은 화면에 그대로 두고(기관이 내면 받아서 처리해야 한다) **완결 게이트에서만** 뺀다.
     ⚠️ 인수증 수취완료를 조건으로 걸지 않는다 — 조건을 안 걸면 규칙이 한 줄로 끝나고,
       안 걸어서 생기는 손해가 없다.

   ★ 그래서 여덟을 본다
     ① 결과보고서만 미수취면 완결할 수 있다 (이 고침의 본체)
     ② 인수증이 미수취면 여전히 막는다 (게이트를 통째로 푼 게 아니다)
     ③ 배분 물품사진이 미수취면 여전히 막는다
     ④ 조건을 안 걸었다 — 인수증이 미수취여도 '결과보고서 때문에' 막히지는 않는다
     ⑤ 항목은 화면에서 사라지지 않는다 (체크리스트에 그대로 · 미수취로 보인다)
     ⑥ 문구가 사실과 같다 — 안내에 '결과보고서' 가 남아 있으면 화면이 거짓말한다
     ⑦ 접수 단계 서류는 그대로 막는다 (완화가 번지지 않았다)
     ⑧ 화면도 선택 항목을 오류로 그리지 않는다 (2026-09-15 · 항목 카드 · 수취 요약표 · 기관 배지)

   데모 데이터 없이 돈다 — inspect() 는 순수 함수다.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-gate-report.mjs
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

/* #225 를 줄인 모양 — 접수 서류는 다 받았고 배분처가 하나 정해져 있다.
   st: 'done' = 수취완료 · 'miss' = 미수취 */
function caseWith(inss, photo, report){
  return {
    id:'225', dbId:45, state:'검수 대기', donorType:'법인외', acqPath:'구매',
    orgId:19, orgName:'늘봄지역아동센터',
    donation:{itemName:'롯데월드 어드밴처 티켓', qty:28, unitPrice:65000,
              book:1820000, fair:1820000, arriveDate:'2026-09-07', donationDate:'2026-09-07'},
    checklist:[
      {key:'privacy_ok',  n:'개인정보 수집·이용 동의', kind:'F', stage:'접수', included:true, r:{st:'done'}},
      {key:'appl_indiv',  n:'물품기부신청서(법인 외용)', kind:'S', stage:'접수', included:true, r:{st:'done'}},
      {key:'proof_buy',   n:'구매영수증 또는 매입세금계산서', kind:'A', stage:'접수', included:true, r:{st:'done'}},
      {key:'photo',       n:'물품사진', kind:'A', stage:'접수', included:true, r:{st:'done'}},
      {key:'inss',        n:'인수증', kind:'A', stage:'배분', included:true, distId:19, r:{st:inss}},
      {key:'dist_photo',  n:'배분 물품 사진', kind:'A', stage:'배분', included:true, distId:19, r:{st:photo}},
      {key:'report_dom',  n:'배분 결과보고서(국내지원)', kind:'A', stage:'배분', included:true, distId:19, r:{st:report}},
    ]};
}
const TODAY = window.TODAY;

console.log('\n[① 결과보고서만 미수취면 완결할 수 있다 — 이 고침의 본체]');
/* #225 가 정확히 이 모양이다: 인수증·배분사진은 받았고 결과보고서만 안 왔다 */
let r = window.inspect(caseWith('done', 'done', 'miss'), TODAY);
check('★ 완결 판정이 난다', r.verdict === '완결', r.verdict);
check('★ 완결 버튼이 열린다', r.canComplete === true, r.canComplete);
check('   배분 미결이 0으로 세어진다', r.distOpen === 0, r.distOpen);

console.log('\n[② 인수증이 미수취면 여전히 막는다 — 게이트를 통째로 푼 게 아니다]');
r = window.inspect(caseWith('miss', 'done', 'done'), TODAY);
check('★ 배분진행에 머문다', r.verdict === '배분진행', r.verdict);
check('★ 완결 버튼이 잠긴다', r.canComplete === false, r.canComplete);

console.log('\n[③ 배분 물품사진이 미수취면 여전히 막는다]');
r = window.inspect(caseWith('done', 'miss', 'done'), TODAY);
check('★ 배분진행에 머문다', r.verdict === '배분진행', r.verdict);
check('★ 완결 버튼이 잠긴다', r.canComplete === false, r.canComplete);

console.log('\n[④ 인수증 수취완료를 조건으로 걸지 않았다]');
/* 조건을 걸었다면 "인수증이 아직인데 결과보고서도 없다" 가 두 건으로 세어져야 한다.
   안 걸었으므로 막는 것은 **인수증 하나뿐**이다 — 규칙이 한 줄로 끝난다(선미). */
r = window.inspect(caseWith('miss', 'done', 'miss'), TODAY);
check('★ 막는 것은 인수증 하나뿐이다 (결과보고서는 세지 않는다)', r.distOpen === 1, r.distOpen);
check('   판정 함수가 결과보고서를 게이트에서 뺀다',
  window.blocksComplete({key:'report_dom'}) === false, window.blocksComplete({key:'report_dom'}));
check('   인수증·배분사진은 그대로 막는다',
  window.blocksComplete({key:'inss'}) === true && window.blocksComplete({key:'dist_photo'}) === true, false);

console.log('\n[⑤ 항목은 화면에서 사라지지 않는다 — 기관이 내면 받아서 처리해야 한다]');
r = window.inspect(caseWith('done', 'done', 'miss'), TODAY);
const rep = r.items.filter(i => i.key === 'report_dom');
check('★ 체크리스트에 그대로 있다 (게이트에서만 뺐다)', rep.length === 1, r.items.map(i => i.key));
check('★ 미수취로 셈한다 (안 온 것을 왔다고 하지 않는다 · 라벨 문구는 ⑧-1)',
  rep[0] && rep[0].code === 'miss', rep[0]);
check('   미수취 건수에도 그대로 세어진다 (담당자는 아직 안 왔다는 걸 안다)',
  r.missingCount === 1, r.missingCount);

console.log('\n[⑥ 문구가 사실과 같다]');
r = window.inspect(caseWith('miss', 'done', 'miss'), TODAY);
check('★ 대기 안내에 결과보고서가 없다 (있으면 화면이 거짓말한다)',
  !/결과보고서/.test(r.reasonMessage || ''), r.reasonMessage);
check('   무엇을 기다리는지는 그대로 말한다',
  /인수증/.test(r.reasonMessage || ''), r.reasonMessage);

console.log('\n[⑦ 접수 단계 서류는 그대로 막는다 — 완화가 번지지 않았다]');
const cIntake = caseWith('done', 'done', 'done');
cIntake.checklist[2].r = {st:'miss'};      /* 구매영수증 미수취 */
r = window.inspect(cIntake, TODAY);
check('★ 접수 서류가 비면 미완결이다', r.verdict === '미완결', r.verdict);
check('★ 완결 버튼이 잠긴다', r.canComplete === false, r.canComplete);

/* ═══════════════════════════════════════════════════════════════
   ⑧ 화면이 선택 항목을 오류로 그리지 않는다 (2026-09-15 선미 · 동료 피드백 후보 ①)

   ★ 무엇이 남아 있었나 — 9/8 에 게이트에서는 뺐는데 **화면만 여전히 빨갛게** 그렸다.
     빨간 띠(st-miss) · 분홍 배경 · 빨간 ✕(chk miss) · 빨간 배지(pill dg) 넷이 동시에 붙어
     **완결한 건을 열어도** 담당자가 처리할 일이 남은 것처럼 보였다.
     테스트 참여자가 동료 테스트에서 진행 중과 완결 후 두 차례 의견을 줬다.
   ★ 고친 방법 — 9/11 '제출됨 · 확인 전' 과 같은 손잡이. code 는 'miss' 그대로, tone 만 'neu'.
     그래서 위 ①~⑦ 이 보는 게이트·판정·건수는 하나도 안 바뀐다(위에서 이미 확인했다).
   ★ 여기서 보는 것은 **표시 세 자리**다 — 항목 카드 · 수취 요약표 · 기관 아코디언 배지.
   ⚠️ 셋 다 "수를 줄이지 않았는가" 를 함께 본다. 3 을 2 로 만들면 안 온 것을 왔다고 하는 셈이다.
   ═══════════════════════════════════════════════════════════════ */
console.log('\n[⑧-1 항목 카드 — 선택 항목은 회색, 사유줄은 완결 가능하다고 말한다]');
const stOpt = window.itemStatus({key:'report_dom', n:'배분 결과보고서(국내지원)', kind:'A', r:{st:'miss'}});
check('★ 라벨이 선택 항목임을 말한다', stOpt.status === '선택 항목 · 미수취', stOpt.status);
check('★ 라벨에서 미수취를 지우지 않았다 (안 온 것을 왔다고 하지 않는다)',
  /미수취/.test(stOpt.status), stOpt.status);
check('★ 괄호 부연이 없다 (문구 규칙 4번)', !/[()]/.test(stOpt.status), stOpt.status);
check('★ 회색으로 간다 — 빨간 띠·✕·배지가 함께 내려간다', stOpt.tone === 'neu', stOpt.tone);
check('★ code 는 miss 그대로 — 수취 흐름·[수취 등록]·게이트가 이 값을 본다',
  stOpt.code === 'miss', stOpt.code);
/* ★ 사유줄은 "완결이 가능하다" 를 말로 적는다 (선미 결정 2026-09-15 · 규칙 1·5 를 일부러 비켜 간다)
     배지만으로는 "선택인데 미수취면 어떻게 되나" 가 안 풀린다 — 테스트 참여자가 멈춘 지점이 거기다. */
check('★ 사유줄이 완결 가능하다는 것을 말로 적는다',
  stOpt.reason === '배분처 제출 선택항목입니다. 미수취 상태여도 완결이 가능합니다', stOpt.reason);
const stOptOver = window.itemStatus({key:'report_dom', kind:'A', r:{st:'miss', overdue:true}});
check('   기한이 지났으면 그 사실을 앞에 붙인다',
  stOptOver.reason === '기한 경과 · 배분처 제출 선택항목입니다. 미수취 상태여도 완결이 가능합니다', stOptOver.reason);

console.log('\n[⑧-2 완화가 번지지 않았다 — 막는 서류는 그대로 빨갛다]');
const stInss = window.itemStatus({key:'inss', n:'인수증', kind:'A', r:{st:'miss'}});
check('★ 인수증은 그대로 미수취다', stInss.status === '미수취', stInss.status);
check('★ 인수증에는 회색 tone 이 안 붙는다', !stInss.tone, stInss.tone);
check('   사유줄도 그대로다', stInss.reason === '미수취 상태입니다', stInss.reason);
const stPhoto = window.itemStatus({key:'dist_photo', kind:'A', r:{st:'miss'}});
check('★ 배분 물품 사진도 그대로 미수취다',
  stPhoto.status === '미수취' && !stPhoto.tone, stPhoto);

/* 배분처 항목 세 벌 — 아코디언·요약표에 그대로 넣는다 */
function distIts(inss, photo, report){
  return [
    {key:'inss',       n:'인수증', kind:'A', stage:'배분', included:true, uid:'u1', distId:19, r:{st:inss}},
    {key:'dist_photo', n:'배분 물품 사진', kind:'A', stage:'배분', included:true, uid:'u2', distId:19, r:{st:photo}},
    {key:'report_dom', n:'배분 결과보고서(국내지원)', kind:'A', stage:'배분', included:true, uid:'u3', distId:19, r:{st:report}},
  ];
}

console.log('\n[⑧-3 수취 요약표 — 부족분이 선택 항목뿐이면 빨갛게 하지 않는다]');
let sum = window.recvSummary([{k:'배분처 수취', its:distIts('done', 'done', 'miss')}]);
check('★ 빨간 글씨가 없다 (완결한 건인데 덜 온 것처럼 보이던 자리)',
  !/--danger/.test(sum), sum.match(/--danger[^<]*/g));
check('★ 수는 그대로다 — 받을 3 · 들어온 2', /">3</.test(sum) && /">2</.test(sum), sum);
sum = window.recvSummary([{k:'배분처 수취', its:distIts('miss', 'done', 'miss')}]);
check('★ 인수증이 없으면 그대로 빨갛다 (완화가 번지지 않았다)',
  /--danger/.test(sum), sum);

console.log('\n[⑧-4 기관 아코디언 배지]');
const acc = (i, p, rp) => window.orgAccordion({name:'늘봄지역아동센터', its:distIts(i, p, rp)}, () => '', true, false);
let a = acc('done', 'done', 'miss');
check('★ 선택 항목만 남았으면 빨간 미수취를 안 붙인다', !/pill dg/.test(a), a.slice(0, 260));
check('★ 선택 항목이라고 적는다', /선택 항목 1/.test(a), a.slice(0, 260));
check('★ 확인 전이라고 거짓말하지 않는다 (pend 가 miss 를 함께 세던 자리)',
  !/확인 전/.test(a), a.slice(0, 260));
check('★ 다 받음이라고도 하지 않는다 — 결과보고서는 정말 안 왔다',
  !/다 받음/.test(a), a.slice(0, 260));
check('   2/3 은 그대로다 (수를 줄이지 않는다)', /2\/3/.test(a), a.slice(0, 200));
a = acc('miss', 'done', 'miss');
check('★ 인수증이 없으면 빨간 미수취 1 이다 (선택 항목은 안 세어 2 가 아니다)',
  /pill dg/.test(a) && /미수취 1/.test(a), a.slice(0, 260));
a = acc('unc', 'done', 'miss');
check('★ 인수증이 확인 전이면 확인 전 1 이다 (선택 항목에 가려지지 않는다)',
  /확인 전 1/.test(a) && !/선택 항목/.test(a), a.slice(0, 260));
a = acc('done', 'done', 'done');
check('★ 전부 오면 다 받음이다', /다 받음/.test(a), a.slice(0, 260));

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 결과보고서는 게이트와 색에서만 빠졌고, 나머지는 그대로 막는다');
process.exit(fail ? 1 : 0);
