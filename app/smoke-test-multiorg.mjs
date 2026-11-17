/* 다기관 배분 — 화면에서 기관을 여러 곳 지정할 수 있는가 (2026-09-01 선미)

   ★ 확인하는 것: **두 번째 기관이 첫 기관을 지우지 않는가.**
     예전 decideDist 는 c.orgName 을 단일 값으로 덮어써서, 기관을 두 번 넣으면
     앞 기관 이름이 사라지고 항목만 쌓였다. 게다가 orgId 가 생기는 순간
     배분결정 카드가 닫혀 두 번째 기관을 넣을 방법 자체가 없었다.

   ★ 함께 확인: 기관별 항목 uid 가 갈리는가 · E7(배분 합계 = 접수 수량)이 맞물리는가.
     uid 가 안 갈리면 3번 기관 인수증을 눌러도 1번 기관 것이 처리된다(smoke-test-uid 참조).

   ⚠️ 이 검사는 **담당자 쪽만 본다.** 통과했다고 "다기관이 다 된다"로 읽지 말 것.
     기관이 링크를 받아 스스로 제출하는 동선은 아직 단일 기관 전제다 (연수 재현 2026-09-01):
       · orgSlots(c)       건 전체를 돌려준다 — 행복복지관에게 늘봄 슬롯까지 보인다
       · orgReceiptSlot(c) 늘 첫 기관 인수증을 준다
       · c.orgLink         건당 1개 · 제출 폼에 기관 정보가 없다
     그래서 행복복지관이 제출하면 늘봄 자리에 들어간다. uid 를 넘겨도 안 고쳐진다 —
     폼이 자기가 어느 기관인지 모르기 때문이다.
     이 동선은 시연 범위에서 뺐고(9/1 결정), 다기관 건에서는 링크 발급 자체를 막는다.
     되살리려면 orgLink 를 기관별로 바꾸는 작업이 먼저다(1~2일) — 그때 이 검사도 넓혀야 한다.

   실 DB 를 읽지 않는다 — 데모 건으로 화면 동작만 본다.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-multiorg.mjs
*/
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

let fail = 0;
const check = (n, ok, got) => {
  console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got)));
  if (!ok) fail++;
};

/* 후원자 서류가 다 수취된 건을 하나 만든다 — 배분결정이 열리는 상태 */
const c = window.DB.cases.find(x => x.donation && x.donation.qty > 2);
c.state = '검수';
c.orgId = null; c.orgName = ''; c.dists = []; c.distSeq = 0;
/* 배분 단계 항목은 걷어낸다 — 데모 건에는 이미 인수증이 붙어 있어서
   그대로 두면 '기관 수만큼 생겼는가'를 셀 수 없다 (배분 전 상태로 되돌리는 것) */
c.checklist = c.checklist.filter(it => it.stage !== '배분');
c.checklist.forEach(it => { it.r.st = 'done'; });
const total = c.donation.qty;
console.log(`\n대상: 건 ${c.id} · 접수 수량 ${total}개`);

const addOrg = (name, qty) => {
  window.DB.distForm = {caseId:c.id, orgName:name, qty:String(qty), memo:''};
  window.decideDist(c.id);
};

console.log('\n[기관 두 곳을 차례로 지정한다]');
addOrg('늘봄지역아동센터', 1);
check('첫 기관이 들어갔다', (c.dists || []).length === 1, c.dists);
addOrg('햇살지역아동센터', 1);
check('★ 두 번째를 넣어도 첫 기관이 남아 있다 (예전엔 덮어써서 사라졌다)',
      (c.dists || []).length === 2, (c.dists || []).map(d => d.orgName));

console.log('\n[화면 표기 — 두 곳이 다 드러나는가]');
const label = window.orgLabel(c);
check('요약 표기에 기관 수가 드러난다: ' + label, /외 1곳/.test(label), label);
check('전체 표기는 둘 다 나열한다',
      window.orgLabel(c, true).includes('늘봄') && window.orgLabel(c, true).includes('햇살'),
      window.orgLabel(c, true));

console.log('\n[항목 주소(uid) — 기관별로 갈리는가]');
const inss = c.checklist.filter(i => i.key === 'inss');
console.log('   인수증 uid: ' + inss.map(i => i.uid).join(' · '));
check('인수증이 기관 수만큼 생겼다', inss.length === 2, inss.length);
check('★ uid 가 서로 다르다 (같으면 엉뚱한 기관 것이 처리된다)',
      inss.length === 2 && inss[0].uid !== inss[1].uid, inss.map(i => i.uid));
inss.forEach(it => {
  check('  ' + it.uid + ' 로 부르면 정확히 그 항목', window.getItem(c.id, it.uid) === it);
});

console.log('\n[남은 수량 · E7 맞물림]');
check('남은 수량이 줄었다', window.distRemainingQty(c) === total - 2, window.distRemainingQty(c));
const e7 = window.checkE7(c);
check('전량을 안 나눴으면 완결을 막는다 (E7)',
      !!e7 && e7.blocksComplete === true, e7 && e7.verdict);

console.log('\n[막아야 하는 것]');
addOrg('늘봄지역아동센터', 1);
check('★ 같은 기관을 두 번 넣지 못한다', (c.dists || []).length === 2,
      (c.dists || []).map(d => d.orgName));
addOrg('한빛지역아동센터', total);          /* 남은 것보다 많이 */
check('★ 남은 수량보다 많이 배분하지 못한다', (c.dists || []).length === 2,
      (c.dists || []).map(d => d.orgName + ':' + d.qty));

console.log('\n[전량을 다 나누면 완결이 열린다]');
addOrg('한빛지역아동센터', total - 2);
check('세 번째 기관이 들어갔다', (c.dists || []).length === 3, (c.dists || []).length);
check('남은 수량 0', window.distRemainingQty(c) === 0, window.distRemainingQty(c));
const e7b = window.checkE7(c);
check('★ 합계가 맞으면 E7 이 완결을 막지 않는다',
      !e7b || e7b.blocksComplete === false, e7b && e7b.verdict);

/* ── 화면에 실제로 그려지는가 ────────────────────────────────
   여기부터는 로직이 아니라 **담당자 눈에 보이는 것**을 본다.
   유진 요청(2026-09-01): "세 기관 등록 → 수취 등록 드롭다운에 셋이 뜨나 → 각각 처리되나".
   브라우저 클릭을 대신하진 못하지만, 렌더 결과 HTML 은 여기서 확인할 수 있다. */
console.log('\n[수취 등록 화면 — 기관 셋이 다 뜨는가]');
window.DB.caseId = c.id;
window.DB.recvForm = {caseId:null, itemKey:'', file:'', date:window.TODAY, memo:''};
const recvHtml = window.viewReceive();
const optCount = (recvHtml.match(/<option /g) || []).length;
const inssAll = c.checklist.filter(i => i.key === 'inss');
check('드롭다운에 배분 항목이 다 뜬다 (기관 3곳 × 증빙 3종 = 9)',
      optCount === 9, optCount);
inssAll.forEach(it => {
  check('  "' + it.n + '" 이 선택지로 보인다',
        recvHtml.includes('value="' + it.uid + '"') && recvHtml.includes(it.n));
});
check('★ 항목 이름에 기관이 붙어 있다 (안 붙으면 담당자가 어느 기관 건지 모른다)',
      inssAll.every(it => /· .+센터/.test(it.n)), inssAll.map(i => i.n));

console.log('\n[기관마다 링크가 한 장씩 나가는가]');
/* ★ 2026-09-03 에 방향이 뒤집혔다 — 예전 이 절은 "다기관이면 발급을 막는가" 였다.
     링크가 건당 1장이라 세 기관에 각각 못 보냈고, 보내면 누가 낸 것인지 못 가렸다.
     이제 access_link 가 배분처마다 한 장이고 orgSlots 가 distId 로 좁힌다.
     그래서 막는 대신 **기관마다 발급**하고, 지켜야 할 것이 바뀌었다:
       (전) 발급 버튼이 없는가        →  (후) 기관마다 발급 자리가 있는가
       (전) 기관 추가 시 링크가 죽는가 →  (후) 앞 기관 링크가 살아 있는가
     ⚠️ 되돌리지 말 것 — 되살리면 기관을 추가할 때마다 앞 기관이 링크를 다시 받아야 한다. */
const linkHtml = window.orgLinkBlock(c);
check('★ 기관마다 카드가 있다 (3곳)',
      (c.dists || []).every(d => linkHtml.indexOf(d.orgName) >= 0), (c.dists||[]).map(d=>d.orgName));
/* ★ 저장 전(sd1)에는 발급 자리를 주지 않는다 — 임시 id 로 만들면
     '어느 기관 것인지 모르는 링크' 가 생겨, 발급을 막아 뒀던 그 자리로 되돌아간다.
     db.js issueAccessLink 가 거부하지만 화면도 같은 말을 해야 한다. */
check('★ 배분처가 저장되기 전에는 발급 자리가 없다',
      !/issueOrgLinkFor\(/.test(linkHtml) && /저장/.test(linkHtml),
      (linkHtml.match(/issueOrgLinkFor\(/g) || []).length);

/* 저장된 뒤(숫자 id)에는 기관마다 발급 자리가 나온다 */
/* 배분처가 DB 에 저장되면 화면 임시 id(sd1)가 숫자 PK 로 바뀐다 —
   그때 항목의 distId·uid 도 함께 옮겨야 한다(db.js saveDistribution 이 하는 일). */
const idMap = {};
(c.dists || []).forEach((d, i) => { idMap[d.id] = 900 + i; d.id = 900 + i; });
c.checklist.forEach(it => {
  if (it.stage !== '배분' || !(it.distId in idMap)) return;
  const nid = idMap[it.distId];
  it.uid = String(it.uid).replace('#' + it.distId, '#' + nid);
  it.distId = nid;
});
const linkHtmlSaved = window.orgLinkBlock(c);
check('★ 저장된 뒤에는 기관마다 발급 자리가 있다',
      (linkHtmlSaved.match(/issueOrgLinkFor\(/g) || []).length === (c.dists || []).length,
      (linkHtmlSaved.match(/issueOrgLinkFor\(/g) || []).length);
check('발급 버튼이 배분처 id 를 함께 넘긴다 (안 넘기면 첫 기관 자리에 쓴다)',
      (c.dists || []).every(d => linkHtmlSaved.indexOf("'" + d.id + "'") >= 0));
/* ★ 뒤집힌 검사다 (설계서 §4 F · 선미 2026-09-06 결정) — 전에는 이 카드에
     "링크를 쓰기 어려운 기관은 담당자가 대신 등록합니다 [수취 등록으로]" 가 있어야 했다.
     그 버튼은 uid 없이 가서 **첫 대기 항목**이 열린다 — 담당자가 올리려던 인수증이 아닐 수 있다.
     길이 없어진 것은 아니다: [수취 현황] 탭에서 그 인수증 항목 옆 [수취 등록] 이 그 자리다. */
check('★ 뭉뚱그린 [수취 등록으로] 가 없다 (어느 항목인지 안 실려 가던 마지막 경로)',
      !/go\('receive','[^']+'\)/.test(linkHtml), (linkHtml.match(/go\('receive'[^)]*\)/g) || []));

/* ── 기관을 추가해도 앞 기관 링크가 살아 있는가 ────────────
   예전에는 죽였다(건당 1장이라 죽여야 했다). 지금 죽이면 기관을 추가할 때마다
   앞 기관이 링크를 다시 받아야 한다 — 실무에서 배분은 나눠서 정해진다. */
console.log('\n[기관을 추가해도 앞 기관 링크가 살아 있는가]');
const c2 = window.DB.cases.find(x => x.donation && x.donation.qty > 2 && x.id !== c.id);
const reset2 = () => {
  c2.state = '검수';
  c2.orgId = null; c2.orgName = ''; c2.dists = []; c2.distSeq = 0;
  c2.orgLinks = null;
  c2.checklist = c2.checklist.filter(it => it.stage !== '배분');
  c2.checklist.forEach(it => { it.r.st = 'done'; });
};
const addOrg2 = (name, qty) => {
  window.DB.distForm = {caseId:c2.id, orgName:name, qty:String(qty), memo:''};
  window.decideDist(c2.id);
};
reset2();
addOrg2('늘봄지역아동센터', 1);
const d0 = c2.dists[0];
d0.linkToken = 'tok-늘봄';                       /* 발급된 상태를 흉내낸다(발급 자체는 db 계층 검사) */
addOrg2('행복복지관', 1);
check('★ 앞 기관 토큰이 그대로 있다 (죽이면 다시 받아야 한다)', c2.dists[0].linkToken === 'tok-늘봄',
      c2.dists[0].linkToken);
check('두 번째 기관도 카드가 생겼다', window.orgLinkBlock(c2).indexOf('행복복지관') >= 0);

/* ── 기관은 자기 몫만 보는가 (선미 요청 · 개인정보) ────────
   ★ 이게 발급 차단을 걷어낼 수 있었던 유일한 이유다.
     좁히기가 없으면 늘봄이 자기 링크로 들어가 행복복지관 서류 자리까지 다 본다.
     버그가 아니라 개인정보 노출이라 여기서 지킨다. */
console.log('\n[기관 셋이 각자 자기 것만 보는가]');
const K = window.COL.accessLink;
const seen = {};
(c.dists || []).forEach(function(d){
  window.DB.linkEntry = {token:'t', link:{[K.distributionId]:d.id}, state:'ok', caseId:c.id, distId:d.id};
  window.DB.orgForm = {linkCaseId:c.id, verified:true, verifyInput:'', verifyTries:0,
    receiverName:'', recvQty:'', recvPkg:'', recvDate:window.TODAY,
    signed:false, signImg:null, confirm:false, files:{}, submittedId:null};
  seen[d.orgName] = window.orgSlots(c).map(function(it){ return it.uid; });
});
const names = Object.keys(seen);
check('★ 기관마다 자기 슬롯만 열린다 (건 전체가 아니다)',
      names.every(n => seen[n].length > 0 && seen[n].every(u => u.indexOf('#') > 0)), seen);
check('★ 남의 슬롯이 섞이지 않는다 (겹치는 uid 0)',
      names.every((n, i) => names.slice(i + 1).every(m =>
        seen[n].every(u => seen[m].indexOf(u) < 0))), seen);
window.DB.linkEntry = null;                       /* 뒤 검사에 영향 주지 않게 되돌린다 */

/* ── 요약과 게이트가 같은 말을 하는가 ──────────────────────
   inspect()(common.js)는 대조 판정을 모르고, rules-compare.js 는 사유 해소를 모른다.
   그래서 '항목은 다 수취됐는데 대조만 막는' 상태에서 요약은 '완결', 버튼은 잠김이 된다.
   담당자에게는 "완결이라면서 왜 안 눌리지" 로 보인다 (2026-09-02 브라우저 확인).
   ★ E3 를 켜지 않아도 E7 로 재현된다 — 3기관 증빙을 전부 수취하고 합계만 모자란 상태. */
console.log('\n[요약과 게이트가 같은 말을 하는가]');
reset2();
addOrg2('늘봄지역아동센터', 1);
addOrg2('행복복지관', 1);
c2.checklist.forEach(it => { if (it.r) it.r.st = 'done'; });   /* 배분 증빙까지 전부 수취 */
const rawV = window.inspect(c2, window.TODAY);
const shownV = window.inspectView(c2, window.TODAY);
check('전제 — 항목만 보면 완결 가능이다',
      rawV.verdict === '완결' && rawV.canComplete === true, rawV.verdict + ' / ' + rawV.canComplete);
check('★ 화면은 완결이라고 하지 않는다', shownV.verdict !== '완결', shownV.verdict);
check('★ 완결 가능으로도 내주지 않는다', shownV.canComplete === false, shownV.canComplete);
check('왜 막혔는지 요약이 말해준다 (E7 → 규칙 이름 · 9/10)', /배분 수량 합계/.test(shownV.reasonMessage || ''), shownV.reasonMessage);
check('대조가 안 막으면 원래 판정 그대로다 (과잉 보정 아님)', (function(){
        const c3 = window.DB.cases.find(x => x.state === '완결') || c;
        const a = window.inspect(c3, window.TODAY), b = window.inspectView(c3, window.TODAY);
        return window.unresolvedBlocking(c3).length ? true : a.verdict === b.verdict;
      })());

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
