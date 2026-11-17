-- ============================================================================
-- 나눔대장 — E3 확인용 건 1건 (2026-09-02 선미)
--
-- 왜 필요한가 (연수 · (미공개 내부 기록) ③)
--   실 DB 4건은 전부 장부가액이 있거나(→ checkE3 가 그냥 넘어감)
--   사업자번호 중간자리가 00·11 이라 비영리로 판정된다(→ E3 대상 아님).
--   그래서 E3 가 실제로 막는 화면을 실 DB 로는 아무도 본 적이 없다.
--   데모 시드 #117 로만 확인된 상태다.
--
-- ⚠️ 이 건은 지울 수 없다
--   RLS 에 delete 정책이 없다. attachment 17행이 그렇게 남아 대장 '급한 것 ②' 가 됐다.
--   그래서 "시연용 건" 이 아니라 **버려도 되는 건** 으로 넣는다 —
--   번호를 900번대로 띄우고, 목적 칸에 확인용임을 적어 둔다.
--
-- ⚠️ 배분처(distribution)는 일부러 넣지 않는다 (연수 권고)
--   E3 확인에 필요 없고, 한 줄이 늘면 그 건의 E7(배분 합계 = 접수 수량) 대조가
--   영구히 틀어진다. dists 가 비면 checkE7 은 null 을 돌려준다 — E3 만 남는다.
--
-- ⚠️ 이 건의 book_value 를 채우면 E3 확인이 조용히 사라진다
--   checkE3 의 `if (book) return null` 에서 넘어간다. smoke-test-e3 가 그것을 잡는다.
--
-- 여러 번 실행해도 안전하다 (case_no 가 unique · on conflict do nothing)
-- 실행: Supabase SQL Editor 에 붙여넣고 Run
-- ============================================================================

-- ── 원장 ──────────────────────────────────────────────────────────────────
--    법인 · 사업자번호 중간자리 81(영리) · 장부가액 없음 · 시가만 있음 → E3 가 막는다
insert into donation (
  case_no, state, donor_type, donor_name, donor_biz_no, is_corp_verified,
  acquisition_path, item_name, qty, qty_as_received, qty_unit, pack_size, unit_price,
  book_value, fair_value,
  donation_date, arrive_date, in_date, deadline, submitted_via, purpose, wants_receipt,
  criteria_key, created_by
) values (
  '901', '검수 대기', '법인', '(주)한빛유통', '124-81-55678', true,
  '구매', '생수 2L', 300, 300, '박스', 1, 8000,
  null, 2400000,                      -- ★ 장부가액 없음 · 시가만 → E3
  '2026-06-30', '2026-07-02', '2026-07-02', '2026-07-28', '링크 제출',
  '아동급식 지원 (E3 확인용 건 · RLS 때문에 삭제 불가)', true,
  'fnd_guideline_2026', (select id from staff limit 1)
)
on conflict (case_no) do nothing;

-- ── 체크리스트 ────────────────────────────────────────────────────────────
--    루브릭 §1 법인 × 구매: 신청서(폼) · 구매영수증/매입세금계산서 · 사업자등록증 · 물품사진
--    ★ 접수 서류를 전부 '수취완료' 로 둔다 — "서류는 다 왔는데 대조만 막는" 상태를 만든다.
--      그래야 완결 버튼이 서류 때문이 아니라 E3 때문에 잠긴 것이 화면에서 드러난다.
insert into checklist_item
  (donation_id, distribution_id, doc_key, doc_name, kind, stage, owner, basis, due_date, status, note)
select d.id, null, v.doc_key, v.doc_name, v.kind, '접수', v.owner, v.basis, date '2026-07-10', '수취완료', v.note
from donation d
cross join (values
  ('bizno_fmt', '사업자등록번호 형식',           'F', '폼 필드',     '기관 업무지침 · 사업자번호 (코드 검증)',
   '후원자구분(법인) ↔ 사업자번호 중간자리 대조 — 124-81-55678 (81 = 영리법인)'),
  ('appl_corp', '물품기부신청서(법인용)',        'S', '폼 제출',     '기관 업무지침 · 유형별 필수서류',
   '접수 링크 폼으로 작성·전자서명 — 별도 파일 첨부 없음'),
  ('proof_buy', '구매영수증 또는 매입세금계산서', 'A', '후원자 발급', '기관 업무지침 · 유형별 필수서류',
   '취득원가 증빙 없이 시가로 신고된 건 — E3 가 여기를 짚는다'),
  ('photo',     '물품사진',                     'A', '후원자 발급', '기관 업무지침 · 물품사진', null)
) as v(doc_key, doc_name, kind, owner, basis, note)
where d.case_no = '901'
  and not exists (select 1 from checklist_item ci where ci.donation_id = d.id);

-- ── 확인 ──────────────────────────────────────────────────────────────────
select d.case_no, d.donor_type, d.donor_biz_no, d.book_value, d.fair_value,
       (select count(*) from checklist_item ci where ci.donation_id = d.id)      as 체크리스트,
       (select count(*) from checklist_item ci where ci.donation_id = d.id
          and ci.status = '수취완료')                                            as 수취완료,
       (select count(*) from distribution di where di.donation_id = d.id)        as 배분처
from donation d
where d.case_no = '901';
