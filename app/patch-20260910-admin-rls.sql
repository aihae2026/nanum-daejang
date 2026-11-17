-- ============================================================================
-- 나눔대장 — 패치 2026-09-10: 관리자 권한을 DB 에서 강제한다
--   drop 없음 · 여러 번 실행해도 안전 · 기존 데이터 유지
--
-- ★ 왜 필요한가
--   9/7 patch-20260907-rls-stage2 의 정책은 전부 `to authenticated using (true)` 다.
--   즉 **로그인만 하면 역할과 무관하게 다 된다.** role='admin' 을 보는 정책이 한 줄도
--   없었고, staff 테이블에는 select 정책만 있어 앱에서 계정을 고칠 수도 없었다.
--
--   그 상태에서 화면에 '계정·권한' 탭을 만들면 제일 나쁜 모양이 된다 —
--   **감춘 것을 지켜진 것으로 착각하게 만든다.** 이 저장소가 반복해 당한
--   "성공처럼 보이는 응답" 과 같은 계열이다(조용한실패 정본 한 문장).
--   그래서 화면(common.js isAdminUser)과 DB(이 패치)를 같이 넣는다.
--
-- ★ 무엇을 바꾸나 — 셋뿐이다. 나머지 정책은 건드리지 않는다.
--   1. is_admin() — 지금 로그인한 사람이 활성 관리자인가
--   2. staff update 정책 — 관리자만 역할·상태를 바꿀 수 있다
--   3. 마지막 관리자 보호 트리거 — 활성 관리자를 0명으로 만들 수 없다
--
-- ⚠️ 담당자 권한은 **줄이지 않았다.** 담당자는 지금처럼 원장 전체를 읽고 쓴다
--   (권한 모델 — 미공개 내부 기록 · 한 부서가 한 원장을 이어받는 구조).
--   이 패치가 새로 막는 것은 **계정 테이블 쓰기** 하나다.
--
-- ⚠️ 아직 남는 것 (다음 차례) — status='disabled' 는 화면(authLookupStaff)만 막는다.
--   DB 에서 막으려면 모든 테이블 정책을 다시 써야 해서 이번에 넣지 않았다.
--   비활성 계정도 토큰이 살아 있는 동안은 API 로 원장을 고칠 수 있다.
-- ============================================================================

-- ── 1. is_admin() ───────────────────────────────────────────────────────────
-- ★ security definer 인 이유 — staff 정책 안에서 staff 를 조회하면 RLS 가 다시 돌아
--   무한 재귀가 난다(Postgres). definer 로 RLS 를 우회해 한 번만 본다.
-- ★ search_path 를 고정한다 — definer 함수에서 이걸 안 박으면 호출자가 스키마를
--   바꿔치기해 다른 staff 테이블을 보게 만들 수 있다.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

comment on function public.is_admin() is
  '지금 로그인한 사람이 활성 관리자인가 — staff 정책이 스스로를 조회해 재귀하지 않도록 security definer';

-- ── 2. staff 쓰기는 관리자만 ────────────────────────────────────────────────
drop policy if exists "관리자_계정고치기_20260910" on staff;
create policy "관리자_계정고치기_20260910" on staff
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ⚠️ insert/delete 정책은 만들지 않는다.
--   계정 생성은 Supabase Auth 에 사용자를 만드는 일이라 이 테이블만으로는 반쪽이다.
--   화면에도 [계정 추가] 를 두지 않았다 — 못 하는 것을 있는 것처럼 보이게 하지 않는다.
--   지우기도 막아 둔다(퇴사자는 status='disabled' 로 남긴다 · 감사 이력 보존).

-- ── 3. 마지막 관리자 보호 ───────────────────────────────────────────────────
-- ★ 왜 — 활성 관리자가 0명이 되면 계정 화면에 아무도 못 들어온다. 되돌리려면
--   소유자 권한으로 SQL 을 직접 돌려야 한다. 화면에서도 막지만(마지막 관리자 버튼 비활성),
--   화면 방어는 우회된다 — 진짜 방어는 여기다.
create or replace function public.guard_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining int;
begin
  -- 관리자에서 내려오거나 비활성이 되는 경우만 센다
  if (old.role = 'admin' and old.status = 'active')
     and (new.role <> 'admin' or new.status <> 'active') then
    select count(*) into remaining
      from public.staff
     where role = 'admin' and status = 'active' and id <> old.id;
    if remaining = 0 then
      raise exception '마지막 관리자입니다 — 다른 사람을 관리자로 올린 뒤에 바꿀 수 있습니다'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_last_admin on staff;
create trigger trg_guard_last_admin
  before update on staff
  for each row execute function public.guard_last_admin();

-- ── 확인 ────────────────────────────────────────────────────────────────────
-- 정책이 붙었는가
select tablename, policyname, cmd
  from pg_policies
 where tablename = 'staff'
 order by policyname;

-- 지금 활성 관리자는 몇 명인가 (0 이면 아무도 계정 화면에 못 들어간다)
select count(*) as active_admins from staff where role = 'admin' and status = 'active';

-- 누가 관리자인가
select name, email, role, status, last_login_at from staff order by role, name;
