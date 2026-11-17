/* E2(일자 선행) 단위 테스트 — jsdom 없이 rules-compare.js 만 돌린다 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';   /* ⚠️ .pathname 은 한글 폴더를 %ED… 로 인코딩해 파일을 못 찾는다 (2026-09-05 집 PC 실측) */

const APP = fileURLToPath(new URL('./', import.meta.url));
const ctx = { console, COL: { distribution: { distDate: 'dist_date', qty: 'qty', orgName: 'org_name', id: 'id' } } };
vm.createContext(ctx);
vm.runInContext(readFileSync(APP + 'rules-compare.js', 'utf8'), ctx);

let fail = 0;
const check = (name, ok, got) => {
  console.log((ok ? '  ✅ ' : '  ❌ ') + name + (ok ? '' : '   ← ' + JSON.stringify(got)));
  if (!ok) fail++;
};
const kase = (donationDate, dists, checklist) =>
  ({ donation: { donationDate }, dists: dists || [], checklist: checklist || [] });
const e2 = (c) => ctx.checkE2(c);

console.log('\n[E2-a] 기부일 ≤ 배분일 — 코드 단독');
let r = e2(kase('2026-06-20', [{ dist_date: '2026-07-05' }]));
check('정상 순서는 이상 없음', r.verdict === '이상 없음', r);

r = e2(kase('2026-06-20', [{ dist_date: '2026-06-10' }]));
check('배분일이 기부일보다 빠르면 확인 권장', r.verdict === '확인 권장', r);
check('  사유에 두 날짜를 나란히 적는다 (루브릭 형식)',
      /배분일\(6\/10\).*기부일\(6\/20\)/.test(r.reason), r.reason);

r = e2(kase('2026-06-20', [{ dist_date: '2026-07-05' }, { dist_date: '2026-06-01' }]));
check('★ 다기관이면 가장 이른 배분일로 판정한다', r.verdict === '확인 권장' && /6\/1\)/.test(r.reason), r);

r = e2(kase(null, [{ dist_date: '2026-07-05' }]));
check('★ 기부일이 없으면 조용히 통과시키지 않고 판단 보류', r.verdict === '판단 보류', r);

/* ★ 배분 전 — 위반이 존재할 수 없으므로 아무것도 내지 않는다(E7과 같은 자리).
   '이상 없음'으로 적으면 보지도 않은 것을 통과시킨 모양이 되고 카드만 길어진다. */
r = e2(kase('2026-06-20', []));
check('★ 배분 전이면 아무것도 내지 않는다 (E7과 같은 판단)', r === null, r);

r = e2(kase('2026.06.20', [{ dist_date: '2026/06/10' }]));
check('★ 점·슬래시 표기도 같은 날짜로 읽는다', r.verdict === '확인 권장', r);

r = e2(kase('알 수 없음', [{ dist_date: '2026-07-05' }]));
check('★ 날짜로 못 읽는 값은 넘겨짚지 않고 판단 보류', r.verdict === '판단 보류', r);

/* ── 축 라벨 — 같은 E2 가 두 줄 뜰 때 중복으로 읽히지 않게 하는 표시값.
   ⚠️ 표시 전용이다. rule 은 두 축 모두 'E2' 라야 DB 통계가 안 갈라진다. */
console.log('\n[축 라벨]');
r = e2(kase('2026-06-20', [{ dist_date: '2026-07-05' }]));
check('배분일 축에 축 이름이 붙는다', r.axis === '기부→배분', r);
check('  rule 은 그대로 E2 (통계가 갈라지지 않는다)', r.rule === 'E2', r);

r = e2(kase(null, [{ dist_date: '2026-07-05' }]));
check('★ 기부일이 없을 때는 축을 안 붙인다 (두 축 다 못 본 것이라 한 줄로 말한다)',
      r.axis === undefined, r);

console.log('\n[E2-b] 구매일 ≤ 기부일 — 추출값(issueDate)');
const withFacts = (facts) => [{ r: { facts } }];
const p = (donationDate, x, checklist) =>
  ctx.checkE2Purchase(kase(donationDate, [], checklist || withFacts(x)), {}, x);

let f = { docKind: '구매영수증', issueDate: '2026-06-01', unreadable: [] };
r = p('2026-06-20', f);
check('구매 → 기부 순서면 이상 없음', r && r.verdict === '이상 없음', r);

f = { docKind: '구매영수증', issueDate: '2026-06-25', unreadable: [] };
r = p('2026-06-20', f);
check('구매일이 기부일보다 늦으면 확인 권장', r && r.verdict === '확인 권장', r);
check('  사유가 "기부한 다음에 샀다"를 말한다', /기부한 다음에 산 것/.test(r.reason), r.reason);

f = { docKind: '세금계산서', issueDate: '2026-06-25', unreadable: [] };
r = p('2026-06-20', f);
check('★ 세금계산서는 늦어도 "구매 전 기부"로 단정하지 않는다',
      r && r.verdict === '확인 권장' && /일자 확인 필요/.test(r.reason) && !/기부한 다음에 산 것/.test(r.reason), r);

f = { docKind: '물품사진', issueDate: '2026-06-25', unreadable: [] };
r = p('2026-06-20', f);
check('★ 구매일 근거가 아닌 서류는 E2 판정 안 함', r === null, r);

f = { docKind: '구매영수증', issueDate: null, unreadable: ['거래일자'] };
r = p('2026-06-20', f);
check('★ 날짜를 못 읽었다고 밝히면 판단 보류', r && r.verdict === '판단 보류', r);

f = { docKind: '구매영수증', issueDate: null, unreadable: [] };
r = p('2026-06-20', f);
check('서류에 날짜가 아예 없으면 판정 안 함', r === null, r);

f = { docKind: '구매영수증', issueDate: '2026-06-01', unreadable: [] };
r = p(null, f);
check('★ 기부일이 없으면 여기서 또 적지 않는다 (checkE2가 이미 남김)', r === null, r);

/* 우선순위 — 세금계산서와 거래명세표가 함께 올라온 경우 */
const taxInv = { docKind: '세금계산서', issueDate: '2026-06-25', unreadable: [] };
const slip   = { docKind: '거래명세표', issueDate: '2026-06-01', unreadable: [] };
const both   = [{ r: { facts: taxInv } }, { r: { facts: slip } }];
r = ctx.checkE2Purchase(kase('2026-06-20', [], both), {}, taxInv);
check('★ 거래명세표가 함께 있으면 세금계산서는 판정하지 않는다 (루브릭 우선순위)', r === null, r);
r = ctx.checkE2Purchase(kase('2026-06-20', [], both), {}, slip);
check('★ 그 거래명세표가 판정한다 — 거래일자 기준 정상', r && r.verdict === '이상 없음', r);

/* 회귀 — best 가 null 로 계산되는 자리에서 판정이 통째로 사라지지 않는가 */
r = ctx.checkE2Purchase(kase('2026-06-20', [], []), {}, { docKind: '구매영수증', issueDate: '2026-06-25', unreadable: [] });
check('★ 체크리스트에 facts가 아직 안 붙어 있어도 판정이 사라지지 않는다',
      r && r.verdict === '확인 권장', r);

/* 구매일 축에도 축 이름이 붙는가 — 두 줄이 라벨로 갈리는지가 여기서 정해진다 */
f = { docKind: '구매영수증', issueDate: '2026-06-01', unreadable: [] };
r = p('2026-06-20', f);
check('구매일 축에 축 이름이 붙는다', r.axis === '구매→기부', r);
check('  rule 은 그대로 E2', r.rule === 'E2', r);

f = { docKind: '세금계산서', issueDate: '2026-06-25', unreadable: [] };
r = p('2026-06-20', f);
check('세금계산서 경로에도 축이 붙는다', r.axis === '구매→기부', r);

f = { docKind: '구매영수증', issueDate: null, unreadable: ['거래일자'] };
r = p('2026-06-20', f);
check('날짜를 못 읽은 판단 보류에도 축이 붙는다 (어느 축을 못 봤는지 분명하다)',
      r.axis === '구매→기부', r);

/* ★ 두 축이 한 건에 동시에 뜨는 상황 — 라벨이 실제로 갈리는지 */
console.log('\n[두 줄이 동시에 뜨는 경우]');
const facts2 = { docKind: '구매영수증', issueDate: '2026-06-01', unreadable: [] };
const c2 = kase('2026-06-20', [{ dist_date: '2026-07-05' }], withFacts(facts2));
const both2 = [ctx.checkE2(c2), ctx.checkE2Purchase(c2, {}, facts2)].filter(Boolean);
check('E2 가 두 줄 뜬다', both2.length === 2, both2);
check('★ 두 줄의 축 이름이 서로 다르다 (중복으로 안 읽힌다)',
      both2[0].axis !== both2[1].axis, both2.map(x => x.axis));
check('★ 두 줄 모두 rule 은 E2 (감사 기록·통계는 한 규칙으로 남는다)',
      both2.every(x => x.rule === 'E2'), both2.map(x => x.rule));

/* ════════════════════════════════════════════════════════════
   세트로 읽기 — 한 건의 첨부를 모아서 보고 정보 출처를 고른다 (루브릭 §판정절차)
   ★ 2026-09-01 실측에서 잡은 것: 세금계산서(수량 0)와 거래명세표(수량 400)가
     함께 붙으면 E4 가 '확인 권장'과 '이상 없음'을 **동시에** 냈다.
   ════════════════════════════════════════════════════════════ */
console.log('\n[세트로 읽기 — E4 수량 출처]');
const facts = (o) => ({qtyUnit:'박스', unreadable:[], ...o});
const TAX  = facts({docKind:'세금계산서', qty:'0',   total:'5,000,000', issueDate:'2026-07-05'});
const SLIP = facts({docKind:'거래명세표', qty:'400', total:'5,000,000', issueDate:'2026-06-15'});
const setCase = (list, extra) => ({
  donation:{qtyAsReceived:400, qtyUnit:'박스', donationDate:'2026-06-20', ...(extra||{})},
  acqPath:(extra||{}).acqPath, dists:[], checklist:list.map(f => ({r:{facts:f}}))
});
const findings = (c) => c.checklist.reduce((a, it) => a.concat(ctx.extractedFindings(c, it, it.r.facts)), []);
const of = (c, rule) => findings(c).filter(f => f.rule === rule);

let fs2 = of(setCase([TAX, SLIP]), 'E4');
check('★ 두 서류가 붙어도 E4 는 한 번만 뜬다', fs2.length === 1, fs2.map(f => f.verdict));
check('★ 세금계산서(수량 0)가 아니라 거래명세표로 판정한다 (루브릭: 세금계산서 수량 ✕)',
      fs2[0] && fs2[0].verdict === '이상 없음', fs2[0]);
check('  순서를 바꿔도 같다 (첨부 순서에 안 흔들린다)',
      (of(setCase([SLIP, TAX]), 'E4')[0] || {}).verdict === '이상 없음', null);

fs2 = of(setCase([TAX]), 'E4');
check('★ 세금계산서만 있으면 조용히 넘어가지 않고 판단 보류',
      fs2.length === 1 && fs2[0].verdict === '판단 보류', fs2);
check('  사유가 "수량 출처가 아니다"를 말한다',
      /수량 출처로 쓰지 않습니다/.test((fs2[0] || {}).reason || ''), fs2[0] && fs2[0].reason);

check('거래명세표만 있으면 그대로 판정한다',
      (of(setCase([SLIP]), 'E4')[0] || {}).verdict === '이상 없음', null);

console.log('\n[세트로 읽기 — E5 중복]');
const R1 = facts({docKind:'구매영수증', qty:'400', total:'5,000,000', issueDate:'2026-06-15'});
const R2 = facts({docKind:'간이영수증', qty:'400', total:'5,000,000', issueDate:'2026-06-16'});
const e5 = of(setCase([R1, R2], {acqPath:'제조·유통'}), 'E5');
check('★ 같은 경로를 시사하는 서류가 둘이어도 E5 는 한 번만 뜬다', e5.length === 1, e5.map(f => f.reason));

console.log('\n[E8 — 사진 자리에 사진이 아닌 것이 왔다 (2026-09-03 신설)]');
/* 실제 사례: `붙임2. 기부물품 사진_채움컴퍼니.pdf` 를 열어 보니 롯데월드 예매 내역이었고
   AI 는 '구매영수증' 이라 했다. 받아야 할 물품 사진을 못 받았는데 자리는 채워졌다. */
const slotCase = (key, f) => ({
  donation:{qtyAsReceived:400, qtyUnit:'박스', donationDate:'2026-06-20'},
  acqPath:null, dists:[], checklist:[{key:key, r:{facts:f}}]
});
const e8of = (key, f) => findings(slotCase(key, f)).filter(x => x.rule === 'E8');

const asDoc = facts({docKind:'구매영수증', qty:'28', unitPrice:'65,000', total:'1,820,000'});
let g = e8of('photo', asDoc);
/* ★ 2026-09-04 두 번째 고침 — 실무 확인(유진)으로 '확인 권장' → '판단 보류' 로 내렸다.
     물품 사진을 애초에 올릴 수 없는 건이 있다(이용권·입장권 등). "빠뜨렸다" 와 "낼 수 없다" 를
     우리가 못 가르므로 단정하지 않는다. 검사를 지우지 않고 그 자리에서 고쳐 쓴다. */
check('★★ 사진 자리에 구매영수증이 오면 판단 보류', g.length === 1 && g[0].verdict === '판단 보류', g);
check('  오류로 세지 않는다 (사진을 낼 수 없는 물품일 수 있다)', g[0] && g[0].isError === false, g[0]);
check('  사유가 후원자 잘못을 단정하지 않는다',
      /올릴 수 없|찍을 수 없/.test((g[0]||{}).reason||''), g[0] && g[0].reason);
check('★ 완결을 막지는 않는다 (담당자가 보고 판단한다)', g[0] && g[0].blocksComplete === false, g[0]);

check('★ 배분 물품 사진 자리도 같이 본다', e8of('dist_photo', asDoc).length === 1, e8of('dist_photo', asDoc));

/* ★ 2026-09-04 · 2단계로 뒤집었다 — 이 두 줄은 **1단계의 결정을 적어 둔 것**이다.
     그때는 DOC_KINDS 에 '사진' 이 없어 진짜 사진이 '기타'·'판독불가' 로 왔고
     (9/3 표본 5건: 기타 4 · 판독불가 1), 그래서 그 둘을 통과시킬 수밖에 없었다.
   DOC_KINDS 에 '사진' 을 넣고 다시 재니 **5건이 전부 '사진'** 으로 왔다
     (run-20260904-prompt3 §3 · run-survey 2회). 그래서 통과 목록을 ['사진'] 으로 좁혔다.
   ⚠️ 검사를 지우지 않고 **그 자리에서 고쳐 쓴다** — 무엇이 왜 바뀌었는지가 남아야 한다. */
check('★ 진짜 사진은 통과한다 — 사진 (2단계)', e8of('photo', facts({docKind:'사진'})).length === 0);
check("★ 이제 '기타' 는 통과하지 않는다 — 1단계에서는 예매 내역이 여기로 새어 나갔다",
      e8of('photo', facts({docKind:'기타'})).length === 1);
check("★ '판독불가' 는 판단 보류로 사람에게 넘긴다 (통과도 지적도 아니다)",
      (e8of('photo', facts({docKind:'판독불가'}))[0] || {}).verdict === '판단 보류');
check("   '판독불가' 를 오류로 세지 않는다 (못 읽은 것은 후원자 잘못이 아니다)",
      (e8of('photo', facts({docKind:'판독불가'}))[0] || {}).isError === false);
check('★ 종류를 못 읽었으면 판정하지 않는다 (넘겨짚지 않는다)',
      e8of('photo', facts({docKind:null})).length === 0);

check('★ 구매영수증 자리에는 E8 이 안 뜬다 (그 자리는 E6 이 본다)',
      e8of('proof_buy', asDoc).length === 0, e8of('proof_buy', asDoc));
check('  그 자리에서는 E6 이 대신 판정한다',
      findings(slotCase('proof_buy', facts({docKind:'견적서'}))).some(x => x.rule === 'E6'));

/* ════════════════════════════════════════════════════════════
   단가 — 한 파일에 단가가 셋일 때 (2026-09-04 연수 · 유진 넘김 「연수 님」 칸)
   근거: (미공개 내부 기록)

   ★ 유진 과장 지적이 이 묶음의 요점이다 — *"프롬프트만 고치면 반쪽입니다.
     코드가 unreadable 을 보는 곳은 수량(E4)·거래일자(E2) 둘뿐이고 단가는 없습니다."*
     그래서 **비우기만 하면 오탐도 안 나지만 담당자도 못 본다.** 아래 [끼워졌나] 가 그 자리를 지킨다.
   ════════════════════════════════════════════════════════════ */
console.log('\n[단가 — 못 골랐다는 말이 담당자에게 가는가 (2026-09-04 연수)]');

/* 나눔 건의 시세자료는 DOCS_WITH_AMOUNT 에 없다 — checkExtractionGaps 는 안 돈다.
   그래서 여기서 뜨는 E1 은 전부 단가 규칙이 낸 것이다. */
const px = (o) => ctx.checkUnitPriceGap(facts({docKind:'시세자료', ...o}), null);

let u = px({ambiguous:['unitPrice']});
check('★ 여럿이라 못 골랐다고 밝히면 판단 보류', (u || {}).verdict === '판단 보류', u);
check("  사유가 '여러개' 를 말한다 — 담당자는 신청서 품목과 맞는 단가를 고르면 된다",
      /여러개/.test((u || {}).reason || ''), u && u.reason);
check('★ 완결을 막지 않는다 — 단가 하나로 건이 멈추면 담당자가 규칙을 끈다',
      (u || {}).blocksComplete === false, u);
check('  오류로 세지 않는다 (못 고른 것은 후원자 잘못이 아니다)', (u || {}).isError === false, u);

check('★ 한글 이름으로 와도 받는다 — UNREADABLE_ALIAS 표가 둘 다 받는다',
      (px({ambiguous:['단가']}) || {}).verdict === '판단 보류', px({ambiguous:['단가']}));

u = px({unreadable:['unitPrice']});
check('★ 못 읽었다고 밝히면 판단 보류', (u || {}).verdict === '판단 보류', u);
check('★ 못 읽음과 여럿은 사유가 갈린다 — 담당자가 할 일이 다르다 (원본을 연다 / 품목과 맞춘다)',
      /읽지 못했/.test((u || {}).reason || '') && !/여러개/.test((u || {}).reason || ''), u && u.reason);

check('단가를 읽었으면 아무 말 안 한다', px({unitPrice:'65,000'}) === null, px({unitPrice:'65,000'}));
check('서류에 단가가 없는 것은 정상일 수 있다 — 아무 말 안 한다', px({}) === null, px({}));

/* ⚠️ 9/4 에 사진 자리에 금액 대조가 걸렸던 그 자리다(checkExtractionGaps:249 와 같은 가드).
     물품 사진을 못 올리는 건마다 경고가 하나씩 더 붙으면 담당자가 경고를 무시하게 된다. */
const pxSlot = (key) => ctx.checkUnitPriceGap(facts({docKind:'시세자료', ambiguous:['unitPrice']}), {key:key});
check('★ 사진 자리에는 걸지 않는다 (9/4 에 사진 자리에 금액 대조가 걸렸던 그 자리)',
      pxSlot('photo') === null, pxSlot('photo'));
check('  배분 물품 사진 자리도 같다', pxSlot('dist_photo') === null, pxSlot('dist_photo'));
check('  시가 확인 증빙 자리에서는 그대로 뜬다', (pxSlot('market_px') || {}).verdict === '판단 보류', pxSlot('market_px'));

/* ★★ 이 묶음이 이 검사의 요점이다 — 함수가 있어도 세트 판정이 안 부르면 화면엔 끝내 안 뜬다. */
console.log('\n[단가 — 세트 판정에 끼워졌나]');
const pxFind = (f) => findings(slotCase('market_px', f)).filter(x => /단가/.test(x.reason || ''));
check('★★ 못 읽음이 세트 판정을 통해 담당자에게 올라온다',
      pxFind(facts({docKind:'시세자료', unreadable:['unitPrice']})).length === 1,
      pxFind(facts({docKind:'시세자료', unreadable:['unitPrice']})));
check('★★ 여럿도 마찬가지로 올라온다',
      pxFind(facts({docKind:'시세자료', ambiguous:['unitPrice']})).length === 1,
      pxFind(facts({docKind:'시세자료', ambiguous:['unitPrice']})));
check('  단가를 읽은 건은 아무것도 안 올라온다 (조용해야 할 때 조용한가)',
      pxFind(facts({docKind:'시세자료', unitPrice:'65,000'})).length === 0,
      pxFind(facts({docKind:'시세자료', unitPrice:'65,000'})));

/* ⚠️ 한 첨부에 판단 보류가 둘씩 쌓이면 담당자가 경고를 무시하게 된다(유진 9/4) —
     금액 서류(DOCS_WITH_AMOUNT)에서 금액도 단가도 못 읽으면 두 경고가 겹친다.
     금액 경고가 사유 끝에 단가를 이름까지 붙여 주므로, 그때는 단가 경고를 내지 않는다. */
console.log('\n[단가 — 금액 경고와 겹치지 않는가]');
const buy = (o) => findings(slotCase('proof_buy', facts({docKind:'구매영수증', qty:'28', ...o})));

let dup = buy({unreadable:['total','unitPrice']}).filter(x => x.rule === 'E1');
check('★★ 금액도 단가도 못 읽으면 판단 보류는 하나만 뜬다', dup.length === 1, dup.map(x => x.reason));
check('  남는 것은 금액 경고 쪽이다 — 거기에 단가 이름이 이미 붙어 있다',
      /금액을 읽지 못했/.test((dup[0] || {}).reason || '') && /unitPrice/.test((dup[0] || {}).reason || ''),
      dup[0] && dup[0].reason);

/* ★ 반대로 '여럿' 은 금액 경고가 말해 주지 않는다 — 담당자가 할 일도 다르다
     (원본을 연다 / 신청서 품목과 맞는 단가를 고른다). 그래서 이때는 둘 다 낸다. */
dup = buy({unreadable:['total'], ambiguous:['unitPrice']}).filter(x => x.rule === 'E1');
check("★ 금액은 못 읽고 단가는 '여럿' 이면 둘 다 낸다 (하는 일이 다르다)", dup.length === 2, dup.map(x => x.reason));

/* ★ 금액을 읽은 서류에서 단가만 못 읽으면 — 금액 경고가 안 뜨므로 단가 경고가 그대로 나가야 한다 */
dup = buy({total:'1,820,000', unreadable:['unitPrice']}).filter(x => /단가/.test(x.reason || ''));
check('★ 금액은 읽었고 단가만 못 읽었으면 단가 경고가 그대로 나간다 (조용해지면 안 된다)',
      dup.length === 1, dup);

console.log(fail ? `\n❌ 실패 ${fail}건` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
