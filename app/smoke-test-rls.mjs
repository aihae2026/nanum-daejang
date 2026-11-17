/* RLS — anon(공개 키) 위협 모델 (2026-09-08 승희 · 권한 3단계 "링크는 자기 건만" 이후로 갱신)

   ★ 이 검사는 로그인하지 않는다 — 배포본에 박힌 publishable(anon) 키만 쓴다.
     즉 "키를 아는 외부인·후원자 링크가 무엇을 할 수 있나"를 본다.

   ★ 확인하는 것 다섯 (3단계 patch-20260908-rls-link-scope.sql 기준)
     ⓪ anon 은 **링크 없이는 아무 건도 못 읽는다** — 키만 아는 외부인은 0건 (Cloudflare Access 를 떼는 근거)
     ① 링크 토큰 해시를 x-link-token 으로 실으면 **그 건 하나만** 읽는다 (LINK_HASH 환경변수 · 없으면 건너뜀)
     ② anon 은 담당자 전용 쓰기(inspection insert)를 못 한다
     ③ anon 이 access_link 의 잠금 칸(revoked)은 못 고친다 — used_at·recipient_enc 만 열려 있다
     ④ 삭제는 여전히 막힌다 (테이블 delete 정책 0)

   ⚠️ ②③④를 상태코드로만 판단하지 않는다. RLS 는 '거부'가 아니라 '보이는 행이 없음'으로도
     동작해서 DELETE·UPDATE 가 성공 코드(2xx)를 돌려줄 수 있다. **행/값이 실제로 바뀌었는지**로 본다.

   ★ 담당자(authenticated) 쓰기가 되는지는 여기서 안 본다 — 로그인 비밀번호가 필요해서다.
     그쪽은 psql role 매트릭스(scratchpad/py/dryrun.py · 9/8 실측)와 dev 로그인 한 바퀴로 확인한다.

   ⚠️ 실제 Supabase 에 붙는다(읽기 위주 · 새 행을 만들지 않는다). config.local.js 가 있어야 한다.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-rls.mjs
              LINK_HASH=<access_link.token_hash> 를 주면 ① 도 돈다 (소유자가 DB 에서 꺼낸다 · 원문 토큰 아님)
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
const dom=new JSDOM(readFileSync(APP+'index.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost:8788/'});
const {window}=dom;
window.HTMLCanvasElement.prototype.getContext=function(){const n=()=>{};return{lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n};};
window.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,S';
for(const f of appScripts({ config: true }))
  window.eval(readFileSync(APP+f,'utf8'));
window.fetch=(u,o)=>fetch(u,o);
let fail=0; const check=(n,ok,got)=>{console.log((ok?'  ✅ ':'  ❌ ')+n+(ok?'':'   ← '+JSON.stringify(got))); if(!ok)fail++;};

const U = window.SUPABASE_CONFIG.url, K = window.SUPABASE_CONFIG.key;
const H = {apikey:K, Authorization:'Bearer '+K};   /* 로그인 안 함 → anon */
const count = (t) => fetch(`${U}/rest/v1/${t}?select=id`, {headers:{...H,Prefer:'count=exact',Range:'0-0'}})
  .then(r => Number((r.headers.get('content-range')||'/0').split('/')[1]));

console.log('\n[⓪ anon 은 링크 없이는 아무 건도 못 읽는다 — 키만 아는 외부인]');
const c0 = await count('donation');
console.log(`   anon · 헤더 없음 → donation ${c0}건`);
check('★ 링크 없는 anon 은 donation 0건 (Access 없이도 밖에서 원장이 안 읽힌다)', c0 === 0, c0);
for (const t of ['attachment','form_submission','access_link']){
  const n = await count(t); check(`   ${t} 도 0건`, n === 0, n);
}
await window.loadCasesFromSupabase();
check('   loadCasesFromSupabase 는 0건이어도 "실 DB" 로 본다 (DB_SOURCE = Supabase · 데모로 안 떨어진다 · 9/8 선미 발견)', window.DB_SOURCE === 'Supabase' && window.DB.cases.length === 0, {src: window.DB_SOURCE, n: window.DB.cases.length});

console.log('\n[① 링크 토큰이 있으면 그 건 하나만 읽는다]');
const LH = process.env.LINK_HASH;
let c = null;
if (!LH){ console.log('   (LINK_HASH 없음 — 건너뜀. 9/8 psql 매트릭스: 헤더 있으면 donation 1행·하위만)'); }
else {
  window.LINK_TOKEN_HASH = LH;          /* 주소의 ?t= 대신 해시를 직접 꽂는다 — sbHeaders 가 x-link-token 으로 싣는다 */
  await window.loadCasesFromSupabase();
  c = window.DB.cases.find(x => x.dbId);
  check('★ 링크 헤더로는 건이 정확히 1건', window.DB.cases.length === 1 && !!c, window.DB.cases.length);
  check('   DB_SOURCE 가 Supabase 다', window.DB_SOURCE === 'Supabase', window.DB_SOURCE);
  const c1 = await fetch(`${U}/rest/v1/donation?select=id`, {headers:{...H,'x-link-token':LH}}).then(r=>r.json());
  check('   REST 직접 호출도 1행', Array.isArray(c1) && c1.length === 1, c1);
  window.LINK_TOKEN_HASH = null;
}
if (!c){ c = { dbId: 1 }; }   /* 아래 ②는 행이 안 늘어나는 것만 본다 — 어느 건이든 무관 */

console.log('\n[② anon 은 판정(inspection)을 못 넣는다 — 담당자 전용]');
const insBefore = await count('inspection');
const K_I = window.COL.inspection;
const row = {}; row[K_I.donationId] = c.dbId; row[K_I.rubricVersion] = 'rls-probe';
const post = await fetch(`${U}/rest/v1/inspection`, {method:'POST',
  headers:{...H,'Content-Type':'application/json',Prefer:'return=minimal'}, body:JSON.stringify([row])});
const insAfter = await count('inspection');
console.log(`   POST inspection → HTTP ${post.status} · inspection ${insBefore} → ${insAfter}`);
check('★ anon 의 판정 insert 가 막힌다 (행이 안 는다)', insAfter === insBefore, {insBefore, insAfter});
check('  ⚠️ 상태코드가 아니라 행 수로 본다 (참고용 status)', post.status === 401 || post.status === 403 || insAfter === insBefore, post.status);

console.log('\n[③ anon 은 access_link 의 잠금 칸을 못 고친다 — used_at·recipient_enc 만 열려 있다]');
const link = await fetch(`${U}/rest/v1/access_link?select=id,revoked&limit=1&order=id.desc`, {headers:H}).then(r=>r.json());
if (!link.length){ console.log('   (3단계: 링크 없는 anon 에겐 access_link 가 0행 — 읽히지 않으니 고칠 수도 없다 · 건너뜀)'); check('★ access_link 가 밖에서 안 읽힌다', true); }
else {
  const id = link[0].id, was = link[0].revoked;
  await fetch(`${U}/rest/v1/access_link?id=eq.${id}`, {method:'PATCH',
    headers:{...H,'Content-Type':'application/json'}, body:JSON.stringify({revoked: !was})});
  const now = await fetch(`${U}/rest/v1/access_link?select=revoked&id=eq.${id}`, {headers:H}).then(r=>r.json());
  console.log(`   revoked ${was} → 뒤집기 시도 → 지금 ${now[0] && now[0].revoked}`);
  check('★ revoked 가 안 바뀐다 (컬럼 grant 가 used_at 만 연다)', now[0] && now[0].revoked === was, now[0]);
}

console.log('\n[④ 삭제는 막혀 있다 (테이블 delete 정책 0)]');
const rows = await fetch(`${U}/rest/v1/attachment?select=id&order=id.desc&limit=1`, {headers:H}).then(r => r.json());
if (!rows.length){ console.log('   (3단계: 링크 없는 anon 에겐 attachment 가 0행 · 건너뜀)'); check('★ attachment 가 밖에서 안 읽힌다', true); }
else {
  const id = rows[0].id;
  const del = await fetch(`${U}/rest/v1/attachment?id=eq.${id}`, {method:'DELETE', headers:H});
  const still = await fetch(`${U}/rest/v1/attachment?select=id&id=eq.${id}`, {headers:H}).then(r => r.json());
  console.log(`   행 ${id} 삭제 시도 → HTTP ${del.status} · 남아 있나: ${still.length === 1}`);
  check('★ 삭제해도 행이 그대로 남는다', still.length === 1, still);
}

console.log(fail ? `\n❌ 실패 ${fail}건` : '\n✅ 전부 통과');
process.exit(fail?1:0);
