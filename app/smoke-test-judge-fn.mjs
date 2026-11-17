/* 서버함수 judge.js 를 **통째로 돌린다** — 네트워크 없이 (2026-09-06 선미)

   ★ 왜 만들었나 — 9/6 dev 에서 AI 검수가 계속 실패했다. 화면에는 이것만 떴다:
       HTTP 502 — <!DOCTYPE html> <!--[if lt IE 7]> …
     이 파일의 오류 처리는 502 를 **JSON** 으로 준다. HTML 이 왔다는 것은
     **함수 안으로 들어오지도 못했다**는 뜻이었다 — `import { GoogleGenAI }` 가
     배포본에서 풀리지 않아 함수가 켜지지 못한 것이다(node_modules 가 없다).

     그 사이 아무도 이 파일을 **켜 본 적이 없었다.** 검사가 하나도 없었기 때문이다.
     화면 쪽 검사(smoke-test-ai)는 judgeAttachment 를 스텁으로 대신했다 —
     서버함수는 그 스텁 뒤에 가려져 있었다.

   ★ 그래서 여기서는 함수를 **진짜로 부른다.** 막는 것은 fetch 하나뿐이다.
     ① 함수가 켜진다 (import 가 풀린다 — 502 의 원인이 여기였다)
     ② 판정(E1) — 모델에 무엇을 보내는가 · 답을 어떻게 읽는가
     ③ 추출(extract) — 값만 뽑는 모드도 같은 길로 간다
     ④ 규격 밖 판정값은 '판단 보류' 로 내린다 (AI 가 '수취완료' 를 쓰지 못한다)
     ⑤ 신청서는 모델로 보내지 않는다 (개인정보 · 2026-09-04 결정)
     ⑥ 실패는 502 + JSON 이다 · 429 는 화면이 '한도 초과' 로 갈라 읽을 수 있게 남는다
     ⑦ 키가 없으면 503 — 3분 기다리지 않고 즉시 답한다

   ⚠️ 모델을 실제로 부르지 않는다. 그것은 실호출 검사(e2e-test-live)의 몫이다.
     여기서 지키는 것은 **함수가 켜지는가**와 **주고받는 모양**이다.

   돌리는 법:  node smoke-test-judge-fn.mjs
   2026-09-08 승희 — 구글 호출이 Supabase 릴레이(서울 고정)를 타는 모양을 ②·⑧ 에서 본다        (jsdom·서버·키 불필요)
*/
import { onRequest } from './functions/judge.js';

let fail = 0;
const check = (n, ok, got) => { console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got))); if (!ok) fail++; };

const PNG = 'iVBORw0KGgo=';
const post = (body) => new Request('https://x/judge', {
  method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});

/* 모델 대신 검사가 답한다 — 무엇을 받았는지 그대로 들고 있는다 */
let sent = null;
function stubFetch(reply, status = 200){
  globalThis.fetch = async (url, init) => {
    sent = {url: String(url), init, body: JSON.parse(init.body)};
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => reply,
      text: async () => (typeof reply === 'string' ? reply : JSON.stringify(reply)),
    };
  };
}
const modelSays = (obj) => ({candidates: [{content: {parts: [{text: JSON.stringify(obj)}]}}]});
/* ★ 2026-09-08 — 배포본과 같은 모양: SUPABASE_URL·SUPABASE_ANON_KEY 가 있으면 구글이 아니라
     Supabase 릴레이(서울 고정)로 간다. 구글 직접 호출은 아래 [⑧] 에서 따로 본다. */
const env = {GEMINI_API_KEY: 'test-key', SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_test'};
const RELAY = 'https://proj.supabase.co/functions/v1/gemini-relay/v1beta/models/gemini-3.5-flash:generateContent';

console.log('\n[① 함수가 켜진다 — 502 의 원인이 여기였다]');
check('★ import 가 풀린다 (onRequest 를 부를 수 있다)', typeof onRequest === 'function', typeof onRequest);

console.log('\n[② 판정(E1) — 보내는 모양과 읽는 모양]');
stubFetch(modelSays({verdict: '확인 권장', reason: '서류 335,000원 / 등록 500,000원 · 차이 165,000원', amount: '335,000'}));
let res = await onRequest({request: post({docType: '구매영수증 또는 매입세금계산서', fileBase64: PNG,
  mimeType: 'image/png', formValue: '500,000원', vatDeduction: true}), env});
let out = await res.json();
check('★ 200 으로 답한다', res.status === 200, res.status);
check('★ 판정을 그대로 옮긴다', out.verdict === '확인 권장', out);
check('   사유·금액도 옮긴다', /165,000/.test(out.reason || '') && out.amount === '335,000', out);
check('   모델명이 함께 온다 (기록에 남는다)', !!out.model, out.model);
check('   status=success', out.status === 'success', out.status);

check('★ Supabase 릴레이 주소로 간다 (구글 직접 아님 — 실행 지역 고정)', sent.url === RELAY, sent.url);
check('★ x-region 서울 헤더가 붙는다', sent.init.headers['x-region'] === 'ap-northeast-2', sent.init.headers);
check('★ apikey 헤더로 릴레이를 연다', sent.init.headers['apikey'] === 'sb_publishable_test', sent.init.headers);
check('★ 구글 키는 Cloudflare 를 떠나지 않는다 (x-goog-api-key 없음 · 주소에도 없음)',
  !/key=/.test(sent.url) && !('x-goog-api-key' in sent.init.headers), sent.init.headers);
const parts = sent.body.contents[0].parts;
check('★ 지시문과 이미지를 함께 보낸다', parts.length === 2 && !!parts[0].text && !!parts[1].inline_data, parts.map(p => Object.keys(p)));
check('   이미지 형식을 그대로 실어 보낸다', parts[1].inline_data.mime_type === 'image/png', parts[1].inline_data.mime_type);
check('   등록 금액이 지시문에 들어간다', /500,000원/.test(parts[0].text), '(없음)');
check('★ JSON 으로만 답하라고 못박는다', sent.body.generationConfig.responseMimeType === 'application/json', sent.body.generationConfig);
check('★ 판정값을 세 개로 묶는다 (AI 가 수취완료를 못 쓴다)',
  JSON.stringify(sent.body.generationConfig.responseSchema.properties.verdict.enum) === JSON.stringify(['이상 없음', '확인 권장', '판단 보류']),
  sent.body.generationConfig.responseSchema.properties.verdict);

console.log('\n[③ 추출(extract) — 값만 뽑는 모드]');
stubFetch(modelSays({docKind: '구매영수증', qty: '100', qtyUnit: '개', total: '335,000', unreadable: []}));
res = await onRequest({request: post({docType: '구매영수증 또는 매입세금계산서', fileBase64: PNG,
  mimeType: 'image/png', mode: 'extract', today: '2026-09-06'}), env});
out = await res.json();
check('★ 200 으로 답한다', res.status === 200, res.status);
/* 서버는 값을 **납작하게** 준다 — 화면(api.js extractAttachment)이 {state,facts} 로 감싼다 */
check('★ 읽은 값을 돌려준다', out.docKind === '구매영수증' && out.qty === '100', out);
check('   서류에 없던 값은 null 로 통일한다', out.supply === null && out.issueDate === null, out);
check('   모델명·프롬프트 해시가 함께 온다 (기록에 남는다)', !!out.model && !!out.promptHash, out);
check('★ 판정은 하지 않는다 (verdict 가 없다)', !out.verdict, out.verdict);
check('   같은 릴레이 주소를 쓴다', sent.url === RELAY, sent.url);

console.log('\n[④ 규격 밖 판정값은 내린다]');
stubFetch(modelSays({verdict: '수취완료', reason: '괜찮아 보입니다'}));
res = await onRequest({request: post({docType: '구매영수증', fileBase64: PNG, mimeType: 'image/png'}), env});
out = await res.json();
check("★ '수취완료' 를 그대로 내보내지 않는다", out.verdict !== '수취완료', out.verdict);
check("★ '판단 보류' 로 내린다", out.verdict === '판단 보류', out.verdict);
check('   무엇이 잘못됐는지 기록한다', out.status === 'parse_error', out.status);

console.log('\n[⑤ 신청서는 모델로 보내지 않는다 (2026-09-04 결정)]');
let called = false;
globalThis.fetch = async () => { called = true; throw new Error('불렀다'); };
res = await onRequest({request: post({docType: '물품기부신청서(법인 외용)', fileBase64: PNG, mimeType: 'image/png'}), env});
check('★ 422 로 끊는다', res.status === 422, res.status);
check('★ 모델을 부르지도 않는다 (파일을 읽기 전에 끊는다)', !called, '(불렀다)');

console.log('\n[⑥ 실패는 424 + JSON 이다 — 502 는 Cloudflare 가 HTML 로 덮어쓴다]');
/* ★ 502 로 답하면 Cloudflare 가 본문을 자기 "502 Bad gateway" 페이지로 바꾼다 (2026-09-06 dev).
     구글이 뭐라고 했는지가 그 순간 사라진다. 4xx 는 건드리지 않는다. */
stubFetch('{"error":{"code":429,"message":"Quota exceeded"}}', 429);
res = await onRequest({request: post({docType: '구매영수증', fileBase64: PNG, mimeType: 'image/png'}), env});
out = await res.json();
check('★ 424 로 답한다 (5xx 가 아니다 — Cloudflare 가 덮어쓰지 않는 번호)', res.status === 424, res.status);
check('   502·504 가 아니다', res.status !== 502 && res.status !== 504, res.status);
check('★ 본문이 JSON 이다 (화면이 읽을 수 있다)', out.error === '판정 실패', out);
check("★ 429 가 사유에 남는다 (화면이 '한도 초과' 로 갈라 읽는다)", /429/.test(out.detail || ''), out.detail);

console.log('\n[⑦ 키가 없으면 즉시 503 — 3분 기다리지 않는다]');
res = await onRequest({request: post({docType: '구매영수증', fileBase64: PNG}), env: {}});
check('★ 503 으로 바로 답한다', res.status === 503, res.status);
/* 릴레이 설정만 있으면 구글 키는 Supabase 쪽에 있으니 간다 */
stubFetch(modelSays({verdict: '이상 없음', reason: '일치'}));
res = await onRequest({request: post({docType: '구매영수증', fileBase64: PNG, mimeType: 'image/png'}),
  env: {SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_test'}});
check('   릴레이 설정만 있어도 503 이 아니다 (구글 키는 Supabase secrets 에)', res.status === 200, res.status);

console.log('\n[⑧ 릴레이 설정이 없으면(로컬) 전처럼 구글 직접 — 9/6 까지의 길]');
stubFetch(modelSays({verdict: '이상 없음', reason: '일치'}));
res = await onRequest({request: post({docType: '구매영수증', fileBase64: PNG, mimeType: 'image/png'}), env: {GEMINI_API_KEY: 'test-key'}});
check('★ 구글 REST 주소로 간다 (SDK 없이)', /generativelanguage\.googleapis\.com\/v1beta\/models\/.*:generateContent/.test(sent.url), sent.url);
check('★ 키는 헤더로 보낸다 (주소에 안 붙인다 — 로그에 남는다)',
  !/key=/.test(sent.url) && sent.init.headers['x-goog-api-key'] === 'test-key', sent.url);
check('   x-region 은 안 붙는다 (구글이 모르는 헤더)', !('x-region' in sent.init.headers), sent.init.headers);

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 서버함수가 켜지고, 주고받는 모양이 맞다');
process.exit(fail ? 1 : 0);
