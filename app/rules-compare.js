/* ════════════════════════════════════════════════════════════
   rules-compare.js — 대조 판정 (층 ②) · 담당: 유진 (2026-08-31)

   ★ 왜 별도 파일인가
     루브릭 §2 "판정 절차"는 검수를 두 층으로 나눈다.
       ① 슬롯 판정 — 서류 한 장씩. "이 자리에 올 서류가 맞는가" → 항목 카드의 뱃지
       ② 대조 판정 — 서류들·등록값들 '사이'. "값이 서로 맞는가" → 체크리스트 아래 별도 영역
     E1·E2·E4·E5·E7 은 **어느 슬롯에도 속하지 않는다.** "금액 불일치"는 영수증 잘못도
     신청서 잘못도 아니고 둘 사이의 문제다. 그래서 항목 카드(common.js)와 자리를 나눈다.

   ★ 여기 있는 것은 전부 AI를 부르지 않는다 — 덧셈과 비교이기 때문이다.
     E1(금액)만 AI가 서류를 읽어야 해서 api.js/judge.js 쪽에 있다.

   구현 현황 (2026-09-01 기준 — 고칠 때 여기도 같이 고칠 것)
     E2  일자 선행    ✅ 두 축. 기부일≤배분일은 코드 단독, 구매일≤기부일은 추출값 issueDate
     E3  가액 산정    ✅ 폼값 조합 (AI 안 부름)
     E4  수량 대조    ✅ 추출값 · 세트로 읽어 수량 출처를 고른다
     E5  취득경로    ✅ 추출값 · 서류 종류가 시사하는 경로와 대조
     E6  증빙 적격    ✅ 슬롯 판정(층 ①)이라 파일마다 돈다 — 여기 있는 것 중 유일하다
     E7  배분 수량    ✅ 코드 단독 (접수 등록값 ↔ 배분 등록값)
     E1  금액 대조    → api.js / judge.js (AI가 읽어야 한다)
                        단, §4 방어(checkExtractionGaps)는 여기 있다

   ★ 세트로 읽기 — E4·E5 는 첨부 한 장씩이 아니라 '한 건'을 모아 보고 판정한다.
     서류마다 담는 정보가 다르기 때문이다(세금계산서는 수량이 0으로 비는 일 잦음).
     한 장씩 보면 서로 모순된 답이 나온다 — 실측으로 겪었다(pickSource 주석 참조).
   ════════════════════════════════════════════════════════════ */

/* 사업자등록번호 중간 2자리로 영리법인을 가린다.
   81·82·83·84·85·86·87·88 = 영리법인. 비영리는 82를 쓰지 않는다(80·89 등 별도 코드).
   ⚠️ E3는 '영리'법인 한정 규칙인데 donor_type 에는 '법인'/'법인외' 밖에 없다 —
     비영리법인도 '법인'이라 유형만 보면 오탐이 난다. 그래서 번호로 한 겹 더 확인한다. */
/* 화면에 보이는 규칙 이름 — E1~E8 번호는 설계·DB(rule_code) 용이라 담당자에게는 안 보인다 (문구 수정 9/10).
   ★ 저장되는 rule_code 는 그대로 'E2' 등이다 — 통계·감사 로그는 안 바뀐다. */
var FINDING_LABEL = {E1:'금액 대조', E2:'일자 순서', E3:'가액 산정 방식', E4:'수량 대조',
                     E5:'취득경로', E6:'증빙서류 적격', E7:'배분 수량 합계', E8:'물품 사진'};
function findingLabel(f){
  return (FINDING_LABEL[f.rule] || f.rule) + (f.axis ? ' · ' + f.axis : '');
}

/* ── 관리자 화면 '검수 기준' 표가 읽는 설명 (2026-09-14 선미) ──────────────
   ★ 왜 여기 두나 — 규칙 이름(FINDING_LABEL) 바로 옆이다. 화면 쪽(db.js)에 따로 적어 두면
     규칙이 늘거나 이름이 바뀌어도 안 따라온다 — 9/14 에 기준자료 표가 정확히 그렇게 낡아 있었다.
     `smoke-test-admin.mjs` 가 FINDING_LABEL 과 키가 같은지 본다(규칙을 더하고 여기를 잊으면 빨개진다).

   ★ '누가 보나' 는 이 파일 머리말의 구현 현황을 그대로 옮긴 것이다.
     여기 있는 규칙은 덧셈과 비교라 AI 를 부르지 않는다 — 다만 대조에 쓰는 **값**을
     AI 가 서류에서 읽어 온 경우가 있어(E1·E2 구매일·E4·E5) 그것을 구분해 적는다.

   ⚠️ '완결을 막나' 는 열로 두지 않는다 — **규칙이 아니라 상황마다 다르기 때문이다.**
     E4 는 인수증 ↔ 배분 축만 막고, E2 는 기부→배분 축이 안 막는다. 한 규칙에 한 답을
     적으면 화면이 사실과 다른 말을 하게 된다. 표 아래 한 줄로 대신 적는다. */
var FINDING_DESC = {
  E1:{by:'AI가 읽고 코드가 대조', what:'영수증·세금계산서의 금액과 신청서에 등록된 금액이 같은가'},
  E2:{by:'코드가 대조 (구매일만 AI가 읽음)', what:'서류 일자가 기부일보다 앞서는가 · 기부일이 배분일보다 앞서는가'},
  E3:{by:'코드만', what:'영리법인이 장부가액 대신 시가로 산정했는가 (폼 입력값 조합)'},
  E4:{by:'AI가 읽고 코드가 대조', what:'서류의 수량과 등록 수량이 같은가 · 인수증 수량이 그 기관 배분 수량과 같은가'},
  E5:{by:'AI가 읽고 코드가 대조', what:'낸 서류가 시사하는 취득경로가 신청한 경로와 맞는가'},
  E6:{by:'AI가 판별', what:'낼 수 없는 서류를 냈는가 (예: 간이영수증·견적서·거래명세표)'},
  E7:{by:'코드만', what:'기관별 배분 수량의 합계가 접수 수량과 맞는가'},
  E8:{by:'AI가 판별', what:'물품사진 자리에 사진이 아닌 것이 왔는가'}
};

var CORP_PROFIT_MID = ['81', '82', '83', '84', '85', '86', '87', '88'];
/* bizMiddle 은 common.js 에 있다 (2026-09-10 통합) — 여기 두 벌로 두었다가
   formCheck 쪽 규칙과 갈렸다. 같은 값을 두 곳에서 정의하지 않는다. */
function isProfitCorp(c){
  var mid = bizMiddle(c.donorBizNo);
  return mid ? CORP_PROFIT_MID.indexOf(mid) >= 0 : null;   /* 번호가 없으면 '모름' */
}

/* ── E7. 배분 수량 합계 불일치 (다기관) ──────────────────────
   초과와 미달을 반드시 구분한다 — 미달은 오류가 아니라 '아직 다 안 정한 것'이다.
   미달을 오류로 잡으면 배분을 나눠 진행하는 정상 업무가 전부 빨간 딱지가 된다. */
function checkE7(c){
  /* ★ 취소된 배분은 합계에서 뺀다 (2026-09-11 · patch-20260911-dist-cancel.sql).
       행은 남아 있지만 "나눠준 것"이 아니다. distLive 는 db.js 에 하나만 둔다 —
       여기서 cancelled_at 을 직접 보면 화면(남은 수량·기관 표기)과 어긋난다. */
  var dists = (c.dists || []).filter(distLive);
  var total = Number((c.donation && c.donation.qty) || 0);
  if (!dists.length || !total) return null;                /* 배분 전이거나 수량 미상 — 볼 것이 없다 */
  var sum = 0, parts = [];
  dists.forEach(function(d){
    var q = Number(d[COL.distribution.qty] || d.qty || 0);
    sum += q;
    parts.push((d[COL.distribution.orgName] || d.orgName || '기관') + ' ' + q);
  });
  var detail = '배분 합계 ' + sum + ' / 접수 수량 ' + total + ' (' + parts.join(' + ') + ')';
  if (sum > total){
    return {rule:'E7', verdict:'확인 권장', isError:true, blocksComplete:true,
            reason:'받은 것보다 많이 나눠준 것으로 등록돼 있습니다 — ' + detail};
  }
  if (sum < total){
    /* ★ '오류가 아니다'와 '완결시켜도 된다'는 다르다.
       아직 배분처를 다 안 정한 것은 정상 업무라 빨간 딱지를 붙이지 않는다(isError=false).
       하지만 완결은 '전량 배분이 정해진 상태'이므로 게이트에서는 막는다
       (루브릭 E7: "배분 진행 중 표시 · 완결 게이트에서만 차단"). */
    /* ★ '남은 수량' 을 핵심 문장 쪽으로 옮겼다 (2026-09-15 선미 · 후보 ②)
         완결 게이트 줄은 마지막 ' — ' 뒤(자세한 값)를 떼고 앞부분만 쓴다(screen-staff blockHeadline).
         전에는 남은 수량이 그 뒤에 있어 **담당자가 할 일의 크기가 게이트 줄에서 사라졌다.**
         [대조 판정] 카드에는 앞뒤가 다 그대로 보인다 — 순서만 바뀐다. */
    return {rule:'E7', verdict:'배분 진행 중', isError:false, blocksComplete:true,
            reason:'아직 배분처를 다 정하지 않았습니다 · 남은 수량 ' + (total - sum) +
                   ' — ' + detail};
  }
  return {rule:'E7', verdict:'이상 없음', isError:false, blocksComplete:false,
          reason:'배분 합계가 접수 수량과 같습니다 · ' + detail};
}

/* ── E4(인수증 축). 인수증 수량 ↔ 그 기관 배분 수량 ──────────────
   ★ 왜 여기 있나 (2026-09-12 선미 · U08 실주행 · #317-2)
     루브릭 §2-E4 는 "AI 가 읽을 것: 영수증·**인수증**의 수량" 이라고 적어 두었다. 그런데
     E4 본체(checkE4)는 AI 가 이미지에서 뽑은 값(facts)으로만 돈다 — 인수증은 **기관이 폼에
     적은 값**이라 뽑을 이미지가 없어 그 경로에 애초에 안 들어간다. 그래서 대조 판정에
     한 줄도 안 떴고, 불일치는 항목 카드의 상자로만 있었다. 담당자는 "검수 결과" 를 보는데
     거기에는 아무 말도 없었다.
   ★ AI 를 부르지 않는다 — E7 과 같은 이유다. 두 값이 다 등록값이라 **비교**일 뿐이다.
     AI 에 보낼 이미지도, 읽어 낼 글자도 없다. 루브릭 §2 표의 '코드 단독' 이 이 자리다.
   ★ 기준은 **그 배분처의 배분 수량**이다(건 전체 신고 수량이 아니다) — 배분 합계 ↔ 신고 수량은
     E7 이 따로 본다. 판정 값(qtyFlag)은 db.js restoreReceiptQtyFlag 와 screen-donor.js
     submitOrg 가 같은 규칙으로 세운 하나를 읽는다 — 여기서 두 번째 규칙을 만들지 않는다.
   ⚠️ 담당자가 사유로 해소했으면(r.resolution) 막지 않는다. 다만 **줄은 남긴다** — 무엇을
     사유로 넘겼는지가 안 보이면 감사에서 답할 수 없다(9/12 "통과도 한 줄" 과 같은 이유).
   ⚠️ 낱개 ↔ 박스 환산은 판정하지 않는다(루브릭 E4 · E7 과 동일 — 사람 몫). */
function checkE4Receipt(c){
  if (!c) return [];
  var out = [];
  (c.checklist || []).forEach(function(it){
    if (!it || it.key !== 'inss' || !it.included) return;
    var r = it.r || {};
    /* 기관명 — 항목에는 따로 없다(rowToItem 이 이름 n 뒤에 붙여 둔다). 배분처 행에서 가져온다. */
    var d = (c.dists || []).filter(function(x){
      return String(x.id || x[COL.distribution.id]) === String(it.distId || '');
    })[0];
    var who = d ? String(d.orgName || d[COL.distribution.orgName] || '') : '';
    var at = who ? who + ' — ' : '';
    var q = r.qtyFlag;
    if (q){
      /* ★ '신고 수량' 을 쓰지 않는다 (2026-09-15 선미 · 테스트 참여자 의견 · 후보 ②)
           "'신고'수량이라 하여 직관적인 이해가 어려웠음" — 어느 서류에 적힌 수량인지가 안 보였다.
           담당자가 실제로 펼쳐 보는 것은 **물품기부신청서**다. 그 이름으로 부른다. */
      var basis = q.basis === 'dist' ? '이 기관 배분 수량' : '물품기부신청서 수량';
      var detail = '인수증 ' + q.recv + ' / ' + basis + ' ' + q.expected +
                   ' · 차이 ' + Math.abs(q.recv - q.expected);
      if (r.resolution){
        out.push({rule:'E4', axis:'인수증 ↔ 배분', verdict:'이상 없음', isError:false, blocksComplete:false,
                  reason:at + '수량이 달랐지만 담당자가 사유로 해소했습니다 — ' + detail +
                         ' · 사유 “' + String(r.resolution.reason || '').slice(0, 60) + '”'});
      } else {
        out.push({rule:'E4', axis:'인수증 ↔ 배분', verdict:'확인 권장', isError:true, blocksComplete:true,
                  reason:at + '기관이 적어 낸 인수 수량이 배분 수량과 다릅니다 — ' + detail +
                         ' · 원본을 보고 실제 수량이 맞으면 사유를 남겨 해소하세요 (파손·분할 수령이 있을 수 있습니다)'});
      }
      return;
    }
    /* 통과도 한 줄 적는다 — "안 본 것" 과 "보고 통과시킨 것" 을 담당자가 구분할 수 있어야 한다 */
    var came = (r.orgUpload && r.orgUpload.status === 'uploaded') || r.st === 'done';
    if (!came) return;                                   /* 아직 안 낸 인수증은 볼 것이 없다 */
    out.push({rule:'E4', axis:'인수증 ↔ 배분', verdict:'이상 없음', isError:false, blocksComplete:false,
              reason:at + '인수증 수량이 배분 수량과 같습니다'});
  });
  return out;
}

/* ── E3. 영리법인인데 시가로 산정 ────────────────────────────
   폼값 조합 위반이라 확정적이다. 영리법인은 장부가액(취득원가)으로 산정해야 한다. */
function checkE3(c){
  if (c.donorType !== '법인') return null;
  var d = c.donation || {};
  var book = Number(d.book || 0), fair = Number(d.fair || 0);
  if (!fair) return null;                                   /* 시가 자체가 없으면 볼 것이 없다 */
  /* ★ '이상 없음' 도 적는다 (2026-09-12 선미 · U02 실주행) — 전에는 통과면 null 이라 대조 판정에
       일자·수량만 뜨고 가액 산정은 한 줄도 없었습니다. 담당자는 "안 본 것" 과 "보고 통과시킨 것" 을
       구분할 수 없습니다(compareBlock 머리 주석의 자동화 편향 규칙). 판정·게이트는 그대로입니다. */
  if (book)                                                 /* 장부가액이 있으면 그것으로 산정한 것 */
    return {rule:'E3', verdict:'이상 없음', isError:false, blocksComplete:false,
            reason:'장부가액(' + won(book) + ') 기준으로 산정했습니다 — 영리법인의 원칙대로입니다'};
  var profit = isProfitCorp(c);
  if (profit === false)                                     /* 비영리법인 — 시가 산정이 허용된다 */
    return {rule:'E3', verdict:'이상 없음', isError:false, blocksComplete:false,
            reason:'비영리법인(사업자번호 중간자리 ' + bizMiddle(c.donorBizNo) + ')이라 시가(' + won(fair) + ') 산정이 허용됩니다'};
  var who = (profit === null)
    ? '법인(사업자번호가 없어 영리 여부는 확인하지 못했습니다)'
    : '영리법인(사업자번호 중간자리 ' + bizMiddle(c.donorBizNo) + ')';
  /* 2026-09-02 · 완결을 막게 올렸다(선미). 전에는 막지 않았다 — '사유 기재로 해소' 경로가
     없어서, 막으면 정당한 사유가 있어도 담당자가 빠져나올 방법이 없었기 때문이다.
     아래 두 가지가 갖춰져서 올린다:
       · 해소 사유가 DB 에 실제로 저장된다 (유진 · 28a7aa9 · db.js saveFindingResolution)
       · 판정 status 제약에 'error' 가 들어갔다 (patch-20260902 · 실 DB 실행 확인 9/2)
     ⚠️ 되돌려야 할 때 — 해소 저장이 깨지면 이 값을 false 로 내린다.
        저장이 실패하면 해소가 안 되도록 막아놨기 때문에, 저장이 깨진 채로 이걸 켜두면
        담당자가 완결도 해소도 못 하는 상태에 갇힌다. */
  return {rule:'E3', verdict:'확인 권장', isError:true, blocksComplete:true,
          reason: who + '인데 장부가액 없이 시가(' + won(fair) + ')로 산정돼 있습니다 — ' +
                  '영리법인은 취득원가(장부가액) 기준이 원칙입니다'};
}

/* ── E2. 일자 선행 ───────────────────────────────────────────
   올바른 순서는 하나다:  구매일 ≤ 기부일 ≤ 배분일
   (사고 → 기부하고 → 나눠준다. 뒤집힐 수 없다 · 루브릭 §2-E2)

   ★ 두 축을 나눠 놨다. 필요한 값이 서로 다르기 때문이다.
       기부일 ≤ 배분일   checkE2()          — 코드 단독. 둘 다 시스템에 있다
       구매일 ≤ 기부일   checkE2Purchase()  — 구매일은 서류에서만 나온다(AI 추출)
     한 함수에 묶으면 추출이 실패했을 때 멀쩡한 배분일 축까지 같이 못 본다.

   ★ 기부일의 정본은 '신청서의 후원일자 칸'이다(donation_date).
     하단 서명일이 아니다 — 루브릭에 실제 사례가 있다. 후원일자(6/16)와
     서명일(6/4)이 12일 달랐는데 정상이었다. 서명은 미리 하고 물품은 나중에
     전달할 수 있다. 지정된 칸을 무시하고 아무 날짜나 주워 오면 그게 오탐이다. */

/* 날짜 표기를 YYYY-MM-DD 로 맞춘다 — 서류에서 온 값은 '2026.06.20' 처럼 올 수 있다.
   맞출 수 없으면 null 을 돌려준다. 넘겨짚어 비교하면 그 비교가 틀린다. */
function toDate(v){
  var t = String(v == null ? '' : v).trim();
  if (!t) return null;
  var m = t.match(/(\d{4})\D?(\d{1,2})\D?(\d{1,2})/);
  if (!m) return null;
  var mo = Number(m[2]), dy = Number(m[3]);
  if (mo < 1 || mo > 12 || dy < 1 || dy > 31) return null;
  return m[1] + '-' + ('0' + mo).slice(-2) + '-' + ('0' + dy).slice(-2);
}
/* 화면에 보여줄 짧은 표기 — '2026-06-20' → '6/20' (루브릭의 사유 예시 형식) */
function md(d){
  var p = String(d).split('-');
  return p.length === 3 ? (Number(p[1]) + '/' + Number(p[2])) : String(d);
}

/* ── E2-a. 기부일 ≤ 배분일 (코드 단독) ───────────────────────
   ★ axis — 화면 라벨에 붙는 축 이름이다. E2는 사슬의 서로 다른 고리를 보는
     판정이 두 줄 뜰 수 있어서, 라벨이 같으면 중복으로 읽힌다.
     ⚠️ 표시용일 뿐이다. DB에 들어가는 rule_code 는 그대로 'E2' 라서
       통계·집계는 달라지지 않는다. */
function checkE2(c){
  var give = toDate((c.donation || {}).donationDate);
  if (!give){
    /* ★ 조용히 통과시키지 않는다 — '안 본 것'을 안 봤다고 적지 않으면
       담당자는 봤다고 여긴다(자동화 편향).
       축을 안 붙인다 — 기부일이 없으면 두 축 다 못 본 것이라 한 줄로 말하는 게 맞다. */
    return {rule:'E2', verdict:'판단 보류', isError:false, blocksComplete:false,
            reason:'기부일(신청서의 후원일자)이 시스템에 없어 일자 순서를 대조하지 못했습니다 — ' +
                   '담당자가 신청서로 직접 확인해 주세요'};
  }
  var dates = (c.dists || []).map(function(d){
    return toDate(d[COL.distribution.distDate] || d.distDate);
  }).filter(Boolean);
  /* ★ 배분 전이면 아무것도 내지 않는다 — E7이 '배분 전'에 아무것도 안 내는 것과 같은 자리다.
     배분이 없으면 '배분일이 기부일보다 앞선다'가 성립할 수 없다. 위반이 존재할 수 없는 것을
     '이상 없음'으로 적으면 본 것도 아니면서 본 것처럼 보이고, 카드만 길어진다.
     ⚠️ '기부일이 없다'(위)와는 다르다. 저건 못 본 것이라 반드시 남긴다. */
  if (!dates.length) return null;

  var first = dates.sort()[0];
  if (first < give){
    return {rule:'E2', axis:'기부→배분', verdict:'확인 권장', isError:true, blocksComplete:false,
            reason:'배분일(' + md(first) + ')이 기부일(' + md(give) + ')보다 선행함 — ' +
                   '받기 전에 나눠준 것으로 등록돼 있습니다'};
  }
  return {rule:'E2', axis:'기부→배분', verdict:'이상 없음', isError:false, blocksComplete:false,
          reason:'기부일이 배분일보다 앞섭니다 · 기부일 ' + give + ' → 가장 이른 배분일 ' + first};
}

/* 대조 판정 전체 — 화면은 이 함수 하나만 부른다 */
function compareFindings(c){
  if (!c) return [];
  return [checkE7(c), checkE3(c), checkE2(c)].filter(Boolean).concat(checkE4Receipt(c));
}
/* 완결을 막아야 하는 대조 판정 — 화면의 완결 게이트가 이걸 본다.
   ★ isError(오류인가)와 blocksComplete(완결을 막는가)는 다른 축이다.
     E7 미달은 오류가 아니지만(정상 업무) 완결은 막는다. */
function compareBlocking(c){
  return compareFindings(c).filter(function(f){ return f.blocksComplete; });
}
/* 게이트에 붙일 한 줄 — 왜 못 누르는지를 담당자가 읽을 수 있어야 한다 */
function compareBlockText(c){
  var b = compareBlocking(c);
  if (!b.length) return '';
  return b.map(function(f){ return f.rule + ' ' + f.verdict; }).join(' · ') + ' — 대조 판정이 완결을 막고 있습니다';
}

/* ════════════════════════════════════════════════════════════
   E4 · E5 · E6 — AI가 뽑아온 값으로 코드가 판정한다
   (judge.js 의 mode:'extract' 결과를 받는다 · 2026-08-31)

   ★ AI는 여기서 판정하지 않는다. 특칙·예외는 전부 이 아래 코드에 있다 —
     프롬프트 문장으로 쌓으면 서로 간섭하고, 무엇이 적용됐는지 확인할 수 없다.
     루브릭이 E6을 "오탐이 가장 많이 나는 지점"이라고 못박은 자리다.
   ════════════════════════════════════════════════════════════ */

/* 숫자만 남긴다 — '1,249,809 원' → 1249809 */
function toNum(v){
  var d = String(v == null ? '' : v).replace(/[^0-9]/g, '');
  return d ? Number(d) : null;
}

/* 금액이 적혀 있어야 정상인 서류인가 — §4 방어의 판단 기준 */
/* ── unreadable 을 읽는 한 곳 ────────────────────────────────────────
   ★ 2026-09-04 — 여기가 조용한 실패였다. 코드는 한글 '수량'·'거래일자' 를 찾는데
     모델은 `issuerBizNo` 처럼 **영문 필드명**으로 보냈다(9/4 run-survey 실측).
     "못 읽었다" 고 밝힌 것을 코드가 못 알아들으면 그냥 통과한다 —
     unreadable 이 존재하는 이유(빈 값과 못 읽음을 가른다)가 통째로 무너진다.

   프롬프트에는 영문 필드명으로 못박았고(judge.js 5번), 여기서는 **둘 다 받는다.**
   ⚠️ 프롬프트는 모델이 늘 지키는 것이 아니다. 지시와 방어를 한 겹씩 둔다.
   ★ 이름 짝을 늘릴 일이 있으면 **이 표 한 곳만** 고친다 — 결론은 한 곳에서만 낸다. */
var UNREADABLE_ALIAS = {
  docKind:     ['docKind', '종류', '서류종류', '문서종류'],
  qty:         ['qty', '수량'],
  qtyUnit:     ['qtyUnit', '단위'],
  unitPrice:   ['unitPrice', '단가'],
  total:       ['total', '합계', '합계금액', '총액', '금액'],
  supply:      ['supply', '공급가액'],
  issuerBizNo: ['issuerBizNo', '사업자등록번호', '사업자번호'],
  issueDate:   ['issueDate', '거래일자', '일자', '날짜']
};

/* 모델이 "이 항목은 있는데 못 읽었다" 고 밝혔는가 */
function saidUnreadable(x, field){
  if (!x || !Array.isArray(x.unreadable)) return false;
  var names = UNREADABLE_ALIAS[field] || [field];
  for (var i = 0; i < x.unreadable.length; i++){
    var got = String(x.unreadable[i] || '').trim();
    for (var j = 0; j < names.length; j++){
      if (got.toLowerCase() === names[j].toLowerCase()) return true;
    }
  }
  return false;
}

/* 모델이 "이 항목은 여럿이라 하나로 못 고르겠다" 고 밝혔는가 — saidUnreadable 의 짝
   (2026-09-04 연수 · (미공개 내부 기록))

   ★ 못 읽음과 여럿은 **담당자가 할 일이 다르다.** 그래서 갈라 받는다 —
       못 읽음 → 원본을 열어 본다        여럿 → 신청서 품목과 맞는 단가를 고른다

   ⚠️ **지금은 늘 false 다.** `judge.js` 의 추출 프롬프트(:321·:335)와 스키마(:359)가
     내는 것은 `unreadable` 하나뿐이고 `ambiguous` 는 없다.
   ★ **2026-09-07 선미 결정 — `ambiguous` 를 지시문에 넣는 것은 제출(9/18) 뒤로 미룬다.**
     ① 정작 문제였던 나눔 건은 '여럿이라 안 고른 것' 이 아니라 '못 읽은 것' 이라(§1·§3)
        `ambiguous` 를 넣어도 안 고쳐진다 — 이것 때문에 놓치는 실제 사례가 0건이다
     ② 지시문을 건드리면 정확도를 다시 재야 한다 — 발표에 쓸 숫자가 지금 지시문에서 나왔다
     ③ 미뤄도 재작업이 없다 — 이 코드가 그대로 살아 있어 지시문 한 줄만 고치면 바로 돈다
     제출 뒤에 ① 지시문 ② 정답표 `@여럿` ③ 채점 ④ 재측정을 **한 묶음**으로 한다.
     **프롬프트·정답표·이 별칭 표의 주인은 이제 선미다**(유진 과장 출국분 인수).
     검사는 `ambiguous` 를 직접 넣어 이 갈래가 실제로 도는 것을 지금 확인해 둔다.

   ⚠️ 이름이 `UNREADABLE_ALIAS` 인데 `ambiguous` 도 같은 표를 쓴다 — `FIELD_ALIAS` 가 맞다.
     **이 이름 바꾸기도 위 묶음에 같이 넣기로 했다(선미 9/7).**
 */
function saidAmbiguous(x, field){
  if (!x || !Array.isArray(x.ambiguous)) return false;
  var names = UNREADABLE_ALIAS[field] || [field];
  for (var i = 0; i < x.ambiguous.length; i++){
    var got = String(x.ambiguous[i] || '').trim();
    for (var j = 0; j < names.length; j++){
      if (got.toLowerCase() === names[j].toLowerCase()) return true;
    }
  }
  return false;
}

var DOCS_WITH_AMOUNT = ['구매영수증', '세금계산서', '거래명세표', '간이영수증', '견적서', '원가명세서'];

/* ── §4 방어 — 조용한 누락을 코드가 붙잡는다 ─────────────────
   실측(run-20260831-03)에서 합계금액이 인쇄돼 있는데도 total 을 비워 보내는 일이
   13건 중 2건 있었다. unreadable 에도 안 적혔다.
   ★ 비어 온 것을 '서류에 금액이 없다'로 받아들이면 금액 대조를 건너뛴다 —
     진짜 금액 오류가 조용히 통과한다. 모델이 조용해도 코드는 조용하지 않게 만든다.
   ★ 프롬프트를 더 조이는 대신 여기서 막는 이유: 모델을 바꾸거나 프롬프트가 흔들려도
     이 방어는 남는다. */
function checkExtractionGaps(x, it){
  if (!x) return null;
  /* ★ 2026-09-04 — 자리를 안 보고 있었다. 그래서 **사진 자리에 금액 대조가 걸렸다.**
       사진 자리에 온 롯데월드 예매 내역이 '구매영수증' 으로 읽히면 이 규칙이
       "서류에서 금액을 읽지 못했습니다" 를 냈다 — 사진 자리인데 금액을 따진 것이다.
     ⚠️ 실무 확인(유진): 물품 사진을 애초에 올릴 수 없는 건이 있다. 그런 건마다 경고가
       하나씩 더 붙으면 담당자가 경고를 무시하게 된다. 그게 이 방어가 죽는 길이다.
     ★ 그리고 이 자리를 보는 규칙은 E8 하나면 된다 — **결론은 한 곳에서만 낸다.** */
  if (it && PHOTO_SLOTS.indexOf(it.key) >= 0) return null;    /* 사진 자리에는 금액 대조를 걸지 않는다 */
  if (DOCS_WITH_AMOUNT.indexOf(x.docKind) < 0) return null;   /* 금액이 없는 게 정상인 서류 */
  if (toNum(x.total) || toNum(x.supply)) return null;          /* 금액을 읽었다 */
  return {rule:'E1', verdict:'판단 보류', isError:false, blocksComplete:false,
          reason:'서류에서 금액을 읽지 못했습니다(' + x.docKind + ') — 담당자가 직접 확인해 주세요' +
                 ((x.unreadable && x.unreadable.length) ? ' · 모델이 못 읽었다고 밝힌 항목: ' + x.unreadable.join(', ') : '')};
}

/* ── §4 방어 (2) — 단가를 못 골랐다는 말을 사람에게 전한다 ────
   (2026-09-04 연수 · (미공개 내부 기록) · 유진 넘김 「연수 님」 칸)

   ★ **비우는 것만으로는 아무 일도 안 일어난다.** 단가를 보는 규칙이 한 곳도 없기 때문이다 —
     `saidUnreadable` 호출처는 수량(E4)·거래일자(E2) 둘뿐이고 단가는 0곳이었다.
     그래서 프롬프트만 고치면 화면은 조용하다(유진, 9/4). 이 함수가 그 자리를 메운다.
   ★ `checkExtractionGaps` 도 이 건을 못 잡는다 — 나눔 건의 docKind 는 **시세자료**라
     `DOCS_WITH_AMOUNT` 에 없어 첫 줄에서 빠진다.
   ★ 완결을 막지 않는다(blocksComplete:false) — E2·E4 의 '판단 보류' 와 같게 뒀다.
     단가 하나 때문에 건이 멈추면 담당자가 규칙을 끄게 된다. */
function checkUnitPriceGap(x, it){
  if (!x) return null;
  /* ⚠️ 사진 자리에는 걸지 않는다 — checkExtractionGaps(:249) 와 같은 이유다.
       9/4 에 사진 자리에 온 예매 내역이 '구매영수증' 으로 읽혀 금액 대조가 걸렸던 그 자리다.
       물품 사진을 못 올리는 건마다 경고가 하나씩 더 붙으면 담당자가 경고를 무시하게 된다. */
  if (it && PHOTO_SLOTS.indexOf(it.key) >= 0) return null;
  if (toNum(x.unitPrice)) return null;          /* 단가를 읽었다 */

  if (saidAmbiguous(x, 'unitPrice')){
    return {rule:'E1', verdict:'판단 보류', isError:false, blocksComplete:false,
            reason:'서류에 단가가 여러개라 하나로 고르지 않았습니다(' + x.docKind + ') — ' +
                   '신청서 품목과 맞는 단가인지 담당자가 확인해 주세요'};
  }
  if (saidUnreadable(x, 'unitPrice')){
    /* ⚠️ 금액 경고가 이미 같은 말을 하고 있으면 두 번 말하지 않는다 —
         checkExtractionGaps 는 사유 끝에 "못 읽었다고 밝힌 항목: total, unitPrice" 로
         단가를 이름까지 붙여 준다. 거기에 한 줄을 더 얹으면 같은 첨부에 판단 보류가 둘이 된다.
       ★ 실무 확인(유진, 9/4): **경고가 하나씩 더 붙으면 담당자가 경고를 무시하게 된다.**
         그게 이 방어가 죽는 길이다 — '결론은 한 곳에서만 낸다'(:206) 와 같은 자리다.
       ★ 조건을 베껴 쓰지 않고 그 함수를 그대로 불러 묻는다 — 조건이 갈리면 또 어긋난다. */
    if (checkExtractionGaps(x, it)) return null;
    return {rule:'E1', verdict:'판단 보류', isError:false, blocksComplete:false,
            reason:'서류의 단가를 읽지 못했습니다(' + x.docKind + ') — 담당자가 직접 확인해 주세요'};
  }
  return null;                                  /* 서류에 단가가 없는 것은 정상일 수 있다 */
}

/* ════════════════════════════════════════════════════════════
   세트로 읽기 — 한 건의 첨부를 '모아서' 보고 정보 출처를 고른다
   (루브릭 §판정절차 · 2026-09-01 유진)

   ★ 왜 필요한가 — 서류 한 장씩 따로 판정하면 서로 모순된 답이 나온다.
     실측(2026-09-01): 세금계산서(수량 0) + 거래명세표(수량 400)가 함께 붙은 건에서
       E4 확인 권장 "서류 0 / 신고 400 · 차이 400"   ← 세금계산서만 보고 낸 오탐
       E4 이상 없음 "서류 400 / 신고 400"           ← 거래명세표를 보고 낸 정답
     둘 다 화면에 떴다. 루브릭이 지목한 자리다 —
     "run-02 오탐 4건 중 2건이 세금계산서만 보고 거래명세서를 안 읽어서 생겼다."

   ★ 루브릭의 두 층 구분이 기준이다.
       ① 슬롯 판정(E6) — 파일 하나하나. 지금 구조가 맞다
       ② 대조 판정(E1·E2·E4·E5·E7) — 건당 한 번. 어느 슬롯에도 속하지 않는다
     E4·E5 가 파일마다 돌고 있었다 — ②인데 ①처럼 굴었다.

   서류마다 담는 정보가 다르다 (루브릭 표):
       거래명세서·POS영수증   총액 ⭕ 수량·단가 ⭕ 거래일 ⭕
       세금계산서             총액 ⭕ 수량·단가 ✕(0으로 비는 일 잦음) 거래일 ✕
   ⚠️ "증빙 자격"과 "정보 출처"는 별개다. 거래명세표는 단독 증빙은 안 되지만
     수량·거래일의 출처로는 가장 믿을 만하다. 증빙으로 못 쓴다고 읽지 않으면 안 된다.
   ════════════════════════════════════════════════════════════ */

/* 수량의 정보 출처 순위 — 숫자가 작을수록 우선. 없는 서류는 수량 출처로 쓰지 않는다.
   ⚠️ 세금계산서가 빠져 있는 것은 실수가 아니다(루브릭 표: 수량 ✕). */
var QTY_SOURCE_RANK = {'거래명세표':1, '구매영수증':1, '간이영수증':2, '견적서':3};

/* 이 건의 첨부 중 '그 용도로 가장 믿을 만한' facts 를 하나 고른다.
   같은 순위가 여럿이면 체크리스트에서 먼저 나온 것을 쓴다 — 판정이 한 번만 뜨게.

   ⚠️ 지금 보고 있는 facts(x)도 후보에 넣는다.
     체크리스트에 아직 facts 가 안 붙은 상태에서 불릴 수 있기 때문이다
     (추출 직후·테스트 등). 그때 x 를 빼면 판정이 통째로 사라진다 —
     e2BestRank 에서 한 번 겪은 것과 같은 구멍이라 여기서는 처음부터 막는다. */
function pickSource(c, rankOf, x){
  var cands = [];
  (c.checklist || []).forEach(function(it){
    var f = it.r && it.r.facts;
    if (f && cands.indexOf(f) < 0) cands.push(f);
  });
  if (x && cands.indexOf(x) < 0) cands.push(x);

  var best = null, bestRank = null;
  cands.forEach(function(f){
    var r = rankOf(f);
    if (r === null || r === undefined) return;
    if (bestRank === null || r < bestRank){ best = f; bestRank = r; }
  });
  return best;
}

/* 수량 출처로 쓸 수 있는가 — 순위가 있고, 쓸 만한 수량이 실제로 적혀 있어야 한다 */
function qtySourceRank(f){
  var r = QTY_SOURCE_RANK[f.docKind];
  if (!r) return null;
  var q = toNum(f.qty);
  /* ★ 0 은 '수량 없음'으로 본다. 서류에 0이 찍혀 있다고 0개를 받은 것이 아니다 —
     세금계산서가 아니어도 빈칸이 0으로 읽혀 오는 일이 있다. */
  return (q === null || q === 0) ? null : r;
}

/* ── E4. 수량 불일치 ────────────────────────────────────────
   특칙 a: 신청서 수량이 서류보다 '많을' 때만 올린다. 적게 신고한 쪽은 통과다
           (덜 받았다고 신고하는 것은 재단에 손해가 아니다)
   특칙 b: 수량이 1인데 총액이 단가로 나누어떨어지지 않으면 임의기재 의심
   판정 안 함: 단위가 다르면 환산은 사람 몫 (루브릭 §4) */
/* "건당 한 줄" 을 낼 자리 — 첨부 중 facts 가 붙은 **수량 서류가 아닌** 첫 항목, 없으면 x (2026-09-11).
   ★ 수량 서류(영수증·거래명세표)는 이 갈래에서 스스로 말하지 않는다(값을 못 읽은 것은 unreadable 분기가 따로 말함).
     그래서 그 서류를 자리로 잡으면 아무도 안 말한다 — 선미 9/11 검사(3줄 영수증 + 사진)가 그 구멍을 잡았다. */
function firstFacts(c, x){
  var list = c.checklist || [];
  for (var i = 0; i < list.length; i++){
    var f = list[i].r && list[i].r.facts;
    if (f && !QTY_SOURCE_RANK[f.docKind]) return f;
  }
  return x;
}
/* 수량 출처 후보 전부(순위 있음 · 수량 있음) — 서류끼리 견줄 때 쓴다 */
function qtySources(c, x){
  var out = [];
  (c.checklist || []).forEach(function(it){
    var f = it.r && it.r.facts;
    if (f && qtySourceRank(f) !== null && out.indexOf(f) < 0) out.push(f);
  });
  if (x && qtySourceRank(x) !== null && out.indexOf(x) < 0) out.push(x);
  return out;
}
function checkE4(c, x){
  if (!x) return null;
  var d = c.donation || {};
  var sysQty = toNum(d.qtyAsReceived != null ? d.qtyAsReceived : d.qty);

  /* ★ 세트로 읽는다 — 이 건에서 수량 출처로 가장 믿을 만한 서류가 따로 있으면 그쪽이 판정한다.
     그래야 세금계산서(수량 0)와 거래명세표(수량 400)가 서로 다른 답을 내는 일이 없다. */
  var src = pickSource(c, qtySourceRank, x);
  if (src && src !== x) return null;

  /* ★ 서류끼리 수량이 다르면 그 자체를 지적한다 (2026-09-11 승희 · 팀 결정 ⓐ-2)
       전에는 같은 순위(영수증·거래명세표 둘 다 1순위)가 여럿이면 먼저 온 한 장만 보고 나머지는 조용히 무시했다 —
       영수증 100 · 명세표 120 이면 어느 쪽이 맞는지 아무도 모른 채 한쪽 값으로만 신고 수량과 대조됐다.
       어느 쪽이 맞는지는 코드가 넘겨짚지 않는다 — 사람 몫. 단위가 서로 다르면 견주지 않는다(환산은 사람 몫). */
  if (src){
    var rank = qtySourceRank(src);
    var peers = qtySources(c, x).filter(function(f){ return qtySourceRank(f) === rank; });
    var sameUnit = peers.every(function(f){ return (f.qtyUnit || null) === (peers[0].qtyUnit || null); });
    var vals = {}; peers.forEach(function(f){ vals[String(toNum(f.qty))] = f; });
    var keys = Object.keys(vals);
    if (sameUnit && keys.length > 1){
      return {rule:'E4', verdict:'확인 권장', isError:true, blocksComplete:false,
              reason:'서류끼리 수량이 다릅니다 (' +
                     keys.map(function(k){ return vals[k].docKind + ' ' + k; }).join(' / ') +
                     ') — 원본을 보고 어느 쪽이 맞는지 확인해 주세요'};
    }
  }

  /* 수량 출처가 하나도 없는데 시스템에는 수량이 있다 — 대조를 못 한 것이다.
     ★ 조용히 넘어가지 않는다. 세금계산서만 온 건이 여기 해당한다(루브릭: 수량 ✕). */
  if (!src){
    if (sysQty === null) return null;                /* 대조할 기준값도 없다 — 할 말이 없다 */
    /* ★ 건당 한 줄 (2026-09-11 승희 · 팀 결정 ⓐ-3) — 수량 서류가 없는 건에서 사진·원가명세서·시세자료가
         각각 «수량 서류가 없다» 를 한 줄씩 내 같은 말이 세 줄 떴다(G05 실측). 이 갈래는 첨부 중 facts 가 붙은
         **첫 항목만** 말한다. 수량 서류 자체가 값을 못 읽은 경우(아래 QTY_SOURCE_RANK 분기)는 그 서류가 말한다. */
    if (!QTY_SOURCE_RANK[x.docKind] && firstFacts(c, x) !== x) return null;
    /* 이 서류는 수량 출처 후보였다가 수량이 없어 빠졌다.
       ★ 2026-09-04 — 여기서 '없다' 와 '못 읽었다' 를 똑같이 취급하고 있었다.
         아래 `docQty === null` 안의 unreadable 분기는 **닿지 않는다** —
         수량을 못 읽은 영수증은 src 후보에서 빠지므로 언제나 이 줄에서 먼저 끝났다.
         (닿지 않는 것을 확인하고 남겨 둔다 — pickSource 가 바뀌면 다시 살아날 자리다)
       못 읽었다고 밝힌 것을 조용히 넘기면 unreadable 을 만든 이유가 없어진다. */
    if (QTY_SOURCE_RANK[x.docKind]){
      if (saidUnreadable(x, 'qty')){
        return {rule:'E4', verdict:'판단 보류', isError:false, blocksComplete:false,
                reason:'서류(' + x.docKind + ')의 수량을 읽지 못했습니다 — ' +
                       '담당자가 직접 확인해 주세요'};
      }
      return null;
    }
    /* ★ 영수증이 있는데 수량을 하나로 못 읽은 경우 (2026-09-11 선미 · 발견 2 · G16 실측)
         품목이 여러 줄이면 qty 가 비어 후보에서 빠지고, 남은 사진이 "서류가 없다" 고 말했다 —
         담당자가 이미 올라온 영수증을 다시 받아오게 된다. 루브릭은 안 늘린다. 사유만 사실대로. */
    var qtyDocNoQty = (c.checklist || []).some(function(it){
      var f = it.r && it.r.facts;
      return f && QTY_SOURCE_RANK[f.docKind] && qtySourceRank(f) === null;
    });
    if (qtyDocNoQty){
      return {rule:'E4', verdict:'판단 보류', isError:false, blocksComplete:false,
              reason:'서류의 수량을 하나로 읽지 못했습니다 — 품목이 여러 줄일 수 있습니다. 원본을 직접 봐 주세요'};
    }
    return {rule:'E4', verdict:'판단 보류', isError:false, blocksComplete:false,
            reason:'수량을 확인할 수 있는 서류가 없습니다(' + x.docKind +
                   '는 수량 출처로 쓰지 않습니다) — 거래명세표나 영수증으로 확인해 주세요'};
  }

  var docQty = toNum(x.qty);

  if (docQty === null){
    if (saidUnreadable(x, 'qty')){
      return {rule:'E4', verdict:'판단 보류', isError:false, blocksComplete:false,
              reason:'서류의 수량을 읽지 못했습니다 — 담당자가 직접 확인해 주세요'};
    }
    return null;                                    /* 서류에 수량이 없는 것은 정상일 수 있다 */
  }
  if (sysQty === null) return null;

  /* 단위가 다르면 대조하지 않는다 — 낱개↔박스 환산을 코드가 넘겨짚으면 그게 오탐이 된다 */
  var sysUnit = d.qtyUnit || null, docUnit = x.qtyUnit || null;
  if (sysUnit && docUnit && sysUnit !== docUnit){
    return {rule:'E4', verdict:'판단 보류', isError:false, blocksComplete:false,
            reason:'단위가 달라 대조하지 않았습니다 — 증빙서류 ' + docQty + docUnit +
                   ' / 물품기부신청서 ' + sysQty + sysUnit + ' · 환산 확인이 필요합니다'};
  }

  /* 특칙 b — 수량 1은 실수량이 아니라 '한 건'으로 적어 넣은 경우가 많다 */
  var unit = toNum(x.unitPrice), total = toNum(x.total);
  if (docQty === 1 && unit && total && (total % unit !== 0)){
    return {rule:'E4', verdict:'확인 권장', isError:true, blocksComplete:false,
            reason:'수량이 1로 적혀 있으나 총액이 단가로 나누어떨어지지 않습니다 ' +
                   '(총액 ' + won(total) + ' / 단가 ' + won(unit) + ') — 임의기재가 의심됩니다'};
  }
  /* 특칙 a */
  if (sysQty > docQty){
    return {rule:'E4', verdict:'확인 권장', isError:true, blocksComplete:false,
            reason:'물품기부신청서에 적힌 수량이 증빙서류의 수량보다 많습니다 — 신청서 ' + sysQty +
                   ' / 증빙서류 ' + docQty + ' · 차이 ' + (sysQty - docQty)};
  }
  return {rule:'E4', verdict:'이상 없음', isError:false, blocksComplete:false,
          reason:(sysQty < docQty
                    ? '물품기부신청서에 적힌 수량이 증빙서류의 수량보다 적습니다 · 오류는 아닙니다 — '   /* 특칙 a */
                    : '물품기부신청서에 적힌 수량과 증빙서류의 수량이 같습니다 — ') +
                 '신청서 ' + sysQty + ' / 증빙서류 ' + docQty};
}

/* ── E5. 취득경로 불일치 ────────────────────────────────────
   서류의 '종류'가 취득경로를 시사한다. 시사가 없는 서류는 판정하지 않는다.
   ★ 금액이 맞아도 지적한다 — 취득경로가 틀리면 가액 산정 근거 자체가 틀어진다(루브릭 E5) */
var PATH_BY_DOCKIND = {
  '구매영수증':'구매', '세금계산서':'구매', '거래명세표':'구매', '간이영수증':'구매',
  '원가명세서':'제조·유통', '회계장부':'제조·유통'
};
function checkE5(c, x){
  if (!x) return null;
  var implied = PATH_BY_DOCKIND[x.docKind];
  if (!implied) return null;                        /* 견적서·시세자료 등은 경로를 시사하지 않는다 */
  var sysPath = c.acqPath || (c.donation && c.donation.acqPath) || null;
  if (!sysPath || sysPath === implied) return null;

  /* ★ 대조 판정은 건당 한 번이다(루브릭 두 층 구분).
     같은 경로를 시사하는 서류가 여러 장이면(구매영수증 + 간이영수증) 같은 말이 두 번 뜬다.
     먼저 나온 한 장만 판정한다.
     ⚠️ 서로 '다른' 경로를 시사하는 경우는 각각 남긴다 — 그건 중복이 아니라 서로 다른 사실이다. */
  var first = null;
  (c.checklist || []).forEach(function(it){
    var f = it.r && it.r.facts;
    if (!first && f && PATH_BY_DOCKIND[f.docKind] === implied) first = f;
  });
  /* 체크리스트에 facts 가 없으면 지금 보고 있는 것이 곧 첫 번째다 (위 pickSource 와 같은 이유) */
  if (first && first !== x) return null;
  return {rule:'E5', verdict:'확인 권장', isError:true, blocksComplete:false,
          reason:'첨부는 ' + x.docKind + '(' + implied + ' 시사)인데 시스템에는 \'' + sysPath +
                 '\'로 등록돼 있습니다 — 취득경로가 다르면 가액 산정 근거가 달라집니다'};
}

/* ── E6. 부적격 증빙서류 ────────────────────────────────────
   ⚠️ 루브릭이 "오탐이 가장 많이 나는 지점"으로 지목한 규칙이다.
     예외 ②③④를 '먼저' 적용한다 — 자리가 다르면 같은 서류도 정상이다. */
var INELIGIBLE_IN_RECEIPT_SLOT = ['거래명세표', '견적서', '단가표', '간이영수증'];
var FAIR_VALUE_SLOTS = ['market_px', 'value_g'];    /* 공정가 확인 자리 */

function checkE6(c, it, x){
  if (!x || !it) return null;
  var key = it.key;

  /* 예외③④ — 공정가 확인 자리에서는 견적서·단가표·시세자료가 정상이다 */
  if (FAIR_VALUE_SLOTS.indexOf(key) >= 0) return null;

  if (key !== 'proof_buy') return null;             /* E6은 구매영수증 자리 규칙이다 */
  if (INELIGIBLE_IN_RECEIPT_SLOT.indexOf(x.docKind) < 0) return null;

  /* 예외② — 면세사업자는 세금계산서를 '발행할 수 없다'. 후원자 잘못이 아니다.
     ⚠️ 사업자등록번호만으로는 과세/면세가 확정되지 않는다(국세청 조회가 정본).
       확정할 수단이 없는데 통과시키면 진짜 부적격 서류가 새어 나간다.
       그래서 통과도 지적도 아닌 '판단 보류'로 사람에게 넘긴다.
       → 재단 확인 안건: 면세사업자 목록을 우리가 가질 수 있는가 */
  if (x.docKind === '간이영수증'){
    return {rule:'E6', verdict:'판단 보류', isError:false, blocksComplete:false,
            reason:'간이영수증이 구매영수증 자리에 제출됐습니다. 발행처가 면세사업자라면 ' +
                   '정상입니다(면세사업자는 세금계산서를 발행할 수 없습니다) — 면세 여부 확인이 필요합니다' +
                   (x.issuerBizNo ? ' · 발행처 ' + x.issuerBizNo : '')};
  }
  return {rule:'E6', verdict:'확인 권장', isError:true, blocksComplete:false,
          reason:'제출물은 ' + x.docKind + '입니다 — 구매영수증 자리에는 증빙으로 쓸 수 없습니다 ' +
                 '(기관 업무지침). 유효한 구매영수증 또는 매입세금계산서를 다시 요청해 주세요'};
}

/* ── E2-b. 구매일 ≤ 기부일 (추출값 issueDate 사용) ───────────
   ★ 어느 서류의 날짜를 구매일로 볼지 반드시 지정한다.
     문서 하나에 날짜가 여러 개(작성일·공급일·거래일시·승인일시) 있어서,
     지정하지 않으면 아무 날짜나 골라 온다 — 루브릭이 못박은 오탐 자리다.
     (judge.js 는 '거래일자 우선, 없으면 작성일자'로 이미 한 번 좁혀 보낸다)

   ⚠️ 세금계산서를 1순위 근거로 쓰지 않는다 — 거래 뒤에 발급되고,
     월합계세금계산서는 한 달치를 모아 다음 달 10일까지 발급할 수 있다.
     5월 거래분이 6월 자로 찍힐 수 있다는 뜻이다. 그래서 신뢰도를 낮게 두고,
     세금계산서밖에 없을 때는 사유를 '구매 전 기부'가 아니라 '일자 확인 필요'로 적는다.
     단정하면 정상 거래를 오류로 몰게 된다. */
var E2_DOC_RANK = {'거래명세표':1, '구매영수증':1, '간이영수증':2, '세금계산서':3};

/* 이 건의 첨부 중 구매일 근거로 가장 우선하는 순위 — 위쪽 서류가 있으면 아래쪽은 참고만 한다 */
function e2BestRank(c){
  var best = null;
  (c.checklist || []).forEach(function(it){
    var f = it.r && it.r.facts;
    if (!f || !toDate(f.issueDate)) return;
    var r = E2_DOC_RANK[f.docKind];
    if (r && (best === null || r < best)) best = r;
  });
  return best;
}

function checkE2Purchase(c, it, x){
  if (!x) return null;
  var rank = E2_DOC_RANK[x.docKind];
  if (!rank) return null;                       /* 구매일 근거가 되는 서류가 아니다 (물품사진·인수증 등) */

  var give = toDate((c.donation || {}).donationDate);
  if (!give) return null;                       /* 기부일이 없다는 사실은 checkE2()가 이미 남긴다 — 두 번 적지 않는다 */

  var buy = toDate(x.issueDate);
  if (!buy){
    if (saidUnreadable(x, 'issueDate')){
      return {rule:'E2', axis:'구매→기부', verdict:'판단 보류', isError:false, blocksComplete:false,
              reason:'서류(' + x.docKind + ')의 거래일자를 읽지 못했습니다 — 담당자가 직접 확인해 주세요'};
    }
    return null;                                /* 서류에 날짜가 없는 것은 정상일 수 있다 */
  }
  /* 더 믿을 만한 서류가 함께 제출돼 있으면 그쪽이 판정한다 — 같은 건에 E2가 두 번 뜨지 않게.
     ⚠️ best 가 null 일 때 그냥 비교하면 안 된다 — null 은 0 으로 취급돼
        '내 순위가 더 낮다'가 되어 판정이 통째로 사라진다. */
  var best = e2BestRank(c);
  if (best !== null && rank > best) return null;

  if (buy <= give){
    return {rule:'E2', axis:'구매→기부', verdict:'이상 없음', isError:false, blocksComplete:false,
            reason:'구매일이 기부일보다 앞섭니다 · 구매일 ' + buy + ' → 기부일 ' + give + ' (' + x.docKind + ' 기준)'};
  }
  /* 순서가 뒤집혔다 — 다만 세금계산서는 '늦게 발급된 것'일 수 있어 단정하지 않는다 */
  if (x.docKind === '세금계산서'){
    return {rule:'E2', axis:'구매→기부', verdict:'확인 권장', isError:true, blocksComplete:false,
            reason:'일자 확인 필요 — 세금계산서 일자(' + md(buy) + ')가 기부일(' + md(give) + ')보다 늦습니다. ' +
                   '세금계산서는 거래 뒤에 발급되고 월합계분은 다음 달로 넘어갈 수 있어 ' +
                   '구매 전 기부로 단정하지 않습니다. 거래명세표가 있으면 그 거래일자로 확인해 주세요'};
  }
  return {rule:'E2', axis:'구매→기부', verdict:'확인 권장', isError:true, blocksComplete:false,
          reason:'구매일(' + md(buy) + ')이 기부일(' + md(give) + ')보다 늦음 — ' +
                 '기부한 다음에 산 것으로 등록돼 있습니다 (' + x.docKind + ' 기준)'};
}

/* ── E8. 사진 자리에 사진이 아닌 것이 왔다 ────────────────────────────
   ★ 2026-09-03 · 실제 후원 서류 12건을 훑다가 드러났다(유진 `run-survey`).
     `붙임2. 기부물품 사진_채움컴퍼니.pdf` 를 열어 보니 **사진이 아니라 롯데월드 예매 내역**이었다.
     AI 는 그것을 '구매영수증' 이라 하고 금액까지 뽑았다 — **AI 잘못이 아니다.** 실제로 값이 있는 문서다.

   ★ 진짜 문제는 이것이다 — **받아야 할 것(물품 사진)을 못 받았는데 자리는 채워졌다.**
     담당자 화면에는 "제출됨" 으로 뜬다. 후원자 실수를 시스템이 못 잡는다.
     ⚠️ 우리 솔루션이 없애려던 바로 그 일이다.

   ⚠️ 규칙이 **한 줄도 없었다.** E6 은 `key !== 'proof_buy'` 로 시작해 구매영수증 자리만 본다.
     `rules-compare.js` 안에서 'photo' 등장 횟수가 0 이었다(유진 확인).

   ★ 어떻게 가르나 — `DOC_KINDS` 13종에 **'사진' 이 없다.**
     그래서 진짜 물품사진은 갈 곳이 없어 '기타'·'판독불가' 로 온다
     (9/3 실제 표본 5건: 기타 4 · 판독불가 1).
     즉 **문서 종류로 분류됐다는 것 자체가 "사진이 아니다" 는 신호다.**

   ⚠️ 이건 (1)단계다. '기타' 로 온 이상한 문서는 못 잡는다 —
     제대로 하려면 `DOC_KINDS` 에 '사진' 을 넣고 사진 자리엔 '사진' 만 통과시켜야 한다(2단계).
     스키마(judge.js `DOC_KINDS` enum)를 건드리므로 회귀가 필요하다. 유진 출국(9/7) 전에 함께 본다. */
/* ★ 2026-09-04 — judge.js `DOC_KINDS` 에 '사진' 을 넣었다(2단계 착수 · 유진).
     ⚠️ 이 줄을 같이 안 고치면 **정상 건이 전부 지적된다** — 진짜 사진이 이제 '사진' 으로
       돌아오는데 아래 통과 목록에 '사진' 이 없으면 E8 이 "사진이 아니라 서류로 읽힙니다" 를 낸다.
       enum 을 늘리면 그 enum 을 읽는 쪽이 같이 움직여야 한다는 것을, 오늘 요청서에 쓴
       "같은 파일 안에서 규칙이 갈린다" 와 같은 자리에서 확인했다.

   ★ 실측하고 좁혔다 — `run-survey.mjs` 2회, 실제 사진 5건이 **전부 '사진'** 으로 왔다
     (9/3 넣기 전에는 기타 4 · 판독불가 1). 그래서 '기타'·'판독불가' 를 뺀다.
     빼기 전에는 사진 자리에 온 롯데월드 예매 내역을 '기타' 로 부르면 그냥 통과했다.

   ⚠️ '판독불가' 를 뺀 것이 이 변경의 무게다 — 흐릿한 사진을 AI 가 '판독불가' 라 하면
     이제 '확인 권장' 이 뜬다. 그래도 막지 않는다(blocksComplete:false) — 담당자가 보고 넘긴다.
     "못 읽었다" 를 조용히 통과시키는 것보다 담당자에게 한 번 보여주는 쪽이 맞다.
     ★ 이 줄을 되돌리려면 아래 배열에 되돌릴 종류를 넣으면 된다.
       smoke-test-ai.mjs 의 [K] 묶음이 이 결정을 지킨다. */
var PHOTO_SLOTS   = ['photo', 'dist_photo'];        /* 물품사진 · 배분 물품 사진 */
var PHOTO_KINDS   = ['사진'];                        /* 사진 자리에서 통과시키는 종류 */

function checkE8(c, it, x){
  if (!x || !it) return null;
  if (PHOTO_SLOTS.indexOf(it.key) < 0) return null;          /* 사진 자리 규칙이다 */
  if (!x.docKind) return null;                               /* 종류를 못 읽었으면 여기서 판정하지 않는다 */
  if (PHOTO_KINDS.indexOf(x.docKind) >= 0) return null;      /* 사진이다 — 통과 */

  /* 막지 않는다(blocksComplete:false) — 담당자가 보고 판단한다.
     사진을 문서로 잘못 읽는 경우가 있을 수 있고, 그때 완결을 막으면 정상 건이 멈춘다. */
  if (x.docKind === '판독불가'){
    return {rule:'E8', verdict:'판단 보류', isError:false, blocksComplete:false,
            reason:'물품 사진 자리의 파일을 읽지 못했습니다 — 사진인지 서류인지 가릴 수 없습니다. ' +
                   '담당자가 직접 열어 확인해 주세요'};
  }
  /* ★ 2026-09-04 두 번째 고침 — '확인 권장 · isError:true' 였던 것을 '판단 보류 · isError:false' 로 내린다.
       실무 확인(유진): **물품 사진을 애초에 올릴 수 없는 건이 있다.**
       실물이 없는 물품(이용권·입장권 등)이 그렇다. 실제 표본의 롯데월드 예매 내역이 그 경우다.
     ⚠️ 그러면 우리는 두 가지를 **구분할 수단이 없다** —
         ① 후원자가 사진을 안 내고 엉뚱한 것을 올렸다   (잡아야 한다)
         ② 사진을 낼 수 없는 물품이라 증빙을 올렸다     (정상이다)
       구분 못 하는데 '오류' 로 세면, ②가 통계에 오류로 쌓이고 담당자는 매번 정상 건을 지적당한다.
     ★ 그래서 통과도 지적도 아닌 **판단 보류** 로 사람에게 넘긴다 —
       E6 의 간이영수증(면세사업자면 정상이라 단정 못 한다)과 **같은 자리**다.
       "확정할 수단이 없으면 단정하지 않는다" 가 이 코드가 지켜 온 규칙이다.
     ⚠️ 문구도 바꾼다. 예전 문구(*"받아야 할 물품 사진이 빠졌는지"*)는 **후원자 잘못을 전제**했다. */
  /* ★ '기타' 는 서류가 아니다 (2026-09-12 선미 · #308 우산 이미지) — 13종 어디에도 못 넣었다는 뜻이다.
       "기타이(가) 올라왔습니다 — 서류로 읽힙니다" 는 담당자가 읽을 수 없는 말이었다. 종류를 댈 수 있을 때만 댄다. */
  if (x.docKind === '기타'){
    return {rule:'E8', verdict:'판단 보류', isError:false, blocksComplete:false,
            reason:'물품 사진 자리의 파일을 AI가 사진으로 알아보지 못했습니다(그림·합성 이미지·서류 아닌 것일 수 있습니다). ' +
                   '실물 사진이 맞으면 그대로 수취 처리하고, 아니면 후원자에게 사진을 다시 받아 주세요 — 담당자가 열어 확인해 주세요'};
  }
  return {rule:'E8', verdict:'판단 보류', isError:false, blocksComplete:false,
          reason:'물품 사진 자리에 ' + x.docKind + '이(가) 올라왔습니다 — 사진이 아니라 서류로 읽힙니다. ' +
                 '사진을 찍을 수 없는 물품(이용권·입장권 등)이라 증빙을 대신 올린 것일 수 있고, ' +
                 '사진을 빠뜨린 것일 수도 있습니다 — 담당자가 열어 확인해 주세요'};
}

/* 첨부 1건의 추출 결과로 낼 수 있는 판정 전부 */
function extractedFindings(c, it, x){
  return [checkExtractionGaps(x, it), checkUnitPriceGap(x, it), checkE2Purchase(c, it, x),
          checkE4(c, x), checkE5(c, x), checkE6(c, it, x), checkE8(c, it, x)].filter(Boolean);
}
