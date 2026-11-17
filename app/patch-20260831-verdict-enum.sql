-- ============================================================================
-- 나눔대장 — 패치 2026-08-31: inspection_finding.verdict 에 '배분 진행 중' 추가
--   drop constraint + add constraint 방식 · 기존 데이터 유지
--
-- 왜 필요한가 (유진 발견 · 유진·선미 처리, 승희 부재 중)
--   E7 미달(전량 배분 안 됨)의 화면 표기 '배분 진행 중' 이 verdict 허용값에
--   없어 insert 가 거부됐다. 유진과장님이 임시로 dbVerdict() 헬퍼에서
--   '배분 진행 중' → '판단 보류' 로 변환해 저장했지만, 통계 집계 시 오염
--   (E7 은 오류 아닌데 오류 통계에 섞임).
--
-- 값 이름 근거 (2026-08-31 · 유진·선미 결정)
--   '배분 진행 중' — 유진과장님이 이미 화면 표기로 쓰고 있어 화면·DB 표기 통일.
--   기존 4값(이상 없음·확인 권장·판단 보류·대기중)도 자연 어법이라 스타일 맞음.
--   대안('진행 중')보다 맥락이 명확 (다른 진행 상황과 혼동 없음).
--
-- E7 설계 근거 (참고)
--   E7 은 '오류인가(isError)'와 '완결을 막는가(blocksComplete)'를 두 축으로 나눔.
--   미달은 오류가 아니지만(정상 업무) 완결은 막는다(전량 배분 안 됨).
--   → '배분 진행 중' 이 이 상태를 담는 유일한 값.
--
-- 후속 정리 (유진 브랜치)
--   이 patch 실행 후 유진과장님이 dbVerdict() 헬퍼 삭제 (변환 불필요).
-- ============================================================================

alter table inspection_finding
  drop constraint if exists inspection_finding_verdict_check;

alter table inspection_finding
  add constraint inspection_finding_verdict_check
    check (verdict in ('이상 없음', '확인 권장', '판단 보류', '대기중', '배분 진행 중'));

-- 확인 — 제약이 잘 걸렸는지 (5개 값이 모두 통과, 다른 값은 거부)
-- 아래는 성공 시 예상 결과: 실행 안 함. 참고용.
--   insert into inspection_finding (inspection_id, layer, verdict) values (1, '대조', '배분 진행 중');  -- ✅
--   insert into inspection_finding (inspection_id, layer, verdict) values (1, '대조', '이상함');      -- ❌ 거부

-- 현재 verdict 분포 (실행해서 오염된 '판단 보류' 있으면 유진에게 알림)
select verdict, count(*) as 건수
from inspection_finding
group by verdict
order by verdict;
