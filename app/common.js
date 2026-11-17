/* ════════════════════════════════════════════════════════════
   common.js — 검수 규칙(순수 로직) · 역할/내비게이션 · 렌더 코어 · 공통 모달
   담당: 선미 관리. 다른 사람은 고치기 전에 먼저 말하기
   ==LOGIC_START==~==LOGIC_END== 구간은 node 테스트가 추출하는 순수 로직 — 마커 지우지 말 것
   ════════════════════════════════════════════════════════════ */
/*==LOGIC_START== (node 단위 테스트가 이 구간을 추출해 실행 — DOM 비의존 순수 로직) */

/* ── 오늘 날짜 ─────────────────────────────────────────────────
   ★ 2026-09-06 선미 — 여기 '2026-07-21' 이 **박혀 있었다.**
     표시만의 문제가 아니었다. 이 값이 **기록으로 저장되는 자리**에 쓰인다:
       새 접수의 접수일 · 후원자 제출일 · 취소일 · 수취 처리일 · 배분결정일 ·
       검수 실행일 · 사유 해소 날짜(감사 이력)
     실제로 실 DB 28건의 접수일·후원일이 전부 2026-07-21 로 찍혀 있었다(9/6 조회로 확인).
     신청서 서명란도 후원일자와 무관하게 늘 "2026. 7. 21." 이었다.
   ⚠️ KST 기준으로 뽑는다 — toISOString 은 UTC 라 한국 새벽에 하루가 밀린다.
   ⚠️ 시연·검사에서 날짜를 고정하려면 스크립트를 실은 뒤 TODAY 를 덮어쓴다
     (var 라서 덮어쓸 수 있다). 데모 데이터의 날짜는 db.js 에 박힌 값이라 이 값과 무관하다. */
function todayKST(){
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
var TODAY = todayKST();

/* ── 입력 마스크 — 숫자만 받고 하이픈은 화면이 붙인다 (2026-09-05 선미) ────────
   ★ 왜 만들었나 — 후원일자·연락처가 자유 텍스트라 `20260905` · `2026.09.05` ·
     `2026년 9월 5일` 이 다 들어왔다. 형식을 안내문으로 알려 주는 것은
     "사람이 외워서 맞추라" 는 말이다. 칸이 대신 맞춘다.
   ★ type="date" 를 먼저 넣었다가 물렸다 — 값이 채워진 것처럼 보이고
     흐린 예시(placeholder)가 안 뜬다. 다른 칸들과 생김새가 달라진다.
   ⚠️ 이것은 **입력 편의**다. 판정은 여전히 toDate()·donorErrors 가 한다 —
     붙여넣기·자동완성·마스크를 지원하지 않는 브라우저가 있다. */
function maskDate(v){
  var d = String(v == null ? '' : v).replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return d.slice(0, 4) + '-' + d.slice(4);
  return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6);
}
/* 이름 가리기 — 김나눔 → 김○눔 (선미 결정 2026-09-06)
   ★ 왜 만들었나 — 법인 외(개인) 후원자 이름은 DB 에 아예 안 넣었다(privacy-design §2).
     그래서 담당자 목록에 같은 품목·같은 날짜 건이 여럿이면 **접수번호 말고는 구분할 것이 없었다.**
     실주행에서 #217·#218·#219 를 가려내지 못했다.
   ★ 그래서 '안 남긴다' 를 '알아볼 수 없게 남긴다' 로 바꾼다. 구분은 되고 식별은 안 된다.
   ⚠️ 이것도 개인정보다 — 가명처리한 것이지 아닌 것이 되지 않는다.
     실명은 여전히 신청서 PDF 안에만 있고, 그것을 열면 열람 기록이 남는다(pdf.view).
   ⚠️ 법인 상호는 가리지 않는다 — 기부금영수증 발급 대상이라 원장에 그대로 있어야 한다. */
function maskName(s){
  var t = String(s == null ? '' : s).trim();
  if (!t) return '';
  if (t.length === 1) return '○';      /* 한 글자도 가린다 — DB 제약이 '○' 를 요구한다 */
  if (t.length === 2) return t.charAt(0) + '○';
  return t.charAt(0) + new Array(t.length - 1).join('○') + t.charAt(t.length - 1);
}

/* 국번이 둘(02)이냐 셋(010·070…)이냐로 갈린다. 마지막 칸은 늘 4자리로 맞춘다 */
function maskPhone(v){
  var d = String(v == null ? '' : v).replace(/\D/g, '');
  var head = (d.slice(0, 2) === '02') ? 2 : 3;
  d = d.slice(0, head === 2 ? 10 : 11);          /* 02 는 10자리, 나머지는 11자리까지 */
  if (d.length <= head) return d;
  var rest = d.slice(head);
  if (rest.length <= 4) return d.slice(0, head) + '-' + rest;   /* 아직 갈 자리가 안 됐다 */
  var mid = (rest.length > 7) ? 4 : 3;
  return d.slice(0, head) + '-' + rest.slice(0, mid) + '-' + rest.slice(mid);
}
/* 사업자등록번호 000-00-00000 — 숫자만 치면 하이픈이 붙는다 (2026-09-12 선미).
   전에는 후원자가 친 그대로 저장돼 '2208145012' 처럼 붙어 나왔다. bizMiddle 은 숫자만 보므로 검수는 안 바뀐다. */
function maskBizNo(v){
  var d = String(v == null ? '' : v).replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 5) return d.slice(0, 3) + '-' + d.slice(3);
  return d.slice(0, 3) + '-' + d.slice(3, 5) + '-' + d.slice(5);
}
/* 주민등록번호 000000-0000000 — 사업자번호와 같은 방식 (2026-09-12 선미). 한 칸에 둘을 받던 것을 종류 선택으로 갈랐다(screen-donor.js idKind) */
function maskRrn(v){
  var d = String(v == null ? '' : v).replace(/\D/g, '').slice(0, 13);
  if (d.length <= 6) return d;
  return d.slice(0, 6) + '-' + d.slice(6);
}
/* 금액 1,820,000 — 숫자만 치면 콤마가 붙는다 (2026-09-15 선미 · 테스트 참여자 의견)
   "금액(숫자) 입력할 때 천단위 표기가 자동으로 되면 입력하기 더 쉬울 것 같아요"
   ★ maskPhone·maskBizNo 와 다른 점이 하나 있다 — **저장은 콤마 없이 한다.**
     그 둘은 마스크한 값을 그대로 저장하지만(전화·사업자번호는 숫자로 계산하지 않는다),
     금액은 giftValOf 가 `Number(f.giftVal) || 0` 으로 읽는다 —
     '1,820,000' 을 저장하면 Number() 가 NaN 을 내고 **기부가액이 0 이 된다.**
     donorErrors 의 numBad() 도 "숫자만 적어 주세요" 로 막는다.
     그래서 화면은 maskMoney, 저장은 moneyDigits 로 가른다(칸이 경계다).
   ⚠️ 빈 칸은 빈 문자열로 남긴다 — isOverridden('') 이 false 라야 자동계산으로 돌아간다. */
function maskMoney(v){
  var d = moneyDigits(v);
  return d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '';
}
function moneyDigits(v){
  var d = String(v == null ? '' : v).replace(/\D/g, '').slice(0, 13);   /* 13자리 = 조 단위까지 */
  return d.replace(/^0+(?=\d)/, '');            /* 앞의 0 을 떨어낸다 — '007' → '7' ('0' 하나는 남긴다) */
}
/* 시각 표기 — DB 의 timestamptz(UTC) 를 한국 시간으로 (2026-09-12 선미 · #315).
   ★ 전에는 ISO 문자열을 `replace('T',' ').slice(0,16)` 로 잘라 그대로 썼다. 그것은 **UTC** 다 —
     13:07 에 낸 신청서가 담당자 화면에 04:07 로 떴다(9시간 전). 시각은 담당자가 "언제 낸 것인가" 를
     판단하는 값이라 9시간이 어긋나면 순서를 거꾸로 읽는다.
   ★ 서버 시계를 믿지 않고 브라우저 시계도 믿지 않는다 — 값에 붙은 시간대(Z 또는 +09:00)를
     Date 가 해석하게 두고, 보여 줄 때만 Asia/Seoul 로 고정한다. 보는 사람이 어느 나라에 있든 같다.
   빈 값·못 읽는 값이면 빈 문자열 — 없는 시각을 지어내지 않는다. */
function fmtKst(v){
  var s = String(v == null ? '' : v);
  if (!s) return '';
  var d = new Date(s);
  if (isNaN(d.getTime())) return s.replace('T', ' ').slice(0, 16);   /* 모르는 모양이면 있는 그대로 */
  var p = {};
  new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit',
                                    hour:'2-digit', minute:'2-digit', hour12:false})
    .formatToParts(d).forEach(function(x){ p[x.type] = x.value; });
  if (!p.year) return s.replace('T', ' ').slice(0, 16);
  return p.year + '-' + p.month + '-' + p.day + ' ' + (p.hour === '24' ? '00' : p.hour) + ':' + p.minute;
}
var AI_SIM_NOTICE = 'AI 검수는 사전 정의된 시뮬레이션입니다 — 실제 모델 호출·외부 통신 없음';

/* ── 검수 규칙의 근거 (표시 전용) ───────────────────────────
   재단이 실제로 검수한 기록과 실서류 검증 결과. 어떤 오류를 AI에 맡길지 고른 근거이며
   화면에 그대로 적어 "왜 이 6종인가"에 답한다. 판정 로직은 이 값을 참조하지 않는다. */
var AI_EVIDENCE = {reviewed:'1,182', flagged:'620', errorTypes:6,
                   docs:7, falsePositive:7, afterRules:'7/7', missed:0};

/* ── AI 확인 범위 (표시 전용) ───────────────────────────────
   재단 검수 세부유형 29개 중 AI가 보는 것은 13개(45%). 나머지 16개는 담당자가 직접 확인한다.
   AI가 정확할수록 사람이 덜 보게 되는 자동화 편향을 막기 위해 화면에 상시 적는다. */
var AI_SCOPE = {total:29, covered:13, blind:16, pct:45};
var AI_BLIND_NOTE = '사진 내용물·서명·배분내역은 AI가 보지 않았습니다';

/* [A] 기준자료 registry — 관리자(adminCriteria)가 편집. case는 criteriaKey로 참조 */
var CRITERIA = {
  fnd_guideline_2026:{name:'나눔사업 업무지침(후원물품) — 유형별 필수서류 매트릭스', updated:'2026-07-01',
    guideline:'후원자유형(법인 / 법인 외) × 취득경로(구매 / 제조·유통)별 접수 필수서류. 후원자 서명 또는 도장 날인이 없는 물품기부신청서는 접수 불가.', standardDays:7},
  fnd_annex1_2025:{name:'후원물품 접수·배분 시 준수사항', updated:'2025-11-01',
    guideline:'증빙서류 내용과 시스템 입력값 불일치, 서명·날인 누락, 후원/배분 일자 역전 등 확인필요 판정의 근거.', standardDays:7},
  fnd_faq_2026:{name:'후원물품 자주 묻는 질문(예외 해석)', updated:'2026-07-01',
    guideline:'가액산정(장부가액/시가)·적격 증빙·인수증 대체자료 등 예외 해석 근거.', standardDays:7}
};
/* ★ 2026-09-14 — '(예시 기관) 표준 서류기준 v1' 과 '법인 배분처 체크리스트 v2 (구버전)' 을 뺐다.
     앞은 교체 데모 프로필의 문서라 프로필과 함께 사라졌고, 뒤는 신선도 배지(⚠ 기준 갱신 오래됨)를
     보여주려고 일부러 낡은 날짜를 넣어 둔 **데모 행**이었다. 심사위원이 여는 화면에
     "구버전 · 개정 검토 필요" 가 떠 있으면 우리 기준이 낡은 것으로 읽힌다. 배지 기능은 그대로 있고
     준수사항 문서(2025-11)가 실제로 '최종 갱신 N개월 전' 로 떠서 살아 있음을 보인다. */
function getCriteria(key){ return CRITERIA[key] || {name:'—', updated:'—', guideline:'', standardDays:0}; }

/* ★ 법인 서면 신청서 (2026-09-04 코칭 후 결정) ─────────────────────────
   결정: "신청서를 서면으로 받아야 하는 경우는 인감이 필요한 법인으로 한정한다.
          법인 신청 건은 신청서 폼을 작성하되, 필수 증빙서류에 법인인감이 포함된
          신청서 스캔본이 포함되어야 한다."

   ★ 2026-09-10 재설계 — **법인은 전자서명을 쓰지 않는다.**
     법인 명의 신청서의 효력은 법인인감(직인) 날인에서 나온다. 전자서명을 고를 수 있게 두면
     '날인 없는 법인 신청서' 가 접수되고, 기관 업무지침을 화면이 스스로 어기게 된다.
     그래서 법인 경로에서는 서명 패드를 없애고 **직인 날인 이미지를 늘 필수**로 받는다.
       · appl_corp      (S) 폼 입력값 — 품목·가액 등 대조에 쓰는 값이 여기서 온다. 늘 있다
       · appl_corp_scan (A) 법인인감(직인) 날인 이미지 — **법인은 언제나 필수**
     ★ 올린 이미지는 신청서 PDF 하단 '기부자(명칭/성명)' 줄의 (인) 자리에 날인으로 들어간다
       (pdf-form.js drawSign) — 그래서 PDF 자체가 '날인된 신청서' 가 된다.
     ⚠️ DB 키는 appl_corp_scan 그대로 둔다 — 이미 저장된 건·첨부가 이 키로 이어져 있다.
        (2026-09-04 의 '조건부 필수' 는 폐기. 법인외는 전자서명 그대로다.)

   ※ 담당자가 대신 쓰던 '직접 등록' 경로는 없앴다 (2026-09-04) — 접수는 무조건 링크로 받는다.
     그래서 신청서는 **언제나 폼(S)** 이고, 법인만 서명/인감을 고른다.

   ※ AI 전송 금지 — 이 스캔본은 kind 'A' 라 첨부 흐름을 타지만 모델로는 보내지 않는다
     (api.js AI_BLOCKED_KEYS · functions/judge.js AI_BLOCKED_DOC_RE, 같은 날 결정).
   ※ '예시 기관(generic)' 프로필은 그대로 둔다 — 그쪽은 기관마다 서류 기준이 다르다는
     것을 보이는 데모이고, 인감 요구는 재단 지침 쪽 규칙이다. */
var CORP_SCAN_KEY = 'appl_corp_scan';
/* 문구 축약 (2026-09-11 선미) — "AI 로 전송하지 않는다" 는 남긴다. 국외 이전 동의문의
     "신청서는 보내지 않습니다" 와 짝이라, 어느 파일이 해외로 가지 않는지를 그 칸에서 알려 주는 자리다. */
var APPL_SCAN_NOTE = '법인인감(직인) 부분만 스캔하여 업로드해주세요. (이 파일은 AI로 전송하지 않습니다)';

/* ★ 법인 신청서의 원본 증빙은 **직인 날인 하나**다 (2026-09-10 재설계 · 연수 발견)
     전에는 '전자서명 또는 인감' 이었다. 그런데 법인 명의 서류의 효력은 직인에서 나오고,
     전자서명을 고를 수 있게 두면 날인 없는 법인 신청서가 접수된다 —
     기관 업무지침이 막으라고 한 바로 그 상태를 화면이 스스로 만든다.

     그래서 규칙을 하나로 되돌린다:
       법인    → 직인 날인 이미지가 **언제나** 필수 (전자서명 경로 없음)
       법인외  → 전자서명이 필수 (예전 그대로 · 도장 칸 없음)

   반환: 'seal' | null(날인 없음) */
function corpApplRoute(f){
  if (!f) return null;
  if (f.files && (f.files[CORP_SCAN_KEY] || []).length) return 'seal';
  return null;
}
/* 법인 직인 이미지의 파일 id — PDF 날인·미리보기가 같은 자리를 본다 */
function corpSealFileId(f){
  var ids = (f && f.files && f.files[CORP_SCAN_KEY]) || [];
  return ids.length ? ids[0] : null;
}

/* 유형별 필수서류 매트릭스 — 기관 업무지침 기준 */
/* ★ basis = 이 서류를 왜 받는가(지침 조항). 2026-09-14 에 **정본 옆으로 올렸다** —
     관리자 기준자료 화면이 근거 열을 그리는데, 그 값을 화면 쪽에 따로 적어 두면
     서류가 늘 때 또 어긋난다(9/14 에 실제로 그랬다). 읽는 곳은 viewAdminCriteria 하나이고,
     autoChecklist 가 체크리스트에 붙이는 basis 는 **그대로 둔다**(저장된 건과 어긋나지 않게).
   ⚠️ 담당자·후원자 화면에는 근거를 안 보인다(문구 규칙 9/5) — smoke-test-copy-cleanup 이 지킨다. */
var DOC_MATRIX = {
  '구매':{
    '법인':[{key:'appl_corp',basis:'기관 업무지침 · 유형별 필수서류',name:'물품기부신청서(법인용)',kind:'S',note:'후원자가 접수 링크의 폼으로 작성 — 법인은 전자서명을 쓰지 않고, 아래 직인 날인이 원본 증빙'},
            {key:'appl_corp_scan',basis:'기관 업무지침 · 법인인감 날인',name:'법인인감(직인) 날인 이미지',kind:'A',note:APPL_SCAN_NOTE},
            {key:'proof_buy',basis:'기관 업무지침 · 증빙불가 서류',name:'구매영수증 또는 매입세금계산서',kind:'A',note:'거래명세표·견적서·간이영수증은 구매 증빙 자료로 사용할 수 없습니다. 단, 간이사업자등록증 첨부 시 간이영수증 증빙 가능합니다.'},
            {key:'photo',basis:'기관 업무지침 · 물품사진',name:'물품사진',kind:'A',note:''}],
    '법인외':[{key:'appl_indiv',basis:'기관 업무지침 · 유형별 필수서류',name:'물품기부신청서(법인 외용)',kind:'S',note:'폼으로 작성·전자서명 · 개인정보 수집·이용 동의 포함 — 별도 파일 첨부 불필요'},
            {key:'proof_buy',basis:'기관 업무지침 · 증빙불가 서류',name:'구매영수증 또는 매입세금계산서',kind:'A',note:'거래명세표·견적서·간이영수증은 구매 증빙 자료로 사용할 수 없습니다. 단, 간이사업자등록증 첨부 시 간이영수증 증빙 가능합니다.'},
            {key:'photo',basis:'기관 업무지침 · 물품사진',name:'물품사진',kind:'A',note:''}]
  },
  '제조·유통':{
    '법인':[{key:'appl_corp',basis:'기관 업무지침 · 유형별 필수서류',name:'물품기부신청서(법인용)',kind:'S',note:'폼으로 작성 · 장부가액 확인서 포함 — 법인은 전자서명을 쓰지 않고, 아래 직인 날인이 원본 증빙'},
            {key:'appl_corp_scan',basis:'기관 업무지침 · 법인인감 날인',name:'법인인감(직인) 날인 이미지',kind:'A',note:APPL_SCAN_NOTE},
            /* 안내사항 3번을 여기로 (2026-09-11 선미) — 법인×제조·유통에만 붙는다 */
            {key:'cost_stmt',basis:'기관 업무지침 · 유형별 필수서류',name:'원가명세서 또는 회계장부 사본',kind:'A',note:'제출 불가 시 신청서 내 장부가액 확인서로 대체. 법인의 장부가액 세부 내역은 외부 비공개를 원칙으로 하며, 위 금액에 대한 사실 책임은 법인에 있습니다.'},
            {key:'market_px',basis:'기관 업무지침 · 공정가액',name:'시가 확인 증빙',kind:'A',note:'인터넷 판매처 캡처본·메뉴판·단가표 등 공정가액 확인'},
            {key:'photo',basis:'기관 업무지침 · 물품사진',name:'물품사진',kind:'A',note:''}],
    '법인외':[{key:'appl_indiv',basis:'기관 업무지침 · 유형별 필수서류',name:'물품기부신청서(법인 외용)',kind:'S',note:'폼으로 작성·전자서명 · 개인정보 수집·이용 동의 포함 — 별도 파일 첨부 불필요'},
            {key:'market_px',basis:'기관 업무지침 · 공정가액',name:'시가 확인 증빙',kind:'A',note:'공정가액 확인 자료'},
            {key:'photo',basis:'기관 업무지침 · 물품사진',name:'물품사진',kind:'A',note:''}]
  }
};
var DIST_DOCS = [
  {key:'inss',basis:'기관 업무지침 · 인수증 양식',name:'인수증',kind:'A',note:''},   /* 안내문 뺌 (2026-09-12 선미) — 폼·서명·직인 규칙은 기관 폼과 orgErrors 가 지킨다 */
  /* [v6] 배분기관이 실제로 받은 물품을 사진으로 증빙 — 후원자 접수 때 물품사진을 받는 것과 대칭 구조 */
  {key:'dist_photo',basis:'기관 업무지침 · 물품사진',name:'배분 물품 사진',kind:'A',note:''},   /* 안내문 뺌 (2026-09-12 선미) */
  {key:'report_dom',basis:'기관 업무지침 · 결과보고서 양식',name:'배분 결과보고서(국내지원)',kind:'A',note:''}   /* 안내문 뺌 (문구 수정 9/10) — 대체자료 규칙은 gate(common.js) 주석에 */
];
/* 법인 사업자등록번호 중간자리 (기관 업무지침) */
var CORP_BIZ_MIDS = ['81','82','85','86','87'];
/* ── 사업자등록번호 가운데 2자리 ────────────────────────────────
   ★ 정본은 여기 하나다 (2026-09-10 통합). 전에는 common.js 의 formCheck 가 `split('-')[1]` 로,
     rules-compare.js 의 bizMiddle 이 '숫자만 남기고 3~5번째' 로 **서로 다르게** 잘랐다.
     하이픈 없이 친 번호를 한쪽은 읽고 한쪽은 못 읽어, 같은 건에서 E3 는 법인으로 보는데
     bizno_fmt 는 "입력되지 않았습니다" 가 나왔다. 규칙이 갈리면 화면이 스스로 모순된다.
   하이픈이 있어도 없어도 같게 읽는다. 10자리가 아니면 빈 문자열(= 모름). */
function bizMiddle(bizNo){
  var digits = String(bizNo || '').replace(/[^0-9]/g, '');
  return digits.length === 10 ? digits.slice(3, 5) : '';
}

/* ── 폼 필드(F) 코드 판정 ──────────────────────────────
   폼 입력값 자체가 증거인 항목은 제출 시점에 코드가 결정론적으로 판정한다.
   AI가 아니라 지침 조항을 그대로 옮긴 규칙이며, 판정 불가한 항목은 건드리지 않는다.
   반환: {code:'done'|'unc', reason} 또는 null(판정 대상 아님) */
function formCheck(key, f, donorType){
  if (key === 'privacy_ok'){
    return f.privacy
      ? {code:'done', reason:'개인정보 수집·이용 동의 완료 (신청서 내 동의 항목)'}
      : {code:'unc', reason:'개인정보 수집·이용에 동의하지 않았습니다'};
  }
  if (key === 'bizno_fmt'){
    /* ⚠️ 2026-09-10 — 전에는 `split('-')[1]` 이었다. 화면의 사업자번호 칸은 하이픈을 자동으로
         붙여 주지 않으므로 후원자가 '1288145907' 로 치면 가운데가 빈 문자열이 되어
         "입력되지 않았습니다" 가 났다 — 번호는 멀쩡히 적혀 있는데도. (선미 실주행에서 드러남)
       ★ 같은 규칙이 rules-compare.js 에도 있었다(bizMiddle). 정본을 아래 bizMiddle 하나로 합쳤다. */
    /* ★ 유형을 먼저 본다 (2026-09-10) — 전에는 빈 값 검사가 앞서서, 담당자가 유형을
         법인 → 법인 외로 고친 건에서 "사업자등록번호가 없습니다" 가 났다.
         법인 외는 사업자번호를 받지 않으므로 이 항목은 **판정 대상이 아니다**(null). */
    if (donorType !== '법인') return null;
    var mid = bizMiddle(f.bizNo);
    if (!mid) return {code:'unc', reason:'사업자등록번호가 없거나 10자리가 아닙니다 — 적어 주신 값: ' +
                                          (String(f.bizNo || '').trim() || '(빈칸)')};
    if (CORP_BIZ_MIDS.indexOf(mid) < 0){
      /* 유형 확인 게이트 — 코드는 유형을 확정하지 않는다. 신호만 주고 확정은 사람 몫.
         중간자리 '01'이어도 조합 형태 공동사업자(변호사 사무소 등)처럼 법인처럼 보이나
         세법상 개인사업자인 예외가 실재한다 — 실서류 검수에서 확인된 사례. */
      return {code:'unc', reason:'후원자 유형이 다를 수 있습니다 — 중간자리 ' + mid +
        '은(는) 보통 개인사업자입니다(법인은 ' + CORP_BIZ_MIDS.join('·') + ', 기관 업무지침). ' +
        '후원자 잘못이 아니라 유형 지정 확인 사안입니다. 유형에 따라 가액 산정(장부가액/시가)과 필수서류가 달라지므로 유형 확정 후 검수를 진행하세요'};
    }
    return {code:'done', reason:'사업자등록번호 형식·법인 구분코드 확인 (중간자리 ' + mid + ')'};
  }
  return null;   /* 폼이 결정하지 않는 항목은 담당자 처리 대상으로 남긴다 */
}

/* ── [F] 항목의 사유를 건에서 다시 계산한다 (2026-09-10 연수 발견) ──────────
   ★ 무엇이 있었나
     제출 시점에 formCheck 가 낸 사유는 `it.r.memo` 에 담기는데, **DB 에 그 칸이 없다**
     (checklist_item 에 status·confirmed_at·resolution_* 만 있고 memo 가 없다 ·
      saveItemStatus 가 안 보낸다). 그래서 새로고침하면 사유가 사라지고 화면은
     itemStatus 의 기본 문구 "첨부 내용을 확인해 주세요" 로 떨어졌다 —
     담당자는 사업자등록번호가 왜 확인필요인지 알 길이 없었다(9/10 선미 실주행).

   ★ 왜 저장이 아니라 다시 계산인가
     ① [F] 판정은 **저장된 값의 순수 함수**다 (루브릭 §0 "AI는 추출기, 판정은 코드").
        다시 계산할 수 있는 것을 굳이 두 벌로 두지 않는다.
     ② 저장하면 낡는다 — 담당자가 사업자번호를 고쳐도 사유는 옛 값을 가리킨다.
     ③ 컬럼을 늘리면 실 DB 패치가 필요하다. 9/12 코드 동결 앞이라 대가가 크다.

   ⚠️ 상태(status)는 건드리지 않는다. 저장된 판정이 그때의 사실이고, 여기서 만드는 것은
     **왜 그랬는지**뿐이다. 지금 값으로는 통과라면 그 사실도 그대로 말해 준다 —
     담당자가 "고쳤으니 다시 보면 되겠다" 를 알 수 있어야 한다. */
function formCheckMemoFromCase(item, c){
  if (!item || item.kind !== 'F' || !c) return '';
  var fake = {bizNo: c.donorBizNo || '', privacy: true};
  var fc = formCheck(item.key, fake, c.donorType);
  if (!fc) return '';
  var now = (item.r && item.r.st) || 'miss';
  if (now === 'unc' && fc.code === 'done')
    return fc.reason + ' — 확인필요로 서 있으나 지금 값으로는 통과합니다 (값이 고쳐졌을 수 있습니다)';
  return fc.reason;
}

/* 폼 필드(F) 검증 항목 — 코드가 검증. 후원자유형에 따라 달라짐 */
var FORM_CHECKS = {
  '법인':[{key:'bizno_fmt',name:'사업자등록번호 형식',kind:'F',note:'후원자구분 ↔ 사업자번호 중간자리 대조 (기관 업무지침)'}],
  '법인외':[{key:'privacy_ok',name:'개인정보 수집·이용 동의',kind:'F',note:'법인 외 후원자 필수 동의 항목 (신청서 내 포함)'}]
};

/* ★ 2026-09-14 — '일반 예시 기관(교체 데모)' 프로필을 뺐다 (선미 결정).
     원래 전제는 "다른 기관이 이 플랫폼을 그대로 가져다 쓴다" 였고, 그 전제 위에
     관리자 화면의 ①공통 기준층(법령) / ②기관 덧쓰기층(기관 매뉴얼) 두 층도 서 있었다.
     실제로는 **오픈소스로 내주면 기관이 자기 것으로 다시 만든다** — 교체 데모가 할 일이 없다.
     남는 것은 심사위원에게 "이 서류는 뭐지" 를 만드는 혼란뿐이라 뺐다(그 데모의 사업자등록증이
     실제로 작업판 검수 기준 표까지 오염시켜 놓았다 — 같은 날 정정).
   ⚠️ 구조는 남겨 둔다 — profileKey 를 받는 자리(autoChecklist 등)가 10곳이 넘고
     getProfile() 이 foundation 으로 떨어지므로, 다시 필요해지면 여기 한 덩이만 더하면 된다. */
var ORG_PROFILES = {
  foundation:{label:'사회복지법인 어린이재단', matrix:DOC_MATRIX, distDocs:DIST_DOCS,
    criteriaKeys:['fnd_guideline_2026','fnd_annex1_2025','fnd_faq_2026'],
    note:'취득경로(구매 / 제조·유통)에 따라 가액 증빙서류가 달라집니다 — 기관 업무지침의 유형별 필수서류 그대로.'}
};
function getProfile(key){ return ORG_PROFILES[key] || ORG_PROFILES.foundation; }
var DEFAULT_CRITERIA_KEY = 'fnd_guideline_2026';
function profileCriteriaKey(key){
  var ks = getProfile(key).criteriaKeys;
  return (ks && ks.length ? ks[0] : DEFAULT_CRITERIA_KEY);
}

/* 공통 검수 지시 4원칙 — 기관이 바뀌어도 불변 */
var INSPECT_PRINCIPLES = [
  '덜 들어왔는데 완결로 판정하지 않는다',
  '담당자 수취 기록을 최우선으로 한다',
  '확정 체크리스트에 없는 서류를 요구하지 않는다',
  "애매하면 완결로 밀지 않고 '확인필요'로 남긴다"
];

/* ── 날짜 · 기준 신선도 ───────────────────────────── */
function monthsSince(dateStr, todayStr){
  var a = new Date(dateStr + 'T00:00:00'), b = new Date(todayStr + 'T00:00:00');
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}
function criteriaFreshness(updatedStr, todayStr){
  var m = monthsSince(updatedStr, todayStr);
  if (m >= 12) return {level:'review', months:m, label:'⚠ 기준 갱신 오래됨 — 최신 여부 확인 필요',
    msg:'서류 기준이 마지막으로 갱신된 날짜를 확인해 주세요'};
  if (m >= 6) return {level:'info', months:m, label:'최종 갱신 ' + m + '개월 전', msg:''};
  return {level:'none', months:m, label:'● 최신', msg:''};
}

/* ── 항목 상태 판정 (F2: 담당자 수취 기록이 최우선 진실) ──────────
   item.r = {st:'done'|'miss'|'unc', date, by, file, memo, broken, overdue,
             orgUpload:{status:'none'|'uploaded',date,fileName}, resolution:{reason,by,date}} */
function itemStatus(item){
  var r = item.r || {};
  if (r.resolution && r.resolution.reason){
    return {status:'사유해소', code:'res', reason:'', meta:'사유해소 · 담당자확인 · ' + r.resolution.date + ' · ' + r.resolution.by};
  }
  if (r.broken){
    return {status:'확인필요', code:'unc', reason:'서류를 인식하지 못했어요. 다시 올려주세요.', meta:r.broken};
  }
  if (r.st === 'unc'){
    return {status:'확인필요', code:'unc', reason:(r.memo || '첨부 내용을 확인해 주세요'), meta:''};
  }
  if (r.st === 'done'){
    var meta = '';
    if (r.orgUpload && r.orgUpload.status === 'uploaded') meta = '배분기관 업로드(' + r.orgUpload.date + ') · 담당자 수취 처리 완료';
    return {status:'수취완료', code:'done', reason:'', meta:meta, date:r.date, by:r.by};
  }
  /* [F2] 후원자·배분기관이 올렸을 뿐 담당자 수취 처리가 없으면 '수취완료'로 표기하지 않는다.
     "파일이 올라왔다 ≠ 그 서류를 받았다" — 항목을 확정하는 것은 담당자 수취 처리뿐이다. */
  /* ★ "제출됨 · 확인 전" — 수취 축과 AI 축을 가른다 (2026-09-11 선미 · A안)
       전에는 이 상태도 '확인필요' 주황이라, AI 의 '확인 권장' 주황과 나란히 서서 읽기 전엔 구분이 안 됐다.
       파일은 와 있고 담당자가 아직 안 본 것뿐이므로 사실대로 적고(tone 'neu' · 회색),
       주황은 AI 판정에만 남긴다. code 는 'unc' 그대로 — 게이트·수취 흐름은 안 바뀐다.
       '수취 대기' 라 하지 않는 이유: 안 온 것(미수취)으로 읽힌다. */
  if (r.orgUpload && r.orgUpload.status === 'uploaded'){
    return {status:'제출됨 · 확인 전', code:'unc', tone:'neu',
            reason:'배분기관이 제출했습니다 — 원본을 보고 수취 처리해 주세요', meta:''};
  }
  if (r.donorUpload && r.donorUpload.status === 'uploaded'){
    return {status:'제출됨 · 확인 전', code:'unc', tone:'neu',
            reason:'후원자가 제출했습니다 — 원본을 보고 수취 처리해 주세요', meta:''};
  }
  /* [S] 폼으로 제출된 신청서는 **수취완료로 확정한다** (선미 결정 2026-09-06).
       ★ 전에는 '확인필요' 였다 — 기관 업무지침(접수내용 검토)을 근거로,
         품목·가액 산정 경위·비고란 특이사항은 담당자가 원문을 보고 판단하라는 뜻이었다.
       ★ 왜 바꿨나 — 이 폼은 **다 채우고 서명해야 제출 자체가 된다**(donorErrors 가 막는다).
         받은 서류인 것은 이미 확실하다. 그런데 담당자에게는 "확인필요" 로 서서
         건마다 클릭 한 번을 더 요구했다. 확정을 위해 눌러야만 하는 버튼은
         결국 내용을 안 보고 눌리게 된다 — 그건 검수를 강화하는 게 아니라 흉내만 낸다.
       ⚠️ 품목·가액이 타당한가는 **없어지지 않았다** — 구매영수증 항목의 AI 대조(E1)와
         대조 판정(E4·E5·E6)이 본다. 신청서 원문은 [신청서 원문 보기] 로 언제든 연다.
       ⚠️ 법인이 인감으로 낸 건은 **인감 스캔본이 별도 항목**으로 남아 있다 — 그쪽이 막는다. */
  if (r.formSubmit && r.formSubmit.status === 'submitted'){
    /* ★ 법인은 전자서명과 인감 중 고른다 (2026-09-04 · 저녁 보완).
         그래서 "서명이 없다" 가 이상인지 정상인지는 **제출본이 어느 쪽이었나**에 달렸다.
         formSubmit.signed 가 그 사실을 들고 있다 — 담당자가 무엇을 봐야 하는지 그대로 적는다.
         ⚠️ 이걸 안 갈라 적으면 인감으로 낸 건에 "전자서명 확인" 이 떠서
            담당자가 있지도 않은 서명을 찾다가 반려한다. */
    var corpForm = (item.key === 'appl_corp');
    var eSigned = (r.formSubmit.signed !== false);
    return {status:'수취완료', code:'done', reason:'',
            date: r.formSubmit.date || r.date || '',
            by: '폼 제출(필수항목·서명 코드 검증)',
            meta: eSigned
              ? '폼으로 작성 · 전자서명 확인'
              : (corpForm ? '폼으로 작성 · 법인은 전자서명을 쓰지 않습니다 — 직인 날인 이미지 항목에서 확인'
                          : '폼으로 작성 · 전자서명 없음')};
  }
  /* ★ 제출은 있는데 서류 파일이 없다 (2026-09-07 · 승희 실 DB 조회 → 선미)
       여기까지 왔다는 것은 위의 어떤 증거도 없다는 뜻이다 — 담당자 확정도, 폼 제출본도, 업로드도.
       그런데 form_submission 에는 행이 있다. 그대로 두면 '미수취' 로 서서
       **낸 사람은 냈는데 담당자는 안 왔다고 본다.** 우리가 없애려는 바로 그 일이다.
     ⚠️ '수취완료' 로 올리지 않는다 — 서류가 실제로 없으므로 받은 것이 아니다.
       확인필요로 세우고 무엇을 해야 하는지(재제출 요청)까지 적는다.
     ⚠️ 이 자리는 9/2~9/3 옛 행들이다(9/4 에 PDF 생성 자리가 잡힌 뒤로는 나지 않는다).
       그래도 화면은 사실을 말해야 한다. */
  if (r.formNoFile){
    var who = (r.formNoFile.role === 'org') ? '배분기관이' : '후원자가';
    return {status:'확인필요', code:'unc',
            reason: who + ' 제출했지만 서류 파일이 저장되지 않았습니다 — 재제출을 요청해 주세요',
            meta: '제출됨 · 서류 파일 없음' + (r.formNoFile.at ? ' · ' + r.formNoFile.at : '')};
  }
  /* ★ 선택 항목(결과보고서)은 빨갛게 세우지 않는다 (2026-09-15 선미 · 테스트 참여자 의견, 두 차례)
       ★ 무엇이 문제였나 — 게이트에서는 9/8 에 이미 뺐는데(GATE_OPTIONAL_KEYS) **화면만 오류로 그리고 있었다.**
         빨간 왼쪽 띠(st-miss) · 분홍 배경 · 빨간 ✕(chk miss) · 빨간 배지(pill dg) 넷이 동시에 붙어,
         **완결한 건을 열어도** 담당자가 처리할 일이 남은 것처럼 보였다. 처음 쓰는 사람이 멈춰서
         안내를 다시 읽은, 동료 테스트에 기록된 유일한 지점이다.
       ★ 손잡이는 9/11 '제출됨 · 확인 전' 과 같다 — code 는 'miss' 그대로 두고 tone 만 'neu' 로 보낸다.
         수취 흐름 · 완결 게이트 · DB 값('미수취') · missingCount 는 한 줄도 안 바뀐다
         (smoke-test-gate-report.mjs 가 code·missingCount 를 일부러 단정한다).
       ★ 라벨에서 '미수취' 를 지우지 않는다 — 안 온 것을 왔다고 하지 않는다. 항목도 화면에 그대로 둔다.
         괄호 부연은 문구 규칙 4번에 걸려 중점으로 잇는다(9/11 과 같은 꼴).
       ★ 사유줄은 '미수취 상태입니다' 를 쓰지 않는다 — 안 온 것을 말하는 자리가 아니라
         **완결해도 된다는 것을 말하는 자리**다.
       ⚠️ 문구 규칙 1(한 자리에 한 문장)·5(라벨 되풀이 금지)를 여기서는 일부러 비켜 간다 (선미 결정 2026-09-15).
         배지만으로는 "선택인데 미수취면 어떻게 되는 건가" 가 안 풀린다 — 테스트 참여자가 멈춰서
         안내를 다시 읽은 지점이 정확히 거기다. 처음 쓰는 사람이 **다음 행동을 알 수 있게**(규칙 10)
         "완결이 가능하다" 를 말로 적는다. 짧게 줄이면 그 말이 사라진다.
       ⚠️ 기한 경과는 앞에 그대로 붙인다 — 선택 항목이라도 늦은 것은 사실이고, 숨기면 화면이 덜 말한다. */
  if (!blocksComplete(item)){
    var optReason = '배분처 제출 선택항목입니다. 미수취 상태여도 완결이 가능합니다';
    return {status:'선택 항목 · 미수취', code:'miss', tone:'neu',
            reason:(r.overdue ? '기한 경과 · ' + optReason : optReason),
            meta:(r.memo || '')};
  }
  var reason = '미수취 상태입니다';
  if (r.overdue) reason = '기한 경과 · 미수취 상태입니다';
  return {status:'미수취', code:'miss', reason:reason, meta:(r.memo || '')};
}

/* ── 검수 순수 함수: [A]기준 체크리스트 × [B]체크리스트+수취 현황 대조 ──
   게이트는 실질 조건만 본다 — "확정하기" 클릭 단계는 제거했다(2026-07-27).
   유형·경로는 담당자가 링크 발송 시 이미 지정했고 체크리스트는 그 조합의
   결정론적 전개라, 확정 클릭은 새 정보가 없는 중복 단계였다.
   실질 게이트 = 후원자 제출 대기 / 필수항목 미입력 — 이 둘만 검수를 막는다. */
/* 완결을 막지 않는 배분 서류 (2026-09-08 선미 결정 · 연수 발견)
   ★ 결과보고서는 기관 업무지침에서 **"인수증 수령이 어려운 경우 대체자료"** 다 —
     필수로 잡을 근거가 없다. 그런데 게이트가 이걸 막고 있어서, **기관이 규칙대로 제출을
     마쳐도 담당자가 완결을 누를 수 없었다.** 미수취 항목은 사유 해소도 안 되므로
     출구가 담당자가 없는 서류를 대신 올리는 것뿐이었다(#226 이 그렇게 완결됐다).
   ★ 항목 자체는 **화면에 그대로 둔다.** 기관이 내면 받아서 처리해야 한다 —
     빼는 것은 게이트 한 곳뿐이다. 폼은 이미 '선택' 이고(orgSlotRequired),
     AI 검수도 원래 안 간다(AI_AMOUNT_KEYS 에 없다). 막던 곳이 여기 하나였다.
   ★ 인수증 수취완료를 조건으로 걸지 않는다 — 조건을 안 걸면 규칙이 한 줄로 끝나고,
     안 걸어서 생기는 손해가 없다(선미). */
var GATE_OPTIONAL_KEYS = ['report_dom'];
function blocksComplete(i){ return GATE_OPTIONAL_KEYS.indexOf(i.key) < 0; }

function inspect(caseObj, todayStr){
  todayStr = todayStr || TODAY;
  if (!caseObj || caseObj.awaitingSubmit || (caseObj.missingRequired && caseObj.missingRequired.length)){
    var gateMsg = !caseObj ? '필수항목이 입력되지 않아 검수할 수 없어요'
      : caseObj.awaitingSubmit
        ? '후원자 제출 대기 중입니다 — 신청서가 제출되면 바로 검수할 수 있어요'
      : '필수항목이 입력되지 않아 검수할 수 없어요';
    return {canInspect:false, verdict:'검수대기', items:[],
      missingCount:0, reviewCount:0, doneCount:0, resolvedCount:0, totalCount:0,
      reasonLine:'', reasonMessage:gateMsg, canComplete:false};
  }
  var active = (caseObj.checklist || []).filter(function(it){ return it.included; });
  var items = active.map(function(it){
    var st = itemStatus(it);
    return {key:it.key, name:it.n, kind:it.kind, basis:it.basis, due:it.due, stage:it.stage,
            status:st.status, code:st.code, reason:st.reason, meta:st.meta, date:st.date, by:st.by};
  });
  var missingCount = items.filter(function(i){ return i.code === 'miss'; }).length;
  var reviewCount  = items.filter(function(i){ return i.code === 'unc'; }).length;
  var doneCount    = items.filter(function(i){ return i.code === 'done'; }).length;
  var resolvedCount= items.filter(function(i){ return i.code === 'res'; }).length;
  var total = items.length;
  /* 후원자 서류(접수 단계)와 배분 증빙(배분 단계)을 분리 집계 — 판정 사다리의 기준 */
  var notOk = function(i){ return i.code === 'miss' || i.code === 'unc'; };
  var intakeOpen = items.filter(function(i){ return i.stage !== '배분' && notOk(i); }).length;
  var distOpen   = items.filter(function(i){ return i.stage === '배분' && notOk(i) && blocksComplete(i); }).length;

  /* 판정 사다리 (2026-07-27 확정):
     검수대기(게이트) → 미완결(후원자 서류 미완) → 후원자서류완비(배분결정 대기)
     → 배분진행(기관 증빙 수취 중) → 완결(전부 완료) */
  var verdict, reasonMessage, canDecideDist = false;
  if (total === 0){
    /* [F1] 대조 대상 0건 → 공허참 '완결'(과완결) 차단 */
    verdict = '검수대기';
    reasonMessage = '대조할 체크리스트 항목이 없습니다. 최소 1개 항목을 확정한 뒤 검수해 주세요';
  } else if (intakeOpen > 0){
    verdict = '미완결';
    reasonMessage = (missingCount > 0)
      ? '완결 처리 전 미수취 항목을 확인해 주세요'
      : '서류를 인식하지 못했어요. 다시 올려주세요.';
  } else if (!caseObj.orgId){
    verdict = '후원자서류완비';
    canDecideDist = true;
    reasonMessage = '후원자 서류가 모두 수취되었습니다 — [배분결정]으로 배분기관을 지정하면 기관 증빙 체크리스트가 열립니다.';
  } else if (distOpen > 0){
    verdict = '배분진행';
    /* ⚠️ 결과보고서를 빼서 셈하므로 문구에서도 뺀다 — 안 그러면 화면이
         "결과보고서까지 있어야 한다" 고 말해 놓고 없이도 완결시킨다. */
    reasonMessage = '배분기관(' + (caseObj.orgName || '') + ') 증빙 수취 대기 중입니다 — 인수증·배분물품사진이 수취되면 완결할 수 있습니다.';
  } else {
    verdict = '완결';
    reasonMessage = '후원자 서류와 배분 증빙에 미수취·확인필요 항목이 없습니다. 담당자 확인 후 완결 처리하세요.';
  }
  var reasonLine = '확정 체크리스트 ' + total + '항목 중 ' + (doneCount + resolvedCount) + '항목 확인 · 미수취 '
    + missingCount + '건 / 확인필요 ' + reviewCount + '건'
    + (resolvedCount ? ' (사유해소 ' + resolvedCount + '건 포함 — 구분 표기 유지)' : '');
  var canComplete = (verdict === '완결');
  return {canInspect:true, verdict:verdict, items:items,
    missingCount:missingCount, reviewCount:reviewCount, doneCount:doneCount, resolvedCount:resolvedCount,
    intakeOpen:intakeOpen, distOpen:distOpen, canDecideDist:canDecideDist,
    totalCount:total, reasonLine:reasonLine, reasonMessage:reasonMessage, canComplete:canComplete};
}
/* 완결 게이트 차단 사유 문장 (연수 패턴 — 색뿐 아니라 문장으로) */
function gateBlockText(res){
  if (!res.canInspect) return '검수 대기 — 필수정보 입력·후원자 제출이 완료되면 검수할 수 있습니다';
  if (res.verdict === '후원자서류완비') return '배분결정 후 기관 증빙까지 수취되면 완결할 수 있습니다';
  if (res.verdict === '배분진행') return '기관 증빙 ' + res.distOpen + '건 수취 대기 — 모두 수취되면 완결할 수 있습니다';
  var p = [];
  if (res.missingCount > 0) p.push('미수취 ' + res.missingCount + '건');
  if (res.reviewCount > 0)  p.push('확인 전 ' + res.reviewCount + '건');   /* '확인필요' → 수취 축 문구로 (2026-09-11) */
  return p.length ? '' + p.join(' · ') + ' 차단' : '';
}

/* ── 자동 체크리스트 구성 (규칙 기반 — AI 아님) ──────────────────
   autoChecklist(donorType, acquisitionPath, wantsReceipt, profileKey) */
function autoChecklist(donorType, acquisitionPath, wantsReceipt, profileKey){
  var prof = getProfile(profileKey);
  var path = (acquisitionPath === '제조·유통') ? '제조·유통' : '구매';
  var corpClass = (donorType === '법인') ? '법인' : '법인외';
  var mk = function(key, name, kind, stage, basis, included, note){
    return {key:key, n:name, kind:kind, stage:stage, g:stage, basis:basis, due:'',
            included:included, note:note || '', r:{st:'miss', orgUpload:{status:'none'}}};
  };
  var list = [];
  (FORM_CHECKS[corpClass] || []).forEach(function(d){
    list.push(mk(d.key, d.name, 'F', '접수', '기관 업무지침 · 사업자번호 (코드 검증)', true, d.note));
  });
  ((prof.matrix[path] || {})[corpClass] || []).forEach(function(d){
    list.push(mk(d.key, d.name, d.kind || 'A', '접수', '기관 업무지침 · 유형별 필수서류', true, d.note));
  });
  /* 배분 증빙(distDocs)은 접수 시점에 넣지 않는다 — [배분결정]에서 기관을 지정할 때
     "배분처 수취 — {기관명}" 그룹으로 추가된다(2026-07-27 상태 체계 개편). */
  /* '영수증 발급확인' 항목은 체크리스트에서 제외(2026-07-27 결정) — 영수증 발급 여부는
     신청서 폼 입력값으로만 남기고, 서류 대조 대상에는 넣지 않는다. */
  return list;
}

/*==LOGIC_END==*/

/* ══════════════════════════════════════════════════════════════
   역할 · 내비게이션
   ══════════════════════════════════════════════════════════════ */
var ROLES = [
  {id:'staff', label:'담당자', hint:'접수 링크를 보내 건을 만들고, 제출되면 검수합니다'},
  {id:'donor', label:'후원자', hint:'담당자가 보낸 접수 링크로 여는 화면입니다'},
  {id:'org',   label:'배분기관', hint:'담당자가 보낸 증빙 제출 링크로 여는 화면입니다'},
  {id:'admin', label:'관리자', hint:'기준자료를 바꾸면 체크리스트와 검수 화면이 달라집니다'}
];
var ROLE_HOME = {staff:'home', donor:'donorForm', org:'orgForm', admin:'adminCriteria'};

/* [v6 범위축소] 배분·재고·수혜기관 메뉴 제거 — 접수 링크 발송 + 검수 + 배분 증빙 수취에 집중.
   배분기관에게서 인수증·물품 사진을 받는 흐름은 건 상세(검수 결과) 하단의 제출 링크로 처리한다. */
var STAFF_MENU = [
  {id:'home',  mod:'홈',       ic:'', label:'홈'},
  {id:'send',  mod:'접수',     ic:'', label:'신규 접수'},   /* '접수 링크 발송' → 홈 카드와 같은 이름으로 (2026-09-11 선미) */
  {id:'list',  mod:'검수',     ic:'', label:'후원건·검수'}
];
var ADMIN_MENU = [
  {id:'adminAccounts', mod:'계정',        ic:'', label:'계정 · 권한'},
  {id:'adminStats',    mod:'통계',        ic:'', label:'기본 통계'},
  {id:'adminCriteria', mod:'기준자료',    ic:'', label:'검수 기준자료'}
];
var MODULE_OF = {home:'홈', send:'접수',
  list:'검수', 'case':'검수', intakeSrc:'검수', receive:'검수'};
var SCREEN_TITLE = {
  home:'홈 대시보드', send:'신규 접수',
  list:'후원건 목록', 'case':'건 상세 · 검수',
  intakeSrc:'접수 원본 보기', receive:'수취 등록',
  donorForm:'물품기부신청서', donorDone:'제출 완료',
  orgForm:'배분 증빙 제출', orgDone:'제출 완료',
  adminAccounts:'계정 · 권한 관리', adminStats:'기본 통계',
  adminCriteria:'검수 기준자료 관리'
};
function currentModule(){ return MODULE_OF[DB.screen] || '홈'; }

/* ── nav 스택 (v4 T16/T17 계승 — in-app 전용. 브라우저 history API 미사용) ── */
var NAV_MAX = 50;
function navSnap(){ return {role:DB.role, screen:DB.screen, caseId:DB.caseId, tab:DB.tab}; }
function navSame(a,b){ return a && b && a.role===b.role && a.screen===b.screen && a.caseId===b.caseId && a.tab===b.tab; }
var _navPending = null, _navDepth = 0;
function navBegin(){ if (_navDepth === 0) _navPending = navSnap(); _navDepth++; }
function navEnd(clearFwd){
  _navDepth--;
  if (_navDepth > 0) return;
  var now = navSnap();
  if (_navPending && !navSame(_navPending, now)){
    var top = DB.nav.stack[DB.nav.stack.length - 1];
    if (!navSame(top, _navPending)) DB.nav.stack.push(_navPending);
    if (DB.nav.stack.length > NAV_MAX) DB.nav.stack.shift();
    if (clearFwd !== false) DB.nav.fwd.length = 0;
  }
  _navPending = null;
}
function navRestore(s){
  leaveSendReset();
  DB.role = s.role; DB.screen = s.screen; DB.caseId = s.caseId; DB.tab = s.tab;
  DB.inspectResult = null; DB.inspectCaseId = null; DB.preview = null;
  setBodyRole(DB.role);
}
function navBack(){
  if (!DB.nav.stack.length) return;
  DB.nav.fwd.push(navSnap());
  navRestore(DB.nav.stack.pop());
  render();
}
function navForwardGo(){
  if (!DB.nav.fwd.length) return;
  DB.nav.stack.push(navSnap());
  navRestore(DB.nav.fwd.pop());
  render();
}
function setRole(r){
  toggleNav(false);
  navBegin();
  leaveSendReset();
  DB.role = r;
  setBodyRole(r);
  DB.screen = ROLE_HOME[r] || 'home';
  DB.preview = null; DB.inspectResult = null; DB.inspectCaseId = null; DB.toast = null;
  navEnd();
  render();
}
/* ── 걷어냄 (2026-09-03 선미) ────────────────────────────────────────
   `setRoleTo(role, screen, caseId, tab)` 를 지웠다 — 호출처가 0곳이 됐다.
   이 함수는 **역할 사이를 건너뛰는 데모 지름길** 아홉 곳만 쓰던 것이다
   (후원자 화면에서 담당자 검수함으로, 담당자 화면에서 후원자 폼으로 …).

   ★ 왜 감싸지 않고 지웠나 — 요청서의 원래 계획이 "걷어낸다" 였다(연수 지적 9/3).
     전제는 *"②에 `?t=` 가 붙으면 링크로 들어갈 수 있으니 지름길이 필요 없어진다"* 였고,
     ②가 9/3 에 종료되어 그 전제가 충족됐다. 감싸면 죽은 분기가 남고,
     `isDemoMode()` 를 누가 잘못 건드리면 실서비스로 새어 나온다.

   데모에서 역할을 오가는 것은 **상단 역할 전환 바**(`renderRoleBar`)가 한다 — 그쪽만 남긴다. */
/* 역할 클래스 교체 — 드로어 열림 상태(nav-open)는 보존한다 */
function setBodyRole(r){
  var navOpen = document.body.classList.contains('nav-open');
  /* ★ body.demo — 화면 골격이 **데모인지 실서비스인지** 알아야 하는 유일한 자리 (2026-09-05 선미).
       폰 목업 테두리(styles.css)가 그렇다. 실서비스에서는 심사위원이 접수 링크를
       **PC 새 탭**에 붙여넣어 열기 때문에, 340px×640px 상자 안에 신청서가 갇히면 안 된다.
     ⚠️ className 을 통째로 갈아끼우므로 여기서 함께 붙인다. 결론은 isDemoMode() 한 곳에서만 낸다. */
  document.body.className = 'role-' + r + (navOpen ? ' nav-open' : '') + (isDemoMode() ? ' demo' : '');
}
/* 모바일 드로어 열기/닫기 — 1100px 이하에서만 보이는 ☰ 버튼이 호출 */
function toggleNav(force){
  var open = (typeof force === 'boolean') ? force : !document.body.classList.contains('nav-open');
  document.body.classList.toggle('nav-open', open);
}
function go(screen, caseId, tab){
  toggleNav(false);   /* 메뉴에서 화면을 고르면 서랍을 닫는다 */
  navBegin();
  if (screen !== 'send') leaveSendReset();
  DB.screen = screen;
  if (caseId) DB.caseId = caseId;
  DB.tab = tab || 'auto';   /* 건 상세 = 진행바 단계 (2026-09-11) · 'auto' = 지금 단계 — db.js 초기값·navRestoreSaved 도 같이 본다.
                               단계 id 가 아닌 값(옛 'receipts'·'checklist' 포함)은 screen-staff caseStepSel 이 전부 자동으로 읽는다 */
  /* ★ 수취 등록은 tab 자리에 **어느 항목을 처리하러 왔는가**(uid)를 받는다 (2026-09-05 선미).
       전에는 항목 카드가 go('receive', id, it.uid) 로 uid 를 넘겨도 renderStaff 가
       viewReceive() 를 인자 없이 불러 그 값이 아무 데도 안 닿았다. 그래서 대상 항목이
       늘 pending[0] 으로 떨어졌고, **미수취가 둘 이상인 건에서 다른 서류에 파일을 붙일 수 있었다.**
     ⚠️ 화면이 매 렌더마다 읽으면 안 된다 — 담당자가 select 로 고른 항목을 되돌려 버린다.
       그래서 **이동하는 이 순간에 한 번만** 폼에 싣는다.
     ⚠️ uid 없이 온 경로(하단 액션·수취 현황 탭)는 tab 이 undefined 라 이 분기를 타지 않는다.
       그때는 viewReceive 가 지금처럼 첫 대기 항목을 고른다. */
  if (screen === 'receive' && caseId && tab && DB.recvForm){
    DB.recvForm.caseId  = caseId;
    DB.recvForm.itemKey = tab;
    DB.recvForm.file    = '';
    DB.recvForm.memo    = '';
  }
  if (screen !== 'case'){ DB.inspectResult = null; DB.inspectCaseId = null; }
  navEnd();
  render();
  /* 홈·목록·건 상세로 올 때 원장을 조용히 다시 읽는다 (2026-09-10 승희) — 새로고침 없이도
     후원자·기관이 방금 낸 것이 보이게. 조건·간격은 db.js refreshLedgerSoon 이 정한다. */
  if (typeof refreshLedgerSoon === 'function') refreshLedgerSoon(screen);
}
function switchTab(t){ navBegin(); DB.tab = t; navEnd(); render(); }

/* ══════════════════════════════════════════════════════════════
   렌더 — DB만 읽어 화면 전체 재조립
   ══════════════════════════════════════════════════════════════ */
/* ── 첫 클릭 삼킴 방지 ──
   텍스트 입력 직후 버튼을 누르면 blur→onchange→render()가 누르는 도중(mousedown~click 사이)에
   DOM을 갈아치워 첫 클릭이 무시된다(예: 접수 링크 발송에서 [🔗 링크 복사]를 두 번 눌러야 하는 문제).
   버튼을 누르는 동안에는 재렌더를 보류했다가 클릭 처리가 끝난 직후 한 번만 렌더한다. */
var renderHold = false, renderPending = false, renderHoldTimer = null;
function releaseRenderHold(){
  if (renderHoldTimer){ clearTimeout(renderHoldTimer); renderHoldTimer = null; }
  renderHold = false;
  if (renderPending){ renderPending = false; render(); }
}
document.addEventListener('pointerdown', function(e){
  if (e.target && e.target.closest && e.target.closest('button')){
    renderHold = true;
    if (renderHoldTimer) clearTimeout(renderHoldTimer);
    renderHoldTimer = setTimeout(releaseRenderHold, 700);   /* 클릭이 무산돼도(드래그 이탈 등) 렌더가 밀리지 않게 */
  }
}, true);
document.addEventListener('click', function(){ if (renderHold) releaseRenderHold(); });
/* ── 초점 보존 (2026-09-10 승희) ──────────────────────────────────────────
   render() 는 innerHTML 을 통째로 갈아끼운다. 그래서 입력칸에서 Tab 을 누르면
   onchange → render() 가 **다음 칸이 만들어지기도 전에** 옛 칸을 지워 초점이 body 로 떨어졌고,
   다음 Tab 은 화면 맨 위 칸부터 다시 내려왔다(후원자 폼 · 9/10 동료 테스트 발견).
   ★ 어떻게 — 그리기 전에 초점 칸의 '정체'를 적어 두고, 그린 뒤 같은 정체의 칸에 초점을 되돌린다.
     정체 = id 가 있으면 id, 없으면 onchange/oninput 속성 문자열(폼 칸마다 setDonor('key',…) 로 다르다).
     마크업을 안 바꾸고 붙일 수 있는 열쇠라 이걸 쓴다. 커서 위치(selection)도 같이 되돌린다.
   ⚠️ Tab 의 경우 change 가 **초점 이동보다 먼저** 온다(크롬). 그래서 onchange 자리의 render 는
     renderAfterInput() 으로 한 틱 미뤄야 '다음 칸'이 초점을 받은 뒤에 그려지고, 여기서 그 칸을 잡는다. */
/* 칸의 '정체' — id 가 있으면 id, 없으면 핸들러 문자열(폼 칸마다 다르다). 버튼은 onclick 으로 */
function focusKeyOf(a){
  if (!a || !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(a.tagName)) return null;
  if (a.id) return '#' + a.id;
  var key = (a.tagName === 'BUTTON')
    ? 'click:' + (a.getAttribute('onclick') || '')
    : (a.getAttribute('onchange') || '') + '|' + (a.getAttribute('oninput') || '');
  return (key === '|' || key === 'click:') ? null : key;
}
function focusSnap(){
  var a = (typeof document !== 'undefined') ? document.activeElement : null;
  var key = focusKeyOf(a);
  if (a && key && a.tagName !== 'BUTTON'){
    var s = null, e = null;
    try { s = a.selectionStart; e = a.selectionEnd; } catch (err) {}
    return {tag:a.tagName, key:key, s:s, e:e};
  }
  /* ★ 초점이 칸에 없다 — Tab 으로 옮기던 중 change→render 가 끼어들어 초점이 body 로 떨어진 경우다.
       그때는 Tab 을 누르던 순간 적어 둔 '다음 칸' 으로 간다 (2026-09-11 선미 실주행 · 아래 keydown). */
  if (tabIntent && (Date.now() - tabIntent.at) < 1500) return tabIntent;
  return null;
}
/* ── Tab 의 목적지를 미리 적어 둔다 (2026-09-11) ──
   크롬은 Tab 때 옛 칸에서 초점을 **먼저 떼고**(activeElement=body) change 를 쏜다. 그래서
   "초점이 칸에 있으면 미룬다" 는 renderAfterInput 의 조건이 거짓이 되어 render() 가 바로 돌았고,
   새 칸이 초점을 받기 전에 DOM 이 갈려 초점이 허공으로 갔다 — 다음 Tab 은 화면 맨 위부터 내려왔다
   (9/10 승희 장치가 jsdom 에서는 맞고 크롬에서는 빗나간 이유). 어느 엔진이든 목적지를 알고 있으면 되돌릴 수 있다. */
var tabIntent = null;
if (typeof document !== 'undefined'){
  document.addEventListener('keydown', function(e){
    if (e.key !== 'Tab' || !e.target || !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    var all = Array.prototype.slice.call(document.querySelectorAll('input, select, textarea, button'))
      .filter(function(x){ return !x.disabled && x.type !== 'hidden' && x.tabIndex !== -1; });
    var i = all.indexOf(e.target);
    if (i < 0) return;
    var next = all[e.shiftKey ? i - 1 : i + 1];
    var key = focusKeyOf(next);
    tabIntent = key ? {tag:next.tagName, key:key, s:null, e:null, at:Date.now()} : null;
  }, true);
}
function focusRestore(f){
  if (!f) return;
  var t = null;
  if (f.key.charAt(0) === '#'){ t = document.getElementById(f.key.slice(1)); }
  else {
    var all = document.getElementsByTagName(f.tag);
    for (var i = 0; i < all.length; i++){
      if (focusKeyOf(all[i]) === f.key){ t = all[i]; break; }
    }
  }
  if (f === tabIntent) tabIntent = null;                       /* 한 번 쓰면 버린다 */
  if (!t || t === document.activeElement || t.disabled) return;
  try {
    t.focus({preventScroll:true});
    if (f.s != null && /^(text|search|tel|url|password|email)$/.test(t.type || 'text')) t.setSelectionRange(f.s, f.e);
  } catch (err) {}
}
/* 입력칸을 떠나는 순간(onchange)에 부르는 render — 초점이 칸에 있으면 한 틱 미룬다.
   초점이 칸에 없으면(버튼 경로 · 검사) 지금처럼 바로 그린다 — 검사가 보는 동기 동작은 그대로다. */
var _inputRenderTimer = null;
function renderAfterInput(){
  /* ★ 언제나 한 틱 미룬다 (2026-09-11) — 전에는 "초점이 칸에 있을 때만" 미뤘는데, 크롬은 Tab 때
       change 가 오는 시점에 이미 초점을 뗀 상태(body)라 그 조건이 거짓이 되어 바로 그렸다.
       버튼을 누르는 경로는 renderHold(위 pointerdown) 가 따로 지키고, 검사는 setDonor 를 직접 부르지 않는다. */
  if (typeof setTimeout !== 'function'){ render(); return; }
  if (_inputRenderTimer) return;
  _inputRenderTimer = setTimeout(function(){ _inputRenderTimer = null; render(); }, 0);
}
/* ── 화면 위치 기억 (2026-09-10 승희) ─────────────────────────────────────
   새로고침하면 늘 홈으로 떨어졌다 — 화면 위치가 메모리(DB.screen)에만 있었다.
   담당자 화면만 sessionStorage(탭 단위)에 적어 두고 부팅 때 되돌린다.
   ⚠️ 링크(?t=)로 들어온 후원자·기관은 enterByLinkToken 이 화면을 정하므로 건드리지 않는다.
   ⚠️ 수취 등록(receive)·신청서 원문(intakeSrc)은 폼 상태가 딸려 있어 되돌리지 않는다 — 건 상세로 간다. */
var NAV_KEY = 'nd.nav';
function navPersist(){
  if (DB.role !== 'staff') return;
  var screen = DB.screen;
  if (screen === 'receive' || screen === 'intakeSrc') screen = 'case';
  try { sessionStorage.setItem(NAV_KEY, JSON.stringify({screen:screen, caseId:DB.caseId, tab:DB.tab})); } catch (e) {}
}
function navRestoreSaved(){
  try { if (new URLSearchParams(location.search).get('t')) return false; } catch (e) {}
  if (DB.role !== 'staff') return false;
  var s = null;
  try { s = JSON.parse(sessionStorage.getItem(NAV_KEY) || 'null'); } catch (e) {}
  if (!s || !s.screen || !{home:1, list:1, 'case':1, send:1}[s.screen]) return false;
  /* 건이 안 보이면(로그인 전엔 0건이 정상) 화면은 그대로 두고 로그인 뒤 재조회가 채운다.
     원장은 읽었는데 그 건이 없으면(삭제·정리) 목록으로 보낸다 — "건을 찾을 수 없습니다" 를 첫 화면으로 주지 않는다. */
  if (s.screen === 'case' && (DB.cases || []).length && !getCase(s.caseId)) s.screen = 'list';
  DB.screen = s.screen;
  if (s.caseId) DB.caseId = s.caseId;
  DB.tab = s.tab || 'auto';     /* 옛 세션의 'receipts' 가 남아 있어도 된다 — 단계 id 가 아니면 자동 (2026-09-11) */
  return true;
}
function render(){
  if (renderHold){ renderPending = true; return; }
  var fs = focusSnap();
  navPersist();
  /* Supabase 접속 결과는 첫 setBodyRole 뒤에 나온다 — 매 렌더마다 다시 맞춘다 (2026-09-05) */
  document.body.classList.toggle('demo', isDemoMode());
  renderRoleBar();
  renderSidebar();
  renderTopbar();
  renderAuthBox();
  /* ★ 로그인 벽 (2026-09-07 승희) — 실 DB 에서 담당자 화면은 로그인 뒤에만 그린다 */
  if (authWall()){
    el('content').innerHTML = renderLogin();
    el('navBack').disabled = true; el('navFwd').disabled = true;
    renderToast();
    return;
  }
  if (DB.role === 'staff' || DB.role === 'admin'){
    el('content').innerHTML = (DB.role === 'staff') ? renderStaff() : renderAdmin();
  } else {
    el('phoneBody').innerHTML = renderPhone();
    el('phoneSub').textContent = SCREEN_TITLE[DB.screen] || '';
    /* 폰 상단 마크 — index.html 에 SVG 를 박아 두지 않고 여기서 brandMark() 로 채운다(정본 한 곳) */
    if (el('phoneBrand') && !el('phoneBrand').querySelector('svg')) el('phoneBrand').innerHTML = brandMark() + '나눔대장';
    initSignPad();   /* 서명 캔버스는 innerHTML 재조립 후 이벤트·기존 서명 복원 */
  }
  el('navBack').disabled = !DB.nav.stack.length;
  el('navFwd').disabled = !DB.nav.fwd.length;
  renderToast();
  renderOnboard();
  renderViewer();
  focusRestore(fs);
}

/* ── 담당자 로그인 벽 (2026-09-07 승희 · 권한 2단계) ──────────────────────────
   실 DB + 담당자/관리자 역할 + 세션 없음 → 로그인 화면.
   후원자·배분기관(링크 ?t=)은 anon 이라 벽이 없다. 데모(DB 미연결)도 없다 — 역할 바로 돈다.
   ⚠️ 벽은 화면일 뿐이다. 진짜 막는 것은 RLS(patch-20260907-rls-stage2.sql) — 로그인 없이 anon 으로는
     inspection·distribution·access_link 를 못 만든다. */
function authWall(){
  if (isDemoMode()) return false;
  if (DB.role !== 'staff' && DB.role !== 'admin') return false;
  return !(typeof authUser === 'function' && authUser());
}
function renderLogin(){
  var err = DB.loginErr ? '<div class="login-err">' + esc(DB.loginErr) + '</div>' : '';
  var busy = !!DB.loginBusy;
  return '<div class="login-wrap"><div class="card login-card">' +
    '<div class="card-h"><h3>담당자 로그인</h3><span class="tag">나눔대장 · 담당자 전용</span></div>' +
    '<form class="card-b" onsubmit="return submitLogin(event)">' +
    '<div class="field"><label>이메일</label><input type="email" id="loginEmail" autocomplete="username" required value="' + esc(DB.loginEmail || '') + '"' + (busy ? ' disabled' : '') + '></div>' +
    '<div class="field"><label>비밀번호</label><input type="password" id="loginPw" autocomplete="current-password" required' + (busy ? ' disabled' : '') + '></div>' +
    err +
    '<button class="btn pri" type="submit" id="loginBtn"' + (busy ? ' disabled' : '') + '>' + (busy ? '확인 중…' : '로그인') + '</button>' +
    '</form></div></div>';
}
function submitLogin(ev){
  if (ev && ev.preventDefault) ev.preventDefault();
  var email = (el('loginEmail') || {}).value || '', pw = (el('loginPw') || {}).value || '';
  DB.loginEmail = email; DB.loginErr = null; DB.loginBusy = true; render();
  authSignIn(email, pw).then(function(r){
    DB.loginBusy = false;
    if (!r || !r.ok){ DB.loginErr = (r && r.reason) || '로그인 실패'; render(); return; }
    DB.loginErr = null;
    DB.toast = {msg: (authName() || '담당자') + ' 님, 로그인했습니다', auto:true};
    render();
  });
  return false;
}
function doSignOut(){
  authSignOut().then(function(){ DB.toast = {msg:'로그아웃했습니다', auto:true}; render(); });
}
function renderAuthBox(){
  var box = el('authBox'); if (!box) return;
  if (isDemoMode() || typeof authUser !== 'function' || !authUser()){ box.innerHTML = ''; return; }
  box.innerHTML = '<span class="auth-name" title="' + esc((authUser() && authUser().email) || '') + '">' + esc(authName() || '') + '</span>' +
    '<button class="navbtn" onclick="doSignOut()">로그아웃</button>';
}
/* ── 토스트 (복귀 동선 액션 버튼 포함) ── */
/* 스스로 닫히는 시간 — 작업판 5번 "2~3초 뒤 스스로 닫히게" (2026-09-08 연수) */
var TOAST_AUTO_MS = 2000;   /* 2.6→2.0초 (2026-09-10 승희 · "1~2초 뒤 스스로") */
var TOAST_CAP_MS  = 3000;   /* 둘째 줄(cap)이 있으면 읽을 시간을 조금 더 */
var toastTimer = null, toastShownRef = null;
/* 스스로 닫아도 되는가 — **기본이 자동 닫힘**이다 (2026-09-11 선미 · "어떤 팝업이든 1~2초 뒤 스스로").
   ★ 9/8 에는 성공 알림(auto 를 붙인 자리)만 열었다 — "실패가 조용히 지나가는 것" 을 막으려고.
     그런데 실주행에서 담당자가 닫기를 계속 눌러야 했고, 그 결정을 뒤집었다.
     실패는 토스트만으로 말하지 않는다 — 카드 안의 배너(banner warn/dg · gate-block)가 남아서 말한다.
   ⚠️ act(누를 것이 있다)만 남긴다 — 버튼이 사라지면 못 누른다. 그 외는 전부 닫힌다.
   ⚠️ 남겨야 할 알림이 새로 생기면 sticky:true 를 붙인다(기본이 자동이라, 남기는 쪽이 명시다). */
function toastAutoCloses(t){ return !!(t && !t.act && !t.sticky); }
function renderToast(){
  var w = el('toastWrap');
  if (!w) return;
  var raw = DB.toast;
  if (!raw){
    if (toastTimer){ clearTimeout(toastTimer); toastTimer = null; }
    toastShownRef = null; w.innerHTML = ''; return;
  }
  var t = (typeof raw === 'string') ? {msg:raw} : raw;
  w.innerHTML = '<div class="toast"><b>' + esc(t.msg) + '</b>' +
    (t.act ? '<button class="tbtn" onclick="clearToast();' + t.act.call + '">' + esc(t.act.label) + '</button>' : '') +
    '<button class="tclose" onclick="clearToast()">닫기</button>' +
    (t.cap ? '<div class="tcap">' + esc(t.cap) + '</div>' : '') + '</div>';
  /* 시계는 **새 토스트일 때만** 건다 — render() 는 자주 불린다.
     그릴 때마다 다시 걸면 화면이 움직이는 동안 토스트가 영영 안 닫힌다. */
  if (raw !== toastShownRef){
    toastShownRef = raw;
    if (toastTimer){ clearTimeout(toastTimer); toastTimer = null; }
    if (toastAutoCloses(t)){
      toastTimer = setTimeout(function(){
        /* 그새 다른 토스트로 바뀌었으면 건드리지 않는다 — 남의 알림을 대신 닫지 않는다 */
        if (DB.toast === raw) clearToast();
      }, t.cap ? TOAST_CAP_MS : TOAST_AUTO_MS);
    }
  }
}
function clearToast(){
  if (toastTimer){ clearTimeout(toastTimer); toastTimer = null; }
  toastShownRef = null;
  DB.toast = null; renderToast();
}
/* ── 첨부 뷰어 ── 원본을 화면에서 열어보고, 이상 없으면 그 자리에서 수취 처리한다 */
function openViewer(ids, i, caseId, key){
  DB.viewer = {ids:(ids || []).slice(), i:i || 0, caseId:caseId || null, key:key || null};
  render();
}
function closeViewer(){ DB.viewer = null; render(); }
/* 신청서 원문 팝업 — 증빙 파일 뷰어와 같은 동선. 페이지 이동 없이 그 자리에서 원문을 보고,
   이상 없으면 바로 확인 처리한다 (다른 증빙서류 보기와 동일한 UX — 2026-07-22 선미 지적) */
function openIntake(caseId){ DB.intakeView = caseId; render(); }
function closeIntake(){ DB.intakeView = null; render(); }
/* ★ ref(항목 주소)를 함께 받는다 — 다기관이면 인수증이 기관 수만큼 있어서
     'inss' 로만 찾으면 어느 기관 것인지 가릴 수 없다 (유진 2026-09-01 · uid 도입).
     ref 를 안 넘긴 옛 호출은 'inss' 로 되돌아간다 — 단일 기관 건에서는 그대로 맞는다. */
function openReceipt(caseId, ref){ DB.receiptView = {caseId:caseId, ref:ref || 'inss'}; render(); }
function closeReceipt(){ DB.receiptView = null; render(); }
/* 인수증 원문 팝업 — 신청서 원문과 같은 패턴: 실물 서식 그대로 보여주고, 확인되지 않았으면 팝업에서 바로 수취 처리 */
function receiptModalHtml(v){
  if (typeof v === 'string') v = {caseId:v, ref:'inss'};   /* 옛 형태(건 id만) 호환 */
  var caseId = v && v.caseId, ref = (v && v.ref) || 'inss';
  var c = getCase(caseId);
  var it = c && getItem(caseId, ref);
  var rc = it && it.r.orgUpload && it.r.orgUpload.receipt;
  if (!rc) return '';
  var st = itemStatus(it);
  var canConfirm = st.code === 'unc' && !it.r.ai && !it.r.broken && !it.r.qtyFlag;
  return '<div class="vw-back" onclick="if(event.target===this)closeReceipt()"><div class="vw-box">' +
    '<div class="vw-head"><b>' + esc(it.n) + ' 원문 — #' + esc(c.id) + '</b>' +
    '<span class="pill ok"><span class="pd"></span>폼 작성 · 담당자 전자서명</span>' +
    '<div class="spacer" style="flex:1"></div></div>' +
    /* 실물 인수증 서식 그대로 — 담당자에게 익숙한 형태가 곧 가독성이다 */
    '<div class="vw-body" style="align-items:flex-start">' +
      '<div class="intake-doc">' +
      '<h4>인&nbsp;&nbsp;수&nbsp;&nbsp;증</h4>' +
      '<table>' +
        '<tr><th>■ 구&nbsp;&nbsp;분</th><td>' + esc(rc.item) +
          (rc.pkg ? ' <span class="small muted">(포장 ' + esc(rc.pkg) + ' — 참고용)</span>' : '') + '</td></tr>' +
        '<tr><th>■ 수&nbsp;&nbsp;량</th><td>' + esc(String(rc.qty)) + ' (낱개)</td></tr>' +
      '</table>' +
      '<div style="text-align:center;margin:18px 0 6px">상기 내용과 같이 후원물품을 정히 인수함.</div>' +
      '<div style="text-align:center;margin-bottom:16px">' + esc(String(rc.recvDate || '').replace(/-/g, '. ')) + '</div>' +
      /* 서명은 기관명 옆 (서명/직인) 자리 — 인수증 PDF 와 같은 배치 (2026-09-12 선미) */
      '<div class="sign">담당자명 <b>' + esc(rc.receiver || '') + '</b><br>' +
        '기관명 <b>' + esc(rc.org || '') + '</b> ' +
        (rc.signImg ? '<img src="' + rc.signImg + '" alt="담당자 서명" style="height:34px;vertical-align:middle;border:1px dashed var(--line);border-radius:6px;background:#fff">' : '') +
        ' <span class="small muted">(서명/직인)</span>' +
        (rc.signImg ? ' <span class="pill ok" style="margin-left:6px"><span class="pd"></span>전자서명</span>' : '') + '</div>' +
      '<div style="text-align:center;margin-top:18px;font-weight:700">사회복지법인 어린이재단 귀중</div>' +   /* ★ 법적·회계 서류는 법인명 '사회복지법인 어린이재단' (선미 9/5) — 초록우산은 브랜드명 */
      '</div>' +
    '</div>' +
    '<div class="vw-foot">' +
    (canConfirm
      ? '<button class="btn pri" onclick="DB.receiptView=null;confirmUpload(\'' + esc(c.id) + '\',\'' + esc(it.uid || ref) + '\')">✓ 원문 확인 · 수취 처리</button>' +
        '<span class="small muted">품목·수량·인수일자·수령자가 맞는지 확인하셨으면 눌러 주세요</span>'
      : (it.r.qtyFlag
          ? '<span class="small" style="color:var(--warn)">⚠ 수량 불일치 — 항목 카드에서 사유를 입력해 해소해야 합니다</span>'
          : '<span class="small muted">읽기 전용 — 이미 확인 처리됐거나 확인 대상이 아닙니다</span>')) +
    '<div class="spacer" style="flex:1"></div>' +
    /* 화면의 원문은 기관 브라우저 메모리 값이다 — 새로고침 뒤 남는 수령자명·서명은 PDF 뿐이니 여기서 연다 (2026-09-05) */
    (typeof formPdfButtonsHtml === 'function' ? formPdfButtonsHtml(c, 'receipt', it.distId, true) : '') +
    '<button class="btn ghost" onclick="closeReceipt()">닫기</button>' +
    '</div></div></div>';
}
function intakeModalHtml(caseId){
  var c = getCase(caseId);
  if (!c) return '';
  var d = c.donation || {};
  /* [S] 신청서 항목 — 미확인 상태면 팝업 안에서 바로 원문 확인 처리 (뷰어의 퀵 수취와 동일 패턴) */
  /* ★ 폼으로 낸 신청서는 제출 자체로 수취완료다 (선미 9/6 결정 · common.js itemStatus [S] 주석). 그래서 이 버튼은
       **아직 확정이 아닌 신청서**에만 뜬다 — 실제로는 거의 없다. 전에는 formSubmit.status 만 봐서 이미 수취완료인
       신청서에도 [원문 확인 · 수취 처리] 가 떠 담당자가 누를 것이 있는 줄 알았다 (2026-09-12 선미 · #312). */
  var sAny = (c.checklist || []).filter(function(it){
    return it.kind === 'S' && it.included && it.r.formSubmit && it.r.formSubmit.status === 'submitted';
  })[0];
  var sItem = (sAny && itemStatus(sAny).code === 'unc') ? sAny : null;
  var sDone = !!(sAny && !sItem);
  var corp = (c.donorType === '법인');
  var paths = ['구매', '제조·유통', '기타'].map(function(p){
    return ((c.acqPath || '구매') === p ? '☑' : '□') + ' ' + p;
  }).join('&nbsp;&nbsp;&nbsp;');
  return '<div class="vw-back" onclick="if(event.target===this)closeIntake()"><div class="vw-box">' +
    '<div class="vw-head"><b>신청서 원문 — #' + esc(c.id) + '</b>' +
    '<span class="pill ok"><span class="pd"></span>폼 제출 · 전자서명</span>' +
    '<div class="spacer" style="flex:1"></div></div>' +
    /* 종이 신청서 양식 그대로 — 담당자에게 익숙한 형태가 곧 가독성이다 */
    '<div class="vw-body" style="align-items:flex-start">' +
      '<div class="intake-doc">' +
      '<h4>물품기부신청서</h4>' +
      '<div class="doc-sub">(' + (corp ? '법인' : '법인 외') + ') · ' + esc(c.submittedVia) + '</div>' +
      '<table>' +
        '<tr><th>' + (corp ? '기부법인명' : '기부자명') + '</th><td>' + esc(c.donor) + '</td>' +
            '<th>후원일자</th><td>' + esc(c.inDate) + '</td></tr>' +
        '<tr><th>후원자 유형</th><td>' + esc(c.donorType) + '</td>' +
            '<th>취득경로</th><td>' + paths + '</td></tr>' +
      '</table>' +
      '<table>' +
        '<tr><th>품목</th><th style="width:auto">수량(낱개)</th><th>단가</th><th>' + (corp ? '기부가액(장부가액)' : '기부가액(판매가액)') + '</th></tr>' +
        '<tr><td>' + esc(d.itemName) + '</td><td class="num">' + esc(String(d.qty)) + '</td>' +
            '<td class="num">' + won(d.unitPrice) + '</td><td class="num">' + won(d.book) + '</td></tr>' +
        '<tr><th>합&nbsp;계</th><td class="num" colspan="2">' + (d.pkg ? '포장 ' + esc(d.pkg) + ' (참고용 — 대조에 쓰지 않음)' : '') + '</td>' +
            '<td class="num"><b>' + won(d.book) + '</b></td></tr>' +
        (corp && d.fair !== d.book
          ? '<tr><th>판매가액</th><td class="num" colspan="3">' + won(d.fair) + '</td></tr>' : '') +
      '</table>' +
      ((c.donorNote || d.valueEdited)
        ? '<table><tr><th>※ 비고</th><td>' + esc(c.donorNote || '') +
          (d.valueEdited ? ' <span style="color:var(--accent-pink);font-weight:700">— 신고 가액이 수량×단가 산식과 다릅니다. 사유를 확인하세요</span>' : '') +
          '</td></tr></table>' : '') +
      '<div class="sign">위 작성 내용은 사실만을 작성하였음을 서명합니다.<br>' +
        '기부자 (명칭/성명) <b>' + esc(c.donor) + '</b> <span class="pill ok" style="margin-left:6px"><span class="pd"></span>전자서명</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="vw-foot">' +
    (sItem
      ? '<button class="btn pri" onclick="DB.intakeView=null;confirmFormDoc(\'' + esc(c.id) + '\',\'' + esc(sItem.key) + '\')">✓ 원문 확인 · 수취 처리</button>' +
        '<span class="small muted">품목·가액 경위·비고가 타당한지 확인하셨으면 눌러 주세요</span>'
      : '<span class="small muted">' + (sDone ? '폼으로 제출된 신청서입니다 — 제출로 수취완료됩니다' : '읽기 전용 — 이미 확인 처리됐거나 확인 대상이 아닙니다') + '</span>') +
    '<div class="spacer" style="flex:1"></div>' +
    /* 화면의 원문은 DB 값(개인정보 없음)이다 — 이름·주민번호·서명은 PDF 에만 있으니 여기서 연다 (staff 화면 함수) */
    (typeof formPdfButtonsHtml === 'function' ? formPdfButtonsHtml(c) : '') +
    '<button class="btn ghost" onclick="closeIntake()">닫기</button>' +
    '</div></div></div>';
}
function viewerStep(d){
  if (!DB.viewer) return;
  var n = DB.viewer.ids.length;
  DB.viewer.i = (DB.viewer.i + d + n) % n;
  render();
}
function viewerConfirm(){
  var v = DB.viewer;
  if (!v || !v.caseId || !v.key) return;
  var reason = String(((DB.resDraft || {})[v.key]) || '').trim();
  DB.viewer = null;
  if (reason && typeof resolveItemWith === 'function'){
    /* 사유를 적었으면 '사유해소' 로 남긴다 — 감사 이력에 그대로 (screen-staff.js resolveItemWith) */
    resolveItemWith(v.caseId, v.key, reason);
    if (DB.resDraft) delete DB.resDraft[v.key];
    return;
  }
  confirmUpload(v.caseId, v.key);   /* render 포함 */
  render();
}
/* 이 항목이 뷰어에서 바로 수취 처리 가능한 상태인가 (AI 지적 항목은 제외) */
function canQuickConfirm(caseId, key){
  if (!caseId || !key) return false;
  var it = getItem(caseId, key);
  if (!it) return false;
  var r = it.r || {};
  if (r.ai || r.broken || r.qtyFlag) return false;
  var uploaded = (r.donorUpload && r.donorUpload.status === 'uploaded') ||
                 (r.orgUpload && r.orgUpload.status === 'uploaded') ||
                 !!(r.fileIds && r.fileIds.length);   /* 담당자가 올린 파일만 있는 항목(수취 취소 뒤)도 (2026-09-12) */
  return uploaded && itemStatus(it).code === 'unc';
}
/* ★ 진짜 AI 판정이 '확인 권장' 인 항목 (2026-09-12 선미 · #309 실주행)
   전에는 사유 경로가 데모용 r.ai 만 봐서, 실제 AI 가 "금액이 다르다" 고 해도 [원본 보고 처리] 한 번에 사유 없이 넘어갔다.
   선미 결정: 사유를 **강제하지는 않는다**(담당자가 귀찮을 수 있다) — 원본 보기 창에 사유 칸을 두고 적으면 '사유해소' 로,
   비우면 그냥 '수취완료' 로 남긴다. 어느 쪽이든 담당자가 원본을 열어 본 뒤다. */
function aiFlagged(it){
  var j = it && it.r && it.r.aiJudge;
  return !!(j && j.state !== 'error' && j.verdict === '확인 권장');
}
function setResDraft(key, v){ DB.resDraft = DB.resDraft || {}; DB.resDraft[key] = v; }
function renderViewer(){
  var w = el('viewerWrap');
  if (!w) return;
  if (DB.intakeView){ w.innerHTML = intakeModalHtml(DB.intakeView); return; }
  if (DB.receiptView){ w.innerHTML = receiptModalHtml(DB.receiptView); return; }
  var v = DB.viewer;
  if (!v || !v.ids.length){ w.innerHTML = ''; return; }
  var id = v.ids[v.i], m = fileMeta(id), kind = fileKind(id), url = fileUrl(id);
  var body;
  if (!url){
    body = '<div class="vw-stub"><span class="ic"></span>' +
      '<b>데모 항목 — 실제 파일이 없습니다</b><br>' +
      '“기본값 채우기(데모용)”로 만들어진 예시 항목입니다.<br>' +
      '후원자 화면에서 <b>실제 PDF·이미지를 올리면</b> 이 자리에서 원본을 그대로 볼 수 있습니다.</div>';
  } else if (kind === 'image'){
    body = '<img src="' + url + '" alt="' + esc(m.name) + '">';
  } else if (kind === 'pdf'){
    body = '<iframe src="' + url + '" title="' + esc(m.name) + '"></iframe>';
  } else {
    body = '<div class="vw-stub"><span class="ic"></span>' +
      '<b>이 형식은 화면 미리보기를 지원하지 않습니다</b><br>' + esc(m.name) +
      '<br>PDF·이미지는 이 자리에서 바로 열립니다.</div>';
  }
  var multi = v.ids.length > 1;
  var quick = canQuickConfirm(v.caseId, v.key);
  var vit = (v.caseId && v.key) ? getItem(v.caseId, v.key) : null;
  w.innerHTML = '<div class="vw-back" onclick="if(event.target===this)closeViewer()"><div class="vw-box">' +
    '<div class="vw-head"><b>' + esc(m.name) + '</b>' +
    (m.size ? '<span class="tag">' + humanSize(m.size) + '</span>' : '') +
    (m.formPdf ? '<span class="pill warn"><span class="pd"></span>신청서 PDF · 개인정보' +
                   ((typeof sbReady === 'function' && sbReady()) ? ' — 열람 기록됨' : ' — 데모(기록 없음)') + '</span>'
     : m.demo ? '<span class="pill neu"><span class="pd"></span>데모 항목</span>'
              : '<span class="pill ok"><span class="pd"></span>업로드 원본</span>') +
    '<div class="spacer" style="flex:1"></div>' +
    (multi ? '<button class="btn ghost sm" onclick="viewerStep(-1)">← 이전</button>' +
             '<span class="small muted">' + (v.i + 1) + ' / ' + v.ids.length + '</span>' +
             '<button class="btn ghost sm" onclick="viewerStep(1)">다음 →</button>' : '') +
    '</div>' +
    '<div class="vw-body">' + body + '</div>' +
    '<div class="vw-foot">' +
    (quick
      ? (aiFlagged(vit)
          /* AI 지적 항목 — 사유는 선택. 적으면 사유해소, 비우면 수취완료 (aiFlagged 주석) */
          ? '<div class="row" style="gap:8px;align-items:center;flex:1;min-width:260px;flex-wrap:wrap">' +
            '<span class="pill warn"><span class="pd"></span>AI 확인 권장</span>' +
            '<input type="text" id="vw-res" value="' + esc((DB.resDraft || {})[v.key] || '') + '"' +
            ' placeholder="확인한 사유 (선택) · 예: 후원처 통화로 금액 경위 확인" style="flex:1;min-width:200px"' +
            ' oninput="setResDraft(\'' + esc(v.key) + '\',this.value)"></div>'
          : '') +
        '<button class="btn pri" onclick="viewerConfirm()">✓ 확인했습니다 · 수취 처리</button>'
      : '<span class="small muted">' +
        (v.caseId && v.key ? 'AI가 지적한 항목이거나 이미 처리된 항목입니다 — 검수 화면에서 처리해 주세요' : '미리보기') +
        '</span>') +
    '<div class="spacer" style="flex:1"></div>' +
    '<button class="btn ghost" onclick="closeViewer()">닫기</button>' +
    '</div></div></div>';
}

/* ── 온보딩 모달 (첫 진입 1회) ── */
function modalOpen(){ return !DB.demo.onboarded; }
function renderOnboard(){
  var w = el('modalWrap');
  if (!w) return;
  if (DB.demo.onboarded){ w.innerHTML = ''; return; }
  w.innerHTML = '<div class="modal-back"><div class="modal">' +
    '<h2>후원물품 서류, 누락 없이 완결까지</h2>' +
    '<p class="muted small mb16">후원물품 한 건이 접수부터 완결까지 가는 동안 필요한 서류와 지금 비어 있는 것을 한 화면에서 봅니다.</p>' +
    /* [2026-08-31] E1 실호출 연결 후 문구 수정 — 검수에서 실제 모델을 부르므로
       "외부 통신 없이 동작한다"는 더 이상 사실이 아니다(첨부한 영수증 이미지가 나간다). */
    '<div class="banner info mb16"><span class="bi">🔎</span><div><b>AI가 쓰이는 곳은 검수 한 곳입니다</b><br>' +
    '올린 증빙 이미지를 모델로 보내 금액을 대조합니다. 나머지 판정은 규칙입니다.</div></div>' +
    /* 단계가 셋인데 제목이 "2단계" 였다 — 숫자를 뺐다 (문구 규칙 9/5). 데모 건의 예시 판정 설명도 뺐다 */
    '<h3 style="font-size:16px;font-weight:800;margin-bottom:4px">추천 동선</h3>' +
    '<div class="ob-step"><span class="n">1</span><div><b>신규 접수 → 후원자 제출</b>' +
    '<p>유형을 정하면 필요 서류가 정해지고, 그 목록이 후원자 신청서가 됩니다.</p></div></div>' +
    '<div class="ob-step"><span class="n">2</span><div><b>담당자로 돌아와 검수</b>' +
    '<p>받아야 할 서류와 받은 서류를 대조합니다. 덜 들어온 건은 완결이 잠깁니다.</p></div></div>' +
    '<div class="ob-step"><span class="n">3</span><div><b>배분 후 기관 증빙 받기</b>' +
    '<p>기관마다 제출 링크를 보냅니다. 기관은 자기 몫의 인수증과 사진을 제출합니다.</p></div></div>' +
    /* 역할 전환 바는 데모에서만 그린다(renderRoleBar) — 실 DB 에서 이 배너가 뜨면 없는 것을 있다고 말한다 → demoOnly 로 감쌌다(9/5) */
    demoOnly('<div class="banner warn mt16 mb16"><span class="bi">🔀</span><div><b>역할 전환은 화면 맨 위 검은 띠에서</b><br>' +
    '담당자 · 후원자 · 배분기관 · 관리자.</div></div>') +
    '<div class="row" style="gap:8px;flex-wrap:wrap">' +
    '<button class="btn pri" style="font-size:17px;padding:13px 22px" onclick="closeOnboard()">바로 시작하기</button></div>' +
    '<div class="hint" style="text-align:center">오른쪽 위 <b>❔ 안내</b>로 다시 엽니다</div>' +
    '</div></div>';
}
function closeOnboard(){ DB.demo.onboarded = true; render(); }
/* 안내를 닫은 뒤에도 다시 볼 수 있어야 한다 — 첫 진입 1회로 끝나면 데모 중 되짚을 방법이 없다 */
function openOnboard(){ DB.demo.onboarded = false; render(); }
/* ★★ 역할 전환 바는 **데모에서만** 그린다 (2026-09-03 선미 · 연수 지적에서 드러남)
   ⚠️ 지름길 아홉 곳을 걷어내도 **이 바가 열려 있으면 아무것도 막지 못한다.**
     심사위원이 상단 바로 담당자↔후원자↔배분기관↔관리자를 자유롭게 오갈 수 있었다.
     지름길보다 이쪽이 크다 — 특정 화면이 아니라 **항상** 있기 때문이다.
   ★ 실서비스에서 역할은 **누구로 로그인했나**로 정해진다. 심사위원은 담당자 계정으로 들어와,
     담당자 화면에서 링크를 발급해 그 주소를 열어 후원자·기관 화면을 본다(0-A).
     실제 담당자도 그렇게 한다.
   ⚠️ 그래서 시연 동선이 바뀐다 — 실 DB 로 시연하면 이 바가 없다. 링크를 복사해 새 탭에서 연다. */
function renderRoleBar(){
  /* ★ 역할 전환 바는 없다 (2026-09-12 선미) — index.html 에서 뺐다. 실서비스뿐이라 역할을 손으로 바꿀 자리가 없다.
       옛 배포본·캐시로 남은 요소가 있으면 지운다. 데모 역할 바꾸기는 setRole() 을 콘솔·검사에서 직접 부른다. */
  var bar = document.querySelector('.role-bar');
  if (bar) bar.parentNode.removeChild(bar);
}
/* ── 브랜드 마크 — **여기 한 곳**이 정본 (2026-09-12 선미) ─────────────────────
   ★ 왜 이모지·우산이 아닌가 — 🌱 은 자리만 채운 임시였고, 초록우산 우산은 이 플랫폼이
     아직 재단 공식이 아니라 쓰기 어렵다(선미 9/12). 그래서 나눔대장 자체 마크를 쓴다.
   ★ 아직 **후보** 다 — 팀 상의 후 확정. 후보 5개와 비교판은 (미공개 내부 기록).
     확정되면 아래 SVG 만 바꾼다. 사이드바(담당자·관리자) · 홈 히어로 · 후원자 폰 상단 · 미리보기 폰이
     전부 이 함수를 부르므로 다른 곳은 손댈 것이 없다.
   ★ 색은 CSS 변수 --mark-1 / --mark-2 로 받는다 — 흰 배경에선 진녹·녹, 어두운 배경에선 흰·연녹.
     그래서 같은 마크를 배경마다 다시 그리지 않는다. 기본값은 흰 배경용.
   지금 마크(04 ㄴ 받침): 나눔의 ㄴ이 물품 한 덩이를 받쳐 든다. */
function brandMark(cls){
  return '<svg class="mark' + (cls ? ' ' + cls : '') + '" viewBox="0 0 32 32" aria-hidden="true" focusable="false">' +
    '<path d="M8 3 a3 3 0 0 1 3 3 V21 h16 a3 3 0 0 1 3 3 v2 a3 3 0 0 1 -3 3 H7 a3 3 0 0 1 -3 -3 V6 a3 3 0 0 1 3 -3 Z" style="fill:var(--mark-1,#005B48)"/>' +
    '<rect x="16" y="6" width="12" height="11" rx="3" style="fill:var(--mark-2,#009465)"/></svg>';
}
function renderSidebar(){
  var mod = currentModule();
  el('sideStaff').innerHTML =
    '<div class="side-brand"><span class="tile">' + brandMark() + '</span><span>나눔대장<small>재단 담당자 · 후원물품</small></span></div>' +
    '<div class="nav-group"><div class="lbl">업무</div>' +
    STAFF_MENU.map(function(m){
      /* 배지 = 아직 손이 필요한 건수. 취소는 목록·홈과 같은 isRegistered 기준으로 제외한다 */
      var cnt = (m.id === 'list') ? DB.cases.filter(function(c){ return isRegistered(c) && c.state !== '완결'; }).length : 0;
      return '<button class="nav-item' + (mod === m.mod ? ' active' : '') + (m.future ? ' future' : '') + '" data-nav="' + m.id +
        '" onclick="go(\'' + m.id + '\')"><span class="ic">' + m.ic + '</span>' + m.label +
        (m.future ? '<span class="cnt" style="background:var(--line);color:var(--ink-soft)">본선</span>' : '') +
        (cnt ? '<span class="cnt">' + cnt + '</span>' : '') + '</button>';
    }).join('') +
    '</div>' +
    /* ★ 관리자에게만 보이는 입구 (2026-09-10) — 실서비스에서 역할 전환 바가 없으므로
         관리자 화면으로 가는 길은 여기 하나다. 권한은 isAdminUser() 가 본다. */
    (isAdminUser()
      ? '<div class="nav-group"><div class="lbl">관리</div>' +
        '<button class="nav-item" data-nav="enterAdmin" onclick="enterAdmin()"><span class="ic"></span>관리자</button></div>'
      : '') +
    '';   /* 사이드바 아래 계정 설명 두 줄은 뺐다 (2026-09-11 선미) — 개발 단계 메타(문구 규칙 9번) */
  el('sideAdmin').innerHTML =
    '<div class="side-brand"><span class="tile">' + brandMark() + '</span><span>나눔대장 관리자<small>플랫폼 메타 관리</small></span></div>' +
    '<div class="nav-group"><div class="lbl">관리</div>' +
    ADMIN_MENU.map(function(m){
      return '<button class="nav-item' + (DB.screen === m.id ? ' active' : '') + '" data-nav="' + m.id +
        '" onclick="go(\'' + m.id + '\')"><span class="ic">' + m.ic + '</span>' + m.label + '</button>';
    }).join('') + '</div>' +
    '<div class="nav-group"><div class="lbl">이동</div>' +
    '<button class="nav-item" data-nav="exitAdmin" onclick="exitAdmin()"><span class="ic"></span>업무 화면으로</button></div>' +
    '<div class="side-foot">기준자료를 바꾸면<br>접수·검수가 함께 바뀝니다</div>';
}
function renderTopbar(){
  var roleLabel = {staff:'담당자', donor:'후원자', admin:'관리자'}[DB.role];
  var parts = [roleLabel];
  if (DB.role === 'staff'){
    parts.push(currentModule());
    if (DB.screen === 'case' || DB.screen === 'receive' || DB.screen === 'intakeSrc'){
      parts.push('#' + DB.caseId);
      /* 보고 있는 단계 이름 (2026-09-11 · 전에는 수취 현황/검수 결과 두 탭) — 취소 건은 단계가 없어 빈 문자열 */
      if (DB.screen === 'case' && typeof caseStepLabel === 'function'){ var sl = caseStepLabel(); if (sl) parts.push(sl); }
    }
  } else {
    parts.push(SCREEN_TITLE[DB.screen] || DB.screen);
  }
  el('crumb').textContent = parts.join(' › ');
  el('viewTitle').textContent = SCREEN_TITLE[DB.screen] || DB.screen;
}
/* ══════════════════════════════════════════════════════════════
   Phase 3 — 후원자(donor) · 배분기관(org) 폰 화면 + 미리보기
   ══════════════════════════════════════════════════════════════ */
function distItems(c){ return ((c && c.checklist) || []).filter(function(i){ return i.stage === '배분' && i.included; }); }
/* [v6] 아직 확정되지 않은 배분 증빙 — 미수취(기관 미제출)와 확인필요(기관 제출 · 담당자 확인 대기) */
function distPendingItems(c){
  return distItems(c).filter(function(it){
    var code = itemStatus(it).code;
    return code === 'miss' || code === 'unc';
  });
}
/* ── 데모인가 실서비스인가 — 결론은 여기 한 곳에서만 낸다 ─────────────
   ⚠️ 정본 21번과 같은 뿌리다. 그때는 콘솔이 각 문마다 제멋대로 "데모" 를 찍었고,
     이번엔 화면이 그렇다 — 맨 위 띠(index.html:89)는 DB_SOURCE 를 보고
     "Supabase 연결됨 · 15건" 이라고 하는데, 본문 뱃지 12곳은 무조건 "예선 데모" 였다.
   ★ 심사위원은 체험판이 아니라 실제 서비스를 쓴다(0-A · 선미 9/2). 그래서
     실 DB 에 붙은 화면이 스스로 "데모" 라고 말하면 안 되고,
     무엇보다 본인확인 값을 화면에 찍어 주면 안 된다.
   DB_SOURCE 는 db.js:522 · 실제 연결에 성공해야 'Supabase' 가 된다(db.js:1401). */
/* ── 관리자 권한 ────────────────────────────────────────────────
   ★ 역할은 **누구로 로그인했나**로 정한다 (renderRoleBar 주석의 원칙 그대로).
     상단 역할 전환 바는 데모에서만 그려지므로, 실서비스에서 DB.role 은 늘 'staff' 다 —
     즉 지금까지 관리자 화면에 **갈 길 자체가 없었다.** 로그인 때 받아 둔
     staff.role(AUTH.session.staffRole)로 연다.
   ⚠️ 화면 게이트는 절반이다. DB 쪽은 patch-20260910-admin-rls.sql 이 맡는다 —
     화면만 막으면 "감춘 것" 을 "지켜진 것" 으로 착각하게 된다.
   ⚠️ 데모(실 DB 미연결)에서는 통과시킨다. 데모에는 지킬 데이터가 없고,
     예선 데모·검사가 관리자 화면을 쓴다. */
function authStaffRole(){
  return (typeof AUTH !== 'undefined' && AUTH.session && AUTH.session.staffRole) || null;
}
function isAdminUser(){
  if (isDemoMode()) return true;
  return authStaffRole() === 'admin';
}
/* 업무 화면 ↔ 관리자 화면. setRole(데모 전환)과 일부러 다른 함수다 —
   이쪽은 권한을 보고, 저쪽은 안 본다. */
function enterAdmin(){
  if (!isAdminUser()) return;
  toggleNav(false); navBegin();
  DB.role = 'admin'; setBodyRole('admin');
  DB.screen = 'adminAccounts'; DB.toast = null;
  navEnd(); render();
}
function exitAdmin(){
  toggleNav(false); navBegin();
  DB.role = 'staff'; setBodyRole('staff');
  DB.screen = 'home'; DB.toast = null;
  navEnd(); render();
}

function isDemoMode(){ return (typeof DB_SOURCE === 'undefined') || DB_SOURCE !== 'Supabase'; }
/* 데모에서만 붙는 뱃지 — 실서비스에서는 아무것도 안 그린다 */
function demoBadge(){ return isDemoMode() ? '<div class="simbadge">🧪 예선 데모</div>' : ''; }
/* 데모에서만 보여 줄 안내(본인확인 값 등) — 실서비스에서는 빈 문자열 */
function demoOnly(html){ return isDemoMode() ? html : ''; }

/* ── 발표자 전용 (2026-09-14 승희 · 선미 9/13 밤 결정 "계정으로 가른다") ──
   시연용 [채우기] 는 실운영 화면(nanumdaejang.org)에 **발표자에게만** 떠야 한다.
   후원자 폼은 링크로 열지만, 발표자 브라우저에는 담당자 로그인 세션(localStorage · db.js AUTH)이 남아 있다.
   그 세션이 staff 행으로 확인된(staffOk) admin 이면 그린다 — 심사위원 테스트 계정은 role 'staff' 라 절대 안 보이고,
   로그아웃하면 사라져 끄는 걸 잊을 일이 없다. 토글도 주소 꼬리표(?demo=1)도 DB 변경도 없다.
   ⚠️ 검토했다 뺀 안 — ?demo=1 은 심사위원이 따라 붙이면 새고, "전 계정에 넣고 심사 뒤 빼기" 는 빼는 걸 잊는다. */
function isPresenter(){
  var s = (typeof AUTH !== 'undefined') ? AUTH.session : null;
  return !!(s && s.staffOk && s.staffRole === 'admin');
}
function presenterOnly(html){ return isPresenter() ? html : ''; }

/* 미리보기에서는 어떤 쓰기도 발생하지 않는다 (파괴 테스트 대상) */
function writeBlocked(){
  if (DB.preview){ DB.toast = {msg:'미리보기 모드입니다 — 제출·업로드·접수 생성이 일어나지 않습니다'}; renderToast(); return true; }
  return false;
}
var PV_NOTE = '미리보기 모드에서는 저장되지 않습니다';

/* ── 후원자: 물품기부신청서 ─────────────────────────────── */
/* 링크로 바인딩된 건 조회 — 없으면 폼이 잠긴다 */
function linkCase(){
  var f = DB.donorForm;
  return f.linkCaseId ? getCase(f.linkCaseId) : null;
}
/* ── 후원자가 파일을 올려야 하는 항목 = 확정 체크리스트의 [A] 첨부 · 접수 단계 ──
   폼 필드(F)는 코드가 검증하므로 첨부가 없고, 배분 단계 서류(인수증·결과보고)는 배분처의 몫이다.
   즉 업로드 칸 = 체크리스트 그 자체 — 담당자가 전개한 규칙이 후원자 화면을 그대로 만든다. */
/* ── 기부가액 산정 ──
   기본은 양식 산식(수량×단가)이지만, 부대비용·묶음할인·단수처리 등으로 딱 떨어지지 않는 경우가 있어
   후원자가 직접 수정할 수 있다. 빈 값이면 자동계산값을 그대로 쓴다. */
function autoGift(f, corp){
  return (Number(f.qty) || 0) * (Number(corp ? f.unitBook : f.unitSale) || 0);
}
function autoSale(f){
  return (Number(f.qty) || 0) * (Number(f.unitSale) || 0);
}
function isOverridden(v){ return v !== '' && v !== null && v !== undefined; }
function giftValOf(f, corp){ return isOverridden(f.giftVal) ? (Number(f.giftVal) || 0) : autoGift(f, corp); }
function saleValOf(f){ return isOverridden(f.saleVal) ? (Number(f.saleVal) || 0) : autoSale(f); }
/* 자동계산과 다르게 신고했는지 — 다르면 양식 ※비고란에 사유를 적어야 한다 */
function valueDiffers(f, corp){
  return (isOverridden(f.giftVal) && giftValOf(f, corp) !== autoGift(f, corp)) ||
         (isOverridden(f.saleVal) && saleValOf(f) !== autoSale(f));
}
function donorSlots(){
  var c = linkCase();
  var list = c ? c.checklist
                : autoChecklist(DB.req.donorType, DB.req.path, DB.donorForm.wantsReceipt, DB.promptProfile);
  return list.filter(function(it){
    return it.included && it.kind === 'A' && (it.stage || '접수') === '접수';
  });
}
/* ── 첨부 파일 레지스트리 ──────────────────────────────
   이 세션에서 고른 파일은 blob으로 들고 있고, 저장소(Storage)에서 되살린 첨부는
   blob 없이 서명 URL(url)만 있다 — 미리 다 내려받지 않기 위함. 데모 항목은 둘 다 없다. */
var FILES = {}, FILE_SEQ = 0;
function fileMeta(id){ return FILES[id] || {id:id, name:String(id), type:'', size:0, demo:true}; }
function fileName(id){ return fileMeta(id).name; }
function fileUrl(id){
  var m = FILES[id];
  if (!m) return null;
  if (m.url) return m.url;
  if (!m.blob) return null;
  /* ⚠️ URL.createObjectURL 이 없는 환경이 있다 (jsdom 검사 · 일부 내장 웹뷰).
       전에는 여기서 그대로 던져 **화면 전체 렌더가 죽었다** — 미리보기 하나 때문에
       후원자가 폼을 못 보는 것은 균형이 안 맞는다 (2026-09-10 · 직인 미리보기에서 드러남).
     주소를 못 만들면 null 을 돌린다. 부르는 쪽은 이미 null 을 다룰 줄 안다. */
  try {
    m.url = URL.createObjectURL(m.blob);
  } catch (e) {
    console.warn('[파일] 미리보기 주소를 만들지 못했습니다 — ' + (m.name || id), e);
    return null;
  }
  return m.url;
}
function fileKind(id){
  var m = fileMeta(id);
  var t = (m.type || '').toLowerCase(), n = (m.name || '').toLowerCase();
  if (t.indexOf('image/') === 0 || /\.(png|jpe?g|gif|webp|bmp|heic)$/.test(n)) return 'image';
  if (t === 'application/pdf' || /\.pdf$/.test(n)) return 'pdf';
  return 'other';
}
function humanSize(b){
  if (!b) return '';
  return (b < 1024 * 1024) ? Math.round(b / 1024) + 'KB' : (b / 1024 / 1024).toFixed(1) + 'MB';
}
/* 실제 파일 선택 — FileList를 레지스트리에 담고 슬롯에 연결한다 */
/* ── 저장소가 받는 파일 형식 — Supabase Storage 버킷 설정과 같아야 한다 (2026-09-07 밤 선미 · #228 실측)
   ★ 왜 — 배분처가 결과보고서를 **docx** 로 올렸더니 버킷이 거절했고(PDF·PNG·JPEG·WEBP·10MB 만),
     폼은 "제출 완료" 로 넘어간 뒤 담당자 화면에 미수취로 섰다. 고르는 순간 사실대로 말해야 한다.
   ⚠️ 버킷 설정을 넓히면(예: docx 허용) 여기도 같이 넓힌다 — 두 곳이 다르면 또 조용히 실패한다.
     다만 AI 검수는 이미지·PDF 만 읽으므로 문서 형식을 넓혀도 검수는 안 된다. */
var UPLOAD_ACCEPT    = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp';
var UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
function uploadRejectReason(file){
  var t = String((file && file.type) || ''), n = String((file && file.name) || '');
  var okType = t === 'application/pdf' || /^image\/(png|jpeg|webp)$/.test(t) || /\.(pdf|png|jpe?g|webp)$/i.test(n);
  if (!okType) return n + ' — PDF·PNG·JPG·JPEG·WEBP 만 올릴 수 있습니다. 한글·워드 문서는 PDF 로 저장해서 올려 주세요';
  if ((file.size || 0) > UPLOAD_MAX_BYTES) return n + ' — 10MB 를 넘습니다';
  return '';
}
/* 고른 파일을 레지스트리에 넣는다 — 버킷이 거절할 것은 여기서 걸러 **이유를 돌려준다** */
function registerPickedFiles(fileList){
  var ids = [], rejected = [];
  for (var i = 0; i < (fileList ? fileList.length : 0); i++){
    var file = fileList[i], why = uploadRejectReason(file);
    if (why){ rejected.push(why); continue; }
    var id = 'f' + (++FILE_SEQ);
    FILES[id] = {id:id, name:file.name, type:file.type || '', size:file.size, blob:file, demo:false};
    ids.push(id);
  }
  return {ids:ids, rejected:rejected};
}
function toastRejected(rejected){
  if (!rejected.length) return;
  DB.toast = {msg:'올릴 수 없는 파일 ' + rejected.length + '건', cap:rejected.join(' / ')};
  renderToast();
}
function pickFiles(key, fileList){
  if (writeBlocked()) return;
  if (!fileList || !fileList.length) return;
  var f = DB.donorForm;
  if (!f.files[key]) f.files[key] = [];
  var got = registerPickedFiles(fileList);
  f.files[key] = f.files[key].concat(got.ids);
  toastRejected(got.rejected);
  render();
}


/* ── 키보드 (Alt+←/→) ── */
document.addEventListener('keydown', function(e){
  if (DB.viewer && e.key === 'Escape'){ e.preventDefault(); closeViewer(); return; }
  if (DB.viewer) return;                /* 뷰어가 열려 있으면 다른 단축키 무동작 */
  if (modalOpen()) return;              /* 온보딩 모달 표시 중에는 단축키 무동작 */
  if (!e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'ArrowLeft'){ e.preventDefault(); navBack(); }
  if (e.key === 'ArrowRight'){ e.preventDefault(); navForwardGo(); }
});
