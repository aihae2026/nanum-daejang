/* 패치가 실 DB 에 반영됐는지 확인한다 (2026-09-02 유진)

   ★ 왜 필요한가 — "패치 파일이 있다" 와 "실 DB 에서 돌았다" 는 다르다.
     팀이 9/1 에 그 구분을 못 해 하나가 목록에서 빠졌고, 그래서 실행 대장이 생겼다.
     그런데 대장도 사람이 손으로 적는다 — 9/2 에 두 개가 대장에서 빠졌다.
     **DB 에게 직접 물어보는 것이 유일하게 안 틀리는 방법이다.**

   ⚠️ 행을 만들지 않는다. RLS 에 delete 정책이 없어 되돌릴 수 없기 때문이다.

   ★ 두 가지 모드가 있다 (2026-09-02 선미 요청)
       기본       — **아무것도 쓰지 않는다.** 조회만으로 알 수 있는 것만 본다(칸이 있나).
                    급히 한 번 볼 때 쓴다. 실 DB 를 스치는 횟수를 줄이는 것이 목적이다.
       --deep     — check 제약까지 본다. 제약은 조회로 알 수 없어서
                    기존 행을 잠깐 바꿨다가 **반드시 되돌린다.**

     선미 판단: "실 DB 를 스치는 횟수 자체를 줄이는 게 낫다". 맞는 말이라 기본을 조회로 돌렸다.
     ⚠️ 대신 기본 모드는 **제약을 확인하지 못한다** — 그 사실을 화면에 적는다.
        "확인 안 함" 을 "이상 없음" 으로 읽으면 대장을 사람이 적던 때와 똑같아진다.

   돌리는 법:  node check-patches-live.mjs          (조회만)
              node check-patches-live.mjs --deep   (제약까지 · 잠깐 쓰고 되돌림)
*/
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';   /* ⚠️ .pathname 은 한글 폴더를 %ED… 로 인코딩해 파일을 못 찾는다 (2026-09-05 집 PC 실측) */
const APP = fileURLToPath(new URL('./', import.meta.url));
const cfg = readFileSync(APP + 'config.local.js', 'utf8');
const U = cfg.match(/url:\s*'([^']+)'/)[1], K = cfg.match(/key:\s*'([^']+)'/)[1];
const H = {apikey:K, Authorization:'Bearer ' + K};
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let fail = 0;
const check = (n, ok, got) => { console.log((ok?'  ✅ ':'  ❌ ')+n+(ok?'':'   ← '+String(got).slice(0,120))); if(!ok)fail++; };

/* ① checklist_item 에 해소 칸이 있나 — select 로 물어보면 없으면 에러가 온다 */
let r = await fetch(`${U}/rest/v1/checklist_item?select=id,resolution_reason,resolved_by,resolved_at&limit=1`, {headers:H});
let body = await r.text();
check('★ checklist_item 에 사유해소 3칸이 있다 (patch-checklist-resolution)',
      r.ok, r.status + ' ' + body);

/* ①-2 파기 패치가 돌았나 (patch-20260904-purge · 2026-09-04 선미)
   ★ 조회만으로 셋을 볼 수 있다 — 칸 · 뷰 · 빈칸.
     delete 정책과 Storage 정책은 PostgREST 로 못 본다(pg_policies 는 REST 에 안 뜬다).
     그건 SQL Editor 에서 본다 — (미공개 내부 기록).
   ⚠️ 여기서 초록이라고 "파기가 다 된다" 가 아니다. **정책은 확인 안 했다.** */
r = await fetch(`${U}/rest/v1/donation?select=id,purge_due,purged_at&limit=1`, {headers:H});
body = await r.text();
check('★ donation 에 파기 예정일·파기시각 칸이 있다 (patch-20260904-purge)',
      r.ok, r.status + ' ' + body);

r = await fetch(`${U}/rest/v1/purge_candidates?select=id&limit=1`, {headers:H});
body = await r.text();
check('★ 파기 대상 조회(purge_candidates)가 있다', r.ok, r.status + ' ' + body);

/* ⚠️ 파기 예정일이 빈 건이 있으면 그 건은 파기 대상 조회에서 **통째로 빠진다** —
     에러가 아니라 목록에서 사라지는 모양이라 아무도 못 본다(조용한 실패). */
r = await fetch(`${U}/rest/v1/donation?select=id&purge_due=is.null`, {headers:H});
const noDue = r.ok ? await r.json() : null;
check('★★ 파기 예정일이 빈 건이 없다 (비면 파기 대상에서 조용히 빠진다)',
      Array.isArray(noDue) && noDue.length === 0,
      Array.isArray(noDue) ? noDue.length + '건 — id ' + noDue.slice(0,5).map(x=>x.id).join(',') : '조회 실패');

console.log('  ⏭ delete 정책·Storage 정책은 확인하지 않았습니다 (REST 로는 못 봅니다)');
console.log('     SQL Editor 에서 봅니다 — (미공개 내부 기록)');

/* ② donation.state 가 '제출 대기' 를 받나
     PostgREST 는 check 제약을 조회로 알려주지 않는다 — 쓰지 않고는 알 수 없다.
     그래서 기본 모드에서는 **확인하지 않는다**. --deep 일 때만 본다. */
const DEEP = process.argv.includes('--deep');
if (!DEEP){
  console.log('  ⏭ donation.state 제약은 확인하지 않았습니다 (조회로는 알 수 없습니다)');
  console.log('     확인하려면:  node check-patches-live.mjs --deep');
  console.log('     ⚠️ "확인 안 함" 은 "이상 없음" 이 아닙니다.');
  console.log(fail ? `\n❌ ${fail}건 — 패치가 아직 안 돌아갔습니다` : '\n✅ 조회로 볼 수 있는 것은 다 반영돼 있습니다');
  process.exit(fail ? 1 : 0);
}
r = await fetch(`${U}/rest/v1/donation?select=id,state&order=id&limit=1`, {headers:H});
const rows = await r.json();
const one = rows && rows[0];
if (!one) { console.log('  (donation 행이 없어 확인 불가)'); }
else {
  const before = one.state;
  const put = (v) => fetch(`${U}/rest/v1/donation?id=eq.${one.id}`, {
    method:'PATCH', headers:{...H,'Content-Type':'application/json',Prefer:'return=representation'},
    body: JSON.stringify({state:v})});
  let res = await put('제출 대기');
  const txt = await res.text();
  check("★ donation.state 가 '제출 대기' 를 받는다 (patch-donation-state)",
        res.ok, res.status + ' ' + txt);
  await put(before);   /* 반드시 되돌린다 */
  const back = await (await fetch(`${U}/rest/v1/donation?select=state&id=eq.${one.id}`, {headers:H})).json();
  check('   되돌렸다 (실 DB 를 어지르지 않았다)', back[0].state === before, back[0]);
}
/* ③ 가린 이름 패치가 돌았나 (patch-20260906-donor-name-mask · 2026-09-06 선미)
     ★ 원래 제약은 "법인 외는 donor_name IS NULL" 이라 가린 이름도 못 들어간다.
       패치를 안 돌린 채 화면 코드만 켜면 **접수 링크 발송이 400 으로 실패한다**
       (9/6 dev 에서 #220 이 그렇게 됐다). 그래서 여기서 미리 본다.
     ★ 실명은 패치 뒤에도 거부돼야 한다 — 보호를 없앤 것이 아니라 옮긴 것이다. */
console.log('\n[③ 법인 외 가린 이름 — patch-20260906-donor-name-mask]');
const indiv = (await (await fetch(
  `${U}/rest/v1/donation?select=id,donor_name&donor_type=eq.%EB%B2%95%EC%9D%B8%EC%99%B8&limit=1`,
  {headers:H})).json())[0];
if (!indiv) console.log('  ⏭  법인 외 건이 없어 건너뜁니다');
else {
  const was = indiv.donor_name;
  const set = (v) => fetch(`${U}/rest/v1/donation?id=eq.${indiv.id}`, {
    method:'PATCH', headers:{...H,'Content-Type':'application/json',Prefer:'return=representation'},
    body: JSON.stringify({donor_name:v})});
  const rMask = await set('홍○동');
  const tMask = await rMask.text();
  check('★ 가린 이름을 받는다 (패치가 돌았다)', rMask.ok, rMask.status + ' ' + tMask.slice(0, 160));
  const rReal = await set('홍길동');
  check('★ 실명은 여전히 거부한다 (보호가 살아 있다)', !rReal.ok, rReal.status);
  await set(was);   /* 반드시 되돌린다 */
  const back = await (await fetch(`${U}/rest/v1/donation?select=donor_name&id=eq.${indiv.id}`, {headers:H})).json();
  check('   되돌렸다 (실 DB 를 어지르지 않았다)', (back[0].donor_name || null) === (was || null), back[0]);
}

console.log(fail ? `\n❌ ${fail}건 — 패치가 아직 안 돌아갔습니다` : '\n✅ 패치가 다 반영돼 있습니다');
