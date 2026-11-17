/* gemini-relay — 구글 Gemini REST 로 **본문을 그대로** 넘기고 답을 **그대로** 돌려주는 릴레이 (2026-09-08 승희)
   ★ 왜 — Gemini API 는 홍콩(HKG)에서 온 요청을 거부한다(400 FAILED_PRECONDITION · User location is not supported).
     Cloudflare Pages Function 은 실행 위치를 못 고른다(9/7 실측: Smart Placement 켜도 HKG↔NRT).
     Supabase Edge Function 은 요청 헤더 `x-region: ap-northeast-2` 로 서울에 고정된다 — 그래서 이 함수가 중간에 선다.
     경로: Cloudflare judge.js(어디든) → 이 함수(서울) → 구글.  판정 로직은 judge.js 에 그대로 있다.

   호출:  {SUPABASE_URL}/functions/v1/gemini-relay/v1beta/models/<model>:generateContent   (POST · 본문 = 구글 형식 그대로)
          {SUPABASE_URL}/functions/v1/gemini-relay/v1beta/models?pageSize=50                (GET · 모델 목록)
          헤더 apikey: <publishable key> · x-region: ap-northeast-2
   허용 경로는 위 둘뿐이다 — 열린 프록시가 되지 않게. 키(GEMINI_API_KEY)는 Supabase secrets 에만 있고 여기서 붙인다.
   ⚠️ 요청 본문은 어떤 경우에도 로그에 찍지 않는다 (영수증 이미지 = 개인정보). */
import { allowed, corsHeaders } from "../_shared/auth.ts";

const GOOGLE = "https://generativelanguage.googleapis.com";
const OK_GET  = /^\/v1beta\/models$/;
const OK_POST = /^\/v1beta\/models\/[A-Za-z0-9._-]+:generateContent$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!allowed(req)) return Response.json({ error: "apikey 불일치" }, { status: 401, headers: corsHeaders });

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return Response.json({ error: "GEMINI_API_KEY 미설정 (supabase secrets)" }, { status: 503, headers: corsHeaders });

  const u = new URL(req.url);
  const path = u.pathname.replace(/^\/gemini-relay/, "");          /* 함수 이름 뒤가 구글 경로 */
  const ok = (req.method === "GET" && OK_GET.test(path)) || (req.method === "POST" && OK_POST.test(path));
  if (!ok) return Response.json({ error: "허용되지 않은 경로", path, method: req.method }, { status: 404, headers: corsHeaders });

  const res = await fetch(GOOGLE + path + u.search, {
    method: req.method,
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: req.method === "POST" ? await req.text() : undefined,   /* 스트림 대신 문자열 — 런타임 차이를 피한다 */
    signal: AbortSignal.timeout(120000),
  });
  /* 상태·본문을 그대로 — judge.js 는 'Gemini HTTP 429' 처럼 구글 상태 번호를 사유에 남겨야 한다 */
  const h = new Headers(corsHeaders);
  h.set("Content-Type", res.headers.get("Content-Type") || "application/json");
  h.set("x-relay-region", Deno.env.get("SB_REGION") || "");        /* 어디서 돌았는지 응답에 남긴다 */
  return new Response(res.body, { status: res.status, headers: h });
});
