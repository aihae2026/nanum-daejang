/* ════════════════════════════════════════════════════════════
   config.example.js — Supabase 접속 설정 '예시' 파일

   ★ 이 파일을 복사해서 같은 폴더에 `config.local.js` 로 저장하고,
     아래 두 값을 본인 Supabase 프로젝트의 값(Project URL · publishable key)으로 바꾸세요.
     (config.local.js 는 gitignore 대상이라 GitHub에 올라가지 않습니다)

   ⚠️ 실제 값을 이 파일(config.example.js)에 적지 마세요 — 이 파일은 커밋됩니다.

   ⚠️ 이 공개 키(publishable key)는 브라우저에 그대로 내려갑니다. 데이터는 DB의 접근 정책(RLS)이 막습니다.
     → 새 환경에서는 schema.sql · stage2-inspection.sql · patch-*.sql 을 순서대로 모두 실행하고
       신규 가입을 차단한 뒤에만 실제 데이터를 넣습니다 (관리자 가이드 5.2 설치 절차 · 5.4 보안 정보 관리)
   ════════════════════════════════════════════════════════════ */

var SUPABASE_CONFIG = {
  url: 'https://여기에-프로젝트-URL.supabase.co',
  key: '여기에-publishable-key'
};
