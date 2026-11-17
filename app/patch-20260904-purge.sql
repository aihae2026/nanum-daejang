-- ============================================================================
-- 나눔대장 — 패치 2026-09-04: 파기 수단을 붙인다 (삭제 차단 해제 + 파기 예정일)
--   drop 없음 · 여러 번 실행해도 안전 · 기존 데이터 유지
--
-- ★ 왜 지금 하는가 — 2026-09-04 코칭 후 결정
--   결정 원문:
--     · "우리 플랫폼 내 신청서 폼 및 증빙서류 보관기간은 1년으로 한다"
--     · "파기는 원래 정한대로 한다. 감사 방어로 삭제를 아예 막아둔 것은 풀어야 함.
--        (파기 시점에는 삭제할 수 있도록 하고 삭제 기록만 남으면 됨)"
--
--   9/1 패치(patch-20260901-rls-minimal.sql)는 delete 정책을 **일부러** 만들지 않았다.
--   RLS 는 정책이 없는 동작을 거부하므로 그것만으로 삭제가 막혔다 — 시연 직전
--   데이터 전멸을 막는 것이 목적이었고, 그 목적으로는 맞는 설계였다.
--   그런데 그 결과 **파기 의무를 지킬 수 없는 상태**가 되었다:
--     "익년 말까지 보관 후 파기합니다" 라고 고지할 예정인데 지울 방법이 없었다
--     (10-planning/consent-text-draft-20260903.md §5 · privacy-inventory §4).
--   개인정보 파기는 법정 의무다. 그래서 삭제를 열고,
--   **누가 언제 무엇을 지웠는지 기록**을 남기는 쪽으로 간다.
--
-- ★ 무엇이 바뀌나 (셋)
--   1. delete 정책을 만든다 — DB 행 · Storage 파일 둘 다
--   2. purge_due(파기 예정일)를 **기부일자 + 1년** 으로 자동으로 채운다
--   3. 파기 실행 함수 purge_donation() 을 만든다 — 지우고 audit_log 에 남긴다
--
-- ★ 보관 기간이 왜 '기부일자 + 1년' 인가
--   전 설계는 '완결 익년 12/31' 이었다(schema.sql 주석). 9/4 결정으로 바뀐다.
--   기산점을 기부일자로 잡은 이유 — 재단 개인정보처리방침이 "기부일자로부터 5년"
--   이라 **기산점이 같아야 설명이 한 줄로 된다**:
--     "재단은 기부일자로부터 5년, 나눔대장은 기부일자로부터 1년.
--      1년 뒤 나눔대장에서는 지우고, 그 뒤로는 재단 후원관리시스템에서 보관한다."
--   ⚠️ 그래서 이 플랫폼의 파기는 '보존 의무 종료' 가 아니라 **이관 후 사본 삭제**다.
--     재단 시스템으로 옮겨진 뒤에 지우는 것이므로 법정 보존과 충돌하지 않는다.
--
-- ⚠️ 한계 — 솔직히 적어둔다 (9/1 패치와 같은 한계다)
--   로그인이 없어 모두가 anon 이다. 즉 삭제를 열면 **공격자에게도 열린다.**
--   9/1 에 삭제를 막은 이유가 이것이었다. 그리고 같은 날 **백업도 두지 않기로** 정했다
--   (9/4 결정 1 — "백업은 별도로 설정하지 않는다"). 그래서 상쇄 수단은 하나뿐이다:
--     · 기록 — 지운 것은 audit_log 에 'purge.execute' 로 남는다 (지운 파일 키까지)
--   ⚠️ **되돌릴 백업이 없다.** 사고가 나면 복구할 수 없고, 심사 기간(9/28~10/2)
--      열흘은 아무도 손댈 수 없다. 이건 알고 받아들인 위험이다 —
--      백업이 없으면 "파기 완료" 기록과 사실이 어긋날 자리도 없기 때문이다.
--   ★ 2026-11-10 (오픈소스 점검 §4-3) — '백업 없음' 은 운영 기본값이다. backup-live.mjs 로 받은 수동 백업이
--      있으면 파기한 건이 그 파일에 남으므로, 파기 때 그 백업도 함께 정리해야 위 기록과 사실이 맞는다.
--   진짜 방어는 담당자 로그인(Supabase Auth) + authenticated 기준 정책이며
--   승희 복귀(9/7) RLS 재작업 때 이 패치도 함께 다시 짠다. 그때 anon 삭제는 닫는다.
-- ============================================================================


-- ── 1. 삭제를 연다 — DB 행 ────────────────────────────────────
--    ★ 전부 여는 것이 아니다. 파기 대상 테이블만 연다.
--      staff(재단 담당자)·audit_log(감사 기록)는 열지 않는다 —
--      파기 기록 자체가 지워지면 "지웠다는 사실" 을 증명할 수 없다.
do $$
declare t text;
begin
  foreach t in array array[
    'donation','distribution','checklist_item','attachment','form_submission',
    'access_link','inspection','inspection_finding'
  ] loop
    execute format('drop policy if exists "파기_지우기_20260904" on %I', t);
    execute format('create policy "파기_지우기_20260904" on %I for delete to anon using (true)', t);
  end loop;
end $$;

-- ── 2. 삭제를 연다 — Storage 파일 ─────────────────────────────
--    실물 파일이 여기 있다. 행만 지우고 파일이 남으면 파기가 아니다.
drop policy if exists "파기_파일지우기_20260904" on storage.objects;
create policy "파기_파일지우기_20260904"
  on storage.objects for delete to anon
  using (bucket_id = 'nanumdaejang-docs');


-- ── 3. 파기 예정일 — 기부일자 + 1년 ───────────────────────────
--    ⚠️ 기부일자(donation_date)는 신청서의 후원일자 칸이고, 비어 있을 수 있다.
--      비면 접수일(in_date)로, 그것도 없으면 생성일로 물러선다 —
--      **기준을 못 정해서 파기 예정일이 비는 상태를 만들지 않는다.**
--      비어 있으면 파기 대상 조회에서 통째로 빠지고, 그건 조용한 실패다.
create or replace function set_purge_due()
returns trigger language plpgsql as $$
begin
  new.purge_due := (coalesce(new.donation_date, new.in_date, current_date) + interval '1 year')::date;
  return new;
end $$;

drop trigger if exists trg_purge_due on donation;
create trigger trg_purge_due
  before insert or update of donation_date, in_date on donation
  for each row execute function set_purge_due();

-- 이미 들어와 있는 건도 채운다 (트리거는 앞으로 들어올 것만 본다)
update donation
   set purge_due = (coalesce(donation_date, in_date, created_at::date) + interval '1 year')::date
 where purge_due is null;


-- ── 4. 파기 실행 — 지우고 기록을 남긴다 ───────────────────────
--    ★ 무엇을 지우고 무엇을 남기는가 (privacy-design §4 · 원래 설계 그대로)
--      지운다 : Storage 실물 파일 · form_submission.payload(폼 입력값)
--      남긴다 : donation/checklist_item/attachment 의 **행** — 무슨 서류가 언제
--               제출되고 왜 반려됐는지는 개인정보가 아니라 감사 기록이다.
--      ⚠️ attachment.file_name 은 지운다 — 원본 파일명에 이름이 들어온다
--        ('물품기부신청서_OO희.png' · 9/3 실표본 확인 · privacy-inventory §5-가).
--        지운 자리는 '(파기됨)' 으로 채워 담당자 화면이 빈칸으로 깨지지 않게 한다.
--
--    ⚠️ 이 함수는 **DB 쪽만** 한다. Storage 실물 파일 삭제는 SQL 에서 못 한다 —
--      호출하는 쪽(db.js purgeDonation)이 파일을 먼저 지우고 이 함수를 부른다.
--      순서가 중요하다: 파일부터 지운다. 반대로 하면 storage_key 를 잃어버려
--      파일이 영영 남는다(고아 파일).
create or replace function purge_donation(p_donation_id bigint, p_actor text default 'system')
returns table (purged_attachments int, purged_forms int)
language plpgsql as $$
declare
  n_att int := 0;
  n_form int := 0;
  v_keys text[];
begin
  -- 지울 파일 목록을 기록용으로 먼저 모은다 (첨부 + 신청서 PDF)
  --   ⚠️ pdf_key 를 빠뜨리면 안 된다 — schema 주석대로 "개인정보가 들어있는 유일한 곳" 이다.
  --     첨부만 지우고 이걸 남기면 이름·주민번호·서명이 그대로 남는다.
  select coalesce(array_agg(k), '{}') into v_keys from (
    select a.storage_key as k
      from attachment a
      join checklist_item ci on ci.id = a.checklist_item_id
     where ci.donation_id = p_donation_id and a.purged_at is null
    union all
    select fs.pdf_key
      from form_submission fs
     where fs.donation_id = p_donation_id and fs.purged_at is null and fs.pdf_key is not null
  ) t;

  update attachment a
     set purged_at = now(),
         file_name = '(파기됨)'
    from checklist_item ci
   where ci.id = a.checklist_item_id
     and ci.donation_id = p_donation_id
     and a.purged_at is null;
  get diagnostics n_att = row_count;

  update form_submission
     set payload = '{}'::jsonb,
         pdf_key = null,          -- ★ 개인정보가 든 유일한 파일 — 가리키는 키까지 지운다
         purged_at = now()
   where donation_id = p_donation_id
     and purged_at is null;
  get diagnostics n_form = row_count;

  update donation set purged_at = now() where id = p_donation_id;

  -- ★ 삭제 기록 — 결정 원문의 "삭제 기록만 남으면 됨" 이 이 줄이다
  insert into audit_log (actor_type, actor_ref, action, target_type, target_id, after_value)
  values ('system', p_actor, 'purge.execute', 'donation', p_donation_id::text,
          jsonb_build_object('attachments', n_att, 'forms', n_form, 'storage_keys', v_keys));

  purged_attachments := n_att;
  purged_forms := n_form;
  return next;
end $$;


-- ── 5. 파기 대상 조회 — 오늘 기준으로 기한이 지난 건 ──────────
create or replace view purge_candidates as
  select d.id, d.case_no, d.donation_date, d.in_date, d.purge_due, d.completed_at,
         (current_date - d.purge_due) as days_overdue
    from donation d
   where d.purged_at is null
     and d.purge_due is not null
     and d.purge_due <= current_date
   order by d.purge_due;


-- ── 6. 확인 ───────────────────────────────────────────────────
select 'delete 정책' as 구분, tablename, policyname
  from pg_policies
 where schemaname = 'public' and cmd = 'DELETE'
 order by tablename;

select 'purge_due 미설정' as 구분, count(*) as 건수
  from donation where purge_due is null;

select 'purge_due 분포' as 구분, min(purge_due) as 가장이른, max(purge_due) as 가장늦은
  from donation;
