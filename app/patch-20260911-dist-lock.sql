-- ============================================================================
-- 나눔대장 — 패치 2026-09-11 (둘째): 배분 잠금을 DB 에서도 강제한다
--   drop 없음 · 여러 번 실행해도 안전 · 기존 데이터 유지
--
-- ★ 왜 — patch-20260911-dist-cancel 은 "증빙 수취 확정 전에만 수정·취소" 를 **앱 규칙**으로만
--   지켰다(screen-staff.js distLocked). 앱을 우회하면(REST 직접 호출) 수취 뒤에도 취소가 됐다.
--   물품이 이미 간 배분의 기록을 무르는 일이라 DB 가 막아야 한다.
--
-- ★ 무엇 — distribution 의 qty 를 바꾸거나 cancelled_at 을 새로 찍는 UPDATE 는,
--   그 배분처의 checklist_item 에 status='수취완료' 가 하나라도 있으면 거부한다.
--   (checklist_item.status 는 담당자 확정값 전용이다 — AI 는 쓰지 않는다 · db.js COL 주석)
-- ============================================================================
create or replace function distribution_lock_after_receipt() returns trigger
language plpgsql as $$
begin
  if (new.qty is distinct from old.qty)
     or (new.cancelled_at is not null and old.cancelled_at is null) then
    if exists (select 1 from checklist_item ci
                where ci.distribution_id = old.id and ci.status = '수취완료') then
      raise exception '배분 #% 은 증빙을 수취 확정한 뒤라 수정·취소할 수 없습니다', old.id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists distribution_lock_after_receipt on distribution;
create trigger distribution_lock_after_receipt
  before update on distribution
  for each row execute function distribution_lock_after_receipt();

-- 확인
select tgname, tgenabled from pg_trigger where tgname = 'distribution_lock_after_receipt';
