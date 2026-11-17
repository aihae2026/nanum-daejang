-- ============================================================================
-- 나눔대장 — 패치 2026-09-07 (승희) : access_link.sent_channel 허용값에 '메일' 추가
--   여러 번 실행해도 안전 · 기존 데이터 유지
-- 왜: 담당자 화면이 이메일 발송을 제공하는데 DB 허용값에 메일이 없어
--     issueAccessLink 가 email 채널을 null 로 비웠다(연수 9/3 발견 · 유진 넘김 ①).
--     "무엇으로 보냈는지" 가 기록에 남아야 하므로 허용값을 넣는다(승희 결정 9/7).
--     db.js CHANNEL_MAP 의 'email' → '메일' 매핑을 같은 날 함께 바꿨다.
-- ============================================================================
alter table access_link drop constraint if exists access_link_sent_channel_check;
alter table access_link add constraint access_link_sent_channel_check
  check (sent_channel in ('문자', '유선 안내', '직접 전달', '메일'));

-- 확인 — 네 값이 다 들어갔나
select pg_get_constraintdef(oid) from pg_constraint where conname = 'access_link_sent_channel_check';
