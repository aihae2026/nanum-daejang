/* /config 서버함수 검사 — 2026-09-01 유진

   확인하는 것은 하나다: **로컬 설정이 서버 값보다 이기는가.**
   이게 성립해야 각자 PC의 config.local.js 를 아무도 안 바꿔도 되고,
   배포본에서만 환경변수 값이 쓰인다.

   ⚠️ 주소는 /config 다. Pages Functions 는 파일명에서 .js 를 뗀다
     (functions/judge.js → /judge 와 같다). /config.js 로 부르면 404 다 — 실측으로 잡았다.

   돌리는 법 (로컬 서버 두 개가 필요하다):
     # ① 환경변수 있는 서버
     set -a && . ../prototype/.env && set +a
     npx wrangler@latest pages dev . --port 8790 \
       --binding SUPABASE_URL="$SUPABASE_URL" SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"
     # ② 환경변수 없는 서버
     npx wrangler@latest pages dev . --port 8791
     node smoke-test-config.mjs
*/
const APP='http://localhost:8790';
const serverJs = await fetch(APP + '/config').then(r => r.text());
let fail = 0;
const check=(n,ok,got)=>{console.log((ok?'  ✅ ':'  ❌ ')+n+(ok?'':'   ← '+JSON.stringify(got))); if(!ok)fail++;};

console.log('\n[① 로컬 설정이 있을 때 — 각자 PC]');
{
  const w = {};
  /* config.local.js 가 먼저 로드된 상태 */
  w.SUPABASE_CONFIG = { url:'https://로컬.supabase.co', key:'로컬키' };
  new Function('window', serverJs)(w);
  check('★ 로컬 값이 그대로 남는다 (서버가 안 덮어쓴다)',
        w.SUPABASE_CONFIG.url === 'https://로컬.supabase.co', w.SUPABASE_CONFIG.url);
}

console.log('\n[② 로컬 설정이 없을 때 — 배포본]');
{
  const w = {};
  new Function('window', serverJs)(w);
  check('★ 서버 값이 들어온다', !!(w.SUPABASE_CONFIG && w.SUPABASE_CONFIG.url), w.SUPABASE_CONFIG);
  check('  주소가 Supabase 프로젝트 주소다 (https://<your-project-ref>.supabase.co 형태)',
        /^https:\/\/[a-z0-9-]+\.supabase\.co/.test((w.SUPABASE_CONFIG||{}).url||''), (w.SUPABASE_CONFIG||{}).url);
  check('  키도 함께 온다', !!(w.SUPABASE_CONFIG||{}).key, null);
}

console.log('\n[③ 환경변수가 없는 서버 — 빈 값을 만들지 않는다]');
{
  const empty = await fetch('http://localhost:8791/config').then(r => r.text());
  const w = {};
  new Function('window', empty)(w);
  check('★ SUPABASE_CONFIG 를 아예 안 만든다 (빈 값으로 만들면 DB에 붙은 줄 알고 실패를 반복한다)',
        w.SUPABASE_CONFIG === undefined, w.SUPABASE_CONFIG);
}
console.log(fail ? `\n❌ 실패 ${fail}건` : '\n✅ 전부 통과');
process.exit(fail?1:0);
