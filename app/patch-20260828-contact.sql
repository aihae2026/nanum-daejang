-- ============================================================================
-- 나눔대장 — 패치 2026-08-28: 8/28 팀 결정 컬럼 추가 (schema.sql v1 실행 이후용)
--   · distribution.org_contact          (배분처 연락처 — 증빙 완료 시 삭제)
--   · access_link 발송 7컬럼            (§2-⑦ C안)
--   drop 없음 · 여러 번 실행해도 안전(if not exists) · 기존 데이터 유지
--   ※ schema.sql 을 처음부터 새로 실행한 DB에는 이미 포함돼 있어 실행 불필요
-- ============================================================================
alter table distribution
  add column if not exists org_contact text;

alter table access_link
  add column if not exists recipient_enc text,
  add column if not exists sent_at       timestamptz,
  add column if not exists sent_channel  text check (sent_channel in ('문자', '유선 안내', '직접 전달')),
  add column if not exists sent_status   text check (sent_status in ('success', 'failed')),
  add column if not exists sent_error    text,
  add column if not exists sent_by       uuid references staff(id),
  add column if not exists resend_count  integer not null default 0;

-- 확인: 두 테이블 컬럼 목록
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name in ('distribution', 'access_link')
order by table_name, ordinal_position;
