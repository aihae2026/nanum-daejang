/* 릴레이 공통 — apikey 확인 (2026-09-08 승희)
   verify_jwt 를 껐으므로(config.toml) 여기서 직접 막는다.
   허용 키 = 비밀값 RELAY_KEYS(쉼표 구분) ∪ 런타임이 주는 SUPABASE_ANON_KEY.
   우리 앱의 publishable 키는 어차피 브라우저에 공개되는 값이라 "비밀"은 아니다 —
   그래도 아무나 주소만 알고 두드리는 것은 막는다(Cloudflare /judge 와 같은 수준). */
export function allowedKeys(): Set<string> {
  const s = new Set<string>();
  for (const k of (Deno.env.get("RELAY_KEYS") || "").split(",")) if (k.trim()) s.add(k.trim());
  const anon = Deno.env.get("SUPABASE_ANON_KEY"); if (anon) s.add(anon);
  /* 런타임이 주는 publishable 키 목록(형식이 JSON 이든 쉼표든) — Cloudflare 쪽 SUPABASE_ANON_KEY 가 어느 publishable 키여도 통과 */
  for (const k of (Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "").match(/sb_publishable_[A-Za-z0-9_-]+/g) || []) s.add(k);
  return s;
}
export function allowed(req: Request): boolean {
  const k = req.headers.get("apikey") || "";
  return !!k && allowedKeys().has(k);
}
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-region, x-client-info",
};
