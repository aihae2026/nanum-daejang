/* ════════════════════════════════════════════════════════════
   /config.js — 배포본에 Supabase 접속 설정을 내려주는 서버 함수
   2026-09-01 유진 · index.html 한 줄은 선미님 승인

   왜 필요한가 —
     config.local.js 는 키가 들어 있어 gitignore 대상이다(각자 PC에서만 만든다).
     그래서 배포본에는 그 파일이 없고, 화면이 조용히 데모 데이터로 돌아간다.
     ⚠️ 에러가 안 난다 — 잘 도는 것처럼 보여서 제일 알아채기 어려운 실패다.

   ★ 로컬이 이긴다 —
     이미 SUPABASE_CONFIG 가 있으면(=config.local.js 가 먼저 로드됐으면) 덮어쓰지 않는다.
     그래서 각자 PC 설정을 아무도 바꿀 필요가 없고, 배포본에서만 이 값이 쓰인다.

   ⚠️ 이 키는 브라우저에 그대로 노출된다. 숨기는 장치가 아니다 —
     git 에 안 들어가게 하는 것이 목적이다.
     anon 키는 원래 공개돼도 되는 키지만, 그건 RLS 가 있을 때 얘기다.
     지금은 patch-*rls*.sql 의 접근 정책(RLS)이 데이터를 막는다 — 새 환경에서도 패치를 전부 실행해야 한다.
     (2026-09-01 에는 RLS 가 없어 dev 주소에 Cloudflare Access 로 잠금을 걸었었다 · 선미)
     → 브라우저가 키를 아예 안 갖는 구조(서버 함수 경유)가 정답이고,
       재단 이관 안건으로 올려 두었다.

   Cloudflare Pages 환경변수 — 이 파일은 두 개를 읽는다:
     SUPABASE_URL · SUPABASE_ANON_KEY
     (judge.js 가 읽는 것까지 합친 전체 표는 관리자 가이드 5.3)
   ════════════════════════════════════════════════════════════ */

export async function onRequest(context) {
  const { env } = context;
  const url = env.SUPABASE_URL || '';
  const key = env.SUPABASE_ANON_KEY || '';

  /* 값이 없으면 아무것도 정의하지 않는다 — 화면은 데모 데이터로 돈다(지금과 같다).
     ★ 빈 값으로 SUPABASE_CONFIG 를 만들면 sbReady() 가 true 가 되어
       DB에 붙은 줄 알고 실패를 반복한다. 없는 것은 없는 채로 둔다. */
  const body = (url && key)
    ? `window.SUPABASE_CONFIG = window.SUPABASE_CONFIG || ${JSON.stringify({ url, key })};\n`
    : `console.info('[DB] 서버에 SUPABASE_URL·SUPABASE_ANON_KEY 가 없습니다 (config.local.js 가 있으면 그쪽으로 붙습니다)');\n`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      /* 캐시하지 않는다 — 키를 바꿨는데 옛 값이 남아 있으면 원인을 찾기 어렵다 */
      'Cache-Control': 'no-store',
    },
  });
}
