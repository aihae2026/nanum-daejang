-- patch-20260908-rls-link-scope.sql — 권한 3단계: 링크(anon)는 "자기 건만" (2026-09-08 승희)
--
-- 왜 — 2단계(patch-20260907-rls-stage2.sql)에서 anon(후원자·배분처 링크)은 8테이블을 **전부** 읽을 수 있었다.
--   그래서 사이트 입구를 Cloudflare Access(이메일 인증)로 잠가 뒀는데, 브라우저마다 인증해야 하고
--   심사위원·실제 사용자는 명단에 넣을 수 없다. DB 가 스스로 잠기면 Access 를 떼도 된다.
--
-- 어떻게 — PostgREST 는 요청 헤더를 DB 안에서 읽을 수 있다(current_setting('request.headers')).
--   db.js 가 주소의 ?t=<토큰> 을 해시해 모든 요청에 x-link-token 으로 싣고(sbHeaders · 2026-09-08),
--   link_donation_ids() 가 그 해시로 access_link 를 찾아 건 번호를 돌려준다.
--   anon 정책은 전부 "그 건에 속한 행만" 으로 바뀐다. 조회 코드는 안 바뀐다 — DB 가 행을 거른다.
--   담당자(authenticated) 정책은 그대로(전권). 담당자가 링크를 열어도 Bearer 가 사용자 토큰이라 전권.
--
-- 실행 순서 ★ — db.js(sbHeaders) 가 dev 에 **먼저** 배포돼 있어야 한다. 아니면 후원자 링크가 0건을 본다.
--   ① main 푸시 → Cloudflare Pages ✅ 확인  ② 이 파일 실행(소유자)  ③ smoke-test-rls.mjs · dev 링크 한 바퀴  ④ Access 떼기(설정)
-- 되돌리기 — patch-20260907-rls-stage2.sql 의 2·3절을 다시 실행하면 2단계로 돌아간다.
--
-- 확인(실측 9/8) — rpc/link_donation_ids: 헤더 있음 → [donation_id] · 없음/틀림 → [] . CORS 로 x-link-token 허용됨.

-- ── 0. 갈림길 함수 (security definer — anon 이 access_link 를 못 봐도 여기서는 본다) ────────
create or replace function public.link_donation_ids() returns setof bigint
language sql stable security definer set search_path = public as $$
  select donation_id from access_link
  where token_hash = coalesce(
          nullif(current_setting('request.headers', true), '')::json ->> 'x-link-token',
          current_setting('request.header.x-link-token', true), '')
    and not revoked
    and (expires_at is null or expires_at > now())
$$;
revoke all on function public.link_donation_ids() from public;
grant execute on function public.link_donation_ids() to anon, authenticated;

-- 헤더의 해시 원문 — access_link 자기 행 정책용 (revoked·만료여도 "왜 못 여는지" 는 읽어야 한다)
create or replace function public.link_token_hash() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-link-token',
    current_setting('request.header.x-link-token', true), '')
$$;
grant execute on function public.link_token_hash() to anon, authenticated;

-- ── 1. 2단계 anon 정책 제거 ──────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['donation','distribution','checklist_item','attachment',
                           'form_submission','access_link','inspection','inspection_finding'] loop
    execute format('drop policy if exists "후원자_읽기_20260907" on %I', t);
    execute format('drop policy if exists "후원자_넣기_20260907" on %I', t);
    execute format('drop policy if exists "후원자_고치기_20260907" on %I', t);
  end loop;
end $$;

-- ── 2. 읽기 — 링크가 가리키는 건만 ─────────────────────────────
create policy "링크_읽기_20260908" on donation        for select to anon using (id in (select link_donation_ids()));
create policy "링크_읽기_20260908" on distribution    for select to anon using (donation_id in (select link_donation_ids()));
create policy "링크_읽기_20260908" on checklist_item  for select to anon using (donation_id in (select link_donation_ids()));
create policy "링크_읽기_20260908" on form_submission for select to anon using (donation_id in (select link_donation_ids()));
create policy "링크_읽기_20260908" on inspection      for select to anon using (donation_id in (select link_donation_ids()));
create policy "링크_읽기_20260908" on attachment      for select to anon
  using (checklist_item_id in (select id from checklist_item where donation_id in (select link_donation_ids())));
create policy "링크_읽기_20260908" on inspection_finding for select to anon
  using (inspection_id in (select id from inspection where donation_id in (select link_donation_ids())));
-- access_link 는 자기 행만 — 상태(revoked·used·expired)를 화면이 읽어 이유를 보여 준다
create policy "링크_읽기_20260908" on access_link     for select to anon using (token_hash = link_token_hash());

-- ── 3. 넣기 — 자기 건에만 ───────────────────────────────────────
create policy "링크_넣기_20260908" on form_submission for insert to anon with check (donation_id in (select link_donation_ids()));
create policy "링크_넣기_20260908" on checklist_item  for insert to anon with check (donation_id in (select link_donation_ids()));
create policy "링크_넣기_20260908" on attachment      for insert to anon
  with check (checklist_item_id in (select id from checklist_item where donation_id in (select link_donation_ids())));

-- ── 4. 고치기 — 자기 건만 · access_link 는 자기 행의 used_at·recipient_enc 만 ─────────
create policy "링크_고치기_20260908" on donation        for update to anon
  using (id in (select link_donation_ids())) with check (id in (select link_donation_ids()));
create policy "링크_고치기_20260908" on checklist_item  for update to anon
  using (donation_id in (select link_donation_ids())) with check (donation_id in (select link_donation_ids()));
create policy "링크_고치기_20260908" on form_submission for update to anon
  using (donation_id in (select link_donation_ids())) with check (donation_id in (select link_donation_ids()));
create policy "링크_고치기_20260908" on attachment      for update to anon
  using (checklist_item_id in (select id from checklist_item where donation_id in (select link_donation_ids())))
  with check (checklist_item_id in (select id from checklist_item where donation_id in (select link_donation_ids())));
create policy "링크_고치기_20260908" on access_link     for update to anon
  using (token_hash = link_token_hash()) with check (token_hash = link_token_hash());
-- markAccessLinkUsed 는 used_at 과 함께 recipient_enc 를 null 로 지운다(팀 결정 8/28 §2-⑦) — 2단계 grant 는 used_at 만이라 그 지우기가 anon 에서 막혀 있었다
revoke update on access_link from anon;
grant  update (used_at, recipient_enc) on access_link to anon;

-- ── 5. Storage — anon 읽기 제거 (후원자·기관 화면은 서명 URL 을 부르지 않는다 · 9/8 코드 확인) ──
--   올리기(attachments/·forms/)는 그대로. 읽기·목록은 담당자(authenticated)만.
drop policy if exists "후원자_읽기_20260907" on storage.objects;

-- ── 6. 확인 ────────────────────────────────────────────────────────
--  기대: anon 정책 이름이 전부 링크_*_20260908 · storage anon 은 INSERT 하나
select schemaname||'.'||tablename as t, policyname, cmd from pg_policies
  where schemaname in ('public','storage') and roles::text like '%anon%' order by 1,3,2;
