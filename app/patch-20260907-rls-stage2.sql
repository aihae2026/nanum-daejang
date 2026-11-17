-- ============================================================================
-- 나눔대장 — 패치 2026-09-07 (승희) : 권한 2단계 — 임시_* 걷고 anon / authenticated 로 다시
--   여러 번 실행해도 안전(drop if exists 후 재생성) · 기존 데이터 유지
--   ★ 실행 조건 (셋 다 돼야 한다 — 하나라도 안 되면 dev 담당자 화면이 멈춘다)
--     ① Supabase Auth 에 담당자 계정이 있고 staff 행이 auth uid 로 연결돼 있다
--     ② 로그인 코드(db.js sbBearer · common.js authWall)가 dev 에 배포돼 있다
--     ③ dev 에서 실제로 로그인 → PDF 열람 → ZIP → 링크 발급 한 바퀴가 됐다
--   실행 뒤: smoke-test-rls.mjs 를 2단계 기대값으로 갱신 · 패치 실행 대장(미공개 내부 기록)에 한 줄
--
-- 설계: 10-planning/login-rls-stage2-20260907.md §3
--   담당자(authenticated)  : 8테이블 읽기·넣기·고치기 · audit_log 넣기 · staff 읽기 · Storage 읽기·올리기·지우기
--   후원자(anon · 링크 ?t=): 8테이블 읽기(loadCasesFromSupabase 가 전체를 읽는다 — 토큰 단위 좁히기는 본선 뒤)
--                           attachment·form_submission·checklist_item 넣기
--                           donation·checklist_item·form_submission·attachment 고치기
--                           access_link 는 used_at 한 칸만 고치기(markAccessLinkUsed) — 컬럼 grant 로 좁힌다
--                           Storage attachments/ · forms/ 올리기 · 읽기(서명 URL)
--   delete 는 어디에도 없다(파기 = purge_donation() update + Storage delete(authenticated))
--   ★ 신청서 PDF 두 자리: Storage forms/ 올리기(anon·authenticated) + audit_log 넣기(authenticated) — 빠지면 PDF 저장 실패·열람 불가
-- ============================================================================

-- ── 0. 임시 정책 전부 제거 (10 테이블 + Storage) ──────────────────
do $$
declare t text;
begin
  foreach t in array array['donation','distribution','checklist_item','attachment','form_submission',
                           'staff','access_link','audit_log','inspection','inspection_finding']
  loop
    execute format('drop policy if exists "임시_읽기_20260901"   on %I', t);
    execute format('drop policy if exists "임시_넣기_20260901"   on %I', t);
    execute format('drop policy if exists "임시_고치기_20260901" on %I', t);
  end loop;
end $$;
drop policy if exists "임시_업로드_20260901" on storage.objects;
drop policy if exists "임시_조회_20260901"   on storage.objects;

-- ── 1. 담당자(authenticated) — 8테이블 읽기·넣기·고치기 ─────────────
do $$
declare t text;
begin
  foreach t in array array['donation','distribution','checklist_item','attachment',
                           'form_submission','access_link','inspection','inspection_finding']
  loop
    execute format('drop policy if exists "담당자_읽기_20260907"   on %I', t);
    execute format('drop policy if exists "담당자_넣기_20260907"   on %I', t);
    execute format('drop policy if exists "담당자_고치기_20260907" on %I', t);
    execute format('create policy "담당자_읽기_20260907"   on %I for select to authenticated using (true)', t);
    execute format('create policy "담당자_넣기_20260907"   on %I for insert to authenticated with check (true)', t);
    execute format('create policy "담당자_고치기_20260907" on %I for update to authenticated using (true) with check (true)', t);
  end loop;
end $$;
drop policy if exists "담당자_넣기_20260907" on audit_log;
create policy "담당자_넣기_20260907" on audit_log for insert to authenticated with check (true);
drop policy if exists "담당자_읽기_20260907" on staff;
create policy "담당자_읽기_20260907" on staff for select to authenticated using (true);   -- 4명뿐 · 이름 표시용

-- ── 2. 후원자(anon · 링크) ────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['donation','distribution','checklist_item','attachment',
                           'form_submission','access_link','inspection','inspection_finding']
  loop
    execute format('drop policy if exists "후원자_읽기_20260907" on %I', t);
    execute format('create policy "후원자_읽기_20260907" on %I for select to anon using (true)', t);
  end loop;
  foreach t in array array['attachment','form_submission','checklist_item'] loop
    execute format('drop policy if exists "후원자_넣기_20260907" on %I', t);
    execute format('create policy "후원자_넣기_20260907" on %I for insert to anon with check (true)', t);
  end loop;
  foreach t in array array['donation','checklist_item','form_submission','attachment','access_link'] loop
    execute format('drop policy if exists "후원자_고치기_20260907" on %I', t);
    execute format('create policy "후원자_고치기_20260907" on %I for update to anon using (true) with check (true)', t);
  end loop;
end $$;
-- access_link 는 anon 이 used_at 만 고친다 — 컬럼 단위 grant (revoked·expires_at 은 못 건드린다)
revoke update on access_link from anon;
grant  update (used_at) on access_link to anon;

-- ── 3. Storage (bucket nanumdaejang-docs) ───────────────────────────
drop policy if exists "후원자_올리기_20260907" on storage.objects;
create policy "후원자_올리기_20260907" on storage.objects for insert to anon
  with check (bucket_id = 'nanumdaejang-docs' and (name like 'attachments/%' or name like 'forms/%'));
drop policy if exists "후원자_읽기_20260907" on storage.objects;
create policy "후원자_읽기_20260907" on storage.objects for select to anon
  using (bucket_id = 'nanumdaejang-docs');
drop policy if exists "담당자_읽기_20260907" on storage.objects;
create policy "담당자_읽기_20260907" on storage.objects for select to authenticated
  using (bucket_id = 'nanumdaejang-docs');
drop policy if exists "담당자_올리기_20260907" on storage.objects;
create policy "담당자_올리기_20260907" on storage.objects for insert to authenticated
  with check (bucket_id = 'nanumdaejang-docs');
-- delete 는 1단계의 "파기_파일지우기_20260907"(authenticated) 그대로

-- ── 4. 확인 ────────────────────────────────────────────────────────
--  기대: 임시_* 0개 · public delete 0개 · anon 정책이 inspection/distribution/access_link 에 select(+access_link update)뿐
select schemaname||'.'||tablename as t, cmd, roles::text, policyname
  from pg_policies where schemaname in ('public','storage') order by 1,2,3;
