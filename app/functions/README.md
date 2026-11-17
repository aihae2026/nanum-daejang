# functions/ — 서버함수

브라우저에서 못 하는 것(=API 키를 숨겨야 하는 것)만 여기 둔다. 키는 절대 코드에 적지 않는다 — Cloudflare 환경변수로.

| 파일 | 하는 일 | 상태 |
|---|---|---|
| `judge.js` | AI 검수 (Gemini 멀티모달 호출) | REST(fetch) · **의존성 0** (2026-09-06). **2026-09-08 부터 구글로 바로 안 가고 Supabase Edge Function 릴레이(서울 고정)를 거친다** — 아래 "실행 지역" 절. 검사 → `node smoke-test-judge-fn.mjs` |
| ~~`ai-check.js`~~ | **2026-09-10 삭제** — 기관 내부 보안 규정(공개 서버에 테스트 페이지를 두지 않는다). 키 유효성을 밖에서 확인할 수 있는 자리였다 | 진단이 필요하면 팀 내부 저장소 이력(미공개)에서 되살려 **로컬에서만** 쓴다. 부르던 코드는 없었다(9/10 실측) |
| `pdf.js` | 신청서 → PDF 생성 (개인정보 분리 지점) | **아직 없음**(계획만 · 이 저장소에 파일 없음) |
| `sms.js` | 제출 링크 문자 발송 | **아직 없음**(계획만 · 이 저장소에 파일 없음 · 발신번호 등록이 전제) |

현재 구현된 것은 `judge.js` 하나입니다. `pdf.js` · `sms.js` 는 자리만 잡아 둔 다음 과제입니다
(PDF 는 지금 브라우저에서 만들고, 문자 발송은 발신번호 등록이 전제입니다).
다른 사용 한계는 저장소 루트 README 의 [사용 조건·한계](../../README.md#사용-조건-한계)에 모아 두었습니다.


---

## ⚠️ npm 패키지를 import 하지 마세요 (2026-09-06 · 값비싸게 배웠다)

`judge.js` 는 `@google/genai` SDK 를 쓰고 있었다. 로컬(`npx wrangler pages dev .`)에서는
`node_modules` 가 있어 잘 돌았고 실제 판정까지 받았다(유진 8/31 — 맞는 확인이다).

**그런데 배포본에는 그 부품이 없다.** `node_modules` 는 `.gitignore` 가 막는다
(심볼릭 링크까지 막는다 — *"Cloudflare 배포가 깨진 링크를 거부, 2026-09-01 발견"*).
import 가 실패하면 **함수가 켜지지도 못하고**, Cloudflare 가 자기 HTML 오류 페이지로 502 를 준다.

화면에는 이렇게 떴다 — 이게 진단이었다:

```
HTTP 502 — <!DOCTYPE html> <!--[if lt IE 7]> <html class="no-js ie6 oldie" …
```

이 파일들의 오류 처리는 502 를 **JSON** 으로 준다. **HTML 이 오면 함수 안으로 들어오지도
못한 것**이다. 다음에 이 모양을 보면 코드 안이 아니라 **부팅**을 의심하세요.

- 새 서버함수는 **표준 웹 API(fetch·Response·crypto)만** 쓴다
- 꼭 패키지가 필요하면 그 파일을 켜는 검사를 **먼저** 만든다
  (`smoke-test-judge-fn.mjs` 처럼 — 함수를 진짜로 부르고 fetch 만 막는다)
- 화면 쪽 검사는 서버함수를 **지켜주지 않는다.** `smoke-test-ai` 는 `judgeAttachment` 를
  스텁으로 대신한다 — 서버함수는 그 뒤에 가려진다


## ⚠️ 함수는 502·504 로 답하지 마세요 (2026-09-06 · 하루를 잃고 찾았다)

`judge.js` 는 구글이 거부하면 `502 + {"error":"판정 실패","detail":"Gemini HTTP 400 — …"}` 로 답했다.
**Cloudflare 는 사이트가 502·504 를 내면 그 본문을 자기 "502 Bad gateway" HTML 페이지로 바꿔 버린다.**
그래서 화면에는 우리가 적은 이유가 아니라 `<!DOCTYPE html…>` 만 떴고, 구글이 뭐라고 했는지는
그 밑에 묻혔다. 로컬 `wrangler pages dev` 에는 Cloudflare 가 중간에 없어 JSON 이 그대로 보인다 —
**로컬에서 멀쩡하고 배포본에서만 HTML 502 면 이것부터 의심하세요.**

- 실패는 **4xx** 로 (judge.js 는 `424 Failed Dependency`). 4xx 본문은 Cloudflare 가 건드리지 않는다
- 원인을 함수 안에서 확인하려면 **같은 요청을 함수 안에서 해 보고 JSON 으로 돌려주는** 진단 주소가 빠르다 (`ai-check.js` 가 그것이었고 9/10 에 지웠다 — 이 공개 저장소에는 없다)
  (2026-09-06 에 그것으로 잡았다 — 진단 끝나면 지운다)

---

## 실행 지역 고정 — 구글 호출은 Supabase 릴레이(서울)를 거친다 (2026-09-08 승희)

**왜** — Gemini 는 홍콩(HKG)에서 온 요청을 거부한다(`400 FAILED_PRECONDITION · User location is not supported`).
Cloudflare Pages Function 은 어디서 돌지 고를 수 없다 — 9/7 실측: Smart Placement 를 켜도 colo 가 HKG↔NRT, 코드 재시도 효과 0.
Supabase Edge Function 은 요청 헤더 `x-region: ap-northeast-2` 로 **서울에 못박힌다**(공식 문서 · 못 쓰면 우회 없이 오류). 9/8 실측: 3회 전부 `region=ap-northeast-2`, 판정 200.

**구조** — `judge.js` 의 `geminiEndpoint()` 하나가 갈림길이다. (9/10 이전에는 `ai-check.js` 도 같은 함수를 썼다)
Cloudflare 환경변수 `SUPABASE_URL`·`SUPABASE_ANON_KEY`(config.js 가 이미 쓰는 둘)가 있으면
`{SUPABASE_URL}/functions/v1/gemini-relay/v1beta/models/<model>:generateContent` 로, 헤더 `apikey`+`x-region`. 없으면(로컬) 전처럼 구글 직접.
프롬프트·검증·파싱은 안 바뀌었다. 구글 키는 Cloudflare 를 떠나지 않고, 릴레이는 Supabase secrets 의 `GEMINI_API_KEY` 를 붙인다.

**릴레이 코드** — 저장소 루트 `supabase/functions/gemini-relay/index.ts`(41줄) · `where-am-i/index.ts`(리전 확인용 · **점검용 — 운영에는 배포하지 말 것**) · `_shared/auth.ts`(apikey 검사).
허용 경로는 모델 목록·`generateContent` 둘뿐(열린 프록시 방지). `verify_jwt=false` 인 이유는 우리 키가 `sb_publishable_…`(JWT 아님)이라서 — 대신 함수 안에서 `apikey` 를 `RELAY_KEYS` 비밀값과 대조한다.

**배포·키 (승희 · Supabase 소유자)** — 대시보드 Personal Access Token 을 `SUPABASE_ACCESS_TOKEN` 으로 두고
`supabase functions deploy where-am-i gemini-relay --project-ref <your-project-ref> --use-api` ·
(`where-am-i` 는 점검할 때만 함께 올리고 운영에는 `gemini-relay` 만 둔다 — 공개 키만으로 누구나 호출할 수 있어서다) ·
secrets: `GEMINI_API_KEY` · `RELAY_KEYS=<publishable key>` (· `GEMINI_MODEL` 은 넣어도 되지만 지금 릴레이 코드는 읽지 않는다 — 모델은 Cloudflare 쪽 `GEMINI_MODEL` 이 정해 주소에 실어 보낸다).
⚠️ 릴레이(Supabase 비밀값 `GEMINI_API_KEY`)와 Cloudflare 환경변수 `GEMINI_API_KEY` 에는 **같은 유료 키**를 넣을 것.
   Cloudflare 의 `GEMINI_API_KEY` 는 릴레이를 못 쓸 때(`SUPABASE_URL`·`SUPABASE_ANON_KEY` 가 없을 때)만 쓰인다 — 구글 직접 호출용 예비 값이다.
전체 환경변수 표는 관리자 가이드 5.3 에 있다.
⚠️ 회사망에서는 `supabase login`(브라우저 대기)이 TLS 가로채기로 실패한다 — 토큰 방식만 된다.

**확인** — `GET {SUPABASE_URL}/functions/v1/where-am-i` (헤더 `apikey`·`x-region: ap-northeast-2`) → `region` 이 `ap-northeast-2` 이고 `gemini.ok` 가 true 면 끝.
릴레이를 타는지는 `where-am-i`(Supabase 함수)로 본다. colo 가 HKG 여도 상관없어야 한다.
