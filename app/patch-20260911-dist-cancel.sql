-- ============================================================================
-- 나눔대장 — 패치 2026-09-11: 배분건 취소·수정
--   drop 없음 · 여러 번 실행해도 안전 · 기존 데이터 유지
--
-- ★ 왜 필요한가
--   확정한 배분 수량을 고치거나 취소하는 경로가 **아예 없었다.**
--   배분결정 카드는 남은 수량이 0 이 되면 사라지고(screen-staff.js:1456)
--   카드 안에는 [기관 추가] 뿐이다. 그래서 틀린 배분이 하나 박히면
--   E7(SUM(qty) = donation.qty)이 완결을 계속 막아 **그 건은 완결이 영영 안 된다.**
--   기관에 250 주기로 했다가 200 으로 바뀌는 것은 실무에서 흔한 일인데,
--   지금은 건을 새로 만드는 것 말고 길이 없었다(2026-09-11 선미 · G13 실측에서 드러남).
--
-- ★ 정한 것 (2026-09-11 선미 · 미공개 내부 기록)
--   · 권한은 **담당자**. 관리자가 모든 건을 다 볼 수 없으니 그 건을 아는 사람이 쥔다.
--   · **증빙 수취 확정 전** → 수량 수정·취소 가능
--     **수취 확정된 뒤** → 수정·취소·부분취소 모두 불가 (물품이 이미 간 상태다)
--   · 잠기는 시점은 '제출' 이 아니라 **'수취 확정'** — 배분처가 엉뚱한 인수증을
--     잘못 올린 경우를 담당자가 바로잡을 길을 남긴다.
--   · **취소는 행을 지우지 않는다** — 언제 누가 왜 취소했는지가 남아야 한다.
--     access_link 무효화와 같은 규칙이다(db.js revokeAccessLink 주석).
--
-- ★ 무엇을 바꾸나 — 컬럼 셋과 제약 하나뿐이다.
--   state 에 '배분 취소' 를 더하지 않았다. state_check 를 갈아야 하고,
--   '취소됨' 은 진행 단계가 아니라 **그 행이 살아 있는가**의 문제라 축이 다르다.
--   E7 합계에서 빼는 판단도 cancelled_at IS NULL 하나로 끝난다.
--
-- ⚠️ RLS 는 건드리지 않는다 — distribution 의 "담당자_고치기_20260907"
--   (to authenticated · using true · with check true)이 이미 update 를 연다.
--   담당자 권한 안에서 도는 일이라 새 정책이 필요 없다.
--
-- ⚠️ '수취 확정 전에만' 은 **화면과 앱 규칙이 지킨다**(screen-staff.js distLocked).
--   DB 로 막으려면 checklist_item 을 보는 트리거가 필요한데, 항목 상태가
--   화면 규칙(itemStatus)과 DB 컬럼 양쪽에 걸쳐 있어 이번에 넣지 않았다.
--   → 다음 차례. 지금은 앱을 우회하면 수취 뒤에도 취소가 된다.
-- ============================================================================

-- ── 1. 컬럼 ─────────────────────────────────────────────────────────────────
alter table distribution add column if not exists cancelled_at  timestamptz;
alter table distribution add column if not exists cancel_reason text;
alter table distribution add column if not exists cancelled_by  uuid;

comment on column distribution.cancelled_at  is
  '취소 시각. NULL 이면 살아 있는 배분이다 — E7 합계는 이 값이 NULL 인 행만 더한다';
comment on column distribution.cancel_reason is
  '취소 사유(필수). 지우지 않고 남기는 이유가 이것이다 — 감사 때 왜 물렸는지 설명할 수 있어야 한다';
comment on column distribution.cancelled_by  is
  '취소한 담당자 uuid (auth.users.id)';

-- ── 2. 사유 없는 취소를 막는다 ──────────────────────────────────────────────
-- ★ 사유를 선택으로 두면 비워 두는 쪽이 짧아서 아무도 안 적는다.
--   "지우지 않는다" 는 규칙은 사유가 없으면 절반만 지켜진다.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'distribution_cancel_reason_required') then
    alter table distribution add constraint distribution_cancel_reason_required
      check (cancelled_at is null or (cancel_reason is not null and btrim(cancel_reason) <> ''));
  end if;
end $$;

-- ── 3. 살아 있는 배분만 빨리 찾기 ───────────────────────────────────────────
-- E7 은 건마다 SUM(qty) 를 낸다 — 취소된 행을 매번 걸러야 하므로 부분 인덱스를 둔다.
create index if not exists distribution_live_idx
  on distribution (donation_id) where cancelled_at is null;

-- ── 확인 ────────────────────────────────────────────────────────────────────
-- select id, donation_id, org_name, qty, cancelled_at, cancel_reason
--   from distribution where cancelled_at is not null order by cancelled_at desc;
