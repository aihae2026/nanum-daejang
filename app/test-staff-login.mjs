/* 검사용 담당자 로그인 — 실 DB 에 붙는 검사가 담당자(authenticated)로 돌게 한다 (2026-09-08 승희 · 권한 3단계)

   ★ 왜 — 3단계(patch-20260908-rls-link-scope.sql)부터 anon 은 링크 없이는 원장을 **한 건도** 못 읽는다.
     그래서 config.local.js 로 실 DB 에 붙던 검사(uid · zip · ledger-live · storage · roundtrip …)가
     donation 0건을 받고 죽는다(연수 9/8 발견). 그 검사들은 전부 **담당자 동선**이다 —
     실서비스에서 담당자는 로그인해서 보므로, 검사도 로그인해서 보는 것이 맞는 모양이다.

   ★ 어떻게 — 자기 계정(대시보드 Auth 에 있는 팀원 계정 · 심사위원 계정도 됨)으로 authSignIn() 을 한 번 부른다.
     자격은 둘 중 하나로 준다 (환경변수가 이긴다):
       ① 환경변수  STAFF_EMAIL=… STAFF_PASSWORD=…
       ② 파일      app/staff.local.json   { "email": "…", "password": "…" }   ← .gitignore 대상 · config.local.js 와 같은 자리
     둘 다 없으면 검사를 **건너뛴다**(⏭ 한 줄 찍고 끝값 0) — 실패로 세지 않되, run-all-tests 가 "건너뜀" 으로 따로 센다.
     ⚠️ 건너뜀은 "통과" 가 아니다. 기준선을 갱신(--update)하기 전엔 자격을 넣고 실제로 돌려야 한다.

   ⚠️ 비밀번호는 절대 저장소에 넣지 않는다. 파일명이 .gitignore 에 있는지 먼저 확인했다(9/8).
   사용:  import { staffLogin } from './test-staff-login.mjs';  …  await staffLogin(window);   ← loadCasesFromSupabase() 앞 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function staffCredentials(){
  const e = process.env.STAFF_EMAIL, p = process.env.STAFF_PASSWORD;
  if (e && p) return { email: e, password: p, from: '환경변수' };
  const f = fileURLToPath(new URL('./staff.local.json', import.meta.url));
  if (existsSync(f)){
    try {
      const j = JSON.parse(readFileSync(f, 'utf8'));
      if (j.email && j.password) return { email: j.email, password: j.password, from: 'staff.local.json' };
    } catch (err) { console.log('  ⚠️ staff.local.json 을 읽지 못했습니다 — ' + err.message); }
  }
  return null;
}

/* 로그인해서 담당자 세션을 만든다. 자격이 없으면 건너뜀(끝값 0). 로그인이 틀리면 실패(끝값 1) — 조용히 anon 으로 흘려보내지 않는다. */
export async function staffLogin(window, opt){
  const what = (opt && opt.what) || '이 검사';
  if (!window.sbReady || !window.sbReady()){
    console.log(`⏭ 건너뜀 — config.local.js 가 없어 실 DB 에 못 붙습니다 (${what})`);
    process.exit(0);
  }
  const cred = staffCredentials();
  if (!cred){
    console.log(`⏭ 건너뜀 — 담당자 로그인 자격이 없습니다 (${what})`);
    console.log('   권한 3단계부터 anon 은 원장을 못 읽습니다. STAFF_EMAIL·STAFF_PASSWORD 환경변수나 app/staff.local.json 을 주세요 (test-staff-login.mjs 머리말).');
    process.exit(0);
  }
  const r = await window.authSignIn(cred.email, cred.password);
  if (!r || !r.ok){
    console.log(`  ❌ 담당자 로그인 실패 (${cred.from} · ${cred.email}) — ${r && r.reason}`);
    process.exit(1);
  }
  const s = window.AUTH && window.AUTH.session;
  console.log(`  🔐 담당자로 로그인 (${cred.from} · ${cred.email}${s && s.staffOk ? ' · staff 대조 OK' : ' · ⚠️ staff 행 없음(읽기는 됨)'})`);
  return r;
}
