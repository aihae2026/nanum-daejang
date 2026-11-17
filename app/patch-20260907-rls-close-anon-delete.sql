-- ============================================================================
-- 나눔대장 — 패치 2026-09-07 (승희) : 권한 재작업 1단계 — anon 삭제 닫기
--   drop 없음(테이블) · 여러 번 실행해도 안전(if exists) · 기존 데이터 유지
--   ⚠️ 실행 뒤 (미공개 내부 기록) "DB 패치 실행 대장"에 한 줄 추가한다.
--
-- 왜 지금 하는가
--   9/4 purge 패치가 8개 테이블 + Storage 에 anon delete 정책을 열었다.
--   그런데 db.js 를 다 뒤져도 **행을 지우는 호출이 없다** — purge_donation() 도
--   update 만 한다(행은 감사 기록으로 남긴다). 즉 테이블 delete 정책은
--   앱이 한 번도 안 쓰는데 "키를 아는 누구나 전부 지울 수 있는" 구멍만 열어 둔 것이다.
--   → 테이블 delete 는 전부 닫는다. 앱 동작 영향 0.
--
-- Storage 실물 파일 삭제(sbDeleteFile · purgeDonation ③ 앞 단계)는 앱이 쓴다.
--   다만 파기 대상이 2027-06 이후에나 생기고(purge_candidates 0건), 로그인이
--   붙으면 담당자만 하게 되므로 지금 anon → authenticated 로 옮긴다.
--   ⚠️ 로그인(2단계)이 붙기 전까지 purgeDonation 은 파일 삭제에서 403 이 난다.
--     반쪽 파기 금지 규칙(파일 실패 → DB 파기 안 함) 덕에 기록만 지워지는 일은 없다.
--
-- 앱이 안 쓰는 권한도 함께 걷는다 (db.js 기준 · 2026-09-07 확인)
--   staff      : 읽기·넣기·고치기 호출 0건 → anon 정책 전부 제거 (로그인 붙일 때 다시)
--   audit_log  : 읽기 0건 · 고치기 0건 → 넣기만 남긴다 (pdf.view · bulk.download 기록용)
--                ★ 감사 기록은 "넣기만 되고 고치기·지우기는 안 되는" 것이 맞다.
--
-- 남겨 두는 것 (2단계 로그인 때 authenticated 로 옮긴다)
--   임시_읽기/넣기/고치기_20260901 (staff·audit_log 제외 8테이블) — 후원자 링크 화면이 anon 으로 쓴다
--   Storage 임시_업로드/임시_조회_20260901 — 첨부·신청서 PDF 올리기/열기
-- ============================================================================

-- ── 1. 테이블 delete 정책 8개 제거 ─────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['donation','distribution','checklist_item','attachment',
                           'form_submission','access_link','inspection','inspection_finding']
  loop
    execute format('drop policy if exists "파기_지우기_20260904" on %I', t);
  end loop;
end $$;

-- ── 2. staff — anon 정책 전부 제거 (RLS 는 켜진 채 → 아무도 못 읽는다) ──
drop policy if exists "임시_읽기_20260901"   on staff;
drop policy if exists "임시_넣기_20260901"   on staff;
drop policy if exists "임시_고치기_20260901" on staff;

-- ── 3. audit_log — 고치기 제거 ─────────────────────────────────
drop policy if exists "임시_고치기_20260901" on audit_log;

-- ── 3b. audit_log — 읽기 제거 ★ 코드 배포 뒤에만 실행 ─────────────
--   ⚠️ 실측(9/7): PostgREST 는 Prefer: return=representation 이면 넣은 행을 다시 읽어
--     돌려주므로 SELECT 정책이 없으면 insert 가 42501 로 실패한다. 그래서 읽기를 먼저
--     걷었더니 dev 에서 PDF 열람·ZIP 이 막혔다 → 즉시 복원했다.
--   순서: db.js sbPost(..., {minimal:true}) 가 main 에 배포된 것을 확인한 뒤 아래 한 줄.
-- drop policy if exists "임시_읽기_20260901"   on audit_log;

-- ── 4. Storage 파일 삭제 — anon → authenticated ────────────────
drop policy if exists "파기_파일지우기_20260904" on storage.objects;
create policy "파기_파일지우기_20260907"
  on storage.objects for delete to authenticated
  using (bucket_id = 'nanumdaejang-docs');   -- db.js STORAGE_BUCKET 과 같은 값

-- ── 5. 확인 — 남은 정책 목록 ─────────────────────────────────────
--  기대값: public 스키마에 delete 정책 0개 · staff 정책 0개 · audit_log 는 INSERT 1개
select tablename, policyname, cmd, roles
  from pg_policies
 where schemaname in ('public','storage')
 order by schemaname, tablename, cmd, policyname;
