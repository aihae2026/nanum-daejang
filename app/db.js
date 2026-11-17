/* ════════════════════════════════════════════════════════════
   db.js — 데이터 계층 ★ 4명의 계약서
   지금: 브라우저 메모리 객체(예선 데모 데이터 그대로)
   목표: 이 파일의 함수들을 Supabase 호출로 바꾼다 (화면 코드는 그대로 두고)
   테이블·컬럼 이름의 정본: schema.sql + (미공개 내부 기록)
   담당: 승희(스키마) · 화면↔DB 연결은 각 화면 담당이 이 파일의 함수만 통해서
   ════════════════════════════════════════════════════════════ */
/* 테이블 8개 — 1단계 (저장이 성립하는 최소선)
   이름을 바꿀 때는 설계안(§2) → schema.sql → 이 블록 순서로 함께 바꾼다 */
var T = {
  donation:        'donation',         /* ① 후원 건 (원장) — donor 테이블 없음, 법인명·법인 사업자번호는 여기에 */
  distribution:    'distribution',     /* ② 배분처 — 이 테이블 하나로 다기관 배분 성립 */
  checklistItem:   'checklist_item',   /* ③ 이 건에 확정된 체크리스트 (기준의 스냅샷 복사본) */
  attachment:      'attachment',       /* ④ 첨부파일 — 재제출 이력 보존 (1:N) */
  formSubmission:  'form_submission',  /* ⑤ 폼 제출본 — ★ 개인정보 분리 지점 (payload=대조값만, 개인정보는 PDF에만) */
  staff:           'staff',            /* ⑥ 담당자 계정 (인증은 Supabase Auth, 여기는 역할·상태) */
  accessLink:      'access_link',      /* ⑦ 접수·증빙 제출 링크 (토큰은 해시만 저장) */
  auditLog:        'audit_log',        /* ⑧ 감사 로그 — pdf.view / bulk.download / purge.execute 3종이 핵심 */

  /* 2단계 — AI 실판정 (§3). 2026-08-28 승희가 유진 E1 작업용으로 앞당겨 생성 */
  inspection:        'inspection',         /* ⑨ 검수 실행 1회 */
  inspectionFinding: 'inspection_finding'  /* ⑩ 판정 낱개 — AI 의견은 여기에만 쌓인다 */
};

var COL = {
  /* ① donation */
  donation: {
    id:'id',
    caseNo:'case_no',                    /* 표시용 건 번호 ('103') */
    state:'state',                       /* '접수 검토' | '검수 대기' | '완결' */
    donorType:'donor_type',              /* '법인' | '법인외' */
    donorName:'donor_name',              /* ★ 법인일 때만 상호 저장 · 법인 외는 NULL */
    donorBizNo:'donor_biz_no',           /* ★ 법인 사업자번호만 · 개인사업자는 NULL */
    isCorpVerified:'is_corp_verified',   /* 사업자번호 중간자리 판정 결과 (bool) */
    vatDeduction:'vat_deduction',        /* ★ 매입세액공제 여부 '예'|'아니오'|'모름' (기관 업무지침)
                                            E1이 서류의 공급가액과 합계 중 무엇과 대조할지를 가른다.
                                            면세사업자 여부와는 별개 항목 — 2026-08-28 추가 */
    acquisitionPath:'acquisition_path',  /* '구매' | '제조·유통' */
    itemName:'item_name',
    qty:'qty',                           /* ★ 접수 총수량(낱개) — 배분 수량 합계와 대조하는 기준(E7) */
    qtyAsReceived:'qty_as_received',     /* 서류에 적힌 수량 그대로 (400)      ┐ 단위 3종 */
    qtyUnit:'qty_unit',                  /* 서류의 단위 ('박스'·'포'·'묶음'…)   ├ 팀 결정 8/28 */
    packSize:'pack_size',                /* 1단위당 낱개 수 (12) — 환산은 사람 몫 ┘ (E4) */
    unitPrice:'unit_price',
    bookValue:'book_value',
    fairValue:'fair_value',
    vatDeduction:'vat_deduction',        /* ★ 매입세액공제 여부 — E1이 무엇과 대조할지를 가른다.
                                            공제 받는 법인은 부가세를 뺀 공급가액으로 신고한다(기관 업무지침).
                                            ⚠️ **DB 는 텍스트 '예'|'아니오'|'모름'** 이고(patch-20260828-vat.sql 의 check 제약),
                                              화면·판정은 true/false/null 을 쓴다. 경계에서 vatToDb/vatFromDb 가 바꾼다 —
                                              2026-09-12 에 폼 칸을 붙이며 드러났다(HTTP 400 · 23514 donation_vat_deduction_check).
                                            null(모름)은 통과시키지 않고 '확인 권장' (루브릭 §2-E1) · 컬럼 추가 선미 8/31 */
    donationDate:'donation_date',        /* ★ 기부일 — 신청서의 '후원일자' 칸이 정본(루브릭 §2-E2).
                                            E2(일자 선행) 판정 기준값.
                                            ⚠️ arriveDate(물품 도착일)·inDate(접수일)와 다른 날짜다 —
                                              하단 서명일도 아니다(서명은 미리 할 수 있다) · 컬럼 추가 선미 8/31 */
    arriveDate:'arrive_date',
    inDate:'in_date',
    deadline:'deadline',
    submittedVia:'submitted_via',        /* '링크 제출' | '전화 문의 후 대리등록' | '공문' */
    purpose:'purpose',
    wantsReceipt:'wants_receipt',
    criteriaKey:'criteria_key',          /* ★ 기준 스냅샷 — 판단에 쓴 기준자료 버전 */
    completedAt:'completed_at',
    transferredAt:'transferred_at',      /* ★ 기존 시스템 이관 완료 시각 */
    purgeDue:'purge_due',                /* ★ 파기 예정 — 기부일자 + 1년 (2026-09-04 결정 · 전에는 완결 익년 12/31) */
    purgedAt:'purged_at',
    createdBy:'created_by',
    createdAt:'created_at', updatedAt:'updated_at'
  },

  /* ② distribution */
  distribution: {
    id:'id',
    donationId:'donation_id',
    orgName:'org_name',
    orgContact:'org_contact',            /* ★ 개인정보 — Supabase 기본 암호화로 갈음(팀 결정 8/28) · 증빙 제출 완료 시 즉시 삭제 */
    qty:'qty',                           /* ★ 이 기관에 배분한 수량(낱개) — 합계가 donation.qty와 같아야 함 (코드 단독 대조) */
    qtyAsReceived:'qty_as_received',     /* 인수증에 적힌 수량 그대로  ┐ 단위 3종 */
    qtyUnit:'qty_unit',                  /* 인수증의 단위             ├ 팀 결정 8/28 */
    packSize:'pack_size',                /* 1단위당 낱개 수           ┘ */
    distDate:'dist_date',
    memo:'memo',
    state:'state',                       /* '배분 확정' | '증빙 대기' | '증빙 완료' */
    /* ★ 취소는 state 가 아니라 따로 둔다 (patch-20260911-dist-cancel.sql)
         state 는 '어디까지 진행됐나'이고 취소는 '이 행이 살아 있나'라 축이 다르다.
         E7 합계도 cancelled_at IS NULL 하나로 갈린다. 행은 지우지 않는다 —
         언제 누가 왜 물렸는지가 남아야 한다(access_link 무효화와 같은 규칙). */
    cancelledAt:'cancelled_at',
    cancelReason:'cancel_reason',
    cancelledBy:'cancelled_by',
    createdBy:'created_by',
    createdAt:'created_at'
  },

  /* ③ checklist_item */
  checklistItem: {
    id:'id',
    donationId:'donation_id',
    distributionId:'distribution_id',    /* ★ NULL=접수 단계 서류 · 값 있음=배분 단계(배분처마다 한 벌) */
    docKey:'doc_key',                    /* 'appl_corp' | 'proof_buy' | 'photo' | 'inss' | 'report_dom' ... */
    docName:'doc_name',
    kind:'kind',                         /* 폼필드 | 폼제출 | 첨부파일 */
    stage:'stage',                       /* '접수' | '배분' */
    owner:'owner',                       /* '후원자 발급' | '배분처 수취' | '폼 필드' */
    basis:'basis',                       /* 근거 조항 ('기관 업무지침 · 유형별 필수서류') */
    dueDate:'due_date',
    included:'included',
    note:'note',
    status:'status',                     /* '미수취' | '수취완료' | '확인필요' — ★ 담당자 확정값 전용, AI는 쓰지 않는다 */
    /* ★ 사유 해소 3종 (patch-20260902-checklist-resolution.sql)
         status 는 그대로 두고 여기에 사유를 적는다 — 실제로 받은 것과
         사유로 넘어간 것을 구분해야 감사에서 답할 수 있다. */
    resolutionReason:'resolution_reason',
    resolvedBy:'resolved_by',
    resolvedAt:'resolved_at',
    confirmedBy:'confirmed_by',
    confirmedAt:'confirmed_at',
    createdAt:'created_at'
  },

  /* ④ attachment */
  attachment: {
    id:'id',
    checklistItemId:'checklist_item_id',
    fileName:'file_name',
    fileSize:'file_size', mimeType:'mime_type',
    storageKey:'storage_key',            /* ★ 파일 저장소 키 — DB에 파일 자체를 넣지 않는다 */
    uploadedByRole:'uploaded_by_role',   /* 'donor' | 'org' | 'staff' */
    uploadedByRef:'uploaded_by_ref',
    uploadedAt:'uploaded_at',
    isCurrent:'is_current',              /* 최신 제출본만 true */
    supersededBy:'superseded_by',        /* 재제출 시 앞 건을 가리킴 */
    purgedAt:'purged_at'                 /* ★ 파일 파기 후에도 행은 남는다 */
  },

  /* ⑤ form_submission — ★ 개인정보 분리 지점 */
  formSubmission: {
    id:'id',
    donationId:'donation_id',
    distributionId:'distribution_id',    /* ★ NULL 허용 (인수증은 배분처별) */
    formType:'form_type',                /* '물품기부신청서(법인)' | '물품기부신청서(법인외)' | '인수증' */
    payload:'payload',                   /* JSON ← ★ 대조용 값만. 개인정보 제외 */
    pdfKey:'pdf_key',                    /* ★ 이름·주민번호·연락처·주소·전자서명은 이 PDF 안에만 */
    signed:'signed',                     /* 서명 여부만 (이미지는 PDF 안에) */
    submitterRole:'submitter_role',      /* 'donor' | 'org' | 'staff'(대리작성) */
    accessLinkId:'access_link_id',
    submittedAt:'submitted_at',
    purgedAt:'purged_at'
  },

  /* ⑥ staff */
  staff: {
    id:'id',
    name:'name', email:'email',
    role:'role',                         /* 'staff' 담당자 | 'admin' 관리자 */
    status:'status',                     /* 'active' | 'disabled' */
    createdAt:'created_at', lastLoginAt:'last_login_at'
  },

  /* ⑦ access_link */
  accessLink: {
    id:'id',
    donationId:'donation_id',
    distributionId:'distribution_id',    /* ★ NULL=후원자 접수 링크(건당 1장) · 값=배분 증빙 링크(배분처마다 1장) */
    purpose:'purpose',                   /* 'intake' | 'dist_proof' */
    tokenHash:'token_hash',              /* ★ 원문 토큰은 저장하지 않는다 (해시만) */
    verifyHint:'verify_hint',            /* ★ 전화번호 뒤 4자리 — 해시가 어려우면 뒤 4자리만 저장(정책: 원문 전체번호는 저장 안 함) */
    expiresAt:'expires_at',
    usedAt:'used_at',
    revoked:'revoked',
    issuedBy:'issued_by', issuedAt:'issued_at',
    /* ── 발송 ── */
    recipientEnc:'recipient_enc',        /* ★ 수신 연락처 — Supabase 기본 암호화로 갈음(팀 결정 8/28) · used_at 기록 시 즉시 삭제 (§2-⑦ C안) */
    sentAt:'sent_at',
    sentChannel:'sent_channel',          /* '문자' | '유선 안내' | '직접 전달' */
    sentStatus:'sent_status',            /* 'success' | 'failed' */
    sentError:'sent_error',
    sentBy:'sent_by',
    resendCount:'resend_count'
  },

  /* ⑧ audit_log */
  auditLog: {
    id:'id',
    actorType:'actor_type',              /* 'staff' | 'donor' | 'org' | 'system' */
    actorRef:'actor_ref',                /* staff id 또는 access_link id */
    action:'action',                     /* 'case.create' 'dist.create' 'item.confirm' 'case.complete'
                                            'file.upload' 'link.issue' 'link.sent' 'inspection.run'
                                            ★ 'pdf.view' 'bulk.download' 'purge.execute' */
    targetType:'target_type', targetId:'target_id',
    beforeValue:'before_value', afterValue:'after_value',
    ip:'ip', userAgent:'user_agent',
    occurredAt:'occurred_at'
  },

  /* ⑨ inspection — 검수 실행 1회 (2단계) */
  inspection: {
    id:'id',
    donationId:'donation_id',
    criteriaKey:'criteria_key',          /* ★ 실행 시점의 기준 버전 (donation에서 복사) */
    rubricVersion:'rubric_version',      /* ★ 검수 기준서 버전 (예: 'v4-20260828') */
    model:'model',                       /* 모델명 */
    promptHash:'prompt_hash',            /* 프롬프트 지문 — 재현성 */
    status:'status',                     /* 'success' | 'timeout' | 'quota' | 'parse_error' */
    startedAt:'started_at', finishedAt:'finished_at',
    triggeredBy:'triggered_by'
  },

  /* ⑩ inspection_finding — 판정 낱개 */
  inspectionFinding: {
    id:'id',
    inspectionId:'inspection_id',
    layer:'layer',                       /* '슬롯' | '대조' (루브릭 §2 두 층) */
    checklistItemId:'checklist_item_id', /* ★ NULL 허용 — 대조 판정은 어느 슬롯에도 속하지 않는다 */
    distributionId:'distribution_id',    /* E7 배분 수량 대조용 */
    ruleCode:'rule_code',                /* 'E1'~'E7' · NULL = 슬롯 판정 */
    verdict:'verdict',                   /* ★ AI 전용 4값: 이상 없음 | 확인 권장 | 판단 보류 | 대기중
                                            — '수취완료'는 담당자 전용, AI가 쓰지 않는다 (루브릭 §0-1) */
    reason:'reason',                     /* 사유 1문장 */
    extractedValue:'extracted_value',    /* AI가 서류에서 읽은 값  ┐ */
    systemValue:'system_value',          /* 시스템 등록값          ├ 감사 방어 3종 */
    /* ★ 사유 해소 3종 (patch-20260901-finding-resolution.sql) —
         "담당자가 이 판정을 왜 넘어갔는가". 완결 게이트를 통과시킨 근거라 감사 대상이다.
         감사 방어 3종 바로 옆에 두어, 무엇을 보고 넘어갔는지가 같은 행에 남는다. */
    resolutionReason:'resolution_reason',
    resolvedBy:'resolved_by',
    resolvedAt:'resolved_at',
    facts:'facts',                       /* ★ AI 가 뽑은 값 전체(jsonb · patch-20260911-finding-facts) — 새로고침 뒤 되살려 E4 세트 판정이 영수증을 잃지 않게 */
    sourceFile:'source_file',            /* 근거 파일명            ┘
                                            ⚠️ extracted_value에 상호·사업자번호가 섞이지 않도록
                                               프롬프트에서 금액·수량·날짜만 넣게 제한할 것 (설계안 §8-5) */
    createdAt:'created_at'
  }
};

/* ══════════════════════════════════════════════════════════════
   DB — 전역 단일 객체. render()가 유일한 그리기 경로 (단방향)
   ══════════════════════════════════════════════════════════════ */
function mkItem(o){
  /* dbId — checklist_item 의 실제 PK. 데모 항목은 null 이다.
     ★ attachment.checklist_item_id 가 NOT NULL 이라 첨부를 저장하려면 이 값이 있어야 한다.
       예전에는 여기서 버려져서 화면이 항목의 DB 자리를 몰랐다(2026-09-01 유진). */
  /* uid — 이 건 안에서 항목을 가리키는 '유일한' 이름.
     ★ key 만으로는 다기관에서 겹친다. 늘봄 인수증과 복지관 인수증이 둘 다 'inss' 라
       화면이 어느 쪽을 말하는지 구분할 방법이 없었다.
     ★ 순번(#1#2#3)이 아니라 distribution_id 를 쓴다 —
       기관을 하나 지우면 순번이 밀려서 저장해 둔 uid 가 **다른 기관을 가리킨다**(연수 지적). */
  return {key:o.key, n:o.n, dbId:o.dbId || null, distId:o.distId || null,
          uid:o.key + (o.distId ? '#' + o.distId : ''),
          g:o.g || '', basis:o.basis || '', due:o.due || '', kind:o.kind || 'A',
          stage:o.stage || '접수', included:(o.included !== false), note:o.note || '',
          r:Object.assign({st:'miss', orgUpload:{status:'none'}}, o.r || {})};
}

var DB = {
  /* UI 상태 — role × screen 직교 2차원 */
  role:'staff', screen:'home', caseId:'103', tab:'auto',   /* 건 상세 = 진행바 단계 · 'auto' = 지금 단계 (2026-09-11 · 전에는 'receipts' 탭 · M-5) */
  preview:null, viewer:null, intakeView:null,   /* intakeView: 신청서 원문 팝업(건 id) — 페이지 이동 없이 뷰어처럼 띄운다 */
  receiptView:null,   /* 인수증 원문 팝업(건 id) — 신청서 원문과 같은 패턴 */
  nav:{stack:[], fwd:[]},
  inspecting:false, inspectStage:'', inspectResult:null, inspectCaseId:null,
  toast:null,
  promptProfile:'foundation',
  distForm:{caseId:null, orgName:'', memo:''},   /* [배분결정] 입력 상태 */

  /* ── Phase 3 폼 상태 (후원자 · 배분기관) ──
     후원자 폼은 담당자가 발송한 접수 링크의 건(linkCaseId)에 바인딩된다 (PRD Q3). */
  /* ★ donDate 는 **비워 둔다** (2026-09-06 선미 M-1) — 전에는 TODAY 가 박혀 있었다.
       다른 칸은 흐린 예시(placeholder)인데 이 칸만 실제 값이라, 후원자에게는
       '남이 써 놓은 값을 고치는' 모양이 된다. 그대로 넘어가면 기부한 날이 아니라
       **폼을 연 날**이 기록으로 남는다. 값은 후원자가 넣는다.
       ⚠️ prefillDonor()(데모 전용 기본값 채우기)는 그대로 오늘을 채운다 — 시연용이다. */
  donorForm:{donorType:'법인', donorName:'', path:'구매', donDate:'', addr:'', phone:'',
    wantsReceipt:true, bizNo:'', rrn:'', idKind:'rrn', vatDeduction:null, purpose:'지역 아동 생필품 지원',   /* vatDeduction — null = 모름 (2026-09-12 선미) */
    guardianName:'', guardianPhone:'', guardianRelation:'',   /* ★ rrn·법정대리인 셋은 신청서 PDF 에만 찍힌다 — DB 로 가지 않는다 */
    itemName:'', qty:'', pkg:'', unitBook:'', unitSale:'', giftVal:'', saleVal:'', note:'',
    agreePurpose:false, agreeDouble:false, privacy:false, under14:false, guardian:false,
    files:{}, signed:false, signImg:null, submittedId:null, linkCaseId:null},
  /* [v6] 배분기관 증빙 제출 폼 — 후원자 폼과 대칭 구조(링크 바인딩·본인확인·제출 시 폐기)
     인수증은 실물 양식(구분·수량·받은 날짜·수령자명·기관명·서명)을 폼으로 작성한다 (2026-07-28) */
  orgForm:{linkCaseId:null, verified:false, verifyInput:'', verifyTries:0,
    receiverName:'', recvQty:'', recvPkg:'', recvDate:TODAY, signed:false, signImg:null,
    confirm:false, files:{}, submittedId:null},

  /* ── 원장(ledger) ── */
  cases:[
    {id:'101', state:'완결', donor:'OO식품 주식회사', donorType:'법인', item:'라면 500박스',
     inDate:'2026-06-18', deadline:'2026-07-10', orgId:'nulbom', orgName:'늘봄지역아동센터',
     criteriaKey:'fnd_guideline_2026', submittedVia:'링크 제출',
     donation:{itemName:'라면 500박스', qty:500, unitPrice:12000, book:6000000, fair:6000000, donationDate:'2026-06-16', arriveDate:'2026-06-18', donorType:'법인'},
     checklist:[
       mkItem({key:'bizno_fmt', n:'사업자등록번호 형식', kind:'F', g:'폼 필드', basis:'기관 업무지침 · 사업자번호 (코드 검증)', due:'2026-06-25',
         note:'후원자구분(법인) ↔ 사업자번호 중간자리 대조', r:{st:'done', date:'2026-06-18', by:'담당자', file:''}}),
       mkItem({key:'appl_corp', n:'물품기부신청서(법인용)', kind:'S', g:'폼 제출', basis:'기관 업무지침 · 유형별 필수서류', due:'2026-06-25',
         note:'접수 링크 폼으로 작성·전자서명 — 별도 파일 첨부 없음',
         r:{st:'done', date:'2026-06-19', by:'담당자 원문 확인', formSubmit:{status:'confirmed', date:'2026-06-19', signed:true}}}),
       mkItem({key:'proof_buy', n:'구매영수증 또는 매입세금계산서', kind:'A', g:'후원자 발급', basis:'기관 업무지침 · 유형별 필수서류', due:'2026-06-25',
         r:{st:'done', date:'2026-06-19', by:'담당자', file:'매입세금계산서_OO식품.pdf (238KB)'}}),
       mkItem({key:'photo', n:'물품사진', kind:'A', g:'후원자 발급', basis:'기관 업무지침 · 물품사진', due:'2026-06-25',
         r:{st:'done', date:'2026-06-19', by:'담당자', file:'물품사진_4장.zip (2.1MB)'}}),
       mkItem({key:'inss', n:'인수증', kind:'A', g:'배분처 수취 — 늘봄지역아동센터', stage:'배분', basis:'기관 업무지침 · 인수증 양식', due:'2026-07-05',
         r:{st:'done', date:'2026-07-02', by:'담당자', file:'인수증_늘봄.pdf (301KB)', orgUpload:{status:'uploaded', date:'2026-07-01', fileName:'인수증_늘봄.pdf'}}}),
       mkItem({key:'report_dom', n:'배분 결과보고서(국내지원)', kind:'A', g:'배분처 수취 — 늘봄지역아동센터', stage:'배분', basis:'기관 업무지침 · 결과보고서 양식', due:'2026-07-10',
         r:{st:'done', date:'2026-07-08', by:'담당자', file:'결과보고_늘봄.hwp (156KB)'}})
     ]},

    {id:'103', state:'검수 대기', donor:'주식회사 온누리식품', donorType:'법인', item:'즉석밥 3종 세트 400박스',
     inDate:'2026-06-30', deadline:'2026-07-25', orgId:'nulbom', orgName:'늘봄지역아동센터',
     criteriaKey:'fnd_guideline_2026', submittedVia:'링크 제출',
     donation:{itemName:'즉석밥 3종 세트', qty:400, unitPrice:12500, book:5000000, fair:300000, donationDate:'2026-06-28', arriveDate:'2026-06-30', donorType:'법인'},
     checklist:[
       mkItem({key:'bizno_fmt', n:'사업자등록번호 형식', kind:'F', g:'폼 필드', basis:'기관 업무지침 · 사업자번호 (코드 검증)', due:'2026-07-05',
         note:'후원자구분(법인) ↔ 사업자번호 중간자리 대조 — 220-81-45012', r:{st:'done', date:'2026-06-30', by:'담당자'}}),
       mkItem({key:'appl_corp', n:'물품기부신청서(법인용)', kind:'S', g:'폼 제출', basis:'기관 업무지침 · 유형별 필수서류', due:'2026-07-05',
         note:'접수 링크 폼으로 작성·전자서명 — 별도 파일 첨부 없음',
         r:{st:'done', date:'2026-07-01', by:'담당자 원문 확인', formSubmit:{status:'confirmed', date:'2026-07-01', signed:true}}}),
       mkItem({key:'proof_buy', n:'구매영수증 또는 매입세금계산서', kind:'A', g:'후원자 발급', basis:'기관 업무지침 · 내용 대조 규칙', due:'2026-07-25',
         note:'AI 첨부 내용 판정 대상',
         r:{st:'unc', date:'2026-07-02', by:'담당자', file:'구매영수증_온누리.pdf (204KB)',
            memo:'신고 장부가액과 증빙 금액이 크게 어긋납니다',
            ai:'신고 장부가액과 증빙 금액이 크게 어긋납니다 — 단정하지 않고 \'확인 권장\'으로 담당자에게 넘깁니다',
            calc:{book:5000000, fair:300000}}}),
       mkItem({key:'photo', n:'물품사진', kind:'A', g:'후원자 발급', basis:'기관 업무지침 · 물품사진', due:'2026-07-05',
         r:{st:'done', date:'2026-07-01', by:'담당자', file:'물품사진_3장.zip (1.8MB)'}}),
       mkItem({key:'inss', n:'인수증', kind:'A', g:'배분처 수취 — 늘봄지역아동센터', stage:'배분', basis:'기관 업무지침 · 인수증 양식', due:'2026-07-20',
         r:{st:'miss', overdue:false, memo:'배분 후 인수증 수령 예정'}}),
       mkItem({key:'report_dom', n:'배분 결과보고서(국내지원)', kind:'A', g:'배분처 수취 — 늘봄지역아동센터', stage:'배분', basis:'기관 업무지침 · 결과보고서 양식', due:'2026-07-20',
         r:{st:'miss', overdue:false, memo:'인수증 선행 필요'}})
     ]},

    {id:'107', state:'검수 대기', donor:'OO교회', donorType:'법인', item:'쌀 20kg × 60포',
     inDate:'2026-06-25', deadline:'2026-07-20', orgId:null, orgName:'',
     criteriaKey:'fnd_guideline_2026', submittedVia:'링크 제출',
     donation:{itemName:'쌀 20kg', qty:60, unitPrice:55000, book:3300000, fair:3300000, donationDate:'2026-06-23', arriveDate:'2026-06-25', donorType:'법인'},
     checklist:[
       mkItem({key:'bizno_fmt', n:'사업자등록번호 형식', kind:'F', g:'폼 필드', basis:'기관 업무지침 · 사업자번호 (코드 검증)', due:'2026-07-01',
         r:{st:'done', date:'2026-06-25', by:'담당자'}}),
       mkItem({key:'appl_corp', n:'물품기부신청서(법인용)', kind:'S', g:'폼 제출', basis:'기관 업무지침 · 유형별 필수서류', due:'2026-07-01',
         note:'접수 링크 폼으로 작성·전자서명 — 별도 파일 첨부 없음',
         r:{st:'done', date:'2026-06-26', by:'담당자 원문 확인', formSubmit:{status:'confirmed', date:'2026-06-26', signed:true}}}),
       mkItem({key:'proof_buy', n:'구매영수증 또는 매입세금계산서', kind:'A', g:'후원자 발급', basis:'기관 업무지침 · 증빙불가 서류', due:'2026-07-01',
         note:'AI 첨부 내용 판정 대상',
         r:{st:'miss', date:'2026-06-26', by:'담당자', file:'견적서_쌀도매_OO상회.pdf (198KB)',
            memo:'파일은 올라왔지만 그 서류가 아닙니다',
            ai:'제출물이 견적서로 판독됩니다 — 거래명세표·견적서·단가표·간이영수증은 증빙 불가 서류입니다(기관 업무지침). 유효한 구매영수증 또는 매입세금계산서를 다시 요청해 주세요'}}),
       mkItem({key:'photo', n:'물품사진', kind:'A', g:'후원자 발급', basis:'기관 업무지침 · 물품사진', due:'2026-07-01',
         r:{st:'unc', date:'2026-07-11', by:'담당자', file:'IMG_2213.HEIC (4.8MB)',
            broken:'박스 외관만 촬영 — 내용물 확인 불가',
            ai:'박스 외관만 보입니다. 내용물이 확인되지 않아 단정하지 않고 \'판단 보류\'로 남깁니다 — 사진 적정성은 담당자 확인 영역입니다'}})
     ]},

    {id:'115', state:'접수 검토', donor:'(미입력)', donorType:'미입력', item:'문구 세트 200개',
     inDate:'2026-07-14', deadline:'—', orgId:null, orgName:'',
     criteriaKey:'fnd_guideline_2026', submittedVia:'전화 문의 후 대리등록',
     donation:{itemName:'문구 세트', qty:200, unitPrice:0, book:0, fair:0, donationDate:'2026-07-12', arriveDate:'2026-07-14', donorType:'미입력'},
     missingRequired:['후원자 유형(개인/법인)','후원자명','취득경로'],
     checklist:[]},

    /* [2026-09-02 연수] E3(가액 산정 방식) 완결 게이트 · 사유 해소 시연용.
       ★ 왜 새로 만들었나 — 기존 건은 데모·실 DB 모두 전 건에 장부가액이 있어서
         checkE3 의 `if (book) return null` 에서 넘어간다. E3 를 켜도 걸리는 건이
         하나도 없었다(2026-09-02 브라우저 확인). 켤 대상이 없으면 켤 이유도 없다.
       조건: 법인 · 장부가액 없음 · 시가 있음 · 사업자번호 중간자리가 영리(81~88).
       ⚠️ dists 는 접수 수량과 합계를 맞춰 둔다(300 = 300) — 맞으면 E7 은 '이상 없음' 이라
          완결을 막지 않는다. 빼면 distRemainingQty 가 전량으로 잡혀 배분처가 이미 정해진 건에
          [배분결정] 카드가 다시 열린다(2026-09-02 브라우저 확인).
          E2·E7 이 '이상 없음' 으로 함께 뜨는 편이 낫다 — 규칙이 여럿 도는 중에 E3 만 막는 것이 보인다.
       ⚠️ 접수·배분 항목을 전부 수취완료로 둔다 — '서류는 다 왔는데 대조만 막는' 상태라야
          사유 해소 동선이 드러난다(그 상태에서 요약과 게이트가 어긋나던 것은 43c0415 에서 고쳤다). */
    {id:'117', state:'검수 대기', donor:'(주)한빛유통', donorType:'법인', donorBizNo:'124-81-55678',
     item:'생수 2L 300박스',
     inDate:'2026-07-02', deadline:'2026-07-28', orgId:'nulbom', orgName:'늘봄지역아동센터',
     dists:[{id:'sd1', orgName:'늘봄지역아동센터', qty:300, distDate:'2026-07-15', memo:''}], distSeq:1,
     criteriaKey:'fnd_guideline_2026', submittedVia:'링크 제출',
     donation:{itemName:'생수 2L', qty:300, unitPrice:8000, book:0, fair:2400000,
               donationDate:'2026-06-30', arriveDate:'2026-07-02', donorType:'법인'},
     checklist:[
       mkItem({key:'bizno_fmt', n:'사업자등록번호 형식', kind:'F', g:'폼 필드', basis:'기관 업무지침 · 사업자번호 (코드 검증)', due:'2026-07-10',
         note:'후원자구분(법인) ↔ 사업자번호 중간자리 대조 — 124-81-55678 (81 = 영리법인)',
         r:{st:'done', date:'2026-07-02', by:'담당자'}}),
       mkItem({key:'appl_corp', n:'물품기부신청서(법인용)', kind:'S', g:'폼 제출', basis:'기관 업무지침 · 유형별 필수서류', due:'2026-07-10',
         note:'접수 링크 폼으로 작성·전자서명 — 별도 파일 첨부 없음',
         r:{st:'done', date:'2026-07-03', by:'담당자 원문 확인', formSubmit:{status:'confirmed', date:'2026-07-03', signed:true}}}),
       mkItem({key:'proof_buy', n:'구매영수증 또는 매입세금계산서', kind:'A', g:'후원자 발급', basis:'기관 업무지침 · 유형별 필수서류', due:'2026-07-10',
         note:'취득원가 증빙 없이 감정가로 신고된 건 — E3 가 여기를 짚는다',
         r:{st:'done', date:'2026-07-03', by:'담당자', file:'감정평가서_한빛유통.pdf (412KB)'}}),
       mkItem({key:'photo', n:'물품사진', kind:'A', g:'후원자 발급', basis:'기관 업무지침 · 물품사진', due:'2026-07-10',
         r:{st:'done', date:'2026-07-03', by:'담당자', file:'물품사진_2장.zip (1.1MB)'}}),
       mkItem({key:'inss', n:'인수증', kind:'A', g:'배분처 수취 — 늘봄지역아동센터', stage:'배분', basis:'기관 업무지침 · 인수증 양식', due:'2026-07-25',
         r:{st:'done', date:'2026-07-18', by:'담당자', file:'인수증_늘봄.pdf (288KB)'}}),
       mkItem({key:'report_dom', n:'배분 결과보고서(국내지원)', kind:'A', g:'배분처 수취 — 늘봄지역아동센터', stage:'배분', basis:'기관 업무지침 · 결과보고서 양식', due:'2026-07-28',
         r:{st:'done', date:'2026-07-22', by:'담당자', file:'결과보고_늘봄.hwp (142KB)'}})
     ]}
  ],

  /* [A] 2계층 (공통 기준층 + 기관 덧쓰기층) + registry */
  /* ★ 2026-09-14 — 여기 있던 `common`/`orgLayer` 두 표를 **없앴다**.
       관리자 화면 ①공통 기준층 · ②기관 덧쓰기층이 읽던 손으로 적은 사본이었는데,
       정본(common.js 의 DOC_MATRIX · DIST_DOCS)이 바뀌어도 안 따라와 **서류 5종이 빠져 있었다**
       (법인인감 날인 · 구매영수증 · 원가명세서 · 시가 확인 증빙 · 배분 물품 사진).
       같은 날 사본을 고쳐 봤지만, 사본이 있는 한 또 낡는다 — 그래서 사본 자체를 없애고
       화면이 정본에서 그리게 했다(screen-staff.js viewAdminCriteria).
     ⚠️ 서류를 더하거나 뺄 곳은 이제 **common.js 한 곳**이다. */
  criteria:{
    registry:CRITERIA
  },

  /* 주변부 — 접수 링크 발송 · 수취 등록 폼만 유지 */
  /* ★ 후원자명은 **비워 둔다** (2026-09-06 선미) — '주식회사 온누리식품' 이 박혀 있었다.
       흐린 예시(placeholder)가 아니라 실제 값이라, 담당자가 지우고 쓰는 모양이 된다.
       안 지우고 넘어가면 **엉뚱한 이름으로 접수가 만들어진다.** 후원일자 때(M-1)와 같은 자리다. */
  /* ★ channel 기본값은 **'copy'** 다 (2026-09-07 · 설계서 §4 A).
       전에는 '' 이라 담당자가 [링크 복사] 를 한 번 눌러야 아래 본인확인 칸과 발급 버튼이 나타났다.
       고를 것이 하나뿐인데 고르게 하는 클릭이었고, 그것이 게이트라서 필드까지 숨었다 —
       처음 여는 사람에게는 "발급 버튼이 없다" 로 보인다.
     ⚠️ 기본값만 바꾸면 게이트는 그대로 남는다. 화면 쪽(screen-staff.js viewSend)의
       `r.channel ?` 조건도 함께 걷었다. 검사는 채널을 비운 상태로 그려 그것을 확인한다. */
  req:{donorType:'법인', path:'구매', donorName:'', phone:'', channel:'copy', email:'', verifyLast4:'', sent:false, sentAt:'', caseId:null, copied:false, loadedFrom:null},
  recvForm:{caseId:'103', itemKey:'inss', file:'', fileId:null, date:TODAY, memo:''},
  /* 온보딩 모달은 첫 접속에 띄우지 않는다 (2026-09-05 선미) — 상단 [❔ 안내] 버튼(openOnboard)으로만 연다 */
  demo:{onboarded:true, seq:0,
    subs:{'101':'전 항목 수취완료 — 완결 판정 시연',
          '103':'금액 불일치(확인필요) ★ 핵심 — 완결 게이트 차단 시연',
          '107':'견적서 오제출(미수취) + 박스 사진(확인필요) — 첨부 내용 판정 시연',
          '115':'필수항목 미입력 — 검수대기 · 덜 들어온 건을 완결로 밀지 않는 차단 시연',
          '117':'장부가액 없이 시가 산정(E3) — 서류는 다 왔는데 대조가 막는다 · 사유 해소 시연'}}
};

/* ══════════════════════════════════════════════════════════════
   유틸 · 조회
   ══════════════════════════════════════════════════════════════ */
function esc(s){
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function won(n){ return Number(n||0).toLocaleString('ko-KR') + '원'; }

/* ── 시스템 등록 금액 — E1(금액 대조)이 서류와 비교할 값 ──
   후원자 유형에 따라 갈린다 (루브릭 §1, 8/28 팀 결정 #9):
     법인   → 장부가액 (book_value)
     법인외 → 공정가액·시가 (fair_value)
   ★ 화면·서버함수(api.js/judge.js)는 이 함수만 부른다 — donorType 분기는 여기 한 곳.
     매입세액공제(vat_deduction)는 별개 규칙(합계 vs 공급가액)이라 여기서 다루지 않는다.
   반환값: 숫자(원). 값이 없거나 유형이 불명이면 0 — 호출부가 이 0을 보고 금액 대조를 건너뛴다. */
function registeredAmount(donation){
  if (!donation) return 0;
  if (donation.donorType === '법인외') return Number(donation.fair) || 0;
  if (donation.donorType === '법인')   return Number(donation.book) || 0;
  return Number(donation.book) || 0;   /* '미입력' 등 불명 — 장부가액으로 대체(현행 fallback과 동일) */
}

/* 접수번호를 새로 뽑는다 — **이미 쓰인 번호를 피한다.**
   ★ 왜 필요한가 (2026-09-03) — 전에는 DB.demo.seq 로 201 부터 세었다.
     그 값은 페이지를 열 때마다 0 에서 시작하는데, 실 DB 에는 지난 세션이 만든
     201·202 가 남아 있다. 그래서 링크를 발급하면 **이미 있는 번호가 다시 나왔다.**
       · 화면 — getCase('201') 이 방금 만든 건이 아니라 DB 의 옛 건을 집었다.
                후원자 폼이 남의 건에 묶이고, 본인확인 값이 없어 잠금이 건너뛰어졌다.
       · DB   — case_no 는 text not null unique 다. 접수 생성이 409 로 막힌다.
     연수가 실주행에서 DB.demo.seq 를 손으로 조정해 #903 으로 돌린 것이 이 때문이다.
   ⚠️ 두 사람이 동시에 발급하면 같은 번호를 집을 수 있다 — 그때는 unique 가 막고
     접수 화면에 실패가 선다(sendLink). 발번을 DB 가 하게 만드는 것이 진짜 해법이다. */
function nextCaseNo(){
  var taken = {};
  (DB.cases || []).forEach(function(c){ taken[String(c.id)] = true; });
  var n = 201;
  while (taken[String(n)]) n++;
  return String(n);
}

/* 건 하나를 찾는다.
   ★ 여러 개가 걸리면 첫 번째를 주지 않고 null 을 준다 — getItem 과 같은 규칙이다
     (2026-09-01 유진·연수 합의). 그때 항목에만 적용하고 건에는 안 했는데,
     9/3 에 바로 그 자리가 터졌다: 접수번호가 겹쳐 옛 건이 조용히 집혔다.
     엉뚱한 건을 조용히 처리하는 것보다 못 찾는 편이 낫다. */
function getCase(id){
  var hit = DB.cases.filter(function(c){ return c.id === id; });
  if (hit.length === 1) return hit[0];
  if (hit.length > 1){
    console.error('[건] 접수번호 "' + id + '" 가 ' + hit.length + '개 있습니다 — ' +
                  '어느 것인지 정해지지 않아 아무것도 돌려주지 않습니다. ' +
                  '접수번호 발번(nextCaseNo)을 확인하세요.');
    return null;
  }
  return null;
}
/* 항목 하나를 찾는다. ref 는 uid('inss#7') 또는 key('proof_buy').

   ★ 여러 개가 걸리면 첫 번째를 주지 않고 null 을 준다 (2026-09-01 유진·연수 합의).
     예전에는 조용히 첫 번째를 반환했다. 그래서 실 DB 101번(기관 3곳)에서
     담당자가 3번 기관 인수증을 수취 처리해도 **1번 기관 것이 처리됐다. 에러도 안 났다.**
     수취 처리·AI 판정이 전부 이 함수를 지나간다.

   ⚠️ 틀린 답을 조용히 주는 것보다 못 찾는 게 낫다. 다만 null 만으로는 조용하다 —
     호출부 13곳이 전부 `if (!it) return;` 으로 삼킨다(연수 확인).
     그래서 쓰기 경로에서 담당자에게 알릴 수 있게 itemLookupError() 를 함께 둔다. */
function getItem(caseId, ref){
  var c = getCase(caseId); if (!c) return null;
  var list = c.checklist || [];

  var byUid = list.filter(function(i){ return i.uid === ref; });
  if (byUid.length === 1) return byUid[0];

  var byKey = list.filter(function(i){ return i.key === ref; });
  if (byKey.length === 1) return byKey[0];
  if (byKey.length > 1){
    console.error('[항목] "' + ref + '" 가 이 건에 ' + byKey.length + '개 있습니다 — ' +
                  '어느 것인지 정해지지 않아 아무것도 돌려주지 않습니다. ' +
                  'uid 로 부르세요: ' + byKey.map(function(i){ return i.uid; }).join(' · '));
    return null;
  }
  return null;
}

/* 왜 못 찾았는지 사람이 읽을 수 있게. 찾았으면 null.
   화면(쓰기 경로)이 토스트로 띄우는 용도다 — 담당자가 "버튼이 안 먹네" 로 끝나지 않게. */
function itemLookupError(caseId, ref){
  var c = getCase(caseId);
  if (!c) return '건을 찾을 수 없습니다';
  var list = c.checklist || [];
  if (list.filter(function(i){ return i.uid === ref; }).length === 1) return null;
  var byKey = list.filter(function(i){ return i.key === ref; });
  if (byKey.length === 1) return null;
  if (byKey.length > 1){
    return '이 건에는 같은 서류가 ' + byKey.length + '개 있습니다(배분기관별) — ' +
           '어느 기관 것인지 정해지지 않아 처리하지 않았습니다';
  }
  return '해당 항목을 찾을 수 없습니다';
}
function days(a,b){ return Math.round((new Date(b) - new Date(a)) / 86400000); }
function el(id){ return document.getElementById(id); }

/* ══════════════════════════════════════════════════════════════
   Supabase 계층 — DB에서 읽어와 위의 DB.cases 모양으로 갈아끼운다
   ★ 화면 코드(screen-*.js)는 한 줄도 바뀌지 않는다.
     화면은 getCase()·getItem()·DB.cases 만 쓰고, 그 모양을 그대로 유지하기 때문이다.

   지금 범위: 읽기만 (원장 목록·체크리스트).
   쓰기(확인완료·접수등록 등)는 아직 메모리에만 남는다 — 새로고침하면 사라진다.
     → 다음 단계에서 함수별로 하나씩 Supabase 쓰기로 바꾼다 (아래 TODO)

   설정: config.local.js (config.example.js 를 복사해서 만든다 · gitignore 대상)
   ══════════════════════════════════════════════════════════════ */

var DB_SOURCE = '데모';   /* '데모' | 'Supabase' — 화면 상단 표시용 */

/* ★ 접속 결론은 여기서 **한 번만** 찍는다 (2026-09-03 유진 · 선미 페어에서 드러남)
     전에는 세 곳이 각자 "데모 데이터로 실행합니다" 를 찍었다 —
     index.html 의 /config onerror · functions/config.js · loadCasesFromSupabase.
     셋 다 **자기 문만 보고 단정**했다. 그래서 콘솔이 이렇게 나왔다.

       [DB] 서버에 SUPABASE_URL·SUPABASE_ANON_KEY 가 없습니다 — 데모 데이터로 실행합니다.
       [DB] Supabase에서 15건을 읽었습니다.        ← 바로 아래 줄

     문이 둘이다(서버 /config · config.local.js). 한쪽이 비어도 다른 쪽이 연결한다.
   ★ 이것은 조용한 실패의 **거울상 — 잘못된 안심**이다(선미).
     담당자가 콘솔을 보고 "지금 데모구나" 하고 실 DB 에 손댈 수 있다.
   → 규칙: **문이 여럿이면 '안 열렸다' 를 한 문이 단정하지 않는다.**
     각 문은 자기가 무엇을 했는지만 말하고, 결론은 다 지난 뒤 한 줄로 찍는다. */
var CFG_SOURCE = null;   /* 'config.local.js' | '/config (서버 환경변수)' — index.html 이 채운다 */

function reportDbSource(n){
  if (DB_SOURCE === 'Supabase')
    console.info('[DB] ✅ 접속: Supabase · ' + n + '건 — 설정 출처 ' + (CFG_SOURCE || '(알 수 없음)'));
  else
    console.info('[DB] 🧪 접속: 데모 데이터 (DB 미연결) — 위의 안내는 각 문의 상태일 뿐 결론이 아닙니다');
}

/* 외부 라이브러리를 쓰지 않는다 — fetch 만으로 붙는다 (유진 검증, 2026-08-28).
   Supabase의 REST(PostgREST)는 주소 규칙만 지키면 되므로 SDK가 필요 없다. */
function sbReady(){
  return (typeof SUPABASE_CONFIG !== 'undefined')
      && !!SUPABASE_CONFIG.url && SUPABASE_CONFIG.url.indexOf('여기에') === -1
      && !!SUPABASE_CONFIG.key && SUPABASE_CONFIG.key.indexOf('여기에') === -1;
}

/* ── 담당자 로그인 — Supabase Auth (2026-09-07 승희 · 권한 2단계) ───────────────────
   supabase-js 를 쓰지 않는다 — 이 파일이 전부 fetch 라 /auth/v1 두 주소면 된다.
   · 세션은 localStorage(AUTH_KEY) 에 둔다. 새로고침해도 로그인이 남는다.
   · sbBearer(): 세션이 있으면 그 access_token, 없으면 anon key. REST·Storage 요청 12곳이 이걸 쓴다.
     apikey 헤더는 늘 anon key(게이트웨이 식별용) — RLS 는 Bearer 의 role(anon/authenticated) 로 갈린다.
   · staffOk: auth 사용자 id 로 staff 행을 찾았는가. created_by·triggered_by 는 staff(id) FK 라
     staff 행이 없으면 넣지 않는다(FK 위반으로 접수 저장이 죽는 것보다 낫다). 대신 콘솔에 남긴다.
   · 후원자(링크 ?t=)는 로그인하지 않는다 — anon 그대로. 로그인 벽은 common.js authWall(). */
var AUTH_KEY = 'nd_auth_v1';
var AUTH = { session: null };
function authLoad(){
  try { var s = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); AUTH.session = (s && s.access_token) ? s : null; }
  catch (e) { AUTH.session = null; }
  return AUTH.session;
}
function authSave(s){
  AUTH.session = s || null;
  try { if (s) localStorage.setItem(AUTH_KEY, JSON.stringify(s)); else localStorage.removeItem(AUTH_KEY); } catch (e) {}
}
function authUser(){ return (AUTH.session && AUTH.session.user) || null; }
function authUid(){ var u = authUser(); return (u && u.id) || null; }
function authStaffId(){ return (AUTH.session && AUTH.session.staffOk) ? authUid() : null; }
function authName(){ var s = AUTH.session; return s ? (s.staffName || (s.user && s.user.email) || '') : ''; }
function sbBearer(){
  var s = AUTH.session;
  return 'Bearer ' + ((s && s.access_token) ? s.access_token : SUPABASE_CONFIG.key);
}
function authHeaders(){ return { apikey: SUPABASE_CONFIG.key, 'Content-Type': 'application/json' }; }

/* ★ 요청 헤더 한 곳 (2026-09-08 승희 · 권한 3단계 "링크는 자기 건만")
   전에는 12곳이 { apikey, Authorization } 을 각자 조립했다. 이제 여기서 만든다 — 링크 토큰 때문이다.
   후원자·배분처는 로그인이 없어 anon 이다. 그런데 anon 이 원장 전체를 읽을 수 있어 Cloudflare Access 로
   사이트 입구를 잠가 뒀다(9/1). 그 잠금을 떼려면 DB 가 "이 요청은 어느 링크에서 왔나" 를 알아야 한다.
   그래서 주소의 ?t=<토큰> 을 해시해(DB 에 원문은 없다 — token_hash 만) 모든 요청에 x-link-token 으로 싣는다.
   DB 쪽 RLS 는 link_donation_ids() 로 그 해시가 가리키는 건만 보여 준다(patch-20260908-rls-link-scope.sql).
   담당자(로그인)는 Bearer 가 사용자 토큰이라 이 헤더와 무관하게 전권이다. 토큰이 없으면 헤더도 안 붙는다. */
var LINK_TOKEN_HASH;   /* undefined = 아직 안 봄 · null = 주소에 토큰 없음 · 문자열 = 해시 */
function linkTokenHash(){
  if (LINK_TOKEN_HASH === undefined){
    LINK_TOKEN_HASH = null;
    try {
      var t = (typeof location !== 'undefined') ? new URLSearchParams(location.search).get('t') : null;
      if (t) LINK_TOKEN_HASH = tokenHashOf(t);
    } catch (e) {}
  }
  return LINK_TOKEN_HASH;
}
function sbHeaders(extra){
  var h = { apikey: SUPABASE_CONFIG.key, Authorization: sbBearer() };
  var lt = linkTokenHash();
  if (lt) h['x-link-token'] = lt;
  if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
  return h;
}
function authStore(j){
  var old = AUTH.session || {};
  var sess = { access_token: j.access_token, refresh_token: j.refresh_token,
               expires_at: j.expires_at || (Math.floor(Date.now() / 1000) + (j.expires_in || 3600)),
               user: { id: j.user && j.user.id, email: j.user && j.user.email },
               staffOk: !!old.staffOk, staffName: old.staffName || '', staffRole: old.staffRole || null };
  authSave(sess);
  return sess;
}
function authSignIn(email, password){
  if (!sbReady()) return Promise.resolve({ok:false, reason:'DB 미연결(데모)에서는 로그인이 없습니다'});
  return fetch(sbBase() + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ email: String(email || '').trim(), password: String(password || '') })
  }).then(function(res){
    return res.json().catch(function(){ return {}; }).then(function(j){
      if (!res.ok || !j.access_token){
        var why = (j && (j.error_description || j.msg || j.message || j.error)) || ('HTTP ' + res.status);
        if (/invalid login credentials/i.test(why)) why = '이메일 또는 비밀번호가 맞지 않습니다';
        return {ok:false, reason: why};
      }
      AUTH.session = null;
      authStore(j);
      /* ★ 로그인하면 원장을 다시 읽는다 (2026-09-08) — 부팅 때는 anon 이라 3단계부터 0건이다.
           보이는 범위가 세션에 달려 있으니, 세션을 바꾸는 이 자리가 다시 읽는 자리다. 실패해도 로그인은 성공이다. */
      return authLookupStaff()
        .then(function(){ return authReloadCases(); })
        .then(function(){ return {ok:true, user: authUser()}; });
    });
  }).catch(function(err){ return {ok:false, reason: '접속 실패 — ' + ((err && err.message) || err)}; });
}
/* staff 행 대조 — 로그인은 됐는데 staff 에 없으면 "누가" 를 못 적는다. 로그인은 그대로 두고 표시만 한다. */
function authLookupStaff(){
  var uid = authUid();
  if (!uid) return Promise.resolve(false);
  return sbGet(T.staff, 'select=id,name,role,status&id=eq.' + encodeURIComponent(uid) + '&limit=1')
    .then(function(rows){
      var r = rows && rows[0];
      /* ★ 행이 안 왔다 ≠ 자격이 없다 (2026-09-10)
           이 저장소는 **HTTP 200 + 빈 배열**을 여러 번 겪었다(권한 단계가 바뀌던 날들).
           부팅마다 이걸 부르게 되면서, 한 번 빈 배열이 오면 멀쩡한 담당자가 강등된다.
           그래서 **행이 없으면 이전 판정을 유지**하고 콘솔에만 남긴다.
         ⚠️ 비활성(status='disabled')은 **행이 오므로** 그대로 걸린다 — 막으려던 것은 그쪽이다. */
      if (!r){
        console.warn('[로그인] staff 행을 받지 못했습니다 — 이전 판정을 유지합니다: ' + uid);
        return !!(AUTH.session && AUTH.session.staffOk);
      }
      var ok = (r.status !== 'disabled');
      if (AUTH.session){
        AUTH.session.staffOk = ok; AUTH.session.staffName = r.name || ''; AUTH.session.staffRole = r.role || null;
        authSave(AUTH.session);
      }
      if (!ok) console.warn('[로그인] 비활성 계정입니다 — created_by·triggered_by 를 비웁니다: ' + uid);
      return ok;
    }).catch(function(err){ console.warn('[로그인] staff 조회 실패 — ' + ((err && err.message) || err)); return false; });
}
function authRefresh(){
  var s = AUTH.session;
  if (!s || !s.refresh_token) return Promise.resolve(null);
  return fetch(sbBase() + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ refresh_token: s.refresh_token })
  }).then(function(res){
    return res.json().catch(function(){ return {}; }).then(function(j){
      if (!res.ok || !j.access_token){ console.warn('[로그인] 세션 갱신 실패 — 다시 로그인해야 합니다'); authSave(null); return null; }
      return authStore(j);
    });
  }).catch(function(){ return AUTH.session; });   /* 네트워크 일시 오류 — 세션은 두고 다음 주기에 다시 */
}
/* 만료 5분 전이면 갱신한다. 부팅 때 한 번 · 이후 5분마다(startAuthRefresh). */
function authEnsure(){
  var s = AUTH.session;
  if (!s || !sbReady()) return Promise.resolve(s || null);
  var left = (s.expires_at || 0) - Math.floor(Date.now() / 1000);
  return (left < 300) ? authRefresh() : Promise.resolve(s);
}
function startAuthRefresh(){ if (typeof setInterval === 'function') setInterval(function(){ authEnsure(); }, 5 * 60 * 1000); }
/* 세션이 바뀐 뒤 원장을 다시 읽는다 (2026-09-08 · 권한 3단계) — 로그인하면 전체, 로그아웃하면 0건.
   화면(common.js)이 아니라 여기 있는 이유: 보이는 범위는 세션이 정하므로 세션을 바꾸는 쪽이 책임진다.
   실패는 삼킨다 — 원장 재조회가 안 돼도 로그인·로그아웃 자체는 성공이다. */
function authReloadCases(){
  if (!sbReady()) return Promise.resolve(false);
  return loadCasesFromSupabase()
    .then(function(ok){
      if (ok && typeof restoreAllSavedJudgments === 'function') { try { restoreAllSavedJudgments(); } catch (e) {} }
      return ok;
    })
    .catch(function(e){ console.warn('[DB] 세션 변경 뒤 원장 재조회 실패 — ' + ((e && e.message) || e)); return false; });
}
/* ── 화면 이동 때 원장 다시 읽기 (2026-09-10 승희) ──────────────────────────
   담당자 화면은 부팅 때 읽은 사본만 봤다. 후원자가 신청서를 내도 담당자 쪽 '미수취'는
   새로고침해야 '수취' 로 바뀌었다(9/10 동료 테스트 발견). 홈·목록·건 상세로 **이동할 때**
   조용히 다시 읽고, 읽히면 한 번 더 그린다 — 메뉴를 다시 누르는 것이 새로고침과 같아진다.
   ⚠️ 검수(AI 판독) 진행 중에는 읽지 않는다 — DB.cases 가 통째로 바뀌면 진행 중인 항목 객체가
      허공에 떠서 판정이 화면에 안 붙는다. 끝난 뒤 다음 이동에서 읽는다.
   ⚠️ 5초 안에 두 번은 안 읽는다 — 메뉴를 연달아 눌러도 요청(건마다 첨부·PDF 조회)이 쌓이지 않게.
   ⚠️ 데모(DB 미연결)·로그인 전·후원자 화면에서는 아무것도 안 한다. */
var LEDGER_RELOAD_MIN_MS = 5000;
var _ledgerReloadAt = 0, _ledgerReloading = false;
function ledgerBusy(){
  if (typeof DB === 'undefined' || DB.inspecting) return true;
  return (DB.cases || []).some(function(c){
    return (c.checklist || []).some(function(it){ return !!(it.r && (it.r.aiJudging || it.r.extracting)); });
  });
}
function refreshLedgerSoon(screen){
  if (!sbReady() || typeof DB_SOURCE === 'undefined' || DB_SOURCE !== 'Supabase') return Promise.resolve(false);
  if (typeof DB === 'undefined' || DB.role !== 'staff' || !authUser()) return Promise.resolve(false);
  if (['home', 'list', 'case'].indexOf(screen) < 0) return Promise.resolve(false);
  var now = Date.now();
  if (_ledgerReloading || (now - _ledgerReloadAt) < LEDGER_RELOAD_MIN_MS) return Promise.resolve(false);
  if (ledgerBusy()) return Promise.resolve(false);
  _ledgerReloading = true; _ledgerReloadAt = now;
  return authReloadCases()
    .then(function(ok){
      _ledgerReloading = false;
      if (ok && typeof render === 'function') render();
      return ok;
    })
    .catch(function(){ _ledgerReloading = false; return false; });
}
function authSignOut(){
  var s = AUTH.session;
  var done = function(){ authSave(null); return authReloadCases().then(function(){ return {ok:true}; }); };
  if (!s || !sbReady()) return Promise.resolve(done());
  return fetch(sbBase() + '/auth/v1/logout', { method: 'POST',
    headers: { apikey: SUPABASE_CONFIG.key, Authorization: 'Bearer ' + s.access_token } }).then(done, done);
}

/* ★ 쓰기 함수의 공통 관문 (2026-09-06 선미 · #214·#215 실주행에서 드러남) ────────────
   전에는 쓰기 함수 여섯 곳이 똑같이 이렇게 시작했다:
       if (!sbReady() || !c || !c.dbId) return Promise.resolve({ok:true, demo:true});
   문제는 **뒤 두 조건까지 성공이라고 답한 것**이다.
   실서비스(sbReady=true)에서 dbId 가 없으면 저장이 조용히 건너뛰어지는데
   부르는 쪽은 저장됐다고 믿는다 — 실패로도 안 잡히고 화면에도 안 뜬다.
   데모(DB 미연결)는 저장할 곳이 자체가 없으니 성공이 맞다. 그 둘을 가른다.
   ⚠️ 돌려주는 값이 null 이면 "관문 통과 — 계속 진행" 이다. */
function writeGate(c, what){
  if (!sbReady()) return Promise.resolve({ok:true, demo:true});   /* 데모 — 저장할 DB 가 없다 */
  if (!c || !c.dbId)
    return Promise.reject(new Error((what || '저장') +
      ' — 이 건이 DB 에 없습니다(dbId 없음). 접수 저장부터 다시 해야 합니다'));
  return null;
}

/* 주소 정리 — 도메인까지만 남긴다.
   ⚠️ 승희가 준 주소를 그대로 넣으면 /rest/v1 이 두 번 붙어 404가 난다 (유진 발견) */
function sbBase(){
  return String(SUPABASE_CONFIG.url).replace(/\/+$/, '').replace(/\/rest\/v1.*$/, '');
}

/* 테이블 조회 한 번. query 는 PostgREST 문법 (예: 'select=*&limit=1') */
function sbGet(table, query){
  var key = SUPABASE_CONFIG.key;
  return fetch(sbBase() + '/rest/v1/' + table + '?' + query,
               { headers: sbHeaders() })
    .then(function(res){
      if (!res.ok) return res.text().then(function(t){
        throw new Error('HTTP ' + res.status + ' — ' + t.slice(0, 200));
      });
      return res.json();
    });
}

/* ── 값 번역: DB 표기 ↔ 화면 표기 ── */
var ST_FROM_DB = {'미수취':'miss', '수취완료':'done', '확인필요':'unc'};
/* ⚠️ kind: schema.sql 은 'F'|'S'|'A' 로 저장한다(화면과 같은 코드).
   설계안 §2-③ 본문에는 '폼필드|폼제출|첨부파일'로 적혀 있어 둘 다 받아준다.
   — 실 DB 연결 테스트에서 발견(2026-08-28). 표기를 하나로 통일할지는 승희 복귀 후 정리. */
var KIND_FROM_DB = {'F':'F', 'S':'S', 'A':'A',
                    '폼필드':'F', '폼제출':'S', '첨부파일':'A'};

/* 수량 표기 — 서류에 적힌 대로 보여주되, 환산이 있으면 낱개 총수량을 괄호로 덧붙인다.
   예) 400박스 (4,800개)   ※ 단위가 '낱개'거나 환산이 없으면 숫자만 */
function fmtQty(asReceived, unit, total){
  if (asReceived == null) return total == null ? '' : Number(total).toLocaleString('ko-KR');
  var s = Number(asReceived).toLocaleString('ko-KR') + (unit && unit !== '낱개' ? unit : '');
  if (total != null && total !== asReceived) s += ' (' + Number(total).toLocaleString('ko-KR') + '개)';
  return s;
}

/* DB의 checklist_item 한 줄 → 화면이 아는 항목 모양
   orgOf: distribution_id → 배분기관명 (아래 rowToCase 에서 만들어 넘긴다)

   ★ 다기관 배분이면 인수증·결과보고가 기관 수만큼 생겨서, 서류 이름만으로는
     어느 기관 것인지 구분되지 않는다(2026-08-28 발견).
     화면은 서류 이름(n)만 그리므로, 여기서 이름 뒤에 기관명을 붙여 구분되게 한다.
     → 화면 코드를 고치지 않는 임시 해법. 제대로 된 '취합 검수 화면'은 설계안 §7-3 (대) */
function rowToItem(row, orgOf, noteOf){
  var name = row[COL.checklistItem.docName];
  var distId = row[COL.checklistItem.distributionId];
  var org = distId && orgOf ? orgOf[distId] : null;
  if (org) name = name + ' · ' + org;

  return mkItem({
    dbId:  row[COL.checklistItem.id],
    /* distId — 배분 단계 서류(인수증·결과보고서)는 배분처마다 한 벌씩 있다.
       ★ doc_key 만으로는 '늘봄 인수증'과 '복지관 인수증'을 못 가른다.
         첨부를 어느 항목에 붙일지 정하려면 이 값이 있어야 한다(2026-09-01 유진). */
    distId: distId || null,
    key:   row[COL.checklistItem.docKey],
    n:     name,
    g:     row[COL.checklistItem.owner] + (org ? ' — ' + org : ''),
    basis: row[COL.checklistItem.basis],
    due:   row[COL.checklistItem.dueDate],
    kind:  KIND_FROM_DB[row[COL.checklistItem.kind]] || 'A',
    stage: row[COL.checklistItem.stage],
    included: row[COL.checklistItem.included] !== false,
    /* ★ 안내문은 저장된 값이 아니라 **지금 코드의 것**을 쓴다 (2026-09-12 선미).
         안내문은 만들 때 행에 같이 박혀서, 문구를 고쳐도 이미 만든 건(#309 등)에는 옛 문구가 남았다.
         noteOf 는 rowToCase 가 그 건의 유형×경로로 만들어 넘긴다(없으면 저장된 값 그대로). */
    note:  (noteOf && Object.prototype.hasOwnProperty.call(noteOf, row[COL.checklistItem.docKey]))
             ? noteOf[row[COL.checklistItem.docKey]]
             : row[COL.checklistItem.note],
    r: { st: ST_FROM_DB[row[COL.checklistItem.status]] || 'miss',
         /* 사유 해소 — 값이 있으면 화면이 '사유해소'로 그린다(itemStatus).
            ★ st 는 덮지 않는다. 넘어가기 전의 상태가 무엇이었는지가 남아야 한다. */
         resolution: row[COL.checklistItem.resolutionReason]
           ? {reason: row[COL.checklistItem.resolutionReason],
              by:     row[COL.checklistItem.resolvedBy] || '담당자',
              date:   String(row[COL.checklistItem.resolvedAt] || '').slice(0, 10)}
           : null,
         date: row[COL.checklistItem.confirmedAt] || '',
         /* ★ AI 판정(inspection_finding)은 아직 안 읽는다 — 유진 E1 작업이 붙으면 여기에 채운다 */
         ai: '' }
  });
}

/* 매입세액공제 — 화면은 true/false/null, DB 는 '예'|'아니오'|'모름' (2026-09-12 선미).
   ★ 모르는 값은 지어내지 않는다 — null 은 null 로 둔다(칸을 아예 묻지 않은 일반 개인이 이쪽이다).
     '모름' 은 **묻고 모른다고 답한 것**이라 뜻이 다르지만, 판정에서는 둘 다 같게 다룬다(루브릭 §2-E1). */
function vatToDb(v){ return v === true ? '예' : v === false ? '아니오' : null; }
function vatFromDb(v){
  if (typeof v === 'boolean') return v;            /* 옛 데이터 방어 */
  if (v === '예') return true;
  if (v === '아니오') return false;
  return null;                                     /* '모름' · NULL · 모르는 값 */
}
/* DB의 donation 한 줄(+배분처·체크리스트) → 화면이 아는 '건' 모양 */
function rowToCase(row){
  var D = COL.donation;
  var dists = row.distribution || [];
  var liveRows = dists.filter(distLive);          /* 취소된 배분 제외 (2026-09-11) */
  var qty = row[D.qty];

  /* 배분처 id → 기관명 (체크리스트 항목에 기관을 붙이기 위해) */
  var orgOf = {};
  dists.forEach(function(d){ orgOf[d[COL.distribution.id]] = d[COL.distribution.orgName]; });

  /* 지금 코드가 가진 안내문 — 이 건의 유형×경로로 만든 체크리스트 + 배분 증빙 (2026-09-12) */
  var noteOf = {};
  try {
    (autoChecklist(row[D.donorType], row[D.acquisitionPath], true, DB.promptProfile) || [])
      .forEach(function(d){ noteOf[d.key] = d.note || ''; });
    (((typeof getProfile === 'function' ? getProfile(DB.promptProfile).distDocs : null) || DIST_DOCS) || [])
      .forEach(function(d){ noteOf[d.key] = d.note || ''; });
  } catch (e) { noteOf = null; }
  var items = (row.checklist_item || []).map(function(r){ return rowToItem(r, orgOf, noteOf); });
  /* ★ 순서 고정 (2026-09-11 승희 · G05 실주행 발견) — PostgREST 중첩 select 는 정렬을 보장하지 않는다.
       행이 UPDATE 되면(수취 처리·included 갱신) 힙 순서가 바뀌어 **후원자 폼에서 물품사진이 맨 위로** 올라왔다
       (다른 건은 맨 아래). 삽입은 매트릭스 순서(sendLink → itemToRow · db.js:1435)라 id 오름차순이 곧 서류 순서이고,
       배분 단계 항목은 나중에 삽입되니 자연히 뒤에 선다. */
  items.sort(function(a, b){ return (Number(a.dbId) || 0) - (Number(b.dbId) || 0); });
  /* ★ 취소된 배분처의 항목은 뺀다 (2026-09-12 선미 · #306 실측).
       confirmCancelDist 가 화면 체크리스트에서는 걷어 냈지만 **DB 행은 남아**(retiredItemIds 에 안 실렸다)
       새로고침하면 햇살지역아동센터 인수증이 '미수취' 로 되살아났다. 저장 쪽도 고쳤지만(screen-staff.js)
       이미 남은 행이 있으니 되읽는 자리에서도 한 번 더 거른다. 취소는 수취 확정 전에만 되므로(distLocked)
       여기 걸리는 항목에 확정된 것은 없다. */
  var cancelledDist = {};
  dists.forEach(function(d){ if (!distLive(d)) cancelledDist[String(d[COL.distribution.id])] = true; });
  items.forEach(function(it){ if (it.distId != null && cancelledDist[String(it.distId)]) it.included = false; });
  var lastRunAt = latestInspectAt(row);

  var c = {
    id:        String(row[D.caseNo]),
    dbId:      row[D.id],                 /* ★ 실제 PK — 쓰기 단계에서 필요 (화면은 case_no를 쓴다) */
    state:     row[D.state],
    /* ★ 후원자 제출 대기 (2026-09-12 선미 실주행) — 전에는 되읽을 때 세우지 않아 **새로고침하면 사라졌다.**
         sendLink 가 만든 메모리 건에만 있었고(screen-staff.js) DB 에서 온 건은 undefined 라,
         제출 대기 건이 목록에서 '필수정보 미입력' 으로 읽히고 건 상세의 [접수 링크] 카드도 안 떴다.
         createDonation 이 '제출 대기' 로 넣고 submitDonor 가 '검수 대기' 로 바꾸므로 상태 하나로 판단한다. */
    awaitingSubmit: row[D.state] === '제출 대기',
    /* ★ '(미입력)' 이 아니다 (2026-09-05 선미 · #219 에서 지적).
         법인 외(개인) 후원자 이름은 **일부러 DB 에 넣지 않는다** — 신청서 PDF 안에만 둔다
         (privacy-design §2 · submissionPayload 화이트리스트). 그래서 되읽으면 늘 비어 있다.
         그런데 화면이 '(미입력)' 이라고 적으니, 담당자는 **후원자가 안 썼다**고 읽는다.
         후원자는 분명히 적었고 신청서에도 찍혀 있다. 사실대로 어디에 있는지 적는다.
       ⚠️ 법인은 다르다 — 기부금영수증 발급 대상이라 상호를 원장에 남긴다.
         법인인데 비어 있으면 그건 진짜 안 들어온 것이다. */
    donor:     row[D.donorName] ||
               (row[D.donorType] && row[D.donorType] !== '법인' ? '(신청서에서 확인)' : '(미입력)'),
    donorType: row[D.donorType],
    /* [2026-09-02 연수] 빠져 있던 매핑. COL 상수(D.donorBizNo)는 선언돼 있었으나
       여기서 쓰지 않아 c.donorBizNo 가 늘 undefined 였고, isProfitCorp() 가 항상 '모름'을
       돌려줬다 — 영리/비영리를 가르는 E3 분기가 실 DB 에서 한 번도 탄 적이 없다.
       DB 에는 값이 들어 있다(seed-dummy.sql). 선언만 보고 매핑됐다고 읽기 쉬운 자리다. */
    donorBizNo: row[D.donorBizNo],
    /* [2026-09-02 연수] donorBizNo 와 같은 자리가 하나 더 있었다 — 실주행에서 드러났다.
       COL 선언(db.js:38)도 있고 createDonation 이 저장도 하는데(row[D.acquisitionPath])
       여기서 읽지 않아, DB 에서 되읽은 건은 c.acqPath 가 undefined 였다.
       submitDonor() 가 autoChecklist(c.donorType, c.acqPath, …) 로 체크리스트를 재전개하므로
       ★ 검수 기준의 두 축(후원자 유형 × 취득경로) 중 하나가 빠진 목록이 만들어진다.
       같은 브라우저로 이어서 제출하면 메모리 값이 남아 있어 드러나지 않는다 —
       후원자가 링크를 나중에 다른 기기에서 열 때만 나타난다. */
    acqPath:    row[D.acquisitionPath],
    /* 사람이 읽는 표기는 서류에 적힌 그대로 ('즉석밥 3종 400박스').
       qty(낱개 총수량)는 대조·계산용이라 화면에 그대로 쓰지 않는다 — 단위 3종 추가로 해결(승희, 8/28) */
    /* ★ null 을 문자열로 이어 붙이지 않는다 (2026-09-03 연수 발견 · 김연수 과장이 화면에서 봄)
         접수 링크만 발급하고 후원자 제출을 기다리는 건은 item_name 이 NULL 이다 — 설계대로다.
         그런데 JS 가 null + ' ' 를 "null " 로 만들어 목록에 **"null #201"** 로 그대로 떴다.
         조용히 틀리는 게 아니라 화면에 보이는 자리다. 9/8 시연에서 링크 발급 후 홈으로
         돌아오면 늘 났다.
       ★ 화면 다섯 자리에 가드를 넣지 않고 경계에서 한 번 막는다 —
         다섯 곳에 넣으면 자리가 늘 때 또 빠진다(submittedVia 때와 같은 이유).
       ★ 문구는 sendLink 가 만드는 메모리 건과 맞춘다(screen-staff.js) —
         DB 에서 되읽은 건과 방금 만든 건의 표기가 달랐다. */
    item:      [row[D.itemName], fmtQty(row[D.qtyAsReceived], row[D.qtyUnit], qty)]
                 .filter(Boolean).join(' ') || '(후원자 제출 대기)',
    inDate:    row[D.inDate],
    deadline:  row[D.deadline] || '—',
    /* ★ 취소된 배분처는 '배분처가 정해졌나' 의 근거가 못 된다 (2026-09-11) —
         첫 행이 취소된 것이면 살아 있는 첫 행을 본다. 하나도 없으면 배분 전과 같다. */
    orgId:     (liveRows.length ? liveRows[0][COL.distribution.id] : null),
    orgName:   (liveRows.length ? liveRows[0][COL.distribution.orgName] : ''),
    dists:     dists,                     /* ★ 다기관 배분 전체 — E7(수량 합계) 판정용 */
    criteriaKey:  row[D.criteriaKey],
    submittedVia: row[D.submittedVia],
    /* ★ 누가 접수했나 (2026-09-10 선미) — 목록의 [내가 접수한 건만] 이 이 값을 본다.
         DB 에는 9/7 부터 created_by 가 남고 있었는데 화면 객체로는 안 올라오고 있었다.
         보이는 범위는 여전히 원장 전체다(권한 모델 그대로) — 이건 화면 필터일 뿐이다. */
    createdBy: row[D.createdBy] || null,
    donation: { itemName: row[D.itemName], qty: qty,
                unitPrice: row[D.unitPrice], book: row[D.bookValue],
                fair: row[D.fairValue], arriveDate: row[D.arriveDate],
                donationDate: row[D.donationDate],   /* E2(일자 선행) — checkE2()가 본다 */
                donorType: row[D.donorType] },   /* registeredAmount()가 여기서 판단 (법인=book / 법인외=fair) */
    /* AI 검수(E1)가 서류의 '공급가액'과 대조할지 '합계금액'과 대조할지를 정하는 값.
       ⚠️ undefined 와 null 을 구분한다 — 컬럼이 없으면 undefined, 값이 안 정해졌으면 null.
          둘 다 '모름'으로 다루지만, 화면·서버함수에는 null 로 통일해 넘긴다. */
    vatDeduction: vatFromDb(row[D.vatDeduction]),
    /* 지난 AI 판정 — 최신 실행이 앞에 온다. 화면은 이걸 보고 '이미 판정된 건'을 다시 부르지 않는다.
       ⚠️ 여기서는 옮겨 담기만 한다. 어느 항목 카드에 붙일지는 화면(api.js)이 정한다 —
          E1 finding 은 checklist_item_id 가 NULL 이라 DB만 보고는 자리를 알 수 없다. */
    savedFindings: rowToFindings(row),
    findingRes: resFromFindings(rowToFindings(row)),
    /* 검수를 실행한 적이 있는가 — 화면(screen-staff)의 결과 노출 게이트가 이 값 하나를 본다.
       ⚠️ 여기서는 세우기만 한다. 실행보다 **뒤에 도착한 증빙**이 있으면
          첨부·제출본 복원이 끝난 뒤 markStaleInspection() 이 다시 지운다. */
    lastInspectAt: lastRunAt,
    inspectedAt:   lastRunAt ? String(lastRunAt).slice(0, 10) : undefined,
    /* ★ 완결 시각은 **최초 한 번**이다 (2026-09-08 선미 요청 — "최초 완결 처리한 시점").
         되읽지 않으면 [다시 검수] 뒤 재완결할 때 c.completedAt 이 비어 있어
         그날 시각으로 덮인다 — 화면은 멀쩡한데 기록만 조용히 바뀐다. */
    completedAt:   row[D.completedAt] || null,
    checklist: items
  };
  /* ★ [F] 항목 사유를 다시 채운다 (2026-09-10) — DB 에 memo 칸이 없어 되읽으면 늘 비어 있었다.
       비면 화면이 "첨부 내용을 확인해 주세요" 라는 기본 문구로 떨어져,
       담당자가 **왜** 확인필요인지 못 봤다. 자세한 근거는 common.js formCheckMemoFromCase 주석. */
  if (typeof formCheckMemoFromCase === 'function'){
    c.checklist.forEach(function(it){
      if (it.kind !== 'F' || (it.r && it.r.memo)) return;
      var memo = formCheckMemoFromCase(it, c);
      if (memo) it.r.memo = memo;
    });
  }
  return c;
}

/* inspection(⑨) × inspection_finding(⑩) 중첩 결과 → 평탄한 판정 목록 (최신 실행 순) */
function rowToFindings(row){
  var I = COL.inspection, F = COL.inspectionFinding;
  var runs = (row[T.inspection] || []).slice().sort(function(a, b){
    return String(b[I.startedAt] || '').localeCompare(String(a[I.startedAt] || ''));
  });
  var out = [];
  runs.forEach(function(run){
    (run[T.inspectionFinding] || []).forEach(function(f){
      out.push({
        id:       f[F.id],                 /* ★ 행 PK — 해소를 어느 행에 붙였는지 가리는 유일한 값 */
        ruleCode: f[F.ruleCode],
        verdict:  f[F.verdict],
        reason:   f[F.reason] || '',
        amount:   f[F.extractedValue] || null,
        system:   f[F.systemValue] || null,
        file:     f[F.sourceFile] || null,
        facts:    f[F.facts] || null,      /* 값 뽑기 판정이면 뽑은 값 전체 */
        at:       String(run[I.startedAt] || '').slice(0, 10),
        model:    run[I.model] || null,
        status:   run[I.status] || null,
        /* 해소 — 값이 있으면 담당자가 사유를 적고 넘어간 판정이다 */
        resolution: f[F.resolutionReason]
          ? {reason:f[F.resolutionReason], by:f[F.resolvedBy] || '담당자',
             date:String(f[F.resolvedAt] || '').slice(0, 10)}
          : null
      });
    });
  });
  return out;
}

/* 가장 최근 검수 실행 시각 (ISO · 없으면 null)
   ★ 왜 필요한가 (2026-09-08 연수) — 판정은 부팅 때 같이 읽어 온다(위 select 의 중첩).
     그런데 **"검수한 적이 있다" 는 표시만 복원되지 않았다.** 그 표시는 `c.inspectedAt` 하나이고
     `runInspect()` 가 실행하는 순간에만 세운다(screen-staff.js). 그래서 새로고침하면
     화면이 "아직 실행 안 함" 갈래로 떨어져 **복원해 둔 판정을 감추고 [검수 실행] 만 내민다.**
     담당자는 같은 건에 들어올 때마다 다시 눌러야 했다. */
function latestInspectAt(row){
  var I = COL.inspection, best = null;
  (row[T.inspection] || []).forEach(function(r){
    var t = r[I.startedAt];
    if (t && (!best || Date.parse(t) > Date.parse(best))) best = t;
  });
  return best;
}
/* a 가 b 보다 뒤인가 — 둘 다 읽히는 시각일 때만 참.
   ⚠️ 문자열 비교를 쓰지 않는다. PostgREST 가 늘 같은 오프셋으로 준다는 보장이 없고,
     한 자리라도 형식이 달라지면 비교가 조용히 뒤집힌다. */
function isAfter(a, b){
  var ta = Date.parse(a || ''), tb = Date.parse(b || '');
  return isFinite(ta) && isFinite(tb) && ta > tb;
}
/* 검수 뒤에 도착한 증빙이 있으면 '검수한 건' 표시를 도로 지운다.
   ★ 이게 없으면 위 복원이 **기존 설계를 깬다.** 배분기관이 새 증빙을 내면
     screen-donor.js 가 `delete c.inspectedAt` 으로 게이트를 다시 열어 새 증빙까지 대조하게 한다.
     그런데 그 삭제는 **기관 브라우저의 메모리에서만** 일어난다 — 담당자 화면은 늘 새로 부팅한다.
     즉 담당자 쪽에서 게이트를 다시 열어 주던 유일한 힘이 "표시가 복원되지 않는 것" 이었다.
     조건 없이 복원하면 담당자는 **새 증빙이 빠진 옛 판정**을 결과라고 보게 된다 —
     화면이 거짓말하는 자리가 하나 더 생긴다. 그래서 시각을 견준다. */
function markStaleInspection(c){
  if (!c || !c.inspectedAt) return;
  if (isAfter(c.lastEvidenceAt, c.lastInspectAt)) delete c.inspectedAt;
}

/* ══════════════════════════════════════════════════════════════
   원장 쓰기 — donation · distribution (2026-09-02 유진)

   ★ 왜 지금 붙이나 — 9/2 에 세어보니 DB 에 쓰는 테이블이 4개뿐이었다.
       쓴다  : attachment · audit_log · inspection · inspection_finding
       안 쓴다: donation · distribution · checklist_item · form_submission
     donation 은 sbGet 만 있었다. 즉 담당자가 등록한 배분처도, 바뀐 상태도
     브라우저 메모리에만 있었다. 새로고침하면 사라진다.
     9/8 기준선이 "1건이 접수→검수→완결까지 실제 데이터로 도는 것" 인데
     실제 데이터인 것은 검수와 첨부뿐이었다.

   ★ 이 저장은 시끄럽다 (uploadCaseFiles 와 같은 편 · 인수인계 §2①)
     담당자가 "등록했다" 고 믿는데 DB 에 없는 상태가 제일 나쁘다.
     saveInspectionRun 이 조용한 것은 그것이 'AI 의견' 이라 실패해도
     담당자가 화면 값을 그대로 쓸 수 있기 때문이다. 원장은 다르다.

   ⚠️ 데모(DB 미연결) 에서는 조용히 넘어간다 — 붙을 DB 자체가 없다.
      {ok:true, demo:true} 를 돌려주므로 화면은 성공으로 다룬다.
   ══════════════════════════════════════════════════════════════ */

/* ── 제출본 저장 (form_submission) ─────────────────────────────
   ★ donation 과 무엇이 다른가 —
     donation 은 '이 건의 지금 값' 이다. 담당자가 고치면 바뀐다.
     form_submission 은 '그때 낸 그대로' 다. 바뀌지 않고, 낼 때마다 한 줄씩 쌓인다.
     그래야 "후원자가 400개라고 냈는데 왜 지금 380개인가" 에 답할 수 있다.
     원장만 있으면 누가 언제 고쳤는지 알 수 없다.

   ★★ 개인정보 분리 지점이다 (privacy-design §2)
     payload 에 넣는 것은 **대조에 쓰는 값**뿐이다 — 품목·수량·단가·금액·일자·경로.
     이름·주민번호·연락처·주소·서명 이미지는 **넣지 않는다.**
     그것들은 pdf_key 가 가리키는 PDF 안에만 둔다(PDF 기능이 붙으면 채운다).
     그래야 DB 가 통째로 유출돼도 개인정보가 한 건도 나오지 않는다.

   ⚠️ 여기에 개인정보를 한 칸이라도 추가하면 그 설계가 무너진다.
     "편의상 이름만" 이 제일 흔한 무너짐이다. 넣지 말 것. */
function submissionPayload(f, c, qty, book, fair){
  /* 화이트리스트다 — f 를 통째로 담지 않는다.
     통째로 담으면 폼에 칸이 하나 늘 때마다 개인정보가 조용히 따라 들어간다. */
  return {
    '품목':     f.itemName || null,
    '수량':     qty || null,
    '단위':     f.pkg || null,
    '단가':     Number(f.unitBook) || Number(f.unitSale) || null,
    '장부가액': book || null,
    '공정가액': fair || null,
    '후원일자': f.donDate || null,
    '취득경로': (c && c.acqPath) || null,
    '영수증발급희망': !!f.wantsReceipt
  };
}

/* 제출본 1건 저장. 재제출이면 새 줄로 쌓인다(이력 보존 — 덮어쓰지 않는다). */
function saveFormSubmission(c, opt){
  var _g = writeGate(c, '제출본'); if (_g) return _g;
  var K = COL.formSubmission, row = {};
  row[K.donationId]     = c.dbId;
  row[K.distributionId] = (opt.distId && !isTempDistId(opt.distId)) ? opt.distId : null;
  row[K.formType]       = opt.formType;
  row[K.payload]        = opt.payload || {};
  row[K.signed]         = !!opt.signed;
  row[K.submitterRole]  = opt.role || 'donor';
  /* ★ pdf_key — 신청서 PDF 의 저장소 경로(forms/<건>/<uuid>.pdf). 개인정보는 그 PDF 안에만 있다.
     null 이면 "이 제출의 개인정보·서명은 어디에도 저장되지 않았다" 는 뜻이다 — PDF 생성·업로드 실패.
     부르는 쪽(submitDonor)이 pending.pdf 로 세우고, 담당자는 후원자 재제출을 요청한다(retrySaveCase). */
  row[K.pdfKey]         = opt.pdfKey || null;
  return sbPost(T.formSubmission, [row]).then(function(made){
    var id = made && made[0] && made[0][K.id];
    if (!id) throw new Error('제출본 id를 받지 못했습니다');
    return {ok:true, id:id};
  });
}

/* ── 제출본의 빈 PDF 주소 칸을 나중에 채운다 (2026-09-04 선미) ──
   ★ 왜 필요한가 — 제출본과 신청서 PDF 는 서로 필요하지 않은데 한 줄로 세워져 있었다.
     PDF 가 끝나지도 실패하지도 않으면(무응답) 그 뒤의 제출본 저장이 **시작조차 안 됐다**.
     (미공개 내부 기록)
     그래서 순서를 뒤집었다 — 제출본을 먼저 남기고(주소 칸은 빈칸), PDF 가 되면 여기서 채운다.

   ⚠️ 이것은 '제출본은 바뀌지 않는다' 는 원칙의 예외가 아니다.
     **빈칸을 채우는 것만** 한다 — 조건에 `pdf_key=is.null` 을 넣어 이미 값이 있는 줄은
     이 함수로 절대 못 덮는다. 후원자가 낸 값(payload)은 여기서 건드리지 않는다.

   ⚠️ 204 를 믿지 않는다 — RLS 는 거부가 아니라 '보이는 행이 없음' 으로 막는다(방어②).
     0행이면 실패로 올린다. 부르는 쪽이 pending.pdf 로 세운다.
   반환: {ok:true} · 데모면 {ok:true, demo:true} */
function attachFormPdfKey(submissionId, pdfKey){
  if (!sbReady()) return Promise.resolve({ok:true, demo:true});
  if (!submissionId || !pdfKey) return Promise.resolve({ok:false, skipped:true});
  var K = COL.formSubmission, patch = {};
  patch[K.pdfKey] = pdfKey;
  var key = SUPABASE_CONFIG.key;
  return fetch(sbBase() + '/rest/v1/' + T.formSubmission
               + '?' + K.id + '=eq.' + encodeURIComponent(submissionId)
               + '&' + K.pdfKey + '=is.null', {
    method: 'PATCH',
    headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(patch)
  }).then(function(res){
    if (!res.ok) return res.text().then(function(t){ throw new Error('HTTP ' + res.status + ' — ' + t.slice(0, 200)); });
    return res.json();
  }).then(function(rows){
    if (!rows || !rows.length)
      throw new Error('제출본 ' + submissionId + ' 의 PDF 주소 칸을 채우지 못했습니다 — 이미 값이 있거나 권한(RLS)이 막았습니다');
    return {ok:true};
  });
}

/* ── 신청서 PDF 올리기 ─────────────────────────────────────────
   ★ forms/ 아래에 둔다 — attachments/ 와 가르는 이유는 storagePath 주석 참조
     (이 PDF 에만 주민번호·서명이 있어 나중에 권한을 더 좁게 건다).
   ⚠️ 실패를 삼키지 않는다 — 이 PDF 가 개인정보·서명의 **유일한 사본**이다.
     조용히 넘어가면 후원자는 냈다고 믿고 재단에는 이름도 서명도 없다. 부르는 쪽이 pending.pdf 로 세운다.
   반환: 저장소 키 · 데모(DB 미연결)면 null */
function uploadFormPdf(c, bytes){
  if (!sbReady() || !c || !c.dbId) return Promise.resolve(null);
  var path = storagePath('forms', c.dbId, 'form.pdf');
  return sbUploadFile(path, new Blob([bytes], {type:'application/pdf'}));
}

/* 이 건의 제출본 중 PDF 가 있는 것 — ZIP 에 담고(caseZipEntries), 담당자가 연다(열람 기능은 별도).
   반환: [{id, formType, pdfKey, submittedAt, role}] · 데모면 [] */
function loadFormPdfs(c){
  if (!sbReady() || !c || !c.dbId) return Promise.resolve([]);
  var K = COL.formSubmission;
  return sbGet(T.formSubmission,
    /* ★ payload 를 함께 읽는다 (2026-09-12 · #317) — 인수증 수량 대조를 되살리기 위해서다.
         ⚠️ **거르는 조건(filter)은 그대로다** — 읽는 칸만 하나 늘렸다. 위 주석이 경계한 것은
           "pdf_key 없는 행까지 끌어와 ZIP 이 안 열리는 파일을 담는 것" 이라 여기와 무관하다. */
    'select=' + [K.id, K.formType, K.pdfKey, K.payload, K.submittedAt, K.submitterRole, K.distributionId, K.signed].join(',') +
    '&' + K.donationId + '=eq.' + c.dbId + '&' + K.pdfKey + '=not.is.null' +
    '&' + K.purgedAt + '=is.null&order=' + K.submittedAt + '.asc'
  ).then(function(rows){
    return (rows || []).map(function(r){
      return {id:r[K.id], formType:r[K.formType], pdfKey:r[K.pdfKey], submittedAt:r[K.submittedAt], role:r[K.submitterRole],
              signed:r[K.signed],                    /* 전자서명 여부 — [S] 항목 상태를 되살릴 때 쓴다 (2026-09-05) */
              payload:r[K.payload] || null,          /* 대조값 — 인수증 수량이 여기 있다 (2026-09-12 · #317) */
              distId:r[K.distributionId] || null};   /* 인수증은 배분처별 — 어느 기관 것인지 (2026-09-05) */
    });
  });
}

/* ── 인수증 수량 대조를 되살린다 (2026-09-12 선미 · #317) ──────────────
   ★ 무엇이 빠져 있었나 — 기관이 인수증을 낼 때 screen-donor.js submitOrg 가
     «인수 수량 ≠ 이 기관 배분 수량» 이면 `it.r.qtyFlag` 를 세운다. 그런데 그것은
     **기관 브라우저의 메모리**다. qtyFlag 는 DB 에 칸이 없고 저장되지도 않는다.
     담당자는 다른 탭·다른 사람이라 그 메모리를 영영 못 본다 —
     100 개 배분에 50 개 인수증을 내도 ⑤ 검수는 아무것도 걸지 않았다.
     (9/4 "제출본이 PDF 뒤에 줄서 있다" · 9/10 ②번과 같은 뿌리 — 한쪽 브라우저에만 있는 상태.)
   ★ 고치는 방향은 **새 칸을 만들지 않는다**(스키마 불가침). 두 값이 이미 DB 에 있다 —
     받은 수량은 인수증 제출본의 payload['수량'], 기준 수량은 그 배분처 행의 qty.
     되읽을 때 **다시 센다.** 저장된 판정을 믿는 것이 아니라 사실에서 매번 새로 나온다.
   ⚠️ 담당자가 이미 처리한 것은 건드리지 않는다 — 확정(st==='done')·사유 해소(resolution)가 있으면 그만둔다.
     사유로 넘어간 것을 되읽을 때마다 다시 세우면 담당자가 같은 일을 영원히 반복한다.
   ⚠️ 값이 없거나(옛 제출분) 0 이면 아무 말도 하지 않는다 — 모르는 것을 불일치라고 하지 않는다. */
function receiptQtyOf(payload){
  if (!payload || typeof payload !== 'object') return 0;
  var v = payload['수량'];
  if (v == null || v === '') return 0;
  return Number(String(v).replace(/[^0-9.-]/g, '')) || 0;
}
function distQtyOf(c, distId){
  if (!distId || !c || !c.dists) return 0;
  var d = (c.dists || []).filter(function(x){
    return String(x.id || x[COL.distribution.id]) === String(distId);
  })[0];
  if (!d) return 0;
  return Number(d.qty != null ? d.qty : d[COL.distribution.qty]) || 0;
}
function restoreReceiptQtyFlag(c, it, p){
  var r = it.r || (it.r = {});
  if (r.st === 'done' || r.resolution) return;          /* 담당자가 이미 확정했거나 사유로 해소했다 */
  var recv = receiptQtyOf(p && p.payload);
  if (!recv) return;                                     /* 적어 낸 수량을 모른다 — 단정하지 않는다 */
  var basis = 'dist', exp = distQtyOf(c, p && p.distId);
  if (!exp){                                             /* 배분처 행이 없는 옛 구조 — 건 신고 수량으로 (submitOrg 와 같은 갈래) */
    exp = Number(c && c.donation && c.donation.qty) || 0;
    basis = 'donation';
  }
  if (!exp) return;
  if (recv === exp){ delete r.qtyFlag; return; }
  r.qtyFlag = {recv:recv, expected:exp, basis:basis};
}

/* form_submission 의 PDF 를 화면 레지스트리(FILES)에 올린다 — 첨부(restoreAttachments)와 짝.
   ★ 주소(서명 URL)는 미리 받지 않는다 — 첨부와 다른 점이다.
     이 PDF 에는 주민번호·서명이 있다. 주소는 '여는' 순간에만 만들고 그때 pdf.view 를 남긴다(openFormPdf).
     미리 받아 두면 기록 없이 열리는 주소가 화면 메모리에 떠 있게 된다.
   반환: 되살린 건수 · 실패해도 건 목록은 그대로 뜬다 */
function restoreFormPdfs(c){
  return loadFormPdfs(c).then(function(list){
    c.formPdfIds = [];
    list.forEach(function(p){
      var fid = 'fp' + p.id;
      FILES[fid] = {id:fid, name:(p.formType || '신청서') + '.pdf', type:'application/pdf', size:0, blob:null, demo:false,
                    storageKey:p.pdfKey, formPdf:true, submissionId:p.id, formType:p.formType,
                    submittedAt:p.submittedAt, role:p.role, distId:p.distId || null};
      c.formPdfIds.push(fid);
      if (isAfter(p.submittedAt, c.lastEvidenceAt) || !c.lastEvidenceAt) c.lastEvidenceAt = p.submittedAt;
    });

    /* ★ [S] 신청서 항목의 '폼으로 냈다' 를 되살린다 (2026-09-05 선미 실주행 · #217·#218).
         전에는 PDF 만 되살렸다. 그런데 항목 상태를 정하는 것은 `it.r.formSubmit` 이라,
         새로고침하면 신청서 항목이 **'미수취'** 로 섰다 — 화면 바로 위에
         "신청서 PDF 열기" 가 떠 있는데도 그 아래는 "미수취 상태입니다" 였다.
         후원자는 폼을 냈고 PDF 도 저장소에 있다. 안 온 것이 아니다.
       ⚠️ '수취완료' 로 만들지 않는다 — itemStatus 가 '확인필요 · 폼 제출' 로 세운다.
         코드는 필수항목·서명 유무까지만 보고, 품목·가액 산정이 타당한지는
         담당자가 원문을 보고 판단한다(기관 업무지침 · F2).
       ⚠️ 담당자가 이미 확정한 항목은 status='수취완료' 로 따라와 r.st==='done' 이고,
         itemStatus 가 그것을 먼저 보므로 여기서 덮이지 않는다. */
    var applPdf = list.filter(function(p){
      return !p.distId && /물품기부신청서/.test(String(p.formType || ''));
    });
    if (applPdf.length){
      var last = applPdf[applPdf.length - 1];      /* 재제출이면 마지막 것이 지금 것이다 */
      (c.checklist || []).forEach(function(it){
        if (it.kind !== 'S' || !it.included) return;
        if (it.r.formSubmit) return;               /* DB 에서 이미 따라온 것이 있으면 그대로 */
        it.r.formSubmit = {status:'submitted',
                           date: String(last.submittedAt || '').slice(0, 10),
                           signed: last.signed !== false};
      });
    }

    /* ★ [A] 인수증 항목의 '기관이 폼으로 냈다' 를 되살린다 (2026-09-07 연수 · #225 실주행).
         **바로 위 신청서 블록과 똑같은 버그가 배분 쪽에 그대로 남아 있었다.**
         9/5 에 신청서(#217·#218)만 고쳤고 인수증은 세 겹으로 전부 걸러지고 있었다 —
           ① formType 이 '인수증' 이라 /물품기부신청서/ 에 안 걸린다
           ② distId 가 있어 `!p.distId` 에서 빠진다 (인수증은 배분처별이다)
           ③ kind 가 'A' 라 `it.kind !== 'S'` 에서 빠진다
         결과는 위 주석이 신청서에 대해 적어 둔 것과 **글자 그대로 같았다** —
         "인수증 PDF 열기" 가 화면 바로 위에 떠 있는데 그 아래는 "미수취 상태입니다".
         기관은 냈고 PDF 도 저장소에 있다. 안 온 것이 아니다.

       ⚠️ formSubmit 이 아니라 **orgUpload 로** 되살린다 — 갈리는 지점이다.
         itemStatus 는 formSubmit 을 보면 '수취완료' 로 확정한다(common.js:289 · 선미 9/6 결정).
         그 결정은 **후원자 신청서** 것이다 — donorErrors 가 필수항목·서명을 다 막아서
         받은 서류인 것이 이미 확실하기 때문이다.
         기관 제출분은 다르다 — "파일이 올라왔다 ≠ 그 서류를 받았다"(common.js:269).
         orgUpload 로 세우면 '확인필요'(common.js:271)로 서고, 담당자가 [수취] 한 번으로
         confirmUpload 를 탄다. 화면의 "확인 후 수취 처리하세요" 안내와도 말이 맞는다.
       ⚠️ 담당자가 이미 확정한 항목은 status='수취완료' 로 따라와 r.st==='done' 이고,
         itemStatus 가 그것을 먼저 보므로 여기서 덮이지 않는다.
       ⚠️ 기관마다 한 장이다 — distId 가 같은 인수증 항목에만 붙인다.
         안 가르면 3기관 건에서 한 기관이 낸 것으로 셋이 다 확인필요로 선다. */
    list.filter(function(p){ return /인수증/.test(String(p.formType || '')); })
        .forEach(function(p){
      (c.checklist || []).forEach(function(it){
        if (it.key !== 'inss' || !it.included) return;
        if (String(it.distId || '') !== String(p.distId || '')) return;
        restoreReceiptQtyFlag(c, it, p);                                     /* 수량 대조 (2026-09-12 · #317) */
        if (it.r.orgUpload && it.r.orgUpload.status === 'uploaded') return;   /* 이미 있으면 그대로 */
        it.r.orgUpload = {status:'uploaded',
                          date: String(p.submittedAt || '').slice(0, 10),
                          fileName: '인수증 폼 작성 · 수령자 전자서명'};
      });
    });
    /* ★ 제출은 있는데 PDF 가 없는 행을 화면에 세운다 (2026-09-07 · 승희 실 DB 조회 → 선미)
         위 두 블록은 **PDF 가 저장된 제출분만** 본다(loadFormPdfs 가 pdf_key=not.is.null 로 거른다).
         그래서 PDF 저장이 안 된 제출은 되살아나지 않고 항목이 '미수취' 로 선다 — **냈는데 안 왔다고 말한다.**
       ⚠️ 이 행들은 결함이 아니라 **9/4 설계 결정의 뒷면**이다(db.js:946) —
         "제출본을 먼저 남기고 PDF 는 되면 채운다" 로 순서를 뒤집었기 때문에 생길 수 있는 모양이다.
         그 전에는 PDF 가 멈추면 제출 내용이 통째로 안 남았다. 뒤집은 것이 옳았다.
       실 DB 7건 · 전부 9/2~9/3 · 9/4 이후 0건 (인수증 1 · 신청서 6 — 승희 조회). */
    return loadFormSubmissionsNoPdf(c).then(function(gaps){
      markFormSubmissionsWithoutPdf(c, gaps);
      return list.length;
    }, function(){ return list.length; });   /* 이 조회가 실패해도 위 복원은 살린다 */
  }).catch(function(err){
    console.error('[저장소] 신청서 PDF 목록을 되살리지 못했습니다 (#' + (c && c.id) + '):', err.message || err);
    return 0;
  });
}

/* PDF 가 저장되지 않은 제출분만 읽는다 — loadFormPdfs 의 짝 (2026-09-07)
   ⚠️ loadFormPdfs 를 넓히지 않고 **따로** 부른다. 그 함수의 결과는 ZIP 묶기(buildCaseZipWith)도 쓰는데,
     주소가 없는 행이 섞이면 ZIP 이 열리지 않는 파일을 담으려 한다. 부르는 곳을 안 건드리는 쪽이 안전하다. */
function loadFormSubmissionsNoPdf(c){
  if (!sbReady() || !c || !c.dbId) return Promise.resolve([]);
  var K = COL.formSubmission;
  return sbGet(T.formSubmission,
    'select=' + [K.id, K.formType, K.payload, K.submittedAt, K.submitterRole, K.distributionId].join(',') +
    '&' + K.donationId + '=eq.' + c.dbId + '&' + K.pdfKey + '=is.null' +
    '&' + K.purgedAt + '=is.null&order=' + K.submittedAt + '.asc'
  ).then(function(rows){
    return (rows || []).map(function(r){
      return {id:r[K.id], formType:r[K.formType], submittedAt:r[K.submittedAt], payload:r[K.payload] || null,
              role:r[K.submitterRole], distId:r[K.distributionId] || null};
    });
  });
}

/* "제출은 됐는데 서류 파일이 없다" 를 항목에 표시한다 — 파일은 만들지 않는다 (2026-09-07)
   ★ 왜 파일을 안 만드나 — 되살리기를 넓혀 PDF 없는 행까지 등록하면 **열리지 않는 [PDF 열기] 버튼**이 생긴다.
     지금 거짓말("미수취")을 다른 거짓말("열리는 척하는 버튼")로 바꾸는 것이다.
     화면이 사실대로 말하게 하는 것이 이 표시의 전부다 — itemStatus 가 '확인필요 · 서류 파일 없음' 으로 세운다.
   ★ **인수증만이 아니다** — 실 DB 7건 중 6건이 신청서였다(승희 9/7). 두 경로를 함께 본다.
   ⚠️ 진짜 증거가 있으면 그쪽이 이긴다 — 담당자 확정(r.st==='done')·폼 제출본(formSubmit)·
     기관 업로드(orgUpload)가 있으면 손대지 않는다. 이 표시는 **아무 증거도 없을 때만** 붙는다. */
function markFormSubmissionsWithoutPdf(c, rows){
  if (!c || !rows || !rows.length) return 0;
  var n = 0;
  rows.forEach(function(p){
    var isRc = /인수증/.test(String(p.formType || ''));
    (c.checklist || []).forEach(function(it){
      if (!it.included) return;
      /* 인수증은 배분처별 · 신청서는 건당 한 장([S] 항목) */
      if (isRc){
        if (it.key !== 'inss') return;
        if (String(it.distId || '') !== String(p.distId || '')) return;
        restoreReceiptQtyFlag(c, it, p);   /* PDF 가 없는 제출분도 수량은 대조한다 (2026-09-12 · #317) */
      } else {
        if (it.kind !== 'S') return;
        if (p.distId) return;                       /* 배분 단계 서류는 신청서 항목에 붙이지 않는다 */
      }
      var r = it.r || (it.r = {});
      if (r.st === 'done' || r.resolution) return;                       /* 담당자가 이미 확정했다 */
      if (r.formSubmit || (r.orgUpload && r.orgUpload.status === 'uploaded')) return;  /* 진짜 제출본이 있다 */
      if (r.formNoFile) return;                                          /* 이미 표시했다 */
      r.formNoFile = {at: String(p.submittedAt || '').slice(0, 10),
                      formType: p.formType || '', role: p.role || '', submissionId: p.id};
      n++;
    });
  });
  if (n) console.warn('[저장소] 제출 기록은 있는데 서류 파일이 없는 항목 ' + n + '건 — 화면에 표시합니다 (#' + (c && c.id) + ')');
  return n;
}

/* 신청서 PDF 열람 = 개인정보 열람이다. 반드시 기록한다 (privacy-design §열람 기록 · schema 'pdf.view').
   ⚠️ 기록이 안 남으면 열지 않는다 — 부르는 쪽(openFormPdf)이 이 약속을 지킨다. bulk.download 와 같은 편.
   ⚠️ 로그인 미도입 — '누가' 는 아직 못 적는다. 그 사실도 같이 남긴다(logBulkDownload 와 같다). */
function logPdfView(c, m){
  if (!sbReady() || !c || !c.dbId) return Promise.resolve(null);
  var A = COL.auditLog, row = {};
  row[A.actorType]  = 'staff';
  row[A.actorRef]   = authUid();   /* 로그인한 담당자의 auth uid (2026-09-07) — 없으면 null 로 남긴다 */
  row[A.action]     = 'pdf.view';
  row[A.targetType] = 'form_submission';
  row[A.targetId]   = String(m.submissionId || '');
  row[A.afterValue] = {건번호:c.id, 서류:m.formType || m.name, 저장소키:m.storageKey,
                       주의: authUid() ? undefined : '담당자 로그인 없이 실행 — 실행자를 특정할 수 없습니다'};
  return sbPost(T.auditLog, [row], {minimal:true}).catch(function(err){
    console.error('[감사] 신청서 PDF 열람 기록 실패 — 열지 않습니다:', err.message || err);
    throw err;
  });
}

/* 화면 상태 코드 → DB 표기 (ST_FROM_DB 의 역방향)
   ⚠️ 'res'(사유해소)는 여기 없다 — 상태가 아니라 '넘어갔다는 기록'이라서
     resolution_reason 칸에 따로 적는다. status 는 넘어가기 전 값을 그대로 둔다. */
var ST_TO_DB = {miss:'미수취', done:'수취완료', unc:'확인필요'};

/* 항목 이름에서 기관 꼬리를 뗀다 — '인수증 · 늘봄' → '인수증'
   ★ 왜 필요한가 — 되살릴 때(rowToItem) 기관명을 다시 붙인다.
     붙은 채로 저장하면 새로고침마다 '인수증 · 늘봄 · 늘봄' 으로 늘어난다. */
function stripOrgTail(text, org, sep){
  var t = String(text || ''), tail = sep + String(org || '');
  if (org && t.length > tail.length && t.slice(-tail.length) === tail) return t.slice(0, -tail.length);
  return t;
}

/* 화면 임시 배분처 id 인가 — 'sd1' 은 [배분결정]이 붙인 값이고 DB 에는 없는 번호다.
   ★ 한 군데서만 판단한다. 곳곳에서 정규식을 다시 쓰면 한 곳을 빠뜨리는 순간
     '어느 기관 것인지 모르는 행' 이 조용히 들어간다 (2026-09-13 · #323). */
function isTempDistId(v){ return !!v && /^sd\d+$/.test(String(v)); }

function itemToRow(c, it){
  var K = COL.checklistItem, row = {};
  var org = null;
  if (it.distId){
    var d = (c.dists || []).filter(function(x){ return String(x.id) === String(it.distId); })[0];
    org = d && (d.orgName || d[COL.distribution.orgName]);
  }
  row[K.donationId]     = c.dbId;
  /* 화면 임시 id(sd1)는 넣지 않는다 — 저장되지 않은 배분처를 가리키면 FK 가 깨진다.
     배분처가 먼저 저장돼 숫자 id 를 받은 뒤에 항목을 저장한다(saveChecklist 참조).
     ⚠️ 여기로 오면 **saveChecklist 가 막았어야 할 행**이다 (2026-09-13 · #323).
       NULL 로 들어간 배분 항목은 되읽을 때 어느 기관 것인지 알 수 없고,
       그 기관 링크는 자기 몫 슬롯을 0개로 본다 — 기관이 제출해도 아무것도 안 남는다.
       막지는 않는다(되감기가 더 위험하다). 대신 흔적을 남긴다. */
  if (isTempDistId(it.distId))
    console.error('[DB] 배분처가 저장되기 전에 항목을 넣으려 했습니다 — distribution_id 가 NULL 이 됩니다: '
                  + it.key + ' / ' + it.distId);
  row[K.distributionId] = (it.distId && !isTempDistId(it.distId)) ? it.distId : null;
  row[K.docKey]         = it.key;
  row[K.docName]        = stripOrgTail(it.n, org, ' · ');
  row[K.kind]           = it.kind;
  row[K.stage]          = it.stage || '접수';
  row[K.owner]          = stripOrgTail(it.g, org, ' — ');
  row[K.basis]          = it.basis || null;
  row[K.dueDate]        = it.due || null;
  row[K.included]       = it.included !== false;
  row[K.note]           = it.note || null;
  row[K.status]         = ST_TO_DB[(it.r && it.r.st) || 'miss'] || '미수취';
  if (it.r && it.r.resolution){
    row[K.resolutionReason] = it.r.resolution.reason;
    row[K.resolvedBy]       = it.r.resolution.by || '담당자';
    row[K.resolvedAt]       = it.r.resolution.date || TODAY;
  }
  return row;
}

/* 이 건 안에서 항목을 가리키는 이름. autoChecklist() 가 만든 항목은 uid 가 없어서
   (mkItem 을 거치지 않는다) key 로만 가려진다 — 접수 단계 항목은 배분처가 없어 그것으로 충분하다. */
function itemUidOf(it){ return it.uid || (it.key + (it.distId ? '#' + it.distId : '')); }

/* 다시 전개한 체크리스트가 이미 DB 에 있는 줄을 물려받는다 (2026-09-03 유진 · 연수 실주행 발견)

   ★ 왜 필요한가 — 링크를 발급할 때 체크리스트를 DB 에 남긴다. 그래야 후원자가
     **다른 기기로 링크를 열어도** 업로드 칸이 보인다(안 남기면 0개가 되고, 그대로 제출되면
     첨부 0건으로 넘어간다 — 화면은 멀쩡하다).
     그런데 후원자가 제출할 때 autoChecklist() 가 목록을 **통째로 다시 만든다.**
     새 항목에는 dbId 가 없으므로 saveChecklist 가 같은 서류를 **한 줄 더** 넣는다.

   ★ 빠진 항목은 지우지 않는다 — RLS 에 delete 정책이 없다(9/7 승희 과제).
     included=false 로 내려 "이 건에서는 받지 않는다" 로 남긴다. 지워지는 것보다 낫다.

   ★ 상태(r)는 옮기지 않는다 — 재전개는 '무엇을 받아야 하는가' 를 다시 정하는 자리이고,
     수취 여부는 그 뒤에 담당자가 정한다. 여기서 옮기면 어느 쪽이 진짜인지 흐려진다. */
function adoptChecklistIds(c, prevList){
  if (!c) return {adopted:0, retired:0};
  var left = {};
  (prevList || []).forEach(function(it){ if (it && it.dbId) left[itemUidOf(it)] = it.dbId; });
  var adopted = 0;
  (c.checklist || []).forEach(function(it){
    var uid = itemUidOf(it);
    if (!left.hasOwnProperty(uid)) return;
    it.dbId = left[uid];
    delete left[uid];
    adopted++;
  });
  var gone = Object.keys(left).map(function(u){ return left[u]; });
  if (gone.length) c.retiredItemIds = (c.retiredItemIds || []).concat(gone);
  return {adopted:adopted, retired:gone.length};
}

/* 재전개에서 빠진 항목을 내린다 — 지우지 못하므로 included=false 로 표시한다.
   ⚠️ note 는 건드리지 않는다. 그 항목이 왜 있었는지가 note 에 있어서, 덮으면 근거가 사라진다. */
function retireChecklistItems(ids){
  if (!ids || !ids.length) return Promise.resolve({ok:true, skipped:true});
  var K = COL.checklistItem, patch = {};
  patch[K.included] = false;
  var key = SUPABASE_CONFIG.key;
  return fetch(sbBase() + '/rest/v1/' + T.checklistItem + '?' + K.id + '=in.('
               + ids.map(encodeURIComponent).join(',') + ')', {
    method: 'PATCH',
    headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(patch)
  }).then(function(res){
    if (!res.ok) return res.text().then(function(t){ throw new Error('HTTP ' + res.status + ' — ' + t.slice(0, 200)); });
    return res.json();
  }).then(function(rows){
    /* 204 를 믿지 않는다 — RLS 는 거부가 아니라 '보이는 행이 없음' 으로 막는다(9/2 §2③). */
    if (!rows || rows.length !== ids.length)
      throw new Error('빠진 항목 ' + ids.length + '건 중 ' + ((rows && rows.length) || 0) + '건만 내려갔습니다 — 권한(RLS)을 확인해 주세요');
    return {ok:true, count:rows.length};
  });
}

/* 확정 체크리스트를 저장한다 — 아직 DB 에 없는 항목만.
   ★ 왜 '없는 것만' 인가 — 체크리스트는 여러 번 다시 전개된다(후원자 제출·배분결정).
     매번 통째로 넣으면 같은 서류가 여러 줄이 되고, 첨부가 어느 줄에 붙었는지 흐려진다.
   ★ 저장 순서 — 배분 단계 항목은 배분처가 먼저 저장돼 있어야 distribution_id 를 채운다.
     아직 임시 id(sd1)면 NULL 로 들어가므로, 배분처 저장이 끝난 뒤에 부른다. */
function saveChecklist(c){
  var _g = writeGate(c, '체크리스트'); if (_g) return _g;
  var retired = (c.retiredItemIds || []).slice();
  /* ★ 배분처가 아직 DB 에 없는 항목은 **지금 넣지 않는다** (2026-09-13 · #323 유진 실주행)
       [배분결정] 은 배분처를 저장한 뒤(saveDistribution → remapDistUid) 이 함수를 부른다.
       그런데 담당자가 기관을 잇달아 추가하면 앞 기관의 저장이 끝나는 시점에
       **뒤 기관의 항목까지** 아직 'sd2' 인 채로 함께 실려 distribution_id = NULL 로 들어갔다.
       한 번 들어가면 dbId 가 붙어 아래 filter 에서 빠지므로 **영영 고쳐지지 않는다.**
       그 결과 첫 기관 말고는 링크를 열어도 자기 몫 슬롯이 0개라(orgSlots 가 distId 로 좁힌다)
       기관이 제출해도 담당자 화면에는 첫 기관 것만 남았다.
     ★ 미루는 것으로 충분하다 — 그 기관의 decideDist 콜백이 자기 배분처를 저장한 뒤
       이 함수를 다시 부른다. 저장이 실패한 기관은 [배분처 다시 저장]이 이어받는다. */
  var deferred = 0;
  var pending = (c.checklist || []).filter(function(it){
    if (it.dbId) return false;
    if (isTempDistId(it.distId)){ deferred++; return false; }
    return true;
  });
  if (!pending.length && !retired.length)
    return Promise.resolve({ok:true, skipped:true, deferred:deferred});
  /* 내리는 것이 먼저다 — 새로 넣는 것과 순서가 바뀌면, 넣는 데 실패했을 때
     빠진 항목만 내려간 채로 남아 '받을 서류가 하나도 없는 건' 이 된다. */
  return retireChecklistItems(retired).then(function(){
    c.retiredItemIds = [];
    if (!pending.length) return {ok:true, count:0, retired:retired.length, deferred:deferred};
    return sbPost(T.checklistItem, pending.map(function(it){ return itemToRow(c, it); }))
      .then(function(made){
        (made || []).forEach(function(row, i){ pending[i].dbId = row[COL.checklistItem.id]; });
        return {ok:true, count:(made || []).length, retired:retired.length, deferred:deferred};
      });
  });
}

/* 항목 하나의 상태·해소를 DB 에 반영한다 (수취 처리 · 사유 해소 · 원문 확인).
   ⚠️ dbId 가 없으면 아직 저장 안 된 항목이다 — 조용히 넘기지 않고 알린다.
     "수취 처리했는데 DB 에 없다" 가 제일 나쁜 모양이다. */
function saveItemStatus(c, it){
  var _g = writeGate(c, '항목 상태'); if (_g) return _g;
  if (!it || !it.dbId) return Promise.reject(new Error('이 항목은 아직 저장되지 않았습니다 — 건을 다시 저장한 뒤 처리해 주세요'));
  var K = COL.checklistItem, patch = {};
  patch[K.status]      = ST_TO_DB[(it.r && it.r.st) || 'miss'] || '미수취';
  patch[K.confirmedAt] = (it.r && it.r.date) ? it.r.date : null;
  patch[K.resolutionReason] = (it.r && it.r.resolution) ? it.r.resolution.reason : null;
  patch[K.resolvedBy]       = (it.r && it.r.resolution) ? (it.r.resolution.by || '담당자') : null;
  patch[K.resolvedAt]       = (it.r && it.r.resolution) ? (it.r.resolution.date || TODAY) : null;
  var key = SUPABASE_CONFIG.key;
  return fetch(sbBase() + '/rest/v1/' + T.checklistItem + '?' + K.id + '=eq.'
               + encodeURIComponent(it.dbId), {
    method: 'PATCH',
    headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(patch)
  }).then(function(res){
    if (!res.ok) return res.text().then(function(t){ throw new Error('HTTP ' + res.status + ' — ' + t.slice(0, 200)); });
    return res.json();
  }).then(function(rows){
    if (!rows || !rows.length) throw new Error('저장은 성공했다고 나왔지만 바뀐 행이 없습니다 — 권한(RLS)을 확인해 주세요');
    return {ok:true};
  });
}

/* ══════════════════════════════════════════════════════════════
   관리자 화면 데이터 (2026-09-10)
   ⚠️ 여기 함수들은 화면 게이트(isAdminUser) 뒤에서만 불린다. 하지만 화면 게이트는
     절반이다 — 계정 쓰기는 DB 쪽 정책(patch-20260910-admin-rls.sql · is_admin())이
     막는다. 관리자가 아닌 사람이 이 함수를 직접 불러도 **0행이 바뀐다.**
   ══════════════════════════════════════════════════════════════ */

/* 계정 목록 — 4명뿐이라 통째로 읽는다 */
function loadStaffList(){
  if (!sbReady()) return Promise.resolve({demo:true, rows:DEMO_STAFF.slice()});
  var K = COL.staff;
  return sbGet(T.staff, 'select=' + [K.id, K.name, K.email, K.role, K.status, K.createdAt, K.lastLoginAt].join(',') +
                        '&order=' + K.role + '.asc,' + K.name + '.asc')
    .then(function(rows){
      return {demo:false, rows:(rows || []).map(function(r){
        return {id:r[K.id], name:r[K.name], email:r[K.email], role:r[K.role],
                status:r[K.status], createdAt:r[K.createdAt], lastLoginAt:r[K.lastLoginAt]};
      })};
    });
}

/* 역할·상태 바꾸기 — 관리자만. 정책이 막으면 **0행**이 돌아온다(오류가 아니다).
   ⚠️ 0행을 성공으로 넘기지 않는다 — 이 저장소가 제일 자주 당한 모양이다(정본 5번 RLS DELETE 204). */
function saveStaffField(id, field, value){
  if (!sbReady()) return Promise.reject(new Error('실 DB 에 연결되어 있지 않습니다 — 계정은 데모에서 바꿀 수 없습니다'));
  var K = COL.staff;
  if (field !== 'role' && field !== 'status') return Promise.reject(new Error('바꿀 수 없는 칸입니다: ' + field));
  var patch = {}; patch[K[field]] = value;
  return fetch(sbBase() + '/rest/v1/' + T.staff + '?' + K.id + '=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(patch)
  }).then(function(res){
    if (!res.ok) return res.text().then(function(t){ throw new Error('HTTP ' + res.status + ' — ' + t.slice(0, 200)); });
    return res.json();
  }).then(function(rows){
    if (!rows || !rows.length)
      throw new Error('바뀐 행이 없습니다 — 관리자 권한이 없거나(RLS) 계정이 사라졌습니다');
    return {ok:true, row:rows[0]};
  });
}

/* 기본 통계 — 건수가 작아(수십~수백) 통째로 받아 화면에서 센다.
   ⚠️ 수천 건이 되면 서버 집계(뷰·RPC)로 옮긴다. 지금 옮기면 검증할 데이터가 없다. */
function loadAdminStats(){
  if (!sbReady()) return Promise.resolve(adminStatsFrom(DEMO_STATS_ROWS()));
  var D = COL.donation, CI = COL.checklistItem, I = COL.inspection, F = COL.inspectionFinding;
  return Promise.all([
    sbGet(T.donation,      'select=' + [D.state, D.inDate, D.completedAt, D.donorType, D.acquisitionPath].join(',')),
    sbGet(T.checklistItem, 'select=' + [CI.docName, CI.status].join(',')),
    sbGet(T.inspection,    'select=' + [I.status, I.startedAt].join(',')),
    sbGet(T.inspectionFinding, 'select=' + F.verdict)
  ]).then(function(r){
    return adminStatsFrom({donations:r[0] || [], items:r[1] || [], runs:r[2] || [], findings:r[3] || []});
  });
}

/* 센다 — 순수 함수라 검사에서 그대로 부른다 */
function adminStatsFrom(src){
  var D = COL.donation, CI = COL.checklistItem, I = COL.inspection, F = COL.inspectionFinding;
  var count = function(list, keyOf){
    var m = {}; (list || []).forEach(function(x){ var k = keyOf(x) || '(없음)'; m[k] = (m[k] || 0) + 1; });
    return m;
  };
  var days = [];
  (src.donations || []).forEach(function(d){
    var a = d[D.inDate], b = d[D.completedAt];
    if (!a || !b) return;
    var n = Math.round((new Date(String(b).slice(0,10)) - new Date(String(a).slice(0,10))) / 86400000);
    if (isFinite(n) && n >= 0) days.push(n);
  });
  days.sort(function(x, y){ return x - y; });
  var median = days.length ? (days.length % 2 ? days[(days.length - 1) / 2]
                              : Math.round((days[days.length/2 - 1] + days[days.length/2]) / 2)) : null;
  /* 확인필요가 잦은 서류 — 어느 서류부터 안내를 고칠지의 근거 */
  var uncBy = {};
  (src.items || []).forEach(function(it){
    if (it[CI.status] !== '확인필요') return;
    var n = it[CI.docName] || '(이름 없음)';
    uncBy[n] = (uncBy[n] || 0) + 1;
  });
  var uncTop = Object.keys(uncBy).map(function(k){ return {name:k, n:uncBy[k]}; })
                     .sort(function(a, b){ return b.n - a.n; }).slice(0, 5);
  return {
    total:      (src.donations || []).length,
    byState:    count(src.donations, function(d){ return d[D.state]; }),
    byDonor:    count(src.donations, function(d){ return d[D.donorType]; }),
    byPath:     count(src.donations, function(d){ return d[D.acquisitionPath]; }),
    completed:  days.length,
    medianDays: median,
    maxDays:    days.length ? days[days.length - 1] : null,
    runs:       (src.runs || []).length,
    runsFailed: (src.runs || []).filter(function(x){ return x[I.status] && x[I.status] !== 'success'; }).length,
    lastRunAt:  (src.runs || []).map(function(x){ return x[I.startedAt]; }).sort().slice(-1)[0] || null,
    byVerdict:  count(src.findings, function(x){ return x[F.verdict]; }),
    findings:   (src.findings || []).length,
    uncTop:     uncTop
  };
}

/* 데모용 — 실 DB 가 없을 때 화면이 비지 않게 (숫자는 DB.cases 에서 온다) */
var DEMO_STAFF = [
  {id:'demo-1', name:'담당자 (데모)', email:'staff@example.com',  role:'staff', status:'active',  createdAt:'2026-08-01', lastLoginAt:'2026-09-10'},
  {id:'demo-2', name:'관리자 (데모)', email:'admin@example.com',  role:'admin', status:'active',  createdAt:'2026-08-01', lastLoginAt:'2026-09-09'},
  {id:'demo-3', name:'퇴사자 (데모)', email:'left@example.com',   role:'staff', status:'disabled',createdAt:'2026-07-01', lastLoginAt:'2026-08-20'}
];
function DEMO_STATS_ROWS(){
  var D = COL.donation, CI = COL.checklistItem;
  var donations = (DB.cases || []).map(function(c){
    var r = {}; r[D.state] = c.state; r[D.inDate] = c.inDate || '2026-09-01';
    r[D.completedAt] = c.state === '완결' ? (c.completedAt || '2026-09-08') : null;
    r[D.donorType] = c.donorType; r[D.acquisitionPath] = c.acqPath; return r;
  });
  var items = [];
  (DB.cases || []).forEach(function(c){
    (c.checklist || []).forEach(function(it){
      var r = {}; r[CI.docName] = it.n;
      r[CI.status] = (it.r && it.r.st === 'unc') ? '확인필요' : (it.r && it.r.st === 'done') ? '수취완료' : '미수취';
      items.push(r);
    });
  });
  return {donations:donations, items:items, runs:[], findings:[]};
}

/* 화면 표기 → DB 의 접수 경로 분류 (submitted_via)
   ★ 왜 매핑이 필요한가 — DB 는 세 가지 분류만 받는다(스키마 check).
     화면은 담당자에게 보여줄 문장을 쓴다("접수 링크 발급(담당자 직접 전달)").
     그대로 넣으면 거부당하고, 제약을 풀어 자유 문구로 두면 통계가 섞인다
     ("링크 제출"이 몇 건인지 셀 수 없게 된다).
     그래서 **저장은 분류로, 화면은 문장으로** 나눈다.
   ⚠️ 모르는 문구는 지어내지 않고 null 을 넣는다 — 틀린 분류가 통계에 섞이는 것보다 낫다. */
function viaCategory(text){
  var t = String(text || '');
  if (!t) return null;
  if (/공문/.test(t)) return '공문';
  /* ⚠️ '직접 등록(서면 접수)' 을 만들던 화면 경로는 9/4 에 없앴다(접수는 무조건 링크).
       그래도 이 매핑은 **남긴다** — 실 DB 와 seed 에 이미 그 분류로 저장된 옛 건이 있고,
       그 건을 다시 저장할 때 분류가 null 로 비면 통계에서 조용히 사라진다. */
  if (/직접 등록|대리|전화/.test(t)) return '전화 문의 후 대리등록';
  if (/링크/.test(t)) return '링크 제출';
  console.warn('[DB] 모르는 접수 경로 표기 — 분류를 비웁니다: ' + t);
  return null;
}

/* 새 접수를 donation 에 만든다 (링크 발급·직접 등록 시점).
   ★ 이 시점에 아는 것만 넣는다 — 물품·금액은 후원자가 제출해야 채워진다.
     빈 값을 0 으로 채우면 "수량 0으로 접수된 건" 이 되어 E7 대조가 헛돈다.
   ★ 성공하면 c.dbId 가 생긴다. 이후의 모든 저장(배분처·완결·판정)이 이 값을 쓴다 —
     즉 여기서 실패하면 그 건은 이후에도 아무것도 저장되지 않는다. 그래서 시끄럽다. */
/* ── 접수번호 충돌 자동 회복 (2026-09-11 승희 · 동료 테스트 실측) ───────────────────────
   nextCaseNo() 는 **브라우저 메모리의 목록**으로 다음 번호를 정한다. 여러 명이 동시에 접수하는 지금은
   내 목록이 몇 분만 낡아도 남이 방금 쓴 번호를 다시 집는다 — 선미 화면이 #288(11:49 에 다른 계정이 생성)을
   또 넣으려다 `23505 duplicate key … donation_case_no_key` 로 막혔다(12:37).
   ★ 고침 두 겹 — ① insert 직전에 DB 에서 쓰인 번호를 새로 읽어 비어 있는 번호로 옮긴다
                 ② 그래도 그 사이에 누가 끼어들어 23505 가 나면 한 번 더 읽고 다음 번호로 다시 넣는다
   번호가 바뀌면 화면의 건(c.id)·발송 폼(DB.req.caseId)·오류 칸(caseSaveErr) 키를 같이 옮기고 알림을 띄운다.
   ⚠️ 진짜 해법은 DB 가 발번하는 것(sequence) — 그러면 화면이 번호를 되받아야 해서 제출 뒤 과제로 둔다. */
function takenCaseNos(){
  /* Promise 안에서 시작한다 — fetch 가 없는 환경(검사 · 옛 웹뷰)에서 동기 예외로 접수 자체가 죽지 않게. 실패는 null → 메모리 번호대로 */
  return Promise.resolve().then(function(){ return sbGet(T.donation, 'select=' + COL.donation.caseNo); }).then(function(rows){
    var t = {};
    (rows || []).forEach(function(r){ t[String(r[COL.donation.caseNo])] = true; });
    (DB.cases || []).forEach(function(c){ if (c && c.dbId) t[String(c.id)] = true; });
    return t;
  }).catch(function(){ return null; });          /* 못 읽으면 메모리 번호대로 간다 — 그때는 23505 재시도가 받친다 */
}
/* 원래 번호에서 **위로** 올라가 첫 빈 번호 — 201 부터 훑으면 옛 구멍(취소·정리된 번호)으로 떨어져 담당자가 헷갈린다.
   901~ 검사용 번호대는 건드리지 않는다(원래 번호가 그 아래라 거기까지 안 올라간다). */
function nextFreeCaseNo(taken, from){
  var n = Number(from) || 201;
  while (taken && taken[String(n)]) n++;
  return String(n);
}
function renumberCase(c, newId){
  var old = c.id;
  if (old === newId) return;
  c.id = newId;
  if (DB.req && DB.req.caseId === old) DB.req.caseId = newId;
  if (DB.caseId === old) DB.caseId = newId;
  if (DB.demo && DB.demo.subs && DB.demo.subs[old] != null){ DB.demo.subs[newId] = DB.demo.subs[old]; delete DB.demo.subs[old]; }
  if (DB.caseSaveErr && DB.caseSaveErr[old]){ DB.caseSaveErr[newId] = DB.caseSaveErr[old]; delete DB.caseSaveErr[old]; }
  DB.toast = {msg:'접수번호가 #' + old + ' → #' + newId + ' 로 바뀌었습니다', auto:true,
              cap:'다른 담당자가 #' + old + ' 를 먼저 썼습니다. 후원자에게는 새 번호로 안내해 주세요'};
}
function isDupCaseNo(err){ return /23505/.test(String((err && err.message) || err)) && /case_no/.test(String((err && err.message) || err)); }
function createDonation(c){
  if (!sbReady()) return Promise.resolve({ok:true, demo:true});
  if (c && c.dbId) return Promise.resolve({ok:true, already:true});
  return takenCaseNos().then(function(taken){
    if (taken && taken[String(c.id)]) renumberCase(c, nextFreeCaseNo(taken, c.id));
    return insertDonationRow(c);
  }).catch(function(err){
    if (!isDupCaseNo(err) || c.dbId) throw err;
    /* 읽고 넣는 사이에 누가 끼어들었다 — 한 번만 다시 */
    return takenCaseNos().then(function(taken){
      taken = taken || {}; taken[String(c.id)] = true;
      renumberCase(c, nextFreeCaseNo(taken, c.id));
      return insertDonationRow(c);
    });
  });
}
function insertDonationRow(c){
  var D = COL.donation, row = {};
  if (authStaffId()) row[D.createdBy] = authStaffId();   /* 누가 만들었나 — 심사위원 계정 건은 이 값으로 가른다 (2026-09-07) */
  row[D.caseNo]       = String(c.id);
  row[D.state]        = c.state || '제출 대기';
  row[D.donorType]    = c.donorType;
  /* ★ 법인 외는 **가린 이름**을 남긴다 — '김○수' (선미 결정 2026-09-06).
       안 남기니 담당자 목록에서 같은 품목·같은 날짜 건을 접수번호 말고는 구분할 수 없었다.
       실명은 신청서 PDF 안에만 있다.
     ⚠️ DB 제약이 이것을 지킨다 — patch-20260906-donor-name-mask.sql (2026-09-06 실행 완료).
       법인 외에는 NULL 이거나 '○' 가 든 값만 들어간다. **실명은 DB 가 거부한다.**
       그래서 여기서 maskName 을 빼면 저장이 400 으로 실패한다 — 조용히 새지 않는다. */
  row[D.donorName]    = (c.donorType === '법인') ? (c.donor || null) : (maskName(c.donor) || null);
  row[D.acquisitionPath] = c.acqPath || null;
  row[D.inDate]       = c.inDate || TODAY;
  row[D.submittedVia] = viaCategory(c.submittedVia);
  row[D.criteriaKey]  = c.criteriaKey || null;
  return sbPost(T.donation, [row]).then(function(made){
    var id = made && made[0] && made[0][COL.donation.id];
    if (!id) throw new Error('접수 id를 받지 못했습니다');
    c.dbId = id;
    /* ★ DB 가 번호를 바꿨을 수 있다 (patch-20260911-caseno-guard · 2026-09-11) — 같은 순간 두 사람이 같은 번호를
         넣으면 트리거가 뒤 사람 것을 다음 빈 번호로 바꿔 저장한다. 응답의 case_no 가 정본이다. */
    var savedNo = made[0][COL.donation.caseNo];
    if (savedNo != null && String(savedNo) !== String(c.id)) renumberCase(c, String(savedNo));
    return {ok:true, id:id};
  });
}

/* 화면의 배분처 하나 → distribution 행.
   ★ 낱개 수량(qty)만 필수다 — E7(배분 합계 = 접수 수량)이 이 값으로 대조한다.
     단위 3종(qty_as_received·qty_unit·pack_size)은 인수증에서 오는 값이라 지금은 비운다. */
function distToRow(c, d){
  var K = COL.distribution, row = {};
  row[K.donationId] = c.dbId;
  row[K.orgName]    = d.orgName || '';
  row[K.qty]        = Number(d.qty) || 0;
  row[K.distDate]   = d.distDate || TODAY;
  row[K.memo]       = d.memo || null;
  row[K.state]      = d.state || '배분 확정';
  return row;
}

/* 배분처 1곳 저장. 성공하면 화면의 임시 id(sd1)를 DB PK 로 바꿔 끼운다.
   ★ 왜 바꿔 끼우나 — 체크리스트 항목의 uid 가 'inss#sd1' 처럼 이 id 를 물고 있다.
     새로고침하면 DB PK 로 다시 그려지는데, 그때 uid 가 달라지면
     "3번 기관을 눌렀는데 1번이 처리되는" 그 자리로 되돌아간다(7359b83).
     그래서 저장 직후 같은 규칙으로 항목 uid 도 함께 옮긴다. */
function saveDistribution(c, d){
  var _g = writeGate(c, '배분처'); if (_g) return _g;
  return sbPost(T.distribution, [distToRow(c, d)]).then(function(made){
    var newId = made && made[0] && made[0][COL.distribution.id];
    if (!newId) throw new Error('배분처 id를 받지 못했습니다');
    var oldId = d.id;
    d.id = newId;
    if (oldId && oldId !== newId) remapDistUid(c, oldId, newId);
    return {ok:true, id:newId};
  });
}

/* 배분처가 살아 있는가 — 취소된 행은 E7 합계·남은 수량·기관 표기에서 전부 빠진다.
   ★ 한 군데서만 판단한다. 곳곳에서 cancelled_at 을 직접 보면 한 곳을 빠뜨리는 순간
     "합계에는 빠졌는데 기관 목록에는 남아 있는" 어긋난 화면이 된다. */
function distLive(d){
  if (!d) return false;
  return !(d[COL.distribution.cancelledAt] || d.cancelledAt);
}
function liveDists(c){ return ((c && c.dists) || []).filter(distLive); }

/* 배분처 한 줄 고치기 (PATCH). 화면 임시 id(sd1)는 DB 에 없으므로 막는다 —
   조용히 통과시키면 '고쳤다고 믿는데 DB 는 그대로'가 된다. */
function patchDistribution(c, d, patch, what){
  var _g = writeGate(c, what || '배분처'); if (_g) return _g;
  var id = d && d.id;
  if (!id || isTempDistId(id))
    return Promise.reject(new Error((what || '배분처') +
      ' — 배분처가 아직 저장되지 않았습니다(임시 id). 먼저 [배분처 다시 저장]을 눌러 주세요'));
  var K = COL.distribution;
  return fetch(sbBase() + '/rest/v1/' + T.distribution + '?' + K.id + '=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(patch)
  }).then(function(res){
    if (!res.ok) return res.text().then(function(t){
      throw new Error((what || '배분처') + ' 저장 실패 (' + res.status + ') ' + t);
    });
    return res.json();
  }).then(function(rows){ return {ok:true, row:(rows && rows[0]) || null}; });
}

/* 배분 수량 수정 — 증빙 수취 확정 전에만 (부르는 쪽 screen-staff.js distLocked 가 지킨다).
   ⚠️ 앱 규칙이다. DB 트리거로는 아직 안 막는다(patch-20260911 머리말) — 앱을 우회하면 통한다. */
function updateDistributionQty(c, d, qty){
  var K = COL.distribution, patch = {};
  patch[K.qty] = Number(qty) || 0;
  /* 인수증 값은 건드리지 않는다 — 수취 전이라 아직 없다. 있으면 수정 자체가 막혀 있다.
     (distribution_qty_matches_received 제약이 qty = qty_as_received × pack_size 를 본다) */
  return patchDistribution(c, d, patch, '배분 수량 수정').then(function(r){
    d.qty = Number(qty) || 0;
    return r;
  });
}

/* 배분 취소 — 지우지 않는다. 언제 누가 왜 물렸는지가 남아야 한다(revokeAccessLink 와 같은 규칙).
   ★ 사유는 필수다. DB 제약(distribution_cancel_reason_required)도 같이 본다 —
     화면만 막으면 앱을 우회한 빈 사유가 들어온다. */
function cancelDistribution(c, d, reason){
  var txt = String(reason || '').trim();
  if (!txt) return Promise.reject(new Error('배분 취소 — 사유를 적어 주세요'));
  var K = COL.distribution, patch = {};
  patch[K.cancelledAt]  = new Date().toISOString();
  patch[K.cancelReason] = txt;
  patch[K.cancelledBy]  = authUid();      /* 로그인 없이 돌면 null — 그 사실이 그대로 남는다 */
  return patchDistribution(c, d, patch, '배분 취소').then(function(r){
    d[K.cancelledAt]  = patch[K.cancelledAt];
    d[K.cancelReason] = txt;
    d[K.cancelledBy]  = patch[K.cancelledBy];
    return r;
  });
}

/* 항목 uid 의 배분처 부분만 갈아 끼운다 — 'inss#sd1' → 'inss#12'
   ⚠️ 문자열 치환이 아니라 '#' 뒤 전체를 바꾼다. 규칙코드에 '#' 이 없다는 전제이며,
     그 전제가 깨지면 uid 가 조용히 어긋나므로 여기서 한 번 더 확인한다. */
function remapDistUid(c, oldId, newId){
  (c.checklist || []).forEach(function(it){
    if (!it.uid || it.uid.indexOf('#') < 0) return;
    var head = it.uid.slice(0, it.uid.indexOf('#'));
    var tail = it.uid.slice(it.uid.indexOf('#') + 1);
    if (String(tail) !== String(oldId)) return;
    it.uid = head + '#' + newId;
    if (it.distId !== undefined) it.distId = newId;
  });
}

/* 건의 바뀐 값을 donation 에 반영한다 (상태·수량·금액·일자).
   ★ 무엇을 쓰는지 나열해 둔다 — '전부 덮어쓰기' 로 두면 화면이 안 가진 칸까지
     null 로 지운다. 실제로 그렇게 잃는 사고가 흔하다. */
function saveDonationFields(c, fields){
  var _g = writeGate(c, '제출 내용'); if (_g) return _g;
  var D = COL.donation, patch = {}, n = 0;
  var allow = {
    state:D.state, inDate:D.inDate, donorName:D.donorName, itemName:D.itemName,
    qty:D.qty, qtyAsReceived:D.qtyAsReceived, qtyUnit:D.qtyUnit, packSize:D.packSize,
    unitPrice:D.unitPrice, bookValue:D.bookValue, fairValue:D.fairValue,
    donationDate:D.donationDate, arriveDate:D.arriveDate, submittedVia:D.submittedVia,
    criteriaKey:D.criteriaKey, vatDeduction:D.vatDeduction, wantsReceipt:D.wantsReceipt,
    donorBizNo:D.donorBizNo, isCorpVerified:D.isCorpVerified, purpose:D.purpose,
    acquisitionPath:D.acquisitionPath, deadline:D.deadline,
    /* ★ completedAt — COL 에 선언만 있고 이 목록에 없어서 **넘겨도 조용히 버려졌다**
         (2026-09-08 연수 · #225 완결 뒤 실 DB 조회에서 드러났다).
       9/2 의 donorBizNo·acqPath 와 같은 모양이다 — 선언을 보고 "이미 된다" 고 읽기 쉬운 자리.
       ⚠️ 여기 없는 칸은 오류도 안 나고 그냥 안 써진다. 새 칸을 붙일 때 이 목록을 같이 본다. */
    completedAt:D.completedAt
  };
  /* 화면 문장 → DB 분류. createDonation 은 viaCategory 로 바꿔 보내는데 여기만 빠져 있었다 —
     같은 파일 안에서 규칙이 갈렸다(2026-09-03 연수 실주행 · HTTP 400 / 23514).
     후원자가 실제로 제출해야 c.submittedVia 가 '접수 링크 제출(온라인 신청서)' 로 덮이므로,
     접수 생성만 하는 경로에서는 끝내 안 드러난다.
     ★ 경계에서 한 번만 바꾼다 — 화면이 DB 분류를 알게 하면 submittedVia 를 쓰는
       자리마다 같은 실수가 다시 난다(연수 제안). 앞으로 이런 칸은 여기에 등록한다. */
  var toDb = {submittedVia: viaCategory, vatDeduction: vatToDb};
  Object.keys(fields || {}).forEach(function(k){
    if (!allow[k]) { console.warn('[DB] 모르는 칸은 저장하지 않습니다 — ' + k); return; }
    patch[allow[k]] = toDb[k] ? toDb[k](fields[k]) : fields[k]; n++;
  });
  if (!n) return Promise.resolve({ok:true, skipped:true});

  var key = SUPABASE_CONFIG.key;
  return fetch(sbBase() + '/rest/v1/' + T.donation + '?' + COL.donation.id + '=eq.'
               + encodeURIComponent(c.dbId), {
    method: 'PATCH',
    headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(patch)
  }).then(function(res){
    if (!res.ok) return res.text().then(function(t){
      throw new Error('HTTP ' + res.status + ' — ' + t.slice(0, 200));
    });
    return res.json();
  }).then(function(rows){
    /* ⚠️ 상태코드만 보지 않는다 — RLS 는 '보이는 행이 없음' 으로 막으면서 성공을 돌려준다 */
    if (!rows || !rows.length) throw new Error('저장은 성공했다고 나왔지만 바뀐 행이 없습니다 — 권한(RLS)을 확인해 주세요');
    return {ok:true, row:rows[0]};
  });
}

/* 저장된 판정 목록 → 화면이 쓰는 해소 표 (c.findingRes)
   ★ 왜 '가장 최근에 해소된 것' 을 고르는가 —
     검수를 다시 실행하면 saveCompareFindings 가 판정을 새 run 으로 통째로 다시 쌓는다.
     새 행에는 해소가 없다. 그래서 새 run 만 보면 **사유를 적고 완결한 건이
     재검수 한 번에 다시 막힌다.** run 전체를 훑어 해소를 찾는 이유가 이것이다.
     (해소를 새 행으로 복사하지 않는 이유 — 해소는 '그때 그 판정' 에 붙은 결재다.
      옮겨 적으면 언제 무엇을 보고 넘어갔는지가 흐려진다. patch SQL 주석 참조)

   ⚠️ 키는 rule_code 다. 화면 키(findingKey)는 축이 있으면 'E2_구매→기부' 처럼 붙는다 —
     DB 의 rule_code 에는 축이 없다(schema 제약이 E1~E7 만 허용).
     지금 해소 가능한 판정(isError && blocksComplete)에는 축이 없어 어긋나지 않는다.
     E2 가 완결을 막게 되면 축을 담을 칸부터 만들어야 한다(patch 필요). */
function resFromFindings(list){
  var out = {};
  (list || []).forEach(function(f){
    if (!f.resolution || !f.ruleCode) return;
    if (out[f.ruleCode]) return;              /* 최신 run 이 앞에 온다 — 먼저 만난 것이 최신 */
    out[f.ruleCode] = f.resolution;
  });
  return out;
}

/* ── 사유 해소 저장 ────────────────────────────────────────────
   ★ 이 저장은 조용히 실패하면 안 된다. saveInspectionRun 과 정반대다.

     saveInspectionRun 이 조용한 이유는 그것이 'AI 의견 기록' 이고,
     실패해도 담당자는 화면의 판정을 그대로 쓸 수 있기 때문이다.
     해소는 다르다 — **완결 게이트를 통과시킨 근거**이고 사람의 결재행위다.
     저장이 안 됐는데 화면만 해소되면 담당자는 완결시키고, DB 에는 왜 넘어갔는지가 없다.
     감사에서 "이 건 왜 통과시켰나" 에 답을 못 댄다. (인수인계 §2① 의 감사 로그와 같은 성격)

   그래서 실패를 reject 로 올린다. 화면은 실패하면 해소하지 않는다.
   반환: {ok:true, demo:true}  — DB 미연결(데모)
         {ok:true, id:행PK}     — 저장 성공
         reject(Error)          — 실패. 화면이 잡아서 담당자에게 보인다 */
function saveFindingResolution(c, ruleCode, reason, by){
  var who = by || '담당자';
  if (!reason || !String(reason).trim()) return Promise.reject(new Error('해소 사유가 비어 있습니다'));
  var _g = writeGate(c, '판정 해소'); if (_g) return _g;

  var F = COL.inspectionFinding, I = COL.inspection, key = SUPABASE_CONFIG.key;
  var h = sbHeaders({ 'Content-Type': 'application/json' });
  /* 최신 실행 1건만 가져온다 — 해소는 '지금 화면에 뜬 판정' 에 붙어야 한다 */
  var q = 'donation_id=eq.' + encodeURIComponent(c.dbId)
        + '&select=' + encodeURIComponent(I.id + ',' + I.startedAt + ','
            + T.inspectionFinding + '(' + F.id + ',' + F.ruleCode + ')')
        + '&order=' + I.startedAt + '.desc&limit=1';

  return fetch(sbBase() + '/rest/v1/' + T.inspection + '?' + q, {headers:h})
    .then(function(res){
      if (!res.ok) throw new Error('판정 이력을 읽지 못했습니다 (HTTP ' + res.status + ')');
      return res.json();
    })
    .then(function(runs){
      var run = runs && runs[0];
      if (!run) throw new Error('저장된 검수 실행이 없습니다 — 검수를 먼저 실행해 주세요');
      var hits = (run[T.inspectionFinding] || []).filter(function(f){
        return f[F.ruleCode] === ruleCode;
      });
      /* ★ 하나로 좁혀지지 않으면 저장하지 않는다 — getItem 이 다기관에서 엉뚱한 항목을
           잡던 것과 같은 자리다. 어느 판정을 넘긴 것인지 기록에 안 남으면
           감사 방어가 성립하지 않는다. 짐작해서 첫 번째에 쓰지 않는다. */
      if (hits.length === 0) throw new Error(ruleCode + ' 판정을 최신 검수 기록에서 찾지 못했습니다 — 검수를 다시 실행한 뒤 시도해 주세요');
      if (hits.length > 1)  throw new Error(ruleCode + ' 판정이 ' + hits.length + '건이라 어느 것을 해소한 것인지 가릴 수 없습니다 (축 구분 칸이 필요합니다)');

      var id = hits[0][F.id], patch = {};
      patch[F.resolutionReason] = String(reason).trim();
      patch[F.resolvedBy]       = who;
      patch[F.resolvedAt]       = TODAY;
      return fetch(sbBase() + '/rest/v1/' + T.inspectionFinding
                   + '?' + F.id + '=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: Object.assign({Prefer:'return=representation'}, h),
        body: JSON.stringify(patch)
      }).then(function(res){
        if (!res.ok) throw new Error('해소 사유를 저장하지 못했습니다 (HTTP ' + res.status + ')');
        return res.json();
      }).then(function(rows){
        /* ⚠️ 상태코드만 보지 않는다 — RLS 는 '거부' 가 아니라 '보이는 행이 없음' 으로
             동작해 막혀 있어도 성공을 돌려준다(9/1 실측). 돌아온 행으로 확인한다. */
        if (!rows || !rows.length || !rows[0][F.resolutionReason]){
          throw new Error('저장은 성공했다고 나왔지만 값이 남지 않았습니다 — 권한(RLS)을 확인해 주세요');
        }
        return {ok:true, id:id};
      });
    });
}


/* ══════════════════════════════════════════════════════════════
   접수 · 증빙 제출 링크 (access_link)  — 2026-09-03 유진
   선미 요청: (미공개 내부 기록)

   ★ 왜 필요한가 — 지금 링크는 화면 안에서만 도는 흐름이다.
     · c.orgLink 가 **건당 1장**이라 세 기관에 각각 못 보낸다(그래서 발급을 막아 뒀다)
     · 본인확인 값이 브라우저 메모리에만 있다(정본 20번)
     · 붙여넣어 여는 주소가 없다(URLSearchParams 를 읽는 코드 0건)
     셋 다 access_link 하나로 풀린다. 스키마는 승희가 그 모양으로 잡아 뒀고
     **쓰는 코드가 0줄이라 지금까지 0행**이었다.

   ★ 무엇을 저장하지 않는가 — **원문 토큰과 본인확인 값 원문은 저장하지 않는다.**
     토큰은 발급할 때 한 번만 돌려주고(주소에만 들어간다), DB 에는 해시만 남는다.
     그래서 DB 를 통째로 보더라도 남의 링크를 열 수 없다.

   ★ 본인확인 해시에 토큰을 섞는다 — verify_hint = sha256(token + ':' + 뒤4자리)
     뒤 4자리는 1만 개뿐이라 그냥 해시하면 대입으로 뚫린다.
     토큰을 모르면 대입 자체를 못 하므로, 링크를 가진 사람만 맞춰 볼 수 있다.
     (스키마를 안 고쳐도 되는 방식이다 — salt 칸이 따로 없다)
   ══════════════════════════════════════════════════════════════ */

/* SHA-256 — 순수 JS 로 둔다.
   ★ crypto.subtle 을 안 쓰는 이유 — 조용히 못 쓰는 자리가 셋이다.
     · file:// 로 열면 없다 (보안 컨텍스트가 아니다 — copyToClipboard 가 같은 이유로 폴백을 둔다)
     · jsdom 검사 환경에 없다 → **검사가 이 자리를 아예 못 본다**
     · 비동기라 해시 하나 때문에 호출부가 전부 물든다
     어디서나 같은 값을 내는 쪽이 낫다. 값이 맞는지는 표준 시험값으로 검사한다. */
var SHA256_K = [
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];

function utf8Bytes(str){
  var b = [], s = String(str);
  for (var i = 0; i < s.length; i++){
    var c = s.charCodeAt(i);
    if (c < 0x80) b.push(c);
    else if (c < 0x800) b.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0xd800 || c >= 0xe000) b.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {                                   /* 서러게이트 쌍 — 이모지·희귀 한자 */
      i++;
      var cp = 0x10000 + (((c & 0x3ff) << 10) | (s.charCodeAt(i) & 0x3ff));
      b.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    }
  }
  return b;
}

function sha256Hex(str){
  var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  var b = utf8Bytes(str), bitLen = b.length * 8;
  b = b.slice();
  b.push(0x80);
  while (b.length % 64 !== 56) b.push(0);
  var hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
  b.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
         (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
  var rotr = function(x, n){ return (x >>> n) | (x << (32 - n)); };
  var w = new Array(64);
  for (var off = 0; off < b.length; off += 64){
    for (var t = 0; t < 16; t++)
      w[t] = (b[off+t*4] << 24) | (b[off+t*4+1] << 16) | (b[off+t*4+2] << 8) | b[off+t*4+3];
    for (t = 16; t < 64; t++){
      var x = w[t-15], y = w[t-2];
      var s0 = rotr(x,7) ^ rotr(x,18) ^ (x >>> 3);
      var s1 = rotr(y,17) ^ rotr(y,19) ^ (y >>> 10);
      w[t] = (w[t-16] + s0 + w[t-7] + s1) | 0;
    }
    var a=H[0], bb=H[1], c=H[2], d=H[3], e=H[4], f=H[5], g=H[6], h=H[7];
    for (t = 0; t < 64; t++){
      var S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
      var ch = (e & f) ^ ((~e) & g);
      var t1 = (h + S1 + ch + SHA256_K[t] + w[t]) | 0;
      var S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
      var maj = (a & bb) ^ (a & c) ^ (bb & c);
      var t2 = (S0 + maj) | 0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=bb; bb=a; a=(t1+t2)|0;
    }
    H[0]=(H[0]+a)|0;  H[1]=(H[1]+bb)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0;
    H[4]=(H[4]+e)|0;  H[5]=(H[5]+f)|0;  H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
  }
  return H.map(function(v){ return ('0000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
}

/* 링크 주소 — **토큰만** 들어간다 (2026-09-03 · 연수·선미 합의)
   ★ 왜 db.js 인가 — 화면 둘(staff·donor)이 같은 정의를 써야 하고, findAccessLink(token) 과 짝이다.
   ★ 건 번호를 주소에 넣지 않는다 — 201·202… 는 **찍어볼 수 있는 번호**다.
     토큰을 비밀로 둔 노력이 반감된다(오늘 접수번호가 겹친 것도 번호가 규칙적이라 난 일이다).
   ★ 종류마다 경로를 나누지 않는다 — findAccessLink 가 purpose 를 돌려주므로
     주소 하나로 앱이 갈라진다. /s/ 와 /o/ 로 나누면 종류가 늘 때마다 경로도 는다.
   ★ location.origin 을 쓴다 — 'nanumdaejang.org' 는 실제 주소가 아니라
     지금까지 **복사해도 못 여는 주소**가 나갔다. 이러면 dev 에서도 배포본에서도 맞는다. */
function accessUrl(token){
  var base = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
  /* 아직 발급 전이면 자리만 보여준다 — 예전 linkUrl 이 하던 대로 */
  return base + '/?t=' + (token ? encodeURIComponent(token) : '········');
}

/* 링크 토큰 — 주소에 들어가는 유일한 비밀. DB 에는 이 값의 해시만 남는다.
   uuid 두 개를 이어 붙인다(같은 난수원을 두 개 두지 않으려고 newUuid 를 쓴다). */
function newLinkToken(){
  return (newUuid() + newUuid()).replace(/-/g, '');
}
function tokenHashOf(token){ return sha256Hex('nd1:' + token); }
function verifyHashOf(token, last4){ return sha256Hex('nd1:' + token + ':' + String(last4)); }

/* 화면 표기 → DB 발송 채널 분류. DB 는 넷만 받는다(schema.sql access_link_sent_channel_check).
   ✅ 'email' → '메일' (2026-09-07 승희 결정 · patch-20260907-sent-channel-mail.sql 로 허용값 추가).
      실제로 그 경로로 보내니 기록도 그렇게 남는다. */
var LINK_CHANNEL_TO_DB = {
  'link':'직접 전달', 'copy':'직접 전달', 'email':'메일', '메일':'메일',
  '직접 전달':'직접 전달', '문자':'문자', 'sms':'문자', '유선 안내':'유선 안내', 'call':'유선 안내'
};
function linkChannel(text){
  var t = String(text || '').trim();
  if (!t) return null;
  if (LINK_CHANNEL_TO_DB[t]) return LINK_CHANNEL_TO_DB[t];
  console.warn('[DB] 모르는 발송 채널 표기 — 분류를 비웁니다: ' + t);
  return null;
}

var LINK_TTL_DAYS = 30;   /* 기본 유효기간 — 담당자가 잊어도 영원히 열려 있지 않게
                             14 → 30 (2026-09-07 승희) : 9/18 제출 → 9/28~10/2 심사 사이에
                             14일이면 심사 도중 만료된다(unattended-ops §4). 30일이면 10/18 까지 산다. */

/* 링크 한 장을 발급한다.
     purpose 'intake'     → 후원자 접수 링크 (건당 1장 · distribution_id 는 NULL)
     purpose 'dist_proof' → 배분 증빙 링크 (배분처마다 1장 · distribution_id 필수)
   ★ 토큰은 **여기서 한 번만** 돌려준다. 다시 못 꺼낸다 — DB 에 해시만 남기 때문이다.
     호출한 쪽이 주소에 넣어 전달해야 한다. 잃어버리면 새로 발급한다(그게 맞는 동작이다). */
function issueAccessLink(c, opt){
  opt = opt || {};
  var purpose = opt.purpose || 'intake';
  var distId  = (purpose === 'dist_proof') ? opt.distId : null;
  if (purpose === 'dist_proof'){
    /* 화면 임시 id(sd1)로는 못 만든다 — FK 가 깨진다. 조용히 NULL 로 넣으면
       '어느 기관 것인지 모르는 증빙 링크' 가 생겨 지금 막아 둔 그 자리로 되돌아간다. */
    if (!distId || isTempDistId(distId))
      return Promise.reject(new Error('배분처가 아직 저장되지 않았습니다 — 배분결정을 먼저 저장한 뒤 링크를 발급해 주세요'));
  }
  var token = newLinkToken();
  if (!sbReady() || !c || !c.dbId) return Promise.resolve({ok:true, demo:true, token:token, id:null});

  var K = COL.accessLink, row = {};
  row[K.donationId]     = c.dbId;
  row[K.distributionId] = distId ? Number(distId) : null;
  row[K.purpose]        = purpose;
  row[K.tokenHash]      = tokenHashOf(token);
  /* ★ 본인확인 값은 해시로만 남긴다 — 원문 4자리는 어디에도 저장하지 않는다 */
  row[K.verifyHint]     = opt.verifyLast4 ? verifyHashOf(token, opt.verifyLast4) : null;
  row[K.expiresAt]      = new Date(Date.now() + LINK_TTL_DAYS * 86400000).toISOString();
  /* ★ 발송 채널도 경계에서 분류로 바꾼다 (2026-09-03 연수 발견 — 정본 15번과 같은 모양)
       화면은 'link'·'email' 을 쓰고 DB 는 '문자'·'유선 안내'·'직접 전달'·'메일' 넷만 받는다.
       그대로 보내 400(23514) 이 났다. saveDonationFields 는 toDb 로 막아 뒀는데
       여기만 빠져 있었다 — **같은 파일 안에서 규칙이 또 갈렸다.**
     ✅ 'email' → '메일' 은 2026-09-07 허용값 추가로 풀렸다(승희). 모르는 문구는
       지어내지 않고 비운다(viaCategory 와 같은 규칙) — 대신 콘솔에 남긴다. */
  var ch = linkChannel(opt.channel);
  if (ch) row[K.sentChannel] = ch;
  return sbPost(T.accessLink, [row]).then(function(made){
    var id = made && made[0] && made[0][K.id];
    if (!id) throw new Error('링크 id를 받지 못했습니다');
    return {ok:true, id:id, token:token, row:made[0]};
  });
}

/* 주소의 토큰으로 링크를 찾는다. 없으면 null — '없다'와 '못 연다'를 구분한다. */
function findAccessLink(token){
  if (!sbReady() || !token) return Promise.resolve(null);
  var K = COL.accessLink;
  return sbGet(T.accessLink, 'select=*&' + K.tokenHash + '=eq.'
               + encodeURIComponent(tokenHashOf(token)) + '&limit=1')
    .then(function(rows){ return (rows && rows[0]) || null; });
}

/* 이 링크를 지금 열 수 있는가. 문자열로 돌려준다 — 화면이 이유를 그대로 보여줄 수 있게.
   ⚠️ 'ok' 가 아닌 것을 한 덩어리로 뭉치지 않는다. 무효화된 링크와 만료된 링크는
     담당자가 할 일이 다르다(재발급 vs 기간 연장). */
function accessLinkState(link){
  if (!link) return 'none';
  var K = COL.accessLink;
  if (link[K.revoked]) return 'revoked';
  if (link[K.usedAt])  return 'used';
  if (link[K.expiresAt] && new Date(link[K.expiresAt]) < new Date()) return 'expired';
  return 'ok';
}
var LINK_STATE_TEXT = {
  none:    '이 주소로는 열 수 없습니다 — 담당자에게 링크를 다시 요청해 주세요',
  revoked: '담당자가 무효화한 링크입니다 — 다시 발급받아 주세요',
  used:    '이미 제출이 끝난 링크입니다',   /* '수정은 담당자를 통해서만' 을 뺐다 (2026-09-05 선미) */
  expired: '유효기간이 지난 링크입니다 — 담당자에게 재발급을 요청해 주세요',
  ok:      ''
};

/* 본인확인 — 주소의 토큰과 입력한 뒤 4자리가 함께 맞아야 한다.
   ★ 토큰을 섞어 해시했으므로, DB 를 봐도 4자리를 되찾을 수 없고
     링크 없이 1만 개를 대입해 볼 수도 없다.
   ⚠️ 이 검사는 화면(브라우저)에서만 한다 — DB 정책은 토큰과 만료·무효 여부만 보므로
     주소를 가진 사람은 4자리 없이도 자기 건을 읽고 일부 값을 바꿀 수 있다 (오픈소스 점검 §1-4). */
function verifyAccessLink(link, token, last4){
  if (!link) return false;
  var want = link[COL.accessLink.verifyHint];
  if (!want) return true;                    /* 본인확인을 안 건 링크 — 통과 */
  return want === verifyHashOf(token, last4);
}

/* 건에 달린 링크 전부 (담당자 화면이 기관별 상태를 그린다) */
function loadAccessLinks(c){
  if (!sbReady() || !c || !c.dbId) return Promise.resolve([]);
  var K = COL.accessLink;
  return sbGet(T.accessLink, 'select=*&' + K.donationId + '=eq.' + c.dbId + '&order=' + K.id);
}

/* 무효화 — 지우지 않는다. 언제 누가 무효화했는지가 남아야 한다(RLS 에 delete 정책도 없다). */
function revokeAccessLink(id){
  var K = COL.accessLink, patch = {};
  patch[K.revoked] = true;
  return patchAccessLink(id, patch, '무효화');
}

/* 제출 완료 표시. ★ 이때 수신 연락처를 지운다 — 팀 결정 8/28 §2-⑦ C안
   ("used_at 기록 시 즉시 삭제"). 링크가 할 일을 마치면 개인정보를 남길 이유가 없다. */
function markAccessLinkUsed(id){
  var K = COL.accessLink, patch = {};
  patch[K.usedAt] = new Date().toISOString();
  patch[K.recipientEnc] = null;
  return patchAccessLink(id, patch, '제출 완료 표시');
}

function patchAccessLink(id, patch, what){
  if (!sbReady() || !id) return Promise.resolve({ok:true, demo:true});
  var K = COL.accessLink, key = SUPABASE_CONFIG.key;
  return fetch(sbBase() + '/rest/v1/' + T.accessLink + '?' + K.id + '=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(patch)
  }).then(function(res){
    if (!res.ok) return res.text().then(function(t){ throw new Error('HTTP ' + res.status + ' — ' + t.slice(0, 200)); });
    return res.json();
  }).then(function(rows){
    /* 204 를 믿지 않는다 — RLS 는 거부가 아니라 '보이는 행이 없음' 으로 막는다 */
    if (!rows || !rows.length) throw new Error(what + '가 저장되지 않았습니다 — 권한(RLS)을 확인해 주세요');
    return {ok:true, row:rows[0]};
  });
}

/* 원장 전체를 읽어 DB.cases 를 갈아끼운다. 실패하면 데모 데이터를 그대로 둔다. */
function loadCasesFromSupabase(){
  _ledgerReloadAt = Date.now();   /* 방금 읽었다 — 화면 이동 재조회(refreshLedgerSoon)가 곧바로 또 읽지 않게 */
  if (!sbReady()){
    /* 단정하지 않는다 — 결론은 reportDbSource 가 찍는다 */
    reportDbSource(0);
    return Promise.resolve(false);
  }
  /* 한 번의 요청으로 배분처·체크리스트·지난 AI 판정까지 함께 가져온다 (PostgREST 중첩 select)
     ★ 판정 이력을 같이 읽는 이유 — 시연 중 화면을 새로 그려도 판정이 남아 있어야 한다.
       안 읽으면 '매 호출마다 저장'의 목적 ①(재호출 방지)이 성립하지 않는다 (결정 #8) */
  var q = 'select=*,' + T.distribution + '(*),' + T.checklistItem + '(*),'
        + T.inspection + '(*,' + T.inspectionFinding + '(*))'
        + '&order=' + COL.donation.caseNo;

  return sbGet(T.donation, q)
    .then(function(rows){
      /* ★ 200 + 빈 배열도 "연결됨" 이다 (2026-09-08 승희 · 권한 3단계 뒤 선미 발견)
           전에는 0건이면 데모 데이터를 그대로 두고 false 를 돌려줬다 — anon 이 전부 읽던 시절엔 0건 = DB 가 빈 것뿐이었다.
           3단계부터는 **로그인 전 담당자(anon · 링크 없음)가 정상적으로 0건**을 받는다. 그걸 "DB 미연결(데모)" 로 읽으면
           isDemoMode() 가 참이 되어 로그인 벽이 안 서고 역할 전환 바가 되살아난다 — dev 에서 실제로 났다.
           그래서 응답이 왔으면 실 DB 다. 0건이면 화면은 빈 원장(또는 로그인 벽)을 보여 준다 — 데모로 떨어지지 않는다. */
      if (!rows || !rows.length){
        DB.cases = [];
        DB_SOURCE = 'Supabase';
        reportDbSource(0);
        console.info('[DB] 0건 — 로그인 전(anon)이거나 링크가 없거나 DB 가 비었습니다. 담당자는 로그인하면 다시 읽습니다.');
        return true;
      }
      DB.cases = rows.map(rowToCase);
      DB_SOURCE = 'Supabase';
      reportDbSource(DB.cases.length);

      /* 저장소에 있는 첨부를 화면 레지스트리로 되살린다.
         ★ 이게 있어야 '새로고침하면 사라진다'가 실제로 고쳐진다.
           올리기만 붙이면 반만 고친 것이다 — 올라가긴 하는데 다시 못 본다.
         ⚠️ 실패해도 건 목록은 그대로 뜬다. 첨부를 못 되살리는 것이
           건을 못 보는 것으로 번지면 안 된다. */
      return Promise.all(DB.cases.map(restoreAttachments))
        .then(function(counts){
          var n = counts.reduce(function(a, b){ return a + (b || 0); }, 0);
          if (n) console.log('[저장소] 첨부 ' + n + '건을 되살렸습니다.');
          /* 신청서 PDF 목록도 같이 — 주소는 안 받는다(restoreFormPdfs 주석) */
          return Promise.all(DB.cases.map(restoreFormPdfs));
        })
        .then(function(counts){
          var k = counts.reduce(function(a, b){ return a + (b || 0); }, 0);
          if (k) console.log('[저장소] 신청서 PDF ' + k + '건을 찾았습니다 (열 때 기록·서명).');
          /* 증빙이 다 복원된 지금에야 '검수보다 뒤에 온 증빙' 을 가릴 수 있다 —
             여기가 아니면 c.lastEvidenceAt 이 아직 비어 있어 전부 최신으로 보인다. */
          DB.cases.forEach(markStaleInspection);
          return true;
        })
        .catch(function(err){
          console.error('[저장소] 첨부 되살리기 실패 (건 목록은 정상):', err.message || err);
          return true;
        });
    })
    .catch(function(err){
      console.error('[DB] 읽기 실패 — 데모 데이터로 계속합니다:', err.message || err);
      return false;
    });
}

/* TODO(쓰기) — 아래 동작들은 아직 메모리에만 반영된다. 하나씩 Supabase로 옮긴다.
   1) 담당자 확인완료      → checklist_item.status / confirmed_by / confirmed_at
   2) 접수 건 신규 등록     → donation insert
   3) 배분처 등록          → distribution insert (+ E7 수량 합계 대조)
   4) AI 판정 결과 표시     → inspection_finding 읽기 (유진 E1 작업과 연결)
   ※ AI 판정 '쓰기'는 아래 saveInspection() 으로 붙었다 (유진 2026-08-31) */

/* ════════════════════════════════════════════════════════════
   AI 판정 결과 저장 — inspection ⑨ / inspection_finding ⑩
   담당: 유진 (2026-08-31) · 팀 결정 #8 "매 호출마다 저장"

   ★ 왜 매 호출마다인가 (선미 확정 8/31)
     목적이 세 가지인데, '담당자 확정 시에만' 저장하면 셋 다 못 이룬다.
       ① 시연 재호출 방지 — 화면을 새로 그려도 판정이 남아 있어야 한다
       ② 오탐 기록      — 담당자가 무시한 판정이야말로 남아야 규칙을 고칠 수 있다
       ③ 감사 방어      — "AI가 무엇을 보고 무엇을 말했나"가 실행 시점에 박혀야 한다
     담당자 확정은 checklist_item.status 에 따로 남으므로 이중 저장이 아니다.

   ★ AI는 checklist_item 에 쓰지 않는다. 여기(verdict)에만 쌓인다 (설계안 §2-③).

   ⚠️ 실패해도 화면을 막지 않는다 — 저장이 안 되는 것과 판정이 없는 것은 다르다.
     저장 실패는 콘솔에만 남기고, 판정은 화면에 그대로 표시된다.
   ════════════════════════════════════════════════════════════ */

var RUBRIC_VERSION = 'v4-20260828';   /* inspection-rubric.md 의 개정 표기와 맞춘다 */

/* PostgREST insert 한 번. 만든 행을 돌려받는다(Prefer: return=representation) */
/* opt.minimal — 넣은 행을 돌려받지 않는다(Prefer: return=minimal). 빈 배열로 푼다.
   ★ PostgREST 는 return=representation 이면 넣은 행을 **다시 읽어** 돌려주므로 SELECT 정책이 필요하다.
     audit_log 처럼 "넣기만 되고 읽기는 안 되는" 테이블에 representation 으로 넣으면
     insert 자체는 됐는데 42501(RLS) 로 실패한다(2026-09-07 승희 · 권한 1단계에서 실측).
     감사 기록 두 곳(logPdfView · logBulkDownload)은 반환값을 안 쓰므로 minimal 로 넣는다. */
function sbPost(table, rows, opt){
  var key = SUPABASE_CONFIG.key;
  var minimal = !!(opt && opt.minimal);
  return fetch(sbBase() + '/rest/v1/' + table, {
    method: 'POST',
    headers: sbHeaders({ 'Content-Type': 'application/json',
               Prefer: minimal ? 'return=minimal' : 'return=representation' }),
    body: JSON.stringify(rows)
  }).then(function(res){
    if (!res.ok) return res.text().then(function(t){
      throw new Error('HTTP ' + res.status + ' — ' + t.slice(0, 200));
    });
    return minimal ? [] : res.json();
  });
}

/* ════════════════════════════════════════════════════════════
   파일 저장소 (Supabase Storage) — 2026-09-01 유진 · 선미 승인
   ★ 설계 근거: db-design-final-20260828.md §1 · privacy-design-20260826.md §2

   왜 파일을 DB에 안 넣나 —
     개인정보(이름·주민번호·서명)를 파일 저장소 한 곳에만 두기 위해서다.
     그래야 DB가 통째로 유출돼도 개인정보가 한 건도 나오지 않고,
     암호화·접근통제·파기를 한 곳에만 걸면 된다.

   ⚠️ 로그인·RLS 가 붙기 전까지 실제 서류를 올리지 않는다 (선미 조건 · 2026-09-01).
      테스트는 가상 픽스처로만 한다. DB에 실제 데이터를 넣지 않는 것과 같은 원칙이다.
   ════════════════════════════════════════════════════════════ */

var STORAGE_BUCKET = 'nanumdaejang-docs';   /* 비공개 버킷 (선미 생성) */

/* 경로 규칙 — forms/ 와 attachments/ 를 가른다.
   ★ 왜 가르나: 신청서 PDF 안에만 주민번호·서명이 들어간다(설계안 §2-⑤).
     그 PDF만 경로가 따로 있어야 나중에 권한을 더 좁게 걸고 열람 기록을 강제할 수 있다.
     한 폴더에 섞으면 등급을 나눌 수 없다.
   ★ 건(donation) 단위로 묶는 이유: 파기가 건 단위다(기부일자+1년 · 2026-09-04 결정).
     폴더째 지우고 사람이 눈으로 확인할 수 있어야 한다. */
function storagePath(area, donationId, fileName){
  /* ★ 원본 파일명을 경로에 쓰지 않는다.
     '매입세금계산서_OO식품.pdf' 를 그대로 쓰면 상호가 URL·로그에 남는다.
     개인 후원자면 이름이 들어갈 수도 있다 — 설계안이 "개인 후원자명은 DB에 넣지 않는다"고
     정해 둔 원칙이 경로로 새는 것이다. 원본 이름은 attachment.file_name 컬럼에만 둔다. */
  var m = String(fileName || '').match(/\.([A-Za-z0-9]{1,8})$/);
  var ext = m ? ('.' + m[1].toLowerCase()) : '';
  return area + '/' + (donationId || 'unassigned') + '/' + newUuid() + ext;
}

function newUuid(){
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
  });
}

/* 파일 1개를 저장소에 올린다. 성공하면 path 를 그대로 돌려준다.
   ⚠️ 여기서는 예외를 삼키지 않는다 — 판정 저장(saveInspectionRun)과 반대다.
     판정은 실패해도 화면의 판정을 담당자가 그대로 쓸 수 있지만,
     업로드가 실패하면 후원자의 서류가 아예 없는 것이다. 조용히 넘어가면
     후원자는 냈다고 믿고, 담당자는 안 왔다고 본다. 반드시 알려야 한다. */
function sbUploadFile(path, file){
  var key = SUPABASE_CONFIG.key;
  return fetch(sbBase() + '/storage/v1/object/' + STORAGE_BUCKET + '/' + path, {
    method: 'POST',
    headers: sbHeaders({ 'Content-Type': file.type || 'application/octet-stream',
               'x-upsert': 'false' }),      /* 덮어쓰기 금지 — 재제출은 새 경로에 새 행으로 남긴다 */
    body: file
  }).then(function(res){
    if (!res.ok) return res.text().then(function(t){
      /* 자주 나는 두 가지를 알아볼 수 있게 풀어 준다.
         ⚠️ 상태코드로 가르면 안 된다 — Storage 는 '버킷 없음'을 HTTP 400 으로 주고
           본문에만 NoSuchBucket 을 담는다(2026-09-01 실측). 상태코드만 보면 못 알아본다. */
      var hint = /NoSuchBucket|Bucket not found/i.test(t)
                   ? ' — 버킷 "' + STORAGE_BUCKET + '" 이 아직 없습니다'
               : /policy|Unauthorized|row-level security|violates/i.test(t) || res.status === 403 || res.status === 401
                   ? ' — 저장소 정책(policy)이 업로드를 막고 있습니다'
               : /Duplicate|already exists/i.test(t)
                   ? ' — 같은 경로에 파일이 이미 있습니다'
               : /InvalidMimeType|mime type/i.test(t)
                   ? ' — 버킷이 허용하지 않는 파일 형식입니다(PDF·PNG·JPG·JPEG·WEBP만 됩니다)'
               : /EntityTooLarge|exceeded the maximum|too large/i.test(t)
                   ? ' — 파일이 버킷 크기 제한(10MB)을 넘습니다'
               : '';
      throw new Error('업로드 실패 HTTP ' + res.status + hint + ' · ' + t.slice(0, 200));
    });
    return path;
  });
}

/* 비공개 버킷이라 주소를 그냥 못 연다 — 서명된 임시 URL을 받아 온다.
   ★ 기본 10분. 길게 잡으면 그 주소가 유출됐을 때 열려 있는 시간이 길어진다. */
function sbSignedUrl(path, seconds, downloadName){
  var key = SUPABASE_CONFIG.key;
  return fetch(sbBase() + '/storage/v1/object/sign/' + STORAGE_BUCKET + '/' + path, {
    method: 'POST',
    headers: sbHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn: seconds || 600 })
  }).then(function(res){
    if (!res.ok) return res.text().then(function(t){
      throw new Error('서명 URL 실패 HTTP ' + res.status + ' · ' + t.slice(0, 200));
    });
    return res.json();
  }).then(function(r){
    if (!r || !r.signedURL) throw new Error('서명 URL을 받지 못했습니다');
    var url = sbBase() + '/storage/v1' + r.signedURL;
    /* ★ downloadName — 받을 때 파일 이름을 원본으로 되돌린다.
       저장소의 파일명은 UUID 라서(상호·이름을 주소에 안 남기려는 결정) 그냥 받으면
       'e8f00b68-....png' 로 저장된다. 담당자 폴더에 뭐가 뭔지 모를 파일이 쌓인다.
       진짜 이름은 attachment.file_name 에 있으니 그걸 붙인다.

       ⚠️ 2026-09-01 실측 — 서명 요청 '본문'에 download 를 넣는 방식은 안 먹었다.
         응답 주소에 아무것도 안 붙고 content-disposition 도 비어서 왔다.
         주소 뒤에 쿼리로 직접 붙여야 한다. 붙였는지 눈으로 확인하는 검사를 테스트에 뒀다. */
    if (downloadName) url += '&download=' + encodeURIComponent(downloadName);
    return url;
  });
}

/* 체크리스트 항목의 DB PK 를 찾아온다 (doc_key 로 맞춘다).
   ★ 왜 필요한가 — 후원자가 제출하면 autoChecklist() 가 체크리스트를 새로 만든다.
     그때 DB에서 읽어온 dbId 가 통째로 날아간다. 그런데 attachment.checklist_item_id 는
     NOT NULL 이라, 첨부를 저장하려면 그 자리를 다시 찾아야 한다.
     (autoChecklist 는 common.js — 선미님 파일이라 여기서 되찾는 쪽으로 풀었다)

   ★ 배분 단계(인수증·결과보고서)는 배분처마다 한 벌씩 있어서 doc_key 만으로는
     '늘봄 인수증'과 '복지관 인수증'을 못 가른다. 그래서 distId 로 함께 좁힌다.
     distId 가 없으면 접수 단계 서류(distribution_id IS NULL)로 본다. */
function resolveChecklistItemId(c, it){
  if (it && it.dbId) return Promise.resolve(it.dbId);
  if (!sbReady() || !c || !c.dbId || !it || !it.key) return Promise.resolve(null);
  var K = COL.checklistItem;
  var scope = it.distId
    ? '&' + K.distributionId + '=eq.' + it.distId      /* 배분 단계 — 그 기관 것만 */
    : '&' + K.distributionId + '=is.null';             /* 접수 단계 */
  return sbGet(T.checklistItem,
      'select=' + K.id + '&' + K.donationId + '=eq.' + c.dbId
      + '&' + K.docKey + '=eq.' + encodeURIComponent(it.key)
      + scope + '&limit=1')
    .then(function(rows){
      var id = rows && rows[0] && rows[0][K.id];
      if (id) it.dbId = id;                  /* 찾았으면 항목에 붙여 둔다 — 다음 번엔 안 찾는다 */
      return id || null;
    }).catch(function(){ return null; });
}

/* 첨부 1건을 '받을 수 있는 주소'로 바꾼다 — 원본 이름으로 저장되게 한다.
   ★ 화면에서 여는 것(fileUrl)과 다르다. 저건 브라우저에서 열어보기,
     이건 파일로 내려받기다. 이름을 되돌리는 것이 차이의 전부다.
   반환: {ok:true, url, name} | {ok:false, reason} */
function downloadUrlFor(fileId){
  var m = FILES[fileId];
  if (!m) return Promise.resolve({ok:false, reason:'모르는 파일입니다'});
  if (!m.storageKey){
    /* 저장소에 없는 파일 — 아직 안 올라갔거나 데모 파일이다. 지어내지 않는다. */
    return Promise.resolve({ok:false, reason:'저장소에 올라가지 않은 파일입니다(데모이거나 업로드 실패)'});
  }
  return sbSignedUrl(m.storageKey, 600, m.name)
    .then(function(u){ return {ok:true, url:u, name:m.name}; })
    .catch(function(e){ return {ok:false, reason:String((e && e.message) || e)}; });
}

/* ── 첨부 1건 저장 = 파일 올리기 + attachment 행 남기기 ───────
     c   건(rowToCase 결과) — c.dbId 가 donation PK
     it  체크리스트 항목 — it.dbId 가 checklist_item PK (NOT NULL 이라 없으면 못 넣는다)
     m   FILES 레지스트리의 항목 {id, name, type, size, blob}
     role 'donor' | 'org' | 'staff'

   반환: {ok:true, storageKey, row} | {ok:false, reason}
   ★ 실패를 던지지 않고 돌려준다 — 화면이 "이 파일만 실패했다"를 그릴 수 있게. */
function saveAttachment(c, it, m, role){
  if (!sbReady())   return Promise.resolve({ok:false, reason:'DB 미연결(데모)입니다 — 저장소에 올리지 않았습니다'});
  if (!m || !m.blob) return Promise.resolve({ok:false, reason:'올릴 파일이 없습니다'});
  var A = COL.attachment;
  var path = storagePath('attachments', c && c.dbId, m.name);

  return resolveChecklistItemId(c, it).then(function(itemId){
    if (!itemId){
      /* 데모 건이거나 체크리스트가 DB에 없는 경우다. 지어내지 않고 사실대로 돌려준다.
         ★ 파일을 먼저 올리고 나서 실패하면 주인 없는 파일이 남는다 — 올리기 전에 막는다. */
      return {ok:false, reason:'체크리스트 항목을 DB에서 찾지 못해 첨부를 연결할 수 없습니다(데모 건일 수 있습니다)'};
    }
    return sbUploadFile(path, m.blob).then(function(key){
      var row = {};
      row[A.checklistItemId] = itemId;
      row[A.fileName]        = m.name;       /* ★ 원본 이름은 여기에만 (경로에는 안 쓴다) */
      row[A.fileSize]        = m.size || null;
      row[A.mimeType]        = m.type || null;
      row[A.storageKey]      = key;
      row[A.uploadedByRole]  = role || 'donor';
      row[A.isCurrent]       = true;
      return sbPost(T.attachment, [row]).then(function(made){
        /* 재제출이면 앞 건을 최신에서 내린다 — 1:N 으로 이력을 보존하는 설계(§2-④).
           ⚠️ 실패해도 파일은 이미 올라갔다. 되돌리지 않고 사실만 남긴다. */
        var newId = made && made[0] && made[0][A.id];
        return supersedeOlder(itemId, newId).then(function(){
          m.storageKey = key;                /* 레지스트리에 표시 — 화면이 '저장됨'을 안다 */
          return {ok:true, storageKey:key, row:made && made[0]};
        });
      });
    });
  }).catch(function(err){
    return {ok:false, reason:String((err && err.message) || err)};
  });
}

/* 같은 항목의 예전 첨부를 is_current=false 로 내린다 (행은 지우지 않는다).
   ★ 지우면 "견적서를 냈다가 영수증으로 다시 냈다"는 사실이 사라진다 —
     설계안 §2-④ 가 1:N 을 택한 바로 그 이유다. */
function supersedeOlder(checklistItemId, newId){
  if (!newId) return Promise.resolve(null);
  var A = COL.attachment, key = SUPABASE_CONFIG.key;
  var q = A.checklistItemId + '=eq.' + checklistItemId
        + '&' + A.id + '=neq.' + newId
        + '&' + A.isCurrent + '=is.true';
  var patch = {};
  patch[A.isCurrent]    = false;
  patch[A.supersededBy] = newId;
  return fetch(sbBase() + '/rest/v1/' + T.attachment + '?' + q, {
    method: 'PATCH',
    headers: sbHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch)
  }).then(function(res){
    if (!res.ok) console.warn('[저장소] 이전 첨부를 내리지 못했습니다 — 이력이 두 건 최신으로 남습니다');
    return null;
  }).catch(function(){ return null; });
}

/* ── 서명 주소 유효기간 관리 ─────────────────────────────────
   ★ 서명 주소는 만료된다. 화면을 오래 열어 두면 그 뒤 클릭이 깨진다 —
     담당자는 "파일이 사라졌다"로 받아들인다. 실제로는 주소만 늙은 것이다.

   왜 미리 받아 두고, 왜 타이머로 갱신하나 —
     fileUrl(id) 은 동기 함수다(common.js · 선미님 파일). 클릭하는 순간
     비동기로 새 주소를 받아오게 하려면 그 함수를 바꿔야 한다.
     주소 서명은 파일을 내려받는 게 아니라 가벼우므로, 미리 받아 두고
     만료 전에 조용히 바꿔 끼우는 쪽이 남의 파일을 덜 건드린다.

   ★ 유효기간을 30분으로 줄였다(전에는 1시간).
     자동 갱신이 있으니 짧아도 불편하지 않고, 주소가 새어도 열려 있는 시간이 짧다.

   ⚠️ 한계 — 갱신할 때 되살린 첨부 전부를 다시 서명한다.
     지금은 건이 몇 개뿐이라 문제없지만, 건수가 늘면 요청이 같이 는다.
     그때는 '지금 열려 있는 건'만 서명하도록 좁혀야 한다.
     → 열람 기록(pdf.view)을 붙일 때 여는 동작에 손대게 되므로 그때 함께 다룬다. */
var SIGN_TTL_SEC   = 1800;                   /* 주소 유효기간 30분 */
var SIGN_RENEW_SEC = 600;                    /* 남은 시간이 10분 미만이면 다시 받는다 */
var signTimer = null;

/* 파일 바이트를 **필요할 때** 내려받는다 (2026-09-05 선미 실주행 · #219)
   ★ 무엇이 있었나 — restoreAttachments 는 blob 을 안 받는다(열지도 않을 파일을 통째로
     내려받지 않으려는 것이고, 그 판단 자체는 맞다). 그런데 AI 판정은 **바이트가 있어야** 한다.
     그래서 새로고침한 뒤 검수를 실행하면 judgeableFileId 가 null 을 주고,
     judgeItemNow 가 **조용히 그냥 돌아갔다.** 화면에는 아무 표시가 없다 —
     담당자는 AI가 보고 아무 말 없는 것으로 읽지만, 사실은 **보지도 않았다.**
     (9/5 선미 실주행: 신고 500,000원 · 영수증 335,000원 인데 금액 지적이 없었다)
   ★ 그래서 '안 받는다' 가 아니라 '쓸 때 받는다' 로 바꾼다. 받는 것은 검수가 실제로
     보낼 파일뿐이다(금액 증빙). 목록을 열어 두기만 할 때는 전과 같이 안 받는다.
   ⚠️ 못 받으면 null 을 준다 — 부르는 쪽이 그 사실을 화면에 세운다. 조용히 넘기지 않는다. */
function ensureBlob(fid){
  var m = FILES[fid];
  if (!m) return Promise.resolve(null);
  if (m.blob) return Promise.resolve(m.blob);
  if (!m.storageKey || !sbReady()) return Promise.resolve(null);
  var url = (m.url && m.urlExpiresAt && m.urlExpiresAt > Date.now())
    ? Promise.resolve(m.url)
    : sbSignedUrl(m.storageKey, SIGN_TTL_SEC).then(function(u){
        m.url = u; m.urlExpiresAt = Date.now() + SIGN_TTL_SEC * 1000; return u;
      });
  return url.then(function(u){ return fetch(u); })
    .then(function(res){
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.blob();
    })
    .then(function(b){
      /* ★ 서류의 진짜 형식을 붙여 준다 (2026-09-06 · dev 에서 /judge 502 로 드러남).
           저장소가 주는 Content-Type 은 application/octet-stream 일 수 있다. 그대로 두면
             ① shrinkForJudge 가 "이미지가 아니네" 하고 **축소를 건너뛴다** — 원본 크기 그대로 간다
             ② 모델에 mimeType='application/octet-stream' 으로 보내진다
           둘이 겹쳐 요청이 커지고 판정이 깨졌다. 형식은 우리가 안다 —
           attachment.mime_type 을 되살릴 때 FILES[fid].type 에 넣어 뒀다. */
      m.blob = (m.type && b.type !== m.type) ? new Blob([b], {type: m.type}) : b;
      return m.blob;
    })
    .catch(function(e){
      /* ⚠️ 파일명은 찍지 않는다 — 후원자 파일 이름에 사람 이름이 들어온다(9/3 선미) */
      console.error('[저장소] 판정에 쓸 파일을 내려받지 못했습니다:', e.message || e);
      return null;
    });
}

function signFile(fid){
  var m = FILES[fid];
  if (!m || !m.storageKey) return Promise.resolve(false);
  return sbSignedUrl(m.storageKey, SIGN_TTL_SEC)
    .then(function(u){
      m.url = u;
      m.urlExpiresAt = Date.now() + SIGN_TTL_SEC * 1000;
      return true;
    })
    .catch(function(e){
      /* 주소를 못 받으면 그 파일만 안 열린다 — 조용히 두지 않는다.
         ⚠️ 파일명은 찍지 않는다 (2026-09-03 선미 · 개인정보 현황 §5 구멍 '가').
           후원자가 올리는 파일 이름에 사람 이름이 들어온다 — 실제 표본이 그랬다
           (`물품기부신청서_OO희.png`). 브라우저 콘솔은 화면을 보는 누구나 연다.
           담당자가 어느 파일인지 알아보는 것은 화면 목록이 하니, 로그는 저장소 키로 충분하다. */
      console.error('[저장소] 주소 발급 실패 (' + (m.storageKey || m.id || '키 없음') + '):', e.message || e);
      return false;
    });
}

/* 곧 만료될 주소를 다시 받는다. 반환: 다시 받은 건수 */
function refreshExpiringUrls(){
  var due = Object.keys(FILES).filter(function(fid){
    var m = FILES[fid];
    if (!m || !m.storageKey || !m.urlExpiresAt) return false;
    /* ★ 신청서 PDF 는 갱신하지 않는다 — 주소 발급 = 열람 기록(pdf.view) 이라, 기록 없이 새 주소를 만들면 안 된다.
         만료되면 그냥 만료다. 다시 열면(openFormPdf) 새 기록과 함께 새 주소가 나온다. */
    if (m.formPdf) return false;
    return (m.urlExpiresAt - Date.now()) < SIGN_RENEW_SEC * 1000;
  });
  if (!due.length) return Promise.resolve(0);
  return Promise.all(due.map(signFile)).then(function(rs){
    var n = rs.filter(Boolean).length;
    if (n) console.info('[저장소] 첨부 주소 ' + n + '건을 갱신했습니다(만료 예정).');
    return n;
  });
}

function startUrlRefresh(){
  if (signTimer) return;                     /* 한 번만 건다 — 건을 다시 읽어도 타이머는 하나 */
  if (typeof setInterval !== 'function') return;
  signTimer = setInterval(function(){
    refreshExpiringUrls();
  }, 120000);                                /* 2분마다 확인 — 만료 10분 전에 걸리도록 넉넉히 */
}

/* ════════════════════════════════════════════════════════════
   서류 일괄 받기 (ZIP) — 2026-09-01 유진 · 선미 지시
   ★ 설계 근거: privacy-design-20260826.md §전제① · team-checkpoints §9

   왜 필요한가 — 나눔대장은 최종 보관처가 아니라 취합·검수용 작업 공간이다.
     완결되면 담당자가 서류를 통째로 받아 **재단 기존 시스템에 올린다**(공식 보관).
     한 건에 서류가 대여섯 장이고 다기관이면 인수증만 여러 장이라,
     하나씩 받게 두면 모으는 건 편해졌는데 꺼내는 게 불편한 반쪽이 된다.

   ★ 압축 라이브러리를 쓰지 않는다 (store 방식으로 직접 만든다).
     ① 이 저장소는 "외부 라이브러리 없이 fetch 만으로 붙는다"를 지켜 왔다(db.js 머리말)
     ② 담기는 것이 PDF·JPEG·PNG 다 — **이미 압축된 파일이라 다시 눌러도 안 줄어든다.**
        압축을 포기해서 잃는 게 사실상 없다
     ③ store 방식은 형식이 단순해서 눈으로 검증된다(아래 zipStore 주석)

   ⚠️ 브라우저에서 만든다 vs 서버에서 만든다 — 금요일 코칭 안건 5에 올려 두었다.
     지금은 브라우저다. 서버로 옮기면 zipStore 는 그대로 쓰고 파일을 받아오는 자리만 바뀐다.
   ════════════════════════════════════════════════════════════ */

/* CRC-32 — ZIP 이 각 파일에 요구하는 검사값. 테이블은 처음 한 번만 만든다. */
var CRC_TABLE = null;
function crc32(bytes){
  if (!CRC_TABLE){
    CRC_TABLE = new Int32Array(256);
    for (var n = 0; n < 256; n++){
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c;
    }
  }
  var crc = -1;
  for (var i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
  return (crc ^ -1) >>> 0;
}

/* 파일 여러 개를 ZIP 한 덩어리로 묶는다 (압축 없음 = store).
     files: [{name:'101_인수증_늘봄.pdf', bytes:Uint8Array}]
   ZIP 구조는 세 부분이다 —
     ① 파일마다: 로컬 헤더 + 이름 + 내용
     ② 목록(central directory): 파일마다 한 줄, 어디서 시작하는지
     ③ 끝맺음(EOCD): 목록이 어디 있고 몇 개인지
   ★ 이름에 한글이 들어가므로 UTF-8 플래그(비트 11)를 켠다. 안 켜면 압축 푸는 쪽에서 깨진다. */
function zipStore(files){
  var enc = new TextEncoder();
  var parts = [], central = [], offset = 0;

  files.forEach(function(f){
    var nameBytes = enc.encode(f.name);
    var crc = crc32(f.bytes), size = f.bytes.length;

    var lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0,  0x04034b50, true);   /* 로컬 헤더 표식 */
    lh.setUint16(4,  20, true);           /* 필요한 버전 2.0 */
    lh.setUint16(6,  0x0800, true);       /* ★ 이름이 UTF-8 이다 */
    lh.setUint16(8,  0, true);            /* 압축 방식 0 = store */
    lh.setUint16(10, 0, true);            /* 시각 — 안 쓴다 */
    lh.setUint16(12, 0, true);            /* 날짜 — 안 쓴다 */
    lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true);         /* 압축 후 크기 */
    lh.setUint32(22, size, true);         /* 원본 크기 (store 라 같다) */
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true);            /* 추가필드 없음 */
    parts.push(new Uint8Array(lh.buffer), nameBytes, f.bytes);

    var cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0,  0x02014b50, true);   /* 목록 표식 */
    cd.setUint16(4,  20, true);
    cd.setUint16(6,  20, true);
    cd.setUint16(8,  0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, size, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint16(30, 0, true);            /* 추가필드 */
    cd.setUint16(32, 0, true);            /* 주석 */
    cd.setUint16(34, 0, true);            /* 디스크 번호 */
    cd.setUint16(36, 0, true);            /* 내부 속성 */
    cd.setUint32(38, 0, true);            /* 외부 속성 */
    cd.setUint32(42, offset, true);       /* 이 파일이 시작하는 위치 */
    central.push(new Uint8Array(cd.buffer), nameBytes);

    offset += 30 + nameBytes.length + size;
  });

  var centralSize = central.reduce(function(a, b){ return a + b.length; }, 0);
  var eo = new DataView(new ArrayBuffer(22));
  eo.setUint32(0,  0x06054b50, true);     /* 끝맺음 표식 */
  eo.setUint16(4,  0, true);
  eo.setUint16(6,  0, true);
  eo.setUint16(8,  files.length, true);
  eo.setUint16(10, files.length, true);
  eo.setUint32(12, centralSize, true);
  eo.setUint32(16, offset, true);         /* 목록이 시작하는 위치 */
  eo.setUint16(20, 0, true);
  var all = parts.concat(central, [new Uint8Array(eo.buffer)]);

  var total = all.reduce(function(a, b){ return a + b.length; }, 0);
  var out = new Uint8Array(total), at = 0;
  all.forEach(function(b){ out.set(b, at); at += b.length; });
  return out;
}

/* 파일 이름에 못 쓰는 글자를 뺀다 — 압축을 푸는 쪽이 윈도우일 수 있다 */
function safeName(s){
  return String(s || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
}

/* 이 건의 ZIP 에 담을 목록을 만든다.
   이름 규칙: {건번호}_{서류명}_{배분기관}.{확장자}   예: 101_인수증_늘봄지역아동센터.pdf
   ★ 기관명을 붙이는 이유 — 다기관이면 인수증이 여러 장인데 이름이 같으면
     압축을 풀 때 하나만 남는다. 서류 이름만으로는 구분이 안 된다. */
function caseZipEntries(c, pdfs){
  var orgOf = {};
  (c.dists || []).forEach(function(d){
    orgOf[d[COL.distribution.id]] = d[COL.distribution.orgName];
  });
  var used = {}, list = [];
  (c.checklist || []).forEach(function(it){
    (it.r.fileIds || []).forEach(function(fid){
      var m = FILES[fid];
      if (!m) return;
      /* 서류 이름에서 화면용 기관 병기(' · 늘봄')를 떼고, 규칙대로 다시 붙인다 */
      var doc = safeName(String(it.n || it.key).split(' · ')[0]);
      var org = it.distId ? safeName(orgOf[it.distId] || '') : '';
      var ext = (String(m.name || '').match(/\.([A-Za-z0-9]{1,8})$/) || [, ''])[1];
      var base = c.id + '_' + doc + (org ? '_' + org : '');
      var name = base + (ext ? '.' + ext.toLowerCase() : '');
      /* 같은 슬롯에 파일이 여러 장이면 뒤에 번호를 붙인다 — 덮어쓰이지 않게 */
      if (used[name]){
        used[name]++;
        name = base + '(' + used[name] + ')' + (ext ? '.' + ext.toLowerCase() : '');
      } else used[name] = 1;
      list.push({fileId:fid, name:name, meta:m});
    });
  });
  /* ★ 신청서·인수증 PDF (form_submission.pdf_key) — 체크리스트 첨부가 아니라 따로 붙인다.
       [S] 신청서 항목은 파일 없이 수취완료로 확정되므로(submitDonor) 위 루프로는 절대 안 잡힌다.
       이걸 빼면 ZIP 에 이름·서명이 든 서류가 하나도 없다 (2026-09-04 선미). */
  (pdfs || []).forEach(function(p){
    if (!p.pdfKey) return;
    var base = c.id + '_' + safeName(p.formType || '신청서');
    var name = base + '.pdf';
    if (used[name]){ used[name]++; name = base + '(' + used[name] + ').pdf'; } else used[name] = 1;
    list.push({fileId:null, name:name, meta:{storageKey:p.pdfKey, name:name, formPdf:true}});
  });
  return list;
}

/* 일괄 받기 = 개인정보 반출이다. 반드시 기록한다 (privacy-design §다운로드 기록).
   ✅ 2026-09-07 로그인이 붙어 actorRef 에 auth uid 를 적는다. 세션이 없으면(있어선 안 되지만)
     실행자를 특정할 수 없다는 사실을 함께 남긴다 — 일어난 일은 어떤 경우에도 남긴다. */
function logBulkDownload(c, entries){
  if (!sbReady() || !c || !c.dbId) return Promise.resolve(null);
  var A = COL.auditLog, row = {};
  row[A.actorType] = 'staff';
  row[A.actorRef]  = authUid();   /* 로그인한 담당자의 auth uid (2026-09-07) */
  row[A.action]    = 'bulk.download';
  row[A.targetType] = 'donation';
  row[A.targetId]   = String(c.dbId);
  row[A.afterValue] = {
    건번호: c.id,
    파일수: entries.length,
    파일: entries.map(function(e){ return e.name; }),
    주의: authUid() ? undefined : '담당자 로그인 없이 실행 — 실행자를 특정할 수 없습니다'
  };
  return sbPost(T.auditLog, [row], {minimal:true}).catch(function(err){
    /* ⚠️ 여기는 조용히 넘기면 안 되는 자리다 — 반출 기록이 안 남으면 감사 방어가 무너진다 */
    console.error('[감사] 일괄 다운로드 기록 실패 — 반출 기록이 남지 않았습니다:', err.message || err);
    throw err;
  });
}

/* 한 건의 서류를 통째로 받는다. 반환: {ok, name, bytes, entries} | {ok:false, reason} */
function buildCaseZip(c){
  if (!c) return Promise.resolve({ok:false, reason:'건을 찾을 수 없습니다'});
  /* ★ 제출본 PDF 목록을 먼저 읽는다 — 못 읽으면 묶지 않는다.
       신청서 빠진 ZIP 을 담당자가 다 받은 줄 알고 기존 시스템에 올리는 것이 제일 나쁘다(아래 '일부만' 과 같은 원칙). */
  return loadFormPdfs(c).then(function(pdfs){ return buildCaseZipWith(c, pdfs); },
    function(err){ return {ok:false, reason:'제출본(신청서 PDF) 목록을 읽지 못해 묶지 않았습니다 — ' + ((err && err.message) || err)}; });
}
function buildCaseZipWith(c, pdfs){
  var entries = caseZipEntries(c, pdfs);
  if (!entries.length) return Promise.resolve({ok:false, reason:'받을 서류가 없습니다'});

  /* 저장소에 없는 파일(데모·업로드 실패)은 담을 수 없다 — 빈 파일을 만들어 넣지 않는다 */
  var missing = entries.filter(function(e){ return !e.meta.storageKey; });
  if (missing.length === entries.length){
    return Promise.resolve({ok:false,
      reason:'저장소에 올라간 서류가 없습니다(데모 데이터이거나 업로드 실패) — ' +
             missing.length + '건 모두 해당'});
  }
  var usable = entries.filter(function(e){ return e.meta.storageKey; });

  return Promise.all(usable.map(function(e){
    return sbSignedUrl(e.meta.storageKey, 300)
      .then(function(u){ return fetch(u); })
      .then(function(r){
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      })
      .then(function(buf){ return {name:e.name, bytes:new Uint8Array(buf)}; })
      .catch(function(err){ return {name:e.name, error:String(err.message || err)}; });
  })).then(function(got){
    var failed = got.filter(function(g){ return g.error; });
    var ok = got.filter(function(g){ return !g.error; });
    /* ★ 일부만 받아진 채로 묶어 주지 않는다. 담당자는 다 받은 줄 알고 기존 시스템에 올린다 —
       빠진 서류를 아무도 모른 채 완결된다. 못 받은 게 있으면 사실대로 말한다. */
    if (failed.length){
      return {ok:false,
        reason:failed.length + '건을 받지 못해 묶지 않았습니다 — ' +
               failed.map(function(f){ return f.name + '(' + f.error + ')'; }).join(', ')};
    }
    return logBulkDownload(c, ok)
      .then(function(){
        return {ok:true, name:'나눔대장_' + c.id + '_서류.zip', bytes:zipStore(ok), entries:ok};
      })
      .catch(function(err){
        /* 기록이 안 남으면 파일도 안 준다 — 반출은 됐는데 기록만 없는 상태가 제일 나쁘다 */
        return {ok:false, reason:'반출 기록을 남기지 못해 중단했습니다 — ' + (err.message || err)};
      });
  });
}

/* ── 저장된 첨부를 화면 레지스트리(FILES)로 되살린다 ──────────
   ★ 이게 있어야 '새로고침하면 사라진다'가 실제로 고쳐진다.
     업로드만 붙이면 반만 고친 것이다 — 올라가긴 하는데 다시 못 본다.
   반환: 되살린 건수 */
function restoreAttachments(c){
  if (!sbReady() || !c || !c.dbId) return Promise.resolve(0);
  var A = COL.attachment;
  var ids = (c.checklist || []).filter(function(it){ return it.dbId; })
                               .map(function(it){ return it.dbId; });
  if (!ids.length) return Promise.resolve(0);

  return sbGet(T.attachment,
      'select=*&' + A.checklistItemId + '=in.(' + ids.join(',') + ')'
      + '&' + A.isCurrent + '=is.true'
      + '&' + A.purgedAt + '=is.null'        /* 파기된 것은 행만 남고 파일이 없다 */
      + '&order=' + A.uploadedAt + '.asc,' + A.id + '.asc')   /* ★ 올린 순서대로 — 판정은 마지막(최근) 파일을 본다 (api.js judgeableFileId · 2026-09-11) */
    .then(function(rows){
      var byItem = {};
      (c.checklist || []).forEach(function(it){ if (it.dbId) byItem[it.dbId] = it; });
      var made = [];
      (rows || []).forEach(function(r){
        var it = byItem[r[A.checklistItemId]];
        if (!it) return;
        var fid = 'db' + r[A.id];
        /* ★ blob(파일 바이트)은 받지 않는다 — 열지도 않을 파일을 통째로 내려받게 된다.
             화면은 fileUrl(id) 로 주소만 있으면 그린다. */
        FILES[fid] = {id:fid, name:r[A.fileName], type:r[A.mimeType] || '',
                      size:r[A.fileSize] || 0, blob:null, demo:false,
                      storageKey:r[A.storageKey]};
        it.r.fileIds = (it.r.fileIds || []).concat([fid]);
        made.push(fid);

        /* ★ 화면이 읽는 자리도 채운다 (2026-09-05 선미 실주행 · #217 · §14 M-4).
             전에는 fileIds 만 채웠다. 그런데 화면은 그 자리를 안 본다:
               · 수취 현황 행        → it.r.file (파일 이름)  → 늘 "첨부 없음"
               · itemStatus()        → it.r.donorUpload / orgUpload → 늘 "미수취"
             그래서 **후원자가 냈고 파일도 저장소에 있는데** 담당자 화면은
             "안 왔다" 고 말했다. 새로고침 전에는 맞게 보이고 뒤에는 틀리게 보였다 —
             같은 건이 언제 보느냐에 따라 달라지는, 제일 나쁜 모양이다.
           ⚠️ '수취완료' 로 만들지 않는다 (F2) — 파일이 올라온 것과 그 서류를 받은 것은 다르다.
             항목을 확정하는 것은 담당자의 수취 처리뿐이다. 여기서는 **낸 사실만** 되살린다.
           ⚠️ 담당자가 이미 확정한 항목(status='수취완료' → r.st==='done')은 건드리지 않는다.
             itemStatus() 가 r.st 를 먼저 보므로 아래 표시가 확정을 덮지 않는다. */
        var names = (it.r.fileIds || []).map(function(x){ return (FILES[x] || {}).name; })
                                        .filter(Boolean);
        it.r.file = names.join(' · ');
        var when = String(r[A.uploadedAt] || '').slice(0, 10);
        /* 검수 실행과 견줄 값 — 날짜만 남기면 같은 날 들어온 증빙을 못 가른다(markStaleInspection)
           ★ 담당자가 [수취 등록] 으로 올린 파일은 '도착한 증빙' 이 아니다 (2026-09-12 선미 · #308 실주행).
             후원자·기관이 새로 낸 것만 게이트를 다시 연다(markStaleInspection 의 원래 뜻). 담당자 것까지 세니
             직인 이미지를 바꿔 올린 뒤 새로고침하면 검수한 표시가 지워져 [검수 실행] 으로 되돌아갔다 —
             같은 세션에서는 안 그러니 화면이 갈렸다. 바뀐 파일의 AI 재판정은 needsJudge 가 [다시 검수] 때 잡는다. */
        if (r[A.uploadedByRole] !== 'staff' &&
            (isAfter(r[A.uploadedAt], c.lastEvidenceAt) || !c.lastEvidenceAt)) c.lastEvidenceAt = r[A.uploadedAt];
        var mark = {status:'uploaded', date:when, fileName:it.r.file};
        if (r[A.uploadedByRole] === 'org') it.r.orgUpload = mark;
        else if (r[A.uploadedByRole] === 'donor') it.r.donorUpload = mark;
        /* 'staff' 는 담당자가 수취 등록으로 직접 올린 것이라 이미 status 가 따라온다 */
      });

      /* 주소(서명 URL)는 미리 받아 둔다 — 파일 자체가 아니라 '주소를 서명하는' 호출이라 가볍다.
         ★ 왜 미리 받나: fileUrl(id) 은 동기 함수다(common.js · 선미님 파일).
           클릭하는 순간 비동기로 받아오게 하려면 그 함수를 바꿔야 하는데,
           주소 서명은 파일을 내려받는 게 아니라서 미리 해도 비용이 거의 없다.
         ⚠️ 한계 — 서명 URL 은 만료된다. 화면을 오래 열어 두면 그 뒤 클릭이 깨진다.
           지금은 1시간으로 두고, 만료 재발급은 열람 기록(pdf.view)을 붙일 때 함께 다룬다.
           그때는 어차피 '누가 언제 열었나'를 남겨야 해서 여는 동작에 손을 대야 한다. */
      return Promise.all(made.map(signFile)).then(function(){
        startUrlRefresh();          /* 만료 전에 알아서 다시 받는다 (아래) */
        return made.length;
      });
    }).catch(function(err){
      console.error('[저장소] 첨부를 되살리지 못했습니다:', err.message || err);
      return 0;
    });
}

/* ── 검수 실행 1회를 통째로 저장한다 (inspection ⑨ + finding ⑩ N건) ──
     c        건(rowToCase 결과) — c.dbId 가 donation 의 실제 PK
     meta     {model, promptHash, status} — 코드 단독 판정은 model·promptHash 가 없다
     findings [{ruleCode, verdict, reason, amount, system, file}] — 낱개 판정들
   반환: 저장된 finding 행들 (실패해도 reject 하지 않고 null) */
/* inspection.status 가 받는 값 (schema.sql check 제약과 같아야 한다) */
var INSPECTION_STATUS = ['success', 'timeout', 'quota', 'parse_error', 'error'];
/* ⚠️ 'error' 는 patch-20260902-inspection-status-error.sql 로 추가된다.
     그 패치를 아직 안 돌렸다면 DB 가 insert 를 거부하는데,
     이 함수(saveInspectionRun)는 저장 실패를 console 에만 적고 넘어간다(의도된 설계).
     즉 **판정 기록이 통째로 안 남는데 화면은 멀쩡해 보인다.**
     그래서 허용값 밖이면 저장을 통째로 잃는 대신 'timeout' 으로 낮추고 경고를 찍는다.
     — 값 하나가 덜 정확한 것이, 기록이 통째로 사라지는 것보다 낫다.
     실패 사유 원문은 inspection_finding.reason 에 그대로 남는다. */
function safeInspectionStatus(v){
  var s = v || 'success';
  if (INSPECTION_STATUS.indexOf(s) >= 0) return s;
  console.warn('[DB] 모르는 판정 상태 "' + s + '" — timeout 으로 낮춰 저장합니다. '
             + 'schema 의 check 제약을 확인하세요.');
  return 'timeout';
}

/* 루브릭 규칙 번호 — DB 제약(inspection_finding_rule_code_check)과 **같은 목록이어야 한다.**
   ⚠️ E8 은 2026-09-03 에 코드에만 추가되고 DB 제약은 E1~E7 그대로였다.
     findings 를 한 번에 insert 하므로 **E8 한 줄이 그 건의 판정 저장 전부를 400 으로 막았다.**
     그런데 saveInspectionRun 은 실패를 console 에만 적는다(의도된 설계) —
     **화면에는 판정이 뜨는데 DB 에는 한 줄도 안 남았다** (9/7 #225 실주행 콘솔에서 발견).
   ★ safeInspectionStatus 와 같은 자리다. 값 하나가 덜 정확한 것이,
     기록이 통째로 사라지는 것보다 낫다. */
var FINDING_RULE_CODES = ['E1','E2','E3','E4','E5','E6','E7','E8'];
function safeRuleCode(v){
  if (!v) return null;                                   /* NULL = 슬롯 판정 — 원래 허용값 */
  if (FINDING_RULE_CODES.indexOf(v) >= 0) return v;
  console.warn('[DB] 모르는 규칙 번호 "' + v + '" — NULL(슬롯 판정)로 낮춰 저장합니다. '
             + 'schema 의 check 제약을 확인하세요 (patch-20260907-finding-rule-e8.sql).');
  return null;
}

function saveInspectionRun(c, meta, findings){
  if (!sbReady()) return Promise.resolve(null);            /* DB 미연결 데모 — 조용히 넘어간다 */
  if (!c || !c.dbId){
    console.info('[DB] 판정 저장 건너뜀 — 데모 데이터라 donation PK가 없습니다.');
    return Promise.resolve(null);
  }
  if (!findings || !findings.length) return Promise.resolve(null);
  var I = COL.inspection, F = COL.inspectionFinding;
  var run = {};
  run[I.donationId]    = c.dbId;
  run[I.criteriaKey]   = c.criteriaKey || null;
  run[I.rubricVersion] = RUBRIC_VERSION;
  run[I.model]         = (meta && meta.model) || null;     /* 코드 단독 판정은 NULL — 모델을 안 썼다 */
  run[I.promptHash]    = (meta && meta.promptHash) || null;
  run[I.status]        = safeInspectionStatus(meta && meta.status);
  run[I.finishedAt]    = new Date().toISOString();
  if (authStaffId()) run[I.triggeredBy] = authStaffId();   /* 로그인한 담당자 — staff 행이 없으면 비운다(FK) */

  return sbPost(T.inspection, [run]).then(function(made){
    var runId = made && made[0] && made[0][COL.inspection.id];
    if (!runId) throw new Error('inspection id를 받지 못했습니다');
    var rows = findings.map(function(f){
      var r = {};
      r[F.inspectionId]   = runId;
      /* E1~E7 은 전부 '대조' 층이다 — 어느 서류 슬롯에도 속하지 않는다(루브릭 §2).
         그래서 checklist_item_id 는 NULL 이다. */
      r[F.layer]          = '대조';
      r[F.ruleCode]       = safeRuleCode(f.ruleCode);
      /* 화면 표기를 그대로 넣는다 — 2026-08-31 patch 로 enum 에 '배분 진행 중'이 추가돼
         변환(dbVerdict)이 필요 없어졌다. 화면과 DB의 표기가 같아야 통계가 안 섞인다.
         ★ 신뢰 근거: 코드가 만드는 verdict 는 전부 리터럴(5값 안)이고,
           유일한 비신뢰 입력인 AI 출력은 judge.js 가 AI_VERDICTS 로 걸러 보낸다. */
      r[F.verdict]        = f.verdict;
      r[F.reason]         = f.reason || null;
      r[F.extractedValue] = f.amount || null;
      r[F.systemValue]    = f.system || null;
      r[F.sourceFile]     = f.file || null;
      if (f.facts) r[F.facts] = f.facts;   /* 값 뽑기 판정에만 있다 — E1·대조 판정은 비운다 */
      return r;
    });
    return sbPost(T.inspectionFinding, rows);
  }).then(function(rows){
    return rows || null;
  }).catch(function(err){
    /* 저장 실패가 판정 표시를 막지 않는다 — 담당자는 화면의 판정을 그대로 쓸 수 있다 */
    console.error('[DB] 검수 판정 저장 실패 (화면 표시는 정상):', err.message || err);
    return null;
  });
}

/* AI 판정(E1) 1건 저장 — 화면이 부르던 기존 입구를 그대로 둔다 */
function saveInspection(c, j, sys){
  return saveInspectionRun(c,
    {model:j.model, promptHash:j.promptHash,
     status: j.status || (j.state === 'error' ? 'timeout' : 'success')},
    [{ruleCode:'E1', verdict:(j.state === 'error') ? '대기중' : j.verdict,
      reason:j.reason, amount:j.amount, system:sys, file:j.file}]);
}

/* 대조 판정(E2·E3·E7) 저장 — AI를 안 썼으므로 model·promptHash 는 비운다.
   ★ '이상 없음'도 저장한다. 무엇을 보고 통과시켰는지가 남아야 감사 방어가 된다 —
     기록이 '확인 권장'만 있으면 나머지는 '안 본 것'과 구분되지 않는다. */
function saveCompareFindings(c){
  var list = (typeof compareFindings === 'function') ? compareFindings(c) : [];
  return saveInspectionRun(c, {status:'success'}, list.map(function(f){
    return {ruleCode:f.rule, verdict:f.verdict, reason:f.reason,
            system:(f.rule === 'E7' && c.donation) ? String(c.donation.qty || '') : null};
  }));
}

/* ════════════════════════════════════════════════════════════
   파기 (개인정보 보관기간 만료) — 2026-09-04 코칭 후 결정
   ★ 결정 원문
     · "우리 플랫폼 내 신청서 폼 및 증빙서류 보관기간은 1년으로 하고
        백업은 별도로 설정하지 않는다"
     · "파기는 원래 정한대로 한다. 감사 방어로 삭제를 아예 막아둔 것은 풀어야 함.
        (파기 시점에는 삭제할 수 있도록 하고 삭제 기록만 남으면 됨)"

   ★ 여기가 왜 필요한가 — 9/3 에 문서로 적어둔 구멍이 이것이었다:
     "보관 기간을 정해 뒀지만 파기할 방법이 없다" (privacy-inventory §4).
     칸(purge_due·purged_at)은 스키마에 있었는데 채우는 코드도 지우는 코드도 없었다.
     고지문에 "1년 뒤 파기합니다" 라고 쓸 예정이므로, 못 지키면 그게 거짓 고지가 된다.

   ★ 순서가 중요하다 — 파일 먼저, DB 나중
     purge_donation() 은 attachment.storage_key 를 지우지 않고 남긴다(감사 기록).
     하지만 pdf_key 는 null 로 만든다. 그래서 DB 를 먼저 건드리면 신청서 PDF 가
     어디 있는지 잃어버려 파일이 영영 남는다(고아 파일). 반드시 파일부터 지운다.

   ⚠️ 되돌릴 수 없다. 부르는 화면이 확인을 받고 불러야 한다.
   ════════════════════════════════════════════════════════════ */

/* 저장소 파일 1개 삭제. 없는 파일(404)은 성공으로 친다 —
   이미 지워진 것을 다시 지우려 할 때 파기 전체가 멈추면 안 된다. */
function sbDeleteFile(path){
  var key = SUPABASE_CONFIG.key;
  return fetch(sbBase() + '/storage/v1/object/' + STORAGE_BUCKET + '/' + path, {
    method: 'DELETE',
    headers: sbHeaders()
  }).then(function(res){
    if (res.ok || res.status === 404) return {ok:true, path:path};
    return res.text().then(function(t){
      var hint = /policy|Unauthorized|row-level security/i.test(t) || res.status === 403 || res.status === 401
        ? ' — 저장소 정책이 삭제를 막고 있습니다 (patch-20260904-purge.sql 을 실행했습니까?)' : '';
      return {ok:false, path:path, error:'HTTP ' + res.status + hint + ' · ' + t.slice(0, 200)};
    });
  }).catch(function(e){
    return {ok:false, path:path, error:String((e && e.message) || e)};
  });
}

/* 파기 대상 조회 — purge_candidates 뷰(patch-20260904-purge.sql §5) */
function listPurgeCandidates(){
  if (!sbReady()) return Promise.resolve([]);
  return sbGet('purge_candidates', 'select=*').catch(function(err){
    console.error('[DB] 파기 대상 조회 실패:', err.message || err);
    return [];
  });
}

/* 한 건을 파기한다.
   반환 {ok, files:{deleted, failed[]}, attachments, forms, error}
   ★ 파일 삭제가 하나라도 실패하면 DB 파기를 진행하지 않는다 —
     purged_at 이 찍히면 "지웠다" 고 기록되는데 실물이 남아 있으면 그 기록이 거짓이 된다.
     반쪽 파기보다 "실패했으니 다시 하라" 가 낫다. */
function purgeDonation(donationId, actor){
  if (!sbReady()) return Promise.resolve({ok:false, error:'DB 미연결 — 파기할 수 없습니다'});

  /* ① 지울 파일 키를 모은다 (첨부 + 신청서 PDF) */
  var keys = [];
  return sbGet(T.formSubmission,
        'select=' + COL.formSubmission.pdfKey + '&' + COL.formSubmission.donationId + '=eq.' + donationId +
        '&' + COL.formSubmission.purgedAt + '=is.null')
    .then(function(forms){
      (forms || []).forEach(function(r){
        var k = r[COL.formSubmission.pdfKey];
        if (k) keys.push(k);
      });
      return sbGet(T.checklistItem,
        'select=id&' + COL.checklistItem.donationId + '=eq.' + donationId);
    })
    .then(function(items){
      var ids = (items || []).map(function(r){ return r.id; });
      if (!ids.length) return [];
      return sbGet(T.attachment,
        'select=' + COL.attachment.storageKey +
        '&' + COL.attachment.checklistItemId + '=in.(' + ids.join(',') + ')' +
        '&' + COL.attachment.purgedAt + '=is.null');
    })
    .then(function(atts){
      (atts || []).forEach(function(r){
        var k = r[COL.attachment.storageKey];
        if (k) keys.push(k);
      });
      /* ② 파일부터 지운다 */
      return Promise.all(keys.map(sbDeleteFile));
    })
    .then(function(results){
      var failed = results.filter(function(r){ return !r.ok; });
      if (failed.length){
        return {ok:false, files:{deleted:results.length - failed.length, failed:failed},
                error:'파일 ' + failed.length + '건을 지우지 못해 파기를 중단했습니다 — ' +
                      '기록만 "파기됨"으로 남고 실물이 남는 상태를 만들지 않기 위해서입니다'};
      }
      /* ③ DB 파기 + 감사 기록 (patch-20260904-purge.sql 의 purge_donation) */
      return fetch(sbBase() + '/rest/v1/rpc/purge_donation', {
        method: 'POST',
        /* ★ 사용자 토큰으로 보낸다 (2026-09-08 승희 지적) — 전에는 anon 키였다.
           파기는 되돌릴 수 없는 행위라 "누가 눌렀나" 가 감사 기록에 남아야 한다.
           anon 키로 나가면 DB 쪽 auth.uid() 가 비어 행위자를 못 남긴다. */
        headers: sbHeaders({'Content-Type': 'application/json'}),
        body: JSON.stringify({p_donation_id: donationId, p_actor: actor || 'staff'})
      }).then(function(res){
        if (!res.ok) return res.text().then(function(t){
          throw new Error('HTTP ' + res.status + ' — ' + t.slice(0, 200));
        });
        return res.json();
      }).then(function(rows){
        var r = (rows && rows[0]) || {};
        return {ok:true, files:{deleted:results.length, failed:[]},
                attachments:r.purged_attachments || 0, forms:r.purged_forms || 0};
      });
    })
    .catch(function(err){
      return {ok:false, error:String((err && err.message) || err)};
    });
}
