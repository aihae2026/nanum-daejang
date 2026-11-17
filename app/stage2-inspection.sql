-- ============================================================================
-- 나눔대장 — 2단계 테이블 추가 (schema.sql v1 실행 이후 Supabase에서 실행)
--   drop 없음 · 여러 번 실행해도 안전(if not exists) · 기존 데이터 유지
--   ※ schema.sql 을 처음부터 새로 실행한 DB에는 이미 포함돼 있어 실행 불필요
-- ============================================================================
-- ============================================================================
-- 2단계 — AI 실판정 (⑨ inspection · ⑩ inspection_finding)
--   근거: db-design-final-20260828.md §3 · 추가: 승희 2026-08-28 (유진 요청 — E1 결과 저장용)
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
                      check (verdict in ('이상 없음', '확인 권장', '판단 보류', '대기중')),  -- ★ AI 전용 4값
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

-- 확인
select table_name, count(*) as columns
from information_schema.columns
where table_schema = 'public' and table_name in ('inspection', 'inspection_finding')
group by table_name;
