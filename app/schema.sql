-- ============================================================================
-- 나눔대장 — 1단계 스키마 (저장이 성립하는 최소선)
--
--   근거   : 나눔대장_DB설계안_20260826_v2 §2
--   작성   : 승희 · 2026-08-28
--   대상   : Supabase (PostgreSQL)
--   정본   : 이 파일 (+ db.js 의 T·COL 블록). 설계 문서: (미공개 내부 기록)
--   ★ 2026-09-09 (승희): 이 파일은 8/28 기준이고 그 뒤 patch-*.sql 20종이 실 DB 에 적용됐다.
--     새 프로젝트 재현 = 이 파일 → stage2-inspection.sql → patch-*.sql 파일명 순서
--     (app/README.md 「새 환경에 세울 때」). 변경은 여전히 patch-*.sql 로.
--
--   ★ 규칙: Supabase SQL Editor에서 실행한 SQL은 반드시 이 파일에도 반영한다.
--     (Supabase 화면에만 있으면 다음 사람이 재현할 수 없다)
--   ★ 이름을 바꿀 때는 설계안(§2) → schema.sql → db.js(T·COL) 순서로 함께 바꾼다.
--
--   ★ 이 스키마를 관통하는 원칙 — DB에는 개인정보가 없다
--     이름 · 주민번호 · 연락처 · 주소 · 서명 이미지는 신청서 PDF 안에만 있고,
--     DB에는 그 PDF를 가리키는 저장소 키(pdf_key / storage_key)만 둔다.
--     → DB가 통째로 유출돼도 개인정보는 한 건도 나오지 않는다.
--
--   ⚠️ RLS(권한 규칙)는 아직 걸지 않았다. 로그인 붙일 때 반드시 설정할 것.
--      지금은 anon key만 있으면 누구나 읽을 수 있는 상태다.
--      → 실제 데이터를 넣기 전에 반드시 RLS.
-- ============================================================================


-- ⚠️ 아래 DROP은 "빈 DB에 처음 넣을 때"만 안전합니다.
--    실제 데이터가 들어간 뒤에는 이 3줄을 반드시 지우고 실행하세요.
drop table if exists inspection_finding, inspection,
                     audit_log, form_submission, attachment, checklist_item,
                     access_link, distribution, donation, staff cascade;


-- ============================================================================
-- ⑥ staff — 담당자 계정
--    감사 추적의 전제조건. "담당자가 확정함"이 아니라 "누가 확정함"이 남아야 한다.
-- ============================================================================
create table staff (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text unique not null,
  role          text not null default 'staff'
                  check (role in ('staff', 'admin')),
  status        text not null default 'active'
                  check (status in ('active', 'disabled')),
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

comment on table  staff    is '담당자 계정 — 나중에 Supabase 인증(auth.users)과 id로 연결한다';
comment on column staff.id is '로그인 붙일 때 auth.users.id 와 같은 값을 쓰면 된다';


-- ============================================================================
-- ① donation — 후원 건 (원장)
--    ★ donor 테이블이 없다. 저장할 개인정보가 없어서 별도 테이블을 둘 이유가 없다.
--      남는 것(법인명 · 법인 사업자번호)은 개인정보가 아니므로 원장에 그대로 둔다.
-- ============================================================================
create table donation (
  id                bigint generated always as identity primary key,
  case_no           text not null unique,                    -- 표시용 건 번호 ('103')
  state             text not null default '접수 검토'
                      check (state in ('접수 검토', '검수 대기', '완결')),

  -- 후원자 — 법인만 식별정보를 남긴다
  donor_type        text not null check (donor_type in ('법인', '법인외')),
  donor_name        text,          -- ★ 법인일 때만 상호 저장 · 법인 외는 NULL
  donor_biz_no      text,          -- ★ 법인 사업자번호만 저장 · 개인사업자는 NULL
  is_corp_verified  boolean,       -- 사업자번호 중간자리 판정 결과

  -- 물품
  acquisition_path  text check (acquisition_path in ('구매', '제조·유통')),
  item_name         text,
  qty               integer,        -- ★ 낱개 총수량 = qty_as_received × pack_size — E7 대조 기준 (코드 대조는 항상 이 값)
  qty_as_received   integer,        -- 서류에 적힌 수량 그대로 (400)                         ┐ 단위 3종
  qty_unit          text not null default '낱개',   -- 서류의 단위 ('낱개'·'박스'·'포'·'묶음'…) ├ (팀 결정 8/28)
  pack_size         integer,        -- ★ 1단위당 낱개 수 (12) — "환산은 사람 몫"(E4)의 기록 ┘
  unit_price        numeric(14,2),  -- qty_unit 1단위당 단가 (서류 기준). book_value = qty_as_received × unit_price
  book_value        numeric(14,2),  -- 장부가액
  fair_value        numeric(14,2),  -- 공정가액(시가)

  -- 일자
  donation_date     date,           -- 기부일 (신청서의 후원일자 칸) — ★ 루브릭 E2(일자 선행) 판정 기준 · 유진 발견 2026-08-31
  arrive_date       date,           -- 물품 도착일
  in_date           date,           -- 접수일
  deadline          date,           -- 서류 마감일

  submitted_via     text check (submitted_via in ('링크 제출', '전화 문의 후 대리등록', '공문')),
  purpose           text,           -- 기부 목적
  wants_receipt     boolean not null default false,

  criteria_key      text,           -- ★ 기준 스냅샷 — 판단에 쓴 기준자료 버전

  -- 완결 · 파기 (개인정보 정책을 스키마로 강제한다)
  completed_at      timestamptz,
  transferred_at    timestamptz,    -- ★ 기존 시스템 이관 완료 시각
  purge_due         date,           -- ★ 파기 예정 — **기부일자 + 1년** (2026-09-04 코칭 후 결정으로 변경)
                                    --    이전 설계는 '완결 익년 12/31' 이었다.
                                    --    재단 개인정보처리방침이 "기부일자로부터 5년" 이라 기산점을 맞췄다:
                                    --      재단 5년 · 나눔대장 1년 → 1년 뒤 여기서 지우고 재단 시스템에서 계속 보관.
                                    --    자동으로 채운다 (patch-20260904-purge.sql · trg_purge_due)
  purged_at         timestamptz,    -- ★ 파기 실행 시각 (파일 삭제됨) — purge_donation() 이 찍는다

  created_by        uuid references staff(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- 법인이면 상호가 있어야 하고, 법인 외에는 상호를 남기지 않는다
  constraint donor_name_only_for_corp
    check ( (donor_type = '법인'   and donor_name is not null)
         or (donor_type = '법인외' and donor_name is null) ),
  -- 단위 3종을 다 채웠을 때만 낱개 환산이 맞는지 검사 (null 이면 통과 — 기존 입력 방식 안 깨짐)
  constraint donation_qty_matches_received
    check (qty_as_received is null or pack_size is null or qty = qty_as_received * pack_size)
);

comment on column donation.donor_name   is '법인 상호만. 개인 후원자명은 저장하지 않는다 (건 번호로 표시)';
comment on column donation.qty          is '낱개 총수량 = qty_as_received × pack_size. SUM(distribution.qty) 와 대조하는 기준값(E7)';
comment on column donation.pack_size    is '1 qty_unit 당 낱개 수. 사람이 환산해 입력 — E4 "낱개↔박스 환산은 사람 몫"의 근거';
comment on column donation.criteria_key is '코드 상수 CRITERIA 를 가리키는 문자열 (예: fnd_guideline_2026)';

create index on donation (state);
create index on donation (created_by);


-- ============================================================================
-- ② distribution — 배분처 (다기관 배분)
--    이 테이블 하나로 다기관 배분이 성립한다. 기관은 회원이 아니다.
--    ★ org_contact(담당자 연락처)는 개인정보라 컬럼을 만들지 않는다.
--      링크를 발급하는 순간에만 쓰고 버린다.
-- ============================================================================
create table distribution (
  id           bigint generated always as identity primary key,
  donation_id  bigint not null references donation(id) on delete cascade,
  org_name     text not null,        -- 배분기관명 — 기관명은 개인정보가 아니다
  qty          integer not null,     -- ★ 이 기관에 배분한 낱개 수량 = qty_as_received × pack_size (E7: 합계를 donation.qty 와 대조)
  qty_as_received integer,           -- 인수증에 적힌 수량 그대로            ┐ 단위 3종
  qty_unit     text not null default '낱개',   -- 인수증의 단위                ├ (팀 결정 8/28)
  pack_size    integer,              -- 1단위당 낱개 수 (사람이 환산 입력)    ┘
  org_contact  text,                 -- ★ 개인정보 — Supabase 기본 암호화로 갈음(팀 결정 8/28) · 증빙 제출 완료 시 즉시 삭제(null)
  dist_date    date,
  memo         text,
  state        text not null default '배분 확정'
                 check (state in ('배분 확정', '증빙 대기', '증빙 완료')),
  created_by   uuid references staff(id),
  created_at   timestamptz not null default now(),
  constraint distribution_qty_matches_received
    check (qty_as_received is null or pack_size is null or qty = qty_as_received * pack_size)
);

comment on table distribution is
  '후원 건 1개 → 배분처 N개. 검수 규칙 E7: SUM(qty) = donation.qty 인지 코드가 대조한다 (AI 호출 없음)';

create index on distribution (donation_id);


-- ============================================================================
-- ⑦ access_link — 접수 · 증빙 제출 링크
--    ★ 원문 토큰을 저장하지 않는다 (해시만). 본인확인 값도 해시만.
-- ============================================================================
create table access_link (
  id              bigint generated always as identity primary key,
  donation_id     bigint not null references donation(id) on delete cascade,
  distribution_id bigint references distribution(id) on delete cascade,
                  -- NULL    = 후원자 접수 링크 (건당 1장)
                  -- 값 있음 = 배분 증빙 링크 (배분처마다 1장)
  purpose         text not null check (purpose in ('intake', 'dist_proof')),
  token_hash      text not null,    -- ★ 원문 토큰은 저장하지 않는다
  verify_hint     text,             -- ★ 전화번호 뒤 4자리의 해시 (원문 아님)
  expires_at      timestamptz,
  used_at         timestamptz,
  revoked         boolean not null default false,
  issued_by       uuid references staff(id),
  issued_at       timestamptz not null default now(),
  -- ── 발송 (팀 결정 8/28, §2-⑦ C안) ──
  recipient_enc   text,             -- ★ 수신 연락처 — Supabase 기본 암호화로 갈음 · used_at 기록 시 즉시 삭제(null)
  sent_at         timestamptz,
  sent_channel    text check (sent_channel in ('문자', '유선 안내', '직접 전달', '메일')),  -- '메일' 은 patch-20260907-sent-channel-mail.sql
  sent_status     text check (sent_status in ('success', 'failed')),
  sent_error      text,
  sent_by         uuid references staff(id),
  resend_count    integer not null default 0
);

comment on column access_link.verify_hint is
  '본인확인용 해시. 원문 복원 불가 — 개인정보를 저장하지 않기 위한 장치';

create index on access_link (donation_id);
create index on access_link (token_hash);


-- ============================================================================
-- ③ checklist_item — 이 건에 확정된 체크리스트 [B]
--    ★ [A]기준 → [B]체크리스트는 복사(스냅샷)다. FK로 참조하지 않고 값을 복사한다.
--    ★ status 는 담당자만 쓴다. AI는 이 칸에 쓰지 않는다 (AI 의견은 inspection_finding).
-- ============================================================================
create table checklist_item (
  id              bigint generated always as identity primary key,
  donation_id     bigint not null references donation(id) on delete cascade,
  distribution_id bigint references distribution(id) on delete cascade,
                  -- NULL    = 접수 단계 서류 (신청서 · 영수증 · 물품사진)
                  -- 값 있음 = 배분 단계 서류 (인수증 · 배분물품사진 · 결과보고)
  doc_key         text not null,    -- 'appl_corp' | 'proof_buy' | 'photo' | 'inss' ...
  doc_name        text not null,
  kind            text check (kind in ('F', 'S', 'A')),   -- 폼필드 | 폼제출 | 첨부파일
  stage           text check (stage in ('접수', '배분')),
  owner           text,             -- '후원자 발급' | '배분처 수취' | '폼 필드'
  basis           text,             -- 근거 조항 ('기관 업무지침 · 유형별 필수서류')
  due_date        date,
  included        boolean not null default true,   -- 담당자가 이 건에서 뺐는지
  note            text,

  status          text not null default '미수취'
                    check (status in ('미수취', '수취완료', '확인필요')),
  confirmed_by    uuid references staff(id),
  confirmed_at    timestamptz,
  created_at      timestamptz not null default now()
);

comment on column checklist_item.distribution_id is
  '다기관 배분의 두 번째 열쇠. 배분처가 3곳이면 인수증·사진·결과보고가 3벌 생기고 이 FK로 갈린다';
comment on column checklist_item.status is
  '담당자 확정값 전용. AI는 여기에 쓰지 않는다';

create index on checklist_item (donation_id);
create index on checklist_item (distribution_id);


-- ============================================================================
-- ④ attachment — 첨부파일 (재제출 이력 보존)
--    1:N인 이유: 견적서를 냈다가 영수증으로 재제출한 사실이 남아야 한다.
--    ★ 파기 후에도 행은 남긴다. "어떤 서류가 언제 제출되고 왜 반려됐는가"는
--      개인정보가 아니므로 계속 보관한다 — 감사 대응이 유지된다.
-- ============================================================================
create table attachment (
  id                bigint generated always as identity primary key,
  checklist_item_id bigint not null references checklist_item(id) on delete cascade,
  file_name         text not null,   -- ⚠️ 원본 파일명 그대로 — **개인정보가 들어올 수 있다**
                                    --    후원자가 '물품기부신청서_홍길동.png' 로 올린다(9/3 실제 표본 확인).
                                    --    경로(storage_key)는 UUID 라 안 새지만 이 컬럼은 샌다.
                                    --    담당자가 서류를 알아보는 단서라 지우지 않고 **파기 대상에 포함**한다.
                                    --    (10-planning/privacy-inventory-20260903.md §5-가)
  file_size         bigint,
  mime_type         text,
  storage_key       text not null,   -- ★ 파일 저장소 키 — 파일 자체를 DB에 넣지 않는다
  uploaded_by_role  text check (uploaded_by_role in ('donor', 'org', 'staff')),
  uploaded_by_ref   text,            -- 링크 토큰 id 또는 staff id
  uploaded_at       timestamptz not null default now(),
  is_current        boolean not null default true,   -- 최신 제출본만 true
  superseded_by     bigint references attachment(id),
  purged_at         timestamptz      -- ★ 실물 파일 삭제 시각 (행은 남는다)
);

create index on attachment (checklist_item_id);


-- ============================================================================
-- ⑤ form_submission — 폼 제출본 (신청서 · 인수증)  ★ 개인정보 분리 지점
--
--    이 설계에서 가장 중요한 지점.
--    후원자가 폼을 제출하면 서버(Edge Function)가 값을 두 갈래로 가른다.
--      · 대조용 값  → payload (DB)
--      · 개인정보    → PDF 안에만 담아 파일 저장소로
--    주민번호는 DB를 한 번도 거치지 않는다.
-- ============================================================================
create table form_submission (
  id              bigint generated always as identity primary key,
  donation_id     bigint not null references donation(id) on delete cascade,
  distribution_id bigint references distribution(id) on delete cascade,
  form_type       text not null,   -- '물품기부신청서(법인)' | '(법인외)' | '인수증'

  payload         jsonb,           -- ★ 대조용 값만. 개인정보 제외
                                   -- { "품목":"즉석밥 3종", "수량":400,
                                   --   "단가":12500, "금액":5000000,
                                   --   "후원일자":"2026-06-30", "취득경로":"구매" }

  pdf_key         text,            -- ★ 이름·주민번호·연락처·서명은 이 PDF 안에만
  signed          boolean not null default false,   -- 서명 여부만. 이미지는 PDF 안에
  submitter_role  text check (submitter_role in ('donor', 'org', 'staff')),
  access_link_id  bigint references access_link(id),
  submitted_at    timestamptz not null default now(),
  purged_at       timestamptz
);

comment on column form_submission.payload is
  '대조·검수에 쓰는 값만 담는다. 이름·주민번호·연락처·주소는 절대 넣지 않는다';
comment on column form_submission.pdf_key is
  '개인정보가 들어있는 유일한 곳. 열람은 audit_log 에 pdf.view 로 남긴다';

create index on form_submission (donation_id);


-- ============================================================================
-- ⑧ audit_log — 감사 로그
--    ★ 개인정보 관련 3종 액션(pdf.view · bulk.download · purge.execute)이 핵심.
--      주민번호가 든 PDF를 누가 언제 열어봤고 반출했는지가 남아야 한다.
--    다른 테이블을 target_type/target_id 로 가리킨다 (FK 없음).
-- ============================================================================
create table audit_log (
  id           bigint generated always as identity primary key,
  actor_type   text not null check (actor_type in ('staff', 'donor', 'org', 'system')),
  actor_ref    text,             -- staff id 또는 access_link id
  action       text not null,    -- 'case.create' | 'item.confirm' | 'case.complete'
                                 -- 'file.upload' | 'link.issue'   | 'inspection.run'
                                 -- ★ 'pdf.view' | 'bulk.download' | 'purge.execute'
  target_type  text,
  target_id    text,
  before_value jsonb,
  after_value  jsonb,
  ip           text,
  user_agent   text,
  occurred_at  timestamptz not null default now()
);

create index on audit_log (occurred_at desc);
create index on audit_log (action);


-- ============================================================================
-- updated_at 자동 갱신
-- ============================================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger donation_set_updated_at
  before update on donation
  for each row execute function set_updated_at();



-- ============================================================================
-- 2단계 — AI 실판정 (⑨ inspection · ⑩ inspection_finding)
--   근거: (미공개 내부 기록) · 추가: 승희 2026-08-28 (유진 요청 — E1 결과 저장용)
--   ★ AI는 checklist_item.status 에 쓰지 않는다. AI 의견은 여기(verdict)에만 쌓이고
--     화면에서는 옆에 '표기'로만 보인다. 확정은 담당자만.
-- ============================================================================

-- ⑨ inspection — 검수 실행 1회 (AI 한 번 돌린 것)
create table if not exists inspection (
  id             bigint generated always as identity primary key,
  donation_id    bigint not null references donation(id) on delete cascade,
  criteria_key   text,               -- ★ 실행 시점의 기준 버전 (donation.criteria_key 복사)
  rubric_version text,               -- ★ 검수 기준서 버전 (예: 'v4-20260828')
  model          text,               -- 모델명 (예: 'gemini-3.5-flash')
  prompt_hash    text,               -- 프롬프트 지문 — 재현성
  status         text not null default 'success'
                   check (status in ('success', 'timeout', 'quota', 'parse_error')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  triggered_by   uuid references staff(id)
);
comment on table inspection is '★ 기준 버전을 결과에 박아 저장 — 기준서가 개정돼도 과거 판정의 근거가 재현된다';

-- ⑩ inspection_finding — 판정 낱개 (한 번의 실행에서 여러 개)
create table if not exists inspection_finding (
  id                bigint generated always as identity primary key,
  inspection_id     bigint not null references inspection(id) on delete cascade,
  layer             text not null check (layer in ('슬롯', '대조')),
  checklist_item_id bigint references checklist_item(id) on delete set null,
                    -- ★ NULL 허용 — E1 금액 불일치는 영수증 잘못도 신청서 잘못도 아닌 "둘 사이"의 문제라
                    --   어느 서류 슬롯에도 속하지 않는다 (대조 판정은 대개 NULL)
  distribution_id   bigint references distribution(id) on delete set null,   -- E7 배분 수량 대조용
  rule_code         text check (rule_code in ('E1','E2','E3','E4','E5','E6','E7')),  -- NULL = 슬롯 판정
  verdict           text not null default '대기중'
                      check (verdict in ('이상 없음', '확인 권장', '판단 보류', '대기중', '배분 진행 중')),
                      -- ★ AI 전용 5값 (2026-08-31 '배분 진행 중' 추가 — E7 미달 화면 표기와 정합, dbVerdict() 헬퍼 제거)
  reason            text,             -- 사유 1문장
  extracted_value   text,             -- AI가 서류에서 읽은 값  ┐
  system_value      text,             -- 시스템 등록값          ├ ★ 감사 방어의 핵심 3종
  source_file       text,             -- 근거 파일명            ┘
  created_at        timestamptz not null default now()
);
comment on column inspection_finding.extracted_value is
  '⚠️ 상호·사업자번호가 섞여 들어올 수 있음 — 감사 방어 vs 개인정보 최소화 충돌 지점(설계안 §8-5). 금액·수량·날짜만 넣도록 프롬프트에서 제한할 것';

create index if not exists inspection_donation_idx on inspection(donation_id, started_at desc);
create index if not exists inspection_finding_inspection_idx on inspection_finding(inspection_id);


-- ============================================================================
-- 끝. 테이블 10개:
--   1단계(8) staff · donation · distribution · access_link
--           checklist_item · attachment · form_submission · audit_log
--   2단계(2) inspection · inspection_finding
--
-- 다음에 할 일 (남은 사람에게):
--   1. RLS 설정 — 로그인 붙일 때. 지금은 publishable(anon) key로 다 읽힌다
--   2. staff.id 를 Supabase auth.users.id 와 연결
--   3. db.js 의 T·COL 블록에 inspection · inspection_finding 추가 (선미 — 미공개 내부 기록)
-- ============================================================================
