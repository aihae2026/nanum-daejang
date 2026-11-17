-- ============================================================================
-- 나눔대장 — 패치 2026-08-28 #3: 단위 컬럼 추가 (팀 결정 8/28, 선미 OK)
--   문제: qty 가 낱개인지 박스인지 DB만 봐선 모름 → E4(단위 다르면 사람 몫)·E7(합계 대조)·감사 3종 모두 흔들림
--   원칙: qty 는 그대로 "낱개 총수량"(코드 대조 기준) — 뜻 안 바뀜, 기존 코드 안 깨짐
--         서류에 적힌 그대로(qty_as_received · qty_unit)와 사람이 환산한 근거(pack_size)를 옆에 보존
--   drop 없음 · 기존 컬럼 무변경 · 여러 번 실행 안전 · 새 컬럼은 null 허용이라 기존 insert 그대로 통과
-- ============================================================================

-- ① donation
alter table donation
  add column if not exists qty_as_received integer,                    -- 서류에 적힌 수량 그대로 (400)
  add column if not exists qty_unit        text not null default '낱개', -- 서류의 단위 ('낱개'·'박스'·'포'·'묶음'·'kg' …)
  add column if not exists pack_size       integer;                    -- ★ 1단위당 낱개 수 (12) — "환산은 사람 몫"의 기록. 낱개면 1
alter table donation drop constraint if exists donation_qty_matches_received;
alter table donation add constraint donation_qty_matches_received
  check (qty_as_received is null or pack_size is null or qty = qty_as_received * pack_size);   -- 셋 다 채웠을 때만 검사
comment on column donation.qty        is '낱개 총수량 = qty_as_received × pack_size. SUM(distribution.qty) 와 대조하는 기준값(E7). 코드 대조는 항상 이 값으로';
comment on column donation.unit_price is 'qty_unit 1단위당 단가 (서류 기준). book_value = qty_as_received × unit_price';
comment on column donation.pack_size  is '1 qty_unit 당 낱개 수. 사람이 환산해 입력 — E4 "낱개↔박스 환산은 사람 몫"의 근거가 여기 남는다';

-- ② distribution (배분처 인수증도 박스로 적힐 수 있다)
alter table distribution
  add column if not exists qty_as_received integer,
  add column if not exists qty_unit        text not null default '낱개',
  add column if not exists pack_size       integer;
alter table distribution drop constraint if exists distribution_qty_matches_received;
alter table distribution add constraint distribution_qty_matches_received
  check (qty_as_received is null or pack_size is null or qty = qty_as_received * pack_size);
comment on column distribution.qty is '이 기관에 배분한 낱개 수량 = qty_as_received × pack_size. E7 은 이 값들의 합을 donation.qty 와 대조';

-- ③ 더미 3건 단위 보정 (설계안 §2-② 예시 "즉석밥 400박스" 기준)
--    #101 즉석밥 400박스 × 12 = 4,800낱개 · #102 쌀 10포(20kg) × 1 · #103 라면 200묶음 × 5 = 1,000낱개
update donation set qty_as_received = 400, qty_unit = '박스', pack_size = 12, qty = 4800 where case_no = '101';
update donation set qty_as_received = 10,  qty_unit = '포',   pack_size = 1,  qty = 10   where case_no = '102';
update donation set qty_as_received = 200, qty_unit = '묶음', pack_size = 5,  qty = 1000 where case_no = '103';
update distribution t set qty_as_received = t.qty, qty_unit = d.qty_unit, pack_size = d.pack_size, qty = t.qty * d.pack_size
  from donation d where t.donation_id = d.id and d.case_no in ('101','102','103') and t.qty_as_received is null;

-- 확인: 접수 vs 배분 합계 (E7) — 전부 ✅ 이어야 정상
select d.case_no, d.item_name, d.qty_as_received || d.qty_unit as 서류표기, d.pack_size as 단위당낱개,
       d.qty as 접수낱개, coalesce(sum(t.qty), 0) as 배분낱개합계,
       case when d.qty = coalesce(sum(t.qty), 0) then '✅ 일치' else '⚠️ 확인 권장' end as E7
from donation d left join distribution t on t.donation_id = d.id
group by d.id, d.case_no, d.item_name, d.qty_as_received, d.qty_unit, d.pack_size, d.qty
order by d.case_no;
