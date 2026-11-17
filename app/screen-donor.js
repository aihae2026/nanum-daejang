/* ════════════════════════════════════════════════════════════
   screen-donor.js — 후원자 제출 폼 · 배분기관 제출 폼 · 서명 · 미리보기 (폰 화면)
   담당: 선미·연수 / PDF 생성·개인정보 분리는 이 파일이 시작점
   ════════════════════════════════════════════════════════════ */
var DEMO_FILE = {
  proof_buy:'매입세금계산서.pdf', cost_stmt:'원가명세서.xlsx', market_px:'시가확인_인터넷최저가.png',
  photo:'물품사진.jpg', bizreg:'사업자등록증.pdf',
  appl_g:'기부신청서_기관양식.pdf', value_g:'가액증빙.pdf',
  appl_corp_scan:'법인인감_직인날인.png',   /* 2026-09-04 신설 · 9/10 직인 이미지로 재정의 */
  _etc:'스캔본_일괄.pdf'
};
function slotFiles(key){ return DB.donorForm.files[key] || []; }
function addDemoFile(key){
  if (writeBlocked()) return;
  var f = DB.donorForm;
  if (!f.files[key]) f.files[key] = [];
  var base = DEMO_FILE[key] || '첨부파일.pdf';
  var n = f.files[key].length;
  var name = n ? base.replace(/(\.[^.]+)$/, '_' + (n + 1) + '$1') : base;
  var id = 'f' + (++FILE_SEQ);
  FILES[id] = {id:id, name:name, type:'', size:(180 + n * 47) * 1024, blob:null, demo:true};
  f.files[key].push(id);
  render();
}
/* 하위 호환 — 기존 호출부(prefillDonor 등)가 쓰는 이름 */
function addDonorFile(key){ addDemoFile(key); }
function rmDonorFile(key, i){
  if (writeBlocked()) return;
  var arr = DB.donorForm.files[key];
  if (!arr) return;
  arr.splice(i, 1);
  if (!arr.length) delete DB.donorForm.files[key];
  render();
}
/* 기본값 채우기용 데모 서명 — 서명란 캔버스와 같은 크기의 오프스크린 캔버스에 곡선을 그려
   PNG 데이터 URI로 만든다. 외부 이미지 파일을 참조하지 않으므로 외부 요청 0 원칙을 유지한다. */
function demoSignImage(){
  var cv = document.createElement('canvas');
  cv.width = 600; cv.height = 220;
  var ctx = cv.getContext ? cv.getContext('2d') : null;
  if (!ctx) return null;
  ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1c2b26';
  var stroke = function(pts){
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  };
  stroke([[150,150],[168,96],[186,150],[204,104],[222,148]]);
  stroke([[240,112],[268,112]]);
  stroke([[252,96],[252,156],[282,150],[306,116],[330,152]]);
  stroke([[348,104],[372,152],[396,102],[420,150]]);
  stroke([[132,168],[438,168]]);
  return cv.toDataURL();
}
function prefillDonor(){
  if (writeBlocked()) return;
  var f = DB.donorForm, c = linkCase(); if (!c) return;
  f.donorName = f.donorName || c.donor.replace('(제출 대기)','').trim() || '주식회사 온누리식품';
  f.donDate = TODAY; f.addr = '서울시 OO구 OO로 12 (데모)'; f.phone = '02-000-0000 (데모)';
  f.bizNo = (c.donorType === '법인') ? (f.bizNo || '220-81-45012') : '';
  f.rrn = (c.donorType === '법인') ? '' : '900101-1234567';   /* 가상 번호 — PDF 에만 찍힌다 */
  f.itemName = '즉석밥 3종 세트'; f.qty = '400';
  f.unitBook = '12500'; f.unitSale = '13500';
  f.giftVal = ''; f.saleVal = ''; f.note = '';   /* 빈 값 = 수량×단가 자동계산 */
  f.agreePurpose = true; f.agreeDouble = true; f.privacy = true;
  /* ★ 2026-09-10 에 필수 동의가 둘 늘었다 — 여기도 채우지 않으면 기본값을 채웠는데 제출이 막힌다.
       (개인은 국외 이전 동의, 법인은 서류 속 개인정보 확인) 서명과 같은 이유다. */
  f.privacyTransfer = true; f.corpAck = true;
  /* 서명도 함께 채운다 — 기본값을 채웠는데 서명만 비어 제출이 막히면 데모가 멈춘다 (기관 업무지침).
     ★ 법인은 전자서명을 쓰지 않는다(2026-09-10) — 직인 날인 이미지가 원본 증빙이라
       아래 addDemoFile(appl_corp_scan) 이 그 자리를 채운다. */
  if (c.donorType === '법인'){ f.signed = false; f.signImg = null; }
  else { f.signed = true; f.signImg = demoSignImage(); }
  f.files = {};
  donorSlots().forEach(function(it){
    addDemoFile(it.key);
    if (it.key === 'photo') addDemoFile(it.key);   /* 사진은 여러 장 */
  });
  render();
}

/* ══ 시연용 [채우기] — 발표자 전용 · 파일이 진짜로 올라간다 (2026-09-14 승희 · 선미 9/13 밤 결정) ══
   ★ 왜 prefillDonor 를 안 쓰나 — 둘이 다르다.
     ① prefillDonor 는 demoOnly() 안이라 실서비스(nanumdaejang.org)에 안 뜬다. 시연은 실서비스에서 한다.
     ② addDemoFile 이 만드는 파일은 blob:null 이라 uploadCaseFiles 가 건너뛴다 — 저장소에 아무것도 안 가고
        AI 가 볼 게 없었다(선미 실측 "파일을 붙인 것처럼 보였지만 검수가 안 됐다").
   그래서 assets/demo/ 의 **실제 서류**를 fetch 해 blob 으로 붙인다(prepublish.sh 는 assets/ 를 살린다 · 9/9 실측).
   ⚠️ fetch 는 비동기다 — 다 받기 전에 [제출] 을 누르면 또 빈 첨부다. DB.presenterFilling 으로 제출을 막고 화면에 말한다.
   값은 루브릭에서 이미 통과한 G15(13번 · 완전 정상)를 그대로 — 안 맞으면 시연에서 E1·E2 가 "확인 권장" 을 낸다.
   두 벌(선미 제안) — [정상 건] 은 영수증 숫자 그대로 → 이상 없음. [단가 불일치 건] 은 **같은 영수증에 단가만** 다르게 →
   E1 확인 권장 → 담당자가 원본 보고 사유 해소. 심사위원이 보고 싶은 건 "사람이 놓칠 걸 AI 가 걸었다" 는 장면이다.
   버튼은 값이 아니라 장면 이름으로 — 발표자가 안 헷갈린다. 게이트는 common.js presenterOnly()(admin 세션). */
var PRESENTER_ASSET = {
  appl_corp_scan:'assets/demo/A0_법인인감.png',                 /* AI 로 안 가는 칸 — 직인은 PDF (인) 자리에 찍힌다 */
  proof_buy:'assets/demo/G15_구매영수증.jpg',                    /* 루브릭 G15 · 위생용품 세트 250 × 8,400 = 2,100,000 · 2026-06-11 */
  photo:'assets/demo/A2_물품사진.jpg',                           /* E8 은 사진이면 통과 */
  cost_stmt:'assets/demo/B1_원가명세서.jpg',                     /* 법인 제조·유통 링크에서 눌렀을 때만 */
  market_px:'assets/demo/B2_시가확인증빙_자사몰캡처.png',
  dist_photo:'assets/demo/A4_배분물품사진.jpg'                   /* 배분처 폼 */
};
var PRESENTER_CASE = {
  ok:       {itemName:'위생용품 세트', qty:'250', unit:'8400', donDate:'2026-06-15'},
  mismatch: {itemName:'위생용품 세트', qty:'250', unit:'8900', donDate:'2026-06-15'}   /* 영수증 8,400 · 차이 500원 × 250 = 125,000 */
};
function presenterFetchFile(url){
  return fetch(url).then(function(r){
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.blob();
  }).then(function(b){
    var name = url.split('/').pop();
    var id = 'f' + (++FILE_SEQ);
    FILES[id] = {id:id, name:name, type:b.type || (/\.png$/i.test(name) ? 'image/png' : 'image/jpeg'),
                 size:b.size, blob:b, demo:false};
    return id;
  });
}
/* 칸마다 파일을 받아 붙인다. 못 받은 칸은 **비워 두고 말한다** — blob 없는 파일을 남기면 제출은 되는데 저장소엔 없다. */
function presenterFillFiles(form, slots){
  DB.presenterFilling = true;
  render();
  var bad = [];
  return Promise.all(slots.map(function(s){
    return presenterFetchFile(s.url).then(function(id){
      if (!form.files[s.key]) form.files[s.key] = [];
      form.files[s.key].push(id);
    }).catch(function(err){
      bad.push(s.url.split('/').pop() + ' — ' + ((err && err.message) || err));
    });
  })).then(function(){
    DB.presenterFilling = false;
    if (bad.length){
      console.error('[시연] 시연 파일을 못 가져왔습니다:', bad.join(' / '));
      DB.toast = {msg:'시연 파일 ' + bad.length + '건을 못 가져왔습니다 — 그 칸은 손으로 올려 주세요', cap:bad.join(' / ')};
    }
    render();
  });
}
function presenterFillDonor(variant){
  if (writeBlocked()) return Promise.resolve();
  var f = DB.donorForm, c = linkCase(); if (!c) return Promise.resolve();
  var v = PRESENTER_CASE[variant] || PRESENTER_CASE.ok;
  var corp = (c.donorType === '법인');
  /* 후원자명은 담당자가 링크 발급 때 적은 것을 쓰되 앞에 [검사용] — 심사 뒤 정리 SQL 이 지우는 표식(9/3 규칙) */
  var nm = (f.donorName || (c.donor || '').replace('(제출 대기)', '').trim() || (corp ? '주식회사 온누리식품' : '김나눔')).trim();
  f.donorName = /^\[검사용\]/.test(nm) ? nm : '[검사용] ' + nm;
  f.donDate = v.donDate; f.addr = '서울시 OO구 OO로 12 (시연)'; f.phone = '02-000-0000';
  f.bizNo = corp ? (f.bizNo || '220-81-45012') : '';
  f.rrn = corp ? '' : '900101-1234567';                    /* 가상 번호 — PDF 에만 찍힌다 */
  f.vatDeduction = corp ? false : null;                    /* 법인 · 공제 안 받음 → E1 은 합계와 대조(모름이면 늘 확인 권장) */
  f.itemName = v.itemName; f.qty = v.qty;
  f.unitBook = v.unit; f.unitSale = v.unit;                /* 법인은 장부가액, 법인외는 판매가액을 본다 — 둘 다 같은 값 */
  f.giftVal = ''; f.saleVal = ''; f.note = '';             /* 빈 값 = 수량×단가 자동계산 */
  f.agreePurpose = true; f.agreeDouble = true; f.privacy = true; f.privacyTransfer = true; f.corpAck = true;
  if (corp){ f.signed = false; f.signImg = null; }          /* 법인은 직인 이미지가 원본 */
  else { f.signed = true; f.signImg = demoSignImage(); }
  f.files = {};
  var slots = [];
  donorSlots().forEach(function(it){
    if (PRESENTER_ASSET[it.key]) slots.push({key:it.key, url:PRESENTER_ASSET[it.key]});
  });
  return presenterFillFiles(f, slots);
}
function presenterFillOrg(){
  if (writeBlocked()) return Promise.resolve();
  var f = DB.orgForm, c = orgLinkCase(); if (!c) return Promise.resolve();
  var eq = orgExpectedQty(c);
  f.recvQty = String((eq && eq.qty) || (c.donation && c.donation.qty) || '');
  f.recvPkg = f.recvPkg || ((c.donation && c.donation.pkg) || '');
  f.recvDate = TODAY;
  f.receiverName = f.receiverName || '김나눔';
  f.signed = true; f.signImg = demoSignImage(); f.confirm = true;
  var slots = [];
  orgSlots(c).forEach(function(it){
    if (it.key === 'inss') return;
    var live = getItem(c.id, it.uid || it.key);
    if (live && itemStatus(live).code === 'done') return;
    if (orgSlotFiles(it.key).length) return;
    if (PRESENTER_ASSET[it.key]) slots.push({key:it.key, url:PRESENTER_ASSET[it.key]});
  });
  return presenterFillFiles(f, slots);
}
var PRESENTER_WAIT = '<div class="banner warn mb12"><span class="bi">⏳</span><div><b>시연 파일 준비 중…</b> 다 받으면 제출할 수 있습니다</div></div>';
function emptyDonor(){
  if (writeBlocked()) return;
  var f = DB.donorForm;
  f.donorName = ''; f.addr = ''; f.phone = ''; f.bizNo = ''; f.rrn = ''; f.vatDeduction = null;
  f.guardianName = ''; f.guardianPhone = ''; f.guardianRelation = '';
  f.itemName = ''; f.qty = ''; f.unitBook = ''; f.unitSale = ''; f.giftVal = ''; f.saleVal = ''; f.note = '';
  f.agreePurpose = false; f.agreeDouble = false; f.privacy = false;
  f.files = {}; f.signed = false; f.signImg = null;
  render();
}
/* ★ render 가 아니라 renderAfterInput (2026-09-10 승희) — Tab 으로 다음 칸에 갈 때 change 가 초점 이동보다
     먼저 와서, 바로 그리면 다음 칸이 지워지고 초점이 맨 위로 떨어졌다. common.js 초점 보존 주석 참조. */
function setDonor(k, v){ if (writeBlocked()) return; DB.donorForm[k] = v; renderAfterInput(); }
/* 주민등록번호 ↔ 사업자등록번호 — 바꾸면 적던 번호는 비운다(형식이 다르다).
   주민등록번호로 되돌리면 매입세액공제 답도 비운다 — 일반 개인은 대상이 아니라 칸 자체가 사라진다 */
function setIdKind(kind){
  if (writeBlocked()) return;
  DB.donorForm.idKind = kind; DB.donorForm.rrn = '';
  if (kind !== 'biz' && DB.donorForm.donorType !== '법인') DB.donorForm.vatDeduction = null;
  render();
}
function setVat(v){ if (writeBlocked()) return; DB.donorForm.vatDeduction = v; render(); }
/* 매입세액공제를 **묻는 건인가** — 화면(칸을 띄울지)과 제출(무엇으로 저장할지)이 같은 답을 써야 한다.
   ★ 조건을 두 곳에 베껴 두면 한쪽만 고쳐져 갈라진다 — 그래서 한 함수로 둔다 (2026-09-16 선미).
   부가가치세 매입세액공제는 **과세사업자만** 받는다. 그래서 법인이거나,
   기부금영수증을 사업자등록번호로 받는 경우에만 묻는다. */
function vatAsked(f, corp){ return !!(corp || (f.wantsReceipt && f.idKind === 'biz')); }
/* ── 전자서명 패드 — 마우스·터치로 사인을 직접 그린다 (후원자 신청서 · 기관 인수증 공용) ── */
var signPad = {drawing:false, last:null};
function bindSignPad(cvId, form){
  var cv = el(cvId); if (!cv) return;
  var ctx = cv.getContext('2d');
  ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1c2b26';
  if (form.signImg){
    var img = new Image();
    img.onload = function(){ ctx.drawImage(img, 0, 0); };
    img.src = form.signImg;
  }
  var pos = function(e){
    var r = cv.getBoundingClientRect();
    var t = e.touches ? e.touches[0] : e;
    return {x:(t.clientX - r.left) * (cv.width / r.width), y:(t.clientY - r.top) * (cv.height / r.height)};
  };
  var down = function(e){ signPad.drawing = true; signPad.last = pos(e); e.preventDefault(); };
  var move = function(e){
    if (!signPad.drawing) return;
    var p = pos(e);
    ctx.beginPath(); ctx.moveTo(signPad.last.x, signPad.last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    signPad.last = p; e.preventDefault();
  };
  var up = function(){
    if (!signPad.drawing) return;
    signPad.drawing = false;
    form.signImg = cv.toDataURL();
    if (!form.signed){ form.signed = true; render(); }
  };
  cv.onmousedown = down; cv.onmousemove = move; cv.onmouseup = up; cv.onmouseleave = up;
  cv.ontouchstart = down; cv.ontouchmove = move; cv.ontouchend = up;
}
function initSignPad(){
  bindSignPad('signCanvas', DB.donorForm);      /* 후원자 신청서 서명 */
  bindSignPad('orgSignCanvas', DB.orgForm);     /* 기관 인수증 수령자 서명 — 화면상 동시에 존재하지 않는다 */
}
function clearSign(){ if (writeBlocked()) return; DB.donorForm.signImg = null; DB.donorForm.signed = false; render(); }
function clearOrgSign(){ if (writeBlocked()) return; DB.orgForm.signImg = null; DB.orgForm.signed = false; render(); }
/* 주민등록번호(6-7자리) 또는 사업자번호(3-2-5자리) — 하이픈은 있어도 없어도 된다.
   ⚠️ 검증 결과 외에는 이 값을 어디에도 남기지 않는다(로그 포함). */
function idNoOk(s){ s = String(s || '').trim(); return /^\d{6}-?\d{7}$/.test(s) || /^\d{3}-?\d{2}-?\d{5}$/.test(s); }
function str(s){ return String(s || '').trim(); }
function donorErrors(f){
  var e = [];
  var corp = (f.donorType === '법인');
  /* ★ 대리 작성(직접 등록) 경로는 없앴다 (2026-09-04) — 접수는 무조건 링크로 받는다.
       그래서 이 폼은 **항상 후원자 본인이 쓰는 화면**이고, 예외 분기가 없다. */
  if (!f.donorName) e.push(corp ? '기부법인명을 입력해 주세요' : '기부자명을 입력해 주세요');
  /* ★ 후원일자 (2026-09-06 M-2) — 기부일은 루브릭 E2(기부일 ≤ 배분일)의 기준값이다.
       전에는 폼 기본값이 오늘이라 늘 차 있었고, 그래서 검사가 없어도 드러나지 않았다.
       기본값을 비운 지금(M-1) 막지 않으면 **빈 채로 조용히 나간다.**
     ⚠️ 형식도 여기서 본다 — '2026년 9월 5일' 처럼 toDate() 가 못 알아보는 값은
       DB 에 원문으로 들어가 판정이 조용히 '판단 보류' 가 된다. 그건 후원자도 담당자도 모른다. */
  if (!str(f.donDate)) e.push('후원일자를 적어 주세요 — 물품을 기부하신 날짜입니다');
  else if (!toDate(f.donDate)) e.push('후원일자를 알아볼 수 없습니다 — 2026-09-05 처럼 적어 주세요');
  if (!f.itemName) e.push('품목을 입력해 주세요');
  if (!f.qty) e.push('수량을 입력해 주세요');
  /* ★ 숫자가 아닌 값은 여기서 막는다 (2026-09-11 선미 · 발견 3 · #270 실측)
       전에는 빈 값만 막아서 '450 (200+150+100)' 이 통과한 뒤 Number() 에서 NaN → 수량 0 으로 조용히 앉았다.
       후원자도 담당자도 경고를 못 받는 조용한 실패였다. 단가·직접 입력한 가액도 같은 구멍이다. */
  var numBad = function(v){ v = String(v == null ? '' : v).trim(); return v !== '' && !/^\d+$/.test(v); };
  if (numBad(f.qty))      e.push('수량은 숫자만 적어 주세요 — 예: 450');
  if (numBad(f.unitBook)) e.push('단가(장부가액)는 숫자만 적어 주세요 — 예: 2500');
  if (numBad(f.unitSale)) e.push('단가(판매가액)는 숫자만 적어 주세요 — 예: 6500');
  if (numBad(f.giftVal))  e.push('기부가액은 숫자만 적어 주세요 — 예: 2900000');
  if (numBad(f.saleVal))  e.push('판매가액은 숫자만 적어 주세요');
  if (corp && !f.unitBook) e.push('단가(장부가액)를 입력해 주세요');
  if (!corp && !f.unitSale) e.push('단가(판매가액)를 입력해 주세요');
  if (corp && f.path === '제조·유통' && !f.unitSale) e.push('제조·유통 물품은 단가(판매가액)도 작성이 필요합니다');
  if (valueDiffers(f, corp) && !String(f.note || '').trim())
    e.push('신고 가액이 수량×단가와 다릅니다 — ※비고란에 사유를 적어 주세요 (양식: 특이사항 작성)');
  if (!f.agreePurpose) e.push('재단 목적사업 사용에 동의해야 기부할 수 있습니다 (미동의 시 기부 불가 — 양식 필수 동의)');
  if (!f.agreeDouble) e.push('부대비용 이중 공제 미수령 확인에 체크해 주세요 (양식 필수 동의)');
  if (!corp && !f.privacy) e.push('개인정보 수집·이용에 동의해야 제출할 수 있습니다 (거부 시 기부 신청 제한 — 양식 고지)');
  /* ★ 국외 이전은 수집·이용과 별개로 막는다 (2026-09-10 · 법 제28조의8 ① 1호)
       ⚠️ 문구가 "거부하면 서면 신청서로 접수할 수 있다" 이므로, 이 자리는 기부를 막는 것이 아니라
         온라인 접수만 막는 것이다 — 안내 문구도 그렇게 적는다(대체 경로가 없으면 강제 동의가 된다). */
  if (!corp && !f.privacyTransfer)
    e.push('개인정보 국외 이전에 동의해야 온라인으로 제출할 수 있습니다 — 동의를 원하지 않으시면 서면 신청서로 접수하실 수 있습니다 (문의: 재단 담당자)');
  /* ★ 법인은 정보주체가 아니라 '동의' 가 아니라 '확인' 을 받는다 (2026-09-10 · 대응안 §1-4) */
  if (corp && !f.corpAck)
    e.push('제출 서류에 포함된 개인정보에 대한 확인에 체크해 주세요 (법인 필수 확인)');
  if (!corp && f.under14 && !f.guardian) e.push('만 14세 미만 기부자는 법정대리인 동의가 필요합니다 (부록 A · 법정대리인 동의)');
  /* ★ 아래 둘은 신청서 PDF 에만 찍히는 값이다(DB 에 없다) — 양식이 요구하는 칸이라 여기서 받는다 (2026-09-04) */
  if (!corp && f.wantsReceipt && !idNoOk(f.rrn))
    e.push('기부금영수증 발급을 원하시면 주민등록번호(개인사업자는 사업자번호)를 적어 주세요 — 양식: 미발급 시 작성 불필요');
  if (!corp && f.under14 && f.guardian && !(str(f.guardianName) && str(f.guardianPhone) && str(f.guardianRelation)))
    e.push('법정대리인의 성명·휴대전화·아동과의 관계를 적어 주세요 (양식 하단 표)');
  /* ★ 슬롯이 0이면 '첨부가 필요 없는 건' 이 아니라 **목록을 못 불러온 것**이다.
       빈 배열은 filter 를 그냥 통과해 첨부 0건으로 제출된다 —
       후원자는 냈다고 믿고 담당자는 안 왔다고 본다(인수인계 §2① 의 제일 나쁜 모양).
       실제로 그 경로를 밟았다: 링크를 나중에 다른 기기에서 열면 c.checklist 가 비어 있다
       (sendLink 가 만든 목록이 메모리에만 있었다 · 2026-09-02 실주행).
       ★ 조합 16가지를 전수로 세어 최소 2개다 — 0 은 정상 상태가 아니다.
         그래서 여기서 막아도 정상 제출을 막지 않는다.
       ※ 원인(sendLink 시점 저장)은 db.js 에서 따로 고친다. 이 방어는 그것과 별개다 —
         다른 이유로 목록이 비어도 조용히 통과하지 않게 한다 (2026-09-02 선미 요청). */
  var slots = donorSlots();
  if (!slots.length){
    e.push('받아야 할 서류 목록을 불러오지 못했습니다 — 이대로는 제출할 수 없습니다. ' +
           '접수 링크를 다시 받아야 할 수 있으니 담당자에게 알려 주세요');
  } else {
    /* ★ 2026-09-10 — 인감 예외를 없앴다. 직인 날인은 법인의 **평범한 필수 슬롯**이 되어
         다른 서류와 같은 줄에서 검사된다. (전에는 조건부라 여기서 빼고 corpApplRoute 가 따로 봤다) */
    var empty = slots.filter(function(it){
      return !(f.files[it.key] || []).length;
    });
    if (empty.length) e.push('첨부가 필요한 서류 ' + empty.length + '건이 비어 있습니다 — ' +
      empty.map(function(it){ return it.n; }).join(' · '));
  }
  /* ★ 신청서의 원본 증빙 — 유형별로 요구가 다르다 (2026-09-04 · 저녁에 법인 규칙 보완)

       법인   : 법인인감(직인) 날인 이미지 필수. 전자서명 경로는 없앴다(2026-09-10) —
                법인 명의 서류의 효력은 직인에서 나오기 때문이다.
       법인 외 : 전자서명 필수 (예외 없음 — 대리 작성 경로를 없앴다)

       ⚠️ 어느 쪽이든 **둘 다 없는 상태는 통과시키지 않는다** —
          기관 업무지침의 '서명·날인 없는 신청서는 접수 불가' 규정이 근거다. */
  if (corp){
    if (!corpApplRoute(f))
      e.push('법인인감(직인)이 날인된 이미지를 첨부해 주세요 — ' +
             '법인 신청서는 직인 날인이 원본 증빙입니다 (기관 업무지침)');
  } else if (!f.signed){
    e.push('서명 또는 날인이 없는 물품기부신청서는 접수할 수 없습니다 (기관 업무지침)');
  }
  return e;
}
/* 제출된 첨부를 파일 저장소로 올린다 (db.js 의 saveAttachment 를 항목마다 부른다).
   ⚠️ 실패를 조용히 넘기지 않는다 — 판정 저장과 다르다.
     판정은 실패해도 담당자가 화면의 판정을 그대로 쓸 수 있지만,
     업로드가 실패하면 후원자의 서류가 아예 없는 것이다.
     후원자는 냈다고 믿고 담당자는 안 왔다고 보는 상태가 제일 나쁘다. */
function uploadDonorFiles(c){ return uploadCaseFiles(c, 'donor'); }

/* 배분처 제출분(인수증 사진·결과보고서)도 같은 코드를 쓴다.
   ★ 다른 점은 role 뿐이다 — 누가 올렸는지가 attachment.uploaded_by_role 로 남는다.
     '늘봄 인수증'과 '복지관 인수증'을 가르는 건 항목의 distId 가 한다(db.js 참조). */
function uploadOrgFiles(c){ return uploadCaseFiles(c, 'org'); }

/* ★ 결과를 돌려준다 (2026-09-03) — 부르는 쪽이 '첨부가 남았다' 를 알아야
     담당자에게 세울 수 있다. 토스트는 화면을 다시 열면 사라진다. */
function uploadCaseFiles(c, role){
  if (typeof saveAttachment !== 'function')             /* db.js 미로드 환경 방어 */
    return Promise.resolve({ok:true, uploaded:0, bad:[], demo:true});
  var jobs = [];
  (c.checklist || []).forEach(function(it){
    (it.r.fileIds || []).forEach(function(fid){
      var m = FILES[fid];
      if (!m || !m.blob || m.storageKey) return;         /* 데모 파일·이미 올린 것은 건너뛴다 */
      jobs.push(saveAttachment(c, it, m, role).then(function(r){
        return {name:m.name, ok:r.ok, reason:r.reason};
      }));
    });
  });
  if (!jobs.length) return Promise.resolve({ok:true, uploaded:0, bad:[]});

  return Promise.all(jobs).then(function(results){
    var bad = results.filter(function(r){ return !r.ok; });
    if (!bad.length){
      console.info('[저장소] 첨부 ' + results.length + '건을 올렸습니다.');
      return {ok:true, uploaded:results.length, bad:[]};
    }
    /* 데모(DB 미연결)에서는 조용히 둔다 — 시연 때마다 실패 알림이 뜨면 방해만 된다.
       ★ 다만 콘솔에는 반드시 남긴다. '안 올라갔다'가 흔적 없이 사라지면 안 된다. */
    console.error('[저장소] 올리지 못한 첨부 ' + bad.length + '건:',
                  bad.map(function(b){ return b.name + ' — ' + b.reason; }).join(' / '));
    var demo = bad.every(function(b){ return /데모|미연결/.test(b.reason || ''); });
    if (demo) return {ok:true, uploaded:0, bad:bad, demo:true};
    DB.toast = {msg:'서류 ' + bad.length + '건이 저장되지 않았습니다 — 담당자에게 알려 주세요'};
    renderToast();
    return {ok:false, uploaded:results.length - bad.length, bad:bad};
  });
}

function submitDonor(){
  if (writeBlocked()) return;
  /* 시연 파일을 받는 중이면 막는다 — 지금 내면 빈 첨부로 나간다 (2026-09-14) */
  if (DB.presenterFilling){ DB.toast = {msg:'시연 파일을 준비하는 중입니다 — 잠시 뒤 다시 눌러 주세요'}; renderToast(); return; }
  var f = DB.donorForm;
  var c = linkCase();
  if (!c){ DB.toast = {msg:'담당자가 발송한 접수 링크가 없습니다 — 담당자 화면에서 링크를 먼저 발송해 주세요'}; renderToast(); return; }
  if (c.state === '취소'){ DB.toast = {msg:'취소된 접수입니다 — 이 링크로는 제출할 수 없습니다'}; renderToast(); return; }
  /* 중복 제출 차단 — 뒤로가기로 폼에 돌아와도 같은 링크로는 다시 제출되지 않는다 */
  if (f.submittedId){
    DB.toast = {msg:'이미 제출된 신청서입니다 — 접수번호 #' + f.submittedId + ' · 중복 제출은 되지 않습니다'};
    renderToast(); return;
  }
  if (DB.donorSubmitting) return;      /* 저장 중 재진입 차단 (2026-09-06) */
  if (donorErrors(f).length) return;
  /* ★ 표기를 하나로 맞춘 뒤에 쓴다 (2026-09-06 M-2) — 여기를 지나면 원장·제출본·신청서 PDF 가
       모두 f.donDate 를 본다. 셋이 서로 다른 표기를 보지 않게 **한 자리에서** 정규화한다.
       donorErrors 가 이미 못 알아보는 값을 막았으므로 여기서 null 이 나올 수 없다 — 그래도 원문을 남긴다. */
  f.donDate = toDate(f.donDate) || f.donDate;
  /* ⭐담당자가 지정한 유형·경로 + 관리자 프로필([A])로 체크리스트 재전개 (영수증 발급 여부만 후원자 선택 반영) */
  var prevChecklist = c.checklist || [];   /* 링크 발급 때 DB 에 남긴 목록 — dbId 가 여기 있다 */
  c.checklist = autoChecklist(c.donorType, c.acqPath, f.wantsReceipt, DB.promptProfile);
  /* ★ 재전개는 목록을 통째로 새로 만든다 — dbId 를 물려주지 않으면 같은 서류가 DB 에 두 줄이 된다.
       빠진 항목은 included=false 로 내린다(RLS 에 delete 정책이 없어 지울 수 없다). 2026-09-03 유진 */
  adoptChecklistIds(c, prevChecklist);
  /* ★ 법인의 직인 날인은 **언제나 필수**다 (2026-09-10 재설계)
       전에는 전자서명으로 낸 법인의 이 항목을 included=false 로 내렸다. 이제 전자서명 경로가
       없으므로 내릴 일도 없다 — 늘 켜 두고, 담당자 화면에 원본 증빙이라고 적는다. */
  if (c.donorType === '법인'){
    c.checklist.forEach(function(it){
      if (it.key !== CORP_SCAN_KEY) return;
      it.included = true;
      it.note = '법인인감(직인) 날인 이미지 — 법인 신청서의 원본 증빙입니다 (신청서 PDF 하단에 날인으로 들어갑니다)';
    });
  }
  /* 양식 산식: 법인 기부가액 = 수량×단가(장부가액) · 판매가액 = 수량×단가(판매가액)
               법인외 기부가액 = 수량×단가(판매가액) */
  var qty = Number(f.qty) || 0;
  var corp = (c.donorType === '법인');
  var book = giftValOf(f, corp);                        /* 기부가액(법인=장부가액) — 후원자 신고값 */
  var fair = (Number(f.unitSale) || isOverridden(f.saleVal)) ? saleValOf(f) : book;   /* 판매가액(공정가액) */
  /* ★ 화면에도 가린 이름을 세운다 (선미 2026-09-06) — 제출 직후와 새로고침 뒤가
       달라 보이면 담당자가 "아까는 나왔는데" 로 헷갈린다. 실명은 신청서 PDF 로 연다.
     ⚠️ 이름이 아예 없는 옛 건은 '(신청서에서 확인)' 으로 뜬다 — '(미입력)' 이 아니다. */
  c.donor = (c.donorType === '법인') ? f.donorName : maskName(f.donorName);
  c.item = f.itemName + ' ' + (f.qty || 0) + '개';
  c.inDate = TODAY; c.state = '검수 대기'; c.awaitingSubmit = false; c.isNew = true;
  c.submittedVia = '접수 링크 제출(온라인 신청서)';
  /* ⭐업로드가 체크리스트 항목에 1:1로 붙는다 — AI가 "이 칸에 올라온 파일이 그 서류가 맞는가"를 판정할 수 있는 이유 */
  var flat = [];
  c.checklist.forEach(function(it){
    /* [S] 신청서는 이 폼 자체가 원본이다 — 폼 입력값 + 전자서명으로 충족되며 파일을 따로 받지 않는다.
       필수항목·서명 유무는 donorErrors()가 코드로 검증했으므로 여기서 수취완료로 확정한다. */
    if (it.kind === 'S' && it.included){
      /* ★ signed 를 사실대로 적는다 (2026-09-04 저녁) — 전에는 true 로 박혀 있었다.
           법인이 인감 서면으로 낸 건도 '전자서명 있음' 으로 기록돼, 담당자 화면이
           있지도 않은 서명을 확인하라고 말하고 있었다. */
      it.r.formSubmit = {status:'submitted', date:TODAY, signed: !!f.signed};
      /* ★ 수취완료로 확정한다 (선미 결정 2026-09-06) — 상태를 여기서 세워야 DB(status 칸)에도
           '수취완료' 로 들어간다. itemStatus 만 고치면 화면에서만 완료로 보이고
           새로고침하면 DB 값('미수취')이 이겨서 되돌아간다. */
      it.r.st = 'done'; it.r.date = TODAY; it.r.by = '폼 제출(필수항목·서명 코드 검증)';
      it.r.memo = f.signed
        ? '접수 링크 폼으로 작성 · 간이 전자서명(내부 관리·감사 추적용)'
        : (c.donorType === '법인'
            ? '접수 링크 폼으로 작성 · 법인은 전자서명을 쓰지 않습니다 — 직인 날인 이미지가 원본 증빙입니다'
            : '접수 링크 폼으로 작성 · 전자서명 없음');
      return;
    }
    /* [F] 폼 입력값이 곧 증거인 항목 — 코드가 규칙으로 판정한다(AI 아님).
       동의 체크·번호 형식처럼 사람이 다시 볼 것이 없는 항목은 여기서 확정된다. */
    if (it.kind === 'F' && it.included){
      var fc = formCheck(it.key, f, c.donorType);
      if (!fc) return;
      if (fc.code === 'done'){
        it.r.st = 'done'; it.r.date = TODAY; it.r.by = '코드 검증(규칙 기반)'; it.r.memo = fc.reason;
      } else {
        it.r.st = 'unc'; it.r.date = TODAY; it.r.memo = fc.reason;
      }
      return;
    }
    var ids = f.files[it.key] || [];
    if (!ids.length) return;
    var labels = ids.map(fileName);
    it.r.fileIds = ids.slice();
    it.r.donorUpload = {status:'uploaded', date:TODAY, fileName:labels.join(' · ')};
    it.r.file = labels.join(' · ');
    flat = flat.concat(labels);
  });
  /* ★ 파일 저장소로 올린다 (2026-09-01 유진 · 선미 승인).
     지금까지 업로드한 원본은 FILES(브라우저 메모리)에만 있었다 — 새로고침하면 사라지고
     다른 사람 화면에서는 아예 안 보였다. 여기서 Storage 로 올리고 attachment 행을 남긴다.

     ★ 고르는 시점이 아니라 '제출 시점'에 올린다 —
       고르고 나서 지우는 경우가 있어서, 고를 때 올리면 주인 없는 파일이 남는다.
     ★ 화면을 붙잡지 않는다. 업로드가 끝나기 전에도 제출은 완료로 넘어간다 —
       실패는 아래에서 화면에 띄운다(조용히 넘어가지 않는다).

     ★ 부르는 자리는 여기가 아니라 saveChecklist 뒤다 (2026-09-03 · 실주행에서 드러남).
       첨부는 checklist_item 에 붙는다 — 항목이 DB 에 저장돼 dbId 를 받기 전에 올리면
       resolveChecklistItemId 가 항목을 못 찾아 업로드를 거부한다
       ('주인 없는 파일을 남기지 않는다' 는 db.js 의 방어가 맞게 동작한 것이다).
       여기서 부르면 그 방어에 늘 걸려 **첨부가 한 건도 안 올라간다** —
       화면은 제출 완료로 넘어가고 후원자는 냈다고 믿는다. */

  var etcIds = f.files._etc || [];
  var etc = etcIds.map(fileName);
  c.donorFiles = flat.concat(etc); c.donorEtcFiles = etc; c.donorEtcIds = etcIds; c.donorNote = f.note;
  c.under14 = !!f.under14; c.guardianConsent = !!(f.under14 && f.guardian);   /* 법정대리인 동의 — 담당자 검수 참고 (팀3) */
  c.donation = {itemName:f.itemName, qty:qty, pkg:f.pkg || '', unitPrice:Number(f.unitBook) || Number(f.unitSale) || 0,
    book:book, fair:fair, arriveDate:f.donDate,
    valueEdited:valueDiffers(f, corp), autoBook:autoGift(f, corp)};
  /* ★ 후원자가 적어 넣은 값을 DB 에 남긴다 (2026-09-02 유진)
       전에는 여기서 정한 물품·수량·금액·일자가 전부 브라우저 메모리에만 있었다.
       담당자가 새로고침하면 "제출은 됐는데 내용이 비어 있는" 건이 된다.

     ⚠️ 개인정보는 넣지 않는다 — 이름·주민번호·연락처·주소·서명은
       신청서 PDF 안에만 둔다(privacy-design §2). 여기 넣는 것은 **대조에 쓰는 값**뿐이다.
       법인 상호는 예외로 남긴다 — 기부금영수증 발급 대상이라 원장에 있어야 한다.

     ⚠️ 화면을 붙잡지 않는다. 후원자는 이미 제출을 마쳤다 —
       저장 실패로 제출을 되돌리면 후원자는 "냈는데 안 냈다" 는 상태가 된다.
       그래서 담당자 쪽(검수 화면)에 실패를 세운다. */
  var submitFields = {
    state: c.state, inDate: c.inDate, itemName: f.itemName,
    /* ★ pack_size 는 **1단위당 낱개 수**다 (patch-20260828-unit.sql · '낱개면 1').
         전에는 여기에 '포장 단위' 칸(f.pkg)을 넣었다 — 그 칸은 라벨이 "포장 단위 (선택) · 참고용",
         예시가 "5박스" 인 **자유 텍스트**다. 그래서
           "5박스" → Number() 가 NaN → null → 우연히 통과
           "5"     → pack_size=5 → 100 = 100 × 5 이 거짓 → **HTTP 400 / 23514**
                     (donation_qty_matches_received 위반 · 2026-09-06 선미 실주행에서 #214·#215 가 이렇게 깨졌다)
         이 폼은 **낱개 수량 하나만** 받는다. 서류에 적힌 수량이 곧 낱개 수이므로 pack_size 는 1이다.
       ⚠️ 포장 단위 글자는 버리지 않는다 — 제출본 payload 의 '단위' 로 그대로 남는다(db.js submissionPayload).
         담당자가 "5박스로 실물이 오겠구나" 를 신청서 원문에서 볼 수 있다. */
    qty: qty, qtyAsReceived: Number(f.qty) || null, packSize: (Number(f.qty) ? 1 : null),
    unitPrice: Number(f.unitBook) || Number(f.unitSale) || null,
    bookValue: book, fairValue: fair, arriveDate: f.donDate || null,
    donationDate: f.donDate || null,
    /* 법인 외는 가린 이름 — 실명은 신청서 PDF 안에만 (db.js createDonation 의 같은 자리 주석 참조) */
    donorName: (c.donorType === '법인') ? (f.donorName || null) : (maskName(f.donorName) || null),
    donorBizNo: (c.donorType === '법인') ? (f.bizNo || null) : null,
    wantsReceipt: !!f.wantsReceipt, submittedVia: c.submittedVia,
    /* 매입세액공제 — 법인·개인사업자만 묻는다(vatAsked).
       ★ 안 물어본 건(일반 개인)은 '모름'이 아니라 **'아니오'** 다 (2026-09-16 선미).
         매입세액공제는 과세사업자만 받으므로 일반 개인은 애초에 대상이 아니다 —
         즉 E1 은 합계와 대조하는 것이 맞다. 전에는 안 물어본 것도 null(모름)로 저장했는데,
         모름은 자동 통과가 없는 값이라(judge.js) **서류가 완벽한 개인 건도 늘 '확인 권장'** 이 떴다
         (9/16 심사위원 계정 정상 건 자동채우기에서 드러났다).
       ★ 물어본 건에서 후원자가 [모름]을 고른 것은 그대로 null — 그 경우의 동작은 바뀌지 않는다. */
    vatDeduction: !vatAsked(f, corp) ? false
      : (f.vatDeduction === true || f.vatDeduction === false) ? f.vatDeduction : null
  };
  /* ★ 셋을 각자 돌린다 (2026-09-03 · 유진 제안 §5① 에 동의).
       전에는 한 줄 `.then()` 사슬이라 앞이 던지면 뒤가 아예 실행되지 않았다 —
       `#903` 에서 `saveDonationFields` 의 400 하나가 체크리스트·제출본·첨부를 통째로 데려갔다.
       그날 `form_submission` 은 통틀어 0건이었고, 체크리스트는 배분결정이
       `saveChecklist` 를 다시 부른 덕에 **우연히** 저장됐다.
     ★ 다만 '체크리스트 → 첨부' 는 진짜 순서 의존이라 그 둘만 묶는다 —
       새 항목은 저장돼 dbId 를 받은 뒤라야 첨부가 자기 자리를 찾는다.
     ⚠️ 화면은 붙잡지 않는다. 후원자는 이미 제출을 마쳤다. 실패는 담당자 쪽에 세운다. */
  var pending = {fields:false, checklist:false, form:false, files:false, pdf:false};   /* ★ true = 아직 안 들어갔다(다시 보내야 할 것) — retrySaveCase 가 읽는다 */
  var why = [];
  function failPart(key, label){
    return function(err){
      pending[key] = true;
      why.push(label + ' — ' + ((err && err.message) || String(err)));
      console.error('[DB] ' + label + ' 저장 실패:', err);
    };
  }

  var jobFields = saveDonationFields(c, submitFields).catch(failPart('fields', '제출 내용'));

  /* ★ 이미 DB 에 있는 항목은 saveChecklist 가 건너뛴다(새 항목만 넣는다) —
       그래서 **제출 과정에서 확정된 상태가 안 남는다.** 여기서 따로 반영한다.
     ★ 왜 필요한가 (2026-09-03 · #906 실주행) — 전에는 목록이 제출 시점에
       통째로 insert 돼서, 위 244행이 세운 코드 검증 결과(F 항목 '수취완료')가
       insert 값에 딸려 우연히 저장됐다. 링크 발급 때 목록을 먼저 남기게 되면서
       (유진 A안) 그 줄은 이미 '미수취' 로 들어가 있고 insert 가 다시 일어나지 않는다.
       결과 — 화면은 완결인데 새로고침하면 bizno_fmt 가 미수취로 돌아와
       '건은 완결, 검수는 미완결' 이 된다(43c0415 가 고쳤던 그 모순이다). */
  var adopted = (c.checklist || []).filter(function(it){ return it.dbId; });
  var jobChecklist = saveChecklist(c).then(function(){
    if (!adopted.length) return;
    return Promise.all(adopted.map(function(it){
      return saveItemStatus(c, it).catch(function(err){
        DB.itemSaveErr = DB.itemSaveErr || {};
        DB.itemSaveErr[c.id] = {name:it.n, msg:(err && err.message) || String(err)};
        console.error('[DB] 항목 상태가 저장되지 않았습니다 — ' + it.n, err);
      });
    }));
  }).then(function(){
    /* 이제 항목에 dbId 가 있다 — 첨부를 저장소로 올린다. */
    return uploadDonorFiles(c);
  }).then(function(r){
    if (r && r.bad && r.bad.length && !r.demo){
      pending.files = true;
      why.push('서류 ' + r.bad.length + '건 — ' +
               r.bad.map(function(b){ return b.name; }).join(' · '));
    }
  }).catch(function(err){
    failPart('checklist', '받을 서류 목록')(err);
    /* 목록이 안 들어갔으면 첨부도 붙일 자리가 없다 — 함께 남은 것으로 센다. */
    if ((c.checklist || []).some(function(it){ return (it.r.fileIds || []).length; })) pending.files = true;
  });

  /* ★ 제출본을 따로 남긴다 — donation 은 '지금 값' 이고 이것은 '그때 낸 그대로' 다.
       담당자가 값을 고쳐도 이 줄은 안 바뀐다. 그래야
       "후원자가 400개로 냈는데 왜 380개인가" 에 답할 수 있다.
     ⚠️ payload 에 개인정보를 넣지 않는다 — 이름·연락처·주소·서명은 넣지 않았다.
        PDF 가 붙으면 pdf_key 로 잇는다(privacy-design §2). */
  /* ★ 신청서 PDF — 이름·주민번호·연락처·주소·서명이 저장되는 **유일한 곳** (privacy-design §2 · 2026-09-04).
       값은 지금 이 자리에서 스냅샷으로 뜬다(donorFormPdfData · 화이트리스트). 아래 사슬은 비동기지만
       f 를 다시 읽지 않으므로 화면이 넘어가도 값이 바뀌지 않는다.
     ★★ 2026-09-04 — **순서를 뒤집었다.** 전에는 PDF 만들기 → 저장소 → 그 키를 담아 제출본이었다.
       `.catch` 는 **실패만** 받고 **무응답은 안 받는다.** PDF 만들기가 끝나지도 실패하지도 않으면
       (vendor 스크립트가 안 열리고 오류도 안 남) 뒤에 줄 서 있던 제출본 저장이 **시작조차 안 됐다** —
       후원자는 "접수되었습니다" 를 보고 떠나고 DB 에는 아무것도 없다(완전한 조용한 실패).
       (미공개 내부 기록) · 정본 24번 · 방어⑱
       ★ 둘은 서로 필요하지 않다. 제출본을 먼저 남기고(주소 칸은 빈칸), PDF 가 되면 그 칸을 채운다.
     ★ PDF 가 실패해도 제출본(payload) 줄은 남는다 — 대조값까지 같이 잃을 이유가 없다.
       대신 pending.pdf 로 세운다. 담당자가 다시 만들 수는 없다(값이 브라우저에만 있었다) —
       retrySaveCase 가 '후원자 재제출 필요' 로 안내한다. 그 전에 후원자가 [다시 시도] 를 누를 수 있다.
     ⚠️ 화면은 붙잡지 않는다 — 다른 저장과 같은 편.
     ⚠️ 데모(DB 미연결)에서는 조용히 둔다 — file:// 로 열면 폰트를 fetch 못 해 늘 실패한다. 콘솔에만 남긴다. */
  var pdfData = donorFormPdfData(f, c, {submittedAt: new Date().toISOString()});

  /* ① 제출본을 먼저 남긴다 — PDF 를 기다리지 않는다. 주소 칸(pdfKey)은 비워 둔다. */
  var jobForm = saveFormSubmission(c, {
    formType: '물품기부신청서(' + pdfData.formType + ')',
    payload:  submissionPayload(f, c, qty, book, fair),
    signed:   !!f.signed,
    role:     'donor',
    pdfKey:   null
  }).catch(function(err){ failPart('form', '제출본')(err); return null; });

  /* ② PDF 는 나란히 간다. 만들기는 지금 시작하고, 올리는 것만 ① 이 끝난 뒤에 한다. */
  DB.donorPdf = {state:'working', caseId:c.id, data:pdfData, formId:null, msg:''};
  var jobPdf = runDonorFormPdf(c, pdfData, jobForm);

  /* ③ 시한 — **기다림만 끊는다.** PDF 는 뒤에서 계속 간다.
       시한이 지나면 담당자(pending.pdf)와 후원자(DB.donorPdf)에게 알리고,
       늦게라도 성공하면 아래 donorPdfOk 가 그 안내를 걷는다. */
  var jobPdfReport = new Promise(function(res, rej){
    var t = setTimeout(function(){
      rej(new Error('신청서 PDF 가 ' + Math.round(PDF_WAIT_MS / 1000) + '초 안에 만들어지지 않았습니다'));
    }, PDF_WAIT_MS);
    jobPdf.then(function(v){ clearTimeout(t); res(v); }, function(e){ clearTimeout(t); rej(e); });
  }).then(function(){ donorPdfOk(c.id); }).catch(function(err){
    if (!sbReady()){
      /* 데모(DB 미연결·file://)는 폰트를 못 받아 늘 실패한다 — 담당자 화면에는 안 올린다.
         ⚠️ 다만 후원자 화면 안내는 **치운다.** 안 치우면 시연 내내 "저장하는 중…" 이 돌아간다. */
      console.warn('[PDF] 데모 — 신청서 PDF 를 만들지 못했습니다:', (err && err.message) || err);
      if (DB.donorPdf && DB.donorPdf.caseId === c.id) DB.donorPdf = null;
      return;
    }
    pending.pdf = true;
    why.push('신청서 PDF — ' + ((err && err.message) || String(err)));
    console.error('[PDF] 신청서 PDF 를 만들거나 올리지 못했습니다 — 개인정보·서명이 어디에도 저장되지 않았습니다:', err);
    donorPdfFail(c.id, err);
  });
  /* ⚠️ 시한이 지난 뒤에 성공하는 경우 — 여기서만 받는다. 위 사슬은 이미 끝났다. */
  jobPdf.then(function(){ donorPdfOk(c.id); }, function(){});

  /* ★ 무엇이 안 들어갔는지 담당자에게 남긴다.
     ★ 다시 보낼 값을 함께 담아 둔다 — 실패만 알리면 담당자가 할 수 있는 것이 없다.
         후원자는 이미 떠났고, 폼은 곧 비워진다. 그 값이 여기 없으면 영영 못 되살린다.
     ★ parts 로 나눠 담는다 — 한 칸이면 나중 실패가 앞 실패를 덮어
         담당자가 "제출 내용이 안 들어갔다" 만 보고 첨부가 빠진 것은 모른다(유진 §4).
     ⚠️ 두 번 부른다 (2026-09-04). 빠른 셋이 끝났을 때 한 번, PDF 시한이 끝났을 때 또 한 번.
       한 번만 부르면 **PDF 를 기다리느라 나머지 실패 안내가 30초 늦게 뜬다** —
       고치려던 것(하나가 나머지를 붙잡는 것)을 안내 쪽에서 되풀이하는 꼴이다. */
  var report = function(){
    var left = Object.keys(pending).filter(function(k){ return pending[k]; });
    if (!left.length){ if (DB.caseSaveErr) delete DB.caseSaveErr[c.id]; return; }
    DB.caseSaveErr = DB.caseSaveErr || {};
    DB.caseSaveErr[c.id] = {msg:'후원자 제출 저장이 ' + left.length + '가지 남았습니다 — ' + why.join(' / '),
                            fields:submitFields, parts:pending};
    render();
  };
  /* ★★ 여기서부터가 2026-09-06 에 고친 자리다 (선미 실주행 #214·#215).
       전에는 아래 넷이 **저장 결과를 기다리지 않고** 바로 돌았다.
         f.submittedId = c.id · closeLinkAfterSubmit() · go('donorDone') · "접수되었습니다" 토스트
       그래서 제출 내용 저장이 400 으로 실패해도
         · 후원자는 "접수되었습니다 #215" 를 보고 떠나고
         · **링크는 이미 폐기돼 다시 낼 수 없고**
         · 담당자는 이름·물품·수량이 전부 빈 건을 받았다.
       실패는 DB.caseSaveErr 에 담겨 '담당자 화면 배너' 로 뜨게 돼 있었지만,
       그것은 **후원자 브라우저의 메모리**다. 담당자는 다른 탭·다른 사람이라 영영 못 본다.
       주석이 말하던 "실패는 담당자 쪽에 세운다" 가 실제로는 아무 데도 안 섰다.

     ★ 그래서 갈랐다 — **제출 내용(fields)** 이 안 들어갔으면 접수가 없던 것과 같다.
       그때는 링크를 살려두고 후원자에게 사실대로 말하고 다시 시도하게 한다.
       체크리스트·제출본·PDF 실패는 건에 내용이 남아 담당자가 되살릴 수 있으므로
       예전처럼 '담당자에게 알림' 으로 둔다(report).
     ★ 담당자에게 실패를 알리는 길은 **DB 상태 그 자체**다 (새 칸을 만들지 않는다 — 스키마 불가침).
       링크가 살아 있고 건이 '제출 대기' 로 남는 것이 곧 "아직 안 들어왔다" 는 정직한 표시다. */
  var finish = function(){
    DB.donorSubmitting = false;
    report();
    if (pending.fields){
      /* 저장이 안 됐다 — 제출을 완료로 만들지 않는다. 링크도 그대로 둔다. */
      DB.toast = {msg:'제출이 저장되지 않았습니다 — 다시 [제출하기] 를 눌러 주세요',
                  cap:why.join(' / ')};
      render();
      return;
    }
    DB.demo.subs[c.id] = '후원자가 방금 제출 — 바로 검수할 수 있습니다';
    f.submittedId = c.id;
    closeLinkAfterSubmit();   /* 링크로 들어왔으면 그 링크를 폐기한다 — 저장을 확인한 뒤에만 */
    go('donorDone');
    DB.toast = {msg:'접수번호 #' + c.id + ' 로 접수되었습니다',
      /* 역할 사이를 건너뛰는 버튼은 걷어냈다(9/3) — §데모 지름길 참조 */
      act:null, cap:''};
    renderToast();
  };
  /* 기다리는 것은 **빠른 셋뿐**이다. PDF 는 30초까지 가므로 붙잡지 않는다(기존 판단 유지) */
  var settled = Promise.all([jobFields, jobChecklist, jobForm]).then(finish);
  jobPdfReport.then(report);

  /* 저장을 기다리는 동안 화면이 멈춘 것처럼 보이지 않게 — 버튼을 잠그고 사실을 적는다 */
  DB.donorSubmitting = true;
  render();
  /* ★ 프라미스를 돌려준다 (2026-09-06) — 제출이 **비동기가 되었기 때문**이다.
       전에는 submittedId·링크 폐기가 동기라 부르는 쪽이 바로 결과를 볼 수 있었다.
       지금은 저장이 끝나야 정해지므로, 기다릴 수단을 주지 않으면
       검사도 화면도 "아직 안 정해진 값" 을 읽는다(smoke-test-pdf-submit 이 그렇게 깨졌다). */
  return settled;
}
/* ══ 신청서 PDF — 만들기·올리기·이어붙이기 (2026-09-04 선미) ═══════
   ★ 왜 따로 뺐나 — 제출 때 한 번, 후원자가 [다시 시도] 를 누르면 또 한 번 부른다.
     (미공개 내부 기록) */

/* 신청서 PDF 를 이만큼까지 기다린다. 지나면 **알리기만** 한다 — PDF 는 뒤에서 계속 간다.
   ★ 30초인 이유 — 부품(1.6MB)은 폼을 열 때 미리 받아 두므로(preloadPdfLibs) 제출 순간에
     남는 일은 그리기와 업로드뿐이다. 느린 폰에서도 몇 초다. 30초면 그 서너 배 여유이고,
     AI 판정 시한(api.js 60초)보다 짧다. */
var PDF_WAIT_MS = 30000;
var PDF_RETRY_WAIT = 2000;   /* 한 번 실패하면 잠깐 쉬고 한 번 더 — 잠깐의 끊김을 넘긴다(api.js 와 같은 방식) */

/* PDF 를 만들어 저장소에 올리고, 제출본의 빈 주소 칸을 채운다.
   jobForm: 제출본 저장 약속(성공하면 {id:…}). ★ 만들기는 지금 시작하고 **올리기만** 기다린다.
   ⚠️ 제출본 줄이 없으면 올리지 않는다 — 저장소 경로는 uuid 라(db.js storagePath) 가리키는 줄이
     없으면 아무도 못 찾고, purge_donation() 도 DB 의 pdf_key 를 보므로 **1년 뒤에도 안 지운다.**
     주민번호가 든 파일이 파기 대상 밖에 남는 것이라 개인정보 설계가 거기서 뚫린다. */
function runDonorFormPdf(c, pdfData, jobForm, opt){
  /* opt (2026-09-05) — 인수증도 같은 사슬을 탄다. make: PDF 만드는 함수 · demoKey: 데모 때 메모리에 두는 자리 · label: 오류 문구 */
  opt = opt || {};
  var make = opt.make || createDonorFormPdf, demoKey = opt.demoKey || 'formPdf', label = opt.label || '신청서 PDF';
  var made = make(pdfData).catch(function(err){
    console.warn('[PDF] 한 번 더 시도합니다 —', (err && err.message) || err);
    return new Promise(function(r){ setTimeout(r, PDF_RETRY_WAIT); })
      .then(function(){ return make(pdfData); });
  });
  return Promise.all([jobForm, made]).then(function(r){
    var form = r[0], bytes = r[1];
    if (!sbReady()){ c[demoKey] = {bytes:bytes, name:(opt.name || '물품기부신청서(' + pdfData.formType + ')') + '.pdf'}; return null; }   /* 데모: 메모리에만 */
    if (!form || !form.id) throw new Error('제출본이 저장되지 않아 ' + label + ' 를 올리지 않았습니다 — ' + (opt.who || '후원자') + ' 재제출이 필요합니다');
    if (demoKey === 'formPdf' && DB.donorPdf && DB.donorPdf.caseId === c.id) DB.donorPdf.formId = form.id;
    return uploadFormPdf(c, bytes).then(function(pdfKey){
      return attachFormPdfKey(form.id, pdfKey);
    });
  });
}

/* 다 됐다 — 안내를 걷는다. 여러 번 불려도 안전하다(시한 쪽과 늦게 온 쪽이 둘 다 부른다). */
function donorPdfOk(caseId){
  var s = DB.donorPdf;
  if (!s || s.caseId !== caseId || s.state === 'ok') return;
  s.state = 'ok'; s.msg = '';
  /* ★ 주민번호·서명이 든 값이다 — 다 썼으면 브라우저 메모리에서도 지운다 */
  s.data = null;
  /* 시한이 지나 이미 "안 됐다" 고 세워 뒀으면 그것도 걷는다 — 안 걷으면 담당자가 헛일을 한다 */
  var e = (DB.caseSaveErr || {})[caseId];
  if (e && e.parts && e.parts.pdf){
    delete e.parts.pdf;
    if (!Object.keys(e.parts).filter(function(k){ return e.parts[k]; }).length) delete DB.caseSaveErr[caseId];
  }
  render();
}
function donorPdfFail(caseId, err){
  var s = DB.donorPdf;
  if (!s || s.caseId !== caseId || s.state === 'ok') return;
  s.state = 'fail'; s.msg = (err && err.message) || String(err);
  render();
}

/* ══ 인수증 PDF 사슬 (2026-09-05 선미) — submitOrg 가 부른다 ═══════════
   신청서 사슬과 같다: 시한(PDF_WAIT_MS)은 **알리기만** 끊고 PDF 는 뒤에서 계속 간다. 늦게라도 되면 안내를 걷는다.
   ⚠️ 기관 브라우저의 caseSaveErr 는 담당자에게 안 간다 — 담당자 쪽 신호는 인수증 항목 카드의 "인수증 PDF 없음" 경고다(formPdfButtonsHtml 'receipt'). */
function runOrgReceiptPdf(c, pdfData, jobForm){
  var job = runDonorFormPdf(c, pdfData, jobForm, {make:createOrgReceiptPdf, demoKey:'orgReceiptPdf', name:'인수증', label:'인수증 PDF', who:'기관'});
  var timed = new Promise(function(res, rej){
    var t = setTimeout(function(){ rej(new Error('인수증 PDF 가 ' + Math.round(PDF_WAIT_MS / 1000) + '초 안에 만들어지지 않았습니다')); }, PDF_WAIT_MS);
    job.then(function(v){ clearTimeout(t); res(v); }, function(e){ clearTimeout(t); rej(e); });
  });
  var clear = function(){
    var e = (DB.caseSaveErr || {})[c.id];
    if (e && e.parts && e.parts.rcPdf){ delete DB.caseSaveErr[c.id]; render(); }
  };
  job.then(clear, function(){});
  return timed.then(clear).catch(function(err){
    var msg = (err && err.message) || String(err);
    if (!sbReady()){ console.warn('[PDF] 데모 — 인수증 PDF 를 만들지 못했습니다:', msg); return; }
    console.error('[PDF] 인수증 PDF 를 만들거나 올리지 못했습니다 — 수령자명·서명이 어디에도 저장되지 않았습니다:', err);
    DB.caseSaveErr = DB.caseSaveErr || {};
    DB.caseSaveErr[c.id] = {msg:'기관 인수증 PDF 가 저장되지 않았습니다 — 수령자명·서명이 어디에도 없습니다. 기관에 재제출을 요청해 주세요 — ' + msg,
                            fields:null, parts:{rcPdf:true}};
    render();
  });
}

/* 후원자가 완료 화면에서 [다시 시도] 를 눌렀다.
   ★ 값(pdfData)이 아직 브라우저에 있으므로 **진짜로 복구된다.** 창을 닫으면 그 값은 세상에 없다 —
     주민번호를 DB 에도 브라우저 저장소에도 두지 않기로 한 설계의 대가다(privacy-design §2). */
function retryDonorFormPdf(){
  var s = DB.donorPdf;
  if (!s || s.state !== 'fail' || !s.data) return;
  var c = getCase(s.caseId);
  if (!c) return;
  var formId = s.formId;
  s.state = 'working'; s.msg = '';
  render();
  runDonorFormPdf(c, s.data, Promise.resolve(formId ? {ok:true, id:formId} : null))
    .then(function(){ donorPdfOk(s.caseId); })
    .catch(function(err){
      console.error('[PDF] 다시 시도했지만 실패했습니다:', err);
      /* state 를 되돌려야 버튼이 다시 눌린다 */
      var cur = DB.donorPdf;
      if (cur && cur.caseId === s.caseId && cur.state === 'working'){ cur.state = 'fail'; cur.msg = (err && err.message) || String(err); render(); }
    });
}

/* 완료 화면의 안내 한 줄.
   ⚠️ 후원자에게 '제출본'·'PDF'·'저장소' 는 뜻이 없다 — 후원자가 아는 것은 **신청서** 하나다.
     그래서 "접수는 되었다" 를 먼저 말하고, 해야 할 행동 하나만 준다. */
function donorPdfNotice(){
  var s = DB.donorPdf;
  if (!s || s.caseId !== DB.donorForm.submittedId) return '';
  if (s.state === 'working')
    return '<div class="banner info mb12"><span class="bi">⏳</span><div>' +
           '신청서 원본을 저장하는 중입니다… <span class="small muted">잠시만 이 창을 열어 두세요</span></div></div>';
  if (s.state === 'fail')
    return '<div class="banner warn mb12"><span class="bi">⚠️</span><div>' +
           '<b>접수는 되었습니다.</b><br>' +
           '신청서 원본 저장이 끝나지 않았습니다. 이 창을 닫지 말고 다시 시도해 주세요.' +
           '<div class="row mt8"><button class="btn pri sm" onclick="retryDonorFormPdf()">다시 시도</button></div>' +
           '<div class="small muted mt8">계속 안 되면 담당자가 연락드립니다.</div></div></div>';
  return '';   /* 성공은 조용히 — "저장되었습니다" 배너를 뺐다 (2026-09-11 선미). 실패·진행 중은 위에서 그대로 말한다 */
}

function viewDonorForm(pv){
  var f = DB.donorForm, c = linkCase();
  /* ⭐PRD Q3 — 유형·경로는 담당자가 링크 발송 시 지정한 값. 후원자는 바꿀 수 없다 */
  if (c){ f.donorType = c.donorType; f.path = c.acqPath || '구매'; }
  else if (pv){ f.donorType = DB.req.donorType; f.path = DB.req.path; }
  if (!c && !pv){
    return demoBadge() +
      '<div class="lock-box"><div class="lk">🔗</div>' +
      '<div class="page-t">접수 링크로만 열 수 있습니다</div>' +
      '<div class="page-d">담당자가 보낸 링크로 열립니다</div></div>';
      /* 유형·경로는 담당자 지정(PRD Q3) · 그 조합의 필수서류가 이 화면이 된다 — 설명 배너는 뺐다 (문구 규칙 9/5) */
  }
  if (c && !pv && c.state === '취소'){
    return demoBadge() +
      '<div class="lock-box"><div class="lk">🚫</div>' +
      '<div class="page-t">취소된 접수입니다</div>' +
      '<div class="page-d">담당자가 접수를 취소해 이 링크로는 제출할 수 없습니다</div></div>';
  }
  /* ★ 여기까지 왔으면 폼이 실제로 그려진다 — **지금부터 부품을 받아 둔다** (2026-09-04).
       후원자는 이 폼을 몇 분 동안 채운다. 그 사이에 받아 두면 [제출] 순간에 남는 일은
       PDF 그리기(인터넷 불필요)와 업로드뿐이다. 잠금 화면들 뒤에 두는 이유는,
       열지도 못하는 사람에게 1.6MB 를 받게 하지 않기 위해서다.
     ⚠️ 여러 번 그려도 안전하다 — pdf-form.js 가 한 번만 받는다(_pdfLibs·_pdfAssets).
     ⚠️ **없어도 그려져야 한다.** pdf-form.js 가 안 열리는 것이야말로 이 사고의 원인 중 하나인데,
       그때 이 한 줄 때문에 폼이 통째로 안 그려지면 고치려던 것보다 나쁘다(빈 화면 · 접수 불가). */
  if (typeof preloadPdfLibs === 'function') preloadPdfLibs();
  var errs = donorErrors(f), done = !!f.submittedId, ro = pv || done;
  var corp = (f.donorType === '법인');
  var oc = function(js){ return ro ? '' : ' onchange="' + js + '"'; };
  /* type 은 선택 인자다 — 안 주면 지금까지처럼 text 다 (2026-09-06 M-2).
     ★ 왜 형식을 지정하나 — 자유 텍스트라 '20260905' · '2026.09.05' · '2026-09-05' 가 다 들어왔고,
       DB 로는 **원문이 그대로** 나갔다. type="date" 는 폰에서 날짜 선택기를 띄워
       애초에 한 가지 표기만 나오게 한다(형식을 사람에게 외우게 하지 않는다).
     ⚠️ date 를 지원하지 않는 브라우저는 text 로 떨어진다 — 그래서 제출 직전 정규화(submitDonor)와
       donorErrors() 의 형식 검사를 함께 둔다. 화면 하나에 기대지 않는다. */
  var inp = function(key, label, ph, hint, type){
    return '<div class="field"><label>' + label + '</label><input type="' + (type || 'text') + '"' + (ro ? ' disabled' : '') +
      ' value="' + esc(f[key]) + '" placeholder="' + esc(ph || '') + '"' + oc('setDonor(\'' + key + '\',this.value)') + '>' +
      (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
  };
  /* 숫자만 받고 하이픈은 칸이 붙인다 (2026-09-05 선미) — 후원일자·연락처.
     ★ oninput 은 **다시 그리지 않는다.** 글자 하나마다 render() 를 부르면 커서가 튀고
       입력 중인 칸이 새로 만들어진다. 화면 값만 그 자리에서 고치고,
       DB 반영·검증은 칸을 떠날 때(onchange) 한 번 한다.
     ★ type="date" 를 먼저 넣었다가 물렸다 — 값이 이미 채워진 것처럼 보이고
       흐린 예시가 안 뜬다. "남이 써 놓은 값을 고치는 모양" 을 없애려던 것이 M-1 이었다. */
  var maskedInp = function(key, label, ph, hint, fn){
    return '<div class="field"><label>' + label + '</label>' +
      '<input type="text" inputmode="numeric"' + (ro ? ' disabled' : '') +
      ' value="' + esc(f[key]) + '" placeholder="' + esc(ph || '') + '"' +
      (ro ? '' : ' oninput="this.value=' + fn + '(this.value)"' +
                 ' onchange="setDonor(\'' + key + '\',' + fn + '(this.value))"') + '>' +
      (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
  };
  /* 금액 칸 — 숫자만 받고 콤마는 칸이 붙인다 (2026-09-15 선미 · 테스트 참여자 의견)
     maskedInp 와 같은 꼴이지만 **저장은 콤마를 뗀 숫자**다 — 금액은 Number() 로 계산된다
     (common.js maskMoney 주석). 화면과 저장을 이 칸에서 가른다. */
  var moneyInp = function(key, label, ph, hint){
    return '<div class="field"><label>' + label + '</label>' +
      '<input type="text" inputmode="numeric"' + (ro ? ' disabled' : '') +
      ' value="' + esc(maskMoney(f[key])) + '" placeholder="' + esc(ph || '') + '"' +
      (ro ? '' : ' oninput="this.value=maskMoney(this.value)"' +
                 ' onchange="setDonor(\'' + key + '\',moneyDigits(this.value))"') + '>' +
      (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
  };
  var giftAuto = autoGift(f, corp), saleAuto = autoSale(f);
  var giftVal = giftValOf(f, corp), saleVal = saleValOf(f);
  /* 자동계산값을 기본으로 보여주되 직접 수정할 수 있는 금액칸 */
  var moneyField = function(key, label, autoV, curV, formula){
    var edited = isOverridden(f[key]);
    return '<div class="field"><label>' + label +
      (edited ? '<span class="srcbadge o">직접 입력</span>' : '<span class="srcbadge">자동계산</span>') + '</label>' +
      /* 천 단위 표기 (2026-09-15 선미 · 테스트 참여자 의견) — 화면은 콤마, 저장은 숫자 */
      '<input type="text" inputmode="numeric"' + (ro ? ' disabled' : '') +
      ' value="' + esc(maskMoney(edited ? f[key] : String(autoV || ''))) + '"' +
      ' placeholder="' + esc(maskMoney(String(autoV || 0))) + '"' +
      (ro ? '' : ' oninput="this.value=maskMoney(this.value)"' +
                 ' onchange="setDonor(\'' + key + '\',moneyDigits(this.value))"') + '>' +
      '<div class="hint">' + esc(formula) + ' = <b>' + won(autoV) + '</b>' +
      (edited && curV !== autoV
        ? ' · <b style="color:var(--accent-pink)">신고 ' + won(curV) + ' (산식과 다름)</b>' : '') +
      (ro ? '' : (edited ? ' · <a href="javascript:void(0)" onclick="setDonor(\'' + key + '\',\'\')">자동계산으로 되돌리기</a>' : '')) +
      '</div></div>';
  };

  /* ★ 섹션 번호·동의 카드 (2026-09-11 승희 · 동료 테스트 UI 개선)
       유형 4가지(법인/법인외 × 구매/제조·유통)마다 카드 수가 달라 번호는 그릴 때 센다.
       직접 적는 카드(흰색)와 **읽고 체크만 하는 카드(연녹색 consent)** 를 색으로 가른다. */
  var secN = 0;
  var sec = function(title, extra){
    secN++;
    return '<div class="card-h"><span class="sec-n">' + secN + '</span><h3>' + title + '</h3>' + (extra || '') + '</div>';
  };
  var CONSENT_TAG = '<span class="tag consent-tag">읽고 체크</span>';
  var h = demoBadge() +
    '<div class="page-t">물 품 기 부 신 청 서 (' + (corp ? '법인' : '법인 외') + ')</div>' +
    /* ★ 법인은 서명·인감 중 고른다 (2026-09-04) — 첫 화면에서 미리 말해 준다.
         끝까지 채우고 제출 버튼 앞에서야 "인감이 없다"를 만나면 다시 도장을 찍으러 가야 한다.
       "이 화면이 곧 물품기부신청서입니다" 제목 줄과 법인외 배너는 뺐다 (문구 수정 9/10). */
    (corp
      ? '<div class="banner ok mb12"><span class="bi">📝</span><div>' +
        '항목을 채운 뒤 전자서명을 하거나, 법인인감을 날인한 신청서 스캔본을 첨부하세요.</div></div>'
      : '');

  if (pv){
    h += '<div class="banner warn mb12"><span class="bi">🔎</span><div><b>미리보기</b><br>' + PV_NOTE + '</div></div>';
  }
  if (done){
    h += '<div class="banner ok mb12"><span class="bi">✅</span><div><b>이미 제출된 신청서입니다 · 접수번호 #' + esc(f.submittedId) + '</b></div></div>';
  }
  /* 유형·경로 안내 한 줄("접수 유형 · … · 담당자 지정")은 뺐다 (문구 수정 9/10) */
  if (!ro){
    /* ★ 데모 전용 — 실서비스에서는 그리지 않는다(정본 22번 · 방어⑯).
         prefillDonor 는 가짜 주민번호를 채우고(:61) 그 값이 신청서 PDF 로 저장소에 올라간다.
         '빈 폼으로' 도 함께 감싼다 — 실제 후원자가 누르면 쓰던 것이 지워진다. */
    h += demoOnly('<div class="row mb12" style="gap:7px">' +
      '<button class="btn ghost sm" onclick="prefillDonor()">기본값 채우기(데모용)</button>' +
      '<button class="btn ghost sm" onclick="emptyDonor()">빈 폼으로(검증 보기)</button></div>');
    /* ★ 발표자 전용 (2026-09-14) — 이 브라우저에 admin 담당자 로그인이 있을 때만. 심사위원 링크에는 안 뜬다. presenterFillDonor 참조 */
    h += presenterOnly('<div class="row mb12" style="gap:7px">' +
      '<button class="btn ghost sm" onclick="presenterFillDonor(\'ok\')">정상 건 채우기</button>' +
      '<button class="btn ghost sm" onclick="presenterFillDonor(\'mismatch\')">단가 불일치 건 채우기</button></div>');
    if (DB.presenterFilling) h += PRESENTER_WAIT;
  }

  /* ① 기부자 정보 — 양식 상단부 */
  h += '<div class="card mb12">' + sec('기부자 정보') + '<div class="card-b form-dense">' +
    inp('donorName', corp ? '기부법인명 <span class="req">*</span>' : '기부자명(기부단체명) <span class="req">*</span>', corp ? '예: 주식회사 온누리식품' : '예: 김나눔') +
    /* ★ 2026-09-10 — 법인 사업자번호를 기부금영수증 카드에서 여기로 옮겼다.
         전에는 [발급] 을 고른 사람에게만 칸이 떴는데, 검수는 영수증과 **무관하게** 늘 돈다
         (bizno_fmt · 루브릭 §1-1 후원자 유형 확인 게이트 · E3 보조확인).
         그래서 영수증을 안 받는 법인은 **낼 방법이 없는 것을 요구받고** 확인필요가 났다.
       ⚠️ 세무(영수증)와 검수(유형 확정)는 서로 다른 이유다 — 칸도 갈라 둔다.
         PDF 에는 예전대로 영수증을 원할 때만 찍는다(양식: 미발급시 작성 불필요). */
    (corp ? maskedInp('bizNo', '사업자등록번호 <span class="req">*</span>', '000-00-00000', '', 'maskBizNo') : '') +   /* 하이픈 자동 (2026-09-12 선미) */   /* 설명 문구 삭제 (2026-09-11 선미) */
    /* 기본값을 비웠다(db.js · M-1) — 후원자가 직접 넣는다. 비면 제출이 막힌다(donorErrors).
       흐린 예시는 주민등록번호 칸과 같은 모양으로 맞췄다 — 숫자만 치면 하이픈이 붙는다 */
    maskedInp('donDate', '후원일자 <span class="req">*</span>', '0000-00-00', '물품을 기부하신 날짜입니다.', 'maskDate') +
    inp('addr', '주소', '') +
    maskedInp('phone', '연락처', '000-0000-0000', '', 'maskPhone') +
    '</div></div>';

  /* ② 기부금영수증 — 발급 선택 + (법인 외만) 발급 시 주민번호란 (양식: 미발급시 작성 불필요).
       법인 사업자번호는 위 ① 기부자 정보로 옮겼다 (2026-09-10) — 그 칸 주석 참조. */
  h += '<div class="card mb12">' + sec('기부금영수증') + '<div class="card-b form-dense">' +
    '<div class="seg mb12" style="width:100%">' +
    [['발급', true], ['발급하지 않음', false]].map(function(o){
      return '<button class="' + (f.wantsReceipt === o[1] ? 'on' : '') + '"' + (ro ? ' disabled' : ' onclick="setDonor(\'wantsReceipt\',' + o[1] + ')"') +
        ' style="flex:1">□ ' + o[0] + '</button>';
    }).join('') + '</div>' +
    /* 공제 안내를 이 칸으로 (2026-09-11 선미) — 법인은 법인세법, 법인 외는 소득세법. 문구는 pdf-form.js 상수 */
    (corp
      ? '<div class="hint">' + esc(typeof TAX_NOTE_CORP !== 'undefined' ? TAX_NOTE_CORP : '') + '</div>'
      : (f.wantsReceipt
      /* ★ 신청서 PDF 에만 찍힌다 — DB 에 저장되지 않는다 (privacy-design A2 · submissionPayload 화이트리스트)
         ★ 종류를 고르고 그에 맞춰 하이픈이 붙는다 (2026-09-12 선미) — 한 칸에 주민번호·사업자번호를 같이 받으니
           하이픈을 못 붙여 입력도 헷갈리고 PDF 에도 숫자가 쭉 이어 나왔다. 값은 그대로 f.rrn 하나(PDF idNo).
           소득세법 제34조 공제 안내는 국세청 문장 앞으로(선미 9/12). */
      ? '<div class="field"><label>기부금영수증 발급 대상 <span class="req">*</span></label>' +
        '<div class="seg" style="width:100%">' +
        [['rrn', '주민등록번호'], ['biz', '사업자등록번호']].map(function(o){
          return '<button class="' + ((f.idKind || 'rrn') === o[0] ? 'on' : '') + '"' +
            (ro ? ' disabled' : ' onclick="setIdKind(\'' + o[0] + '\')"') + ' style="flex:1">□ ' + o[1] + '</button>';
        }).join('') + '</div></div>' +
        ((f.idKind || 'rrn') === 'biz'
          ? maskedInp('rrn', '사업자등록번호 <span class="req">*</span>', '000-00-00000', '', 'maskBizNo')
          : maskedInp('rrn', '주민등록번호 <span class="req">*</span>', '000000-0000000', '', 'maskRrn')) +
        '<div class="hint">' + esc(typeof TAX_NOTE_INDIV !== 'undefined' ? TAX_NOTE_INDIV : '') + ' ' +
            '국세청 연말정산 간소화 서비스 등록을 위해 주민등록번호를 입력해주세요. ' +
            '[소득세법] 제160조의3 및 동법 시행령 제208조의3, [법인세법] 제112조의2, 동법 시행령 제155조의2에 의거하여 주민등록번호를 처리합니다.</div>'   /* 문구 수정 9/10 · PDF 에만 남는다(DB 미저장)는 구조는 그대로 */
      : '<div class="hint">' + esc(typeof TAX_NOTE_INDIV !== 'undefined' ? TAX_NOTE_INDIV : '') + '<br>기부금영수증을 받지 않으면 적지 않아도 됩니다.</div>')) +
    '</div></div>';

  /* ②-b 매입세액공제 — 법인과 개인사업자에게만 (2026-09-12 선미 · U02 실주행에서 드러남)
       ★ 왜 필요한가 — E1(금액 대조)이 **무엇과 맞출지**를 이 값이 가른다. 공제를 받으면 공급가액,
         안 받으면 합계. 그동안 폼에 칸이 없어 늘 NULL(모름)이었고, 모름이면 단정하지 않으므로
         **맞는 서류도 언제나 '확인 권장'** 이 떴다(peer-test-kit README 2번 · 작업판 검수 기준 칸).
       ★ 일반 개인은 대상이 아니다 — 부가세 과세사업자만 공제를 받는다. 그래서 법인이거나
         기부금영수증을 사업자등록번호로 받는 경우에만 묻는다.
         ⚠️ 안 묻는다고 '모름'으로 저장하지 않는다 — 대상이 아닌 것은 곧 '아니오'(합계 대조)다.
            제출값 분기는 submitFields 의 vatDeduction 주석 참조 (2026-09-16).
       ★ '모름'을 남겨 둔다 — 세무는 기부 담당자가 모르는 경우가 많다. 모름이면 지금 동작 그대로다. */
  if (vatAsked(f, corp)){
    h += '<div class="card mb12">' + sec('매입세액공제 여부', '<span class="tag">금액 대조 기준</span>') + '<div class="card-b form-dense">' +
      '<div class="seg" style="width:100%">' +
      [['예', true], ['아니오', false], ['모름', null]].map(function(o){
        var on = (f.vatDeduction === o[1]) || (o[1] === null && f.vatDeduction !== true && f.vatDeduction !== false);
        return '<button class="' + (on ? 'on' : '') + '"' +
          (ro ? ' disabled' : ' onclick="setVat(' + JSON.stringify(o[1]) + ')"') + ' style="flex:1">□ ' + o[0] + '</button>';
      }).join('') + '</div>' +
      '<div class="hint">이 물품을 살 때 낸 부가가치세를 매입세액공제로 돌려받으셨나요? 모르시면 [모름]으로 두세요.</div>' +
      '</div></div>';
  }

  /* ③ 기부 목적 */
  h += '<div class="card mb12">' + sec('기부 목적') + '<div class="card-b form-dense">' +
    /* 종이 양식에는 '지역 아동 생필품 지원' 이 인쇄돼 있다. 화면은 주관식이라 예시를 흐린 글자로 보여 주고 직접 쓰게 한다(9/5 선미) */
    inp('purpose', '기부 목적', '예) 지역아동 생필품 지원') + '</div></div>';

  /* ④ 물품 내역 — 법인: 장부가액 확인서 / 법인외: 기부가액 (양식 산식 그대로) */
  h += '<div class="card mb12">' + sec(corp ? '장부가액 확인서' : '기부가액', '<span class="tag">양식 산식 자동계산</span>') + '<div class="card-b form-dense">' +
    '<div class="field"><label>취득경로</label>' +
    '<div class="row" style="gap:6px;align-items:center"><span class="pill neu"><span class="pd"></span>□ ' + esc(f.path) + '</span>' +
    '<span class="small muted">담당자 지정</span></div></div>' +
    inp('itemName', '품목 <span class="req">*</span>', '예: 즉석밥 3종 세트') +
    /* 수량은 낱개가 정본 — 박스는 상자마다 든 개수가 달라 금액·증빙과 대조할 수 없다.
       (실서류 검수에서 "5상자" vs 증빙 120EA로 대조 불가였던 실사례 반영. 낱개 파악이
        어려우면 증빙서류의 수량을 AI가 읽어 담당자에게 보완 제안 — 후원자를 세우지 않는다) */
    inp('qty', '수량(낱개) <span class="req">*</span>', '예: 400',
      '낱개 수로 적어 주세요.') +   /* 증빙서류의 수량과 대조하는 기준값 */
    inp('pkg', '포장 단위 (선택)', '예: 5박스',
      '참고용입니다.') +   /* 검수 대조에는 쓰지 않는다 */
    (corp
      /* 법 조항은 화면에 쓰지 않는다 — 무엇을 적을지만 (2026-09-11 선미 · 문구 규칙 2번). 근거는 PDF 안내사항(종이 양식)에 남는다 */
      ? moneyInp('unitBook', '단가(장부가액) <span class="req">*</span>', '예: 12,500',
          f.path === '제조·유통' ? '제조원가를 적어 주세요.' : '구입한 금액(장부가액)을 적어 주세요.') +
        (f.path === '제조·유통'
          ? moneyInp('unitSale', '단가(판매가액) <span class="req">*</span>', '예: 13,500', '판매가액(시가)을 적어 주세요.')
          : '')
      : moneyInp('unitSale', '단가(판매가액) <span class="req">*</span>', '예: 13,500', '시가(판매가액)를 적어 주세요.')) +
    moneyField('giftVal', '기부가액 <span class="req">*</span>', giftAuto, giftVal,
      '수량×단가(' + (corp ? '장부가액' : '판매가액') + ')') +
    (corp && f.path === '제조·유통'
      ? moneyField('saleVal', '판매가액', saleAuto, saleVal, '수량×단가(판매가액)') : '') +
    (valueDiffers(f, corp)
      /* 부대비용·묶음할인 등으로 다를 수 있다 — 비고가 검수 근거가 된다 */
      ? '<div class="banner warn mb12"><span class="bi">✎</span><div><b>수량×단가와 다른 금액입니다.</b><br>비고에 사유를 적어 주세요.</div></div>'
      : '') +
    '<div class="field mt8"><label>※ 비고' + (valueDiffers(f, corp) ? ' <span class="req" style="color:var(--accent-pink)">*</span>' : '') + '</label>' +
      '<input type="text"' + (ro ? ' disabled' : '') +
      ' value="' + esc(f.note) + '" placeholder="판매가액이 기부가액(장부가액)보다 작거나 같은 경우 등 특이사항 작성"' +
      oc('setDonor(\'note\',this.value)') + '>' +
      /* 폰에서는 placeholder 가 잘린다 — 같은 말을 칸 아래에 (styles.css 모바일 보정 ① · PC 는 안 보인다) */
      '<div class="hint m-only">판매가액이 기부가액(장부가액)보다 작거나 같은 경우 등 특이사항을 적어 주세요.</div></div>' +
    '</div></div>';

  /* ⑤ 필수 동의 — 양식 하단 2종 */
  var chk = function(key, label){
    return '<label style="display:flex;gap:8px;align-items:flex-start;font-size:14.5px;margin-bottom:10px">' +
      '<input type="checkbox" style="width:auto;margin-top:2px"' + (ro ? ' disabled' : '') + (f[key] ? ' checked' : '') +
      oc('setDonor(\'' + key + '\',this.checked)') + '><span>' + label + '</span></label>';
  };
  h += '<div class="card mb12 consent">' + sec('확인 및 동의 <span class="req" style="color:var(--accent-pink)">*</span>', CONSENT_TAG) + '<div class="card-b">' +
    chk('agreePurpose', '■ 상기물품을 재단의 목적사업에 사용하는 것에 동의합니다. <b>(미동의 시, 기부 불가)</b>') +
    chk('agreeDouble', '■ 부대비용(운송비 등)을 가액에 포함하는 경우, 해당 금액에 대해 이중 공제(매입 세금계산서 미발행)를 받지 않습니다.') +
    '</div></div>';

  /* ⑥ 개인정보 동의 — 법인 외(양식 내 동의서 요약) */
  if (!corp){
    h += '<div class="card mb12 consent">' + sec('개인정보 수집·이용 동의 <span class="req" style="color:var(--accent-pink)">*</span>', CONSENT_TAG) + '<div class="card-b">' +
      /* ★ 문구는 pdf-form.js 의 DONOR_CONSENT_LINES **하나**에서 온다 — 화면과 PDF 가 같은 배열을 그린다(9/5).
           내용은 종이 양식(법인외 신청서) 그대로 + AI 판독 전송 고지 한 줄(선미 결정 9/5). 배경: pdf-form.js 상수 주석.
         ⚠️ 상수가 없으면(pdf-form.js 가 안 실렸으면) 빈칸으로 넘어가지 않고 **빨간 글씨로 말한다** —
           동의 문구 없는 동의 체크박스는 동의가 아니다(방어⑱ · 조용한 실패 금지).
         ⚠️ 처리위탁·국외이전 고지와 법인용 고지는 재단 부서 확인 후 넣는다(consent-text-draft-20260903 §7 ③④). */
      (typeof DONOR_CONSENT_LINES === 'undefined'
        ? '<div class="banner dg mb12"><span class="bi">⛔</span><div>동의 문구를 불러오지 못했습니다 (pdf-form.js) — 새로고침 후에도 이 글이 보이면 담당자에게 알려 주세요</div></div>'
        : '<div class="small muted mb12">' +
          DONOR_CONSENT_INTRO.map(function(s){ return esc(s); }).join('<br>') + '<br><br>' +
          DONOR_CONSENT_LINES.map(function(s){
            var isAi = /^※/.test(s);
            return (isAi ? '<b>' : '') + esc(s).replace(/^ {3}/, '&nbsp;&nbsp;&nbsp;') + (isAi ? '</b>' : '');
          }).join('<br>') + '</div>') +
      '<label style="display:flex;gap:8px;align-items:center;font-weight:700;font-size:14.5px">' +
      '<input type="checkbox" style="width:auto"' + (ro ? ' disabled' : '') + (f.privacy ? ' checked' : '') +
      oc('setDonor(\'privacy\',this.checked)') + '> □ ' +
      '동의함</label>' +
      (f.privacy ? '' : '<div class="gate-block mt8">🔒 ' +
        '동의하지 않으면 제출할 수 없습니다</div>') + '</div></div>';

    /* ⑥-b 국외 이전 동의 — 수집·이용 동의와 **따로 받는다** (2026-09-10 선미 · 대응안 §1-3 나)
         위탁은 공개 대상이지만 국외 이전은 위탁이라도 별도 동의가 필요하다(법 제28조의8 ① 1호).
         한 체크박스에 묶으면 무엇에 동의한 것인지 갈린다. 문구는 pdf-form.js 상수 하나에서 온다. */
    h += '<div class="card mb12 consent">' + sec('개인정보 국외 이전 동의 <span class="req" style="color:var(--accent-pink)">*</span>', CONSENT_TAG) + '<div class="card-b">' +
      (typeof DONOR_TRANSFER_LINES === 'undefined'
        ? '<div class="banner dg mb12"><span class="bi">⛔</span><div>동의 문구를 불러오지 못했습니다 (pdf-form.js) — 새로고침 후에도 이 글이 보이면 담당자에게 알려 주세요</div></div>'
        : '<div class="small muted mb12">' +
          DONOR_TRANSFER_LINES.map(function(s){
            /* "신청서는 보내지 않습니다" 를 굵게 (2026-09-11 선미) — 무엇을 안 보내는지가 이 동의문의 핵심.
               ★ "가리지 않고 그대로 전송" 도 굵게 (2026-11-10 오픈소스 점검 §4-1) — 신청서 줄만 읽고
                 이름이 안 나간다고 오해하지 않게, 무엇이 그대로 나가는지도 같은 무게로 보인다. */
            var em = /성함·주민등록번호·연락처·주소·서명|가리지 않고 그대로/.test(s);
            return (em ? '<b>' : '') + esc(s).replace(/^ {3}/, '&nbsp;&nbsp;&nbsp;') + (em ? '</b>' : '');
          }).join('<br>') + '</div>') +
      '<label style="display:flex;gap:8px;align-items:center;font-weight:700;font-size:14.5px">' +
      '<input type="checkbox" style="width:auto"' + (ro ? ' disabled' : '') + (f.privacyTransfer ? ' checked' : '') +
      oc('setDonor(\'privacyTransfer\',this.checked)') + '> □ ' +
      '동의함</label>' +
      (f.privacyTransfer ? '' : '<div class="gate-block mt8">🔒 ' +
        '동의하지 않으면 온라인으로 제출할 수 없습니다 — 서면 신청서로 접수하실 수 있습니다</div>') + '</div></div>';

    /* ⑥-c 처리 위탁 안내 — 동의가 아니라 고지다. 체크박스를 만들지 않는다(대응안 §1-3 다).
         접어 두는 이유: 읽을 사람은 읽고, 동의 흐름은 짧게 유지한다. */
    h += '<div class="card mb12 consent sub"><div class="card-b" style="padding-top:10px;padding-bottom:10px">' +
      '<details open><summary style="cursor:pointer;font-size:14.5px;font-weight:700">처리 위탁 안내 <span class="tag consent-tag">읽기만</span></summary>' +   /* 처음부터 펼친다 (2026-09-11 선미) */
      '<div class="small muted mt8">' +
      (typeof DONOR_ENTRUST_LINES === 'undefined' ? '' :
        DONOR_ENTRUST_LINES.map(function(s){ return esc(s); }).join('<br>')) +
      '</div></details></div></div>';
  }

  /* ⑥-d 법인 후원자 — 서류 속 개인정보 고지 (2026-09-10 선미 · 대응안 §1-4)
       전에는 법인에게 아무 고지도 안 했다(if (!corp) 안에만 카드가 있었다). 법인이 내는
       거래명세서·세금계산서에는 담당자 성명·연락처가 섞여 온다(9/3 실서류 12건 확인).
     ★ '동의' 가 아니라 '확인' 이다 — 법인은 정보주체가 아니라 동의할 수 없다. */
  if (corp){
    h += '<div class="card mb12 consent">' + sec('제출 서류에 포함된 개인정보 <span class="req" style="color:var(--accent-pink)">*</span>', CONSENT_TAG) + '<div class="card-b">' +
      (typeof CORP_DOC_NOTICE_LINES === 'undefined'
        ? '<div class="banner dg mb12"><span class="bi">⛔</span><div>고지 문구를 불러오지 못했습니다 (pdf-form.js) — 새로고침 후에도 이 글이 보이면 담당자에게 알려 주세요</div></div>'
        : '<div class="small muted mb12">' +
          CORP_DOC_NOTICE_LINES.map(function(s){
            return esc(s).replace(/^ {3}/, '&nbsp;&nbsp;&nbsp;');
          }).join('<br>') + '</div>') +
      '<label style="display:flex;gap:8px;align-items:flex-start;font-weight:700;font-size:14.5px">' +
      '<input type="checkbox" style="width:auto;margin-top:2px"' + (ro ? ' disabled' : '') + (f.corpAck ? ' checked' : '') +
      oc('setDonor(\'corpAck\',this.checked)') + '><span>' +
      '위 내용을 확인했으며, 제출 서류에 포함된 개인정보에 대하여 해당 정보주체의 동의를 받았거나 제공할 권한이 있음을 확인합니다</span></label>' +
      (f.corpAck ? '' : '<div class="gate-block mt8">🔒 ' +
        '확인하지 않으면 제출할 수 없습니다</div>') + '</div></div>';
  }

  /* ⑥-2 기부자 연령 — 법인 외 · 만 14세 미만이면 법정대리인 동의 필요 (PRD 입력항목 '만14세 여부' · 부록 A — 팀3) */
  if (!corp){
    var u14 = !!f.under14;
    h += '<div class="card mb12">' + sec('기부자 연령 확인', '<span class="tag">법정대리인 동의 판단</span>') + '<div class="card-b form-dense">' +
      '<div class="field"><label>만 14세 미만 여부</label>' +
      '<div class="seg" style="width:100%">' +
      [['해당 없음(만 14세 이상)', false], ['만 14세 미만', true]].map(function(o){
        return '<button class="' + (u14 === o[1] ? 'on' : '') + '"' + (ro ? ' disabled' : ' onclick="setDonor(\'under14\',' + o[1] + ')"') +
          ' style="flex:1">' + o[0] + '</button>';
      }).join('') + '</div></div>' +
      (u14
        /* 근거: 부록 A · 개인정보보호법 §22 — 동의서는 담당자가 따로 받는다 */
        ? '<div class="banner warn"><span class="bi">👪</span><div><b>만 14세 미만은 법정대리인 동의가 필요합니다.</b><br>동의서는 담당자가 따로 받습니다.</div></div>' +
          '<label style="display:flex;gap:8px;align-items:center;font-weight:700;font-size:14.5px;margin-top:10px">' +
          '<input type="checkbox" style="width:auto"' + (ro ? ' disabled' : '') + (f.guardian ? ' checked' : '') +
          (ro ? '' : ' onchange="setDonor(\'guardian\',this.checked)"') + '> 법정대리인 동의를 받았습니다</label>' +
          (f.guardian ? '' : '<div class="gate-block mt8">🔒 법정대리인 동의 없이는 제출할 수 없습니다</div>') +
          /* 법정대리인 성명·휴대전화·관계 — 양식(법인외 신청서 하단 표)의 칸. 신청서 PDF 에만 찍힌다 */
          '<div class="form-dense mt12">' +
          inp('guardianName', '법정대리인 성명 <span class="req">*</span>', '') +
          inp('guardianPhone', '법정대리인 휴대전화 <span class="req">*</span>', '010-0000-0000') +
          inp('guardianRelation', '아동과의 관계 <span class="req">*</span>', '예: 모, 부') + '</div>'
        : '') +
      '</div></div>';
  }

  /* ⑦ 증빙 파일 — 체크리스트 항목별 업로드 슬롯 (칸 = 체크리스트 항목) */
  var slots = donorSlots();
  var filledN = slots.filter(function(it){ return slotFiles(it.key).length; }).length;
  var slotRow = function(it, optional){
    var names = slotFiles(it.key);
    var has = names.length > 0;
    return '<div class="item-card ' + (has ? 'st-done' : (optional ? '' : 'st-miss')) + '" style="margin-bottom:10px">' +
      '<div class="item-head">' +
      (optional ? '<span class="chk">＋</span>'
                : (has ? '<span class="chk on">✓</span>' : '<span class="chk miss">✕</span>')) +
      '<b>' + esc(it.n) + '</b>' +
      (optional ? '<span class="pill neu"><span class="pd"></span>선택</span>'
                : '<span class="pill ' + (has ? 'ok' : 'dg') + '"><span class="pd"></span>' + (has ? '첨부됨 ' + names.length + '건' : '첨부 필요') + '</span>') +
      '</div>' +
      (it.note ? '<div class="item-meta">' + esc(it.note) + '</div>' : '') +
      /* ★ 지침 근거 딱지는 뺐다 (2026-09-05 선미 · 문구 규칙 2번) —
           받는 사람이 후원자다. '기관 업무지침 · 물품사진' 는 무엇을 올려야 하는지 알려주지 않는다.
           서류명(it.n)과 무엇을 올리나(it.note)면 충분하고 둘 다 위에 있다. */
      names.map(function(fid, i){
        var m = fileMeta(fid);
        return '<div class="doc-row"><div class="di">' + (fileKind(fid) === 'image' ? '🖼' : '📎') + '</div>' +
          '<div style="flex:1"><b>' + esc(m.name) + '</b>' +
          '<small>' + (m.demo ? '데모 항목 — 실제 파일 없음' : humanSize(m.size) + ' · 업로드 원본') + '</small></div>' +
          '<div class="st"><button class="btn ghost sm" onclick="openViewer(' + esc(JSON.stringify(names)) + ',' + i + ')">🔍 보기</button>' +
          (ro ? '' : ' <button class="btn ghost sm" onclick="rmDonorFile(\'' + esc(it.key) + '\',' + i + ')">삭제</button>') +
          '</div></div>';
      }).join('') +
      (ro ? (has ? '' : '<div class="item-meta">첨부 없음</div>')
          : '<div class="row mt8" style="gap:7px;align-items:center">' +
            '<label class="btn pri sm" style="cursor:pointer;margin:0">📎 ' + (has ? '파일 더 올리기' : '파일 올리기') +
            '<input type="file" multiple accept="' + UPLOAD_ACCEPT + '" style="display:none"' +
            ' onchange="pickFiles(\'' + esc(it.key) + '\',this.files)"></label>' +
            '<span class="small muted slot-fmt">PDF·PNG·JPG·JPEG·WEBP · 10MB</span>' +
            demoOnly('<button class="btn ghost sm" onclick="addDemoFile(\'' + esc(it.key) + '\')">데모 항목 추가</button>') +
            '</div>') +
      '</div>';
  };

  h += '<div class="card mb12">' + sec('증빙 파일 첨부', '<span class="tag">' + filledN + ' / ' + slots.length + '항목</span>') + '<div class="card-b">' +
    /* ★ 올릴 수 있는 형식을 모든 유형의 신청서에 (2026-09-11 승희) — 전에는 배분처 폼에만 있었다 */
    '<div class="banner info mb12"><span class="bi">📎</span><div><b>올릴 수 있는 파일</b> — PDF · PNG · JPG · JPEG · WEBP, 한 파일 10MB 이하. 한글·워드 문서는 PDF 로 저장해서 올려 주세요.</div></div>' +
    /* 칸은 담당자 지정 유형이 만든다 · 서류별 칸이라 어떤 파일이 어떤 서류인지 그대로 기록된다 — 설명은 뺐다 (문구 규칙 9/5) */
    '<div class="small muted mb12">한 칸에 여러 장을 올릴 수 있습니다. ' +
    /* 9/4 의 "서명/인감 중 고른다" 문구는 9/10 재설계(법인은 언제나 직인) 뒤에도 남아 있던 옛말이었다 — 한 줄로 (2026-09-11) */
    (corp
      ? '법인은 「법인인감(직인) 날인 이미지」 칸이 필수입니다.'
      : '신청서는 위 폼으로 대신합니다.') +
    '</div>' +
    (slots.length ? slots.map(function(it){ return slotRow(it, false); }).join('')
                  : '<div class="small muted mb12">첨부가 필요한 서류가 없습니다</div>') +
    slotRow({key:'_etc', n:'기타 첨부 (선택)', note:'', basis:''}, true) +   /* 설명 문구 삭제 (2026-09-11 선미) */
    '</div></div>';

  /* ⑧ 서명 — 캔버스에 직접 사인.
     ★ 법인만 갈라 그린다 (2026-09-10 재설계) — 법인은 **전자서명을 쓰지 않는다.**
       법인 명의 서류의 효력은 직인에서 나오므로 서명 패드를 그리지 않고,
       위 첨부 칸에 올린 직인 날인 이미지를 여기서 되보여 준다(무엇이 원본 증빙인지 보이게).
       법인 외는 전자서명 하나뿐이다 — 아래 else 가 그대로 맡는다. */
  if (corp){
    var sealId = corpSealFileId(f);
    var sealUrl = sealId ? fileUrl(sealId) : null;
    h += '<div class="card mb12">' + sec('법인인감(직인) 날인', '<span class="tag">' + (sealId ? '날인 확인됨' : '날인 필요') + '</span>') + '<div class="card-b">' +
      /* 설명 배너 삭제 (2026-09-11 선미) — 카드 제목·태그·미리보기가 이미 말한다 */
      '<div class="small muted mb12">위 작성 내용은 사실만을 작성하였음을 아래와 같이 서명합니다.<br>' +
      esc(TODAY.replace(/-/g, '. ')) + ' · 기부법인(명칭): <b>' + esc(f.donorName || '(미입력)') + '</b> (인)</div>' +
      (sealUrl
        ? '<div class="row" style="gap:10px;align-items:center;justify-content:flex-end;' +
          'border:1.5px dashed var(--line);border-radius:10px;background:#fff;padding:12px 16px">' +
          '<span class="small">기부자 (명칭/성명) <b>' + esc(f.donorName || '') + '</b></span>' +
          '<img src="' + esc(sealUrl) + '" alt="법인인감 날인" style="height:52px;max-width:120px;object-fit:contain">' +
          '<span class="small muted">(인)</span></div>'
        : '<div class="mono" style="text-align:center;padding:18px;border:1.5px dashed var(--line);' +
          'border-radius:10px;background:#fff">' +
          (sealId ? '(날인 이미지는 첨부되었습니다 — 이 브라우저에서 미리보기를 열 수 없습니다)'
                  : '(직인 날인 이미지가 아직 없습니다)') + '</div>') +
      /* "직인 날인으로 접수됩니다 — PDF 하단에 찍힙니다" 줄과 "PDF 안에만 찍히며" 는 뺐다 (2026-09-12 선미) — 한 줄만 남긴다 */
      (sealId ? '' : '<div class="gate-block mt8">🔒 위 첨부 칸에 법인인감(직인) 날인 이미지를 올려야 제출됩니다</div>') +
      '<div class="hint">직인 이미지는 AI 검수로 전송하지 않습니다.</div></div></div>';
  } else
  h += '<div class="card mb12">' + sec('서명', '<span class="tag">직접 그려주세요</span>') + '<div class="card-b">' +
    '<div class="small muted mb12">위 작성 내용은 사실만을 작성하였음을 아래와 같이 서명합니다.<br>' +
    esc(TODAY.replace(/-/g, '. ')) + ' · 기부자 (명칭/성명): <b>' + esc(f.donorName || '(미입력)') + '</b> (인)</div>' +
    (ro
      ? (f.signImg
          ? '<img src="' + f.signImg + '" style="width:100%;max-width:300px;border:1.5px dashed var(--line);border-radius:10px;background:#fff">'
          : '<div class="mono" style="text-align:center;padding:18px">(서명란 비어 있음)</div>')
      : '<canvas id="signCanvas" width="600" height="220" style="width:100%;height:110px;border:1.5px dashed var(--line);border-radius:10px;background:#fff;cursor:crosshair;touch-action:none"></canvas>' +
        '<div class="row mt8" style="gap:8px;align-items:center">' +
        '<button class="btn ghost sm" onclick="clearSign()">서명 지우기</button>' +
        '<span class="small ' + (f.signed ? '' : 'muted') + '">' + (f.signed ? '✍ 서명 완료' : '서명란에 사인해 주세요') + '</span></div>') +
    /* 서명 아래 안내문("서명 또는 도장 날인이 없는 신청서는… 공인전자서명이 아니며…")은 뺐다 (2026-09-12 선미).
       규칙 자체는 donorErrors 의 서명 오류문(:218)이 그대로 지킨다 — 화면 문구만 줄였다. */
    '</div></div>';

  /* ⑧ 안내사항 — 9/5 에 접힌 카드로 넣었던 종이 양식 안내 전문은 2026-09-11 선미 결정으로 **각 칸으로 옮겼다**
       (단가 힌트 · 증빙 칸 설명 · 원가명세서 설명 · 기부금영수증 공제 안내). 화면에서는 카드를 그리지 않는다.
       PDF 는 종이 양식 그대로 안내사항 블록을 유지한다(pdf-form.js corpGuideLines · DONOR_GUIDE_LINES). */
  var guideLines = null;
  if (guideLines){
    h += '<details class="card mb12"><summary class="card-h" style="cursor:pointer;list-style:none"><h3>안내사항</h3>' +
      '<span class="tag">펼쳐 보기</span></summary><div class="card-b">' +
      '<div class="small muted" style="line-height:1.7">' +
      guideLines.map(function(s){ return esc(s).replace(/^ {3}/, '&nbsp;&nbsp;&nbsp;'); }).join('<br>') +
      '</div></div></details>';
  }

  h += (errs.length && !done ? errs.map(function(e){
      return '<div class="banner dg mb12"><span class="bi">⛔</span><div>' + esc(e) + '</div></div>'; }).join('') : '') +
    /* 저장 중에는 잠근다 — 두 번 눌러 두 번 저장되는 것을 막는다 (2026-09-06) */
    '<button class="btn pri ph-btn"' + ((pv || done || errs.length || DB.donorSubmitting || DB.presenterFilling) ? ' disabled' : '') +
      ' onclick="submitDonor()">' +
      (DB.donorSubmitting ? '저장하는 중…' : pv ? '제출하기 (미리보기 모드)' : '제출하기') + '</button>' +
    (pv ? '<div class="gate-block mt8">🔒 미리보기에서는 제출할 수 없습니다</div>'
        : (errs.length && !done ? '<div class="gate-block mt8">🔒 확인이 필요한 항목 ' + errs.length + '건 — 모두 채워야 제출됩니다</div>' : ''));
  return h;
}
/* 낸 서류 목록 — "내가 무엇을 냈나" (2026-09-05 선미)
   ★ 개수가 아니라 이름이다. 개수만 보여 주면 빠뜨린 것이 있어도 후원자가 알 수 없다.
   ★ 신청서([S])는 파일이 아니라 **이 화면 자체**가 원본이다 — 그래서 파일명 대신 그렇게 적는다.
   ⚠️ 체크리스트에 있는데 안 낸 항목은 여기 안 나온다. 그런 항목이 있으면 애초에
     donorErrors 가 제출을 막는다(인감 스캔본처럼 조건부인 것만 예외). */
function donorSubmittedDocs(c){
  var rows = (c.checklist || []).filter(function(it){ return it.included; }).map(function(it){
    var ids = (it.r && it.r.fileIds) || [];
    var what = ids.length ? ids.map(fileName).join(' · ')
             : (it.kind === 'S' ? '이 화면으로 작성·서명' : '');
    return what ? '<div class="kv"><span class="muted">' + esc(it.n) + '</span><b>' + esc(what) + '</b></div>' : '';
  }).filter(Boolean);
  var etc = (c.donorEtcIds || []).map(fileName);
  if (etc.length) rows.push('<div class="kv"><span class="muted">그 밖에 낸 것</span><b>' + esc(etc.join(' · ')) + '</b></div>');
  if (!rows.length) return '';
  return '<div class="mt12"><div class="small muted mb8">낸 서류</div>' + rows.join('') + '</div>';
}
function viewDonorDone(){
  var id = DB.donorForm.submittedId;
  var c = id ? getCase(id) : null;
  return demoBadge() +
    '<div class="banner ok mb16"><span class="bi">✅</span><div><b>제출이 완료되었습니다</b><br>' +
    '접수번호 <b>#' + esc(id || '—') + '</b> · 접수일 ' + TODAY + '</div></div>' +
    (c ? '<div class="card mb12"><div class="card-h"><h3>접수 내용</h3></div><div class="card-b">' +
      [['후원자', c.donor + ' (' + c.donorType + ')'], ['품목', c.item],
       ['취득경로', c.acqPath || '—'],
       /* ★ '입고 예정일' 이 아니라 **신청일자**다 (2026-09-05 선미).
            이 칸에 들어가는 값은 후원자가 적은 후원일자다 — 물건이 언제 들어오는지가 아니다.
            라벨이 물류 일정처럼 읽혀서, 후원자가 "내가 그런 걸 적었나" 하게 된다. */
       ['신청일자', c.donation.arriveDate || '—']]
       .concat(c.under14 ? [['법정대리인 동의', c.guardianConsent ? '확인됨 (만 14세 미만)' : '필요']] : []).map(function(kv){
        return '<div class="kv"><span class="muted">' + kv[0] + '</span><b>' + esc(kv[1]) + '</b></div>'; }).join('') +
      /* ★ '필요 서류 N항목' 이 아니라 **낸 서류의 이름**이다 (2026-09-05 선미).
           낸 사람이 확인하고 싶은 것은 "몇 개가 필요했나" 가 아니라 "내가 무엇을 냈나" 다.
           개수만 보여 주면 빠뜨린 것이 있어도 알 수 없다. */
      donorSubmittedDocs(c) +
      '</div></div>' : '') +
    donorPdfNotice();
    /* ★ [신청서 화면으로] 를 뺐다 (2026-09-05 선미) — 누르면 "이 링크는 제출과 함께
         만료되었습니다" 가 나온다. 눌러서 막히는 버튼은 두지 않는다(문구 규칙 9번). */
}

/* ══ [v6] 배분기관 증빙 제출 — 실동작 ══════════════════════════
   후원자 접수 링크와 대칭 구조: 담당자가 건 상세(검수 결과) 하단에서 링크를 발급하고,
   기관은 본인확인(기관 담당자 연락처 뒷 4자리) 후 인수증·배분 물품 사진을 올려 제출한다.
   제출은 수취완료가 아니다(F2) — 담당자가 확인해 수취 처리해야 항목이 확정된다.
   3중 방어도 동일: ① 본인확인 ② 제출 시 링크 폐기 ③ 제출물 재열람 불가. */
function orgLinkCase(){
  var f = DB.orgForm;
  return f.linkCaseId ? getCase(f.linkCaseId) : null;
}
function setOrg(k, v){ if (writeBlocked()) return; DB.orgForm[k] = v; renderAfterInput(); }   /* setDonor 와 같은 이유 */
/* 기관이 올릴 항목 = 확정 체크리스트의 배분 단계 [A] 첨부 (접수 단계의 donorSlots와 대칭) */
/* 기관이 올릴 항목 = 배분 단계 [A] 첨부.
   ★ 링크로 들어왔고 그 링크가 배분처에 묶여 있으면 **자기 몫만** 보여 준다.
     그렇지 않으면 한 기관이 다른 기관의 서류 자리까지 보게 된다 — 버그가 아니라 개인정보 노출이다.
     (요청-기관별-제출링크-20260902.md 범위 3번) */
function orgSlots(c){
  var items = distItems(c).filter(function(it){ return it.kind === 'A'; });
  var only = DB.linkEntry && DB.linkEntry.distId;
  if (!only) return items;
  return items.filter(function(it){ return String(it.distId) === String(only); });
}
var ORG_DEMO_FILE = {dist_photo:'배분물품_사진.jpg', report_dom:'배분결과보고서.pdf'};   /* 인수증은 폼 작성이라 데모 파일이 없다 */
function orgSlotFiles(key){ return DB.orgForm.files[key] || []; }
function addOrgDemoFile(key){
  if (writeBlocked()) return;
  var f = DB.orgForm;
  if (!f.files[key]) f.files[key] = [];
  var base = ORG_DEMO_FILE[key] || '첨부파일.pdf';
  var n = f.files[key].length;
  var name = n ? base.replace(/(\.[^.]+)$/, '_' + (n + 1) + '$1') : base;
  var id = 'f' + (++FILE_SEQ);
  FILES[id] = {id:id, name:name, type:'', size:(210 + n * 53) * 1024, blob:null, demo:true};
  f.files[key].push(id);
  render();
}
function pickOrgFiles(key, fileList){
  if (writeBlocked()) return;
  if (!fileList || !fileList.length) return;
  var f = DB.orgForm;
  if (!f.files[key]) f.files[key] = [];
  /* 버킷이 거절할 형식(docx 등)은 고르는 순간 말한다 — 제출 뒤 조용히 미수취가 되던 것 (#228) */
  var got = registerPickedFiles(fileList);
  f.files[key] = f.files[key].concat(got.ids);
  toastRejected(got.rejected);
  render();
}
function rmOrgFile(key, i){
  if (writeBlocked()) return;
  var arr = DB.orgForm.files[key];
  if (!arr) return;
  arr.splice(i, 1);
  if (!arr.length) delete DB.orgForm.files[key];
  render();
}
/* 결과보고서는 인수증 수령이 어려울 때의 대체자료 — 필수는 인수증·물품 사진 */
function orgSlotRequired(key){ return key !== 'report_dom'; }
/* 인수증(inss)은 파일 첨부가 아니라 폼으로 작성한다 — 실물 인수증 양식과 같은 항목 구성:
   구분(받은 물품)·수량·받은 날짜·수령자명·기관명·수령자 서명. 직인 날인은 전자로 대신할 수 없으므로
   직인이 필요한 기관은 서면 인수증을 재단에 전달하고 담당자가 직접 등록으로 처리한다(법인 후원 접수와 동일). */
/* ★ 링크가 가리키는 배분처 행 — 다기관 건에서 기관명·배분 수량의 **기준** (2026-09-07 선미 · #226 실측)
     전에는 셋 다 c.orgName(= 첫 배분처) 을 썼다. 두 번째 기관 링크를 열면 폼 기관명·인수증 PDF·제출본 payload 에
     전부 첫 기관 이름이 박혔고(#226 우리지역아동센터 인수증에 "초록지역아동센터"), 수량은 건 전체 신고 수량과
     비교해 정상 제출(8/10)이 "불일치" 로 찍혔다.
   c.dists 는 DB 행(org_name·qty) 이거나 데모 행(orgName·qty) 이다 — 둘 다 읽는다. 없으면 null(단일 기관 옛 구조). */
function orgLinkDist(c){
  var id = (DB.linkEntry && DB.linkEntry.distId) || null;
  if (!id){ var s = orgReceiptSlot(c); id = s && s.distId; }
  if (!id || !c || !c.dists || !c.dists.length) return null;
  var d = c.dists.filter(function(x){ return String(x.id) === String(id); })[0];
  if (!d) return null;
  return {id:d.id, orgName:String(d.org_name || d.orgName || ''), qty:Number(d.qty) || 0};
}
/* 폼 기관명·인수증 PDF·제출본 payload 가 **같은 값**을 쓰게 한다. 배분처를 못 찾으면 옛 값(c.orgName)으로. */
function orgLinkOrgName(c){
  var d = orgLinkDist(c);
  return (d && d.orgName) || (c && c.orgName) || '';
}
/* 수량 대조 기준 — 배분처 행이 있으면 그 배분처 배분 수량, 없으면 건 신고 수량. basis 는 담당자 화면 라벨용 */
function orgExpectedQty(c){
  var d = orgLinkDist(c);
  if (d && d.qty) return {qty:d.qty, basis:'dist'};
  var q = c && c.donation && Number(c.donation.qty);
  return q ? {qty:q, basis:'donation'} : null;
}
function orgReceiptSlot(c){
  return orgSlots(c).filter(function(it){ return it.key === 'inss'; })[0] || null;
}
function orgReceiptPending(c){
  var it = orgReceiptSlot(c);
  if (!it) return false;
  /* ★ uid 를 먼저 쓴다 — key 로 부르면 다기관에서 같은 이름이 여러 개라
     방어①(getItem 다중 일치)이 null 을 준다. 항목을 이미 손에 쥐고 있으면서
     다시 이름으로 찾아 못 찾는 모양이었다(9/1 "3번 기관을 눌렀는데 1번이 처리된다" 와 같은 자리). */
  var live = getItem(c.id, it.uid || it.key);
  return !(live && itemStatus(live).code === 'done');
}
function orgErrors(f, c){
  var e = [];
  if (orgReceiptPending(c)){
    if (!String(f.recvQty || '').trim()) e.push('수량을 입력해 주세요 — 실제 인수한 수량입니다');
    if (!f.recvDate) e.push('받은 날짜를 입력해 주세요');
  }
  if (!String(f.receiverName || '').trim()) e.push('담당자명을 입력해 주세요');
  if (orgReceiptPending(c) && !f.signed) e.push('담당자 서명이 없으면 제출할 수 없습니다 — 직인 날인은 서면 인수증으로 재단 담당자에게 전달해 주세요');
  orgSlots(c).forEach(function(it){
    if (it.key === 'inss') return;   /* 인수증은 폼 작성으로 충족 — 파일을 받지 않는다 */
    var live = getItem(c.id, it.uid || it.key);
    var done = live && itemStatus(live).code === 'done';
    if (orgSlotRequired(it.key) && !done && !orgSlotFiles(it.key).length) e.push(it.n + ' 파일을 첨부해 주세요');
  });
  if (!f.confirm) e.push('제출 내용 사실 확인에 체크해 주세요');
  return e;
}
/* 기본값 채우기(데모용) — 후원자 폼의 prefillDonor와 대칭. 서명까지 채워 데모가 멈추지 않게 한다 */
function prefillOrgForm(){
  if (writeBlocked()) return;
  var f = DB.orgForm, c = orgLinkCase(); if (!c) return;
  f.recvQty = f.recvQty || String((c.donation && c.donation.qty) || '');
  f.recvPkg = f.recvPkg || ((c.donation && c.donation.pkg) || '');
  f.recvDate = TODAY;
  f.receiverName = f.receiverName || '김나눔';
  f.signed = true; f.signImg = demoSignImage();
  orgSlots(c).forEach(function(it){
    if (it.key === 'inss') return;
    var live = getItem(c.id, it.uid || it.key);
    if (live && itemStatus(live).code === 'done') return;
    /* 선택 서류(결과보고서)도 채운다 — 데모가 완결까지 막힘 없이 이어지게 */
    if (!orgSlotFiles(it.key).length) addOrgDemoFile(it.key);
  });
  f.confirm = true;
  render();
}
function viewOrgSubmit(pv, caseIdOverride){
  var cid = caseIdOverride || DB.orgForm.linkCaseId;
  var c = getCase(cid);
  if (!c) return '<div class="empty">건을 찾을 수 없습니다</div>';
  var f = DB.orgForm, ro = !!pv;
  var slots = orgSlots(c);
  /* 받을 증빙이 남아 있지 않으면 폼 대신 안내 — 빈 제출이 만들어지는 것을 막는다 */
  if (!distPendingItems(c).length){
    return demoBadge() +
      '<div class="lock-box"><div class="lk">✅</div>' +
      '<div class="page-t">제출할 증빙이 없습니다</div>' +
      '<div class="page-d">#' + esc(c.id) + ' · ' + esc(c.item) + '</div></div>' +
      '<div class="banner ok mb12"><span class="bi">📎</span><div><b>모든 배분 증빙이 확인되었습니다.</b> 더 낼 서류가 없습니다.</div></div>';
  }
  var errs = ro ? [] : orgErrors(f, c);
  var oc = function(js){ return ro ? '' : ' onchange="' + js + '"'; };
  var inssIt = orgReceiptSlot(c);
  var inssPending = orgReceiptPending(c);
  var fileSlots = slots.filter(function(it){ return it.key !== 'inss'; });
  var orgNm = orgLinkOrgName(c);          /* 링크의 배분처 이름 — c.orgName(첫 배분처) 이 아니다 (2026-09-07) */
  var expQ  = orgExpectedQty(c);          /* 수량 힌트 기준 — 배분처 배분 수량 우선 */
  /* 수령자명 — 인수증 폼이 열려 있으면 그 안에, 아니면 첨부 카드에 표시한다 */
  var recvNameField = '<div class="field"><label>담당자명 <span class="req">*</span></label>' +
    '<input type="text"' + (ro ? ' disabled' : '') + ' value="' + esc(f.receiverName || '') +
    '" placeholder="물품을 인수한 담당자 이름"' + oc('setOrg(\'receiverName\',this.value)') + '></div>';
  var h = demoBadge() +
    '<div class="page-t">배분 증빙 제출</div>' +
    '<div class="page-d">#' + esc(c.id) + ' · ' + esc(c.item) + (orgNm ? ' · ' + esc(orgNm) : '') + '</div>' +
    /* 제출 ≠ 수취완료(담당자 확인으로 확정) — 제출 완료 화면(viewOrgDone)이 말한다. 여기선 미리 말하지 않는다 (문구 규칙 9/5) */
    (ro ? '' : demoOnly('<div class="row mb12" style="gap:7px">' +
      '<button class="btn ghost sm" onclick="prefillOrgForm()">기본값 채우기(데모용)</button></div>')) +
    /* ★ 발표자 전용 (2026-09-14) — 후원자 폼과 같은 게이트. presenterFillOrg 참조 */
    (ro ? '' : presenterOnly('<div class="row mb12" style="gap:7px">' +
      '<button class="btn ghost sm" onclick="presenterFillOrg()">배분 증빙 채우기</button></div>')) +
    (DB.presenterFilling ? PRESENTER_WAIT : '');
  /* ① 인수증 — 실물 양식과 같은 항목을 폼으로 작성한다 (파일 업로드 아님) */
  /* 인수증을 쓰는 동안 PDF 부품을 미리 받아 둔다 — 후원자 폼과 같은 이유(정본 24번). 없어도 폼은 그려진다 */
  if (inssIt && inssPending && !ro && typeof preloadPdfLibs === 'function') preloadPdfLibs();
  if (inssIt){
    h += '<div class="card mb12"><div class="card-h"><h3>📄 ' + esc(inssIt.n) + ' 작성</h3>' +
      '</div><div class="card-b form-dense">' +
      (inssPending
        ? '<div class="field"><label>품목</label>' +
            '<input type="text" disabled value="' + esc((c.donation && c.donation.itemName) || c.item) + '"></div>' +
          /* 수량은 후원자 신청 폼과 같은 낱개 기준 — 신고 수량·배분 수량과 같은 기준으로 대조한다 */
          '<div class="field"><label>수량(낱개) <span class="req">*</span></label>' +
            '<input type="text" inputmode="numeric"' + (ro ? ' disabled' : '') + ' value="' + esc(f.recvQty || '') +
            '" placeholder="예: 400"' + oc('setOrg(\'recvQty\',this.value)') + '>' +
            '<div class="hint">실제 인수한 수량을 적어 주세요.</div>' +   /* 담당자가 배분 수량과 대조하는 기준값 */
            /* 기준 수량과 다르면 미리 알려준다 — 파손 등 정당한 사유가 있을 수 있어 제출은 막지 않는다.
               ★ 기준은 **이 배분처의 배분 수량**이다(다기관). 건 전체 신고 수량과 비교하면 정상 제출이 늘 "다르다" 가 된다 (2026-09-07) */
            (expQ && Number(f.recvQty) && Number(f.recvQty) !== expQ.qty
              ? '<div class="hint" style="color:var(--warn)">' + (expQ.basis === 'dist' ? '이 기관 배분 수량 ' : '신청서 수량 ') + esc(String(expQ.qty)) +
                '과 다릅니다. 실제 수량이 맞으면 그대로 제출하세요.</div>'
              : '') + '</div>' +
          '<div class="field"><label>포장 단위 (선택)</label>' +
            '<input type="text"' + (ro ? ' disabled' : '') + ' value="' + esc(f.recvPkg || '') +
            '" placeholder="예: 5박스"' + oc('setOrg(\'recvPkg\',this.value)') + '></div>' +   /* 검수 대조에는 쓰지 않는다 · '참고용' 힌트는 뺌 (9/10) */
          '<div class="field"><label>받은 날짜 <span class="req">*</span></label>' +
            '<input type="date"' + (ro ? ' disabled' : '') + ' value="' + esc(f.recvDate || '') +
            '"' + oc('setOrg(\'recvDate\',this.value)') + '>' +
            '<div class="hint">배분일자는 인수증 일자와 동일하게 작성해주세요.</div></div>' +
          recvNameField +
          '<div class="field"><label>기관명</label>' +
            '<input type="text" disabled value="' + esc(orgNm) + '"></div>' +
          /* 인수증 PDF 와 같은 다짐 문구를 폼에도 (2026-09-12 선미) — 문구는 pdf-form.js RECEIPT_NOTE_LINES 하나에서 온다 */
          '<div class="small muted mb12">상기 내용과 같이 후원물품을 정히 인수함.' +
          (typeof RECEIPT_NOTE_LINES !== 'undefined'
            ? '<br><b style="color:var(--accent-pink)">' + esc(RECEIPT_NOTE_LINES.join(' ')) + '</b>' : '') + '</div>' +
          '<div class="field"><label>담당자 서명 <span class="req">*</span></label>' +
          (ro
            ? (f.signImg
                ? '<img src="' + f.signImg + '" style="width:100%;max-width:300px;border:1.5px dashed var(--line);border-radius:10px;background:#fff">'
                : '<div class="mono" style="text-align:center;padding:18px">(서명란 비어 있음)</div>')
            : '<canvas id="orgSignCanvas" width="600" height="220" style="width:100%;height:110px;border:1.5px dashed var(--line);border-radius:10px;background:#fff;cursor:crosshair;touch-action:none"></canvas>' +
              '<div class="row mt8" style="gap:8px;align-items:center">' +
              '<button class="btn ghost sm" onclick="clearOrgSign()">서명 지우기</button>' +
              '<span class="small ' + (f.signed ? '' : 'muted') + '">' +
              (f.signed ? '✍ 서명 완료' : '마우스나 손가락으로 서명란에 사인해 주세요') + '</span></div>') +
          '</div>'   /* 직인 안내 힌트는 뺌 (9/10) — 규칙은 donorErrors 의 서명 오류문에 남아 있다 */
        : '<div class="hint">이미 수취 확인된 항목입니다.</div>') +
      '</div></div>';
  }
  /* ② 나머지 증빙(배분 물품 사진·결과보고서)은 파일 첨부 */
  h += '<div class="card mb12"><div class="card-b form-dense">' +
    (inssPending ? '' : recvNameField) +
    fileSlots.map(function(it){
      var live = getItem(c.id, it.uid || it.key);
      var done = live && itemStatus(live).code === 'done';
      var files = orgSlotFiles(it.key);
      return '<div class="field"><label>' + esc(it.n) +
        (done ? '' : (orgSlotRequired(it.key)
          ? ' <span class="req">*</span>'
          : ' <span class="small muted">선택</span>')) + '</label>' +
        (done
          ? '<div class="hint">이미 수취 확인된 항목입니다.</div>'
          : files.map(function(id, i){
              return '<div class="row" style="gap:7px;align-items:center;margin-bottom:4px"><span class="small">📎 ' + esc(fileName(id)) + '</span>' +
                (ro ? '' : '<button class="btn ghost sm" onclick="rmOrgFile(\'' + it.key + '\',' + i + ')">삭제</button>') + '</div>';
            }).join('') +
            (ro
              ? '<div class="row" style="gap:7px;align-items:center"><button class="btn ghost sm" disabled>파일 첨부</button><span class="small muted">미리보기</span></div>'
              : '<div class="row" style="gap:7px;align-items:center">' +
                /* ★ 데모 모드에서만 — 실 DB 에서는 이름뿐인 가짜 파일이 조용히 버려져 "제출 완료" 뒤 미수취가 된다 (#226 실측 · 후원자 폼 946행과 같은 감싸기) */
                demoOnly('<button class="btn ghost sm" onclick="addOrgDemoFile(\'' + it.key + '\')">파일 첨부 (데모)</button>') +
                '<label class="btn ghost sm" style="cursor:pointer">' + (isDemoMode() ? '실제 파일 선택' : '파일 올리기') + '<input type="file" multiple accept="' + UPLOAD_ACCEPT + '" style="display:none" onchange="pickOrgFiles(\'' + it.key + '\', this.files)"></label>' +
                '<span class="small muted">PDF·PNG·JPG·JPEG·WEBP · 10MB</span>' +
                '</div>') +
            '<div class="hint">' + esc(it.note || '') + '</div>') +
        '</div>';
    }).join('') +
    /* ★ AI·국외 이전 고지 (2026-11-10 오픈소스 점검 §4-1) — 배분기관 화면에는 이 안내가 없었다.
         배분 물품 사진·결과보고서도 담당자가 검수를 실행하면 신청서 외 첨부와 같이 Google 로 간다
         (api.js extractableItems — 인수증은 폼 작성이라 파일이 없다). 배분 사진에는 아동 얼굴이 담길 수 있다.
         고지만 한다 — 동의 체크박스는 만들지 않는다. 문구는 법률 검토 후 확정(docs/동의문구.md ④). */
    (fileSlots.length
      ? '<div class="hint mb12">올리신 배분 물품 사진·결과보고서는 담당자가 AI 검수를 실행할 때 판독을 위해 Google LLC(미국)로 전송됩니다. ' +
        '사진·서류에 담긴 얼굴·이름·연락처 등은 가리지 않고 그대로 전송되니, 아동 얼굴이나 개인정보가 드러나지 않게 찍거나 가려서 올려 주세요.</div>'
      : '') +
    '<label class="row" style="gap:8px;align-items:flex-start;cursor:pointer"><input type="checkbox"' +
      (f.confirm ? ' checked' : '') + (ro ? ' disabled' : '') + oc('setOrg(\'confirm\',this.checked)') + '>' +
      '<span class="small">작성한 인수증과 첨부한 사진이 실제 인수한 물품과 같음을 확인합니다</span></label>' +
    '</div></div>' +
    (ro ? '<button class="btn pri ph-btn" disabled>제출하기</button>' +
          '<div class="gate-block mt8">🔎 미리보기 — 제출되지 않습니다</div>'
        : '<button class="btn pri ph-btn"' + (errs.length ? ' disabled' : '') + ' onclick="submitOrg()">제출하기</button>' +
          (errs.length ? '<div class="hint" style="color:var(--warn);margin-top:6px">' + esc(errs[0]) + '</div>' : '') +
          '<div class="hint mt8">제출하면 이 링크로는 화면이 다시 열리지 않습니다. 링크 주소는 받은 분만 보관해 주세요.</div>');
  return h;
}
function submitOrg(){
  if (writeBlocked()) return;
  if (DB.presenterFilling){ DB.toast = {msg:'시연 파일을 준비하는 중입니다 — 잠시 뒤 다시 눌러 주세요'}; renderToast(); return; }
  var f = DB.orgForm, c = orgLinkCase();
  /* 링크로 들어왔으면 그것이 진실이다 — c.orgLink 는 '건당 1장' 이던 옛 구조라 이제 안 만들어진다 */
  if (!c || (!DB.linkEntry && !c.orgLink)){ DB.toast = {msg:'담당자가 발급한 증빙 제출 링크가 없습니다'}; renderToast(); return; }
  if (f.submittedId){ DB.toast = {msg:'이미 제출된 링크입니다 — 재제출은 담당자에게 재발급을 요청해 주세요'}; renderToast(); return; }
  var errs = orgErrors(f, c);
  if (errs.length){ DB.toast = {msg:errs[0]}; renderToast(); return; }
  /* 인수증(inss) — 폼 입력값 + 수령자 전자서명이 원본이다. 파일을 받지 않는다 */
  var inssIt = orgReceiptSlot(c);
  if (inssIt){
    var inssLive = getItem(c.id, inssIt.uid || inssIt.key);
    /* 기관명 — 이 인수증이 묶인 배분처의 이름. c.orgName 은 옛 '건당 1기관' 구조의 잔재(= 첫 배분처)라 다기관에서 틀린다.
       화면 스냅샷·제출본 payload·PDF 세 곳이 **같은 값**을 쓴다 (2026-09-07 · #226) */
    var rcOrg = orgLinkOrgName(c) || null;
    if (inssLive && itemStatus(inssLive).code !== 'done'){
      inssLive.r.orgUpload = {status:'uploaded', date:TODAY,
        receipt:{item:(c.donation && c.donation.itemName) || c.item, qty:f.recvQty, pkg:f.recvPkg,
                 recvDate:f.recvDate, receiver:f.receiverName, org:rcOrg, signImg:f.signImg}};
      inssLive.r.file = inssIt.n + ' 폼 작성 · 담당자 전자서명 (기관 제출 · 확인 대기)';
      inssLive.r.receiverName = f.receiverName;
      /* 수량 대조 — 폼 값이라 제출 즉시 규칙(코드)으로 대조한다(AI 아님). 불일치면 담당자
         사유 해소 경로로 보낸다(금액 대조와 동일 철학).
         ★ 기준은 이 배분처의 **배분 수량**(distribution.qty) — 건 전체 신고 수량이 아니다. 배분 합계 = 신고 수량은 E7 이 따로 본다.
           배분처 행이 없는 옛 구조에서만 신고 수량으로 떨어진다 (2026-09-07 · #226 초록 8/10 이 불일치로 찍히던 것) */
      var expInfo = orgExpectedQty(c);
      var expQty = expInfo && expInfo.qty;
      var recvQty = Number(f.recvQty);
      if (expQty && recvQty && recvQty !== expQty){
        inssLive.r.qtyFlag = {recv:recvQty, expected:expQty, basis:expInfo.basis};
      } else {
        delete inssLive.r.qtyFlag;
      }
      /* ★ 인수증도 제출본이다 — 기관이 폼으로 작성하고 수령자가 전자서명한 원본이다.
           donation 에는 이 값이 안 들어간다(배분처 수량은 distribution 쪽). 여기 남겨야
           "기관이 몇 개 받았다고 적었나" 가 나중에도 남는다.
         ⚠️ 수령자 이름(receiverName)은 payload 에 넣지 않는다 — 개인정보다.
            서명 이미지(signImg)도 넣지 않는다. 서명 '여부' 만 남긴다. */
      /* 기관명은 위 rcOrg — 전에는 여기서 d.orgName 을 읽었는데 DB 행은 org_name 이라 늘 실패해 첫 배분처로 떨어졌다 (2026-09-07) */
      var rcItem = (c.donation && c.donation.itemName) || c.item;
      var jobRcForm = saveFormSubmission(c, {
        formType: '인수증',
        distId:   inssLive.distId || null,
        payload:  {'품목':rcItem,
                   '수량':recvQty || null, '단위':f.recvPkg || null,
                   '수령일자':f.recvDate || null, '기관명':rcOrg},
        signed:   !!f.signImg,
        role:     'org',
        pdfKey:   null      /* ★ 주소 칸은 빈칸으로 먼저 — PDF 가 되면 채운다(신청서와 같은 순서 · 9/4 결정) */
      }).catch(function(err){
        console.error('[DB] 인수증 제출본 저장 실패:', err);
        DB.caseSaveErr = DB.caseSaveErr || {};
        DB.caseSaveErr[c.id] = {msg:'기관 인수증 제출본이 저장되지 않았습니다 — ' + ((err && err.message) || String(err)),
                                fields:null};
        return null;
      });
      /* ★ 인수증 PDF — 수령자명·서명이 저장되는 **유일한 곳** (2026-09-05). 값은 지금 스냅샷으로 뜬다(orgReceiptPdfData 화이트리스트).
           신청서와 같은 사슬(runDonorFormPdf): 만들기는 지금, 올리기는 제출본 줄이 생긴 뒤. 실패해도 제출본(payload)은 남는다. */
      runOrgReceiptPdf(c, orgReceiptPdfData(f, c, {submittedAt:new Date().toISOString(), distId:inssLive.distId || null,
                                                    item:rcItem, org:rcOrg || ''}), jobRcForm);
    }
  }
  orgSlots(c).forEach(function(it){
    if (it.key === 'inss') return;   /* 위에서 폼으로 처리 */
    var files = orgSlotFiles(it.key);
    if (!files.length) return;
    var live = getItem(c.id, it.uid || it.key);
    if (!live || itemStatus(live).code === 'done') return;   /* 수취 확인된 항목은 덮어쓰지 않는다 */
    live.r.orgUpload = {status:'uploaded', date:TODAY, fileName:fileName(files[0])};
    live.r.fileIds = files.slice();   /* 검수 화면 원본 보기(파일 칩)용 — 후원자 제출과 동일 경로 */
    live.r.file = files.map(fileName).join(' · ') + ' (기관 제출 · 확인 대기)';
    live.r.receiverName = f.receiverName;
  });
  /* ★ 배분처 제출분도 파일 저장소로 올린다 (2026-09-01 유진).
     후원자 제출과 같은 이유다 — 지금까지는 브라우저 메모리에만 있어서
     담당자가 새로고침하면 인수증 사진이 사라졌다.
     ⚠️ 인수증(inss)은 파일이 아니라 폼이라 여기 대상이 아니다 — 위에서 따로 처리한다. */
  uploadOrgFiles(c);

  /* [3중 방어 ②·③] 제출과 동시에 링크 폐기 */
  if (c.orgLink){ c.orgLink.submitted = true; c.orgLink.submittedAt = TODAY; }   /* 옛 구조가 남아 있을 때만 */
  /* 새 증빙이 들어왔으므로 검수 실행 게이트를 다시 연다 — 담당자가 검수를 실행해야
     새 증빙 대조 결과(수량 대조 등)가 노출된다 ("결과는 실행 후 노출" 원칙을 배분 단계에도 적용) */
  delete c.inspectedAt;
  if (DB.inspectCaseId === c.id){ DB.inspectCaseId = null; DB.inspectResult = null; }
  f.submittedId = c.id;
  closeLinkAfterSubmit();   /* 링크로 들어왔으면 그 링크를 폐기한다 */
  DB.demo.subs[c.id] = '배분기관 증빙 제출됨 — 담당자 확인 후 수취 처리';
  DB.screen = 'orgDone';
  DB.toast = {msg:'#' + c.id + ' 배분 증빙이 제출되었습니다 — 담당자 확인 후 수취 처리됩니다'};
  render();
}
function renderOrgPhone(){
  if (DB.screen === 'orgDone') return viewOrgDone();
  var entry = DB.linkEntry;
  var c = orgLinkCase();
  /* ★ 링크로 들어왔는데 건을 못 찾으면 이유와 함께 잠근다 (enterByLinkToken 이 이미 잠그지만 이중 방어) */
  if (entry && !c) return viewLinkLocked();
  /* 링크로 들어오지 않았고 옛 구조도 없을 때만 "링크로만 열 수 있습니다" 안내다.
     ⚠️ 이 조건에 entry 를 안 넣으면 **링크로 들어왔는데 "링크로만 열 수 있습니다"** 가 뜬다
       (연수 발견 9/3 · 74b5520 이 발급을 access_link 로 옮기면서 c.orgLink 를 아무도 안 만든다). */
  if (!entry && (!c || !c.orgLink)){
    return demoBadge() +
      '<div class="lock-box"><div class="lk">🔗</div>' +
      '<div class="page-t">증빙 제출 링크로만 열 수 있습니다</div>' +
      '<div class="page-d">담당자가 보낸 링크로 열립니다</div></div>';
      /* 담당자가 건 상세에서 발급 → 기관이 여기서 인수증·사진 제출 — 흐름 설명 배너는 뺐다 (문구 규칙 9/5) */
  }
  if (DB.orgForm.submittedId) return viewOrgVoided();
  /* 2026-09-02 · 위 줄은 브라우저 세션 메모리만 본다 — 제출을 마친 뒤 새 세션·다른 기기에서
     같은 링크를 열면 본인확인만 통과하면 제출 폼이 다시 열렸다(연수 재현).
     화면에는 "제출과 동시에 폐기되는 1회용 링크"라고 쓰여 있으므로, 세션이 아니라
     건에 남은 값으로 판정한다. 한 브라우저로만 시연해서 지금까지 안 보였다. */
  if (entry ? !!entry.link[COL.accessLink.usedAt] : !!c.orgLink.submitted) return viewOrgVoided();
  /* 링크로 들어왔으면 DB(verify_hint)를, 아니면 종전의 세션 값을 본다 */
  if (needVerifyGate(c.orgLink, 'verifyLast4') && !DB.orgForm.verified) return viewOrgGate(c);
  return viewOrgSubmit(false, c.id);
}
function viewOrgGate(c){
  var f = DB.orgForm, locked = (f.verifyTries || 0) >= 5;
  return demoBadge() +
    '<div class="lock-box"><div class="lk">🔒</div>' +
    '<div class="page-t">본인 확인</div>' +
    '<div class="page-d">재단에 안내한 <b>기관 담당자 연락처 뒷 4자리</b>를 입력해 주세요</div></div>' +
    /* ⚠️ 후원자 게이트와 같은 이유로 유출 방어를 단정하지 않는다 (2026-09-03).
       c.orgLink 는 담을 칸도 코드도 0건이라 후원자 쪽보다 더 짧게 산다. */
    /* "본인 확인을 거쳐야 열린다" 배너는 제목·부제가 이미 말한다 — 뺐다 (문구 규칙 9/5) */
    (locked
      ? '<div class="banner dg mb12"><span class="bi">⛔</span><div><b>확인 5회 실패로 잠겼습니다</b><br>재단 담당자에게 링크 재발급을 요청해 주세요.</div></div>'
      : '<div class="field"><label>연락처 뒷 4자리</label>' +
        '<input type="text" inputmode="numeric" maxlength="4" value="' + esc(f.verifyInput || '') +
        '" placeholder="****" onchange="setOrg(\'verifyInput\',this.value)"></div>' +
        (f.verifyTries ? '<div class="hint" style="color:var(--danger)">일치하지 않습니다 · ' + (5 - f.verifyTries) + '회 남음</div>' : '') +
        '<div class="hint">5번 틀리면 잠깁니다.</div>' +
        '<button class="btn pri ph-btn mt8" onclick="verifyOrg()">확인</button>') +
    /* ★ 본인확인 값은 데모에서만 보여 준다 — 실서비스에서 찍으면 게이트가 무의미해진다 */
    (c.orgLink && c.orgLink.verifyLast4 ? demoOnly('<div class="hint" style="text-align:center;margin-top:10px">데모 · 담당자가 설정한 값 <b>' + esc(c.orgLink.verifyLast4) + '</b></div>') : '');
}
function verifyOrg(){
  if (writeBlocked()) return;
  var f = DB.orgForm, c = orgLinkCase();
  if (!c || (!DB.linkEntry && !c.orgLink)) return;
  if ((f.verifyTries || 0) >= 5){
    DB.toast = {msg:'확인 5회 실패로 잠겼습니다 — 재단 담당자에게 링크 재발급을 요청해 주세요'}; renderToast(); return;
  }
  if (verifyInputMatches(f.verifyInput, c.orgLink && c.orgLink.verifyLast4)){
    f.verified = true; f.verifyTries = 0; f.verifyInput = '';
    DB.toast = {msg:'본인 확인 완료 — 제출 화면을 열었습니다', auto:true}; render(); return;
  }
  f.verifyTries = (f.verifyTries || 0) + 1;
  render();
}
function viewOrgVoided(){
  var id = DB.orgForm.submittedId;
  return demoBadge() +
    '<div class="lock-box"><div class="lk">✅</div>' +
    '<div class="page-t">제출이 완료되었습니다</div>' +
    '<div class="page-d">후원건 <b>#' + esc(id || '—') + '</b></div></div>' +
    '<div class="banner ok mb12"><span class="bi">🔒</span><div><b>이 링크는 제출과 함께 만료되었습니다.</b><br>' +
    '수정은 재단 담당자에게 문의하세요.</div></div>' +
    '<button class="btn ghost ph-btn" onclick="go(\'orgDone\')">제출 결과 보기</button>';
}
function viewOrgDone(){
  var id = DB.orgForm.submittedId;
  var c = id ? getCase(id) : null;
  return demoBadge() +
    '<div class="lock-box"><div class="lk">🎉</div>' +
    '<div class="page-t">배분 증빙 제출 완료</div>' +
    '<div class="page-d">후원건 <b>#' + esc(id || '—') + '</b>' + (c ? ' · ' + esc(c.item) : '') + '</div></div>' +
    '<div class="banner ok mb12"><span class="bi">📎</span><div><b>재단 담당자가 확인한 뒤 수취 처리됩니다.</b></div></div>' +
    '';
}
/* 링크로 들어와 제출을 마쳤으면 그 링크를 폐기한다.
   ★ 화면에 "제출과 동시에 폐기되는 1회용 링크" 라고 적어 두었으므로 DB 에도 그렇게 남겨야 한다.
     `markAccessLinkUsed` 는 `used_at` 을 찍으면서 **수신 연락처를 지운다**(팀 결정 8/28 §2-⑦ C안).
   ⚠️ 실패해도 제출은 이미 끝났다 — 되돌리지 않고 화면에 세운다(조용히 넘기지 않는다). */
function closeLinkAfterSubmit(){
  var e = DB.linkEntry;
  if (!e || !e.link) return;
  var id = e.link[COL.accessLink.id];
  if (!id) return;
  markAccessLinkUsed(id).then(function(){
    e.state = 'used';
  }).catch(function(err){
    console.error('[링크] 제출 뒤 폐기에 실패했습니다 — 같은 주소가 다시 열릴 수 있습니다:',
                  (err && err.message) || err);
  });
}

/* ── 걷어냄 (2026-09-03 선미) ─────────────────────────────────────────
   옛 증빙 링크 헬퍼 넷을 지웠다 — orgLinkUrl · setOrgVerifyDraft · issueOrgLink · copyOrgLink.
   ★ 이들은 `c.orgLink` 라는 **건당 1장** 구조를 쓰던 것이다.
     연수 `74b5520` 이 발급을 `access_link`(배분처마다 1장)로 옮기면서
     `issueOrgLinkFor` · `copyOrgLinkFor` 로 대체됐고, 옛 넷은 호출처가 0곳이 됐다.
     주소도 `/o/<건번호>` 를 만들었는데, 그 경로는 라우팅이 없어 `404.html` 로 떨어진다.
   ⚠️ `renderOrgPhone` 의 `c.orgLink` 분기는 **일부러 남겼다.** 이제 아무도 그 값을 만들지 않으므로
     늘 거짓이지만, 링크 없이 열었을 때(담당자 대신 등록) 안내를 내는 자리를 겸한다.
     검사 `smoke-test-link-entry.mjs` ⑩ 이 그 경로를 지킨다. */

/* ══ 주소로 들어오기 — `?t=<토큰>` ══════════════════════════════════════
   ★ 이 자리가 없으면 링크는 링크가 아니다.
     9/3 까지 `URLSearchParams` 를 읽는 코드가 **0건**이었다(정본 20번).
     담당자가 주소를 복사해 줘도 붙여넣어 열 수 없었고, 본인확인은 그 브라우저 세션
     안에서만 유효했다 — 즉 "URL 만으로는 못 연다" 는 문구가 사실이 아니었다.

   ★ 이제 본인확인은 DB(`access_link.verify_hint`)를 본다.
     토큰을 섞어 해시했으므로 DB 를 통째로 봐도 4자리를 되찾을 수 없고,
     링크 없이 1만 개를 대입할 수도 없다(유진 `db.js` 설계).
     그래서 **다른 기기·새 세션에서 열어도 같게 동작한다.**

   ⚠️ 'ok' 가 아닌 이유를 한 덩어리로 뭉치지 않는다 — 무효화와 만료는 담당자가 할 일이 다르다.
     `LINK_STATE_TEXT[state]` 를 그대로 보여 준다. */
var LINK_PARAM = 't';

function linkTokenFromUrl(){
  /* file:// 이나 구형 브라우저에서 던질 수 있다 — 던지면 '링크 없음' 으로 본다 */
  try { return new URLSearchParams(location.search).get(LINK_PARAM) || null; }
  catch (e) { return null; }
}

/* 링크를 열 수 없을 때 — 조용히 통과시키지 않고 이유와 함께 잠근다 */
function lockLinkEntry(state){
  DB.linkEntry = DB.linkEntry || {};
  DB.linkEntry.state = state;
  DB.role = 'donor'; setBodyRole('donor');
  return true;
}

/* 부팅 때 한 번 — `loadCasesFromSupabase()` 뒤에 부른다(링크가 가리키는 건이 먼저 있어야 한다).
   돌려주는 값: 주소에 토큰이 있었으면 true (그때는 화면이 링크에 묶인다) */
function enterByLinkToken(){
  var token = linkTokenFromUrl();
  if (!token) return Promise.resolve(false);
  return findAccessLink(token).then(function(link){
    var K = COL.accessLink, st = accessLinkState(link);
    DB.linkEntry = {token:token, link:link, state:st, caseId:null, distId:null};
    if (st !== 'ok') return lockLinkEntry(st);

    /* 링크는 살아 있는데 가리키는 건이 없다 — 이것도 잠근다.
       ★ 여기서 조용히 넘기면 "링크는 열리는데 아무 건에도 안 묶인 폼" 이 뜬다. */
    var c = (DB.cases || []).filter(function(x){ return x.dbId === link[K.donationId]; })[0];
    if (!c) return lockLinkEntry('none');

    var isOrg = (link[K.purpose] === 'dist_proof');
    DB.linkEntry.caseId = c.id;
    DB.linkEntry.distId = link[K.distributionId] || null;   /* 값이 있으면 그 배분처 몫만 본다 */
    DB.role = isOrg ? 'org' : 'donor';
    setBodyRole(DB.role);
    /* ★ 화면까지 정해야 한다 — setBodyRole 은 body 클래스만 바꾼다.
         DB.screen 기본값이 'home' 이라 그대로 두면 **홈 대시보드**가 뜬다(연수 발견 9/3).
       ⚠️ 역할만 바꾸고 화면을 안 정하면 '역할 홈'(대시보드)이 뜬다.
         링크로 들어온 사람은 홈이 아니라 **그 링크의 폼**으로 가야 한다. */
    DB.screen = isOrg ? 'orgForm' : 'donorForm';

    var f = isOrg ? DB.orgForm : DB.donorForm;
    f.linkCaseId = c.id;
    f.verified = false; f.verifyInput = ''; f.verifyTries = 0;   /* 링크마다 새로 본인확인 */
    f.submittedId = null;
    return true;
  }).catch(function(err){
    console.error('[링크] 주소로 여는 데 실패했습니다:', (err && err.message) || err);
    return lockLinkEntry('none');
  });
}

/* 링크로 들어온 경우, 본인확인을 걸었는가 — DB 의 해시 유무로 판정한다(세션이 아니다) */
function linkNeedsVerify(){
  var e = DB.linkEntry;
  return !!(e && e.link && e.link[COL.accessLink.verifyHint]);
}

/* 이 게이트를 통과해야 하는가 — 링크로 들어왔으면 DB 기준, 아니면 종전의 데모 기준 */
function needVerifyGate(c, sessionKey){
  if (DB.linkEntry) return linkNeedsVerify();
  return !!(c && c[sessionKey]);
}

/* 입력한 4자리가 맞는가 — 링크로 들어왔으면 토큰을 섞은 해시로 대조한다 */
function verifyInputMatches(input, fallbackValue){
  var v = String(input || '').trim();
  if (DB.linkEntry) return verifyAccessLink(DB.linkEntry.link, DB.linkEntry.token, v);
  return v === String(fallbackValue);
}

function viewLinkLocked(){
  var e = DB.linkEntry || {};
  return demoBadge() +
    '<div class="lock-box"><div class="lk">🔒</div>' +
    '<div class="page-t">이 링크는 지금 열 수 없습니다</div>' +
    '<div class="page-d">' + esc(LINK_STATE_TEXT[e.state] || LINK_STATE_TEXT.none) + '</div></div>';
    /* 1회용 링크 · 제출 완료/기간 경과/재발급이면 옛 주소가 안 열린다 — 이유는 LINK_STATE_TEXT 가 부제로 말한다. "왜 이렇게 나오나요" 배너는 뺐다 (문구 규칙 9/5) */
}

function renderPhone(){
  /* 주소로 들어왔는데 열 수 없는 링크 — 이유를 그대로 보여 준다 (역할 분기보다 먼저) */
  if (DB.linkEntry && DB.linkEntry.state !== 'ok') return viewLinkLocked();
  if (DB.role === 'org') return renderOrgPhone();   /* [v6] 배분기관 폰 화면 분기 */
  if (DB.screen === 'donorDone') return viewDonorDone();
  var c = linkCase();
  /* [3중 방어 ①·③] 제출된 링크는 폐기 — 재열람해도 폼·입력값을 다시 보여주지 않는다 */
  if (c && DB.donorForm.submittedId) return viewDonorVoided();
  /* [3중 방어 ②] 본인확인 게이트 — 담당자가 설정한 값이 있으면 통과해야 폼에 진입한다 */
  /* 링크로 들어왔으면 DB(verify_hint)를, 아니면 종전의 세션 값을 본다 */
  if (c && needVerifyGate(c, 'verifyLast4') && !DB.donorForm.verified) return viewDonorGate(c);
  return viewDonorForm(false);
}
/* [3중 방어 ②] 본인 확인 — 담당자가 안내한 연락처 뒷 4자리를 알아야 진입한다.
   ⚠️ 'URL만으로는 못 연다' 는 **아직 사실이 아니다**(2026-09-03) — verifyLast4 를 저장하는 코드가 없어
     이 브라우저 세션 안에서만 유효하고, 링크 주소로 여는 경로 자체가 없다(URLSearchParams 0건).
     access_link 가 붙기 전까지 화면 문구도 그렇게 말하지 않는다.
   화면에서의 보호일 뿐 DB 접근통제가 아니다 — DB 정책은 링크 토큰과 만료·무효 여부만 본다(링크 주소가 곧 열쇠).
   5회 잠금도 화면 메모리 값이라 새로고침하면 초기화된다 (오픈소스 점검 §1-4). */
function viewDonorGate(c){
  var f = DB.donorForm, locked = (f.verifyTries || 0) >= 5;
  return demoBadge() +
    '<div class="lock-box"><div class="lk">🔒</div>' +
    '<div class="page-t">본인 확인</div>' +
    '<div class="page-d">담당자에게 안내받은 <b>연락처 뒷 4자리</b>를 입력해 주세요</div></div>' +
    /* ⚠️ 지키지 못하는 것을 지킨다고 쓰지 않는다 (2026-09-03 선미 지시 · 유진 발견).
       전에는 "URL만으로 열리지 않습니다 · 유출되더라도 접근할 수 없습니다" 였는데,
       verifyLast4 가 DB 에 저장되지 않아 **이 브라우저 세션 안에서만** 유효하다.
       게다가 링크 주소로 여는 경로 자체가 아직 없다(URLSearchParams 0건).
       → 유출 방어를 단정하지 않고, **실제로 일어나는 일**만 적는다.
       access_link 가 붙으면 그때 약속을 되살린다. */
    /* "본인 확인을 거쳐야 열린다" 배너는 제목·부제가 이미 말한다 — 뺐다 (문구 규칙 9/5) */
    (locked
      ? '<div class="banner dg mb12"><span class="bi">⛔</span><div><b>확인 5회 실패로 잠겼습니다</b><br>담당자에게 링크 재발송을 요청해 주세요.</div></div>'
      : '<div class="field"><label>연락처 뒷 4자리</label>' +
        '<input type="text" inputmode="numeric" maxlength="4" value="' + esc(f.verifyInput || '') +
        '" placeholder="****" onchange="setDonor(\'verifyInput\',this.value)"></div>' +
        (f.verifyTries ? '<div class="hint" style="color:var(--danger)">일치하지 않습니다 · ' + (5 - f.verifyTries) + '회 남음</div>' : '') +
        '<div class="hint">5번 틀리면 잠깁니다.</div>' +
        '<button class="btn pri ph-btn mt8" onclick="verifyDonor()">확인</button>') +
    /* ★ 본인확인 값은 데모에서만 보여 준다 — 실서비스에서 찍으면 게이트가 무의미해진다 */
    (c.verifyLast4 ? demoOnly('<div class="hint" style="text-align:center;margin-top:10px">데모 · 담당자가 설정한 값 <b>' + esc(c.verifyLast4) + '</b></div>') : '');
}
function verifyDonor(){
  if (writeBlocked()) return;
  var f = DB.donorForm, c = linkCase();
  if (!c) return;
  if ((f.verifyTries || 0) >= 5){
    DB.toast = {msg:'확인 5회 실패로 잠겼습니다 — 담당자에게 링크 재발송을 요청해 주세요'}; renderToast(); return;
  }
  if (verifyInputMatches(f.verifyInput, c.verifyLast4)){
    f.verified = true; f.verifyTries = 0; f.verifyInput = '';
    DB.toast = {msg:'본인 확인 완료 — 신청서를 열었습니다', auto:true}; render(); return;
  }
  f.verifyTries = (f.verifyTries || 0) + 1;
  render();
}
/* [3중 방어 ①·③] 제출 후 링크 폐기 — 재열람해도 폼·입력값을 복원하지 않는다.
   화면에서의 재열람·재사용 차단이다 — DB 에서는 만료·무효화 전까지 토큰이 살아 있어 주소만으로 자기 건을 읽고
   일부 값을 바꿀 수 있다(신청서 PDF 는 로그인 전용이라 열리지 않음). 수정은 담당자를 통해서만 (오픈소스 점검 §1-4). */
function viewDonorVoided(){
  var id = DB.donorForm.submittedId;
  return demoBadge() +
    '<div class="lock-box"><div class="lk">✅</div>' +
    '<div class="page-t">제출이 완료되었습니다</div>' +
    '<div class="page-d">접수번호 <b>#' + esc(id || '—') + '</b></div></div>' +
    '<div class="banner ok mb12"><span class="bi">🔒</span><div><b>이 링크는 제출과 함께 만료되었습니다.</b><br>' +
    /* '수정은 담당자에게 문의하세요' 를 뺐다 (2026-09-05 선미) — 후원자가 고칠 수 있는 것이
       아니고, 고칠 일이 있으면 담당자가 연락한다. 못 하는 일을 안내로 남기지 않는다. */
    '입력한 개인정보는 이 링크로 다시 볼 수 없습니다.</div></div>' +
    '<button class="btn ghost ph-btn" onclick="go(\'donorDone\')">제출 결과 보기</button>';
}

/* ── 미리보기 서브패턴 (선미) — role은 staff 유지 ── */
function openPreview(kind, caseId){ DB.preview = {kind:kind, caseId:caseId || DB.caseId}; render(); }
function closePreview(){ DB.preview = null; render(); }
function viewPreview(){
  var k = DB.preview.kind;
  var donor = (k === 'donor');
  var body = donor ? viewDonorForm(true) : viewOrgSubmit(true, DB.preview.caseId);
  return '<div class="page-head"><h2>🔎 ' + (donor ? '후원자에게 보이는 화면' : '배분기관 제출 화면') + ' 미리보기</h2>' +
    '<p>역할은 <b>담당자 그대로</b>입니다. 제출 버튼은 비활성이고 데이터는 바뀌지 않습니다.</p></div>' +
    '<div class="row mb16"><button class="btn ghost" onclick="closePreview()">← 돌아가기</button></div>' +
    /* "미리보기 모드" 배너와 "제출·업로드·접수 생성이 일어나지 않는다" 줄은 위 한 문장으로 합쳤다 (문구 규칙 9/5) · 폰 안의 PV_NOTE 는 그대로 */
    '<div class="preview-wrap' + (donor ? '' : ' pv-org') + '">' +
    '<div class="preview-stage"><div class="phone"><div class="scr"><div class="notch"></div>' +
    '<div class="ph-top"><div class="brand">' + brandMark() + '나눔대장</div><div class="small" style="opacity:.9">' +
    (donor ? '물품기부신청서' : '증빙 제출') + '</div></div>' +
    '<div class="ph-body">' + body + '</div></div></div></div></div>';
}

