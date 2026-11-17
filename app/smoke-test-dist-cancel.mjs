/* 배분건 취소·수정 — 수취 확정 전에만 열리는가 (2026-09-11 선미 결정 · patch-20260911-dist-cancel.sql)

   ★ 왜 만들었나 — 확정한 배분 수량을 고치거나 취소할 길이 아예 없었다.
       배분결정 카드는 남은 수량이 0 이면 사라지고(screen-staff.js) 안에는 [기관 추가] 뿐이라,
       틀린 배분이 하나 박히면 E7 이 완결을 계속 막아 **그 건은 완결이 영영 안 됐다.**
       9/10~11 루브릭 G13 을 돌리다 드러났다 — 전량 400 을 먼저 넣으면 되돌릴 수 없었다.

   ★ 정한 것 — 권한은 담당자 · **수취 확정 전에만** 수정·취소 · 확정 뒤에는 부분취소도 불가 ·
       잠금 기준은 '제출' 이 아니라 '수취 확정' · 취소는 행을 지우지 않고 사유와 함께 남긴다.

   여기서 보는 것
     ① 수취 확정 전 — 배분 현황 카드에 [수량 수정]·[배분 취소] 가 있다
     ② 수취 확정 후 — 둘 다 사라지고 잠금 문구가 뜬다 (긍정/부정 양쪽)
     ③ 제출만 된 상태(수취 확정 아님)에서는 아직 열려 있다 — 잠금 기준이 '수취 확정' 인지
     ④ 취소하면 E7 합계·남은 수량·배분처 표기에서 빠진다 (행은 남는다)
     ⑤ 사유 없는 취소는 막힌다
     ⑥ 수량 수정이 접수 수량을 넘으면 막힌다
     ⑦ 잠긴 배분은 함수를 직접 불러도 안 된다 (UI 우회 이중 방어)

   실 DB 를 읽지 않는다 — sbGet·fetch 를 막고 화면 동작만 본다.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-dist-cancel.mjs
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
  {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost:8788/'});
const {window} = dom;
window.HTMLCanvasElement.prototype.getContext = function(){const n=()=>{};return{lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n};};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
for (const f of appScripts())
  window.eval(readFileSync(APP + f, 'utf8'));
const W = window, DB = W.DB;

let fail = 0;
const check = (n, ok, got) => {
  console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got)));
  if (!ok) fail++;
};
const wait = () => new Promise(r => setTimeout(r, 0));

/* 실 DB 연결 모양 — sbReady()=true. 실제 호출은 전부 막는다 */
window.eval("SUPABASE_CONFIG = {url:'https://x.supabase.co', key:'k'}; DB_SOURCE = 'Supabase';");
W.sbGet = () => Promise.resolve([]);
let lastPatch = null;
W.fetch = (url, opt) => {
  if (opt && opt.method === 'PATCH') lastPatch = {url:String(url), body:JSON.parse(opt.body)};
  return Promise.resolve({ok:true, status:200, text:()=>Promise.resolve(''),
                          json:()=>Promise.resolve([{id:20}])});
};
W.saveChecklist = () => Promise.resolve({ok:true});

/* 접수 400 · 늘봄 250 + 햇살 150 (합계 400 = 이상 없음) — G13 이 보려던 그 모양 */
function seed(opt){
  opt = opt || {};
  DB.cases.length = 0;
  DB.distEdit = null; DB.distCancel = null; DB.distEditErr = {};
  const r250 = opt.recv250 || {};        /* 늘봄 인수증 상태 */
  const c = {
    id:'275', dbId:75, donor:'(주)한결식품', donorType:'법인', item:'컵라면 종합세트', state:'검수 대기', acqPath:'구매',
    donation:{itemName:'컵라면 종합세트', qty:400, unitPrice:2500, book:1000000, fair:1000000, donorType:'법인'},
    orgId:20, orgName:'늘봄지역아동센터',
    dists:[{id:20, org_name:'늘봄지역아동센터', qty:250},
           {id:21, org_name:'햇살지역아동센터', qty:150}],
    checklist:[
      {key:'inss',       uid:'inss#20',       n:'인수증 · 늘봄',       stage:'배분', kind:'A', included:true, distId:20, r:r250},
      {key:'dist_photo', uid:'dist_photo#20', n:'배분 물품 사진 · 늘봄', stage:'배분', kind:'A', included:true, distId:20, r:{}},
      {key:'inss',       uid:'inss#21',       n:'인수증 · 햇살',       stage:'배분', kind:'A', included:true, distId:21, r:{}}
    ]
  };
  DB.cases.push(c);
  return c;
}

console.log('\n── ① 수취 확정 전 — 고치고 취소할 수 있다 ──');
{
  const c = seed();
  const html = W.distStatusCard(c);
  check('배분 현황 카드가 그려진다', /배분 현황/.test(html));
  check('[수량 수정] 이 있다', /수량 수정/.test(html));
  check('[배분 취소] 가 있다', /배분 취소/.test(html));
  check('잠금 문구는 없다', !/수정·취소할 수 없습니다/.test(html));
  check('합계·접수가 함께 적힌다 (400/400)', /배분 합계 400 \/ 접수 400/.test(html), html.slice(0,200));
  check('distLocked = false', W.distLocked(c, c.dists[0]) === false);
}

console.log('\n── ② 수취 확정된 배분 — 수정·취소가 사라진다 ──');
{
  const c = seed({recv250:{st:'done', date:'2026-09-11', by:'담당자'}});
  check('distLocked = true', W.distLocked(c, c.dists[0]) === true);
  const html = W.distStatusCard(c);
  check('잠금 문구가 뜬다', /물품이 이미 간 것이라 수정·취소할 수 없습니다/.test(html));
  check('늘봄에는 [수량 수정] 이 없다', !/dq-20/.test(html) && !/DB.distEdit=\{id:'20'/.test(html));
  check('햇살(미확정)에는 아직 열려 있다', /DB.distEdit=\{id:'21'/.test(html));
}

console.log('\n── ③ 잠금 기준은 “제출” 이 아니라 “수취 확정” 이다 ──');
{
  /* 배분처가 인수증을 올렸지만 담당자가 아직 확정하지 않은 상태 —
     itemStatus 는 '확인필요(unc)' 다. 잘못 올린 것을 담당자가 바로잡을 길을 남긴다. */
  const c = seed({recv250:{orgUpload:{status:'uploaded', date:'2026-09-11', fileName:'인수증.jpg'}}});
  check('제출만 된 상태의 항목 상태 = unc', W.itemStatus(c.checklist[0]).code === 'unc',
        W.itemStatus(c.checklist[0]).code);
  check('제출만으로는 안 잠긴다', W.distLocked(c, c.dists[0]) === false);
  check('[배분 취소] 가 그대로 있다', /DB.distCancel=\{id:'20'/.test(W.distStatusCard(c)));
}

console.log('\n── ④ 취소하면 합계에서 빠진다 · 행은 남는다 ──');
{
  const c = seed();
  check('취소 전 남은 수량 0', W.distRemainingQty(c) === 0);
  check('취소 전 E7 = 이상 없음', W.checkE7(c).verdict === '이상 없음', W.checkE7(c));
  DB.distCancel = {id:'20', reason:'기관 사정으로 배분 취소 · 재배분 예정'};
  W.confirmCancelDist('275', '20');
  await wait(); await wait();
  check('PATCH 가 cancelled_at 을 보냈다', !!(lastPatch && lastPatch.body.cancelled_at), lastPatch);
  check('PATCH 가 사유를 보냈다',
        !!(lastPatch && lastPatch.body.cancel_reason === '기관 사정으로 배분 취소 · 재배분 예정'), lastPatch);
  check('행은 지워지지 않는다 (2줄 그대로)', c.dists.length === 2, c.dists.length);
  check('distLive = false', W.distLive(c.dists[0]) === false);
  check('남은 수량이 250 되살아난다', W.distRemainingQty(c) === 250, W.distRemainingQty(c));
  check('E7 이 배분 진행 중으로 바뀐다', W.checkE7(c).verdict === '배분 진행 중', W.checkE7(c));
  check('E7 사유에 살아 있는 기관만 센다', /햇살지역아동센터 150/.test(W.checkE7(c).reason) &&
        !/늘봄지역아동센터 250/.test(W.checkE7(c).reason), W.checkE7(c).reason);
  check('배분처 표기에서 빠진다', W.orgLabel(c) === '햇살지역아동센터', W.orgLabel(c));
  check('취소된 줄은 사유와 함께 그려진다',
        /배분 취소/.test(W.distStatusCard(c)) && /재배분 예정/.test(W.distStatusCard(c)));
  check('취소한 기관을 다시 넣을 수 있다 (중복검사에서 빠짐)',
        !W.liveDists(c).some(d => (d.org_name || d.orgName) === '늘봄지역아동센터'));
}

console.log('\n── ⑤ 사유 없는 취소는 막힌다 ──');
{
  const c = seed();
  lastPatch = null;
  DB.distCancel = {id:'20', reason:'   '};
  W.confirmCancelDist('275', '20');
  await wait();
  check('PATCH 를 보내지 않는다', lastPatch === null, lastPatch);
  check('사유를 적으라고 남긴다', /사유/.test((DB.distEditErr || {})['20'] || ''), DB.distEditErr);
  check('배분은 살아 있다', W.distLive(c.dists[0]) === true);
}

console.log('\n── ⑥ 수량 수정 — 접수 수량을 넘을 수 없다 ──');
{
  const c = seed();
  lastPatch = null;
  DB.distEdit = {id:'20', qty:300};        /* 300 + 햇살 150 = 450 > 400 */
  W.saveDistQty('275', '20');
  await wait();
  check('PATCH 를 보내지 않는다', lastPatch === null, lastPatch);
  check('넘는다고 알린다 (양쪽 숫자 포함)',
        /다른 기관 150개 \+ 300개 > 접수 400개/.test((DB.distEditErr || {})['20'] || ''), DB.distEditErr);
  check('수량은 그대로 250', Number(c.dists[0].qty) === 250, c.dists[0].qty);

  DB.distEdit = {id:'20', qty:200};        /* 200 + 150 = 350 ≤ 400 — 통과 */
  W.saveDistQty('275', '20');
  await wait(); await wait();
  check('맞는 값은 저장된다', !!(lastPatch && lastPatch.body.qty === 200), lastPatch);
  check('화면 값도 200', Number(c.dists[0].qty) === 200, c.dists[0].qty);
  check('E7 이 배분 진행 중 (350 < 400)', W.checkE7(c).verdict === '배분 진행 중', W.checkE7(c));
}

console.log('\n── ⑦ 잠긴 배분은 함수를 직접 불러도 안 된다 (UI 우회 이중 방어) ──');
{
  const c = seed({recv250:{st:'done', date:'2026-09-11', by:'담당자'}});
  lastPatch = null;
  DB.distEdit = {id:'20', qty:100};
  W.saveDistQty('275', '20');
  await wait();
  check('수정 PATCH 를 보내지 않는다', lastPatch === null, lastPatch);
  check('수정 거절 사유가 남는다',
        /수취 확정한 배분/.test((DB.distEditErr || {})['20'] || ''), DB.distEditErr);
  check('수량은 그대로 250', Number(c.dists[0].qty) === 250, c.dists[0].qty);

  DB.distEditErr = {};
  DB.distCancel = {id:'20', reason:'되돌리고 싶다'};
  W.confirmCancelDist('275', '20');
  await wait();
  check('취소 PATCH 도 보내지 않는다', lastPatch === null, lastPatch);
  check('취소 거절 사유가 남는다',
        /수취 확정한 배분/.test((DB.distEditErr || {})['20'] || ''), DB.distEditErr);
  check('배분은 살아 있다', W.distLive(c.dists[0]) === true);
}

console.log('\n' + (fail ? '❌ ' + fail + '항목 실패' : '✅ 전부 통과'));
process.exit(fail ? 1 : 0);
