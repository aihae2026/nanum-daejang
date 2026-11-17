-- ============================================================================
-- 나눔대장 — 패치 2026-08-31: doc_key 표기 통일
--   drop 없음 · 여러 번 실행해도 안전(where 조건) · 기존 데이터 유지
--   실행 담당: 선미 (Supabase SQL Editor)
--
-- 왜 필요한가 (유진 발견 · 유진·선미 처리, 승희 부재 중)
--   실 DB seed 는 book_val · appl_ind 로, 코드(common.js DOC_MATRIX)는
--   cost_stmt · appl_indiv 로 나뉘어 있었다.
--   doc_key 로 분기하는 코드가 실데이터에서 조용히 빗나갔다
--   (E1 판정 대상 판별이 실 DB에서 0건 · 화면은 정상으로 보임).
--
--   앞으로 붙을 E4·E5·E6 이 전부 doc_key 로 "이 파일이 어느 자리에 올라왔나"를
--   판단하므로, 지금 안 맞추면 그 위에 쌓는 것이 전부 위태로워진다.
--
-- 결정 (2026-08-31 · 유진·선미)
--   (가) 코드에 맞춘다 → seed·DB 를 cost_stmt · appl_indiv 로 통일
--   근거: DB 더미 4건뿐이라 고치는 비용이 작다. 코드 쪽 key 는
--         common.js DOC_MATRIX 외 여러 화면에서 참조된다.
--
-- 관련 파일
--   · seed-checklist.sql — 정본 갱신 완료 (같은 커밋)
--   · common.js DOC_MATRIX — 그대로 (코드가 정본)
--   · api.js AI_AMOUNT_KEYS — 유진 브랜치의 book_val 병기(임시 방어망)는
--     유진 다음 머지 때 제거 예정 (별도 카톡 요청)
-- ============================================================================

-- doc_key 정정
update checklist_item set doc_key = 'cost_stmt'  where doc_key = 'book_val';
update checklist_item set doc_key = 'appl_indiv' where doc_key = 'appl_ind';

-- 확인 — 정정된 행이 각각 몇 건인지 (0 이면 정상 · 이미 처리됐거나 대상 없음)
select doc_key, count(*) as 행수
from checklist_item
where doc_key in ('cost_stmt', 'appl_indiv', 'book_val', 'appl_ind')
group by doc_key
order by doc_key;
