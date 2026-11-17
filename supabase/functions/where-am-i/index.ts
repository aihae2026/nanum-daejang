/* where-am-i — "이 함수가 어느 리전에서 돌았나 + 거기서 Gemini 가 답하나" 10분 확인 함수 (2026-09-08 승희)
   ★ 왜 — x-region 서울 고정은 문서로만 알고 실측 전이다. 릴레이(gemini-relay)를 붙이기 전에
     여기서 초록이 나야 한다. 9/6 Cloudflare `/ai-check` 와 같은 발상.
   호출:  GET {SUPABASE_URL}/functions/v1/where-am-i   헤더 apikey: <publishable key> · x-region: ap-northeast-2
   답:    { region, executionId, gemini: { ok, status, ms, sample } }
   ⚠️ 키는 어떤 경우에도 응답에 싣지 않는다 — 있는지(bool)와 길이만.
   ⚠️ 점검용이다 — 운영에는 배포하지 말 것. 공개 키만으로 누구나 호출할 수 있어 기관 Gemini 키의 요금·한도를 쓴다(관리자 가이드 6.1). */
import { allowed, corsHeaders } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!allowed(req)) return Response.json({ error: "apikey 불일치" }, { status: 401, headers: corsHeaders });

  const key = Deno.env.get("GEMINI_API_KEY") || "";
  const t0 = Date.now();
  let gemini: Record<string, unknown>;
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=5",
      { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(15000) });
    const text = await r.text();
    gemini = { ok: r.ok, status: r.status, ms: Date.now() - t0, sample: text.slice(0, 200) };
  } catch (e) {
    gemini = { ok: false, status: null, ms: Date.now() - t0, error: String((e as Error)?.message || e) };
  }
  return Response.json({
    at: new Date().toISOString(),
    region: Deno.env.get("SB_REGION") || null,          /* 실행 리전 — 서울이면 ap-northeast-2 */
    executionId: Deno.env.get("SB_EXECUTION_ID") || null,
    requestedRegion: req.headers.get("x-region"),
    key: { present: !!key, length: key.length },
    gemini,
  }, { headers: corsHeaders });
});
