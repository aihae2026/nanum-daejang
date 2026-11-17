-- ============================================================================
-- 나눔대장 — 더미 데이터 4건 (개발·테스트용)
--   작성: 승희 · 2026-08-28
--   #104 추가: 유진 · 2026-09-01 (기부일 없는 케이스 — 선미 결정, 아래 주석 참조)
--
-- 단위: qty 는 낱개 총수량, qty_as_received/qty_unit 은 서류 표기, pack_size 는 환산(팀 결정 8/28)
-- 🚨 여기에는 실명 · 실제 사업자번호 · 실제 연락처가 한 건도 없습니다.
--    앞으로도 넣지 마세요. 전부 가짜 값입니다.
--
-- schema.sql 을 먼저 실행한 뒤에 이걸 실행하세요.
-- ============================================================================

-- 담당자 1명 (가짜)
insert into staff (name, email, role) values
  ('테스트담당자', 'test-staff@example.com', 'admin');


-- ── 건 #101 ── 법인 · 즉석밥 400박스(×12=4,800낱개) · 3개 기관 배분 ─────────────
--    설계안 §2-② 의 다기관 배분 예시. 서류는 박스, qty 는 낱개. SUM(1800+1800+1200)=4800 = donation.qty ✅
insert into donation (
  case_no, state, donor_type, donor_name, donor_biz_no, is_corp_verified,
  acquisition_path, item_name, qty, qty_as_received, qty_unit, pack_size, unit_price, book_value, fair_value,
  donation_date, arrive_date, in_date, deadline, submitted_via, purpose, wants_receipt,
  criteria_key, created_by
) values (
  '101', '검수 대기', '법인', '테스트식품(주)', '000-00-00000', true,
  '구매', '즉석밥 3종', 4800, 400, '박스', 12, 12500, 5000000, 5000000,
  '2026-06-20', '2026-06-25', '2026-06-30', '2026-07-15', '링크 제출', '아동급식 지원', true,
  'fnd_guideline_2026', (select id from staff limit 1)
);

insert into distribution (donation_id, org_name, qty, qty_as_received, qty_unit, pack_size, dist_date, state, created_by) values
  ((select id from donation where case_no = '101'), '테스트지역아동센터', 1800, 150, '박스', 12, '2026-07-02', '증빙 대기', (select id from staff limit 1)),
  ((select id from donation where case_no = '101'), '테스트복지관', 1800, 150, '박스', 12, '2026-07-02', '증빙 대기', (select id from staff limit 1)),
  ((select id from donation where case_no = '101'), '테스트나눔의집', 1200, 100, '박스', 12, '2026-07-03', '배분 확정', (select id from staff limit 1));


-- ── 건 #102 ── 법인 외(개인) · 쌀 20kg ─────────────────────────────────────
--    ★ 개인 후원자는 이름을 저장하지 않는다. 건 번호로만 표시한다.
insert into donation (
  case_no, state, donor_type, donor_name, donor_biz_no,
  acquisition_path, item_name, qty, qty_as_received, qty_unit, pack_size, unit_price, book_value, fair_value,
  donation_date, arrive_date, in_date, deadline, submitted_via, purpose, wants_receipt,
  criteria_key, created_by
) values (
  '102', '접수 검토', '법인외', null, null,
  '구매', '쌀 20kg', 10, 10, '포', 1, 55000, 550000, 550000,
  '2026-06-28', '2026-07-01', '2026-07-02', '2026-07-20', '전화 문의 후 대리등록', '결식아동 지원', false,
  'fnd_guideline_2026', (select id from staff limit 1)
);

insert into distribution (donation_id, org_name, qty, qty_as_received, qty_unit, pack_size, dist_date, state, created_by) values
  ((select id from donation where case_no = '102'), '테스트지역아동센터', 10, 10, '포', 1, '2026-07-05', '증빙 완료', (select id from staff limit 1));


-- ── 건 #103 ── 법인 · 라면 200박스 · 완결 ──────────────────────────────────
insert into donation (
  case_no, state, donor_type, donor_name, donor_biz_no, is_corp_verified,
  acquisition_path, item_name, qty, qty_as_received, qty_unit, pack_size, unit_price, book_value, fair_value,
  donation_date, arrive_date, in_date, deadline, submitted_via, purpose, wants_receipt,
  criteria_key, completed_at, transferred_at, purge_due, created_by
) values (
  '103', '완결', '법인', '테스트유통(주)', '111-11-11111', true,
  '제조·유통', '라면 5개입', 1000, 200, '묶음', 5, 4200, 840000, 900000,
  '2026-05-05', '2026-05-10', '2026-05-12', '2026-05-31', '공문', '지역아동 급식', true,
  'fnd_guideline_2026', '2026-06-01 10:00+09', '2026-06-03 14:00+09', '2027-12-31',
  (select id from staff limit 1)
);

insert into distribution (donation_id, org_name, qty, qty_as_received, qty_unit, pack_size, dist_date, state, created_by) values
  ((select id from donation where case_no = '103'), '테스트복지관', 1000, 200, '묶음', 5, '2026-05-20', '증빙 완료', (select id from staff limit 1));



-- ── 건 #104 ── 법인 · 문구 세트 · ★ 기부일(donation_date) 이 비어 있는 건 ─────
--    ⚠️ donation_date 를 채우지 마세요. 비어 있는 것이 이 건의 존재 이유입니다.
--
--    왜 남겨 두나 (2026-09-01 · 유진 발견 → 선미 결정)
--      E2(일자 선행)는 기부일이 없으면 조용히 통과시키지 않고 '판단 보류'로 세웁니다.
--      "안 본 것을 안 봤다고 적지 않으면 담당자는 봤다고 여긴다"(자동화 편향 방지)가
--      이 시스템 전체를 관통하는 원칙인데, 그걸 말로 설명하는 것보다
--      화면에 한 건 떠 있는 편이 훨씬 분명합니다.
--      101~103 은 '이상 없음'으로 뜨므로 대비도 됩니다.
--
--    ★ 값이 빠진 게 아니라 '빠진 상태를 일부러 둔 것'입니다.
--      채우면 이 케이스가 사라져서 판단 보류 경로를 아무도 눈으로 못 봅니다.
--      배분(distribution)도 일부러 없습니다 — 배분 전이라 E7·E2 배분 축은 볼 것이 없는 상태입니다.
insert into donation (
  case_no, state, donor_type, donor_name, donor_biz_no, is_corp_verified,
  acquisition_path, item_name, qty, qty_as_received, qty_unit, pack_size, unit_price, book_value, fair_value,
  donation_date, arrive_date, in_date, deadline, submitted_via, purpose, wants_receipt,
  criteria_key, created_by
) values (
  '104', '접수 검토', '법인', '테스트문구(주)', '000-00-00000', true,
  '구매', '문구 세트', 200, 200, '낱개', 1, 9000, 1800000, 1800000,
  null, '2026-07-14', '2026-07-14', '2026-07-28', '전화 문의 후 대리등록', '아동 학습 지원', false,
  'fnd_guideline_2026', (select id from staff limit 1)
);
--  ↑ donation_date 가 null 입니다. 오타가 아닙니다.


-- ============================================================================
-- 확인용 — 아래를 실행하면 배분 수량 합계 대조(E7)가 맞는지 눈으로 볼 수 있습니다
-- ============================================================================
-- select d.case_no,
--        d.item_name,
--        d.qty                        as 접수수량,
--        coalesce(sum(t.qty), 0)      as 배분합계,
--        case when d.qty = coalesce(sum(t.qty), 0) then '✅ 일치' else '⚠️ 확인 권장' end as 대조
-- from donation d
-- left join distribution t on t.donation_id = d.id
-- group by d.id, d.case_no, d.item_name, d.qty
-- order by d.case_no;
