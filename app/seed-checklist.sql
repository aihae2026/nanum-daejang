-- ============================================================================
-- 나눔대장 — 체크리스트 더미 보충 (seed-dummy.sql 실행 이후)
--   작성: 선미 · 2026-08-28
--   갱신: 2026-08-31 · doc_key 를 코드(common.js DOC_MATRIX) 표기에 맞춤
--         book_val→cost_stmt · appl_ind→appl_indiv (승희 부재 중 유진·선미 처리)
--         기존 DB 행은 patch-20260831-dockey.sql 로 동시에 update
--
--   왜 필요한가: seed-dummy.sql 은 원장(donation)·배분처(distribution)까지만 만든다.
--   담당자 검수 화면의 본체가 체크리스트라, 이게 비면 화면에 볼 것이 없다.
--   → 화면 작업(선미·연수)을 시작하려면 이 데이터가 필요하다.
--
--   ★ 승희 파일(schema.sql · seed-dummy.sql)은 건드리지 않고 추가만 한다.
--   여러 번 실행해도 중복되지 않는다 (맨 위에서 기존 행을 지우고 다시 넣음).
--
--   전개 규칙 근거: inspection-rubric.md §1 (후원자유형 × 취득경로 2×2)
--   ⚠️ 실제 서비스에서는 이 전개를 코드가 한다. 여기서는 화면 확인용 더미다.
--   모든 값은 가짜다. 실명·실제 사업자번호·연락처 없음.
-- ============================================================================

delete from checklist_item;

-- ── #101 법인 × 구매 · 검수 대기 · 3개 기관 배분 ─────────────────────────────
--    루브릭 §1: 신청서(폼) · 구매영수증/매입세금계산서 · 사업자등록증 · 물품사진
--    상태 구성: 접수 서류는 끝났고, 배분 증빙이 기관별로 갈리는 중 (부분 완결 화면 확인용)
insert into checklist_item
  (donation_id, distribution_id, doc_key, doc_name, kind, stage, owner, basis, due_date, status, note) values
  (1, null, 'bizno_fmt',  '사업자등록번호 형식',        'F', '접수', '폼 필드',      '기관 업무지침 · 사업자번호 (코드 검증)',   '2026-07-05', '수취완료', '법인 ↔ 사업자번호 중간자리 대조'),
  (1, null, 'appl_corp',  '물품기부신청서(법인용)',      'S', '접수', '폼 제출',      '기관 업무지침 · 유형별 필수서류',      '2026-07-05', '수취완료', '접수 링크 폼으로 작성·전자서명'),
  (1, null, 'proof_buy',  '구매영수증 또는 매입세금계산서','A', '접수', '후원자 발급',  '기관 업무지침 · 유형별 필수서류',      '2026-07-05', '확인필요', 'AI 첨부 내용 판정 대상'),
  (1, null, 'photo',      '물품사진',                  'A', '접수', '후원자 발급',  '기관 업무지침 · 물품사진',          '2026-07-05', '수취완료', null),
  -- 배분 단계: 배분처마다 한 벌씩 (distribution_id 로 갈린다)
  (1, 1,    'inss',       '인수증',                    'A', '배분', '배분처 수취',  '기관 업무지침 · 인수증 양식',   '2026-07-10', '수취완료', '테스트지역아동센터 150'),
  (1, 1,    'report_dom', '배분 결과보고서(국내지원)',    'A', '배분', '배분처 수취',  '기관 업무지침 · 결과보고서 양식',             '2026-07-15', '수취완료', null),
  (1, 2,    'inss',       '인수증',                    'A', '배분', '배분처 수취',  '기관 업무지침 · 인수증 양식',   '2026-07-10', '수취완료', '테스트복지관 150'),
  (1, 2,    'report_dom', '배분 결과보고서(국내지원)',    'A', '배분', '배분처 수취',  '기관 업무지침 · 결과보고서 양식',             '2026-07-15', '미수취',   '독촉 1회 발송'),
  (1, 3,    'inss',       '인수증',                    'A', '배분', '배분처 수취',  '기관 업무지침 · 인수증 양식',   '2026-07-10', '미수취',   '★ 이 기관만 막혀 있음 — 부분 완결 화면 확인용'),
  (1, 3,    'report_dom', '배분 결과보고서(국내지원)',    'A', '배분', '배분처 수취',  '기관 업무지침 · 결과보고서 양식',             '2026-07-15', '미수취',   '인수증 선행 필요');

-- ── #102 법인 외 × 구매 · 접수 검토 ────────────────────────────────────────
--    루브릭 §1: 신청서(폼) · 구매영수증 · 물품사진  (사업자등록증 없음)
insert into checklist_item
  (donation_id, distribution_id, doc_key, doc_name, kind, stage, owner, basis, due_date, status, note) values
  (2, null, 'appl_indiv','물품기부신청서(법인 외)',  'S', '접수', '폼 제출',     '기관 업무지침 · 유형별 필수서류', '2026-07-09', '수취완료', '개인정보 수집·이용 동의 포함'),
  (2, null, 'proof_buy', '구매영수증',              'A', '접수', '후원자 발급', '기관 업무지침 · 유형별 필수서류', '2026-07-09', '미수취',   null),
  (2, null, 'photo',     '물품사진',                'A', '접수', '후원자 발급', '기관 업무지침 · 물품사진',     '2026-07-09', '미수취',   null),
  (2, 4,    'inss',      '인수증',                  'A', '배분', '배분처 수취', '기관 업무지침 · 인수증 양식','2026-07-10','미수취',   null);

-- ── #103 법인 × 제조·유통 · 완결 ───────────────────────────────────────────
--    루브릭 §1: 신청서(폼) · 원가명세서/회계장부(불가 시 장부가액 확인서로 대체) · 사업자등록증 · 물품사진
--    ★ 예외⑤(장부가액 확인서 대체) 화면 확인용 — run-02 오탐이 났던 지점
insert into checklist_item
  (donation_id, distribution_id, doc_key, doc_name, kind, stage, owner, basis, due_date, status, note) values
  (3, null, 'bizno_fmt', '사업자등록번호 형식',       'F', '접수', '폼 필드',     '기관 업무지침 · 사업자번호 (코드 검증)', '2026-05-19', '수취완료', null),
  (3, null, 'appl_corp', '물품기부신청서(법인용)',     'S', '접수', '폼 제출',     '기관 업무지침 · 유형별 필수서류',    '2026-05-19', '수취완료', '장부가액 확인서 란 작성·직인 있음'),
  (3, null, 'cost_stmt', '원가명세서 또는 회계장부 사본','A', '접수', '후원자 발급', '기관 업무지침 · 제출 불가 시 대체','2026-05-19', '수취완료', '★ 신청서 내 장부가액 확인서로 대체 (지침 명시)'),
  (3, null, 'photo',     '물품사진',                 'A', '접수', '후원자 발급', '기관 업무지침 · 물품사진',        '2026-05-19', '수취완료', null),
  (3, 5,    'inss',      '인수증',                   'A', '배분', '배분처 수취', '기관 업무지침 · 인수증 양식', '2026-05-25', '수취완료', null),
  (3, 5,    'report_dom','배분 결과보고서(국내지원)',   'A', '배분', '배분처 수취', '기관 업무지침 · 결과보고서 양식',           '2026-05-31', '수취완료', null);

-- ── #104 법인 × 구매 · 접수 검토 · ★ 배분처 없음 ────────────────────────────
--    왜 필요한가: 담당자 목록이 배분처 유무로 '배분 전 / 배분 후'를 가르는데
--    (screen-staff.js:729 — !orgId), 더미 3건이 전부 배분처를 갖고 있어 '배분 전'이 0건이었다.
--    → 접수 단계 체크리스트를 화면에서 볼 수 없었다 (유진 발견 2026-08-28)
--    ⚠️ 이 건은 donation 도 함께 넣어야 한다 (아래는 이미 넣은 #104 기준)
insert into donation
  (case_no, state, donor_type, donor_name, donor_biz_no, is_corp_verified, acquisition_path,
   item_name, qty, qty_as_received, qty_unit, pack_size, unit_price, book_value, fair_value,
   arrive_date, in_date, deadline, submitted_via, purpose, wants_receipt, criteria_key, created_by)
select '104', '접수 검토', '법인', '테스트문구(주)', '000-00-00000', true, '구매',
       '문구 세트', 200, 200, '낱개', 1, 9000, 1800000, 1800000,
       '2026-07-14', '2026-07-14', '2026-07-28', '전화 문의 후 대리등록', '아동 학습 지원', false,
       'fnd_guideline_2026', (select id from staff limit 1)
where not exists (select 1 from donation where case_no = '104');

insert into checklist_item
  (donation_id, distribution_id, doc_key, doc_name, kind, stage, owner, basis, due_date, status, note)
select d.id, null, v.doc_key, v.doc_name, v.kind, '접수', v.owner, v.basis, '2026-07-21', v.status, v.note
from donation d, (values
  ('bizno_fmt','사업자등록번호 형식','F','폼 필드','기관 업무지침 · 사업자번호 (코드 검증)','수취완료',null),
  ('appl_corp','물품기부신청서(법인용)','S','폼 제출','기관 업무지침 · 유형별 필수서류','미수취','대리등록 건 — 후원자 서명 필요'),
  ('proof_buy','구매영수증 또는 매입세금계산서','A','후원자 발급','기관 업무지침 · 유형별 필수서류','미수취',null),
  ('photo','물품사진','A','후원자 발급','기관 업무지침 · 물품사진','미수취',null)
) as v(doc_key, doc_name, kind, owner, basis, status, note)
where d.case_no = '104';

-- 확인
select d.case_no, count(*) as 항목수,
       count(*) filter (where c.status = '수취완료') as 수취완료,
       count(*) filter (where c.status = '미수취')   as 미수취,
       count(*) filter (where c.status = '확인필요') as 확인필요
from checklist_item c join donation d on d.id = c.donation_id
group by d.case_no order by d.case_no;
