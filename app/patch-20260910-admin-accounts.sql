-- ============================================================================
-- 나눔대장 — 패치 2026-09-10: 관리자 지정 · 시드 더미 계정 삭제 (연수 결정)
--   여러 번 실행해도 안전 · [A] 드라이런 먼저
--
-- ★ 왜 지금 — 9/10 실 DB 조회에서 **활성 관리자가 0명**인 것이 드러났다.
--   role='admin' 인 계정은 시드 더미(test-staff@example.com) 하나뿐이었고 그마저 disabled 였다.
--   지금까지 관리자 화면을 역할 전환 바로만 열어 봐서 아무도 몰랐다.
--   patch-20260910-admin-rls.sql 을 돌리기 **전에** 이걸 먼저 돌린다 —
--   관리자가 0명인 상태로 정책을 걸면 계정을 고칠 사람이 없어진다.
--
-- ★ 하는 일 둘
--   1. 팀 4명 + 심사위원을 관리자로
--   2. 시드 더미(test-staff@example.com) 삭제 — 참조를 먼저 끊는다
--
-- ⚠️ 심사위원(admin@example.org)에게 관리자를 주는 것은 **의도한 결정**이다(연수 9/10).
--   심사 항목에 "권한 관리" 가 있어, 심사위원이 관리자 화면을 못 보면 평가할 수 없다.
--   대신 심사위원도 다른 계정의 역할·상태를 바꿀 수 있다 — 대회가 끝나면 되돌린다.
--   되돌리기는 맨 아래 [C] 에 적어 뒀다.
--
-- ⚠️ 테스터(tester@example.org)는 담당자로 둔다. 동료 10명이 같이 쓰는 계정이라
--   관리자를 주면 누구나 계정 권한을 바꿀 수 있게 된다.
-- ============================================================================

-- ── [A] 드라이런 — 무엇이 바뀌고 무엇이 걸려 있나 (아무것도 안 바꾼다) ───────
select '지금 계정' as 구분, name, email, role, status from staff order by role, name;

select '활성 관리자 수' as 구분, count(*) as n
  from staff where role = 'admin' and status = 'active';

-- 시드 더미를 가리키는 곳 — 여기 숫자가 0 이 아니면 그냥은 못 지운다
with d as (select id from staff where email = 'test-staff@example.com')
select '더미를 가리키는 행' as 구분, t as 테이블, n
  from (
    select 'donation.created_by'          as t, count(*) n from donation          where created_by   in (select id from d)
    union all select 'distribution.created_by',   count(*)   from distribution     where created_by   in (select id from d)
    union all select 'access_link.issued_by',     count(*)   from access_link      where issued_by    in (select id from d)
    union all select 'access_link.sent_by',       count(*)   from access_link      where sent_by      in (select id from d)
    union all select 'checklist_item.confirmed_by', count(*) from checklist_item   where confirmed_by in (select id from d)
    union all select 'inspection.triggered_by',   count(*)   from inspection       where triggered_by in (select id from d)
  ) x
 order by n desc;


-- ── [B] 실행 ────────────────────────────────────────────────────────────────
begin;

-- 1. 관리자 지정 — 팀 4명 + 심사위원
update staff set role = 'admin'
 where email in (
   'admin1@example.org',              -- 연수
   'admin2@example.org',              -- 선미
   'admin3@example.org',           -- 홍승희
   'admin4@example.org',               -- 유진
   'admin@example.org'                 -- 심사위원 (대회 뒤 [C] 로 되돌린다)
 );

-- 2. 시드 더미 삭제 — 참조를 먼저 끊는다
--    ★ 왜 NULL 인가 — 이 행은 로그인이 불가능한 가짜 계정이라(auth.users 에 없다)
--      "누가 만들었나" 가 원래부터 사실이 아니었다. NULL 은 '모른다' 라고 정직하게 말한다.
--      되짚어야 하면 audit_log 가 남아 있다 — 그쪽은 손대지 않는다(감사 기록을 고쳐 쓰지 않는다).
--    ⚠️ 실제 담당자 계정에는 절대 쓰지 않는다. email 로 못 박아 둔 이유다.
do $$
declare dummy_id uuid;
begin
  select id into dummy_id from staff where email = 'test-staff@example.com';
  if dummy_id is null then
    raise notice '시드 더미가 이미 없습니다 — 건너뜁니다';
    return;
  end if;
  update donation       set created_by   = null where created_by   = dummy_id;
  update distribution   set created_by   = null where created_by   = dummy_id;
  update access_link    set issued_by    = null where issued_by    = dummy_id;
  update access_link    set sent_by      = null where sent_by      = dummy_id;
  update checklist_item set confirmed_by = null where confirmed_by = dummy_id;
  update inspection     set triggered_by = null where triggered_by = dummy_id;
  delete from staff where id = dummy_id;
  raise notice '시드 더미를 지웠습니다: %', dummy_id;
end $$;

commit;


-- ── 확인 ────────────────────────────────────────────────────────────────────
select name, email, role, status, last_login_at from staff order by role, name;

select count(*) as active_admins from staff where role = 'admin' and status = 'active';
-- ↑ 5 여야 한다 (연수·선미·승희·유진·심사위원)

select count(*) as dummy_left from staff where email = 'test-staff@example.com';
-- ↑ 0 이어야 한다


-- ── [C] 대회가 끝나면 — 심사위원 관리자 권한 회수 ────────────────────────────
--   심사 종료: 2026-10-02. 아래 한 줄을 돌린다.
--   ⚠️ cleanup-judge-data-after-review.sql (심사위원이 만든 건 삭제 — 미공개 내부 기록, 저장소 미포함) 과는 별개다 —
--     그건 데이터, 이건 권한이다. 둘 다 해야 한다.
--
-- update staff set role = 'staff' where email = 'admin@example.org';
-- select name, email, role, status from staff order by role, name;
