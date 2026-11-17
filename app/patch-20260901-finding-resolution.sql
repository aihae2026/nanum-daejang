-- ============================================================================
-- 나눔대장 — 패치 2026-09-01: inspection_finding 에 사유 해소 3종 추가
--   drop 없음 · 여러 번 실행해도 안전(if not exists) · 기존 데이터 유지
--
-- 왜 필요한가 (연수 작업 · 선미 결정, 승희 부재 중)
--   E3(영리법인 시가 산정)는 지금 '확인 권장'을 띄우기만 하고 완결을 막지 않는다.
--   카드에 '사유 기재로 해소' 경로가 없어서, 막아버리면 정당한 사유가 있어도
--   담당자가 빠져나올 방법이 없기 때문이다 (rules-compare.js:75-77 주석).
--   해소 경로가 생기면 E3 의 blocksComplete 를 true 로 올린다.
--
--   체크리스트 항목(층 ① 슬롯 판정)에는 해소가 이미 있다 —
--   common.js 의 item.r.resolution = {reason, by, date} · screen-staff.js:1362 resolveItem().
--   그런데 대조 판정(층 ②)은 어느 서류 슬롯에도 속하지 않아(checklist_item_id = NULL)
--   그 자리를 쓸 수 없다. 그래서 판정 낱개인 이 테이블에 같은 모양으로 만든다.
--
-- 왜 건(donation) 단위가 아닌가 (2026-09-01 · 선미 결정)
--   한 건에 대조 판정이 E1·E2·E3·E7 여러 개 붙는다. 건 단위로 저장하면
--   '어느 판정을 해소한 것인지'가 사라진다. 판정 낱개에 붙어야 구분이 남는다.
--
-- 컬럼명 근거
--   체크리스트의 resolution{reason, by, date} 와 같은 모양 —
--   화면이 기존 resolveItem() 패턴을 그대로 쓸 수 있다.
--   감사 방어 3종(extracted_value · system_value · source_file) 바로 옆에
--   "담당자가 왜 넘어갔는지"가 같은 행에 남는다.
--
--   ※ resolved_by 는 text 다 (inspection.triggered_by 는 uuid → staff).
--     지금 화면이 '담당자' 문자열을 그대로 쓰고 있어 맞춘 것이며,
--     로그인이 붙을 때 staff(id) 참조로 옮길지 함께 정하면 된다.
-- ============================================================================

alter table inspection_finding
  add column if not exists resolution_reason text,
  add column if not exists resolved_by       text,
  add column if not exists resolved_at       date;

comment on column inspection_finding.resolution_reason is
  '해소 사유 — 담당자가 이 판정을 넘어간 이유. 값이 있으면 해소된 것으로 본다. '
  '완결 게이트를 통과시킨 근거라 감사 대상.';
comment on column inspection_finding.resolved_by is
  '해소한 담당자. 지금은 화면 표기 문자열, 로그인 붙으면 staff(id) 참조로 이관 검토.';
comment on column inspection_finding.resolved_at is
  '해소 일자. 판정 시각(created_at)과 별개 — 나중에 넘어간 것도 그대로 남는다.';

-- 확인 — 컬럼 3개가 감사 방어 3종 옆에 붙었는지
select id, rule_code, verdict,
       extracted_value, system_value, source_file,
       resolution_reason, resolved_by, resolved_at
from inspection_finding
order by id
limit 10;
