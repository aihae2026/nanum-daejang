-- ============================================================================
-- 나눔대장 — 패치 2026-09-06: 법인 외 후원자 이름을 **가려서** 남길 수 있게
--   제약만 교체 · 여러 번 실행해도 안전 · 기존 데이터 유지 · drop 없음
--
-- 왜 필요한가 (선미 9/5~9/6 실주행)
--   법인 외(개인) 후원자 이름은 지금까지 **아예 저장하지 않았다**(privacy-design §후원자명).
--   그 대가가 실주행에서 드러났다 — #217 · #218 · #219 가 같은 품목·같은 접수일이라
--   담당자 목록에서 **접수번호 말고는 구분할 것이 없었다.**
--   화면은 '(미입력)' 이라고 적고 있었는데, 그건 "후원자가 안 썼다" 로 읽힌다.
--   후원자는 분명히 적었고 신청서 PDF 에도 찍혀 있다.
--
--   그래서 규칙을 바꾼다: **안 남긴다 → 알아볼 수 없게 남긴다.**
--     실명  김나눔   → 신청서 PDF 안에만 (열면 pdf.view 기록)
--     가린 이름 김○눔 → donation.donor_name
--
-- ★ 이 패치는 보호를 **없애지 않는다.** 옮긴다.
--   지금 제약은 "법인 외는 NULL" 이라 실명도 가린 이름도 못 들어간다.
--   새 제약은 "법인 외는 NULL 이거나 **'○' 가 든 값**" 이다 —
--   즉 **실명은 DB 가 계속 거부한다.** 화면 코드가 실수해도 DB 가 막는다.
--   (가리는 규칙은 common.js maskName() — 2글자 김○ · 3글자 김○눔 · 4글자 남○○수 · 1글자 ○)
--
-- ⚠️ 이것도 개인정보다. 가명처리한 것이지 개인정보가 아닌 것이 되지 않는다.
--   개인정보 현황·보유 목록에 donor_name(가명) 한 줄이 늘어난 것으로 본다.
--
-- ⚠️ 실행 전에는 화면 코드가 NULL 을 보낸다(81fa662 에서 되돌렸다).
--   실행하지 않은 채 코드만 켜면 **접수 링크 발송이 HTTP 400 (23514) 로 실패한다** —
--   9/6 dev 에서 실제로 그렇게 됐다(#220 이 저장되지 않았습니다).
--
-- 실행 뒤 할 일 — 화면 코드 두 자리를 maskName 으로 되돌린다
--   db.js  createDonation      row[D.donorName] = … : maskName(c.donor) || null
--   screen-donor.js submitFields  donorName: … : maskName(f.donorName) || null
--   검사 둘(smoke-test-ledger · smoke-test-roundtrip-map)의 '패치 전' 항목도 함께 되돌린다.
--
-- 되돌리려면 (rollback)
--   아래 add constraint 의 check 를 원래 식으로 바꿔 다시 실행한다:
--     (donor_type = '법인외' and donor_name is null)
--   ⚠️ 그 전에 이미 들어간 가린 이름을 지워야 한다:
--     update donation set donor_name = null where donor_type = '법인외';
-- ============================================================================

alter table donation drop constraint if exists donor_name_only_for_corp;

alter table donation add constraint donor_name_only_for_corp
  check (
       (donor_type = '법인'   and donor_name is not null)
       -- 법인 외 — 비어 있거나, 가린 이름('○' 포함)만 받는다. 실명은 거부한다.
    or (donor_type = '법인외' and (donor_name is null or donor_name like '%○%'))
  );

-- 확인 — 법인 외에 실명이 남아 있지 않은가 (있으면 위 제약이 걸려 이 패치가 실패한다)
--   select case_no, donor_type, donor_name from donation
--    where donor_type = '법인외' and donor_name is not null and donor_name not like '%○%';
