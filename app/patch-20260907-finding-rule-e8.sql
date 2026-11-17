-- ============================================================================
-- 나눔대장 — 패치 2026-09-07: inspection_finding.rule_code 에 'E8' 추가
--   drop → add · 여러 번 실행해도 안전 · 기존 데이터 유지
--
-- 왜 필요한가 (연수 · 9/7 실주행 #225 에서 콘솔로 발견)
--   E8("사진 자리에 사진이 아닌 것이 왔다")은 2026-09-03 에 신설됐는데
--   **DB 제약은 E1~E7 그대로였다.** 규칙을 코드에만 추가하고 DB 를 안 고친 것이다.
--
-- ⚠️ 무엇이 일어나고 있었나 — 이 저장소가 제일 경계하는 모양이다
--   E8 판정이 하나라도 끼면 그 건의 **판정 저장이 통째로 400 으로 거부된다**
--   (findings 를 한 번에 insert 하므로 한 줄이 막으면 전부 안 들어간다).
--   그런데 saveInspectionRun 은 저장 실패를 console 에만 적고 넘어간다(의도된 설계).
--   → **화면에는 판정이 멀쩡히 뜨는데 DB 에는 한 줄도 안 남는다.**
--     담당자는 판정을 보고 처리했는데 새로고침하면 사라지고, 감사 기록에도 없다.
--   #225 실주행 콘솔:
--     [DB] 검수 판정 저장 실패 (화면 표시는 정상): HTTP 400 —
--     {"code":"23514", "message":"new row for relation \"inspection_finding\"
--      violates check constraint \"inspection_finding_rule_code_check\""}
--
--   ★ patch-20260902-inspection-status-error.sql 과 **같은 자리**다.
--     그때는 status 에 'error' 가 없어서 같은 일이 났다. rule_code 는 안 고쳤다.
--
-- ★ 이 패치를 안 돌려도 판정은 이제 저장된다 — db.js safeRuleCode() 가
--   허용값 밖이면 NULL(=슬롯 판정)로 낮추고 경고를 찍는다. 기록이 통째로 사라지는 것보다 낫다.
--   다만 그러면 "E8 이었다" 는 사실이 rule_code 에서 사라지고 reason 에만 남는다.
--   **이 패치를 돌려야 E8 이 E8 로 남는다.**
--
-- 실행: Supabase SQL Editor 에 붙여넣고 Run · 30초
-- ============================================================================

alter table inspection_finding drop constraint if exists inspection_finding_rule_code_check;

alter table inspection_finding add constraint inspection_finding_rule_code_check
  check (rule_code in ('E1','E2','E3','E4','E5','E6','E7','E8'));

comment on column inspection_finding.rule_code is
  '루브릭 규칙 번호 E1~E8 · NULL = 슬롯 판정(대조 규칙이 아닌 것). '
  'E8 은 2026-09-03 신설(사진 자리에 사진이 아닌 것이 왔다) — 2026-09-07 에 제약에 추가했다.';

-- 확인 — 여덟 값이 다 들어가는지
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'inspection_finding'::regclass
  and conname = 'inspection_finding_rule_code_check';
