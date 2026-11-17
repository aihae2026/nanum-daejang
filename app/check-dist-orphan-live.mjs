/* 배분 항목이 기관을 잃은 건을 찾는다 — 읽기만 한다 (2026-09-13 · #323 유진 실주행)

   ★ 무엇을 찾나 — checklist_item 중 stage='배분' 인데 distribution_id 가 NULL 인 행.
     그 행은 어느 기관 것인지 DB 가 모른다. 기관 링크는 orgSlots 가 distId 로 좁히므로
     **자기 몫 슬롯을 0개로 본다** — 기관이 링크를 열어 제출해도 아무것도 안 남는다.
     담당자 화면에는 distribution_id 가 제대로 붙은 기관 것만 보인다(#323 증상).

   ★ 원인은 고쳤다 (db.js saveChecklist · 2026-09-13) — 배분처가 DB 에 저장되기 전의 항목은
     이제 보내지 않고 미룬다. 이 스크립트는 **그 전에 이미 들어간 행**을 찾는 자리다.

   ★ 되살릴 근거 — 배분 서류는 기관마다 [인수증 · 배분 물품 사진 · 배분 결과보고서] 세 줄이
     한 번에 들어간다(DIST_DOCS). 그래서 NULL 행은 id 순으로 **세 줄씩 한 기관**이고,
     기관 추가 순서 = distribution.id 순서다. 그 둘을 차례로 짝지어 제안한다.
   ⚠️ 제안일 뿐이다. 고치는 SQL 을 찍어 주되 **실행하지 않는다** — 사람이 보고 판단한다.
     (DB 패치 실행 대장 규칙 · (미공개 내부 기록))

   돌리는 법:  STAFF_EMAIL=… STAFF_PASSWORD=… node check-dist-orphan-live.mjs
               (또는 app/staff.local.json)
*/
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { staffCredentials } from './test-staff-login.mjs';

const APP = fileURLToPath(new URL('./', import.meta.url));
if (!existsSync(APP + 'config.local.js')){
  console.log('⏭ 건너뜀 — config.local.js 가 없습니다'); process.exit(0);
}
const cfg = readFileSync(APP + 'config.local.js', 'utf8');
const URL_ = /url:\s*'([^']+)'/.exec(cfg)[1].replace(/\/+$/, '');
const ANON = /key:\s*'([^']+)'/.exec(cfg)[1];

const cred = staffCredentials();
if (!cred){
  console.log('⏭ 건너뜀 — 담당자 로그인 자격이 없습니다.');
  console.log('   권한 3단계부터 anon 은 원장을 못 읽습니다 — STAFF_EMAIL·STAFF_PASSWORD 또는 staff.local.json (test-staff-login.mjs 머리말).');
  process.exit(0);
}
const auth = await fetch(URL_ + '/auth/v1/token?grant_type=password', {
  method:'POST', headers:{apikey:ANON, 'Content-Type':'application/json'},
  body: JSON.stringify({email:cred.email, password:cred.password})
}).then(r => r.json());
if (!auth.access_token){ console.log('❌ 담당자 로그인 실패 — ' + JSON.stringify(auth).slice(0,200)); process.exit(1); }
console.log(`🔐 담당자로 로그인 (${cred.from} · ${cred.email})`);

const H = { apikey: ANON, Authorization: 'Bearer ' + auth.access_token };
const get = async (p) => {
  const r = await fetch(URL_ + '/rest/v1/' + p, { headers: H });
  if (!r.ok) throw new Error(p + ' → ' + r.status + ' ' + (await r.text()).slice(0, 300));
  return r.json();
};

/* 기관을 잃은 배분 항목 */
const orphans = await get('checklist_item?select=id,donation_id,doc_key,doc_name,stage,included,status'
  + '&stage=eq.' + encodeURIComponent('배분') + '&distribution_id=is.null&order=donation_id.asc,id.asc');
if (!orphans.length){ console.log('\n✅ 기관을 잃은 배분 항목이 없습니다.'); process.exit(0); }

const byDon = {};
orphans.forEach(o => { (byDon[o.donation_id] = byDon[o.donation_id] || []).push(o); });
const donIds = Object.keys(byDon);
const dons = await get('donation?select=id,case_no,state&id=in.(' + donIds.join(',') + ')&order=case_no.asc');
const caseNoOf = {}; dons.forEach(d => { caseNoOf[d.id] = d.case_no; });

console.log(`\n❗ 기관을 잃은 배분 항목 ${orphans.length}건 · 건 ${donIds.length}개`);
const sql = [];
for (const d of dons){
  const rows = byDon[d.id];
  const dists = await get(`distribution?select=id,org_name,qty,cancelled_at&donation_id=eq.${d.id}&order=id.asc`);
  const items = await get(`checklist_item?select=id,distribution_id,doc_key&donation_id=eq.${d.id}&stage=eq.${encodeURIComponent('배분')}&order=id.asc`);
  const haveItems = new Set(items.filter(i => i.distribution_id != null).map(i => String(i.distribution_id)));
  const needy = dists.filter(x => !haveItems.has(String(x.id)));      /* 항목이 하나도 없는 배분처 */

  console.log(`\n── #${d.case_no} (donation ${d.id} · ${d.state}) ──`);
  console.log('   배분처: ' + dists.map(x => `${x.id}=${x.org_name}${x.cancelled_at ? '(취소)' : ''}${haveItems.has(String(x.id)) ? ' ✅항목있음' : ' ⚠️항목없음'}`).join(' · '));
  console.log('   기관을 잃은 항목: ' + rows.map(r => `${r.id}:${r.doc_key}`).join(' · '));

  /* 세 줄씩 한 기관 — 'inss' 가 한 벌의 시작이다 */
  const groups = [];
  rows.forEach(r => { if (r.doc_key === 'inss' || !groups.length) groups.push([]); groups[groups.length - 1].push(r); });
  if (groups.length !== needy.length){
    console.log(`   ⚠️ 짝이 안 맞습니다 — 잃은 묶음 ${groups.length}개 · 항목 없는 배분처 ${needy.length}곳. 손으로 확인해 주세요.`);
    continue;
  }
  groups.forEach((g, i) => {
    console.log(`   제안: [${g.map(r => r.doc_key).join(', ')}] → ${needy[i].id} (${needy[i].org_name})`);
    sql.push(`update checklist_item set distribution_id = ${needy[i].id}`
           + ` where id in (${g.map(r => r.id).join(', ')});   -- #${d.case_no} ${needy[i].org_name}`);
    /* 인수증 제출본도 같이 잃었을 수 있다 — 있으면 함께 적어 준다 */
  });
}

if (sql.length){
  console.log('\n────────── 고치는 SQL (검토 후 직접 실행하세요 — 이 스크립트는 쓰지 않습니다) ──────────');
  console.log('begin;');
  sql.forEach(l => console.log('  ' + l));
  console.log('commit;');
  console.log('\n⚠️ 실행 전에 위 "제안" 줄의 기관 짝이 맞는지 담당자가 확인해 주세요.');
  console.log('⚠️ 실행 뒤에는 기관마다 증빙 제출 링크를 **다시 발급**해야 합니다 — 기관들이 연 링크는 빈 폼이었습니다.');
}
