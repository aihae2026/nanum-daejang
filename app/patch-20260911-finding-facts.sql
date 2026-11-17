-- ============================================================================
-- 나눔대장 — 패치 2026-09-11 (셋째): 판정 행에 AI 가 뽑은 값(facts)을 같이 남긴다
--   drop 없음 · 여러 번 실행해도 안전 · 기존 데이터 유지 · 컬럼 추가만(nullable)
--
-- ★ 왜 — 값 뽑기(extract) 결과는 화면 메모리(it.r.facts)에만 있었다. 새로고침하면 사라지고,
--   9/10 부터 "이미 읽은 파일은 다시 AI 를 안 부른다"(restoredExtractFindings)라 다시는 돌아오지 않았다.
--   그 상태에서 기관 증빙이 새로 들어와 검수하면 E4 세트 판정(pickSource)이 영수증을 못 보고
--   «수량을 확인할 수 있는 서류가 없습니다» 를 냈다(루브릭 G06 실측 · 승희 9/11).
--
-- ★ 무엇 — inspection_finding.facts jsonb. 값 뽑기 판정(E2·E4·E5·E6·E8 · '판독 완료' 표시 행)에만 채운다.
--   E1 판정·대조 판정(E3·E7)은 NULL. 화면은 부팅 때 같은 파일 이름의 최신 facts 를 it.r.facts 로 되살린다
--   (api.js restoreSavedFacts). 개인정보 없음 — 서류 종류·수량·단가·합계·공급가액·발행처 사업자번호·발행일만.
-- ============================================================================
alter table inspection_finding add column if not exists facts jsonb;
comment on column inspection_finding.facts is
  'AI 값 뽑기(extract) 결과 전체 — docKind·qty·qtyUnit·unitPrice·total·supply·issuerBizNo·issueDate·unreadable. 값 뽑기 판정 행에만 있고 E1·E3·E7 은 NULL. 새로고침 뒤 화면이 되살려 세트 판정이 영수증을 잃지 않게 한다 (2026-09-11 승희)';

-- 확인
--   select column_name, data_type from information_schema.columns
--    where table_name = 'inspection_finding' and column_name = 'facts';
