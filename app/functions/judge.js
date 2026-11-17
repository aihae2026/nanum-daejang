/* ════════════════════════════════════════════════════════════
   judge.js — AI 검수 서버함수 · 담당: 유진 (인수인계 → 선미)

   2026-08-28 이식 완료:
   ✅ 1. Vercel → Cloudflare Pages Functions 형식
         handler(req,res) → onRequest(context) · process.env → context.env
         res.status().json() → new Response()
   ✅ 2. 출력값을 AI 전용 표기로 교체 (루브릭 v4 §0-1 규칙 A)
         '수취완료'·'미수취'·'확인필요'  →  '이상 없음'·'확인 권장'·'판단 보류'
         ⚠️ AI는 '수취완료'를 절대 쓰지 않는다 — 그건 담당자 확정값이다.
            ('대기중'은 실행 전 상태라 AI 출력값이 아님 → enum에서 제외)
   ✅ 3. 프롬프트에 E1 금액 대조 기준 반영 (2026-08-28 저녁)
         ★ 예외①(10원) 폐기 — 원인은 단수 처리가 아니라 대조 기준이었다.
           매입세액공제 여부(vat_deduction)로 공급가액/합계를 고른다(기관 업무지침)
           값이 없으면(모름) 통과시키지 않고 '확인 권장' + 어느 쪽과 맞는지 사유 (루브릭 §2-E1)
         실측: T01 확인 권장 · T02 이상 없음(오탐 제거) · T05 확인 권장(E6 유지)
   ⬜ E2~E7 은 아직 프롬프트에 없음 — 다음 작업

   ✅ (가) 유효한 키로 실제 판정 응답이 오는가 — 2026-08-28 확인됨.
       REST 직접 호출로 T01·T02·T05 판정 수신·JSON 파싱까지 성공 (응답 5~11초).
   ✅ (나) 2026-09-06 해소 — **SDK 를 걷어내고 REST 로 갈아끼웠다**(아래 geminiJson).
       유진이 8/31 에 확인한 "SDK 가 Workers 에서 돕니다" 는 로컬(wrangler pages dev) 기준이라
       맞는 확인이었다. 문제는 런타임이 아니라 **배포본에 부품이 없다는 것**이었다 —
       node_modules 는 .gitignore 가 막고 빌드가 설치해 주지 않으면 import 가 실패한다.
       ⚠️ 9/6 에는 그것이 HTML 502 의 원인이라고 **추정**했다. 진짜 원인은 아래 catch 의
         "502 를 Cloudflare 가 덮어쓴다" 였고, import 가 실제로 실패했는지는 확인하지 못했다.
         SDK 를 걷어낸 것은 그래도 맞는 판단이다 — 의존성 0 이면 그 걱정 자체가 없다.
         REST 형식: POST v1beta/models/{model}:generateContent?key=
           body { contents:[{parts:[{text},{inline_data:{mime_type,data}}]}],
                  generationConfig:{ responseMimeType:"application/json", responseSchema:{...} } }
           응답 candidates[0].content.parts[0].text 에 JSON 문자열.
   ⚠️ 무료 한도는 분당 기준이고, 그 값이 모델마다 다르다. 실측(2026-08-28):
        gemini-3.5-flash      분당 20회 (429 메시지에 limit:20 명시)  ← 채택
        gemini-3-flash        분당 20회
        gemini-3.7-flash      첫 호출부터 429 — 무료로는 사실상 못 씀
      12건 회귀는 한 번에 20 안쪽이라 돌지만, 재시도가 섞이면 넘는다. 간격을 둘 것.
      시연 때는 판정 결과를 inspection 테이블에 저장해두면 API 재호출이 없다(다음 주 작업).
   ⚠️ 루브릭에 아직 없는 지침 2건 (선미 전달 완료, 판단 대기):
      · (해소) 매입세액공제 → vat_deduction 폼 값으로 분기. 폼 항목 추가는 선미 작업
      · 대리작성 건은 서명란 공란이 정상 (기관 업무지침) — 서명 누락 오탐 위험
   ════════════════════════════════════════════════════════════ */
/* ★ SDK 를 걷어냈다 — REST 로 직접 부른다 (선미 결정 2026-09-06)
     무엇이 있었나 — `import { GoogleGenAI } from "@google/genai"` 였다.
     로컬(`npx wrangler pages dev .`)에서는 node_modules 가 있어 잘 돌았고,
     유진이 8/31 에 "SDK 가 Workers 에서 돕니다" 로 확인한 것도 그 환경이었다(맞는 확인이다).
     그런데 **Cloudflare 배포본에는 그 부품이 없다.** node_modules 는 .gitignore 가 막고
     (심볼릭 링크까지 막는다 — 2026-09-01), 빌드가 설치해 주지 않으면 import 가 실패한다.
     import 가 실패하면 함수가 켜지지도 못한다 — 9/6 에 HTML 502 의 원인을 이것으로 **추정**했다.
     ⚠️ 그 추정은 틀렸다. 진짜 원인은 이 파일이 실패를 **502 로 답한 것**이었다 —
       Cloudflare 가 사이트의 502 본문을 자기 HTML 페이지로 덮어쓴다(onRequest 의 catch 주석).
       /ai-check 로 함수 안에서 구글에 같은 요청을 해 보니 정상이었다.
       그래도 SDK 를 걷어낸 것은 맞다 — 의존성 0 이면 배달 걱정 자체가 없다.

   ★ 그래서 의존성을 없앤다. 배달될 부품이 없으면 배달이 실패할 수 없다.
     유진이 머리말에 미리 적어 둔 대비책 그대로다:
       "안 되면 callGemini() 안쪽만 REST(fetch) 직접 호출로 갈아끼우면 된다.
        바깥(onRequest)은 그대로 쓸 수 있게 격리해 두었다."
     그리고 (가) 항목이 말하듯 REST 는 8/28 에 이미 실제 판정까지 성공한 경로다.
   ⚠️ 프롬프트·판정값 검증·파싱·오류 처리는 **하나도 바꾸지 않았다.** 바꾼 것은
     '모델을 부르는 방법' 하나뿐이다. */

/* ★ 실행 지역 고정 — 구글로 바로 가지 않고 Supabase Edge Function 릴레이(서울)를 거친다 (2026-09-08 승희)
     왜 — Gemini 는 홍콩(HKG)에서 온 요청을 거부한다(400 FAILED_PRECONDITION). 이 함수는 Cloudflare 가
     어디서 돌릴지 고를 수 없고(9/7 실측: Smart Placement 켜도 HKG↔NRT), 코드 재시도도 효과 0 이었다.
     Supabase Edge Function 은 요청 헤더 `x-region: ap-northeast-2` 로 서울에 못박힌다(공식 문서 · 못 쓰면 우회 없이 오류).
     그래서 구글 주소 한 줄만 릴레이 주소로 바꾼다 — 프롬프트·검증·파싱은 그대로다.
     릴레이 코드: `supabase/functions/gemini-relay/index.ts` · 구글 키는 Supabase secrets 에만 있다.
   ★ 켜는 조건 — Cloudflare 환경변수 SUPABASE_URL·SUPABASE_ANON_KEY (config.js 가 이미 쓰는 둘). 둘 다 있으면 릴레이,
     없으면(로컬 wrangler 등) 전처럼 구글 직접. 리전을 바꾸려면 GEMINI_RELAY_REGION.
   ⚠️ 릴레이를 탈 때 x-goog-api-key 는 붙이지 않는다 — 구글 키가 Cloudflare 를 떠나지 않게. */
const GEMINI_DIRECT = "https://generativelanguage.googleapis.com";
const RELAY_REGION_DEFAULT = "ap-northeast-2";   /* 서울 */
function relayReady(env) { return !!(env && env.SUPABASE_URL && env.SUPABASE_ANON_KEY); }
function geminiEndpoint(env, path) {
  if (relayReady(env)) {
    return { via: "relay",
             url: String(env.SUPABASE_URL).replace(/\/$/, "") + "/functions/v1/gemini-relay" + path,
             headers: { "Content-Type": "application/json", "apikey": env.SUPABASE_ANON_KEY,
                        "x-region": env.GEMINI_RELAY_REGION || RELAY_REGION_DEFAULT } };
  }
  return { via: "direct", url: GEMINI_DIRECT + path,
           headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY } };
}

/* Gemini REST — 이미지 한 장 + 지시문을 보내고 JSON 을 받는다.
   ⚠️ 요청 본문은 어떤 경우에도 로그에 찍지 않는다 (개인정보가 들어 있다).
   ⚠️ 실패는 던진다 — onRequest 의 catch 가 424 + detail 로 바꾼다(502 는 Cloudflare 가 덮어쓴다).
     메시지에 'HTTP 429' 가 남아야 화면(api.js judgeFailKind)이 '한도 초과'로 갈라 읽는다. */
/* 구글 오류 본문을 한 줄로 (2026-09-09 승희).
   ★ 왜 — 429 본문은 앞 300자가 "You exceeded your current quota…" 안내문이고, **어느 한도에 걸렸는지**는
     그 뒤 details.violations 에만 있다. 9/8 dev 429 가 그래서 "quota" 한 단어로만 보였고, 키가 무료 등급이라
     gemini-3.5-flash **분당 5회**(quotaId …-FreeTier · limit 5)에 걸린 것을 다음 날 실측으로야 알았다.
   그래서 위반(quotaId · 한도값 · 모델)과 재시도 대기(retryDelay)를 앞으로 끌어낸다. 그 외 오류는 전처럼 앞 300자.
   ⚠️ 'HTTP 429' 는 호출부가 붙이므로 화면(api.js judgeFailKind)의 '한도 초과' 분기는 그대로 산다. */
function geminiErrorBrief(text) {
  try {
    const e = JSON.parse(text).error || {};
    const v = [];
    for (const d of e.details || []) {
      for (const x of d.violations || [])
        v.push((x.quotaId || x.quotaMetric || "quota") + " 한도 " + (x.quotaValue || "?")
               + (x.quotaDimensions && x.quotaDimensions.model ? " · " + x.quotaDimensions.model : ""));
      if (d.retryDelay) v.push("재시도 " + d.retryDelay + " 뒤");
    }
    if (v.length) return (e.status || "") + " · " + v.join(" · ") + " — " + String(e.message || "").slice(0, 120);
  } catch (_) { /* JSON 이 아니면 아래로 */ }
  return String(text).slice(0, 300);
}

async function geminiJson({ env, model, instruction, fileBase64, mimeType, schema }) {
  const ep = geminiEndpoint(env, "/v1beta/models/" + encodeURIComponent(model) + ":generateContent");
  const res = await fetch(ep.url, {
    method: "POST",
    headers: ep.headers,
    body: JSON.stringify({
      contents: [{ role: "user", parts: [
        { text: instruction },
        { inline_data: { mime_type: mimeType || "image/jpeg", data: fileBase64 } },
      ] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("Gemini HTTP " + res.status + " — " + geminiErrorBrief(t));
  }
  const r = await res.json();
  const parts = (r && r.candidates && r.candidates[0] && r.candidates[0].content
                 && r.candidates[0].content.parts) || [];
  const text = parts.map((x) => x.text || "").join("");
  if (!text) {
    /* 모델이 안전필터 등으로 본문을 안 줄 수 있다 — 이유를 그대로 들고 올라간다 */
    const why = (r && r.candidates && r.candidates[0] && r.candidates[0].finishReason) || "이유 없음";
    throw new Error("Gemini 응답에 본문이 없습니다 (" + why + ")");
  }
  return JSON.parse(text);
}

const MAX_BASE64 = 8_000_000; // 약 6MB 파일 상한 (base64 확장 고려)

/* ★ 신청서는 모델로 보내지 않는다 — 서버 쪽 차단 (2026-09-04 코칭 후 결정)
   결정 원문: "AI 전송은 폼에 입력된 내용 중 개인정보를 제외한 정보만 되도록 한정한다
              (신청서 파일을 통째로 보내는 일은 없도록)"

   화면(api.js AI_BLOCKED_KEYS)에서 이미 거르지만, 그건 **화면을 거쳐야만** 걸린다.
   이 서버함수는 주소만 알면 누구나 POST 할 수 있으므로 여기서도 막는다.
   서버에는 doc_key 가 오지 않고 표시명(docType)만 온다 — 그래서 이름으로 가린다.
   현재 서류 이름 중 '신청서' 를 품은 것은 신청서류뿐이다
   (인수증·영수증·명세서·사업자등록증·물품사진에는 없다 — common.js DOC_MATRIX 확인). */
/* ⚠️ 화면(api.js)은 **키**로 막고 여기는 **이름**으로 막는다 — 일부러 다른 기준이다(이중 방어).
     그래서 항목 이름을 바꾸면 이쪽만 조용히 풀린다. 2026-09-10 이 실제로 났다:
     appl_corp_scan 을 '물품기부신청서 서면 스캔본' → '법인인감(직인) 날인 이미지' 로 바꾸자
     이름에서 '신청서' 가 사라져 서버 차단이 통과됐다(smoke-test-privacy 가 잡았다).
   ★ 항목 이름을 바꿀 때는 이 정규식을 같이 본다. */
const AI_BLOCKED_DOC_RE = /신청서|인감|직인|날인/;

/* AI가 쓸 수 있는 말 — 루브릭 §0-1 규칙 A. 담당자 확정값과 섞지 않는다. */
const AI_VERDICTS = ["이상 없음", "확인 권장", "판단 보류"];

/* 프롬프트 지문 — inspection.prompt_hash 용.
   기준서가 개정돼도 "그때 무슨 프롬프트로 판정했는가"를 되짚을 수 있어야 한다(설계안 §3).
   암호학적 용도가 아니라 '같은 프롬프트인가'만 가리면 되므로 짧은 해시로 충분하다.
   ⚠️ 프롬프트 본문은 저장하지 않는다 — 등록 금액 등 건별 값이 섞여 있다. */
function promptHash(text) {
  var h = 5381;
  for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return 'p' + (h >>> 0).toString(16);
}

/* Cloudflare는 res.json()이 없다. 응답을 이 함수로 통일한다. */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// Gemini 호출 격리 — API 형식이 바뀌면 이 함수만 수정하면 된다.
//
// 2026-07-22 검증(@google/genai v2.13.0 타입 정의 직접 대조):
//   interactions.create / input의 TextContent·ImageContent / response_format의
//   TextResponseFormat / 응답의 output_text — 필드명·snake_case까지 전부 일치.
// 남은 미검증: 유효한 키로 실제 판정 응답을 받아 JSON 파싱까지 성공하는지.
async function callGemini({ env, docType, fileBase64, mimeType, formValue, vatDeduction }) {
  const model = env.GEMINI_MODEL || "gemini-3.5-flash";
  const instruction =
    `당신은 비영리단체의 후원물품 서류 검수 담당자입니다. ` +
    /* ★ 범위를 '서류의 종류'로 좁힌다 (2026-08-31).
       전에는 "유효한지 판정하세요"였는데, 이 말이 진위 판별까지 불렀다.
       회귀에서 AI가 픽스처 하단의 "AI 검수 테스트용 가상 샘플" 문구를 읽고
       "실제 증빙인지 확인 필요"로 판정했다(T07·T09 오탐).
       루브릭에서 AI의 몫은 E6 — '이 자리에 올 종류의 서류인가'다.
       진위·적정성은 담당자 몫(AI 확인 범위 29개 중 16개는 사람이 본다). */
    `첨부된 이미지가 '${docType}' 자리에 올 수 있는 '종류'의 서류인지 판정하세요. ` +
    `핵심: 파일이 올라온 것과 '그 서류를 실제로 받은 것'은 다릅니다. 내용이 해당 서류가 맞는지 판단하세요. ` +
    `⚠️ 서류의 진위·발급 주체의 실재 여부는 판단하지 마세요 — 담당자의 몫입니다. ` +
    `문서에 테스트·샘플·연습용이라는 표시가 있어도 그것을 이유로 판정을 내리지 마세요. ` +
    /* ── E1 금액 대조 (루브릭 v4 §2-E1 · 2026-08-28 개정) ─────────
       예외①(10원 단수 차이 무시)은 폐기됐다. 9원 차이의 원인은 단수 처리가 아니라
       "무엇과 대조하느냐"였다 — 매입세액공제를 받는 법인은 부가세를 뺀 공급가액으로
       신고한다(기관 업무지침). 기준만 맞추면 차이가 애초에 생기지 않으므로,
       임계값 분기 없이 '다르면 확인 권장 + 차이 금액'으로 단순화한다. */
    (formValue
      ? `시스템에 등록된 금액은 '${formValue}'입니다. ` +
        (vatDeduction === true
          ? `이 후원자는 매입세액공제를 받으므로 등록 금액은 부가세를 제외한 금액입니다. ` +
            `서류의 '공급가액'과 대조하세요. `
          : vatDeduction === false
            ? `이 후원자는 매입세액공제를 받지 않으므로 서류의 '합계금액'과 대조하세요. `
            /* 값이 없으면(모름/NULL) 자동 통과시키지 않는다 — 진짜 금액 오류가
               우연히 공급가액과 맞아떨어져 새어나갈 수 있고, 예외① 폐기 정신
               (1원이라도 다르면 사람이 본다)과도 어긋난다. 대신 '어느 쪽과 맞는지'를
               사유에 적어 담당자에게 넘긴다. (루브릭 §2-E1) */
            : `매입세액공제 여부가 확인되지 않았습니다. 서류의 '공급가액'과 '합계금액'을 모두 읽고, ` +
              `어느 쪽과 맞는지에 관계없이 판정은 '확인 권장'으로 하되 사유를 아래와 같이 적으세요. ` +
              `  · 합계와 일치하면 → "합계와 일치 — 공제 안 받는 건으로 보입니다. 후원자 확인 요청" ` +
              `  · 공급가액과 일치하면 → "공급가액과 일치 — 공제 받는 건으로 보입니다. 후원자 확인 요청" ` +
              `  · 둘 다 아니면 → "어느 쪽과도 다름 — 금액 오류 가능성" `) +
        `금액이 다르면 → '확인 권장'. 금액을 읽을 수 없으면 → '판단 보류'. ` +
        `사유에는 반드시 양쪽 금액과 차이를 나란히 적으세요 ` +
        `(예: 서류 1,250,000원 / 등록 1,205,000원 · 차이 45,000원). `
      : ``) +
    `당신은 의견만 냅니다 — 서류를 승인하거나 수취를 확정하지 않습니다. ` +
    `판정은 반드시 '이상 없음' · '확인 권장' · '판단 보류' 셋 중 하나여야 합니다. ` +
    `읽을 수 없거나 판단 근거가 부족하면 '판단 보류'를 쓰세요. ` +
    `판정 결과를 JSON으로만 답하세요.`;

  const parsed = await geminiJson({
    env, model, instruction, fileBase64, mimeType,
    schema: {
      type: "OBJECT",
      properties: {
        verdict: { type: "STRING", enum: AI_VERDICTS },
        reason:  { type: "STRING" },
        amount:  { type: "STRING" },
      },
      required: ["verdict", "reason"],
    },
  });

  /* AI가 엉뚱한 말을 하면 통과시키지 않는다 — '수취완료'가 화면에 새어 나가면
     AI가 서류를 승인한 모양이 되어 감사 방어가 무너진다. */
  /* 저장(inspection)에 필요한 재현 정보를 함께 돌려준다 — 화면은 이 값을 그대로 DB에 넣는다.
     모델명은 서버만 알고 있다(env.GEMINI_MODEL). 화면이 짐작하게 두면 기록이 틀어진다. */
  const trace = { model, promptHash: promptHash(instruction) };

  if (!AI_VERDICTS.includes(parsed.verdict)) {
    return { verdict: "판단 보류", reason: `판정값을 읽지 못했습니다(${parsed.verdict ?? "없음"})`,
             ...trace, status: "parse_error" };
  }
  return { verdict: parsed.verdict, reason: parsed.reason, amount: parsed.amount,
           ...trace, status: "success" };
}

/* ════════════════════════════════════════════════════════════
   추출 모드 (mode:'extract') — E4·E5·E6 용 · 2026-08-31 신설

   ★ E1과 구조가 다르다. 여기서 AI는 **판정하지 않는다.** 서류에서 값만 뽑고,
     대조·특칙·예외 적용은 코드(rules-compare.js)가 한다.

   왜 —
     ① 루브릭 §0이 요구하는 감사 방어 형태다
        ("AI가 확인필요로 판단했습니다"는 방어 불가 / 읽은 값이 있어야 방어 가능)
     ② E4의 특칙 a·b, E6의 예외 ②③④를 프롬프트 문장으로 쌓으면 서로 간섭한다.
        루브릭이 E6을 "오탐이 가장 많이 나는 지점"이라고 못박은 이유다.
     ③ 2026-08-31 실측에서 데였다 — 시가자료(단가만 있고 합계 없음)에 금액 대조를
        걸었더니 AI가 단가와 총액을 비교해 '차이 1,589,200원' 오탐을 냈다.
        "비교하라"는 지시를 너무 충실히 따른 결과였다. 값만 뽑게 했으면
        코드가 "합계가 없으니 대조 안 함"으로 넘겼을 것이다.

   설계 초안·판정 규칙: (미공개 내부 기록)
   ════════════════════════════════════════════════════════════ */
/* ★ 2026-09-04 — '사진' 을 넣었다(E8 2단계 · 유진 출국 전).
     그전까지 물품 사진은 갈 곳이 없어 '기타'·'판독불가' 로 왔다(9/3 실제 표본: 기타 4 · 판독불가 1).
     그래서 "사진 자리에 사진이 왔는가" 를 물을 수 없었다 — 사진과 '읽다 만 문서' 가 같은 칸에 있었다.
     ⚠️ 이 enum 을 늘리면 rules-compare.js 의 E8(NOT_A_DOCUMENT)이 같이 움직여야 한다.
       안 그러면 진짜 사진이 '사진' 으로 돌아오는 순간 정상 건이 전부 '확인 권장' 이 된다. */
const DOC_KINDS = ["구매영수증", "세금계산서", "거래명세표", "견적서", "단가표", "간이영수증",
                   "원가명세서", "회계장부", "시세자료", "사업자등록증", "인수증", "사진",
                   "기타", "판독불가"];

/* unreadable 에 쓸 수 있는 이름 — 값 항목의 이름 그대로다.
   ★ 2026-09-04 — 여기를 목록으로 막는다. 그전에는 그냥 문자열 배열이라
     모델이 `issuerBizNo` 로도 '사업자번호' 로도 보냈고, 코드는 한글만 찾아 못 알아들었다.
     서류 종류(docKind)는 처음부터 목록으로 막아 이런 일이 없었다 — **같은 방법을 여기에도 쓴다.**
   ⚠️ 프롬프트로 "이 이름을 쓰세요" 라고 적는 것은 부탁이고, 이 목록은 **형식 자체를 막는 것**이다.
     둘 다 둔다 — 부탁은 모델이 안 지킬 수 있다.
   ⚠️ 이 목록을 늘리면 rules-compare.js 의 UNREADABLE_ALIAS 도 같이 봐야 한다.
     enum 을 늘리면 그 enum 을 읽는 쪽이 같이 움직인다(오늘 DOC_KINDS 에서 배운 것). */
const FACT_FIELDS = ["docKind", "qty", "qtyUnit", "unitPrice", "total",
                     "supply", "issuerBizNo", "issueDate"];

async function extractFacts({ env, docType, fileBase64, mimeType, today }) {
  const model = env.GEMINI_MODEL || "gemini-3.5-flash";
  const instruction =
    `당신은 비영리단체의 후원물품 서류에서 값을 읽어 옮기는 사람입니다. ` +
    `★ 당신은 판정하지 않습니다. 옳은지 그른지, 유효한지 무효한지 말하지 마세요. ` +
    `서류에 적힌 것을 그대로 옮기는 것이 전부입니다. 판단은 담당자와 시스템이 합니다. ` +
    `이 파일은 '${docType}' 자리에 제출된 것입니다. 다음을 읽어 JSON으로만 답하세요. ` +
    `1. docKind — 이 문서가 어떤 '종류'인지 고르세요. 문서 상단의 제목을 우선 보고, ` +
      `제목이 없으면 형식으로 판단하세요. 글자를 읽을 수 없으면 '판독불가'. ` +
      /* ★ 2026-08-31 실측 보완 — 제목이 그냥 '영수증'인 서류를 어떤 건 '구매영수증',
         어떤 건 '간이영수증'으로 갈라 분류했다. E6은 간이영수증을 증빙 불가로 보므로,
         이 흔들림이 그대로 오탐이 된다. 판별 기준을 문서에 적힌 말로 고정한다. */
      `제목이 '영수증'이면 '구매영수증'으로 분류하세요. ` +
      `'간이영수증'·'거래명세표'·'견적서'·'단가표'는 문서에 그 말이 실제로 적혀 있을 때만 고르세요. ` +
      `문서의 형식이나 간략함을 근거로 종류를 바꿔 부르지 마세요. ` +
      /* ★ 2026-09-04 실측 보완 — 13종 중 6종만 설명돼 있었다(선미가 세어 봄).
         설명 없던 7종은 근거 없이 고를 수밖에 없다. 9/3 채점에서 쇼핑몰 상품페이지
         캡처가 하나는 '시세자료', 하나는 '기타' 로 갈렸다 — AI 가 흔들린 게 아니라
         **일관될 근거를 우리가 안 준 것**이다. 그래서 종류마다 한 줄씩 적는다. */
      `각 종류는 이런 뜻입니다 — ` +
      `'구매영수증' 물건을 사고 받은 영수증(카드 매출전표·매장 영수증 포함). ` +
      `'세금계산서' '세금계산서'·'전자세금계산서'라고 적혀 있고 공급자·공급받는자 칸이 있는 것. ` +
      `'거래명세표' '거래명세표'·'거래명세서'라고 적힌 납품 내역. ` +
      `'견적서' '견적서'라고 적힌, 아직 거래가 일어나지 않은 제시 가격. ` +
      `'단가표' '단가표'라고 적힌, 품목별 단가만 늘어놓은 표. ` +
      `'간이영수증' '간이영수증'이라고 적혀 있는 것. ` +
      `'원가명세서' 만든 물건의 원가 구성(재료비·노무비 등)을 적은 것. ` +
      `'회계장부' 계정과목·차변·대변·전표번호처럼 장부의 일부를 옮긴 것. ` +
      `'시세자료' 판매처·중개몰의 가격 페이지, 시세표, 정가 안내처럼 거래가 아직 없는 가격 근거입니다. ` +
        `쇼핑몰 상품 페이지를 찍은 화면이 여기입니다 — 할인가·정가가 함께 있어도 '시세자료'입니다. ` +
      `'사업자등록증' 등록번호·상호·개업연월일이 적힌 사업자등록증. ` +
      `'인수증' 물건을 받았다는 확인서('인수증'·'수령증'). ` +
      `'사진' 서류가 아니라 물품·현장을 찍은 사진입니다. 읽을 글자가 거의 없고 사물이 찍혀 있으면 '사진'입니다. ` +
      `'기타' 위 어디에도 맞지 않을 때만 고르세요. 애매하다는 이유로 고르지 마세요. ` +
      `'판독불가' 글자가 흐리거나 잘려 읽을 수 없을 때만 고르세요. ` +
        `⚠️ '무슨 서류인지 모르겠다'는 뜻이 아닙니다. 글자가 애초에 없는 사진은 '판독불가'가 아니라 '사진'입니다. ` +
      `⚠️ 종류만 고르세요. 그 종류가 이 자리에 적절한지는 판단하지 마세요. ` +
    `2. 수량(qty)과 단위(qtyUnit) — 서류에 적힌 그대로 옮기세요. ` +
      `⚠️ 단위를 낱개로 환산하지 마세요. '12입 3박스'는 qty='3', qtyUnit='박스'입니다. ` +
      `환산은 사람이 합니다 — 당신이 곱하면 그 계산이 맞는지 아무도 확인할 수 없습니다. ` +
      /* ★ 2026-09-04 실측 보완 — 한 파일에 요약 영수증과 품목별 상세 영수증이 함께 있고
         수량이 달랐다(요약 '수량 1' · 상세 '판매 수량 4'). 둘 다 인쇄돼 있어 AI 는 앞의 것을 줬다.
         ⚠️ AI 잘못이 아니었다 — 어느 쪽을 쓸지 우리가 정해 준 적이 없다.
         실무 판단(유진 · 재단 최종 확인 대기): **세부내역 기준으로 본다.**
           영수증을 먼저 받고 세부내역이 필요해 다시 받아 **둘 다 첨부하는 일**이 실제로 있다.
           그때 요약본의 '수량 1' 은 "이 매장에서 산 것 1건" 이지 받은 물품의 개수가 아니다.
         ★ 이 값으로 배분 합계 대조(E7)와 수량 대조(E4)가 돌기 때문에, 정하지 않으면
           정상 건이 오류로 걸린다. */
      `⚠️ 한 파일에 영수증이 둘 이상이고 수량이 서로 다르면, ` +
      `품목이 한 줄씩 적힌 **상세 내역** 쪽 수량을 쓰세요. ` +
      `매장명·상품명 하나로 묶여 '수량 1' 로 적힌 요약 영수증의 값을 쓰지 마세요 ` +
      `(같은 거래를 요약본과 상세본으로 각각 받아 함께 낸 것입니다). ` +
    `3. 금액 — 단가(unitPrice)·합계금액(total)·공급가액(supply)을 각각 읽으세요. ` +
      /* ★ 2026-08-31 실측 보완 — 표 아래 '합계금액' 줄이 인쇄돼 있는데도 total 을 비워
         보내는 일이 5건 있었다(T03·T04·T06·T08·T10). unreadable 에도 안 적혔다.
         합계가 비어 오면 시스템은 "서류에 금액이 없다"로 오해해 금액 대조를 건너뛴다 —
         진짜 금액 오류가 조용히 통과한다. 어디를 보라고 못박는다. */
      `★ 표 아래쪽의 총액 표기 줄을 반드시 확인하세요 — '합계금액'·'견적금액'·'총액'·'계' 등 ` +
      `이름이 무엇이든 그 문서의 총액이면 total 에 넣으세요. ` +
      `'공급가액'과 '부가세'가 따로 적혀 있으면 공급가액은 supply 에 넣고, ` +
      `total 에는 부가세까지 더한 최종 총액을 넣으세요. ` +
      `⚠️ 없는 항목은 빈 문자열로 두세요. 다른 값으로 대신 채우지 마세요 ` +
      `(합계가 없다고 단가를 total 에 넣으면 안 됩니다). ` +
    `4. 발행처 사업자등록번호(issuerBizNo)와 거래일자(issueDate, YYYY-MM-DD). ` +
      `날짜가 여러 개면 '거래일자'를 우선하고, 거래일자가 없으면 '작성일자'를 쓰세요. ` +
      /* ★ 2026-09-04 실측 보완 — 여기에 "둘 다 없으면" 이 없었다.
         그래서 레고 상품페이지에서 화면의 유일한 날짜인 '발매일'을 거래일자로 보냈다.
         ⚠️ 게다가 아래 미래날짜 방어 문장이 "비우지 마세요" 라고 말하고 있었다 —
           미래 날짜를 겨냥한 문장인데 읽는 쪽에서는 "빈칸으로 두지 마라" 로 읽힌다.
           즉 레고 건은 규칙을 어긴 게 아니라 **규칙대로 한 것**이었다(선미 지적).
         그래서 ① 둘 다 없으면 비운다를 먼저 두고, ② 미래날짜 방어는 남기되
         "거래일자·작성일자로 읽은 날짜" 로 범위를 좁힌다. */
      `⚠️ 거래일자도 작성일자도 없으면 비우세요. ` +
      `발매일·개업연월일·유효기간·방문예정일처럼 거래 시점이 아닌 날짜를 거래일자 대신 쓰지 마세요. ` +
      `⚠️ 오늘은 ${today} 입니다. 거래일자·작성일자로 읽은 날짜가 미래로 보이더라도 ` +
      `그것을 이유로 값을 바꾸거나 지우지 마세요 — 읽은 그대로 두세요. ` +
    `5. unreadable — 위 항목 중 '있는 것 같은데 읽지 못한' 것의 이름을 배열로 적으세요. ` +
      `서류에 애초에 없는 항목은 넣지 마세요(그건 빈 값입니다). ` +
      /* ★ 2026-09-04 실측에서 드러난 조용한 실패 —
         "이름을 적으세요" 라고만 했지 **어떤 이름인지 정해 준 적이 없다.**
         실제로 `issuerBizNo` 처럼 영문 필드명으로 왔는데(run-survey 9/4),
         rules-compare.js 는 한글 '수량'·'거래일자' 를 찾는다.
         → **못 읽었다고 밝혔는데 코드가 못 알아듣고 그냥 통과한다.**
         이 항목이 존재하는 이유(빈 값과 못 읽음을 가른다)가 통째로 무너지는 자리다.
         그래서 이름을 위 JSON 필드명으로 못박는다. 코드 쪽도 한글을 함께 받게 두었다. */
      `⚠️ 이름은 반드시 아래 필드명 그대로 쓰세요 — ` +
      `${FACT_FIELDS.join(" · ")}. ` +
      `'수량'·'금액' 처럼 우리말로 바꿔 쓰지 마세요. 시스템이 못 알아듣습니다. ` +
      /* 빈 값과 '못 읽음'을 구분하지 않으면 코드가 둘을 똑같이 취급한다.
         빈 값은 "대조할 것이 없다"로 넘어가고, 못 읽음은 사람이 봐야 한다. */
      `★ 값이 있는 것 같은데 자신이 없으면 빈 값으로 두지 말고 unreadable 에 이름을 적으세요. ` +
      `아무 말 없이 비워 두면 시스템은 '서류에 그 항목이 없다'로 잘못 이해합니다. ` +
    /* ★ 2026-09-04 — "없는 항목은 빈 문자열" 이 3번(금액)에만 적혀 있었다.
       규칙을 안 쓴 게 아니라 한 곳에만 쓴 것이다. 한 항목씩 덧붙이면 또 갈리므로
       모든 항목에 걸리는 공통 규칙으로 올린다. */
    `⚠️ 위 모든 항목에 공통입니다 — 서류에 없는 항목은 빈 문자열로 두세요. ` +
    `가까운 다른 값으로 대신 채우지 마세요. ` +
    `⚠️ 문서에 테스트·샘플·연습용이라는 표시가 있어도 무시하고 값을 읽으세요. ` +
    `⚠️ 서류의 진위나 발행 주체의 실재 여부는 판단하지 마세요. ` +
    `⚠️ 읽지 못한 값을 추측해 채우지 마세요 — 빈 값이 틀린 값보다 낫습니다.`;

  const parsed = await geminiJson({
    env, model, instruction, fileBase64, mimeType,
    schema: {
      type: "OBJECT",
      properties: {
        docKind:     { type: "STRING", enum: DOC_KINDS },
        qty:         { type: "STRING" },
        qtyUnit:     { type: "STRING" },
        unitPrice:   { type: "STRING" },
        total:       { type: "STRING" },
        supply:      { type: "STRING" },
        issuerBizNo: { type: "STRING" },
        issueDate:   { type: "STRING" },
        unreadable:  { type: "ARRAY", items: { type: "STRING", enum: FACT_FIELDS } },
      },
      required: ["docKind"],
    },
  });
  /* 빈 문자열은 null 로 통일한다 — 코드가 "없음"을 한 가지 모양으로만 보게 한다.
     ⚠️ null(서류에 없음)과 unreadable(있는데 못 읽음)은 끝까지 구분해 넘긴다. */
  const nz = (v) => (v === undefined || v === null || String(v).trim() === "") ? null : String(v).trim();
  const cleanUnreadable = (arr) => {
    if (!Array.isArray(arr)) return [];
    const ok = [], bad = [];
    for (const v of arr){
      const name = String(v || "").trim();
      if (FACT_FIELDS.includes(name)) { if (!ok.includes(name)) ok.push(name); }
      else if (name) bad.push(name);
    }
    if (bad.length) console.warn("[추출] unreadable 에 규격 밖 이름이 왔습니다 — 버립니다:", bad.join(", "));
    return ok;
  };
  return {
    docKind:     DOC_KINDS.includes(parsed.docKind) ? parsed.docKind : "판독불가",
    qty:         nz(parsed.qty),
    qtyUnit:     nz(parsed.qtyUnit),
    unitPrice:   nz(parsed.unitPrice),
    total:       nz(parsed.total),
    supply:      nz(parsed.supply),
    issuerBizNo: nz(parsed.issuerBizNo),
    issueDate:   nz(parsed.issueDate),
    /* ★ 형식(enum)으로 막았지만 여기서 한 번 더 거른다 — 규격 밖 이름은 코드가 못 알아듣고,
         못 알아듣는 이름이 배열에 있으면 "밝혔는데 아무 일도 안 일어나는" 조용한 실패가 된다.
       ⚠️ 조용히 버리지 않는다. 버린 것이 있으면 로그에 남긴다 — 모델이 형식을 안 지키기 시작하면
         그 사실 자체를 알아야 한다(9/4 에 이름이 갈린 것을 반년 뒤에 알면 늦다). */
    unreadable:  cleanUnreadable(parsed.unreadable),
    model,
    promptHash:  promptHash(instruction),
  };
}

/* Cloudflare Pages Functions 진입점. context = { request, env, params, ... } */
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") return json({ error: "POST만 허용됩니다" }, 405);
  /* 릴레이를 타면 구글 키는 Supabase 쪽에 있다 — 여기 키가 없어도 릴레이 설정이 있으면 간다 */
  if (!env.GEMINI_API_KEY && !relayReady(env)) return json({ error: "GEMINI_API_KEY 미설정 — 폴백 표시" }, 503);

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "요청 본문(JSON)을 읽지 못했습니다" }, 400);
    }
    /* vatDeduction: 매입세액공제 여부(폼 vat_deduction). true/false/미지정 3가지를 구분한다. */
    const { docType, fileBase64, mimeType, formValue, vatDeduction, mode, today } = body || {};

    // 완화된 검증: docType은 짧은 문자열이기만 하면 됨(체크리스트 라벨을 그대로 프롬프트 맥락으로 사용).
    if (!docType || typeof docType !== "string" || docType.length > 40) {
      return json({ error: "docType이 유효하지 않습니다" }, 400);
    }
    if (!fileBase64 || typeof fileBase64 !== "string") {
      return json({ error: "파일 데이터 없음" }, 400);
    }
    if (fileBase64.length > MAX_BASE64) {
      return json({ error: "파일이 너무 큽니다" }, 413);
    }
    /* ★ 신청서 차단 (2026-09-04) — 파일을 읽기 전에, 모델을 부르기 전에 끊는다.
       422 를 쓰는 이유: 요청 형식은 맞고(400 아님) 정책상 처리하지 않는 것이다.
       화면은 이 응답을 판정 실패로 받아 '담당자가 직접 확인' 으로 흐른다 — 신청서는
       원래 담당자가 원문을 보고 수취 처리하는 항목이라(common.js [S] 주석) 동선이 맞다. */
    if (AI_BLOCKED_DOC_RE.test(docType)) {
      return json({ error: "신청서는 AI로 전송하지 않습니다 (개인정보 보호 정책 · 2026-09-04)" }, 422);
    }

    /* mode:'extract' 는 값만 뽑는다(E4·E5·E6). 기본은 기존 판정(E1) — 화면은 안 바뀐다. */
    if (mode === "extract") {
      const facts = await extractFacts({ env, docType, fileBase64, mimeType,
                                         today: today || new Date().toISOString().slice(0, 10) });
      return json(facts, 200);
    }
    const verdict = await callGemini({ env, docType, fileBase64, mimeType, formValue, vatDeduction });
    return json(verdict, 200);
  } catch (err) {
    /* 형식 불일치·쿼터·파싱 오류 등 — 명확히 반환(프론트가 폴백 처리).
       ⚠️ 요청 본문은 절대 로그에 찍지 않는다 (개인정보가 들어 있다).

       ★ 502 가 아니라 424 다 (2026-09-06 · dev 실주행에서 하루를 잃고 찾았다).
         전에는 502 로 답했다. 그런데 **Cloudflare 는 사이트가 502·504 를 내면 그 본문을
         자기 "502 Bad gateway" HTML 페이지로 바꿔 버린다.** 우리가 JSON 으로 적은 이유
         (구글이 뭐라고 했는지)는 그 순간 사라지고, 화면에는 <!DOCTYPE html…> 만 남았다.
         로컬(wrangler pages dev)에서는 Cloudflare 가 중간에 없어 JSON 이 그대로 보였다 —
         그래서 8/31 실측에서는 멀쩡했고 배포본에서만 깨졌다.
         /ai-check 로 같은 요청을 함수 안에서 해 보니 구글은 JSON 으로 정상 답하고 있었다.
       424(Failed Dependency) — "이 요청은 다른 요청(구글)이 실패해서 실패했다". 뜻도 맞고,
         4xx 는 Cloudflare 가 건드리지 않는다. 화면(api.js)은 res.ok 만 보므로 그대로 동작한다. */
    return json({ error: "판정 실패", detail: String((err && err.message) || err) }, 424);
  }
}
