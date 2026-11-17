/* ════════════════════════════════════════════════════════════
   api.js — AI 검수 호출 계층 ★ 화면 ↔ 서버함수의 계약서
   담당: 유진 (인수인계 → 선미)

   2026-08-31 화면에 연결됨 — index.html 로드 · runInspect()에서 자동 호출(2안).
   ⚠️ 서버함수 경로(JUDGE_URL)는 아직 미합의. 배포 형태가 정해지면 한 줄만 고치면 된다.

   왜 이 파일이 있나 — 화면 파일(screen-*.js)에 fetch 를 직접 넣지 않기 위해서.
   db.js 가 DB의 계약서인 것처럼, 이 파일이 AI 판정의 계약서다.
   화면은 judgeAttachment() 하나만 부르면 되고, 그 안이 어떻게 바뀌든 화면은 안 고친다.

   경로:  화면  →  api.js  →  functions/judge.js  →  Gemini
                  (여기)      (Cloudflare)          (외부)

   ★ 값이 아니라 '상태'를 돌려준다.
     AI 판정은 실패할 수 있고 몇 초 걸린다. 그래서 성공/실패를 던지지 않고
     화면이 그대로 그릴 수 있는 상태값을 항상 돌려준다 — 예외 처리를 화면에
     떠넘기지 않기 위해서다.
   ════════════════════════════════════════════════════════════ */

/* 서버함수 주소. Cloudflare Pages Functions 규칙상 functions/judge.js → /judge */
var JUDGE_URL = '/judge';

/* AI가 낼 수 있는 판정 3값 (루브릭 v4 §0-1 규칙 A).
   '수취완료' 같은 담당자 확정값은 여기 없다 — AI는 의견만 낸다. */
var AI_VERDICTS = ['이상 없음', '확인 권장', '판단 보류'];

/* ── 끊는 시간과 재시도 (2026-09-02 유진) ─────────────────────
   ★ 왜 필요한가 — 전에는 시간을 재서 끊는 코드가 없었다.
     화면은 안 멈춘다(규칙 대조를 먼저 그리고 AI 는 항목 카드에서만 돈다).
     그런데 응답이 영영 안 오면 **그 카드의 '판독 중' 스피너가 영영 돈다.**
     담당자는 기다려야 하는지 실패한 것인지 알 수 없다. 시연에서 제일 곤란한 모양이다.

   60초인 이유 — 실측 응답은 평균 8초, 최대 39초였다(2026-08-28 · run-20260828-03).
   40초로 끊으면 정상 응답을 죽인다. 60초면 최대치의 1.5배이고,
   담당자가 '이건 안 오는구나' 로 판단하기에도 충분히 길다.

   ⚠️ 재시도는 '끊긴 것' 에만 한다. 429(분당 한도 초과)는 재시도하면
     한도를 더 깎아 다음 항목까지 무너뜨린다 — 무료 키는 분당 20회다(judge.js 머리말).
     HTTP 4xx 도 다시 보내봐야 같은 답이다. */
var JUDGE_TIMEOUT_MS = 60000;
var JUDGE_RETRY_WAIT = 2000;   /* 끊긴 뒤 한 번만 다시 — 잠깐의 네트워크 끊김을 넘긴다 */

/* ── 424 "User location is not supported" 는 4xx 의 예외다 (2026-09-07 밤 선미 · dev 실측) ──
   ★ 왜 — 서버함수(/judge)는 Cloudflare 가 **사용자 근처 데이터센터**에서 돌린다. 한국 회선은
     도쿄(NRT)·서울(ICN)·**홍콩(HKG)** 으로 갈리고, Gemini 는 홍콩(중국 권역)을 지원 지역에서 뺐다.
     /ai-check 를 새로고침할 때마다 NRT ↔ HKG 가 번갈아 나왔다 — 요청 절반이 죽는 상태였다.
     9/6 에 켠 Smart Placement 는 함수를 미국으로 옮기지 못하고 있다(설정 확인은 별도).
   ★ 그래서 — 이 424 만은 다시 보낸다. **같은 요청을 다시 보내면 다른 데이터센터로 갈 수 있다.**
     구글이 생성 전에 거절한 것이라 분당 한도도 안 깎인다(429 와 다르다).
   ★★ 그런데 실측(9/7 밤 00:30 · #228 · 5항목)에서 **세 번 다 홍콩**이었다 — 브라우저가 같은 연결(keep-alive)을
     다시 쓰니 같은 데이터센터로 간다. 경로는 분 단위로나 바뀐다(몇 분 뒤 손으로 누른 [다시 판정]은 됐다).
     그래서 자동 재시도는 **0 으로 둔다** — 효과 없이 4초를 끌고 요청만 3배였다. 감지·문구·기록은 남긴다.
     제대로 막는 길은 실행 지역을 고를 수 있는 곳(Supabase Edge Function · x-region 서울)으로 /judge 를 옮기는 것뿐이다.
     재시도 장치는 그대로 두었다 — 값을 올리면 다시 산다(검사 ⑦이 장치 자체는 계속 본다). */
var JUDGE_COLO_RETRIES = 0;
var JUDGE_COLO_BLOCK_RE = /location is not supported|FAILED_PRECONDITION/i;
function isColoBlocked(text){ return JUDGE_COLO_BLOCK_RE.test(String(text || '')); }

/* 시간 제한이 붙은 fetch. 시간이 지나면 요청을 실제로 끊는다(AbortController).
   ★ clearTimeout 을 성공·실패 양쪽에서 반드시 부른다 —
     안 부르면 이미 끝난 요청을 나중에 끊으려 들고, 타이머가 쌓인다. */
/* 실패 본문에서 **읽을 수 있는 한 줄**을 뽑는다 (2026-09-06)
   ★ 왜 — dev 에서 /judge 가 502 를 냈을 때 화면에 `<!DOCTYPE html> <!--[if lt IE 7]>…` 200자가 떴다.
     그 200자 안에는 아무 정보가 없었다. 담당자도 나도 무슨 일인지 알 수 없어 다섯 번을 다시 눌렀다.
     Cloudflare 오류 페이지는 <title> 과 "Error code NNNN" 에 이유를 적는다 —
     예: "Worker exceeded resource limits" · "Worker threw exception" · "Bad gateway".
     그 줄을 꺼내 보여 주면 다음 클릭에서 바로 갈린다. */
function httpErrorGist(t) {
  var s = String(t || '');
  if (s.charAt(0) !== '<') return s.slice(0, 200);           /* JSON 등 — 그대로 */
  var title = (s.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
  var code  = (s.match(/Error code[^0-9]*(\d{3,4})/i) || [])[1] || '';
  var ray   = (s.match(/Ray ID[^0-9a-f]*([0-9a-f]{12,})/i) || [])[1] || '';
  var out = (title ? title.replace(/\s*\|.*$/, '').trim() : 'HTML 오류 페이지');
  if (code) out += ' · Error ' + code;
  if (ray)  out += ' · Ray ' + ray;
  return out;
}

function fetchWithTimeout(url, opt, ms) {
  var limit = ms || JUDGE_TIMEOUT_MS;
  if (typeof AbortController === 'undefined') return fetch(url, opt);   /* 아주 옛 브라우저 */
  var ac = new AbortController(), timer = null;
  var out = Object.assign({}, opt, {signal: ac.signal});
  return new Promise(function (resolve, reject) {
    timer = setTimeout(function () {
      ac.abort();
      reject(new Error('AI 응답이 ' + Math.round(limit / 1000) + '초 안에 오지 않았습니다 (시간 초과)'));
    }, limit);
    fetch(url, out).then(resolve, reject);
  }).then(function (r) { clearTimeout(timer); return r; },
          function (e) { clearTimeout(timer); throw e; });
}

/* 본문을 한 번 읽었으니 같은 모양으로 다시 싼다 — 부르는 쪽은 res.ok · res.status · res.text() · res.json() 만 쓴다 */
function rewrapResponse(res, text) {
  return {ok: !!res.ok, status: res.status,
          text: function () { return Promise.resolve(text); },
          json: function () { return Promise.resolve(JSON.parse(text)); }};
}
/* 시간 초과·네트워크 끊김이면 한 번만 다시 보낸다. 429·4xx 는 그대로 올린다.
   ★ 예외 하나 — 424 본문이 "location is not supported" 면 데이터센터 운이 나쁜 것이라 두 번 더 (위 머리말). */
function postJudge(body) {
  var opt = {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)};
  var wait = function () { return new Promise(function (r) { setTimeout(r, JUDGE_RETRY_WAIT); }); };
  var attempt = function (left) {
    return fetchWithTimeout(JUDGE_URL, opt).then(function (res) {
      if (res.status !== 424) return res;
      return res.text().then(function (t) {
        if (isColoBlocked(t) && left > 0) {
          console.warn('[AI] 서버함수가 Gemini 미지원 지역(홍콩 등)에서 돌았습니다 — 다른 데이터센터로 다시 보냅니다 (' + left + '회 남음)');
          return wait().then(function () { return attempt(left - 1); });
        }
        return rewrapResponse(res, t);
      });
    });
  };
  return attempt(JUDGE_COLO_RETRIES).catch(function (e) {
    var msg = String((e && e.message) || e);
    if (/429|quota|rate|HTTP 4/i.test(msg)) throw e;      /* 다시 보내면 더 나빠진다 */
    console.warn('[AI] 한 번 더 시도합니다 —', msg);
    return wait().then(function () { return fetchWithTimeout(JUDGE_URL, opt); });
  });
}

/* ── 한 첨부파일에 대한 AI 판정 요청 ──────────────────────────
   input  {
     docType      '구매영수증'  체크리스트 항목의 표시명 (40자 이내)
     file         File          <input type="file"> 에서 받은 그대로
     formValue    '1,900,000원' 시스템 등록 금액 (없으면 금액 대조를 건너뛴다)
     vatDeduction true|false|null  매입세액공제 여부 (폼 vat_deduction)
                                   · true  → 서류의 공급가액과 대조
                                   · false → 서류의 합계금액과 대조
                                   · null  → 모름. 통과시키지 않고 '확인 권장' + 사유
                                             (루브릭 §2-E1)
   }

   반환 (항상 이 모양. 예외를 던지지 않는다)  {
     state    'done' | 'error'
     verdict  '이상 없음' | '확인 권장' | '판단 보류' | null
     reason   '서류 1,250,000원 / 등록 1,205,000원 · 차이 45,000원'
     amount   '1,250,000'   AI가 서류에서 읽은 금액 (없을 수 있음)
     error    실패 사유 (state==='error' 일 때만)
   }
   ────────────────────────────────────────────────────────── */
/* 실패를 무엇으로 기록할까 — inspection.status 에 남는 값 (설계안 §3)
   'quota'   분당 한도 초과. 잠시 뒤 다시 하면 된다
   'timeout' 시간 안에 안 왔다. 이제는 실제로 재서 끊은 것이다
   'error'   그 밖 (서버 오류·형식 오류 등) */
function judgeFailKind(e) {
  var m = String((e && e.message) || e);
  if (/429|quota|rate/i.test(m)) return 'quota';
  if (/시간 초과|abort|timeout/i.test(m)) return 'timeout';
  return 'error';
}
/* 담당자가 읽을 한 문장 — 무엇을 하면 되는지까지 적는다.
   "실행하지 못했습니다" 만 있으면 기다릴지 다시 누를지를 알 수 없다. */
function judgeFailText(e) {
  var k = judgeFailKind(e);
  if (k === 'quota')   return 'AI 호출 한도를 넘었습니다 — 1분 뒤 [다시 판정]을 눌러 주세요.';
  if (k === 'timeout') return 'AI 응답이 오지 않아 중단했습니다 — [다시 판정]을 누르거나 담당자가 직접 확인해 주세요.';
  /* 데이터센터 운 — 지금 당장 다시 눌러도 같은 곳으로 간다. 몇 분 뒤에는 대개 된다 (2026-09-07 밤 실측) */
  if (isColoBlocked((e && e.message) || e))
    return 'AI 서버가 Gemini 미지원 지역(홍콩)에 걸렸습니다 — 몇 분 뒤 [다시 판정]을 눌러 주세요. 지금 바로 누르면 같은 곳으로 갑니다.';
  return 'AI 검수를 실행하지 못했습니다. 담당자가 직접 확인해 주세요.';
}

function judgeAttachment(input) {
  var mime = input.file.type || 'image/jpeg';
  return shrinkForJudge(input.file).then(function (sent) {
    mime = sent.type || mime;
    return fileToBase64(sent);
  }).then(function (b64) {
    return postJudge({
      docType:      input.docType,
      fileBase64:   b64,
      mimeType:     mime,
      formValue:    input.formValue,
      vatDeduction: input.vatDeduction
    });
  })
  .then(function (res) {
    if (!res.ok) return res.text().then(function (t) {
      throw new Error('HTTP ' + res.status + ' — ' + httpErrorGist(t));
    });
    return res.json();
  })
  .then(function (r) {
    /* 서버가 규격 밖 값을 주면 통과시키지 않는다.
       judge.js 안에도 같은 안전망이 있지만, 화면 바로 앞에서 한 번 더 막는다 —
       '수취완료'가 화면에 뜨면 AI가 서류를 승인한 모양이 되어 감사 방어가 무너진다. */
    var verdict = AI_VERDICTS.indexOf(r.verdict) >= 0 ? r.verdict : '판단 보류';
    return {
      state:   'done',
      verdict: verdict,
      reason:  r.reason || '',
      amount:  r.amount || null,
      /* 저장(inspection)용 재현 정보 — 서버만 아는 값이라 그대로 실어 나른다.
         판정값을 강등했으면 그 사실이 status 에 남는다(parse_error). */
      model:      r.model || null,
      promptHash: r.promptHash || null,
      status:     (verdict === r.verdict) ? (r.status || 'success') : 'parse_error'
    };
  })
  .catch(function (e) {
    /* 실패해도 화면이 멈추지 않게 한다. 담당자는 수동으로 확인하면 된다. */
    return {
      state:   'error',
      verdict: null,
      reason:  judgeFailText(e),
      amount:  null,
      /* 실패도 기록한다 — 429(쿼터)와 그 외를 갈라 inspection.status 에 남긴다.
         "AI가 안 봤다"는 사실이 남아야 감사 때 방어가 된다(설계안 §3). */
      /* ★ 전에는 429 가 아니면 전부 'timeout' 으로 적었다 — 짐작이다.
           이제는 실제로 시간을 재서 끊으므로 시간 초과를 사실로 구분한다. */
      status:  judgeFailKind(e),
      error:   String((e && e.message) || e)
    };
  });
}

/* File → base64 (data URL 앞부분 제거). judge.js 가 base64 문자열만 받는다. */
/* ★ 서버 상한(functions/judge.js MAX_BASE64)과 같은 값 — 넘으면 **보내기 전에** 막는다.
     넘겨 보내면 Cloudflare 가 HTML 502 를 준다. 화면에 <!DOCTYPE html…> 이 그대로 떠서
     담당자도 무슨 일인지 알 수 없다(2026-09-06 dev 에서 그렇게 됐다). 사실대로 말한다. */
var JUDGE_MAX_BASE64 = 8000000;
function fileToBase64(file) {
  return new Promise(function (resolve, reject) {
    var fr = new FileReader();
    fr.onload  = function () {
      var b64 = String(fr.result).split(',')[1] || '';
      if (b64.length > JUDGE_MAX_BASE64){
        return reject(new Error('파일이 너무 큽니다 — 약 ' + Math.round(b64.length / 1e6) +
          'MB 로 줄여지지 않았습니다. 사진 크기를 줄여 다시 올려 주세요'));
      }
      resolve(b64);
    };
    fr.onerror = function () { reject(new Error('파일을 읽지 못했습니다')); };
    fr.readAsDataURL(file);
  });
}

/* ── 판정 전 이미지 축소 ──────────────────────────────────────
   ★ 비용 절감이 아니라 '동작' 때문에 필요하다.
     요즘 폰 사진은 4000×3000이라 그냥 보내면 base64가 8MB를 넘어
     judge.js 의 MAX_BASE64 상한에 걸려 판정 자체가 안 된다(413).
     덤으로 응답도 빨라지고 이미지 토큰도 준다.

   원본은 건드리지 않는다 — FILES[id].blob 은 그대로 두고 '보낼 사본'만 줄인다.
   그래서 화면 뷰어의 [원본 보기]는 영향을 받지 않는다.

   PDF·이미지가 아닌 것, 축소가 실패한 것은 원본 그대로 보낸다(판정을 막지 않는다). */
var JUDGE_MAX_EDGE = 1600;   /* 긴 변 기준 픽셀 */
var JUDGE_JPEG_Q   = 0.85;

function shrinkForJudge(file) {
  return new Promise(function (resolve) {
    var type = (file.type || '').toLowerCase();
    if (type.indexOf('image/') !== 0) return resolve(file);          /* PDF 등은 그대로 */
    /* ★ 축소는 '거들 뿐'이다 — 여기서 난 예외가 판정 실패로 둔갑하면 안 된다.
       (createObjectURL·Image·canvas 중 하나라도 없는 환경에서 통째로 터지던 것을 막는다) */
    var url;
    try { url = URL.createObjectURL(file); } catch (e) { return resolve(file); }
    if (!url) return resolve(file);
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth, h = img.naturalHeight;
      var long = Math.max(w, h);
      if (!long || long <= JUDGE_MAX_EDGE){ URL.revokeObjectURL(url); return resolve(file); }
      var scale = JUDGE_MAX_EDGE / long;
      var cv = document.createElement('canvas');
      cv.width  = Math.round(w * scale);
      cv.height = Math.round(h * scale);
      try {
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(function (blob) {
          URL.revokeObjectURL(url);
          resolve(blob || file);
        }, 'image/jpeg', JUDGE_JPEG_Q);
      } catch (e) {
        URL.revokeObjectURL(url);
        resolve(file);                                                /* 실패해도 판정은 시도한다 */
      }
    };
    img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
    try { img.src = url; } catch (e) { URL.revokeObjectURL(url); resolve(file); }
  });
}

/* ── 어떤 항목이 AI 판정 대상인가 ────────────────────────────
   지금 프롬프트에 들어 있는 것은 E1(금액 대조) 하나뿐이다.
   그래서 '금액이 적힌 증빙' 항목만 보낸다 — 물품사진까지 보내봐야
   E1으로는 판정할 게 없고 호출만 늘어난다. E2~E7이 붙으면 이 목록이 넓어진다.

   ⚠️ 루브릭 §판정절차는 "한 건에 붙은 모든 첨부를 먼저 읽는다"(세트 단위)를 요구한다.
     지금은 항목별 1장 판정이라 그 요구를 아직 못 지킨다 — E2~E7 붙일 때 함께 바꿀 지점. */
/* E1 대상 문서는 루브릭이 한정한다 — "영수증·세금계산서·원가명세서의 총액".
   ⚠️ market_px(시가 확인 증빙)를 넣지 말 것. 2026-08-31 회귀에서 오탐으로 확인됐다:
     시세 캡처에는 합계가 없고 단가만 있어서, 금액 대조를 걸면 단가와 총액을 비교해버린다
     (실측 T09 — 단가 54,800 vs 등록 1,644,000 → "차이 1,589,200원", 예외④ 위반).
   ※ doc_key 표기 통일 완료(선미 409818f · 2026-08-31) — seed·DB가 코드 표기를 따른다.
     임시로 병기했던 'book_val' 은 그래서 뺐다. */
var AI_AMOUNT_KEYS = ['proof_buy', 'cost_stmt', 'value_g'];

/* ★ AI 전송 금지 목록 — 신청서는 어떤 경우에도 모델로 보내지 않는다 (2026-09-04 코칭 후 결정)
   결정 원문: "AI 전송은 폼에 입력된 내용 중 개인정보를 제외한 정보만 되도록 한정한다
              (신청서 파일을 통째로 보내는 일은 없도록)"

   ⚠️ kind === 'A' 만으로는 못 막는다 — 신청서는 평소 kind 'S'(폼)라 자연히 빠지지만,
     **appl_corp_scan(법인 인감 스캔본)은 처음부터 kind 'A'** 라 첨부 흐름을 그대로 탄다.
     (담당자가 대신 쓰던 '직접 등록' 경로도 S→A 로 바꿨는데, 그 경로는 9/4 에 없앴다)
     신청서에는 성명·주민등록번호·서명·인감이 그대로 들어 있다. 가액 증빙과 달리
     AI 가 읽어야 할 이유도 없다(E1 대상 문서가 아니다 — 루브릭이 한정한다).
   그래서 **키로 막는다.** kind 가 무엇으로 바뀌든 이 목록에 있으면 전송하지 않는다.
   ※ 서버(functions/judge.js)에도 같은 차단이 있다 — 화면을 우회해도 막히도록 2중이다. */
var AI_BLOCKED_KEYS = ['appl_corp', 'appl_indiv', 'appl_g', 'appl_corp_scan'];
function isAiBlocked(it) {
  return AI_BLOCKED_KEYS.indexOf(it && it.key) >= 0;
}

/* 판정에 쓸 수 있는 첫 첨부 id — 바이트가 손에 있거나(blob) **받아올 수 있으면**(storageKey) 대상이다.
   ★ 전에는 blob 만 봤다 (2026-09-05 선미 실주행 · #219 에서 드러남).
     새로고침하면 restoreAttachments 가 blob 을 안 받으므로 여기서 늘 null 이 나왔고,
     검수를 실행해도 AI가 **한 건도 안 보고 조용히 끝났다.** 화면에는 표시가 없었다.
     이제 저장소에서 받아올 수 있는 것도 대상으로 세고, 실제 바이트는
     보내기 직전에 ensureBlob() 이 받는다.
   ⚠️ 데모 항목은 blob 도 storageKey 도 없다 — 전과 같이 대상이 아니다. */
/* ★ 여러 파일이면 **가장 최근 것**을 본다 (2026-09-11 승희 · 선미 9/11 새벽 발견)
     후원자가 틀린 영수증을 내고 담당자가 [수취 등록]으로 올바른 영수증을 올리면 두 파일이 나란히 남는다(이력 보존 · 의도).
     전에는 첫 파일(후원자의 틀린 것)만 판정해 [다시 판정]을 눌러도 같은 결과였고, 담당자가 올린 파일은 판정을 못 받았다.
     파일은 뒤에 붙는다(concat · db.js restoreAttachments 는 uploaded_at 순으로 되살린다) → 뒤에서부터 첫 '볼 수 있는' 파일. */
function judgeableFileId(it) {
  var ids = (it.r && it.r.fileIds) || [];
  for (var i = ids.length - 1; i >= 0; i--) {
    var m = FILES[ids[i]];
    if (m && (m.blob || m.storageKey)) return ids[i];
  }
  return null;
}
function isJudgeable(it) {
  return it.included && it.kind === 'A' &&
         !isAiBlocked(it) &&                       /* ★ 신청서는 보내지 않는다 (2026-09-04) */
         AI_AMOUNT_KEYS.indexOf(it.key) >= 0 &&
         !!judgeableFileId(it);
}
function judgeableItems(c) {
  return (c.checklist || []).filter(isJudgeable);
}

/* 화면 문구 — 진짜 판정이 가능한 건과 데모 건은 다른 말을 해야 한다.
   판정 대상이 없는데 "실제 판정입니다"라고 쓰면 거짓말이 된다. */
var AI_REAL_NOTICE = 'AI 검수는 실제 판정입니다 — 첨부 이미지를 모델로 보내 금액을 대조합니다(E1)';
function aiNotice(c) {
  return judgeableItems(c).length ? AI_REAL_NOTICE : AI_SIM_NOTICE;
}

/* ── 서류에서 값 뽑아오기 (E4·E5·E6) ─────────────────────────
   judgeAttachment() 와 짝이지만 하는 일이 다르다.
     judgeAttachment  AI가 금액을 읽고 **판정까지** 한다 (E1)
     extractAttachment AI는 값만 뽑고, **판정은 rules-compare.js 가** 한다 (E4·E5·E6)

   ★ 왜 나눴나 — 2026-08-31 실측에서 배웠다. 시가자료(단가만 있고 합계 없음)에
     금액 대조를 시켰더니 AI가 단가와 총액을 비교해 '차이 1,589,200원' 오탐을 냈다.
     "비교하라"는 지시를 너무 충실히 따른 것이다. 값만 뽑게 하면 코드가
     "합계가 없으니 대조 안 함"으로 넘긴다. 특칙·예외도 코드에 있어야 관리된다.

   반환 (판정과 마찬가지로 예외를 던지지 않는다) {
     state 'done' | 'error'
     facts { docKind, qty, qtyUnit, unitPrice, total, supply, issuerBizNo, issueDate, unreadable[] }
     error 실패 사유 (state==='error' 일 때만)
   }
   ────────────────────────────────────────────────────────── */
function extractAttachment(input) {
  var mime = input.file.type || 'image/jpeg';
  return shrinkForJudge(input.file).then(function (sent) {
    mime = sent.type || mime;
    return fileToBase64(sent);
  }).then(function (b64) {
    return postJudge({
      mode:       'extract',
      docType:    input.docType,
      fileBase64: b64,
      mimeType:   mime,
      /* ★ 오늘 날짜를 넘긴다. 안 넘기면 모델이 2026년을 '미래'로 보고
           날짜를 이유로 판정을 흔든다 (2026-08-31 T09 실측). */
      today:      input.today || TODAY
    });
  })
  .then(function (res) {
    if (!res.ok) return res.text().then(function (t) {
      throw new Error('HTTP ' + res.status + ' — ' + httpErrorGist(t));
    });
    return res.json();
  })
  .then(function (r) {
    if (r && r.error) throw new Error(r.error);
    return {state: 'done', facts: r};
  })
  .catch(function (e) {
    /* 실패해도 화면이 멈추지 않는다 — 규칙 대조와 E1 은 그대로 돈다 */
    return {state: 'error', facts: null, error: String((e && e.message) || e)};
  });
}

/* 추출 대상 — 첨부(A) 중 실제 파일이 붙어 있는 것 전부.
   ⚠️ E1(금액)과 대상이 다르다. E5·E6은 '어느 자리에 무엇이 올라왔나'를 보므로
     물품사진·시가증빙까지 포함해야 한다. E1은 금액이 적힌 서류만 봤다. */
function extractableItems(c) {
  return (c.checklist || []).filter(function (it) {
    /* ★ 신청서는 kind 가 'A' 로 바뀌어도 제외한다 (2026-09-04) — AI_BLOCKED_KEYS 주석 참조 */
    return it.included && it.kind === 'A' && !isAiBlocked(it) && !!judgeableFileId(it);
  });
}

/* ── 저장된 판정 되살리기 ────────────────────────────────────
   화면을 새로 그려도(새로고침·역할 전환) 지난 판정이 그대로 보이게 한다.
   이게 없으면 '매 호출마다 저장'의 목적 ①(시연 중 재호출 방지)이 성립하지 않는다.

   ★ 왜 db.js 가 아니라 여기서 붙이나 —
     E1 finding 은 checklist_item_id 가 NULL 이다(대조 판정은 어느 서류 슬롯에도 속하지 않는다).
     그래서 "어느 항목 카드에 보여줄지"는 DB가 아니라 화면 규칙이 정해야 한다.
     지금 규칙: 그 건의 금액증빙 항목 중 첫 번째.

   실패 기록('대기중')은 되살리지 않는다 — 지난번에 AI가 못 본 사실은 DB에 남아 있지만,
   화면에 묵은 실패 딱지를 띄우면 담당자가 방금 실패한 줄로 읽는다. */
function restoreSavedJudgments(c) {
  var saved = (c && c.savedFindings) || [];
  if (!saved.length) return 0;
  var n = 0;
  (c.checklist || []).forEach(function (it) {
    if (it.r.aiJudge) return;                                   /* 이번 세션 판정이 우선 */
    if (!it.included || AI_AMOUNT_KEYS.indexOf(it.key) < 0) return;
    for (var i = 0; i < saved.length; i++) {                    /* 최신 실행이 앞에 있다 */
      var f = saved[i];
      if (f.ruleCode !== 'E1' || AI_VERDICTS.indexOf(f.verdict) < 0) continue;
      it.r.aiJudge = {state:'done', verdict:f.verdict, reason:f.reason,
                      amount:f.amount, file:f.file, at:f.at, restored:true};
      n++;
      break;
    }
  });
  return n;
}
/* ── 저장된 '뽑은 값' 되살리기 (2026-09-11 승희 · 루브릭 G06 실주행) ──
   E1 판정은 위에서 되살리는데 **값 뽑기 결과(facts)는 메모리에만** 있었다. 새로고침하면 사라지고,
   9/10 부터 "이미 읽은 파일은 다시 안 부른다"라 다시는 돌아오지 않았다. 그 상태에서 기관 증빙이
   새로 들어와 검수하면 E4 세트 판정(pickSource)이 영수증을 못 보고 «수량 서류가 없다»고 말했다.
   판정 행에 같이 저장한 facts(patch-20260911-finding-facts)를 지금 붙어 있는 파일 이름으로 되살린다.
   ⚠️ 이번 세션에서 뽑은 값이 있으면 그것이 정본 — 덮지 않는다. */
function restoreSavedFacts(c) {
  var saved = (c && c.savedFindings) || [];
  if (!saved.length) return 0;
  var n = 0;
  (c.checklist || []).forEach(function (it) {
    if (!it.r || it.r.facts) return;
    if (!it.included || it.kind !== 'A' || isAiBlocked(it)) return;
    var cur = judgeableFileId(it);
    if (!cur) return;
    var name = fileMeta(cur).name || '';
    for (var i = 0; i < saved.length; i++) {                    /* 최신 실행이 앞 */
      var f = saved[i];
      if (!f.facts || f.file !== name) continue;
      it.r.facts = Object.assign({}, f.facts, {fileId:cur, file:name, restored:true});
      n++;
      break;
    }
  });
  return n;
}
function restoreAllSavedJudgments() {
  var n = 0, k = 0;
  (DB.cases || []).forEach(function (c) { n += restoreSavedJudgments(c); k += restoreSavedFacts(c); });
  if (k) console.log('[AI] 저장된 뽑은 값 ' + k + '건을 되살렸습니다 — 새 서류만 다시 읽습니다.');
  if (n) console.log('[AI] 저장된 판정 ' + n + '건을 되살렸습니다 — API를 다시 부르지 않습니다.');
  return n;
}

/* ── 화면에서 쓰는 법 ────────────────────────────────────────
   버튼을 누르면 '검수 중' 을 먼저 그리고, 결과가 오면 다시 그린다.
   응답이 3~11초 걸리므로 대기 표시가 없으면 멈춘 것처럼 보인다 (2026-08-28 실측).

     render('검수 중…');
     judgeAttachment({
       docType:      item.doc_name,
       file:         fileInput.files[0],
       formValue:    won(donation.book_value),
       vatDeduction: donation.vat_deduction
     }).then(function (r) {
       if (r.state === 'error') { render('검수 실패 — ' + r.reason); return; }
       render(r.verdict + ' · ' + r.reason);
     });

   ⚠️ AI 판정은 담당자 확정값이 아니다. 화면에서도 checklist_item.status 를
      건드리지 말고, 옆에 표기로만 붙인다 (DB설계안 §2-③).
   ────────────────────────────────────────────────────────── */

/* ── 합의가 필요한 것 (선미·연수 확인) ───────────────────────
   1. (해소 2026-08-31 · 선미 확인) 서버함수 경로는 '/judge' 가 맞다 —
      Pages 배포 시 app/ 을 프로젝트 루트로 잡으므로 functions/judge.js → /judge
   2. formValue 를 무엇으로 넘길지 — 장부가액(book_value)인지 공정가액인지.
      루브릭 E1 은 '시스템 등록 금액' 이라고만 돼 있다
      → 2026-08-31 확정: 잠정 book_value. 선미가 db.js 에 registeredAmount(donation)
        헬퍼(결정 #9 · 법인=장부가액 / 법인외=시가)를 만들면 그 값으로 자동 대체된다.
        화면이 헬퍼 유무를 보고 넘기므로 이 파일은 고칠 게 없다.
   3. 판정 결과를 inspection / inspection_finding 에 언제 저장할지 —
      매 호출마다인지, 담당자가 확정할 때인지. 시연 때 재호출을 없애려면 저장이 필요하다
      (아직 미합의 — 지금은 메모리(it.r.aiJudge)에만 남아 새로고침하면 사라진다)
   ────────────────────────────────────────────────────────── */

/* ── 답 (선미, 2026-08-28 밤) ─────────────────────────────────

   1. '/judge' 로 갑니다 — 지금 배치(app/functions/judge.js)에서 맞는 경로입니다.
      다만 이건 배포 설정에 따라 갈리고 아직 배포를 안 해봤으니,
      **Cloudflare에 처음 올릴 때 다시 확인**합니다. 지금 고칠 것 없습니다.

   2. ★ formValue 는 화면이 고르지 않습니다 — db.js 가 고릅니다.

      금액 기준이 후원자 유형에 따라 갈립니다 (루브릭 §1 2×2):
          법인    → book_value (장부가액)
          법인 외 → fair_value (시가·공정가액)
      여기에 vat_deduction 이 한 겹 더 얹힙니다.

      이 규칙을 화면마다 되풀이하면 화면이 늘어날 때마다 틀릴 곳이 늘어납니다.
      db.js 가 이미 "DB ↔ 화면"의 계약서이므로, **거기에 헬퍼를 하나 두고**
      화면은 그것만 부릅니다:

          formValue: registeredAmount(donation)     ← db.js 에 있다 (선미, 8/31 커밋 07b3c72)

      ⚠️ 인자는 case 가 아니라 **donation** 입니다 (donation.donorType 을 읽어 book/fair 를 고름).
         화면 호출부(screen-staff.js)도 c.donation 을 넘깁니다. case 를 넘기면 조용히 0 이 나옵니다.

      → api.js 규격은 지금 그대로 두면 됩니다. 바뀌는 건 화면이 넘기는 값의 출처뿐입니다.

   3. ★ 매 호출마다 저장합니다 (담당자 확정 시점이 아니라).

      세 가지 이유:
        · 시연 때 재호출을 없애려면 실행 시점에 남아 있어야 한다
        · 루브릭 §7 "오탐도 반드시 기록한다" — 실패한 판정도 기록 대상이다
        · 담당자가 확정하지 않은 건도 "AI가 무엇을 봤는지"가 남아야 감사 방어가 된다

      승희님 스키마가 이미 이 답을 말하고 있습니다 —
      inspection.status 에 'timeout' · 'quota' · 'parse_error' 가 있다는 것은
      **실패한 실행도 한 행으로 남긴다**는 설계입니다.

   ── 초안에 추가해 주세요 (다음 주, 유진) ──
   ⓐ caseId(donationId) 와 checklistItemId 를 input 에 추가
      → 없으면 inspection_finding 에 "어느 건의 어느 서류인지"를 못 적습니다 (3번과 직결)
   ⓑ today (기준일) 를 input 에 추가
      → 모델이 자기 기준 현재 날짜로 판단해 2026년 데이터를 "미래"라고 지적했습니다
        (runs/run-20260828-02.md §3). E2(일자 선행)를 붙일 때 반드시 필요합니다.
   ────────────────────────────────────────────────────────── */
