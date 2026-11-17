/* 저장한 것을 다시 읽으면 그대로인가 — 매핑 왕복 (2026-09-02 유진)

   ★ 왜 필요한가 — 9/2 에 원장 쓰기를 붙였다(donation·distribution·checklist_item·
     form_submission). 그런데 **다시 읽는 쪽은 한 번도 확인하지 않았다.**
     쓰기가 맞아도 읽기가 어긋나면 새로고침한 담당자는 다른 화면을 본다.

   ★ 특히 보는 것: 이름이 늘어나지 않는가.
     화면은 '인수증 · 늘봄' 으로 들고 있고, 저장할 때 꼬리를 떼고,
     되살릴 때 다시 붙인다. 한쪽만 어긋나면 새로고침마다 이름이 자란다
     ('인수증 · 늘봄 · 늘봄 · 늘봄'). 에러가 안 나서 알아채기 어렵다.

   실 DB 를 쓰지 않는다 — itemToRow ↔ rowToItem 을 맞대어 본다.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-roundtrip-map.mjs
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

const c = {id:'501', dbId:9, dists:[{id:12, org_name:'늘봄지역아동센터', orgName:'늘봄지역아동센터', qty:20}]};
const orgOf = {12:'늘봄지역아동센터'};

console.log('\n[① 배분 항목 — 이름이 자라지 않는가]');
let it = window.mkItem({key:'inss', n:'인수증 · 늘봄지역아동센터', kind:'A', stage:'배분',
                        g:'배분처 수취 — 늘봄지역아동센터', basis:'기관 업무지침', distId:12});
let row = window.itemToRow(c, it);
let back = window.rowToItem(Object.assign({id:77}, row), orgOf);
check('★ 한 번 왕복해도 이름이 같다', back.n === it.n, {before:it.n, after:back.n});
check('★ 담당 표기도 같다', back.g === it.g, {before:it.g, after:back.g});

/* 세 번 돌린다 — 새로고침을 세 번 한 셈이다 */
let cur = back;
for (let i = 0; i < 3; i++) cur = window.rowToItem(Object.assign({id:77}, window.itemToRow(c, cur)), orgOf);
check('★★ 네 번 왕복해도 안 자란다 (새로고침 반복)', cur.n === it.n, cur.n);
check('규칙코드가 유지된다', cur.key === 'inss', cur.key);
check('배분처 연결이 유지된다', String(cur.distId) === '12', cur.distId);
check('★ uid 가 기관까지 문다 (엉뚱한 기관 처리 차단)', cur.uid === 'inss#12', cur.uid);

console.log('\n[② 접수 항목 — 기관이 없는 경우]');
it = window.mkItem({key:'proof_buy', n:'구매영수증 또는 매입세금계산서', kind:'A',
                    stage:'접수', g:'후원자 발급', basis:'기관 업무지침'});
back = window.rowToItem(Object.assign({id:78}, window.itemToRow(c, it)), orgOf);
check('이름이 같다', back.n === it.n, back.n);
check('기관 꼬리가 안 붙는다', back.n.indexOf('·') < 0, back.n);
check('단계가 유지된다', back.stage === '접수', back.stage);

console.log('\n[③ 상태가 왕복하는가]');
[['miss','미수취'], ['done','수취완료'], ['unc','확인필요']].forEach(([code, label]) => {
  const t = window.mkItem({key:'photo', n:'물품사진', kind:'A', stage:'접수'});
  t.r.st = code;
  const b = window.rowToItem(Object.assign({id:79}, window.itemToRow(c, t)), orgOf);
  check('  ' + label + ' 이 그대로 돌아온다', b.r.st === code, {sent:code, got:b.r.st});
});

console.log('\n[④ ★ 사유해소가 왕복하는가 — 오늘 붙인 것]');
it = window.mkItem({key:'photo', n:'물품사진', kind:'A', stage:'접수'});
it.r.st = 'unc';
it.r.resolution = {reason:'후원처 통화로 확인', by:'담당자', date:'2026-09-02'};
row = window.itemToRow(c, it);
back = window.rowToItem(Object.assign({id:80}, row), orgOf);
check('★ 사유가 돌아온다', back.r.resolution && back.r.resolution.reason === '후원처 통화로 확인',
      back.r.resolution);
check('★ 넘어가기 전 상태가 남아 있다 (수취완료로 둔갑하지 않는다)', back.r.st === 'unc', back.r.st);
check('★ 화면이 사유해소로 그린다', window.itemStatus(back).code === 'res',
      window.itemStatus(back));
check('해소한 사람·날짜도 돌아온다',
      back.r.resolution.by === '담당자' && back.r.resolution.date === '2026-09-02', back.r.resolution);

console.log('\n[⑤ 해소가 없으면 없는 채로 돌아온다]');
it = window.mkItem({key:'photo', n:'물품사진', kind:'A', stage:'접수'});
it.r.st = 'unc';
back = window.rowToItem(Object.assign({id:81}, window.itemToRow(c, it)), orgOf);
check('빈 해소를 지어내지 않는다', !back.r.resolution, back.r.resolution);
check('확인필요로 남는다', window.itemStatus(back).code === 'unc');

console.log('\n[⑥ 판정 해소도 왕복하는가]');
const findings = window.rowToFindings({
  inspection: [{id:1, started_at:'2026-09-02T10:00:00Z', model:null, status:'success',
    inspection_finding: [{id:5, rule_code:'E3', verdict:'확인 권장', reason:'시가 산정',
                          resolution_reason:'통화 확인', resolved_by:'담당자', resolved_at:'2026-09-02'}]}]
});
check('저장된 판정에 해소가 실려 온다', findings[0].resolution
      && findings[0].resolution.reason === '통화 확인', findings[0]);
const res = window.resFromFindings(findings);
check('★ 화면이 쓰는 해소 표로 바뀐다', res.E3 && res.E3.reason === '통화 확인', res);

console.log('\n[⑦ ★ 건 전체가 왕복하는가 — 새 접수를 만들고 다시 읽는다]');
/* 화면이 만든 새 접수 → createDonation 이 보내는 행 → rowToCase 가 돌려주는 건 */
window.eval("SUPABASE_CONFIG = {url:'https://x.supabase.co', key:'k'};");
let sentRow = null;
window.sbPost = (t, rr) => { sentRow = rr[0]; return Promise.resolve([Object.assign({id:9}, rr[0])]); };
const fresh = {id:'601', state:'제출 대기', donorType:'법인', donor:'OO교회',
               acqPath:'구매', inDate:'2026-09-02',
               submittedVia:'접수 링크 발급(담당자 직접 전달)', criteriaKey:'k1'};
await window.createDonation(fresh);
const rt = window.rowToCase(Object.assign({}, sentRow, {id:9, distribution:[], checklist_item:[], inspection:[]}));
check('건 번호가 같다', rt.id === '601', rt.id);
check('★ 상태가 같다 (제출 대기가 살아남는다)', rt.state === '제출 대기', rt.state);
check('후원자 유형이 같다', rt.donorType === '법인', rt.donorType);
check('법인 상호가 살아남는다 (영수증 발급 대상)', rt.donor === 'OO교회', rt.donor);
check('취득 경로가 살아남는다', sentRow.acquisition_path === '구매', sentRow.acquisition_path);
check('기준 스냅샷이 살아남는다', rt.criteriaKey === 'k1', rt.criteriaKey);
check('★ dbId 가 붙는다 — 이후 저장이 전부 이 값을 쓴다', rt.dbId === 9, rt.dbId);

console.log('\n[⑧ 접수 경로 — 화면 문구는 안 돌아온다 (분류만 남는다)]');
check('DB 에는 분류가 저장됐다', sentRow.submitted_via === '링크 제출', sentRow.submitted_via);
check('★ 되살리면 분류가 보인다 — 원래 문구는 사라진다 (의도한 것)',
      rt.submittedVia === '링크 제출', rt.submittedVia);
console.log('     ※ 화면 문구("접수 링크 발급(담당자 직접 전달)")는 그 세션에서만 보인다.');
console.log('       통계를 지키려고 분류로 저장하기 때문이다 — 표기가 갈리면 셀 수 없다.');

console.log('\n[⑨ 법인 외는 이름이 안 돌아온다 — 애초에 안 넣었으니까]');
const indiv = {id:'602', state:'제출 대기', donorType:'법인외', donor:'홍길동', inDate:'2026-09-02'};
await window.createDonation(indiv);
const rt2 = window.rowToCase(Object.assign({}, sentRow, {id:10, distribution:[], checklist_item:[], inspection:[]}));
/* ★ 규칙이 바뀌었다 (선미 결정 2026-09-06) — 가린 이름을 남긴다.
     실명이 DB 를 지나지 않는 것은 그대로다. 실명은 신청서 PDF 안에만 있다. */
check('★ 개인 실명이 DB 를 지나 오지 않는다', sentRow.donor_name !== '홍길동', sentRow.donor_name);
check('★ 가린 이름이 들어간다', sentRow.donor_name === '홍○동', sentRow.donor_name);
check('★ 가린 이름이 화면으로 돌아온다', rt2.donor === '홍○동', rt2.donor);
/* 이름이 아예 없는 옛 건(안 넣던 시절)은 '(미입력)' 이 아니라 어디에 있는지 말한다 —
   '(미입력)' 은 "후원자가 안 썼다" 로 읽힌다. 후원자는 적었고 신청서 PDF 에 있다. */
const oldIndiv = window.rowToCase(Object.assign({}, sentRow, {id:12, donor_name:null,
  distribution:[], checklist_item:[], inspection:[]}));
check('★ 옛 건은 어디에 있는지 말한다 (안 썼다고 하지 않는다)',
      oldIndiv.donor === '(신청서에서 확인)', oldIndiv.donor);
/* 법인은 다르다 — 영수증 발급 대상이라 상호를 원장에 남긴다. 비면 진짜 안 들어온 것이다 */
const corpRow = window.rowToCase(Object.assign({}, sentRow, {id:11, donor_type:'법인', donor_name:null,
  distribution:[], checklist_item:[], inspection:[]}));
check('   법인인데 비면 (미입력) 그대로', corpRow.donor === '(미입력)', corpRow.donor);

console.log('\n[⑩ 배분처가 왕복하는가 — E7 이 이 값으로 대조한다]');
const cd = {id:'603', dbId:9, dists:[]};
const drow = window.distToRow(cd, {id:'sd1', orgName:'늘봄지역아동센터', qty:20,
                                   distDate:'2026-09-02', memo:'메모'});
const rtd = window.rowToCase({id:9, case_no:'603', state:'검수 대기', donor_type:'법인',
  qty:60, distribution:[Object.assign({id:12}, drow)], checklist_item:[], inspection:[]});
check('기관명이 돌아온다', rtd.dists[0].org_name === '늘봄지역아동센터', rtd.dists[0]);
check('★ 낱개 수량이 돌아온다 (E7 대조 기준)', rtd.dists[0].qty === 20, rtd.dists[0].qty);
check('★ 남은 수량 계산이 맞는다 (60 - 20 = 40)',
      window.distRemainingQty(rtd) === 40, window.distRemainingQty(rtd));

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
