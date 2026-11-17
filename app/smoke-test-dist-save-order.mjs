/* 다기관 배분 — 기관을 잇달아 추가해도 항목이 자기 배분처에 붙는가 (2026-09-13 · #323 유진 실주행)

   ★ 무엇이 났나 — 유진 과장님이 #323 에 배분처를 여러 곳 지정하고 기관마다 링크를 보냈다.
     기관들은 다 제출했는데 담당자 화면에는 **한 곳(햇살지역아동센터) 것만** 보였다.

   ★ 왜 — [배분결정]은 배분처를 DB 에 저장한 뒤(saveDistribution → remapDistUid)
     saveChecklist 를 부른다. 그런데 saveChecklist 는 **dbId 없는 항목을 전부** 보냈다.
     담당자가 기관을 잇달아 추가하면 앞 기관의 저장이 끝나는 시점에 뒤 기관 항목이
     아직 화면 임시 id('sd2')인 채로 함께 실렸고, itemToRow 가 그것을 NULL 로 떨어뜨렸다
     (FK 를 지키려는 의도된 방어였다 — 막아야 할 자리가 여기가 아니었을 뿐이다).
     한 번 들어가면 dbId 가 붙어 다음 저장에서 빠지므로 **영영 고쳐지지 않는다.**

   ★ 무엇이 무너지나 — orgSlots 는 링크의 distId 로 자기 몫만 좁힌다(개인정보 분리).
     그래서 distribution_id 가 NULL 인 기관은 링크를 열어도 **슬롯이 0개**다.
     기관은 빈 제출을 하고, 담당자는 "안 왔다"고 본다 — 인수인계 §2① 의 제일 나쁜 모양이다.

   ⚠️ 이 검사는 **저장되는 값**을 본다. 화면만 보면 통과한다 —
     메모리에서는 세 기관이 다 멀쩡했다(그래서 눈으로는 안 잡혔다).

   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-dist-save-order.mjs
*/
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';   /* ⚠️ .pathname 은 한글 폴더를 %ED… 로 인코딩한다 */
import { appScripts } from './app-scripts.mjs';
const require = createRequire(process.env.JSDOM_FROM
  ? process.env.JSDOM_FROM.replace(/\/?$/, '/') + 'package.json'
  : new URL('../prototype/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const APP = fileURLToPath(new URL('./', import.meta.url));
const dom = new JSDOM(readFileSync(APP + 'index.html', 'utf8'),
  {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost:8788/'});
const {window:W} = dom;
W.HTMLCanvasElement.prototype.getContext = function(){const n=()=>{};return{lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n};};
W.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
for (const f of appScripts()) W.eval(readFileSync(APP + f, 'utf8'));

let fail = 0;
const check = (n, ok, got) => {
  console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got)));
  if (!ok) fail++;
};

/* ── 가짜 DB — 배분처 저장에 네트워크 왕복만큼의 시간이 걸리게 한다.
     즉시 끝나면 이 버그는 재현되지 않는다. 늦게 오는 것이 사고의 조건이었다. */
W.SUPABASE_CONFIG = {url:'https://smoke.supabase.co', key:'smoke-key'};
let distSeq = 100, itemSeq = 500;
const postedItems = [];
W.sbPost = function(table, rows){
  if (table === W.T.distribution)
    return new Promise(res => setTimeout(() => res(rows.map(() => ({id: ++distSeq}))), 30));
  if (table === W.T.checklistItem){
    rows.forEach(r => postedItems.push({docKey:r.doc_key, stage:r.stage, distId:r.distribution_id}));
    return Promise.resolve(rows.map(() => ({id: ++itemSeq})));
  }
  return Promise.resolve(rows.map(() => ({id: ++itemSeq})));
};
W.retireChecklistItems = () => Promise.resolve({ok:true});

const c = W.DB.cases.find(x => x.donation && x.donation.qty >= 3);
c.dbId = 9001; c.state = '검수'; c.orgId = null; c.orgName = ''; c.dists = []; c.distSeq = 0;
c.checklist = c.checklist.filter(it => it.stage !== '배분');
c.checklist.forEach((it, i) => { it.r.st = 'done'; it.dbId = 400 + i; });   /* 접수 서류는 이미 저장·수취됨 */

const ORGS = ['늘봄지역아동센터', '햇살지역아동센터', '행복복지관'];
console.log('\n[담당자가 기관 세 곳을 잇달아 추가한다 — 앞 기관 저장이 끝나기 전에]');
for (const nm of ORGS){
  W.DB.distForm = {caseId:c.id, orgName:nm, qty:'1', memo:''};
  W.decideDist(c.id);
}
await new Promise(r => setTimeout(r, 500));

console.log('\n[DB 에 실제로 들어간 값]');
const distRows = postedItems.filter(r => r.stage === '배분');
check('배분 항목이 기관 수만큼 저장됐다 (3기관 × 3서류)', distRows.length === ORGS.length * 3, distRows.length);
const orphan = distRows.filter(r => r.distId == null);
check('★ distribution_id 가 NULL 인 배분 항목이 없다 (있으면 그 기관은 영영 자기 몫을 못 본다)',
      orphan.length === 0, orphan);
const byDist = {};
distRows.forEach(r => { byDist[r.distId] = (byDist[r.distId] || 0) + 1; });
check('기관마다 서류 3종이 한 벌씩 붙었다', Object.keys(byDist).length === ORGS.length
      && Object.keys(byDist).every(k => byDist[k] === 3), byDist);

console.log('\n[그 값으로 되읽었을 때 — 기관 링크가 자기 몫을 보는가]');
/* DB 가 돌려줄 모습대로 화면 항목의 distId 를 맞춘다(rowToItem 이 하는 일) */
W.distItems(c).forEach((it, i) => {
  it.distId = distRows[i].distId;
  it.uid = it.key + (it.distId ? '#' + it.distId : '');
});
for (const d of c.dists){
  W.DB.linkEntry = {distId: d.id};
  const n = W.orgSlots(c).length;
  check('  ' + d.orgName + ' 링크가 자기 몫 슬롯 3개를 본다', n === 3, n);
}
W.DB.linkEntry = null;

console.log('\n[담당자 화면 — 기관이 다 드러나는가]');
const groups = W.orgGroups(c);
check('기관 묶음이 ' + ORGS.length + '개다 (한 곳만 보이던 것이 #323 증상)',
      groups.length === ORGS.length, groups.map(g => g.name));

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
