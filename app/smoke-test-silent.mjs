/* ════════════════════════════════════════════════════════════════
   조용한 실패 방어 — 지키고 있는가 (2026-09-02 유진)

   ★ 이 검사는 기능을 보지 않는다. **방어가 아직 거기 있는지**를 본다.
     누가 방어를 지우면 여기가 빨개진다. 그것이 이 파일의 유일한 일이다.

   ★ 왜 만들었나 — 이틀 동안 같은 모양을 여러 번 만났다.
     목록 정본은 (미공개 내부 기록) 다 (개수는 거기서만 센다).
     종류는 달라 보이는데 모양은 하나였다:

         "성공처럼 보이는 응답" 을 근거로 성공이라고 판단한 것

     HTTP 204 도, 초록 검사도, 대장의 ✅ 도 전부 같은 모양이다.
     사람이 기억해서 막을 수 있는 양이 아니다.

   ⚠️ 여기 있는 항목을 지울 때는 **그 사고가 왜 다시 안 나는지**를 먼저 적어라.
     "이제 안 그럴 것 같아서" 는 이유가 아니다. 우리는 이미 여러 번 그랬다(목록 참조).

   서버·DB 가 필요 없다. 돌리는 법:
     JSDOM_FROM=/tmp/fast node smoke-test-silent.mjs
   ════════════════════════════════════════════════════════════════ */
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
window.eval('render = function(){};');

let fail = 0;
const check = (n, ok, got) => {
  console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got)));
  if (!ok) fail++;
};
const wait = () => new Promise(r => setTimeout(r, 30));
const say = (n, story) => { console.log('\n[' + n + ']'); console.log('   겪은 일: ' + story); };

/* ─────────────────────────────────────────────────────────────
   ① 애매하면 아무것도 돌려주지 않는다
   ───────────────────────────────────────────────────────────── */
say('① 여러 개가 걸리면 첫 번째를 주지 않는다',
    '3번 기관 인수증을 눌렀는데 1번 기관 것이 처리됐다. 에러는 안 났다. (9/1)');
window.DB.cases.push({id:'T1', checklist:[
  window.mkItem({key:'inss', n:'인수증 · A', kind:'A', stage:'배분', distId:1}),
  window.mkItem({key:'inss', n:'인수증 · B', kind:'A', stage:'배분', distId:2})
]});
check('★ key 가 여러 개 걸리면 null 을 준다', window.getItem('T1', 'inss') === null,
      window.getItem('T1', 'inss'));
check('uid 로 부르면 정확히 하나를 준다', window.getItem('T1', 'inss#2').n === '인수증 · B');
check('★ 왜 못 찾았는지 사람이 읽을 문장이 있다',
      /uid|여러|2개/.test(window.itemLookupError('T1', 'inss') || ''),
      window.itemLookupError('T1', 'inss'));

/* ─────────────────────────────────────────────────────────────
   ② 상태코드가 아니라 실제 결과를 본다
   ───────────────────────────────────────────────────────────── */
say('② HTTP 성공을 성공으로 읽지 않는다',
    'RLS 는 거부가 아니라 "보이는 행이 없음" 으로 막는다 — DELETE 가 204 를 돌려주는데 행은 남았다. (9/1)');
window.eval("SUPABASE_CONFIG = {url:'https://x.supabase.co', key:'k'};");
const c = {id:'T2', dbId:1, dists:[]};
/* 200 인데 바뀐 행이 0건 */
window.fetch = () => Promise.resolve({ok:true, json:() => Promise.resolve([])});
let e1 = null;
await window.saveDonationFields(c, {state:'완결'}).catch(e => { e1 = e.message; });
check('★ donation: 바뀐 행이 0건이면 실패로 본다', /행이 없습니다/.test(e1 || ''), e1);

const it = window.mkItem({key:'photo', n:'물품사진', kind:'A', stage:'접수'});
it.dbId = 5;
let e2 = null;
await window.saveItemStatus(c, it).catch(e => { e2 = e.message; });
check('★ checklist_item: 바뀐 행이 0건이면 실패로 본다', /행이 없습니다/.test(e2 || ''), e2);

/* 판정 해소도 같은 방어 */
window.fetch = (u) => /inspection\?/.test(u)
  ? Promise.resolve({ok:true, json:() => Promise.resolve([{id:1, started_at:'x',
      inspection_finding:[{id:9, rule_code:'E3'}]}])})
  : Promise.resolve({ok:true, json:() => Promise.resolve([{id:9}])});   /* 값이 안 담겨 돌아옴 */
let e3 = null;
await window.saveFindingResolution(c, 'E3', '사유').catch(e => { e3 = e.message; });
check('★ 판정 해소: 값이 안 남았으면 실패로 본다', /값이 남지 않았습니다/.test(e3 || ''), e3);

/* ─────────────────────────────────────────────────────────────
   ③ 저장 안 된 것을 저장했다고 하지 않는다
   ───────────────────────────────────────────────────────────── */
say('③ 붙을 데가 없으면 조용히 넘어가지 않는다',
    '검사는 sbPost 를 갈아끼우고, 데모 건은 dbId 가 없어 통과한다 — 실 DB 저장 경로를 아무도 못 봤다. (연수 지적 9/2)');
const noId = window.mkItem({key:'photo', n:'물품사진', kind:'A', stage:'접수'});
let e4 = null;
await window.saveItemStatus({id:'T3', dbId:1}, noId).catch(e => { e4 = e.message; });
check('★ dbId 없는 항목의 상태 갱신을 거부한다', /저장되지 않았습니다/.test(e4 || ''), e4);

/* 데모 통과가 실 DB 성공과 구분되는가 */
window.eval("SUPABASE_CONFIG = {url:'https://여기에-프로젝트-URL.supabase.co', key:'여기에'};");
const demo = await window.saveDistribution({id:'T4', dbId:null}, {id:'sd1', orgName:'x', qty:1});
check('★ 데모 통과는 demo 표시가 붙는다 (실 DB 성공과 구분된다)', demo.demo === true, demo);

/* ─────────────────────────────────────────────────────────────
   ④ 안 오는 것을 기다리지 않는다
   ───────────────────────────────────────────────────────────── */
say('④ 응답이 안 오면 끊는다',
    '시간을 재서 끊는 코드가 아예 없었다. 시연 중 AI 가 안 돌아오면 스피너가 영영 돈다. (9/2)');
window.eval('JUDGE_TIMEOUT_MS = 80; JUDGE_RETRY_WAIT = 5;');
let aborted = false;
window.fetch = (u, o) => new Promise((_, rej) => {
  o.signal.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); });
});
const t0 = Date.now();
const to = await window.postJudge({}).then(() => null).catch(e => e.message);
check('★ 시간 초과로 끊긴다', /시간 초과/.test(to || ''), to);
check('★ 요청을 실제로 abort 한다', aborted);
check('영원히 기다리지 않는다', Date.now() - t0 < 2000, Date.now() - t0);
check('★ 실패 종류를 짐작하지 않는다 (429 아니면 전부 timeout 이던 것)',
      window.judgeFailKind(new Error('HTTP 500')) === 'error',
      window.judgeFailKind(new Error('HTTP 500')));

/* ─────────────────────────────────────────────────────────────
   ⑤ 넘어간 것을 통과한 것으로 적지 않는다
   ───────────────────────────────────────────────────────────── */
say('⑤ 사유로 넘어간 것과 실제로 받은 것을 구분한다',
    "status 가 세 값뿐이라 '사유해소' 를 담을 칸이 없었다. '수취완료' 로 적으면 감사에서 거짓말이 된다. (9/2)");
const res = window.mkItem({key:'photo', n:'물품사진', kind:'A', stage:'접수'});
res.r.st = 'unc';
res.r.resolution = {reason:'통화 확인', by:'담당자', date:'2026-09-02'};
const row = window.itemToRow({dbId:1, dists:[]}, res);
check('★ status 는 넘어가기 전 값 그대로다', row.status === '확인필요', row.status);
check('사유는 옆 칸에 따로 적힌다', row.resolution_reason === '통화 확인', row.resolution_reason);

/* ─────────────────────────────────────────────────────────────
   ⑥ 개인정보가 따라 들어가지 않는다
   ───────────────────────────────────────────────────────────── */
say('⑥ 폼에 칸이 늘어도 개인정보가 안 따라간다',
    '폼 객체를 통째로 담으면 칸이 하나 늘 때마다 개인정보가 조용히 들어간다. (9/2 설계)');
const payload = window.submissionPayload(
  {itemName:'생수', qty:'300', donorName:'홍길동', ssn:'900101-1234567',
   phone:'010-1234-5678', 몰래추가된칸:'개인정보일지도'}, {acqPath:'구매'}, 300, 1, 1);
const pj = JSON.stringify(payload);
check('★ 이름이 안 들어간다', pj.indexOf('홍길동') < 0);
check('★ 주민번호가 안 들어간다', pj.indexOf('900101') < 0);
check('★ 나중에 늘어난 칸도 안 들어간다 (화이트리스트)', pj.indexOf('개인정보일지도') < 0, pj);

/* ─────────────────────────────────────────────────────────────
   ⑦ 게이트를 저장 없이 열지 않는다
   ───────────────────────────────────────────────────────────── */
say('⑦ 사유가 저장되지 않으면 완결 게이트가 안 열린다',
    '해소는 완결을 여는 열쇠다. 저장 안 된 채 열리면 담당자는 완결시키는데 DB 에 근거가 없다. (9/2)');
const cg = window.DB.cases[0];
cg.findingRes = {};
const F = {rule:'E3', verdict:'확인 권장', isError:true, blocksComplete:true, reason:'x'};
window.compareFindings = () => [F];
window.compareBlocking = () => [F];
window.el = () => ({value:'사유'});
window.saveFindingResolution = () => Promise.reject(new Error('HTTP 401'));
window.resolveFinding(cg.id, 'E3');
await wait();
check('★ 저장 실패하면 해소되지 않는다', !window.findingRes(cg, 'E3'), cg.findingRes);
check('★ 완결 게이트가 계속 막혀 있다', window.unresolvedBlocking(cg).length === 1);

/* ⑧ DB 행 → 화면 모델 매핑이 빠지지 않았는가 (2026-09-02 연수 · 실주행에서 드러남)
   ★ 이 모양이 두 번 나왔다 — COL 선언은 있고 저장도 하는데 rowToCase 가 안 읽는 것.
     선언이 있으니 매핑된 것처럼 보인다. 값은 조용히 undefined 가 된다.
       · donorBizNo → isProfitCorp() 가 늘 '모름' (영리/비영리 분기가 안 탐)
       · acqPath    → autoChecklist 의 취득경로 축이 빠진 목록이 만들어짐
     둘 다 같은 브라우저로 이어서 하면 안 드러난다. DB 에서 되읽을 때만 나타난다. */
console.log('\n[⑧ 저장한 값을 되읽는가 — COL 선언만 있고 안 읽던 자리]');
const mapped = window.rowToCase({
  case_no:'999', state:'검수 대기', donor_type:'법인', donor_name:'테스트(주)',
  donor_biz_no:'124-81-55678', acquisition_path:'제조·유통',
  item_name:'테스트', qty:1, qty_as_received:1, qty_unit:'개', pack_size:1,
  unit_price:0, book_value:0, fair_value:1000, in_date:'2026-07-01', deadline:'2026-07-30'});
check('★ donorBizNo 를 되읽는다 (안 읽으면 영리 판정이 늘 모름)',
      mapped.donorBizNo === '124-81-55678', mapped.donorBizNo);
check('★ acqPath 를 되읽는다 (안 읽으면 취득경로 축이 빠진 체크리스트가 만들어진다)',
      mapped.acqPath === '제조·유통', mapped.acqPath);

/* ⑨ 받아야 할 서류가 0개일 때 제출을 막는가 (2026-09-02 선미 요청 · 연수 실주행에서 드러남)
   ★ 빈 배열은 filter 를 그냥 통과한다. 슬롯 0 을 '첨부 필요 없음' 으로 읽으면
     첨부 0건으로 제출되고, 후원자는 냈다고 믿고 담당자는 안 왔다고 본다.
     조합 16가지 전부 최소 2개라 0 은 정상 상태가 아니다. */
console.log('\n[⑨ 받아야 할 서류가 0개면 제출을 막는가]');
const cz = window.DB.cases.find(x => x.checklist && x.checklist.length) || window.DB.cases[0];
window.DB.donorForm = {donorType:'법인', donorName:'테스트(주)', bizNo:'220-81-45012', donDate:'2026-09-04',   /* 비면 막힌다 — M-1 이후 (2026-09-06) */
  path:'구매', itemName:'생수', qty:'10', unitBook:'1000', unitSale:'', note:'',
  wantsReceipt:true, privacy:true, agreePurpose:true, agreeDouble:true, privacyTransfer:true, corpAck:true,
  files:{}, signed:true, under14:false, guardian:false,
  verified:true, submittedId:null, linkCaseId:cz.id};
const saved = cz.checklist;
cz.checklist = [];                                   /* 목록을 못 불러온 상태를 만든다 */
const errsEmpty = window.donorErrors(window.DB.donorForm);
check('★ 슬롯이 0이면 제출을 막는다 (그냥 통과하면 첨부 0건으로 접수된다)',
      errsEmpty.some(m => /불러오지 못했습니다/.test(m)), errsEmpty);
cz.checklist = saved;                                /* 되돌린다 */
const errsBack = window.donorErrors(window.DB.donorForm);
check('목록이 정상이면 이 오류는 안 뜬다 (정상 제출을 막지 않는다)',
      !errsBack.some(m => /불러오지 못했습니다/.test(m)), errsBack);

/* ⑩ 접수번호가 겹치면 조용히 옛 건을 집는가 (2026-09-03 유진 · dev 에서 드러남)
   ★ DB.demo.seq 는 페이지를 열 때마다 0 에서 시작해 201 을 만들었는데,
     실 DB 에는 지난 세션이 만든 201 이 남아 있었다. getCase 가 첫 번째를 돌려줘
     후원자 폼이 **남의 건**에 묶였고, 그 건에는 본인확인 값이 없어 **잠금이 통째로 건너뛰어졌다.**
     "3번 기관을 눌렀는데 1번이 처리되는"(9/1 getItem) 그 자리가 건 단위로 다시 난 것이다. */
console.log('\n[⑩ 접수번호가 겹쳐도 조용히 옛 건을 집지 않는가]');
const keep = window.DB.cases;
window.DB.cases = [
  {id:'201', dbId:7,    verifyLast4:undefined, checklist:[]},   /* 실 DB 에 남아 있던 옛 건 */
  {id:'201', dbId:9999, verifyLast4:'0000',    checklist:[]}    /* 방금 만든 건 */
];
check('★ 같은 번호가 둘이면 첫 번째를 주지 않는다 (getItem 과 같은 규칙)',
      window.getCase('201') === null, window.getCase('201'));

window.DB.cases = [{id:'201'}, {id:'202'}, {id:'901'}];
check('★ 발번이 이미 쓰인 번호를 피한다 (안 피하면 case_no unique 로 접수가 409)',
      window.nextCaseNo() === '203', window.nextCaseNo());
window.DB.cases = [];
check('빈 상태에서는 201 부터 (기존 번호대를 지킨다)', window.nextCaseNo() === '201', window.nextCaseNo());
window.DB.cases = keep;

/* ⑪ 수취 처리가 DB 에 남는가 (2026-09-03 연수 · 실주행에서 드러남 · 정본 16)
   ★ it.r.st='done' 을 세우는 자리가 넷인데 confirmUpload 하나만 저장을 안 했다.
     화면은 수취완료인데 새로고침하면 미수취로 돌아간다 —
     markReceived 주석이 스스로 경고한 "담당자가 같은 서류를 두 번 처리한다" 가 이 자리다.
   ⚠️ 이번엔 다른 버그(정본 15)가 저장 순서를 밀어내며 가리고 있었다. 그래서 눈으로는 멀쩡했다. */
console.log('\n[⑪ 첨부 수취 처리가 DB 에 남는가]');
{
  const saved = [];
  window.saveItemStatus = (c, it) => { saved.push(it.key); return Promise.resolve({ok:true}); };
  window.DB.cases.push({id:'T10', state:'검수 대기', donorType:'법인', acqPath:'구매',
    checklist:[window.mkItem({key:'proof_buy', n:'구매영수증', kind:'A', stage:'접수'})]});
  const it10 = window.getCase('T10').checklist[0];
  it10.dbId = 991;
  it10.r.st = 'unc';
  it10.r.donorUpload = {status:'uploaded', date:'2026-09-03', fileName:'a.png'};
  window.confirmUpload('T10', 'proof_buy');
  await wait();
  check('★ confirmUpload 가 saveItemStatus 를 부른다 (안 부르면 새로고침에 되돌아간다)',
        saved.includes('proof_buy'), saved);
  check('화면 상태도 수취완료로 선다', it10.r.st === 'done', it10.r.st);
}

/* ⑫⑬⑭ 후원자 제출의 저장 셋 (2026-09-03 연수 실주행 · 정본 18·19 + 유진 §5①)
   한 번 제출시켜 셋을 함께 본다. 전부 '순서와 독립성' 이야기라 같은 자리에서 갈린다. */
console.log('\n[⑫⑬⑭ 후원자 제출 — 순서와 독립성]');
{
  const order = [], statusSaved = [];
  let checklistRan = false, formRan = false;

  window.DB.cases.push({id:'T11', state:'제출 대기', donorType:'법인', acqPath:'구매',
    dbId:9911, awaitingSubmit:true, donation:{itemName:'', qty:0, unitPrice:0, book:0, fair:0, arriveDate:''},
    checklist:window.autoChecklist('법인', '구매', true, window.DB.promptProfile)});
  const c11 = window.getCase('T11');
  c11.checklist.forEach((it, i) => { it.dbId = 8800 + i; });   /* 링크 발급 때 이미 저장된 상태(A안) */

  /* ★ donDate 를 적어 둔다 (2026-09-06 M-1) — 폼 기본값이 오늘이던 때에는 없어도 제출됐다.
       지금은 후원자가 직접 넣는 칸이라 비면 donorErrors 가 막는다. 이 검사가 보는 것은
       **저장 사슬**이지 폼 검증이 아니므로 채워 준다. */
  window.DB.donorForm = {donorType:'법인', donorName:'테스트(주)', bizNo:'220-81-45012', donDate:'2026-09-04',
    path:'구매', itemName:'생수', qty:'10', unitBook:'1000', unitSale:'', note:'',
    wantsReceipt:true, privacy:true, agreePurpose:true, agreeDouble:true, privacyTransfer:true, corpAck:true,
    files:{}, signed:true, under14:false, guardian:false,
    verified:true, submittedId:null, linkCaseId:'T11'};
  window.donorSlots().forEach(it => {
    const fid = 'fT' + it.key;
    window.FILES[fid] = {id:fid, name:it.key + '.png', type:'image/png', size:10,
                         blob:new window.Blob(['x']), demo:false};
    window.DB.donorForm.files[it.key] = [fid];
  });

  /* ★ 원장 저장만 일부러 실패시킨다 — 사슬이면 뒤의 둘이 통째로 안 돈다 */
  window.saveDonationFields = () => Promise.reject(new Error('일부러 낸 실패(검증용)'));
  window.saveChecklist      = () => { checklistRan = true; order.push('checklist');
                                      return Promise.resolve({ok:true}); };
  window.saveFormSubmission = () => { formRan = true; return Promise.resolve({ok:true}); };
  /* ★ 2026-09-04 — 신청서 PDF 를 여기서 대신한다. 이 묶음이 보는 것은 **저장 사슬**이지
       PDF 만들기가 아니다. 진짜 PDF 는 vendor 스크립트를 열어야 하는데 jsdom 에서는
       열리지 않아 **끝나지도 실패하지도 않는다** — 그러면 이 검사가 사슬을 못 본다.
     ⚠️ 여기서는 '실패' 로 대신한다. "PDF 가 실패해도 제출본은 남는다" 가 코드가 약속한 것이다.
     ⚠️ **'끝나지 않는 경우' 는 아직 아무도 안 본다** — 그때는 제출본도 영영 안 남는다.
       .catch 는 실패만 받고 무응답은 안 받는다. (미공개 내부 기록) */
  window.createDonorFormPdf = () => Promise.reject(new Error('검사용 — PDF 는 여기서 안 만든다'));
  window.saveItemStatus     = (c, it) => { statusSaved.push(it.key); return Promise.resolve({ok:true}); };
  window.saveAttachment     = () => { order.push('attach'); return Promise.resolve({ok:true}); };

  window.submitDonor();
  await new Promise(r => setTimeout(r, 120));

  check('★ 원장 저장이 실패해도 체크리스트는 저장된다 (사슬이면 통째로 안 돈다)',
        checklistRan, {checklistRan});
  check('★ 원장 저장이 실패해도 제출본은 저장된다',
        formRan, {formRan});
  check('★ 첨부는 체크리스트 저장 뒤에 올린다 (먼저 올리면 dbId 가 없어 늘 거부된다)',
        order.indexOf('checklist') >= 0 && order.indexOf('attach') > order.indexOf('checklist'), order);
  check('★ 이미 DB 에 있는 항목의 상태도 저장한다 (안 하면 건은 완결인데 검수는 미완결)',
        statusSaved.length > 0, statusSaved);
  check('★ 무엇이 안 들어갔는지 parts 에 남는다 (한 칸이면 나중 실패가 앞 실패를 덮는다)',
        !!(window.DB.caseSaveErr && window.DB.caseSaveErr['T11']
           && window.DB.caseSaveErr['T11'].parts
           && window.DB.caseSaveErr['T11'].parts.fields === true),
        window.DB.caseSaveErr && window.DB.caseSaveErr['T11']);
  check('다시 보낼 값도 함께 남는다 (후원자는 이미 떠났다)',
        !!(window.DB.caseSaveErr['T11'] && window.DB.caseSaveErr['T11'].fields),
        window.DB.caseSaveErr['T11']);
}

/* ⑮ '데모로 돈다' 고 찍어놓고 실 DB 를 읽지 않는가 (2026-09-03 선미 페어에서 드러남)
   ★ 조용한 실패의 **거울상 — 잘못된 안심**이다(선미).
     콘솔이 "데모 데이터로 실행합니다" 를 찍고 바로 아래에서 실 DB 15건을 읽었다.
     문이 둘인데(서버 /config · config.local.js) 각 문이 **자기만 보고 단정**했다.
     담당자가 그 줄을 보고 "지금 데모구나" 하며 실 DB 에 손댈 수 있다. */
console.log('\n[⑮ "데모" 라고 찍어놓고 실 DB 를 읽지 않는가]');
const said = [];
const realInfo = window.console.info;
window.console.info = (...a) => said.push(a.join(' '));

window.eval("DB_SOURCE = 'Supabase'; CFG_SOURCE = 'config.local.js';");
said.length = 0; window.reportDbSource(15);
check('★ 붙었으면 접속했다고 말한다', /접속: Supabase/.test(said.join('|')), said);
check('★★ 붙었는데 "데모 데이터" 라고 말하지 않는다',
      !/데모 데이터/.test(said.join('|')), said);
check('어느 문으로 붙었는지 함께 말한다 (문이 둘이다)',
      /config\.local\.js/.test(said.join('|')), said);

window.eval("DB_SOURCE = '데모'; CFG_SOURCE = null;");
said.length = 0; window.reportDbSource(0);
check('★ 안 붙었으면 데모라고 말한다', /데모 데이터/.test(said.join('|')), said);
check('★ 위의 안내가 결론이 아니라고 밝힌다 (문마다 따로 찍힌다)',
      /결론이 아닙니다/.test(said.join('|')), said);

/* 결론을 말하는 자리가 하나뿐인가 — 다른 파일이 다시 단정하기 시작하면 여기서 잡힌다 */
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '')      /* 블록 주석 */
                              .replace(/^\s*\/\/.*$/gm, '')          /* 줄 주석 */
                              .replace(/<!--[\s\S]*?-->/g, '');       /* html 주석 */
const srcs = ['db.js','index.html','api.js','common.js']
  .map(f => stripComments(readFileSync(APP + f, 'utf8'))
    .split('\n').filter(l => /데모 데이터로 실행/.test(l)));
check('★ "데모 데이터로 실행합니다" 로 단정하는 코드가 없다 (주석은 제외)',
      srcs.every(x => x.length === 0), srcs.flat());
window.console.info = realInfo;

/* ⑯ 실서비스인데 화면이 "데모" 라고 말하거나 본인확인 값을 찍지 않는가 (2026-09-03 선미)
     ⑮ 의 화면판이다. ⑮ 를 고칠 때 콘솔만 고쳤고 화면은 그대로였다 —
     맨 위 띠(index.html:89)는 DB_SOURCE 를 보는데 본문 뱃지 12곳은 무조건 "예선 데모" 였고,
     본인확인 게이트는 정답 4자리를 화면에 그대로 찍고 있었다.
     ★ 심사위원은 체험판이 아니라 실제 서비스를 쓴다(0-A). 정답을 찍으면 게이트가 무의미하다. */
console.log('\n[⑯ 실서비스에서 "데모" 를 말하거나 본인확인 값을 찍지 않는가]');

window.eval("DB_SOURCE = 'Supabase';");
check('★ 실서비스면 예선 데모 뱃지를 안 그린다', window.demoBadge() === '', window.demoBadge());
check('★ 실서비스면 데모 전용 안내를 안 그린다', window.demoOnly('<b>1234</b>') === '', window.demoOnly('<b>1234</b>'));

/* 진짜로 보고 싶은 것 — 렌더 결과에 본인확인 값이 섞여 나오는가 */
window.eval("DB.donorForm = {linkCaseId:null, verified:false, verifyInput:'', verifyTries:0};");
const gateLive = window.viewDonorGate({id:'999', verifyLast4:'8241'});
check('★★ 실서비스 본인확인 화면에 정답 4자리가 없다', !gateLive.includes('8241'), gateLive.slice(-160));
check('★ 실서비스 본인확인 화면에 "예선 데모" 가 없다', !gateLive.includes('예선 데모'), gateLive.slice(0, 120));

window.eval("DB_SOURCE = '데모';");
const gateDemo = window.viewDonorGate({id:'999', verifyLast4:'8241'});
check('데모에서는 정답을 그대로 보여 준다 (시연이 안 죽는다)', gateDemo.includes('8241'), gateDemo.slice(-160));
check('데모에서는 예선 데모 뱃지가 붙는다', gateDemo.includes('예선 데모'), gateDemo.slice(0, 120));

/* ★ 데모 전용 지름길 — 후원자·기관 화면에서 담당자 화면으로 건너뛰는 버튼.
   실서비스에서 뜨면 권한 구멍이다. 심사위원은 링크를 열어 들어온다(0-A · ②의 ?t=). */
window.eval("DB_SOURCE = 'Supabase'; DB.linkEntry = null; DB.role = 'org'; DB.screen = 'orgForm'; DB.orgForm.linkCaseId = null;");
const liveOrg = window.renderPhone();
check('★ 실서비스에서 담당자 화면 지름길이 안 뜬다',
      !/담당자 화면에서 링크 발급하기|담당자 검수함에서 확인|담당자 수취 현황에서/.test(liveOrg), liveOrg.slice(0, 160));
check('★ "데모 전용 지름길" 이라는 말 자체가 안 나온다',
      !liveOrg.includes('데모 전용 지름길'), liveOrg.slice(0, 160));
/* ⚠️ 전에는 여기서 "데모에서는 지름길이 그대로 있다" 도 봤다. 9/3 저녁에 **걷어내기로 바뀌어**(선미)
     데모에서도 없다. 데모의 역할 이동은 상단 역할 전환 바가 한다 — 아래에서 그 바를 지킨다. */

/* 뱃지를 직접 쓰는 코드가 되살아나면 여기서 잡힌다 — ⑮ 의 마지막 검사와 같은 방식 */
const rawBadge = ['screen-donor.js','screen-staff.js','common.js']
  .map(f => ({f, n: stripComments(readFileSync(APP + f, 'utf8'))
    .split('\n').filter(l => /class="simbadge"/.test(l) && !/function demoBadge/.test(l)).length}))
  .filter(x => x.n > 0 && x.f !== 'common.js');
check('★ 뱃지를 직접 그리는 코드가 없다 (demoBadge 한 곳을 거친다)',
      rawBadge.length === 0, rawBadge);

/* ★★ 역할 사이를 건너뛰는 지름길은 **아예 없어야 한다** (2026-09-03 · 감싸기 → 걷어내기)
   ⚠️ 처음엔 `demoOnly` 로 감쌌는데, 요청서의 원래 계획은 **걷어내기**였다(연수 지적).
     감싸면 죽은 분기가 남고 `isDemoMode()` 를 누가 잘못 건드리면 실서비스로 새어 나온다.
   ★ 데모에서 역할을 오가는 것은 **상단 역할 전환 바**가 한다 — 지름길은 중복이었다. */
const anyShortcut = ['screen-donor.js','screen-staff.js','common.js','api.js']
  .map(f => ({f, hits: stripComments(readFileSync(APP + f, 'utf8')).split('\n')
    .filter(l => /setRoleTo\s*\(/.test(l))}))
  .filter(x => x.hits.length);
check('★★ 역할을 건너뛰는 지름길이 한 곳도 없다 (setRoleTo 자체가 없다)',
      anyShortcut.length === 0, anyShortcut.map(x => x.f + ': ' + x.hits.map(h => h.trim().slice(0, 70)).join(' | ')));

/* ★★ 역할 전환 바 — 실서비스에서는 그리지 않는다.
   지름길을 다 걷어내도 이 바가 열려 있으면 아무것도 못 막는다. 지름길보다 이쪽이 크다 —
   특정 화면이 아니라 **항상** 있기 때문이다.
   ⚠️ 이 파일은 159행에서 `window.el` 을 stub 으로 갈아끼운다(`() => ({value:'사유'})`).
     그래서 **DOM 으로는 확인할 수 없다** — 실제 요소가 안 바뀐다. 소스로 본다. */
const rbSrc = /function renderRoleBar\(\)\{[\s\S]*?\n\}/.exec(stripComments(readFileSync(APP + 'common.js', 'utf8')));
check('renderRoleBar 를 찾았다', !!rbSrc);
/* "isDemoMode() 를 거친다" · "데모에서는 버튼을 그린다" 두 항목은 뺐다 (2026-09-12 선미) — 바가 없으니 거칠 것도 그릴 것도 없다.
   방어는 더 세졌다: 실서비스에서 안 그리는 것이 아니라 어디서도 없다. */
/* 2026-09-12 선미 — 역할 전환 바 자체를 걷었다. 남은 요소가 있으면 지우는 함수만 남는다 */
check('★ 역할 전환 바가 index.html 에 없다', !/class="role-bar"/.test(readFileSync(APP + 'index.html', 'utf8')));
check('   renderRoleBar 는 남은 바를 지우기만 한다', !!rbSrc && /role-bar/.test(rbSrc[0]) && !/role-btn/.test(rbSrc[0]), rbSrc && rbSrc[0].slice(0, 220));

/* ★★ 데모 채우기 버튼 — 실서비스에서는 그리지 않는다 (2026-09-04 연수)
   ⚠️ 지름길과 역할 전환 바를 걷어냈는데 이 자리가 남아 있었다. 셋 다 같은 사고다(정본 22번).
   ★ 이건 보여주고 끝나지 않는다 — prefillDonor 가 가짜 주민번호를 채우고(screen-donor.js:61),
     9/4 부터 그 값이 신청서 PDF 로 저장소(forms/)에 올라간다. 지금 파기 수단이 없어 못 지운다
     (할일-보관과-파기-20260904.md · RLS delete 정책 없음).
   ⚠️ 화면 한 장으로는 못 본다 — 후원자 폼과 기관 폼을 **둘 다** 그린다. */
const FILL_BTNS = /기본값 채우기\(데모용\)|데모 항목 추가|빈 폼으로/;
const renderAs = (src, role, screen, setup) => {
  window.eval("DB_SOURCE = '" + src + "'; DB.preview = null; DB.linkEntry = null; DB.role = '" + role +
              "'; DB.screen = '" + screen + "'; " + setup);
  return window.renderPhone();
};
const donorSetup = "DB.donorForm.files = DB.donorForm.files || {};" +
                   "DB.donorForm.linkCaseId = DB.cases[0].id; DB.donorForm.verified = true;";
const orgSetup   = "DB.orgForm.linkCaseId = null;";
check('★★ 실서비스 후원자 폼에 데모 채우기 버튼이 없다',
      !FILL_BTNS.test(renderAs('Supabase', 'donor', 'donorForm', donorSetup)), '후원자 폼');
check('★★ 실서비스 기관 폼에도 없다 (화면 한 장만 보면 놓친다)',
      !FILL_BTNS.test(renderAs('Supabase', 'org', 'orgForm', orgSetup)), '기관 폼');
check('데모에서는 채우기 버튼이 그대로 있다 (시연이 안 죽는다)',
      FILL_BTNS.test(renderAs('데모', 'donor', 'donorForm', donorSetup)), '후원자 폼');

/* 소스로도 본다 — 새로 만든 화면은 위 렌더에 안 걸린다. demoOnly 가 앞줄에 오는 것도 인정한다 */
const fillSrc = ['screen-donor.js','screen-staff.js'].map(f => {
  const lines = stripComments(readFileSync(APP + f, 'utf8')).split('\n');
  const bare = lines.filter((l, i) =>
    /onclick="(prefillDonor|prefillOrgForm|emptyDonor)\(|onclick="addDemoFile\(/.test(l) &&
    !/demoOnly\(|isDemoMode\(\)/.test(lines.slice(Math.max(0, i - 2), i + 1).join('\n')));
  return {f, bare};
}).filter(x => x.bare.length);
check('★★ 데모 채우기 버튼이 전부 데모 안에 있다 (소스 전체)',
      fillSrc.length === 0, fillSrc.map(x => x.f + ': ' + x.bare.map(h => h.trim().slice(0, 70)).join(' | ')));
window.eval("DB_SOURCE = '데모';");

console.log('\n[⑰ 파일 이름을 로그에 찍지 않는가]');
/* ★ ⑯ 에서 갈라 나왔다 (2026-09-03 유진 · 세는 규칙 확정).
     ⑯ 은 "실서비스인데 데모 것이 보인다" 하나의 사고다(정본 22번).
     파일 이름 유출은 **다른 사고**다 — 데모/실서비스와 무관하고 개인정보 쪽이다.
     번호 하나 = 사고 하나이므로 갈랐고, 정본 23번으로 등재했다.
   ⚠️ 2026-09-03 선미 — 이 절 머리글을 내가 한 번 지웠다(역할 전환 바 검사를 넣다가 범위를 넓게 잡았다).
     `check-silent-list` 가 "적힌 17종 ≠ 실제 16개" 로 즉시 잡았다. 개수를 세는 검사가 제 몫을 했다. */
/* ★ 파일 이름은 로그에 찍지 않는다 (2026-09-03 선미 · 개인정보 현황 §5 구멍 '가')
   후원자가 올리는 파일 이름에 사람 이름이 들어온다 — 실제 표본이 그랬다(`물품기부신청서_OO희.png`).
   브라우저 콘솔은 화면을 보는 누구나 연다. 담당자가 어느 파일인지 아는 것은 화면 목록이 한다. */
const logsName = ['db.js','screen-donor.js','screen-staff.js','api.js']
  .map(f => ({f, hits: stripComments(readFileSync(APP + f, 'utf8')).split('\n')
    .filter(l => /console\.(log|info|warn|error)/.test(l)
              && /\bm\.name\b|\bfileName\b|\bf\.name\b|file_name/.test(l))}))
  .filter(x => x.hits.length);
check('★ 파일 이름을 로그에 찍는 코드가 없다 (이름이 들어온다)',
      logsName.length === 0, logsName.map(x => x.f + ': ' + x.hits.join(' / ').slice(0, 90)));

/* ⑱ 제출본이 신청서 PDF 뒤에 줄 서 있지 않은가 (2026-09-04 유진 발견 → 9/4 선미 고침)
   ★ 정본 24번 · [발견 문서](발견-제출본이-PDF-뒤에-줄서있다-20260904.md)
     `.catch` 는 **실패만** 받고 **무응답은 안 받는다.** 신청서 PDF 는 제출 순간에
     vendor 스크립트 1.3MB + 폰트 340KB 를 받는 일부터 하는데, 그것이 열리지도 오류를 내지도
     않으면(느린 회선·차단·파일 유실) 약속이 **끝나지도 실패하지도 않은 채** 멈춘다.
     그러면 그 뒤에 줄 서 있던 **제출본 저장이 시작조차 안 된다.**
     후원자는 "접수되었습니다" 를 보고 떠나고, DB 에는 아무것도 없고, `pending` 도 안 서서
     담당자에게 한 마디도 안 뜬다 — 완전한 조용한 실패다.

   ★ 고친 방향은 '시한' 이 아니라 **'순서'** 다. 제출본과 PDF 는 서로 필요하지 않다.
       지금  : PDF 만들기 → 저장소 → 그 키를 담아 제출본 한 줄   (PDF 가 멈추면 제출본도 멈춤)
       바꿈  : 제출본 한 줄 먼저(주소 칸은 빈칸) → PDF → 빈칸을 채운다
     시한(`PDF_WAIT_MS`)은 "제출본을 언제 저장하나" 가 아니라 **"언제 담당자에게 알리나"** 다.
     ⚠️ 시한이 지나도 PDF 를 **죽이지 않는다** — 늦게 성공하면 그때 빈칸을 채운다. */
console.log('\n[⑱ 제출본이 신청서 PDF 뒤에 줄 서 있지 않은가]');
{
  /* ⚠️ 위 ③ 에서 SUPABASE_CONFIG 를 자리표시자로 되돌려 놨다 — 그대로 두면 sbReady()=false 라
       **데모 갈래**로 빠져 이 묶음이 아무것도 안 본다(업로드도 pending 도 데모에서는 조용하다).
       이 절은 실서비스 갈래를 본다. 붙은 것으로 되돌린다. */
  window.eval("SUPABASE_CONFIG = {url:'https://x.supabase.co', key:'k'};");
  const mkDonorCase = (id, dbId) => {
    window.DB.cases.push({id:id, state:'제출 대기', donorType:'법인', acqPath:'구매',
      dbId:dbId, awaitingSubmit:true, donation:{itemName:'', qty:0, unitPrice:0, book:0, fair:0, arriveDate:''},
      checklist:window.autoChecklist('법인', '구매', true, window.DB.promptProfile)});
    const cc = window.getCase(id);
    cc.checklist.forEach((it, i) => { it.dbId = 8900 + i; });
    window.DB.donorForm = {donorType:'법인', donorName:'테스트(주)', bizNo:'220-81-45012', donDate:'2026-09-04',   /* 비면 막힌다 — M-1 이후 (2026-09-06) */
      path:'구매', itemName:'생수', qty:'10', unitBook:'1000', unitSale:'', note:'',
      wantsReceipt:true, privacy:true, agreePurpose:true, agreeDouble:true, privacyTransfer:true, corpAck:true,
      files:{}, signed:true, under14:false, guardian:false,
      verified:true, submittedId:null, linkCaseId:id};
    window.donorSlots().forEach(it => {
      const fid = 'f' + id + it.key;
      window.FILES[fid] = {id:fid, name:it.key + '.png', type:'image/png', size:10,
                           blob:new window.Blob(['x']), demo:false};
      window.DB.donorForm.files[it.key] = [fid];
    });
    return cc;
  };
  /* 저장 사슬의 나머지는 이 묶음의 관심사가 아니다 — 전부 성공으로 둔다 */
  const allOk = () => {
    window.saveDonationFields = () => Promise.resolve({ok:true});
    window.saveChecklist      = () => Promise.resolve({ok:true});
    window.saveItemStatus     = () => Promise.resolve({ok:true});
    window.uploadDonorFiles   = () => Promise.resolve({bad:[]});
  };

  /* ── (가) PDF 가 끝나지 않는 경우 ────────────────────────────── */
  check('★ 얼마나 기다릴지가 한 곳에 적혀 있다 (검사가 짧게 줄일 수 있어야 한다)',
        typeof window.PDF_WAIT_MS === 'number', typeof window.PDF_WAIT_MS);
  window.eval('PDF_WAIT_MS = 40;');            /* 검사에서는 40ms 로 줄인다 */

  mkDonorCase('T12', 9912);
  allOk();
  const formCalls = [], attached = [], uploaded = [];
  window.saveFormSubmission = (c, opt) => { formCalls.push(opt); return Promise.resolve({ok:true, id:7777}); };
  window.attachFormPdfKey   = (id, key) => { attached.push({id, key}); return Promise.resolve({ok:true}); };
  window.uploadFormPdf      = () => { uploaded.push(1); return Promise.resolve('forms/9912/a.pdf'); };
  let settlePdf = null;
  window.createDonorFormPdf = () => new Promise(res => { settlePdf = res; });   /* ★ 끝나지도 실패하지도 않는다 */

  window.submitDonor();
  await new Promise(r => setTimeout(r, 150));

  check('★★ PDF 가 끝나지 않아도 제출본은 저장된다 (줄을 세우지 않는다)',
        formCalls.length === 1, formCalls.length);
  check('★ 그때 제출본은 PDF 주소 없이 저장된다 (빈칸은 "개인정보가 아직 없다" 는 뜻이다)',
        formCalls.length === 1 && !formCalls[0].pdfKey, formCalls[0] && formCalls[0].pdfKey);
  check('★ 시한이 지나면 무엇이 빠졌는지 남는다 (parts.pdf — 안 세우면 아무도 모른다)',
        !!(window.DB.caseSaveErr && window.DB.caseSaveErr['T12']
           && window.DB.caseSaveErr['T12'].parts
           && window.DB.caseSaveErr['T12'].parts.pdf === true),
        window.DB.caseSaveErr && window.DB.caseSaveErr['T12']);

  /* ── (나) 시한이 지난 뒤에 PDF 가 성공한 경우 ──────────────────
     ⚠️ 시한은 기다림을 끊는 것이지 PDF 를 죽이는 것이 아니다. */
  if (settlePdf) settlePdf(new Uint8Array([1, 2, 3]));
  await new Promise(r => setTimeout(r, 80));
  check('★★ 늦게라도 PDF 가 되면 제출본의 빈 주소 칸을 채운다 (재제출을 한 번 더 피한다)',
        attached.length === 1 && attached[0].id === 7777 && attached[0].key === 'forms/9912/a.pdf',
        attached);

  /* ── (다) 제출본 줄이 없는데 PDF 만 저장소에 올리지 않는가 ──────
     ★ 저장소 경로는 uuid 다(db.js storagePath). 가리키는 줄이 없으면 **아무도 못 찾고**,
       `purge_donation()` 은 DB 의 pdf_key 를 보고 지우므로 **1년 뒤에도 안 지워진다.**
       주민번호가 든 파일이 파기 대상 밖에 남는다 — 개인정보 설계가 거기서 뚫린다. */
  mkDonorCase('T13', 9913);
  allOk();
  uploaded.length = 0;
  window.saveFormSubmission = () => Promise.reject(new Error('일부러 낸 실패(검증용)'));
  window.createDonorFormPdf = () => Promise.resolve(new Uint8Array([1, 2, 3]));
  window.submitDonor();
  await new Promise(r => setTimeout(r, 150));
  check('★★ 제출본 줄이 없으면 개인정보 PDF 를 저장소에 올리지 않는다 (파기 대상 밖에 남는다)',
        uploaded.length === 0, uploaded.length);

  /* ── (라) 부품을 제출 순간에 받지 않는다 ───────────────────────
     ★ 사고의 뿌리다 — 하필 [제출]을 누른 그 몇 초의 네트워크 상태에 전부가 걸려 있었다.
       후원자는 폼을 몇 분 동안 작성한다. 그 사이에 미리 받아 두면 제출 순간에 남는 일은
       PDF 그리기(인터넷 불필요)와 업로드뿐이다. */
  check('★ 부품을 미리 받는 길이 있다 (preloadPdfLibs)',
        typeof window.preloadPdfLibs === 'function', typeof window.preloadPdfLibs);
  let preloadCalls = 0;
  window.loadPdfLibs = () => { preloadCalls++; return Promise.resolve(); };
  window.DB.donorForm.submittedId = null;
  window.DB.donorForm.linkCaseId = 'T13';
  window.viewDonorForm();
  check('★★ 폼을 여는 순간 부품을 받기 시작한다 (제출 순간이 아니다)',
        preloadCalls > 0, preloadCalls);

  /* ⚠️ 미리 받기가 **없을 때도** 폼은 그려져야 한다.
     pdf-form.js 가 안 열리는 것이야말로 이 사고의 원인 중 하나인데, 그때 이 한 줄 때문에
     후원자 폼이 통째로 안 그려지면 고치려던 것보다 나쁘다(빈 화면 · 접수 자체 불가).
     ★ 9/4 에 실제로 났다 — smoke-test-privacy 가 pdf-form.js 를 안 싣고 있어서 죽었다(정본 ⑥). */
  const keepPreload = window.preloadPdfLibs;
  window.eval('preloadPdfLibs = undefined;');
  let drew = '';
  try { drew = String(window.viewDonorForm()); } catch (e) { drew = 'ERR:' + e.message; }
  window.preloadPdfLibs = keepPreload;
  check('★★ 부품 미리 받기가 없어도 후원자 폼은 그려진다 (없으면 화면이 통째로 빈다)',
        drew.indexOf('ERR:') !== 0 && drew.length > 0, drew.slice(0, 70));

  /* ── (마) 담당자는 어떻게 아는가 ───────────────────────────────
     ⚠️ pending·DB.caseSaveErr 는 **후원자 브라우저 안**에만 있다. 담당자는 다른 컴퓨터다 —
       그 경고는 담당자에게 못 간다. 담당자에게 실제로 가는 신호는 건 화면의 이 한 줄뿐이다.
     ★ 그런데 그것이 작은 회색 글씨였다. "이름·주민번호·서명이 어디에도 없다" 는 말은
       회색 글씨로 할 말이 아니다 — 조용한 실패의 마지막 한 칸이다. */
  const noPdf = String(window.formPdfButtonsHtml({id:'T14', formPdfIds:[]}));
  check('★★ 신청서 PDF 가 없으면 담당자 화면에 경고로 뜬다 (회색 글씨로 말하지 않는다)',
        /banner\s+warn/.test(noPdf), noPdf.slice(0, 90));
  check('★ 무엇이 없는지 분명히 말한다 (개인정보·서명)',
        /개인정보|서명/.test(noPdf), noPdf.slice(0, 140));
  check('★ 담당자가 할 일을 함께 말한다 (후원자 재제출 요청)',
        /재제출/.test(noPdf), noPdf.slice(0, 200));

  /* ── (바) 데모에서 안내가 멈춰 서 있지 않은가 ──────────────────
     ⚠️ 데모(DB 미연결·file://)에서는 폰트를 fetch 못 해 PDF 가 **늘 실패**한다. 그건 정상이고
       조용히 둔다. 그런데 조용히 두느라 후원자 화면 안내를 'working' 그대로 두면
       시연 내내 "저장하는 중입니다…" 가 돌아간다 — 없느니만 못하다. */
  window.eval("SUPABASE_CONFIG = {url:'https://여기에-프로젝트-URL.supabase.co', key:'여기에'};");
  mkDonorCase('T15', 9915);
  allOk();
  window.saveFormSubmission = () => Promise.resolve({ok:true, demo:true});
  window.createDonorFormPdf = () => Promise.reject(new Error('데모 — 폰트를 못 받는다'));
  window.submitDonor();
  await new Promise(r => setTimeout(r, 150));
  check('★ 데모에서 PDF 가 실패해도 "저장하는 중" 이 멈춰 서 있지 않다',
        !(window.DB.donorPdf && window.DB.donorPdf.state === 'working'),
        window.DB.donorPdf && window.DB.donorPdf.state);
  check('★ 데모에서는 담당자 화면에 올리지 않는다 (콘솔에만)',
        !(window.DB.caseSaveErr && window.DB.caseSaveErr['T15']),
        window.DB.caseSaveErr && window.DB.caseSaveErr['T15']);
}

console.log('\n[⑲ 규칙 번호가 DB 제약과 어긋나지 않는가 (2026-09-07 연수 · #225)]');
/* ★ 무엇이 있었나 — 화면에는 판정이 뜨는데 DB 에는 한 줄도 안 남았다.
     E8("사진 자리에 사진이 아닌 것이 왔다")은 9/3 에 코드에만 추가되고
     DB 제약(inspection_finding_rule_code_check)은 E1~E7 그대로였다.
     findings 를 한 번에 insert 하므로 **E8 한 줄이 그 건의 판정 저장 전부를 막았다.**
     saveInspectionRun 은 실패를 console 에만 적어서(의도된 설계) 아무도 몰랐다.
     patch-20260902-inspection-status-error.sql(status 에 error 없던 것)과 같은 자리다.
   ★ 그래서 셋을 본다 — 낮추는 방어가 있는가 · 코드가 내는 값이 목록 안에 있는가 ·
     목록이 실제 패치 파일과 같은가. 셋 중 하나만 어긋나도 같은 사고가 다시 난다. */
{
  const dbSrc    = readFileSync(APP + 'db.js', 'utf8');
  const rulesSrc = readFileSync(APP + 'rules-compare.js', 'utf8');

  check('★ 규칙 번호를 낮추는 방어가 있다 (safeRuleCode)',
        /function\s+safeRuleCode/.test(dbSrc) && /safeRuleCode\(f\.ruleCode\)/.test(dbSrc));

  const listed = (/FINDING_RULE_CODES\s*=\s*\[([^\]]*)\]/.exec(dbSrc) || [, ''])[1]
                   .match(/'([^']+)'/g) || [];
  const allowed = listed.map(x => x.replace(/'/g, ''));
  check('   허용 목록을 읽었다 (전제)', allowed.length > 0, allowed);

  /* 코드가 실제로 내는 rule 값 전부 — 하나라도 목록 밖이면 그 건의 저장이 통째로 막힌다 */
  const emitted = [...new Set((rulesSrc.match(/rule:\s*'([A-Z0-9]+)'/g) || [])
                    .map(x => x.replace(/.*'([A-Z0-9]+)'.*/, '$1')))].sort();
  const missing = emitted.filter(r => allowed.indexOf(r) < 0);
  check('★★ rules-compare 가 내는 규칙 번호가 전부 허용 목록 안에 있다',
        missing.length === 0, {emitted, allowed, missing});

  /* ★ 목록이 코드에만 있으면 소용없다 — DB 제약이 같아야 한다.
       패치 파일을 읽어 대조한다. "파일이 있다고 돌아간 게 아니다" 는 별개 문제라
       실행 여부는 패치 실행 대장(미공개 내부 기록)이 본다. */
  const patch = readFileSync(APP + 'patch-20260907-finding-rule-e8.sql', 'utf8');
  const inSql = (/rule_code in \(([^)]*)\)/.exec(patch) || [, ''])[1]
                  .match(/'([^']+)'/g) || [];
  const sqlCodes = inSql.map(x => x.replace(/'/g, '')).sort();
  check('★★ 패치 SQL 의 허용값이 코드의 목록과 같다 (한쪽만 고치면 또 난다)',
        sqlCodes.join(',') === allowed.slice().sort().join(','), {sqlCodes, allowed});
}

console.log('\n' + '─'.repeat(60));
console.log(fail
  ? `❌ ${fail}건 실패 — 방어가 하나 사라졌습니다. 지운 이유를 커밋 메시지에 적으세요.`
  : '✅ 방어 19종이 전부 살아 있습니다');
process.exit(fail ? 1 : 0);
