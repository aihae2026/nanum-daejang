/* 건 상세 — 진행바 6단계가 탭이고, 배분처 단계는 기관마다 접힌다 (2026-09-11 선미 · 시안 C)
   설계: 10-planning/case-detail-steps-design-20260911.md

   ★ 왜 만들었나 — [수취 현황]·[검수 결과] 두 탭이 같은 체크리스트를 각각 그려 같은 서류를 두 번 훑었고,
       검수 결과는 후원자 5장 + 기관 3곳×3장 = 14장을 한 줄로 펼쳤다. 진행 단계는 화면에 없었다.
   ★ 지키는 것
     ① 진행바 6칸이 이 순서로 그려진다 — 후원자 수취 · 후원자 검수 · 배분기관 지정 · 배분처 수취 · 배분처 검수 · 완결
     ② 지금 단계는 **새 기준이 아니라** caseStateKey() 로 정해진다 (목록·판정 배지와 같은 함수)
     ③ DB.tab 이 단계 id 가 아니면(옛 'receipts' 포함) "자동 = 지금 단계" 다 — go()·세션 복원이 그대로 돈다
     ④ 검수 실행 전에도 서류가 보이고 **항목 옆** [수취 등록] 에 uid 가 실린다 · 뭉뚱그린 버튼은 없다
     ⑤ 배분처 단계는 기관마다 아코디언 · 한 곳이면 펼침 · 여럿이면 미처리 있는 곳만 펼침
     ⑥ 골격 표지(판정 요약 · AI 고지)가 **어느 단계에서도** 있다 · 배분 카드는 ③④⑤ 에서만 (2026-09-12) — case-skeleton 이 순서를 본다
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-case-steps.mjs
*/
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { appScripts } from './app-scripts.mjs';
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
for (const f of appScripts()) window.eval(readFileSync(APP + f, 'utf8'));
const W = window, DB = W.DB;

let fail = 0;
const check = (n, ok, got) => {
  console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got)));
  if (!ok) fail++;
};
const parse = (html) => { const d = W.document.createElement('div'); d.innerHTML = html; return d; };
const stepsOf = (el) => [...el.querySelectorAll('.stepbar .sb')].map(b => b.querySelector('.sb-t').textContent.trim().replace(/^\d+\s*/, ''));
const nowOf   = (el) => { const b = el.querySelector('.stepbar .sb.now'); return b ? b.querySelector('.sb-t').textContent.trim().replace(/^\d+\s*/, '') : null; };
const selOf   = (el) => { const b = el.querySelector('.stepbar .sb[aria-selected="true"]'); return b ? b.querySelector('.sb-t').textContent.trim().replace(/^\d+\s*/, '') : null; };
const open = (id) => { W.go('case', id); DB.role = 'staff'; return parse(W.viewCase()); };

DB.role = 'staff';
const ORDER = ['후원자 서류 수취', '후원자 서류 검수', '배분기관 지정', '배분처 서류 수취', '배분처 서류 검수', '완결'];

console.log('\n[① 진행바 6칸 · 순서]');
{
  const el = open('103');
  check('★ 진행바가 있다', !!el.querySelector('.stepbar'));
  check('★ 6칸이 이 순서다', JSON.stringify(stepsOf(el)) === JSON.stringify(ORDER), stepsOf(el));
  check('옛 탭 [수취 현황][검수 결과] 은 없다', !/>수취 현황<\/button>|>검수 결과<\/button>/.test(el.innerHTML));
}

console.log('\n[④ 검수 실행 전에도 서류가 보이고, 항목 옆 [수취 등록] 에 uid 가 실린다]');
{
  /* ⚠️ ② 보다 먼저 — ② 가 #103 을 앞으로 밀어 버린다. 여기서는 손대지 않은 #103 이 필요하다 */
  const c = W.getCase('103');                          /* 미완결 · 아직 검수 실행 전 */
  check('전제: 검수 전이다', !c.inspectedAt && W.inspectView(c, W.TODAY).canInspect);
  const el = open('103');
  const target = W.donorItems(c).find(it => ['miss', 'unc'].includes(W.itemStatus(it).code));
  check('전제: 미처리 항목이 있다', !!target, W.donorItems(c).map(it => W.itemStatus(it).code));
  check('★ 검수 전에도 서류 행이 그려진다', el.querySelectorAll('.doc-row').length >= 4, el.querySelectorAll('.doc-row').length);
  check('★ 그 항목 옆 [수취 등록] 이 uid 를 싣고 간다',
        !!target && el.innerHTML.includes("go('receive','103','" + target.uid + "')"),
        (el.innerHTML.match(/go\('receive'[^)]*\)/g) || []));
  check('★ 뭉뚱그린 [수취 등록] 은 없다', !el.innerHTML.includes("go('receive','103')"));
  check('수취 요약표가 있다', !!el.querySelector('.recv-sum'));
}

console.log('\n[② 지금 단계 = caseStateKey — 여섯 상태 전부]');
{
  check('#115 검수대기 → ① 후원자 서류 수취', nowOf(open('115')) === '후원자 서류 수취', nowOf(open('115')));
  check('#103 미완결 → ② 후원자 서류 검수',   nowOf(open('103')) === '후원자 서류 검수', nowOf(open('103')));
  check('#101 완결확정 → ⑥ 완결',            nowOf(open('101')) === '완결', nowOf(open('101')));

  /* #103 을 앞으로 밀어 나머지 셋을 만든다 — case-skeleton 이 쓰는 방법 그대로.
     ⚠️ #103 데모 원장에는 배분처 없이 배분 항목 2개가 미리 들어 있다(늘봄 인수증·결과보고서).
        그대로 두면 "후원자 서류 다 됨" 이 곧장 완결가능으로 읽히므로, 그 둘을 제외(included=false)해
        "후원자 서류만 있고 배분처는 아직" 인 건으로 만든다. (#107 은 대조 판정이 걸려 있어 재료로 못 쓴다) */
  const c = W.getCase('103');
  c.checklist.forEach(it => { if (it.stage === '배분') it.included = false; else { it.r.st = 'done'; it.r.status = '수취완료'; } });
  c.orgId = null;                    /* inspect() 는 orgId 가 비어야 '후원자서류완비' — 데모 #103 은 옛 방식 orgId 가 박혀 있다 */
  c.inspectedAt = '2026-09-11';
  check('후원자서류완비 → ③ 배분기관 지정', nowOf(open('103')) === '배분기관 지정',
        {now: nowOf(open('103')), key: W.caseStateKey(c, W.inspectView(c, W.TODAY))});

  const half = Math.floor(Number(c.donation.qty) / 2);
  DB.distForm = {caseId:'103', orgName:'늘봄지역아동센터', qty:String(half), memo:''};
  W.decideDist('103');
  DB.distForm = {caseId:'103', orgName:'한빛지역아동센터', qty:String(Number(c.donation.qty) - half), memo:''};
  W.decideDist('103');
  check('배분진행(기관 제출 없음) → ④ 배분처 서류 수취', nowOf(open('103')) === '배분처 서류 수취',
        {now: nowOf(open('103')), key: W.caseStateKey(c, W.inspectView(c, W.TODAY))});

  const pend = W.distPendingItems(c)[0];
  pend.r.orgUpload = {status:'uploaded', date:'2026-09-11'};
  check('배분진행(기관 제출 있음) → ⑤ 배분처 서류 검수', nowOf(open('103')) === '배분처 서류 검수',
        {now: nowOf(open('103'))});
  delete pend.r.orgUpload;
}

console.log('\n[③ DB.tab 이 단계 id 가 아니면 자동 — 옛 값·기본값이 그대로 돈다]');
{
  W.go('case', '103');
  check('go() 기본값은 자동(auto)', DB.tab === 'auto', DB.tab);
  DB.tab = 'receipts';                                 /* 옛 세션에 남아 있을 값 */
  let el = parse(W.viewCase());
  check('★ 옛 값 receipts → 지금 단계가 선택된다', selOf(el) === nowOf(el), {sel: selOf(el), now: nowOf(el)});
  DB.tab = 'checklist';                                /* smoke-test-ai 가 넘기는 값 */
  el = parse(W.viewCase());
  check('★ 옛 값 checklist → 지금 단계가 선택된다', selOf(el) === nowOf(el), {sel: selOf(el), now: nowOf(el)});
  W.switchTab('donorRecv');
  el = parse(W.viewCase());
  check('★ 단계를 누르면 그 단계가 선택된다 (지금 단계 표시는 그대로)',
        selOf(el) === '후원자 서류 수취' && nowOf(el) === '배분처 서류 수취', {sel: selOf(el), now: nowOf(el)});
  /* ① 은 수취 단계라 검수를 마쳐도 항목 카드가 아니라 수취 행(doc-row)이다 (2026-09-12 선미) */
  check('① 단계엔 후원자 서류만 — 기관 아코디언이 없다', !el.querySelector('.org-acc') && el.querySelectorAll('.doc-row').length >= 4,
        {acc: el.querySelectorAll('.org-acc').length, rows: el.querySelectorAll('.doc-row').length});
  W.go('case', '101');
  check('다른 건을 열면 자동으로 돌아간다', DB.tab === 'auto', DB.tab);
}

console.log('\n[⑤ 배분처 단계 — 기관마다 아코디언]');
{
  const c = W.getCase('103');                          /* 위에서 늘봄·한빛 두 곳을 정해 둔 건 */
  let el = open('103');
  const accs = [...el.querySelectorAll('.org-acc')];
  check('★ 기관 수만큼 아코디언 (2곳 → 2개)', accs.length === 2, accs.length);
  check('둘 다 미처리라 둘 다 펼쳐져 있다', accs.every(a => a.hasAttribute('open')), accs.map(a => a.hasAttribute('open')));
  check('아코디언 머리에 기관 이름이 있다', accs.some(a => /늘봄/.test(a.querySelector('summary').textContent)) && accs.some(a => /한빛/.test(a.querySelector('summary').textContent)));
  check('아코디언 안에 그 기관 항목이 있다', accs.every(a => a.querySelectorAll('.item-card, .doc-row').length >= 1), accs.map(a => a.querySelectorAll('.item-card, .doc-row').length));

  /* 늘봄 것만 다 받으면 늘봄은 접히고 한빛만 펼쳐진다 */
  /* 늘봄 항목 전부 — decideDist 가 만든 것(distId) 과 데모 원장에 있던 것(g 에 기관명) 이 한 기관이다 */
  W.distItems(c).filter(it => /늘봄/.test((it.g || '') + (it.n || ''))).forEach(it => { it.r.st = 'done'; it.r.status = '수취완료'; });
  el = open('103');
  const byName = (s) => [...el.querySelectorAll('.org-acc')].find(a => new RegExp(s).test(a.querySelector('summary').textContent));
  check('★ 다 받은 기관은 접히고, 미처리 기관만 펼쳐진다',
        byName('늘봄') && !byName('늘봄').hasAttribute('open') && byName('한빛') && byName('한빛').hasAttribute('open'),
        {늘봄: byName('늘봄') && byName('늘봄').hasAttribute('open'), 한빛: byName('한빛') && byName('한빛').hasAttribute('open')});
  check('기관별 수취 요약 행이 있다', el.querySelectorAll('.recv-sum tbody tr').length === 2, el.querySelectorAll('.recv-sum tbody tr').length);
  check('[배분기관 제출 화면 미리보기] 가 있다', /openPreview\('orgSubmit'/.test(el.innerHTML));

  /* 기관이 한 곳뿐이면 접을 것이 없다 — #117 */
  const el1 = open('117');
  W.switchTab('distRecv'); const e1 = parse(W.viewCase());
  check('한 곳뿐이면 펼쳐진 채 그린다', e1.querySelectorAll('.org-acc').length === 1 && e1.querySelector('.org-acc').hasAttribute('open'),
        {n: e1.querySelectorAll('.org-acc').length});
}

console.log('\n[⑥ 골격 표지가 어느 단계에서도 있다 — case-skeleton 이 보는 것]');
{
  W.go('case', '103');
  for (const id of ['donorRecv', 'donorCheck', 'distDecide', 'distRecv', 'distCheck', 'done']){
    W.switchTab(id);
    const h = W.viewCase();
    const gate = Math.max(h.indexOf('gate-row'), h.indexOf('runInspect()">검수 실행')) >= 0;
    const ai   = h.indexOf('AI는 <b>금액') >= 0;
    const dist = Math.max(h.indexOf('<h3>배분결정'), h.indexOf('<h3>배분기관 증빙 제출 링크</h3>')) >= 0;
    /* ★ 배분 카드는 ③④⑤ 에서만 (2026-09-12 선미) — ①② 에는 배분결정이, ⑥ 에는 링크가 뜰 이유가 없다 */
    const wantDist = ['distDecide', 'distRecv'].includes(id);   /* ⑤ 의 링크 카드도 뺐다 (2026-09-12 선미) */
    /* 판정 요약·AI 고지는 검수 단계(②⑤⑥)에만 — 수취 단계(①④)와 ③ 에는 없다 (2026-09-12 선미) */
    const wantGate = ['donorCheck', 'distCheck', 'done'].includes(id);
    check(`${id} — 판정 요약·AI 고지는 ②⑤⑥ 에만 · 배분 카드는 ③④ 에서만`, gate === wantGate && ai === wantGate && dist === wantDist, {gate, ai, dist, wantDist});
  }
}

console.log('\n[⑦ 취소 건은 진행바 없이 지금 그대로]');
{
  const c = W.getCase('117'); const keep = c.state;
  c.state = '취소'; c.cancelReason = '검사';
  const el = open('117');
  check('취소 건에는 진행바가 없다', !el.querySelector('.stepbar'));
  c.state = keep; delete c.cancelReason;
}

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 진행바가 탭이고, 단계는 caseStateKey 가 정한다');
process.exit(fail ? 1 : 0);
