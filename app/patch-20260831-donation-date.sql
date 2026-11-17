-- ============================================================================
-- 나눔대장 — 패치 2026-08-31: donation 에 후원일자(donation_date) 컬럼 추가
--   drop 없음 · 여러 번 실행해도 안전(if not exists) · 기존 데이터 유지
--
-- 왜 필요한가 (유진 발견 · 유진·선미 처리, 승희 부재 중)
--   루브릭 E2(일자 선행): "서류 일자가 기부일보다 앞서는지" 판정한다.
--   지금 donation 에는 arrive_date(물품 도착일)·in_date(접수일)뿐이라
--   기부일을 알 수 없어 E2 판정이 불가하다. 유진과장님이 임시로 화면에
--   '판단 보류 + 이유' 로 남겨둔 상태.
--
--   신청서의 후원일자 칸을 정본으로 하자는 것이 루브릭 §2-E2 결정.
--
-- 컬럼명 근거 (2026-08-31 · 유진·선미 결정)
--   donation_date — 테이블명과 같은 스타일. 기존 arrive_date·in_date·deadline 과
--   `_date` 접미사 일관성. 대안(gift_date · contribution_date)보다 코드에서 읽기 쉬움.
--   승희님 판단 다르시면 이슈 파일에서 알려주세요.
-- ============================================================================

alter table donation
  add column if not exists donation_date date;

comment on column donation.donation_date is
  '기부일 — 신청서의 후원일자 칸 정본. E2(일자 선행) 판정 기준. '
  'arrive_date(물품 도착일)·in_date(접수일)와는 별개.';

-- seed-dummy 는 별도 커밋에서 값을 채웠음. 실 DB의 기존 3~4건도 아래로 채운다:
update donation set donation_date = '2026-06-20' where case_no = '101' and donation_date is null;
update donation set donation_date = '2026-06-28' where case_no = '102' and donation_date is null;
update donation set donation_date = '2026-05-05' where case_no = '103' and donation_date is null;
-- ⚠️ #104 는 일부러 비워 둡니다 — 아래 줄을 되살리지 마세요 (2026-09-01 · 선미 결정)
--    E2(일자 선행)의 '판단 보류' 경로를 화면에서 눈으로 볼 수 있게 남긴 케이스입니다.
--    자세한 이유는 seed-dummy.sql 의 #104 주석에 있습니다.
-- update donation set donation_date = '2026-07-10' where case_no = '104' and donation_date is null;

-- 확인
select case_no, donation_date, arrive_date, in_date
from donation order by case_no;
