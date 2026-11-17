-- ============================================================================
-- 나눔대장 — 패치 2026-09-01: 최소 RLS (삭제만 막는다)
--   drop 없음 · 여러 번 실행해도 안전(drop policy if exists 후 재생성) · 기존 데이터 유지
--
-- 왜 지금 하는가 (2026-09-01 · 선미 결정, 승희 위임)
--   Cloudflare Access 로 dev 주소를 잠갔으나 pages.dev 로 우회되는 구멍이 발견됐다.
--   자물쇠는 "문마다" 거는 방식이라 문이 늘면 놓친다. 데이터 쪽에서 막아야 한다.
--
-- ★ 왜 "읽기만 열고 쓰기를 막는" 방식이 아닌가 (유진 제안 검토 결과)
--   앱이 쓰기에 의존한다 — db.js 확인:
--     · sbPost → inspection · inspection_finding (판정 저장·복원)
--     · sbPost → attachment (파일 업로드 기록)
--     · PATCH  → attachment (재제출 시 이전 건 내리기)
--     · Storage upload
--   9/8 기준선이 "1건이 접수→검수→완결→다운로드까지 실제로 돈다" 인데
--   그 흐름이 전부 쓰기다. 쓰기를 막으면 시연 자체가 안 된다.
--
-- ★ 그래서 무엇을 막는가 — DELETE
--   db.js 전체에 DELETE 호출이 없다 (POST · PATCH · Storage upload 뿐).
--   즉 삭제를 막아도 앱은 100% 그대로 돈다.
--   대신 최악의 시나리오("누가 데이터를 통째로 지운다")가 사라진다.
--   시연 직전 데이터 전멸은 복구 시간이 없어 가장 치명적이다.
--
-- ★ 한계 — 솔직히 적어둔다
--   로그인이 없어 모두가 anon 이다. 그래서 앱에 허용한 것은 공격자에게도 허용된다.
--   값을 넣거나 고치는 것은 여전히 가능하다. 그건 seed 재실행으로 복구된다.
--   진짜 방어는 담당자 로그인(Supabase Auth) + authenticated 기준 정책이며,
--   승희 복귀(9/7) 후 과제다. 이 패치는 그때 지우고 다시 짠다.
--
-- Storage 는 손대지 않는다 — 임시_업로드(insert)·임시_조회(select) 2개뿐이라
--   이미 삭제 정책이 없다. 즉 파일 삭제도 이미 막혀 있다.
-- ============================================================================

-- ── 1. RLS 켜기 (10개 테이블) ────────────────────────────────
alter table donation           enable row level security;
alter table distribution       enable row level security;
alter table checklist_item     enable row level security;
alter table attachment         enable row level security;
alter table form_submission    enable row level security;
alter table staff              enable row level security;
alter table access_link        enable row level security;
alter table audit_log          enable row level security;
alter table inspection         enable row level security;
alter table inspection_finding enable row level security;

-- ── 2. anon 에게 읽기·넣기·고치기 허용 (삭제는 정책을 만들지 않는다) ──
--    RLS 는 정책이 없는 동작을 기본 거부한다 → delete 정책 부재 = 삭제 불가
do $$
declare t text;
begin
  foreach t in array array[
    'donation','distribution','checklist_item','attachment','form_submission',
    'staff','access_link','audit_log','inspection','inspection_finding'
  ] loop
    execute format('drop policy if exists "임시_읽기_20260901" on %I', t);
    execute format('drop policy if exists "임시_넣기_20260901" on %I', t);
    execute format('drop policy if exists "임시_고치기_20260901" on %I', t);

    execute format('create policy "임시_읽기_20260901"   on %I for select to anon using (true)', t);
    execute format('create policy "임시_넣기_20260901"   on %I for insert to anon with check (true)', t);
    execute format('create policy "임시_고치기_20260901" on %I for update to anon using (true) with check (true)', t);
  end loop;
end $$;

-- ── 3. 확인 — rowsecurity 가 전부 true 인가 ──────────────────
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
