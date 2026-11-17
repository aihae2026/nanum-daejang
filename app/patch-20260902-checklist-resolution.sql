-- ============================================================================
-- 나눔대장 — 패치 2026-09-02: checklist_item 에 사유 해소 3종 추가
--   drop 없음 · 여러 번 실행해도 안전(if not exists) · 기존 데이터 유지
--
-- 왜 필요한가 (유진 · checklist_item 저장 붙이다 발견)
--   화면에는 항목 사유 해소가 이미 있다 — item.r.resolution{reason, by, date}
--   (common.js · screen-staff.js resolveItem). 그런데 **담을 칸이 DB 에 없다.**
--   그래서 저장하면 상태가 세 값으로 뭉개진다:
--     미수취 · 수취완료 · 확인필요
--
--   ⚠️ '사유해소' 를 '수취완료' 로 적으면 감사에서 거짓말이 된다 —
--     서류를 실제로 받은 것과, 사유를 적고 넘어간 것은 다르다.
--     '확인필요' 로 적으면 새로고침할 때마다 완결 게이트가 다시 막힌다
--     (담당자가 사유를 몇 번이고 다시 적게 된다).
--   → 둘 다 틀렸다. 칸을 만드는 것이 맞다.
--
--   2026-09-01 patch(inspection_finding) 와 **같은 모양**으로 만든다.
--   그 패치 주석이 "체크리스트의 resolution{reason, by, date} 와 같은 모양" 이라고
--   적으면서 정작 체크리스트 쪽은 화면 메모리에만 있었다. 이제 맞춘다.
--
-- ⚠️ 이 패치를 실행하지 않으면
--   항목 사유 해소가 새로고침에 사라진다. 담당자는 사유를 적고 완결했는데
--   다시 열면 '확인필요' 로 돌아가 있다.
--
-- 실행: Supabase SQL Editor 에 붙여넣고 Run · 30초
-- ============================================================================

alter table checklist_item
  add column if not exists resolution_reason text,
  add column if not exists resolved_by       text,
  add column if not exists resolved_at       date;

comment on column checklist_item.resolution_reason is
  '해소 사유 — 담당자가 이 항목을 넘어간 이유. 값이 있으면 화면에서 "사유해소" 로 뜬다. '
  '★ status 는 그대로 둔다(미수취/확인필요) — 실제로 받은 것과 넘어간 것을 구분하기 위해서다. '
  '완결 게이트를 통과시킨 근거라 감사 대상.';
comment on column checklist_item.resolved_by is
  '해소한 담당자. 로그인이 붙으면 staff(id) 참조로 이관 검토 (inspection_finding 과 같은 판단).';
comment on column checklist_item.resolved_at is '해소 일자.';

-- 확인
select id, doc_key, status, resolution_reason, resolved_by, resolved_at
from checklist_item
order by id
limit 10;
