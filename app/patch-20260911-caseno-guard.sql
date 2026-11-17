-- ============================================================================
-- 나눔대장 — 패치 2026-09-11 (넷째): 접수번호(case_no) 배정을 DB 가 최종 결정한다
--   drop 없음(트리거 재생성만) · 여러 번 실행해도 안전 · 기존 데이터 유지
--
-- ★ 왜 — 접수번호는 화면(브라우저 메모리)이 정해 왔다(nextCaseNo · 9/3 임시 설계). 동료 테스트로 여러 명이
--   동시에 접수하자 낡은 목록으로 남이 방금 쓴 번호를 다시 집어 23505 duplicate key 가 났다(#288 · 12:37 선미).
--   화면 쪽은 발급 순간 DB 번호를 다시 읽고 1회 재시도하게 고쳤지만(db.js createDonation · eaf6ee6),
--   두 사람이 같은 0.1초에 누르면 그래도 겹칠 수 있다. 그 마지막 창을 DB 가 닫는다.
--
-- ★ 무엇 — before insert 트리거. 들어오는 case_no 가 숫자이고 이미 있으면, **배정 창구 잠금**(advisory lock)을
--   잡은 채 원래 번호에서 위로 첫 빈 번호로 바꿔 저장한다. 잠금은 번호 하나 정하는 밀리초 동안만 걸리고
--   insert 때만 돈다 — 검수·배분·업로드에는 영향 없다. 화면은 저장 응답의 case_no 를 읽어 다르면 옮긴다
--   (db.js insertDonationRow → renumberCase). 숫자가 아닌 번호(검사용 표기 등)는 건드리지 않는다.
--   맨 뒤에는 원래의 unique 제약(donation_case_no_key)이 그대로 남아 이중 방어다.
--   security definer: RLS 로 다른 담당자 행이 안 보이는 역할이 넣어도 겹침 검사가 전체를 본다.
-- ============================================================================
create or replace function donation_case_no_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if new.case_no is null or new.case_no !~ '^[0-9]+$' then
    return new;
  end if;
  -- 배정 창구를 하나로 — 동시에 들어온 insert 는 여기서 줄을 선다 (트랜잭션 끝나면 풀림)
  perform pg_advisory_xact_lock(hashtext('donation_case_no'));
  if not exists (select 1 from donation where case_no = new.case_no) then
    return new;
  end if;
  n := new.case_no::int + 1;
  while exists (select 1 from donation where case_no = n::text) loop
    n := n + 1;
  end loop;
  new.case_no := n::text;
  return new;
end $$;

drop trigger if exists donation_case_no_guard on donation;
create trigger donation_case_no_guard
  before insert on donation
  for each row execute function donation_case_no_guard();

-- 확인
--   select tgname, tgenabled from pg_trigger where tgname = 'donation_case_no_guard';
--   (실측) 같은 case_no 로 두 번 insert → 두 번째 행의 case_no 가 +1 로 저장되고 23505 가 안 난다
