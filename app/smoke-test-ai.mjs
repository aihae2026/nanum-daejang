// E1 AI 검수 화면 연결 스모크 테스트 (2026-08-31 · 유진)
//
// 확인하는 것 — 실제 Gemini 호출 없이(fetch를 가짜로 바꿔) 화면 배선만 본다.
//   A. api.js 가 로드되고 화면이 그대로 뜨는가 (회귀)
//   B. 판정 대상 판별이 맞는가 (금액증빙 + 실제 blob 있는 항목만)
//   C. 검수 실행 → 판정 결과가 항목 카드에 그려지는가
//   D. 실패해도 규칙 대조 결과와 완결 게이트가 살아 있는가  ★ 2안의 안전망
//   E. AI가 규격 밖 값을 줘도 '수취완료'가 화면에 새지 않는가 (루브릭 §0-1 규칙 A)
//
// 실행:  node smoke-test-ai.mjs      (jsdom 은 ../prototype/node_modules 에 있다)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { appScripts } from './app-scripts.mjs';   /* 스크립트 목록은 index.html 에서 읽는다 — 손으로 베끼지 않는다 (2026-09-05 · 정본 ⑥) */
/* jsdom 은 ../prototype/node_modules 에 있다.
   ⚠️ 이 저장소가 윈도우 마운트(/mnt/c)에 있으면 jsdom 로드에만 5분 넘게 걸린다.
     리눅스 쪽에 jsdom 을 따로 깔아 두고 JSDOM_FROM 으로 가리키면 1초로 줄어든다:
       npm i jsdom@29.1.1 --prefix /tmp/fast
       JSDOM_FROM=/tmp/fast node smoke-test-ai.mjs         (2026-09-01 유진) */
const require = createRequire(process.env.JSDOM_FROM
  ? process.env.JSDOM_FROM.replace(/\/?$/, '/') + 'package.json'
  : new URL('../prototype/package.json', import.meta.url));
const { JSDOM } = require('jsdom');

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const dom = new JSDOM(readFileSync(here('./index.html'), 'utf8'),
  { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.test/' });
const { window } = dom;
// jsdom 은 canvas 2D 가 없다 — 서명패드·리사이즈가 죽지 않게 최소 스텁
window.HTMLCanvasElement.prototype.getContext = function () {
  const noop = () => {};
  return { lineWidth: 0, lineCap: '', strokeStyle: '', clearRect: noop, beginPath: noop,
    moveTo: noop, lineTo: noop, stroke: noop, drawImage: noop, bezierCurveTo: noop,
    quadraticCurveTo: noop, fill: noop, arc: noop };
};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,STUB';
// 스크립트는 태그로 걸려 있어도 jsdom 이 로컬 파일을 안 가져온다 — 직접 넣는다
for (const f of appScripts()) {
  window.eval(readFileSync(here('./' + f), 'utf8'));
}
window.eval('setBodyRole(DB.role); render();');

/* 재시도 대기를 줄인다 (2026-09-02) — api.js 에 끊는 시간·재시도가 붙으면서
   실패 경로가 2초 늦어졌다. 이 검사는 '배선' 을 보는 것이지 재시도 속도를 보는 것이 아니다.
   재시도·타임아웃 자체는 smoke-test-timeout.mjs 가 본다. */
window.eval('JUDGE_RETRY_WAIT = 10;');

const doc = window.document;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rendered = () => ['content', 'phoneBody', 'modalWrap', 'viewerWrap']
  .map(id => { const n = doc.getElementById(id); return n ? n.textContent : ''; }).join('\n');
let fail = 0;
const check = (name, ok) => { console.log((ok ? '  ✅ ' : '  ❌ ') + name); if (!ok) fail++; };

// 판정 대상 항목에 '진짜 파일'을 붙인다 — FILES 에 blob 이 있어야 판정 대상이 된다
function attachRealFile(caseId, key) {
  const it = window.getItem(caseId, key);
  if (!it) return null;
  window.FILES['smoke1'] = { id: 'smoke1', name: '영수증.jpg', type: 'image/jpeg',
                             size: 1234, blob: new window.Blob(['x'], { type: 'image/jpeg' }), demo: false };
  it.r.fileIds = ['smoke1'];
  return it;
}
// judge 응답을 가짜로 만든다 (실제 호출 없음)
function stubJudge(payload, { httpFail = false } = {}) {
  window.fetch = () => httpFail
    ? Promise.reject(new Error('network down'))
    : Promise.resolve({ ok: true, json: () => Promise.resolve(payload) });
}
// FileReader 는 jsdom 에 있지만 Blob→base64 가 느릴 수 있어 결과만 고정
window.FileReader = class {
  readAsDataURL() { this.result = 'data:image/jpeg;base64,QUJD'; setTimeout(() => this.onload(), 0); }
};

console.log('\n[A. 회귀 — api.js 로드 후에도 화면이 그대로 뜨는가]');
check('api.js 의 judgeAttachment 가 전역에 있다', typeof window.judgeAttachment === 'function');
check('판정 대상 판별 함수가 있다', typeof window.judgeableItems === 'function');
check('기존 검수 로직(inspect)이 살아 있다', typeof window.inspect === 'function');

// 판정 대상이 있는 건을 찾는다 (금액증빙 항목을 가진 등록 건)
const AMT = window.AI_AMOUNT_KEYS;
// 완결·취소 건은 항목이 이미 '수취완료'라 검사가 성립하지 않는다 — 검수 중인 건을 고른다
const target = window.DB.cases.find(c =>
  c.state !== '완결' && c.state !== '취소' && !c.awaitingSubmit &&
  (c.checklist || []).some(it => it.included && AMT.includes(it.key)));
console.log('\n[B. 판정 대상 판별 — 대상 건 #' + (target && target.id) + ']');
check('금액증빙 항목을 가진 건이 있다', !!target);
check('파일이 없으면 판정 대상 0건', window.judgeableItems(target).length === 0);
const item = attachRealFile(target.id, (target.checklist.find(it => it.included && AMT.includes(it.key)) || {}).key);
check('실제 blob 을 붙이면 판정 대상이 된다', window.judgeableItems(target).length === 1);
check('물품사진은 판정 대상이 아니다 (E1 범위 밖)',
      !window.judgeableItems(target).some(it => it.key === 'photo'));
check('화면 문구가 "실제 판정"으로 바뀐다', window.aiNotice(target) === window.AI_REAL_NOTICE);

console.log('\n[C. 검수 실행 → 판정 결과가 항목 카드에 그려지는가]');
stubJudge({ verdict: '확인 권장', reason: '서류 1,250,000원 / 등록 1,205,000원 · 차이 45,000원', amount: '1,250,000' });
/* ★ 검수 결과 탭을 명시한다 (2026-09-06 M-5) — 기본 탭이 '수취 현황' 으로 바뀌었다.
     이 묶음이 보는 것은 **항목 카드에 판정이 그려지는가** 라서 그 탭으로 간다. */
window.go('case', target.id, 'checklist');
window.runInspect();
await sleep(2000);
let t = rendered();
if (!item.r.aiJudge) console.log('    ↳ 진단: aiJudge=' + JSON.stringify(item.r.aiJudge) +
  ' aiJudging=' + item.r.aiJudging + ' 상태=' + item.r.st + ' 건상태=' + target.state);
check('판정값이 화면에 있다', t.includes('확인 권장'));
check('사유(양쪽 금액)가 화면에 있다', t.includes('차이 45,000원'));
check('AI가 읽은 금액이 표시된다', t.includes('1,250,000'));
check('금액 대조 라벨이 붙는다 (E 번호는 화면에 안 그린다 · 9/10)', t.includes('AI 판정 · 금액 대조') && !t.includes('E1 금액'));
check('"의견만 낸다" 고지가 있다', t.includes('수취 확정은 담당자'));
check('가짜 시뮬레이션 문장은 물러난다', !t.includes('AI 의견 · 시뮬레이션'));
check('[다시 판정] 버튼이 있다', (doc.getElementById('content') || {}).innerHTML.includes('judgeItem('));
check('수취 상태를 AI가 바꾸지 않았다', item.r.st !== 'done');

console.log('\n[D. 실패해도 검수는 계속된다 — 2안의 안전망]');
item.r.aiJudge = null;
stubJudge(null, { httpFail: true });
window.judgeItem(target.id, item.key);
await sleep(300);
t = rendered();
check('실패 문구가 뜬다', t.includes('AI 검수 실패') || t.includes('실행하지 못했습니다'));
check('규칙 기반 검수 결과는 그대로 있다', t.includes('검수 결과 요약'));
check('완결 게이트가 살아 있다', (doc.getElementById('content') || {}).innerHTML.includes('completeCase('));
check('실패해도 [다시 판정] 로 재시도할 수 있다', (doc.getElementById('content') || {}).innerHTML.includes('judgeItem('));

console.log('\n[E. 규격 밖 판정값 차단 — 루브릭 §0-1 규칙 A]');
item.r.aiJudge = null;
stubJudge({ verdict: '수취완료', reason: 'AI가 승인함', amount: '1,205,000' });
window.judgeItem(target.id, item.key);
await sleep(300);
/* ⚠️ 페이지 전체에서 '수취완료'를 찾으면 안 된다 — 같은 건의 다른 항목이 정상적으로
   수취완료일 수 있다(오탐). AI가 내놓은 값 자체를 본다. */
t = rendered();
check('"수취완료"가 AI 판정값이 되지 않는다', item.r.aiJudge.verdict !== '수취완료');
check('대신 "판단 보류"로 강등된다', item.r.aiJudge.verdict === '판단 보류' && t.includes('판단 보류'));
check('AI 판정값은 규격 3값 안에 있다', window.AI_VERDICTS.includes(item.r.aiJudge.verdict));

console.log('\n[F. 저장·되살리기 — 결정 #8 "매 호출마다 저장"]');
// 저장은 sbReady() 가 false 면 조용히 넘어간다 — 호출 자체가 일어나는지만 본다
let saved = null;
window.saveInspection = (c, j, sys) => { saved = {caseId:c.id, verdict:j.verdict, sys, status:j.status}; return Promise.resolve(null); };
item.r.aiJudge = null;
stubJudge({ verdict:'이상 없음', reason:'서류 1,205,000원 / 등록 1,205,000원 · 차이 0원', amount:'1,205,000',
            model:'gemini-3.5-flash', promptHash:'pabc123', status:'success' });
window.judgeItem(target.id, item.key);
await sleep(300);
check('판정 직후 저장이 호출된다', !!saved);
check('시스템 등록 금액이 함께 저장된다 (감사 방어 3종)', !!(saved && saved.sys));
check('모델·프롬프트 지문이 판정에 실려 온다',
      item.r.aiJudge.model === 'gemini-3.5-flash' && item.r.aiJudge.promptHash === 'pabc123');

// 재호출 방지 — 이미 판정이 있으면 검수 실행이 다시 부르지 않는다
let calls = 0;
const prevFetch = window.fetch;
window.fetch = (...a) => { calls++; return prevFetch(...a); };
window.runInspect();
await sleep(1500);
check('★ 판정이 있으면 "다시 검수"가 API를 다시 부르지 않는다', calls === 0);

// 되살리기 — 새로고침 상황(메모리 판정 없음 + DB 이력 있음)
item.r.aiJudge = null;
target.savedFindings = [{ruleCode:'E1', verdict:'확인 권장', reason:'서류 1,250,000원 / 등록 1,205,000원 · 차이 45,000원',
                         amount:'1,250,000', system:'1,205,000원', file:'T01_구매영수증.png', at:'2026-08-31'}];
const n = window.restoreSavedJudgments(target);
check('저장된 판정이 항목 카드로 되살아난다', n === 1 && item.r.aiJudge.verdict === '확인 권장');
check('되살린 판정은 표시가 남는다(restored)', item.r.aiJudge.restored === true);
item.r.aiJudge = null;
target.savedFindings = [{ruleCode:'E1', verdict:'대기중', reason:'실패', at:'2026-08-31'}];
check('실패 기록(대기중)은 되살리지 않는다', window.restoreSavedJudgments(target) === 0);

console.log('\n[G. 다시 판정해야 하는 경우 — 아끼되, 틀린 걸 보여주지 않는다]');
const N = window.needsJudge;
item.r.aiJudge = {state:'done', verdict:'이상 없음', reason:'-', file:'영수증.jpg', fileId:'smoke1'};
check('같은 파일 · 성공 판정 → 다시 안 부른다', N(item) === false);
item.r.aiJudge = {state:'error', reason:'실패', fileId:'smoke1'};
check('★ 실패한 항목은 다시 부른다 (실패는 판정이 아니다)', N(item) === true);
// 후원자가 영수증을 다시 올린 상황 — 파일이 바뀌었다
window.FILES['smoke2'] = {id:'smoke2', name:'영수증_수정본.jpg', type:'image/jpeg', size:222,
                          blob:new window.Blob(['y'],{type:'image/jpeg'}), demo:false};
item.r.fileIds = ['smoke2'];
item.r.aiJudge = {state:'done', verdict:'이상 없음', reason:'-', file:'영수증.jpg', fileId:'smoke1'};
check('★ 파일을 다시 올리면 다시 부른다 (재제출은 E1의 흔한 후속 동작)', N(item) === true);
item.r.aiJudge = {state:'done', verdict:'이상 없음', reason:'-', file:'영수증.jpg', restored:true};
check('★ DB에서 되살린 판정도 파일명이 다르면 다시 부른다', N(item) === true);
item.r.aiJudge = {state:'done', verdict:'이상 없음', reason:'-', file:'영수증_수정본.jpg', restored:true};
check('되살린 판정 · 같은 파일이면 다시 안 부른다', N(item) === false);
item.r.fileIds = [];
check('볼 파일이 없으면 부르지 않는다', N(item) === false);

console.log('\n[H. 대조 판정 (층 ②) — E7 · E3 · E2 · AI 호출 없음]');
const F = (c) => window.compareFindings(c);
const of = (c, rule) => F(c).filter(x => x.rule === rule)[0];
const mk = (over) => Object.assign({donorType:'법인', donorBizNo:'220-81-45012',
  donation:{qty:400, book:5000000, fair:300000, donorType:'법인'}, dists:[]}, over);

// E7 — 초과/미달/일치를 반드시 구분한다
let c7 = mk({dists:[{qty:250, org_name:'늘봄'}, {qty:250, org_name:'햇살'}]});
check('E7 합계>접수 → 확인 권장 (받은 것보다 많이 배분)', of(c7,'E7').verdict === '확인 권장');
check('E7 초과는 완결을 막는다', of(c7,'E7').blocksComplete === true);
check('E7 초과는 오류로 표시된다', of(c7,'E7').isError === true);
check('E7 사유에 양쪽 값이 있다', /500/.test(of(c7,'E7').reason) && /400/.test(of(c7,'E7').reason));
c7 = mk({dists:[{qty:150, org_name:'늘봄'}]});
check('★ E7 합계<접수 → 오류 아님 (배분 진행 중)', of(c7,'E7').verdict === '배분 진행 중');
check('★ 미달은 오류가 아니다 (정상 업무를 빨간 딱지로 만들지 않는다)', of(c7,'E7').isError === false);
check('★ 그래도 완결은 막는다 (완결 = 전량 배분이 정해진 상태 · 루브릭 E7)',
      of(c7,'E7').blocksComplete === true);
check('완결을 막는 목록에 잡힌다', window.compareBlocking(c7).length === 1);
check('왜 못 누르는지 한 줄로 설명한다', /완결을 막고/.test(window.compareBlockText(c7)));
/* ★ 게이트 줄은 **화면이 쓰는 함수**로 본다 (2026-09-15 선미 · 테스트 참여자 의견 · 후보 ②)
     ⚠️ 위 줄의 compareBlockText 는 어느 화면도 부르지 않는다(rules-compare.js:268 · 이 검사만 쓴다).
        화면이 그리는 것은 screen-staff.js 의 unresolvedBlockText 다 — 그래서 여기를 따로 본다.
     ★ 전에 담당자가 본 글자: "배분 수량 합계 배분 진행 중 판정이 완결을 막고 있습니다"
        규칙명 + 판정값 + 꼬리말을 구분자 없이 이어 붙여, '진행 중 판정' 이라는 없는 말이 생기고
        무엇이 얼마나 모자란지는 한 글자도 없었다. 이제 판정의 자기 설명문을 쓴다. */
const gate7 = window.unresolvedBlockText(c7);
check('★ 게이트 줄이 무엇이 남았는지를 말한다',
      /아직 배분처를 다 정하지 않았습니다/.test(gate7), gate7);
check('★ 할 일의 크기(남은 수량)가 같이 보인다', /남은 수량 250/.test(gate7), gate7);
check('★ 규칙명·판정값을 이어 붙이지 않는다 (\'진행 중 판정\' 이 안 생긴다)',
      !/판정이 완결을 막고 있습니다/.test(gate7) && !/배분 수량 합계 배분/.test(gate7), gate7);
check('   자세한 값은 게이트 줄에 없다 — 아래 대조 판정 카드가 말한다',
      !/배분 합계/.test(gate7), gate7);
c7 = mk({dists:[{qty:400, org_name:'늘봄'}]});
check('E7 합계=접수 → 이상 없음', of(c7,'E7').verdict === '이상 없음');
check('일치하면 완결을 막지 않는다', window.compareBlocking(c7).length === 0);
check('배분 전(dists 없음)에는 E7을 내지 않는다', !of(mk({}), 'E7'));

// E3 — 영리법인인데 장부가액 없이 시가로
let c3 = mk({donation:{qty:400, book:0, fair:300000, donorType:'법인'}});
check('E3 영리법인 + 시가만 → 확인 권장', of(c3,'E3').verdict === '확인 권장');
check('E3 사유에 사업자번호 중간자리 근거가 있다', /81/.test(of(c3,'E3').reason));
/* 2026-09-02 · 이 검사는 원래 반대였다 — "E3는 완결을 막지 않는다".
   해소 경로가 없던 때의 판단이라 그렇게 박아뒀는데, 해소 사유 저장(28a7aa9)과
   status 제약 패치(patch-20260902)가 갖춰져 선미가 막도록 올렸다.
   ⚠️ 이 검사가 깨지면 rules-compare.js 의 E3 blocksComplete 가 되돌려진 것이다.
      되돌린 이유(해소 저장이 깨졌는가)를 먼저 확인할 것. */
check('★ E3는 완결을 막는다 (해소 경로가 생겨 9/2에 올림)',
      of(c3,'E3').blocksComplete === true);
check('★ 그래도 해소하면 빠져나올 수 있어야 한다 — 완결 차단 목록에 잡힌다',
      window.compareBlocking(c3).some(function(f){ return f.rule === 'E3'; }));
/* 2026-09-12 선미 — 통과도 한 줄 적는다(대조 판정에 가액 산정이 아예 안 뜨던 것). 지적이 아니라 '이상 없음' 이다 */
check('장부가액이 있으면 E3 는 이상 없음', (of(mk({}), 'E3') || {}).verdict === '이상 없음' && !of(mk({}), 'E3').blocksComplete);
check('법인 외는 E3 대상 아님', !of(mk({donorType:'법인외', donation:{qty:400, book:0, fair:300000}}), 'E3'));
check('★ 비영리법인(중간자리 80)은 E3 가 이상 없음',
      (of(mk({donorBizNo:'220-80-45012', donation:{qty:400, book:0, fair:300000}}), 'E3') || {}).verdict === '이상 없음');

// E2 — 못 본 것을 못 봤다고 남긴다
check('E2는 판단 보류로 남는다 (구매일·기부일 칸이 DB에 없음)', of(mk({}),'E2').verdict === '판단 보류');
check('E2는 완결을 막지 않는다', of(mk({}),'E2').blocksComplete === false);
check('★ 조용히 통과시키지 않는다 — 사유에 이유가 적힌다', /확인해 주세요/.test(of(mk({}),'E2').reason));

console.log('\n[I. 대조 판정 저장 — E2·E3·E7 도 감사 기록에 남는다]');
// sbPost 를 가로채 무엇이 DB로 가는지 본다 (실제 통신 없음)
let posted = [];
window.sbReady = () => true;
window.sbPost = (table, rows) => {
  posted.push({table, rows});
  return Promise.resolve(rows.map((r, i) => Object.assign({id: i + 1}, r)));
};
const cx = {id:'103', dbId:3, criteriaKey:'k', donorType:'법인', donorBizNo:'220-81-45012',
  donation:{qty:400, book:0, fair:300000, donorType:'법인'},
  dists:[{qty:250, org_name:'늘봄'}, {qty:250, org_name:'햇살'}]};
posted = [];
await window.saveCompareFindings(cx);
const runRow = posted.filter(p => p.table === 'inspection')[0];
const findRows = (posted.filter(p => p.table === 'inspection_finding')[0] || {}).rows || [];
check('검수 실행 1행 + 판정 3건이 저장된다', !!runRow && findRows.length === 3);
check('★ 코드 단독 판정은 model 을 비운다 (모델을 안 썼다)', runRow.rows[0].model === null);
check('E2·E3·E7 이 rule_code 로 구분돼 들어간다',
      findRows.map(r => r.rule_code).sort().join(',') === 'E2,E3,E7');
check("모두 '대조' 층으로 들어간다", findRows.every(r => r.layer === '대조'));
check('★ 슬롯에 매달지 않는다 (checklist_item_id = NULL)',
      findRows.every(r => r.checklist_item_id === undefined || r.checklist_item_id === null));
check('사유가 함께 저장된다', findRows.every(r => !!r.reason));

// ★ 화면 표기와 DB 표기가 같아야 통계가 안 섞인다 (2026-09-01 patch 로 enum 확장)
const cUnder = Object.assign({}, cx, {dists:[{qty:150, org_name:'늘봄'}]});
posted = [];
await window.saveCompareFindings(cUnder);
const e7 = ((posted.filter(p => p.table === 'inspection_finding')[0] || {}).rows || [])
  .filter(r => r.rule_code === 'E7')[0];
check("화면은 '배분 진행 중'으로 보여준다",
      window.compareFindings(cUnder).filter(f => f.rule === 'E7')[0].verdict === '배분 진행 중');
/* 2026-09-01 뒤집힌 검사 — verdict enum 에 '배분 진행 중'이 추가돼 dbVerdict() 를 지웠다.
   ★ '판단 보류'로 변환해 넣던 예전 동작이 돌아오면 안 된다. E7 미달은 오류가 아닌데
     '판단 보류'로 들어가면 오류 통계에 섞여 집계가 오염된다(patch 파일의 삭제 사유). */
check("★ DB에도 '배분 진행 중' 그대로 들어간다 (변환하지 않는다)", e7.verdict === '배분 진행 중');
check("★ 예전처럼 '판단 보류'로 바꿔 넣지 않는다 (통계 오염 방지)", e7.verdict !== '판단 보류');
check("'이상 없음'으로 눕히지 않는다 (완결이 막힌 건을 통과로 기록하면 거짓말)",
      e7.verdict !== '이상 없음');

console.log('\n[J. E4·E5·E6 — AI가 뽑아온 값으로 코드가 판정한다]');
// 아래 x 는 2026-08-31 실측에서 모델이 실제로 돌려준 값이다 (run-20260831-03)
const EF = (c, it, x) => window.extractedFindings(c, it, x);
const one = (c, it, x, rule) => EF(c, it, x).filter(f => f.rule === rule)[0];
const proof = {key:'proof_buy', n:'구매영수증 또는 매입세금계산서'};
const fair  = {key:'market_px', n:'시가 확인 증빙'};
const base  = (over) => Object.assign({donorType:'법인', acqPath:'구매',
  donation:{qty:100, qtyAsReceived:100, qtyUnit:null}}, over);

// ── §4 방어: 조용한 누락을 코드가 붙잡는다
const gap = {docKind:'구매영수증', qty:'100', total:null, supply:null, unreadable:[]};
check('★ 금액을 조용히 빠뜨리면 판단 보류로 붙잡는다', one(base({}), proof, gap, 'E1').verdict === '판단 보류');
check('   그냥 통과시키지 않는다 (금액 대조를 건너뛰면 진짜 오류가 샌다)',
      !!one(base({}), proof, gap, 'E1'));
check('금액이 없는 게 정상인 서류(사업자등록증)는 안 붙잡는다',
      !one(base({}), proof, {docKind:'사업자등록증', unreadable:[]}, 'E1'));

// ── E4 수량 (T03: 서류 100 / 신고 120)
const t03 = {docKind:'구매영수증', qty:'100', qtyUnit:null, unitPrice:'38,000', total:'3,800,000', unreadable:[]};
check('E4 신고가 서류보다 많으면 확인 권장 (T03)',
      one(base({donation:{qty:120, qtyAsReceived:120}}), proof, t03, 'E4').verdict === '확인 권장');
check('★ E4 신고가 더 적으면 통과 (특칙 a — 덜 신고는 오류 아님)',
      one(base({donation:{qty:80, qtyAsReceived:80}}), proof, t03, 'E4').verdict === '이상 없음');
check('★ 단위가 다르면 대조하지 않는다 (환산은 사람 몫)',
      one(base({donation:{qty:36, qtyAsReceived:3, qtyUnit:'박스'}}), proof,
          Object.assign({}, t03, {qty:'36', qtyUnit:'낱개'}), 'E4').verdict === '판단 보류');
check('E4 특칙 b — 수량 1인데 총액이 단가로 안 나눠지면 임의기재 의심',
      one(base({donation:{qty:1, qtyAsReceived:1}}), proof,
          {docKind:'구매영수증', qty:'1', unitPrice:'38,000', total:'3,800,001', unreadable:[]},
          'E4').verdict === '확인 권장');

// ── E5 취득경로 (T08: 구매영수증인데 시스템은 제조·유통)
check('E5 구매영수증인데 시스템이 제조·유통이면 확인 권장 (T08)',
      one(base({acqPath:'제조·유통'}), proof, t03, 'E5').verdict === '확인 권장');
check('경로가 맞으면 E5 안 냄', !one(base({acqPath:'구매'}), proof, t03, 'E5'));
check('★ 경로를 시사하지 않는 서류(견적서)는 E5 판정 안 함',
      !one(base({acqPath:'제조·유통'}), proof, {docKind:'견적서', unreadable:[]}, 'E5'));

// ── E6 부적격 증빙 (오탐 1위 지점 — 예외를 먼저)
check('E6 견적서가 구매영수증 자리면 확인 권장 (T05)',
      one(base({}), proof, {docKind:'견적서', unreadable:[]}, 'E6').verdict === '확인 권장');
check('★ 예외③ 견적서라도 공정가 자리면 정상 (T07)',
      !one(base({}), fair, {docKind:'견적서', unreadable:[]}, 'E6'));
check('★ 예외④ 시세자료가 공정가 자리면 정상 (T09)',
      !one(base({}), fair, {docKind:'시세자료', unreadable:[]}, 'E6'));
check('★ 예외② 간이영수증은 판단 보류 — 면세사업자면 정상이라 단정 못 한다 (T06)',
      one(base({}), proof, {docKind:'간이영수증', issuerBizNo:'123-45-67890', unreadable:[]},
          'E6').verdict === '판단 보류');
check('   확인 권장으로 단정하지 않는다 (오탐 1위 지점)',
      one(base({}), proof, {docKind:'간이영수증', unreadable:[]}, 'E6').verdict !== '확인 권장');
check('정상 구매영수증은 E6 안 냄', !one(base({}), proof, t03, 'E6'));


/* ── [K] E8 사진 자리 ─────────────────────────────────────────────
   ★ 2026-09-04 — E8 에는 검사가 **하나도 없었다.** 9/3 에 규칙을 넣고 오늘 2단계로
     좁히면서 처음 붙인다. 이 묶음이 지키는 결정은 셋이다.
       ① 사진 자리에는 '사진' 만 통과한다 (2단계 · run-20260904-prompt3 §3 실측)
       ② 사진 자리에 온 문서는 잡되 **완결을 막지 않는다** — 사진을 문서로 잘못 읽는
          경우가 있고, 그때 완결을 막으면 정상 건이 멈춘다
       ③ '판독불가' 는 조용히 통과시키지 않는다 — 가릴 수 없으면 사람에게 넘긴다
   ⚠️ ①을 되돌리려면 rules-compare.js 의 PHOTO_KINDS 에 종류를 넣으면 되고,
     그러면 이 검사가 빨갛게 뜬다. 그게 이 검사의 일이다. */
console.log('\n[K. E8 — 사진 자리에 사진이 왔는가]');
const photo = {key:'photo', n:'물품 사진'};
const kind  = (k) => ({docKind:k, unreadable:[]});
/* ⚠️ 판정이 안 나오면 one() 은 undefined 다. `.verdict` 를 바로 읽으면 검사가 **죽는다** —
   그러면 빨간 줄 하나만 보이고 나머지 검사를 못 본다(9/4 에 일부러 부숴 보다 실제로 겪음).
   그래서 없는 판정은 빈 객체로 받는다. 죽지 않고 전부 빨개져야 몇 개가 깨졌는지 보인다. */
const e8 = (k, it) => one(base({}), it || photo, kind(k), 'E8') || {};

check('★ 사진 자리에 사진이면 통과 (2단계 — 실측 5건 전부 사진으로 왔다)',
      !one(base({}), photo, kind('사진'), 'E8'));
/* ★ 2026-09-04 두 번째 고침 — '확인 권장' 이 아니라 '판단 보류' 다.
     실무 확인(유진): 물품 사진을 **애초에 올릴 수 없는 건**이 있다(이용권·입장권 등).
     그러면 "사진을 빠뜨렸다" 와 "사진을 낼 수 없는 물품이다" 를 우리가 못 가른다.
     못 가르는데 오류로 세면 정상 건이 통계에 오류로 쌓인다. E6 간이영수증과 같은 자리다. */
check('★ 사진 자리에 구매영수증이 오면 판단 보류 (컴퍼니 붙임2 예매 내역이 이 모양)',
      e8('구매영수증').verdict === '판단 보류');
check('   오류로 세지 않는다 — 사진을 낼 수 없는 물품일 수 있다 (정상 건을 지적하지 않는다)',
      e8('구매영수증').isError === false);
check('   사유가 후원자 잘못을 단정하지 않는다',
      /올릴 수 없|찍을 수 없/.test(e8('구매영수증').reason || ''));
check("★ '기타' 도 이제 잡는다 (1단계에서는 그냥 통과했다)",
      !!one(base({}), photo, kind('기타'), 'E8'));
check("★ '판독불가' 는 판단 보류로 사람에게 넘긴다 (조용히 통과시키지 않는다)",
      e8('판독불가').verdict === '판단 보류');
check("   '판독불가' 를 오류로 세지 않는다 (못 읽은 것은 후원자 잘못이 아니다)",
      e8('판독불가').isError === false);
check('★ 완결을 막지 않는다 — 사진을 문서로 잘못 읽었을 때 정상 건이 멈추면 안 된다',
      e8('구매영수증').blocksComplete === false);
/* ★ 2026-09-04 — §4 방어(금액 누락)가 자리를 안 보고 있었다.
     사진 자리에 온 예매 내역이 '구매영수증' 으로 읽히면 "금액을 읽지 못했습니다" 가 하나 더 떴다.
     사진 자리인데 금액을 따진 것이다. 그런 건마다 경고가 붙으면 담당자가 경고를 무시하게 된다.
   ⚠️ PHOTO_SLOTS 는 파일 아래쪽에서 var 로 선언된다(호이스팅으로 호출 시점에는 값이 있다).
     이 검사가 그 순서까지 지킨다 — 선언을 옮기다 깨지면 여기가 빨개진다. */
check('★ 사진 자리에는 금액 대조를 걸지 않는다 (금액이 비어도 E1 을 안 낸다)',
      !one(base({}), photo, {docKind:'구매영수증', total:null, supply:null, unreadable:[]}, 'E1'));
check('   구매영수증 자리에서는 그대로 붙잡는다 (방어를 없앤 게 아니다)',
      (one(base({}), proof, {docKind:'구매영수증', total:null, supply:null, unreadable:[]}, 'E1') || {})
        .verdict === '판단 보류');
check('   배분 물품 사진 자리도 같이 뺀다',
      !one(base({}), {key:'dist_photo', n:'배분 물품 사진'},
           {docKind:'구매영수증', total:null, supply:null, unreadable:[]}, 'E1'));

check('사진 자리가 아니면 E8 은 안 돈다 (구매영수증 자리의 구매영수증)',
      !one(base({}), proof, kind('구매영수증'), 'E8'));
check('배분 물품 사진 자리에서도 돈다 (dist_photo)',
      !!one(base({}), {key:'dist_photo', n:'배분 물품 사진'}, kind('구매영수증'), 'E8'));
check('종류를 못 읽어 비어 오면 E8 은 판정하지 않는다 (없는 값으로 단정하지 않는다)',
      !one(base({}), photo, {docKind:null, unreadable:['docKind']}, 'E8'));


/* ── [L] unreadable 의 이름 ────────────────────────────────────────
   ★ 2026-09-04 실측에서 드러난 조용한 실패 — 코드는 한글 '수량'·'거래일자' 를 찾는데
     모델은 `issuerBizNo` 처럼 영문 필드명으로 보냈다. "못 읽었다" 를 코드가 못 알아들으면
     그냥 통과한다. 프롬프트로 영문 이름을 못박고, 코드는 둘 다 받게 했다.
   ⚠️ 프롬프트만 고치고 끝냈으면 이 검사가 없었을 것이고, 모델이 말을 안 듣는 날
     아무도 몰랐을 것이다. 지시와 방어를 한 겹씩 둔다. */
console.log('\n[L. unreadable — 못 읽었다는 말을 코드가 알아듣는가]');
const noQty  = (names) => ({docKind:'구매영수증', qty:null, total:'3,800,000', unreadable:names});
const noDate = (names) => ({docKind:'구매영수증', qty:'100', total:'3,800,000',
                            issueDate:null, unreadable:names});
const cDate  = base({donation:{qty:100, qtyAsReceived:100, qtyUnit:null, donationDate:'2026-06-01'}});

check("★ 영문 필드명 'qty' 로 밝혀도 알아듣는다 (실측에서 이 모양으로 왔다)",
      (one(base({}), proof, noQty(['qty']), 'E4') || {}).verdict === '판단 보류');
check("   한글 '수량' 으로 밝혀도 알아듣는다 (예전 동작을 안 깬다)",
      (one(base({}), proof, noQty(['수량']), 'E4') || {}).verdict === '판단 보류');
check('   대소문자가 달라도 알아듣는다',
      (one(base({}), proof, noQty(['QTY']), 'E4') || {}).verdict === '판단 보류');
check('   아무 말 없이 비워 오면 판단 보류를 내지 않는다 (없는 것이 정상일 수 있다)',
      !one(base({}), proof, noQty([]), 'E4'));
check("★ 거래일자도 'issueDate' 로 알아듣는다",
      (one(cDate, proof, noDate(['issueDate']), 'E2') || {}).verdict === '판단 보류');
check("   거래일자를 한글 '거래일자' 로 밝혀도 알아듣는다",
      (one(cDate, proof, noDate(['거래일자']), 'E2') || {}).verdict === '판단 보류');
check('   엉뚱한 이름은 알아듣지 않는다 (아무 말이나 통과시키지 않는다)',
      !one(base({}), proof, noQty(['머리말']), 'E4'));

console.log(fail ? '\n❌ 실패 ' + fail + '건' : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
