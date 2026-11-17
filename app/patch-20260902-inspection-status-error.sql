-- ============================================================================
-- 나눔대장 — 패치 2026-09-02: inspection.status 에 'error' 추가
--   drop 없음 · 여러 번 실행해도 안전 · 기존 데이터 유지
--
-- 왜 필요한가 (유진 · 타임아웃 작업 중 발견)
--   전에는 AI 호출이 실패하면 429 인지 아닌지만 보고, 아니면 전부 'timeout' 으로 적었다.
--   짐작이다 — 실제로 시간을 잰 적이 없었기 때문이다(끊는 코드 자체가 없었다).
--   2026-09-02 에 끊는 시간(60초)을 붙이면서 시간 초과를 '사실' 로 구분하게 됐고,
--   그러자 남는 것이 생겼다 — 서버 오류(500)·형식 오류 같은 '그 밖' 이다.
--   이것을 'timeout' 으로 적으면 "기다리면 됐을 것" 으로 읽혀 원인 추적이 어긋난다.
--
-- ⚠️ 이 패치를 실행하지 않으면
--   status='error' 인 insert 가 DB 에서 거부된다. 그런데 saveInspectionRun 은
--   저장 실패를 console 에만 적고 넘어간다(의도된 설계 · 인수인계 §2①).
--   즉 **판정 기록이 통째로 안 남는데 화면은 멀쩡해 보인다.**
--   그래서 db.js 에 임시 방어를 뒀다 — 허용값 밖이면 'timeout' 으로 낮추고 경고를 찍는다.
--   이 패치를 실행하면 그 방어는 조용해진다(값이 그대로 들어가므로).
--   ★ 실행 후 db.js 의 INSPECTION_STATUS 주석에서 이 문단을 지워도 된다.
--
-- 실행: Supabase SQL Editor 에 붙여넣고 Run · 30초
-- ============================================================================

alter table inspection drop constraint if exists inspection_status_check;

alter table inspection add constraint inspection_status_check
  check (status in ('success', 'timeout', 'quota', 'parse_error', 'error'));

comment on column inspection.status is
  'AI 호출 결과 — success | timeout(시간 안에 안 옴 · 실제로 재서 끊은 것) | '
  'quota(분당 한도 초과) | parse_error(규격 밖 값이 와서 판정을 강등) | error(그 밖: 서버 오류 등). '
  '"AI가 안 봤다"는 사실이 남아야 감사 때 방어가 된다(설계안 §3).';

-- 확인 — 다섯 값이 다 들어가는지
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'inspection'::regclass and conname = 'inspection_status_check';
