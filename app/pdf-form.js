/* pdf-form.js — 신청서 PDF 생성 (브라우저에서 만든다) · 2026-09-04 선미

   ★ 왜 브라우저인가 — 이름·주민번호·연락처·주소·서명은 DB 에 넣지 않고 이 PDF 안에만 둔다
     (privacy-design §2). 브라우저에서 만들어 저장소로 바로 올리면 개인정보가 서버 코드를
     한 번도 거치지 않는다. 배포할 서버함수도 없다.

   ★ 양식 — 기관의 물품기부신청서(법인외) 종이 양식을 그대로 옮겼다.
     2026-09-05 — **법인** 신청서 양식을 같은 함수 안에 갈래로 넣었다(d.formType === '법인').
       법인이 다른 곳: 기부법인명 · 사업자번호 · '장부가액 확인서' 블록 · 품목 표 6열(장부단가·판매단가·기부가액·판매가액)
       · 품목 5줄 · 합계 두 칸 · 서명란이 동의 문항 **앞** · 안내사항이 법인세법 기준 ·
       개인정보 동의서·주민번호 고지·법정대리인 표 **없음**. 열 너비는 hwp 원본값(mm).
     칸 너비·행 순서·문구는 원본과 같다. 다른 것은 셋뿐이다 —
       ① 개인정보 동의 문구는 종이가 아니라 **화면에서 후원자가 실제로 본 문구**를 찍는다
          (AI 전송 고지·보유기간이 종이 양식과 다르다 — consent-text-draft-20260903).
          PDF 는 '무엇에 동의했는가' 의 증빙이라 화면과 같아야 한다.
       ② 맨 아래에 접수 메타(접수번호·제출 시각·전자서명 성격)를 한 줄 붙인다.
       ③ 만 14세 미만 법정대리인 표는 해당할 때만 붙인다.

   의존: PDFLib · fontkit (assets/vendor, index.html 에서 먼저 로드) · assets/fonts/NDJSans-Regular.ttf
   외부 요청 없음 — 폰트·로고는 같은 배포본 안의 파일이다.

   쓰는 법:
     donorFormPdfData(DB.donorForm, c)            → 화이트리스트로 값을 추린다 (PDF 에 들어갈 것만)
     pdfAssets().then(a => buildDonorFormPdf(d, a)) → Uint8Array (PDF 바이트)
   node 에서도 돈다(smoke-test-pdf-form.mjs) — fetch 대신 assets 를 직접 넘긴다. */

var PDF_FONT_URL = 'assets/fonts/NDJSans-Regular.ttf';
var PDF_LOGO_URL = 'assets/brand/logo-color.png';

/* 개인정보 동의 문구 — **화면(screen-donor.js ⑥)과 PDF 가 이 배열 하나를 같이 쓴다.**
   ★ 2026-09-05 선미 결정 — 종이 양식(법인외 신청서)의 4개 항목을 **그대로** 쓰고, 종이에 없는 것은
     AI 판독 전송 고지 한 줄만 덧붙인다. 그 전(9/3)에는 보유 기간을 나눔대장 파기 기준으로 바꿔 적었는데,
     신청서와 화면이 다르면 후원자가 혼란스럽다는 판단으로 종이 문구로 되돌렸다.
   ⚠️ 보유 기간 "물품기부신청일로부터 5년" 은 재단 보유 기준이다. 나눔대장 사본은 기부일자+1년에 파기된다
     (purge_donation · 9/4 결정). ★ 2026-11-10 (오픈소스 점검 §4-3) — 그 사실이 동의문에 없어 ※ 한 줄을 넣었다.
     기준일은 코드와 같다: patch-20260904-purge.sql set_purge_due() 가 donation_date(신청서의 후원일자 칸,
     비면 입고일→등록일) + 1년으로 파기 예정일을 채운다. 파기는 자동이 아니라 담당자가 실행한다(관리자 가이드 6.8).
   ⚠️ 이 배열을 고치면 화면·PDF 가 같이 바뀐다 — 그게 의도다(둘이 다르면 PDF 가 '동의한 내용' 의 증빙이 못 된다). */
var DONOR_CONSENT_LINES = [
  '1. 개인정보의 수집·이용 목적: 기부물품 접수, 등록, 배분안내, 기부금영수증 발급 등',
  '2. 수집하는 개인정보의 항목',
  /* 연락처는 선택이다 (2026-09-11 선미) — 폼이 필수로 받지 않으면서 동의문만 필수라 적혀 있었다 */
  '   - 필수정보: 성함',
  '   - 선택정보: 연락처(전화번호 또는 휴대폰번호), 주민등록번호(기부금영수증 발급을 희망하시는 경우 필수), 주소',
  '   (만 14세 미만 아동의 경우) 법정대리인의 이름, 휴대전화 번호, 아동과의 관계',
  '3. 개인정보의 보유·이용 기간: 물품기부신청일로부터 5년',
  '   (「소득세법」 제160조의3에 따른 기부금영수증 발급명세서 보존 기간)',
  '   ※ 이 온라인 접수 시스템에 보관된 신청서와 서류는 기부일로부터 1년이 지나면 파기합니다.',
  '4. 귀하는 동의를 거부할 권리가 있으나, 거부 시 기부 신청이 제한됩니다.',
  '※ 제출하신 서류는 AI를 활용하여 검수할 수 있으며, 이를 위해 서류 이미지가 AI 판독 서비스로 전송됩니다.'
];
/* ★ 국외 이전 동의 (2026-09-10 선미 · 대응안 §1-3 나) — 화면·PDF 공용, 여기 하나에서 온다.
     왜 수집·이용 동의와 갈라 놓는가: 위탁은 공개 대상이지만 **국외 이전은 위탁이라도 별도 동의**가
     필요하다(개인정보 보호법 제28조의8 ① 1호). 한 체크박스에 묶으면 무엇에 동의한 것인지 갈리지 않는다.
   ★ 국가를 하나로 확정하지 않고 '가변성 자체'를 고지하는 형식이다 (9/10 확정) —
     Google·Cloudflare 모두 처리 국가를 미리 정해 두지 않는 서비스라 하나를 적으면 그것이 사실과 달라진다.
   ⚠️ 마지막 줄(거부 시 서면 접수)이 빠지면 안 된다 — 거부하면 기부 자체를 못 하는 구조면
     사실상 강제 동의라 동의의 유효성이 흔들린다. 대체 경로가 있어야 성립한다(대응안 §1-3 나 5). */
var DONOR_TRANSFER_LINES = [
  '제출하신 증빙서류를 자동으로 검수하기 위해, 서류 이미지가 해외 서비스로 전송되며 「개인정보 보호법」 제28조의8에 따라 동의가 필요합니다.',
  '',
  '· 무엇을 보내나요? (이전되는 항목)',
  '   신청서를 뺀 첨부 서류 전부의 이미지입니다 — 영수증·세금계산서 등 구매 증빙, 시가 확인 증빙, 원가명세서, 물품사진.',
  '   배분 단계에서 배분기관이 올린 배분 물품 사진·결과보고서도 같은 방식으로 전송됩니다.',
  '   ※ 서류에 적힌 개인정보(이름·연락처 등)는 가리지 않고 그대로 전송됩니다.',
  '   ※ 성함·주민등록번호·연락처·주소·서명이 담긴 신청서는 보내지 않습니다.',
  '',
  '· 어디로 보내나요? (이전받는 자·국가·연락처)',
  '   Google LLC (미국) — Gemini API로 서류를 읽어 금액·날짜·수량·서류 종류를 확인하는 데 씁니다.',
  '   (개인정보 문의: Google 개인정보처리방침(policies.google.com/privacy)의 문의 안내)',
  '   Cloudflare, Inc. (미국) — 후원물품 서류 접수 플랫폼 내에서 검수 요청을 전달하는 용도로 사용합니다.',
  '   (개인정보 문의: Cloudflare 개인정보처리방침(cloudflare.com/privacypolicy)의 문의 안내)',
  '   ※ 요청은 Supabase 서울 서버를 거쳐 Google로 전달되지만, 두 곳 모두 처리 국가를 미리 정해 두지 않는 서비스라 각 사가 지정하는 국가에서 처리될 수 있습니다.',
  '',
  '· 언제, 어떻게 보내나요? (이전 일시·방법)',
  '   담당자가 AI 검수를 실행할 때, 인터넷(네트워크)으로 전송합니다. 서류를 제출하시는 순간에는 보내지 않습니다.',
  '',
  '· 보낸 뒤에는 어떻게 되나요? (보유·이용 기간)',
  /* 법 제28조의8 ② 의 '보유·이용 기간' 항목이다 — 빼면 동의 요건이 빈다.
     ★ 근거 (2026-09-11 확인 · Gemini API Additional Terms 2026-04-28 판 · https://ai.google.dev/gemini-api/terms · Paid Services):
       "Google doesn't use your prompts … or responses to improve our products" /
       "Google logs prompts and responses for a limited period of time, solely for detecting and preventing violations" /
       "may be stored transiently or cached in any country".
     ⚠️ 그래서 "보관하지 않는다" 고 적으면 안 된다 — 제한된 기간 기록한다. 기간은 약관에 숫자가 없어 '제한된 기간' 그대로.
       '어느 나라에서든 캐시될 수 있다' 는 우리 가변성 고지 형식과 맞는다. 무료 등급이었다면 학습에 쓰이고 사람이 읽을 수 있었다(9/9 유료 키 교체 전 기간은 시험 서류뿐 · 작업판 개인정보 ②).
     ★ 2026-11-10 (오픈소스 점검 §4-1) — 전송 항목·시점·연락처를 실제 동작에 맞췄다.
       전송 대상은 api.js extractableItems(첨부 A 중 AI_BLOCKED_KEYS 제외 전부 — 배분 단계 서류 포함),
       시점은 담당자의 [검수 실행]·[다시 판정](screen-staff.js runInspect) 뿐이다. 이미지는 가리지 않고 줄이기만 한다(shrinkForJudge).
       연락처·보유 기간의 최종 문구는 법률 검토 후 확정한다(docs/동의문구.md 참조) — 화면·PDF 에는 그 표시를 넣지 않는다. */
  '   Google은 전송된 서류 이미지를 모델 학습이나 제품 개선에 쓰지 않으며, Gemini API 유료 이용약관에 따라 위반 탐지 목적으로만 제한된 기간 기록한 뒤 지웁니다. 판독 결과만 이 시스템에 저장됩니다.',
  '',
  '· 동의하지 않으셔도 됩니다.',
  '   거부하실 경우, 온라인 접수를 이용하실 수 없으며 서면 신청서로 접수할 수 있습니다. (문의: 재단 담당자)'
];
/* ★ 처리 위탁 안내 (2026-09-10) — 동의가 아니라 **고지**다. 체크박스를 만들지 않는다.
     위탁은 동의 대상이 아니라 공개 대상이고(대응안 §1-3 다), 본체는 재단 개인정보 처리방침 반영이다. */
var DONOR_ENTRUST_LINES = [
  '접수·검수 처리를 위해 아래 업체에 일부 업무를 위탁하고 있습니다.',
  '· Google LLC — 제출 서류의 자동 검수(AI 판독)',
  '· Supabase Inc. — 접수 정보 및 서류 파일의 저장·보관 (데이터 보관 서버: 대한민국 서울)',
  '· Cloudflare, Inc. — 화면 제공 및 요청 전달',
  '위탁 현황은 재단 개인정보 처리방침에서도 확인하실 수 있습니다.'
];
/* ★ 법인 후원자 고지 (2026-09-10 선미 · 대응안 §1-4) — 전에는 법인에게 아무 고지도 안 했다.
     법인이 내는 거래명세서·세금계산서에는 **담당자 성명·연락처가 섞여 온다**(9/3 실서류 12건 확인).
   ★ '동의합니다' 가 아니라 '확인합니다' 인 이유 — 법인은 정보주체가 아니라 동의할 수 없다.
     이건 동의가 아니라 확인·보증이고, **재단을 면책해 주지 않는다**(수집한 이상 처리자는 재단이다).
     실익은 권한 없는 정보가 들어왔을 때 소명을 요구할 근거다. 발표에서 면책 장치처럼 말하면 안 된다. */
var CORP_DOC_NOTICE_LINES = [
  '제출하신 서류(거래명세서·세금계산서·영수증 등)에 담당자 성함·연락처 등',
  '개인정보가 포함되어 있을 수 있습니다.',
  '',
  '· 서류 검수 목적으로만 이용하며, 따로 뽑아 저장하지 않습니다.',
  '· 담당자가 AI 검수를 실행할 때, 신청서를 뺀 첨부 서류 전부의 이미지가 Google LLC(미국)로 전송됩니다.',
  '   ※ 서류에 적힌 개인정보(이름·연락처 등)는 가리지 않고 그대로 전송됩니다.',
  '   ※ 법인인감(직인) 날인 이미지와 신청서는 전송하지 않습니다.',
  '· 보유·이용 기간은 물품기부신청일로부터 5년입니다.'
];
/* 종이 양식 머리말 두 줄 — 화면·PDF 공용.
   ★ 재단 이름 표기 규칙 (선미 9/5): 신청서·인수증·동의문처럼 **법적·회계 서류에 찍히는 곳은 '사회복지법인 어린이재단'**.
     '초록우산'은 브랜드명이라 로고·화면 표기에만 쓴다. 종이 양식 원본에 '초록우산 어린이재단'이라 돼 있어도 이 규칙을 따른다. */
var DONOR_CONSENT_INTRO = [
  '* 사회복지법인 어린이재단은 개인정보보호법과 전자금융거래법을 준수하며, 개인정보보호법 제15조 및 제22조에 따라 개인정보 수집·이용에 대한 귀하의 동의를 받고자 합니다.'
  /* 소득세법 제34조 공제 안내는 기부금영수증 칸으로 옮겼다 (2026-09-11 선미 · TAX_NOTE_INDIV) */
];
/* 공제 안내 — 유형별로 하나씩. 화면은 기부금영수증 칸 아래, PDF 는 안내사항 마지막 줄 (2026-09-11 선미) */
var TAX_NOTE_INDIV = '개인 및 개인사업자는 소득세법 제34조(소득금액의 30% 내에서 세액공제)에 의거하여 공제받으실 수 있습니다.';
var TAX_NOTE_CORP  = '법인사업자는 법인세법 제24조(소득금액의 10% 내에서 손비인정)에 의거하여 공제 받으실 수 있습니다.';

/* 종이 양식 그대로 — 안내사항 · 주민번호 수집 고지 */
var DONOR_GUIDE_LINES = [
  "1. 개인의 현물 기부 시 단가는 소득세법 시행령 제81조에 따라 '시가' 적용",
  '   · 현물을 구입하여 기부하는 경우 구입한 금액을 기부가액으로 함 ☞ 구매 증빙 서류(매입세금계산서, 구매 영수증 등) 필첨',
  '   · 자사 제조 물품을 기부하는 경우 시가를 기부가액으로 함 ☞ 시가 확인 증빙 반드시 첨부(예: 인터넷 판매 가격 출력물)',
  '2. 구매 증빙 불가 서류: 거래명세표, 간이영수증(간이사업자등록증 유첨 시 가능), 견적서, 단가표 등',
  '3. ' + TAX_NOTE_INDIV
];
/* 법인 신청서 양식의 안내사항 — 법인세법 기준.
   ★ 취득경로별로 갈린다 (2026-09-11 선미) — 구매는 장부가액(구입가), 제조·유통은 제조원가.
     화면에서는 이 내용이 각 칸(단가 힌트·증빙 칸 설명·원가명세서 설명)으로 흩어져 들어갔고,
     PDF 의 안내사항 블록은 여기서 그린다. 종이 양식의 4번(개인·법인 공제 병기)은 유형별 한 줄로 나눴다. */
function corpGuideLines(path){
  var mfg = /제조/.test(String(path || ''));
  return [
    mfg
      ? "1. 법인의 현물 기부 시 단가는 법인세법 시행령 제36조에 따라 제조원가를 기준으로 기입 ☞ 원가명세서, 회계장부 사본 등이 있을 시 첨부"
      : "1. 법인의 현물 기부 시 단가는 법인세법 시행령 제36조에 따라 '장부가액'(구입한 금액)으로 작성 ☞ 구매 증빙 서류(매입세금계산서, 구매 영수증 등) 필첨",
    '2. 구매 증빙 불가 서류: 거래명세표, 견적서, 간이영수증, 단가표 등 (단, 간이사업자등록증 첨부 시 간이영수증 증빙 가능)'
  ].concat(mfg
    ? ['3. 법인의 장부가액 세부 내역은 외부 비공개를 원칙으로 하고 있으며, 위 금액에 대한 사실 책임 여부는 법인에 있음',
       '4. ' + TAX_NOTE_CORP]
    : ['3. ' + TAX_NOTE_CORP]);
}
var CORP_GUIDE_LINES = corpGuideLines('구매');   /* 옛 이름 — 화면·검사가 상수로 부르던 자리를 비우지 않는다 */
var DONOR_RRN_NOTICE_LINES = [
  '1. 기부금에 대한 세액공제를 위하여 소득세법 제34조에 따라 신청자의 주민등록번호를 수집합니다.',
  '2. 개인정보 보호법 제15조 제1항에 따라 정보주체의 동의 없이 수집·이용함을 안내드립니다.'
];

/* ── 폼 상태 → PDF 데이터 (화이트리스트) ────────────────────────
   ★ f 를 통째로 넘기지 않는다 — 폼에 칸이 늘 때마다 PDF 에 조용히 따라 들어가면 안 된다.
     여기 적힌 것만 PDF 에 찍힌다. 반대로 DB(submissionPayload)에는 여기 있는 개인정보가 없다. */
/* ── 법인인감(직인) 이미지 심기 — 2026-09-10 ─────────────────────────
   후원자가 올린 날인 파일은 PNG 일 수도 JPEG 일 수도 있다. pdf-lib 는 둘을 다른 함수로 받으므로
   **확장자가 아니라 매직넘버**로 가른다 — 확장자는 거짓말을 한다(.jpg 로 저장된 PNG 가 실제로 온다).
   ⚠️ 실패는 조용히 null 로 돌린다. 날인을 못 찍더라도 신청서 PDF 자체는 나와야 한다 —
     그 PDF 가 이름·연락처·주소가 저장되는 유일한 사본이다(privacy-design §2).
     날인이 빠진 자리는 drawSign 이 '첨부 서류로 별도 보관' 문구로 갈음하고, 원본은 첨부에 남는다. */
function sealBytes(blob){
  if (blob.arrayBuffer) return blob.arrayBuffer();
  /* 구형 Safari 대비 — Blob.arrayBuffer 가 없다 */
  return new Promise(function(res, rej){
    var fr = new FileReader();
    fr.onload = function(){ res(fr.result); };
    fr.onerror = function(){ rej(fr.error || new Error('파일을 읽지 못했습니다')); };
    fr.readAsArrayBuffer(blob);
  });
}
function embedSealImage(doc, blob){
  if (!doc || !blob) return Promise.resolve(null);
  return sealBytes(blob).then(function(buf){
    var b = new Uint8Array(buf);
    var isPng  = b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
    var isJpeg = b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
    if (isPng)  return doc.embedPng(b);
    if (isJpeg) return doc.embedJpg(b);
    throw new Error('PNG·JPEG 가 아닙니다 (' + b[0] + ' ' + b[1] + ')');
  }).catch(function(err){
    console.warn('[PDF] 법인인감 날인을 심지 못했습니다 — 첨부로만 남습니다:', (err && err.message) || err);
    return null;
  });
}

function donorFormPdfData(f, c, opt){
  opt = opt || {};
  var corp = (c && c.donorType === '법인');
  var qty = Number(f.qty) || 0;
  var unitBook = Number(f.unitBook) || 0, unitSale = Number(f.unitSale) || 0;
  var unit = corp ? unitBook : unitSale;
  var total = (typeof giftValOf === 'function') ? giftValOf(f, corp) : qty * unit;
  /* 법인 양식의 오른쪽 열 — 판매가액(수량×판매단가). 제조·유통 물품일 때만 쓰는 칸이라 단가가 없으면 비운다(null) */
  var hasSale = unitSale > 0 || (typeof isOverridden === 'function' && isOverridden(f.saleVal));
  var totalSale = !corp ? null : !hasSale ? null : (typeof saleValOf === 'function') ? saleValOf(f) : qty * unitSale;
  return {
    formType:   corp ? '법인' : '법인외',
    caseId:     c ? c.id : null,
    donorName:  f.donorName || '',
    donDate:    f.donDate || '',
    addr:       f.addr || '',
    phone:      f.phone || '',
    wantsReceipt: !!f.wantsReceipt,
    /* 주민번호·사업자번호 — 영수증 발급을 원할 때만 칸이 열린다(양식: 미발급시 작성 불필요) */
    idNo:       f.wantsReceipt ? (corp ? (f.bizNo || '') : (f.rrn || '')) : '',
    purpose:    f.purpose || '',
    path:       (c && c.acqPath) || f.path || '',
    items:      [{ name: f.itemName || '', qty: qty, pkg: f.pkg || '', unitPrice: unit, amount: qty * unit,
                   /* 법인 양식 6열용 — 법인외 PDF 는 안 읽는다 */
                   unitBook: unitBook, unitSale: unitSale, amountBook: qty * unitBook, amountSale: hasSale ? qty * unitSale : null }],
    total:      total,
    totalSale:  totalSale,                    /* 법인만 · 판매가액 합계(없으면 null → 빈칸) */
    note:       f.note || '',
    agreePurpose: !!f.agreePurpose,
    agreeDouble:  !!f.agreeDouble,
    privacy:      !!f.privacy,
    /* ★ 국외 이전 동의 (2026-09-12 선미 · #316) — 이 줄이 빠져 있었다.
         아래 PDF 는 d.privacyTransfer 로 칸을 찍는데(buildDonorFormPdf 의 tAsk) 여기서 안 실어
         **늘 undefined** 였고, 그래서 모든 법인외 신청서 PDF 에 「■ 동의하지 않음」 이 찍혔다.
         폼은 동의 없이는 제출을 막으므로(screen-donor.js formErrors) 실제로는 전원 동의했다 —
         PDF 는 "무엇에 동의했나" 의 유일한 증빙인데 사실과 정반대를 적고 있었다.
       ⚠️ 9/10(국외 이전 블록 신설)~9/12 사이에 만들어진 PDF 는 이미 틀리게 찍혀 있다. 다시 찍을 수 없다
         (값이 후원자 브라우저에만 있었다) — 그 건들은 화면·DB 의 동의 기록으로 봐야 한다. */
    privacyTransfer: !!f.privacyTransfer,
    signed:       !!f.signed,
    signImg:      f.signImg || null,          /* data:image/png;base64,… (서명 패드 캔버스) */
    /* ★ 법인인감(직인) 날인 — 2026-09-10. 법인은 전자서명을 쓰지 않으므로 이것이 원본 증빙이다.
         첨부로 올린 그 파일의 blob 을 그대로 싣는다(이 세션 메모리에만 있다 · common.js FILES).
         dataURL 로 미리 바꾸지 않는 이유: 변환이 비동기라 여기(동기 스냅샷)에서 못 한다.
       ⚠️ 이미지가 아니면(PDF 스캔 등) 심지 않고 아래 문구로 갈음한다 — 억지로 넣으면 깨진다. */
    sealBlob:     (corp && typeof corpSealFileId === 'function' && typeof fileMeta === 'function')
                    ? (function(){
                        var id = corpSealFileId(f); if (!id) return null;
                        var m = fileMeta(id);
                        if (!m || !m.blob) return null;
                        if (typeof fileKind === 'function' && fileKind(id) !== 'image') return null;
                        return m.blob;
                      })()
                    : null,
    under14:      !!f.under14,
    guardian:     f.under14 ? { agreed: !!f.guardian, name: f.guardianName || '', phone: f.guardianPhone || '', relation: f.guardianRelation || '' } : null,
    submittedVia: (c && c.submittedVia) || '',
    submittedAt:  opt.submittedAt || new Date().toISOString(),
    proxy:        false   /* [직접 등록] 경로는 9/4 에 없앴다 — 늘 후원자 본인 제출이다 */
  };
}

/* ══ 인수증 PDF (2026-09-05 선미) ═══════════════════════════════
   기관이 폼으로 작성하고 수령자가 전자서명한 인수증을 기관의 인수증 종이 양식
   모양으로 찍는다. 표 너비 165.1mm · 제목 25pt · 본문 13pt · ※ 11pt · 수령자/기관 15pt · 귀중 16pt (hwpx 원본값).
   ★ 수령자명·서명은 DB 에 없다(submitOrg 의 payload 화이트리스트) — 신청서와 같이 **이 PDF 가 유일한 사본**이다.
   ★ 신청서와 같은 사슬을 탄다: form_submission('인수증', pdf_key 빈칸) 먼저 → PDF → forms/<건>/<uuid>.pdf → pdf_key 채움.
     그래서 담당자 열람(pdf.view 기록)·ZIP·파기(purge_donation)가 따로 손댈 것 없이 그대로 적용된다. */
function orgReceiptPdfData(f, c, opt){
  opt = opt || {};
  return {
    formType:    '인수증',
    caseId:      c ? c.id : null,
    distId:      opt.distId || null,
    item:        opt.item || (c && ((c.donation && c.donation.itemName) || c.item)) || '',
    qty:         Number(f.recvQty) || 0,
    pkg:         f.recvPkg || '',
    recvDate:    f.recvDate || '',
    receiver:    f.receiverName || '',          /* ★ 개인정보 — PDF 에만 */
    org:         opt.org || (c && c.orgName) || '',
    signed:      !!f.signImg,
    signImg:     f.signImg || null,             /* ★ 서명 이미지 — PDF 에만 */
    submittedAt: opt.submittedAt || new Date().toISOString()
  };
}
function createOrgReceiptPdf(d){
  return loadPdfLibs().then(pdfAssets).then(function(a){ return buildOrgReceiptPdf(d, a); });
}
var RECEIPT_NOTE_LINES = ['※ 인수한 위 후원물품은 재판매, 교환 등', '후원목적 및 지원 의도에 손상되는 용도로 사용하지 않습니다.'];
function buildOrgReceiptPdf(d, assets){
  if (typeof PDFLib === 'undefined' || typeof fontkit === 'undefined')
    return Promise.reject(new Error('PDF 라이브러리(pdf-lib·fontkit)가 로드되지 않았습니다 — index.html 의 assets/vendor 스크립트를 확인하세요'));
  var PL = PDFLib, rgb = PL.rgb;
  var W = PDF_A4[0], H = PDF_A4[1];
  var BLACK = rgb(0, 0, 0), GRAY = rgb(0.45, 0.45, 0.45), LINE = rgb(0.25, 0.25, 0.25);
  var TW = 165.1 * PDF_MM, X0 = (W - TW) / 2;        /* 원본 표 너비 · 가운데 */
  var doc, font, page;
  function tw(s, size){ return font.widthOfTextAtSize(s, size); }
  function text(s, x, yTop, size, o){
    o = o || {};
    var opts = { x: x, y: H - yTop - size * 0.86, size: size, font: font, color: o.color || BLACK };
    page.drawText(s, opts);
    if (o.bold){ opts.x = x + size * 0.03; page.drawText(s, opts); }
  }
  function textCenter(s, x, w, yTop, size, o){ text(s, x + (w - tw(s, size)) / 2, yTop, size, o); }
  function ymd(s){ var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[1] + '. ' + m[2] + '. ' + m[3] : '0000. 00. 00'; }
  function money(n){ n = Number(n) || 0; return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  return PL.PDFDocument.create().then(function(dd){
    doc = dd;
    doc.registerFontkit(fontkit);
    doc.setTitle('인수증 #' + (d.caseId || '') + (d.org ? ' · ' + d.org : ''));
    doc.setProducer('나눔대장'); doc.setCreator('나눔대장 배분기관 제출');
    return Promise.all([doc.embedFont(assets.font, { subset: true }),
                        d.signImg ? doc.embedPng(d.signImg).catch(function(){ return null; }) : null]);
  }).then(function(r){
    font = r[0]; var sign = r[1];
    page = doc.addPage(PDF_A4);
    var y = 38 * PDF_MM, pad = 8 * PDF_MM;
    /* 상자 — 제목 · 구분 · 수량 · 점선 · 인수 문구 · ※ 두 줄 (원본 표 한 칸) */
    var boxTop = y;
    y += 9 * PDF_MM;
    textCenter('인  수  증', X0, TW, y, 25, { bold: true }); y += 25 + 12 * PDF_MM;
    text('■ 구   분 :   ' + (d.item || ''), X0 + pad, y, 13); y += 13 + 6 * PDF_MM;
    /* ★ 낱개 수만 (선미 2026-09-06) — 신청서 두 곳과 같은 이유.
         '100 개 (5박스)' 는 어느 쪽이 수량인지 헷갈린다. 인수증은 기관이 서명하는 실물 서류라
         더 그렇다. 포장 단위는 제출본 payload 에 그대로 남는다. */
    text('■ 수   량 :   ' + (d.qty ? money(d.qty) + ' 개' : ''), X0 + pad, y, 13); y += 13 + 8 * PDF_MM;
    page.drawLine({ start: {x: X0 + pad, y: H - y}, end: {x: X0 + TW - pad, y: H - y}, thickness: 0.8, color: LINE, dashArray: [3, 2] });
    y += 8 * PDF_MM;
    textCenter('상기 내용과 같이 후원물품을 정히 인수함.', X0, TW, y, 13); y += 13 + 5 * PDF_MM;
    RECEIPT_NOTE_LINES.forEach(function(s){ textCenter(s, X0, TW, y, 11); y += 11 * 1.45; });
    y += 8 * PDF_MM;
    page.drawRectangle({ x: X0, y: H - y, width: TW, height: y - boxTop, borderColor: LINE, borderWidth: 0.8, opacity: 0 });

    /* 상자 아래 — 날짜 · 수령자명(서명) · 기관명(직인) · 귀중 */
    y += 14 * PDF_MM;
    textCenter(ymd(d.recvDate), X0, TW, y, 13); y += 13 + 14 * PDF_MM;
    var lx = X0 + 22 * PDF_MM;
    /* ★ 서명은 기관명 줄 오른쪽 '(서명/직인)' 자리에 (2026-09-12 선미) — 담당자명 옆 '(서명)' 은 뺐다.
         종이 인수증의 직인 자리와 같은 곳에 전자서명이 놓인다. 서명이 없으면 자리 표시만 남는다. */
    var recvTxt = '담당자명   ' + (d.receiver || '');   /* 화면 라벨과 같이 '담당자명' (선미 9/10) */
    text(recvTxt, lx, y, 15);
    y += 15 + 9 * PDF_MM;
    text('기관명   ' + (d.org || ''), lx, y, 15);
    var stampLbl = '(서명/직인)';
    var stampX = X0 + TW - 22 * PDF_MM - tw(stampLbl, 13);
    text(stampLbl, stampX, y + 1, 13);
    if (sign && d.signed){
      /* 서명 캔버스(600×220) 비율 그대로 · 높이 12mm · (서명/직인) 글자 왼쪽에 */
      var sh = 12 * PDF_MM, sw = sh * sign.width / sign.height;
      if (sw > 42 * PDF_MM){ sw = 42 * PDF_MM; sh = sw * sign.height / sign.width; }
      var sx = stampX - sw - 3 * PDF_MM;
      page.drawImage(sign, { x: sx, y: H - y - 15 * 0.86 - sh / 2 + 5, width: sw, height: sh });
    }
    /* "직인 없음 — 담당자 전자서명으로…" 줄은 뺐다 (2026-09-12 선미) */
    y += 15 + 19 * PDF_MM;
    textCenter('사회복지법인 어린이재단 귀중', X0, TW, y, 16, { bold: true });   /* ★ 서류에는 법인명 — 초록우산은 브랜드명 (선미 9/5) */

    /* 꼬리말("나눔대장 배분기관 제출본 · 접수번호 … 내부 관리·감사 추적용")은 뺐다 (2026-09-12 선미).
       접수번호·제출 시각은 payload 와 attachment 행에 그대로 남는다 — 종이에는 안 찍는다. */
    return doc.save();
  });
}

/* pdf-lib·fontkit(합쳐 1.3MB)을 index.html 에서 미리 싣지 않고 필요할 때 받는다 —
   ⚠️ "필요할 때" 가 2026-09-04 에 **제출 순간 → 폼 열 때** 로 바뀌었다(preloadPdfLibs 참조).
     제출 순간에 받으면 하필 그 몇 초의 회선 상태에 제출 전체가 걸린다(정본 24번).
   index.html 에는 이 파일(pdf-form.js)만 싣는다. */
var PDF_LIB_URLS = ['assets/vendor/pdf-lib.min.js', 'assets/vendor/fontkit.umd.min.js'];
var _pdfLibs = null;
function loadPdfLibs(){
  if (typeof PDFLib !== 'undefined' && typeof fontkit !== 'undefined') return Promise.resolve();
  if (_pdfLibs) return _pdfLibs;
  _pdfLibs = Promise.all(PDF_LIB_URLS.map(function(url){
    return new Promise(function(res, rej){
      var s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = function(){ res(); };
      s.onerror = function(){ rej(new Error(url + ' 을 불러오지 못했습니다')); };
      document.head.appendChild(s);
    });
  })).then(function(){}).catch(function(err){ _pdfLibs = null; throw err; });
  return _pdfLibs;
}

/* ── 부품을 미리 받아 둔다 (2026-09-04 선미) ────────────────────
   ★ 사고의 뿌리를 없앤다. 전에는 **[제출]을 누른 그 순간**에 약 2.7MB 를 받기 시작했다
     (pdf-lib 525KB + fontkit 758KB + 한글 폰트 1.4MB · 2026-09-04 브라우저 실측).
     하필 그 몇 초의 네트워크 상태에 전부가 걸려 있었고,
     열리지도 오류를 내지도 않으면 제출 사슬 전체가 멈췄다.
     (미공개 내부 기록)

   ★ 후원자는 신청서를 **몇 분** 동안 작성한다. 그 사이에 받아 두면 제출 순간에 남는 일은
     PDF 그리기(인터넷 불필요)와 업로드뿐이다.
   ⚠️ 위 머리말의 "제출 순간에만 받는다" 는 여기서 뒤집혔다. 아낀 것(안 낼 사람의 2.7MB)보다
     잃을 것(제출이 조용히 멈춤)이 크다. 이 폼은 담당자가 특정인에게 보낸 링크라 대부분 제출한다.

   ⚠️ 실패해도 조용히 둔다 — 미리 받기는 **보조**다. 진짜 판단은 제출할 때
     createDonorFormPdf 가 한다. 여기서 시끄러우면 폼을 여는 것만으로 경고가 뜬다.
   ⚠️ 여러 번 불러도 안전하다 — loadPdfLibs·pdfAssets 가 각자 한 번만 받는다(_pdfLibs·_pdfAssets). */
function preloadPdfLibs(){
  try {
    return loadPdfLibs().then(pdfAssets).catch(function(err){
      console.warn('[PDF] 부품 미리 받기 실패 — 제출할 때 다시 시도합니다:', (err && err.message) || err);
    });
  } catch (e) { return Promise.resolve(); }
}

/* 한 번에: 라이브러리 → 폰트·로고 → PDF 바이트(Uint8Array). submitDonor 가 부른다 */
function createDonorFormPdf(d){
  return loadPdfLibs().then(pdfAssets).then(function(a){ return buildDonorFormPdf(d, a); });
}

/* 폰트·로고를 한 번만 받아 둔다.
   ⚠️ "제출 버튼을 누른 뒤에 부른다" 는 2026-09-04 에 뒤집혔다 — preloadPdfLibs 가 폼 열 때 부른다.
     폰트가 1.4MB 라 제출 순간에 받으면 거기서 멈춘다(정본 24번). */
var _pdfAssets = null;
function pdfAssets(){
  if (_pdfAssets) return _pdfAssets;
  var get = function(url){
    return fetch(url).then(function(r){
      if (!r.ok) throw new Error(url + ' 을 받지 못했습니다 (HTTP ' + r.status + ')');
      return r.arrayBuffer();
    }).then(function(b){ return new Uint8Array(b); });
  };
  _pdfAssets = Promise.all([get(PDF_FONT_URL), get(PDF_LOGO_URL)]).then(function(r){
    return { font: r[0], logo: r[1] };
  }).catch(function(err){ _pdfAssets = null; throw err; });
  return _pdfAssets;
}

/* ── PDF 그리기 ──────────────────────────────────────────── */
var PDF_MM = 72 / 25.4;                       /* 1mm = 2.8346pt */
var PDF_A4 = [595.28, 841.89];
var PDF_MARGIN_X = (210 - 188.02) / 2 * PDF_MM;   /* 양식 표 너비 188.02mm 를 가운데에 */
var PDF_COLS = [25.04, 68.97, 23.05, 70.96].map(function(mm){ return mm * PDF_MM; });   /* 법인외 신청서 열 너비 */
var PDF_ITEM_COLS = [28.68, 31.67, 31.67, 70.96].map(function(mm){ return mm * PDF_MM; }); /* 품목 표 열 너비 (2~4열 안) */
/* 법인 신청서 양식 — 표 188.36mm · 품목 표 6열(품목·수량·단가(장부)·단가(판매)·기부가액·판매가액) · hwp 원본값 */
var PDF_CORP_COLS = [23.04, 70.96, 23.05, 70.96].map(function(mm){ return mm * PDF_MM; });
var PDF_CORP_ITEM_COLS = [22.75, 23.75, 23.75, 23.75, 35.48, 35.48].map(function(mm){ return mm * PDF_MM; });

function buildDonorFormPdf(d, assets){
  if (typeof PDFLib === 'undefined' || typeof fontkit === 'undefined')
    return Promise.reject(new Error('PDF 라이브러리(pdf-lib·fontkit)가 로드되지 않았습니다 — index.html 의 assets/vendor 스크립트를 확인하세요'));
  var PL = PDFLib, rgb = PL.rgb;
  var doc, font, logo, page, pageNo = 0, y;      /* y 는 위에서 아래로 내려오는 커서(pt) */
  var corp = (d.formType === '법인');            /* 법인 / 법인외 신청서 갈래 */
  var COLS = corp ? PDF_CORP_COLS : PDF_COLS;
  var W = PDF_A4[0], H = PDF_A4[1], TW = COLS[0] + COLS[1] + COLS[2] + COLS[3], X0 = (W - TW) / 2;
  var BLACK = rgb(0, 0, 0), GRAY = rgb(0.45, 0.45, 0.45), SHADE = rgb(0.93, 0.93, 0.93), LINE = rgb(0.25, 0.25, 0.25);
  var TOP = 12 * PDF_MM, BOTTOM = 14 * PDF_MM;

  /* 글자 폭 — 줄바꿈과 가운데 정렬에 쓴다 */
  function tw(s, size){ return font.widthOfTextAtSize(s, size); }
  /* 폭에 맞춰 줄을 나눈다 — 한글은 글자 단위로 끊어도 자연스럽다. 공백이 있으면 거기서 먼저 끊는다 */
  function wrap(text, size, maxW){
    var out = [];
    String(text == null ? '' : text).split('\n').forEach(function(para){
      var line = '';
      var toks = para.split(/(\s+)/);
      toks.forEach(function(tok){
        if (!tok) return;
        if (tw(line + tok, size) <= maxW){ line += tok; return; }
        if (line.trim()){ out.push(line.replace(/\s+$/, '')); line = ''; }
        /* 한 토큰이 폭을 넘으면 글자 단위로 자른다 */
        var buf = '';
        for (var i = 0; i < tok.length; i++){
          if (tw(buf + tok[i], size) > maxW && buf){ out.push(buf); buf = ''; }
          buf += tok[i];
        }
        line = buf.replace(/^\s+/, '');
      });
      out.push(line.replace(/\s+$/, ''));
    });
    return out;
  }
  /* 글자 한 줄 — yTop 은 줄의 윗변. 굵게는 폰트가 하나뿐이라 살짝 겹쳐 찍는다 */
  function text(s, x, yTop, size, o){
    o = o || {};
    var baseline = H - yTop - size * 0.86;
    var opts = { x: x, y: baseline, size: size, font: font, color: o.color || BLACK };
    page.drawText(s, opts);
    if (o.bold){ opts.x = x + size * 0.03; page.drawText(s, opts); }
  }
  function textCenter(s, x, w, yTop, size, o){ text(s, x + (w - tw(s, size)) / 2, yTop, size, o); }
  function textRight(s, x, w, yTop, size, o){ text(s, x + w - tw(s, size), yTop, size, o); }
  function rect(x, yTop, w, h, o){
    o = o || {};
    page.drawRectangle({ x: x, y: H - yTop - h, width: w, height: h,
      borderColor: o.noBorder ? undefined : LINE, borderWidth: o.noBorder ? 0 : 0.6,
      color: o.fill || undefined, opacity: o.fill ? 1 : 0 });
  }
  function hline(x1, x2, yy){ page.drawLine({ start: {x: x1, y: H - yy}, end: {x: x2, y: H - yy}, thickness: 0.6, color: LINE }); }

  /* 셀 하나 — 라벨 칸(음영·가운데)과 값 칸(왼쪽 정렬). 값이 길면 줄바꿈하고 칸 높이를 돌려준다 */
  function cell(x, yTop, w, h, s, o){
    o = o || {};
    var size = o.size || 8.5, pad = 1.8 * PDF_MM;
    rect(x, yTop, w, h, { fill: o.head ? SHADE : undefined });
    var lines = wrap(s, size, w - pad * 2);
    var lh = size * 1.32, block = lines.length * lh;
    var ty = yTop + (h - block) / 2 + (lh - size) / 2;
    lines.forEach(function(ln, i){
      if (o.head || o.center) textCenter(ln, x, w, ty + i * lh, size, { bold: o.head || o.bold, color: o.color });
      else if (o.right) textRight(ln, x + 0, w - pad, ty + i * lh, size, { color: o.color });
      else text(ln, x + pad, ty + i * lh, size, { bold: o.bold, color: o.color });
    });
  }
  /* 줄바꿈 문단이 들어갈 칸의 높이 */
  function needH(s, size, w, minH){
    var pad = 1.8 * PDF_MM, lines = wrap(s, size, w - pad * 2);
    return Math.max(minH || 0, lines.length * size * 1.32 + 2.6 * PDF_MM);
  }
  function box(mark, label){ return (mark ? '■' : '□') + ' ' + label; }
  function money(n){ n = Number(n) || 0; return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function ymd(s){
    var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? { y: m[1], m: String(Number(m[2])), d: String(Number(m[3])) } : { y: '', m: '', d: '' };
  }

  function newPage(){
    page = doc.addPage(PDF_A4); pageNo++;
    y = TOP;
    if (pageNo === 1){
      /* 상단 로고 (양식 좌상단 30.31×9.15mm) + 제목 */
      var lw = 30.31 * PDF_MM, lhh = lw * logo.height / logo.width;
      page.drawImage(logo, { x: X0, y: H - y - lhh, width: lw, height: lhh });
      y += lhh + 3 * PDF_MM;
      textCenter('물 품 기 부 신 청 서 (' + d.formType + ')', X0, TW, y, 17, { bold: true });
      y += 17 + 4 * PDF_MM;
    } else {
      text('물품기부신청서(' + d.formType + ') — 이어서', X0, y, 8, { color: GRAY }); y += 8 + 3 * PDF_MM;
    }
  }
  /* 남은 높이가 모자라면 다음 장으로 */
  function ensure(h){ if (y + h > H - BOTTOM) newPage(); }
  function footer(){
    var pages = doc.getPages();
    pages.forEach(function(p, i){
      page = p;
      var s = '나눔대장 온라인 접수본 · 접수번호 #' + (d.caseId || '-') + ' · 제출 ' + fmtKst(d.submittedAt) +
              (d.signed ? ' · 간이 전자서명(내부 관리·감사 추적용)' : corp ? ' · 법인인감(직인) 날인' : ' · 전자서명 없음') +
              ' · ' + (i + 1) + '/' + pages.length;
      text(s, X0, H - BOTTOM + 4 * PDF_MM, 7, { color: GRAY });
    });
  }

  return PL.PDFDocument.create().then(function(dd){
    doc = dd;
    doc.registerFontkit(fontkit);
    doc.setTitle('물품기부신청서(' + d.formType + ') #' + (d.caseId || ''));
    doc.setProducer('나눔대장'); doc.setCreator('나눔대장 온라인 접수');
    return Promise.all([doc.embedFont(assets.font, { subset: true }), doc.embedPng(assets.logo),
                        d.signImg ? doc.embedPng(d.signImg).catch(function(){ return null; }) : null,
                        embedSealImage(doc, d.sealBlob)]);
  }).then(function(r){
    font = r[0]; logo = r[1]; var sign = r[2], seal = r[3];
    newPage();
    var c0 = COLS[0], c1 = COLS[1], c2 = COLS[2], c3 = COLS[3];
    var x0 = X0, x1 = x0 + c0, x2 = x1 + c1, x3 = x2 + c2;
    var R = 7.2 * PDF_MM;                                   /* 기본 행 높이 */
    var h;

    /* 1행 기부자명 · 후원일자 */
    h = Math.max(R, needH(d.donorName, 9, c1));
    cell(x0, y, c0, h, corp ? '기부법인명' : '기부자명\n(기부단체명)', { head: true, size: 7.5 });
    cell(x1, y, c1, h, d.donorName, { size: 9.5 });
    cell(x2, y, c2, h, '후원일자', { head: true });
    var dd = ymd(d.donDate);
    cell(x3, y, c3, h, dd.y ? (dd.y + '년 ' + dd.m + '월 ' + dd.d + '일') : '', { center: true, size: 9 });
    y += h;
    /* 2행 주소 · 연락처 */
    h = Math.max(R, needH(d.addr, 8.5, c1));
    cell(x0, y, c0, h, '주  소', { head: true });
    cell(x1, y, c1, h, d.addr);
    cell(x2, y, c2, h, '연락처', { head: true });
    cell(x3, y, c3, h, d.phone, { center: true });
    y += h;
    /* 3행 기부금영수증 · 주민등록번호 */
    h = R;
    cell(x0, y, c0, h, '기부금영수증', { head: true, size: 7.5 });
    cell(x1, y, c1, h, box(d.wantsReceipt, '발급') + '     ' + box(!d.wantsReceipt, '발급하지 않음'));
    cell(x2, y, c2, h, corp ? '사업자번호' : '주민등록번호\n(사업자번호)', { head: true, size: 7 });
    if (d.wantsReceipt) cell(x3, y, c3, h, d.idNo, { center: true, size: 9.5 });
    else cell(x3, y, c3, h, '기부금영수증 미발급 시 작성 불필요', { center: true, size: 7, color: GRAY });
    y += h;
    /* 4행 기부 목적 */
    h = Math.max(5.8 * PDF_MM, needH(d.purpose, 8.5, c1 + c2 + c3));
    cell(x0, y, c0, h, '기부 목적', { head: true });
    cell(x1, y, c1 + c2 + c3, h, d.purpose);
    y += h;

    /* 5~11행 기부가액 블록 — 왼쪽 라벨은 블록 전체 높이로 한 칸 */
    var blockTop = y;
    var xa = x1, wa = c1 + c2 + c3;
    h = 5.8 * PDF_MM;
    var paths = ['구매', '제조 및 유통', '기타'];
    var pathMark = function(p){ return box(p === '기타' ? !/구매|제조/.test(d.path) : (p === '구매' ? d.path === '구매' : /제조/.test(d.path)), p); };
    cell(xa, y, wa, h, '취득경로   ' + paths.map(pathMark).join('   '));
    y += h;
    /* 품목 표 머리 — 열 너비는 hwp 원본값을 블록 너비(wa)에 맞춰 비례 조정한다 */
    var icRaw = corp ? PDF_CORP_ITEM_COLS : PDF_ITEM_COLS;
    var icSum = icRaw.reduce(function(a, b){ return a + b; }, 0);
    var ic = icRaw.map(function(v){ return v * wa / icSum; });
    var ix = [xa]; ic.forEach(function(v, i){ if (i < ic.length - 1) ix.push(ix[i] + v); });
    var rows = (d.items || []).slice();
    var opt = function(v){ return (v === null || v === undefined || v === '') ? '' : money(v); };   /* 법인 판매가액 열 — 없으면 빈칸 */
    if (corp){
      /* 법인 양식: 품목 · 수량 · 단가(장부가액) · 단가(판매가액) · 기부가액{수량×장부단가} · 판매가액{수량×판매단가}
         판매가액 두 열은 '제조·유통 물품 기부 시 작성' — 원본은 첫 품목 줄에 회색 주석으로 있다. 머리칸에 붙인다. */
      var hd3 = '단가\n(판매가액)\n*제조·유통 물품 기부 시 작성', hd5 = '판매가액\n{ 수량 × 단가(판매가액) }\n*제조·유통 물품 기부 시 작성 필요';
      /* 원본 머리 행 13.04mm — 주석이 칸을 넘지 않게 글줄 수로 높이를 다시 잰다 */
      h = Math.max(13.04 * PDF_MM, needH(hd3, 6.5, ic[3]), needH(hd5, 6.5, ic[5]));
      cell(ix[0], y, ic[0], h, '품목', { head: true });
      cell(ix[1], y, ic[1], h, '수량', { head: true });
      cell(ix[2], y, ic[2], h, '단가\n(장부가액)', { head: true, size: 7.5 });
      cell(ix[3], y, ic[3], h, hd3, { head: true, size: 6.5 });
      cell(ix[4], y, ic[4], h, '기부가액\n{ 수량 × 단가(장부가액) }', { head: true, size: 7.5 });
      cell(ix[5], y, ic[5], h, hd5, { head: true, size: 6.5 });
      y += h;
      while (rows.length < 5) rows.push(null);                 /* 양식은 5줄 */
      rows.forEach(function(it){
        var hh = it ? Math.max(6.8 * PDF_MM, needH(it.name, 8.5, ic[0])) : 6.8 * PDF_MM;
        cell(ix[0], y, ic[0], hh, it ? it.name : '');
        /* ★ 수량 칸에는 **낱개 수만** 적는다 (선미 2026-09-06) — 전에는 '100 (5박스)' 였다.
             포장 단위는 참고용 자유 텍스트인데, 신청서의 수량 칸에 괄호로 붙어 있으면
             읽는 사람이 어느 쪽이 수량인지 헷갈린다. #214·#215 가 깨진 뿌리도 같다 —
             포장 단위 글자가 수량 자리에 들어간 것이었다(§12 K-1).
           ⚠️ 값을 버리는 것은 아니다 — 제출본 payload 의 '단위' 로 그대로 남는다(db.js). */
        cell(ix[1], y, ic[1], hh, it ? money(it.qty) : '', { center: true, size: 8 });
        cell(ix[2], y, ic[2], hh, it ? money(it.unitBook) : '', { right: true });
        cell(ix[3], y, ic[3], hh, it ? opt(it.unitSale > 0 ? it.unitSale : null) : '', { right: true });
        cell(ix[4], y, ic[4], hh, it ? money(it.amountBook) : '', { right: true });
        cell(ix[5], y, ic[5], hh, it ? opt(it.amountSale) : '', { right: true });
        y += hh;
      });
      h = 6.8 * PDF_MM;
      cell(xa, y, ic[0] + ic[1] + ic[2] + ic[3], h, '합  계', { head: true });
      cell(ix[4], y, ic[4], h, money(d.total) + ' 원', { right: true, bold: true, size: 9.5 });
      cell(ix[5], y, ic[5], h, (d.totalSale === null || d.totalSale === undefined) ? '원' : money(d.totalSale) + ' 원',
           { right: true, bold: d.totalSale != null, size: 9.5, color: d.totalSale == null ? GRAY : BLACK });
      y += h;
    } else {
      h = 7 * PDF_MM;
      cell(ix[0], y, ic[0], h, '품목', { head: true });
      cell(ix[1], y, ic[1], h, '수량', { head: true });
      cell(ix[2], y, ic[2], h, '단가\n(판매가액)', { head: true, size: 7.5 });
      cell(ix[3], y, ic[3], h, '기부가액\n{ 수량 × 단가(판매가액) }', { head: true, size: 7.5 });
      y += h;
      /* 품목 행 — 양식은 3줄. 품목이 그보다 많으면 늘리고, 적으면 빈 줄로 채운다 */
      while (rows.length < 3) rows.push(null);
      rows.forEach(function(it){
        var hh = it ? Math.max(6.8 * PDF_MM, needH(it.name, 8.5, ic[0])) : 6.8 * PDF_MM;
        cell(ix[0], y, ic[0], hh, it ? it.name : '');
        cell(ix[1], y, ic[1], hh, it ? money(it.qty) : '', { center: true });   /* 낱개 수만 — 위 법인 표와 같은 이유 */
        cell(ix[2], y, ic[2], hh, it ? money(it.unitPrice) : '', { right: true });
        cell(ix[3], y, ic[3], hh, it ? money(it.amount) : '', { right: true });
        y += hh;
      });
      h = 6.8 * PDF_MM;
      cell(xa, y, ic[0] + ic[1] + ic[2], h, '합  계', { head: true });
      cell(ix[3], y, ic[3], h, money(d.total) + ' 원', { right: true, bold: true, size: 9.5 });
      y += h;
    }
    /* 비고 */
    var noteTxt = '※ 비고: ' + (d.note || '판매가액이 기부가액(장부가액)보다 작거나 같은 경우 등 특이사항 작성');
    h = needH(noteTxt, 7.5, wa, 6.5 * PDF_MM);
    cell(xa, y, wa, h, noteTxt, { size: 7.5, color: d.note ? BLACK : GRAY });
    y += h;
    cell(x0, blockTop, c0, y - blockTop, corp ? '장부가액\n확인서' : '기부가액', { head: true });

    /* 동의 2건 */
    var drawAgree = function(){
    var ag1 = '■ 상기물품을 재단의 목적사업에 사용하는 것에 동의합니다. (미동의 시, 기부 불가)';
    var ag2 = '■ 부대비용(운송비 등)을 가액에 포함하는 경우, 해당 금액에 대해 이중 공제(매입 세금계산서 미발행)를 받지 않습니다.';
    var agW = TW - 26 * PDF_MM, size = 7.8;
    var l1 = wrap(ag1, size, agW - 3.6 * PDF_MM), l2 = wrap(ag2, size, agW - 3.6 * PDF_MM);
    h = (l1.length + l2.length) * size * 1.45 + 4 * PDF_MM;
    ensure(h);
    rect(x0, y, TW, h);
    var ty = y + 2 * PDF_MM, lh = size * 1.45;
    l1.forEach(function(s, i){ text(s, x0 + 1.8 * PDF_MM, ty + i * lh, size); });
    text(box(d.agreePurpose, '예') + '  ' + box(!d.agreePurpose, '아니오'), x0 + agW, ty, size);
    ty += l1.length * lh;
    l2.forEach(function(s, i){ text(s, x0 + 1.8 * PDF_MM, ty + i * lh, size); });
    text(box(d.agreeDouble, '예') + '  ' + box(!d.agreeDouble, '아니오'), x0 + agW, ty, size);
    y += h;
    };

    /* 서명란 */
    var sd = ymd(String(d.submittedAt || '').slice(0, 10));
    var drawSign = function(){
    h = 24 * PDF_MM;
    ensure(h);
    rect(x0, y, TW, h);
    textCenter('위 작성 내용은 사실만을 작성하였음을 아래와 같이 서명합니다.', x0, TW, y + 3 * PDF_MM, 9);
    textCenter(sd.y + ' 년   ' + sd.m + ' 월   ' + sd.d + ' 일', x0, TW, y + 9 * PDF_MM, 9);
    /* 기부자 (명칭/성명)  이름  [서명 자리 30mm]  (인)  — 서명 이미지는 그 자리에만 들어간다(이름과 안 겹치게) */
    var SIGN_W = 30 * PDF_MM, sy = y + 15.5 * PDF_MM;
    var inX = x0 + TW - 6 * PDF_MM - tw('(인)', 9);
    text('(인)', inX, sy, 9);
    var nameTxt = '기부자 (명칭/성명)   ' + (d.donorName || '');
    text(nameTxt, inX - SIGN_W - 4 * PDF_MM - tw(nameTxt, 9), sy, 9);
    if (corp && seal){
      /* ★ 법인인감(직인) — 2026-09-10. 후원자가 올린 날인 이미지를 (인) 자리에 찍는다.
           실제 서류에서 직인은 법인명 끝을 물고 찍히므로 (인) 글자에 살짝 겹치게 둔다.
           높이 기준 13mm · 가로가 넘치면 가로 기준으로 줄인다(비율 유지). */
      var SEAL_H = 13 * PDF_MM;
      var kh = SEAL_H, kw = kh * seal.width / seal.height;
      if (kw > SIGN_W){ kw = SIGN_W; kh = kw * seal.height / seal.width; }
      page.drawImage(seal, { x: inX - 1.5 * PDF_MM - kw, y: H - sy - 4.5 - kh / 2, width: kw, height: kh });
    } else if (sign && d.signed){
      var sh = 11 * PDF_MM, sw = sh * sign.width / sign.height;   /* 캔버스 600×220 비율 유지 · 높이 기준 */
      if (sw > SIGN_W){ sw = SIGN_W; sh = sw * sign.height / sign.width; }
      /* 글줄 세로 중심(sy + 4.5pt)에 이미지 중심을 맞춘다 */
      page.drawImage(sign, { x: inX - 2 * PDF_MM - SIGN_W + (SIGN_W - sw) / 2, y: H - sy - 4.5 - sh / 2, width: sw, height: sh });
    } else if (corp){
      /* 직인 이미지를 심지 못한 경우(파일이 PDF·이미지 아님·읽기 실패) — 원본이 어디 있는지 적어 둔다.
         이름 줄 **아래**에 적는다 — 같은 줄에 두면 '기부자 (명칭/성명)' 과 겹친다 */
      textRight('법인인감(직인) 날인 이미지는 첨부 서류로 별도 보관됩니다', x0, TW - 6 * PDF_MM, sy + 5 * PDF_MM, 7, { color: GRAY });
    } else if (d.proxy){
      textRight('서면 신청서에 자필 서명·날인 (스캔본 별도 첨부)', x0, TW - 6 * PDF_MM, sy + 5 * PDF_MM, 7, { color: GRAY });
    }
    y += h;
    };

    /* 안내사항 */
    var drawGuide = function(){
    var guide = (corp ? corpGuideLines(d.path) : DONOR_GUIDE_LINES).join('\n');
    h = needH(guide, 7.3, TW - 20 * PDF_MM) + 2 * PDF_MM;
    ensure(h);
    rect(x0, y, TW, h);
    cell(x0, y, 20 * PDF_MM, h, '안내사항', { head: true });
    var gl = wrap(guide, 7.3, TW - 20 * PDF_MM - 3.6 * PDF_MM);
    gl.forEach(function(s, i){ text(s, x0 + 20 * PDF_MM + 1.8 * PDF_MM, y + 2 * PDF_MM + i * 7.3 * 1.4, 7.3); });
    y += h + 3 * PDF_MM;
    };

    if (corp){
      /* 법인 양식 순서: 서명 → 동의 2건 → 안내사항. 개인정보 동의서·주민번호 고지·법정대리인 표는 법인 양식에 없다 */
      drawSign(); drawAgree(); drawGuide();
      footer();
      return doc.save();
    }
    /* 법인외 양식 순서: 동의 2건 → 서명 → 안내사항 → 개인정보 동의서 → 주민번호 고지 → (법정대리인) */
    drawAgree(); drawSign(); drawGuide();

    /* 개인정보 수집·이용 동의 — 화면 문구 그대로 */
    var cTitle = '【 개인정보 수집 및 이용 동의서 (개인 후원회원에 한함) 】';
    var cIntro = DONOR_CONSENT_INTRO.join('\n');
    var cBody = (d.consentLines || DONOR_CONSENT_LINES).join('\n');
    var cAsk = '■ 위와 같이 개인정보를 수집·이용하는 데 동의하십니까?      ' + box(d.privacy, '동의함') + '   ' + box(!d.privacy, '동의하지 않음');
    var cs = 7.3, innerW = TW - 3.6 * PDF_MM;
    var cl = [].concat([cTitle, ''], wrap(cIntro, cs, innerW), [''], wrap(cBody, cs, innerW), [''], [cAsk]);
    h = cl.length * cs * 1.42 + 4 * PDF_MM;
    ensure(h);
    rect(x0, y, TW, h);
    cl.forEach(function(s, i){
      var yy = y + 2 * PDF_MM + i * cs * 1.42;
      if (s === cTitle) textCenter(s, x0, TW, yy, 8.5, { bold: true });
      else if (s === cAsk) text(s, x0 + 1.8 * PDF_MM, yy, cs, { bold: true });
      else text(s, x0 + 1.8 * PDF_MM, yy, cs);
    });
    y += h;
    /* ★ 국외 이전 동의 블록 (2026-09-10) — 수집·이용 동의와 **따로** 찍는다.
         PDF 는 "무엇에 동의했나" 의 증빙이라, 별도 동의로 받은 것은 별도 칸으로 남아야 한다.
         문구는 화면과 같은 DONOR_TRANSFER_LINES 하나에서 온다(9/5 구조). */
    var tTitle = '【 개인정보 국외 이전 동의 】';
    var tBody = (d.transferLines || DONOR_TRANSFER_LINES).join('\n');
    var tAsk = '■ 개인정보의 국외 이전에 동의하십니까?      ' + box(d.privacyTransfer, '동의함') + '   ' + box(!d.privacyTransfer, '동의하지 않음');
    var tl = [].concat([tTitle, ''], wrap(tBody, cs, innerW), [''], [tAsk]);
    h = tl.length * cs * 1.42 + 4 * PDF_MM;
    ensure(h);
    rect(x0, y, TW, h);
    tl.forEach(function(s, i){
      var yy = y + 2 * PDF_MM + i * cs * 1.42;
      if (s === tTitle) textCenter(s, x0, TW, yy, 8.5, { bold: true });
      else if (s === tAsk) text(s, x0 + 1.8 * PDF_MM, yy, cs, { bold: true });
      else text(s, x0 + 1.8 * PDF_MM, yy, cs);
    });
    y += h;
    /* 주민번호 수집 고지 (양식 표 2) */
    var rn = DONOR_RRN_NOTICE_LINES.join('\n');
    h = needH(rn, 7.3, TW);
    ensure(h);
    cell(x0, y, TW, h, rn, { size: 7.3 });
    y += h + 3 * PDF_MM;

    /* 만 14세 미만 — 법정대리인 (해당할 때만) */
    if (d.under14){
      var g = d.guardian || {};
      var gw0 = TW - 60 * PDF_MM, gw1 = 24 * PDF_MM, gw2 = 36 * PDF_MM;
      var gh = 8 * PDF_MM;
      ensure(gh * 3);
      cell(x0, y, gw0, gh * 3, '< 정보주체가 만 14세 미만의 아동인 경우 >\n위와 같이 개인정보를 수집·이용 및 제공하는데 동의합니다.\n' +
           sd.y + '년 ' + sd.m + '월 ' + sd.d + '일    법정대리인 ' + (g.agreed ? '■ 동의함' : '□ 동의함'), { size: 7.8 });
      cell(x0 + gw0, y, gw1, gh, '성명', { head: true });
      cell(x0 + gw0 + gw1, y, gw2, gh, (g.name || '') + '   (서명 또는 인)', { size: 7.8 });
      cell(x0 + gw0, y + gh, gw1, gh, '휴대전화 번호', { head: true, size: 7.5 });
      cell(x0 + gw0 + gw1, y + gh, gw2, gh, g.phone || '');
      cell(x0 + gw0, y + gh * 2, gw1, gh, '아동과의 관계', { head: true, size: 7.5 });
      cell(x0 + gw0 + gw1, y + gh * 2, gw2, gh, g.relation || '');
      y += gh * 3;
    }

    footer();
    return doc.save();
  });
}
