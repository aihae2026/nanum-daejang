/* 검사를 전부 돌리고, **안 돈 검사를 잡는다** (2026-09-04 유진)

   ★ 왜 만들었나 — 9/4 하루에 검사 **셋이 죽어 있었다.**
       smoke-test-silent   (pdf-form.js 가 로더에 없었다 — 첫 항목도 못 찍음)
       smoke-test-pdf-submit · pdf-view  (vc.sendTo 가 jsdom 24 에서 없어졌다)
     실패한 게 아니라 **시작하자마자 죽었다.** 그러면 빨간 줄이 안 난다 —
     화면에 아무것도 안 찍히고, 목록을 눈으로 훑으면 초록들 사이에서 그냥 지나간다.
     셋 다 우연히 찾았다. 그중 하나는 인수인계에 *"조용한 실패는 이 검사가 막는다"* 고
     못박아 둔 그 검사였고, 반나절 아무것도 안 지키고 있었다.

   ★ 그래서 세 가지를 본다 — 어느 하나라도 걸리면 실패다.
       ① 끝난 값(exit code)이 0 이 아니다        → 검사가 실패했다
       ② 찍은 항목이 **0 개**다                  → 검사가 **안 돌았다** ← 9/4 의 사고
       ③ 항목 수가 **기준선보다 줄었다**          → 검사가 **반쯤 죽었다**
     ③ 이 있어야 "앞부분만 돌고 뒤가 날아간" 경우도 잡힌다. ② 만으로는 못 잡는다.

   ★ 연수 님의 check-silent-list.mjs 와 같은 생각이다 —
     *"개수를 세는 자리가 실제 줄 수를 안 세고 있었다."* 그것을 검사 전체로 넓힌 것이다.

   돌리는 법
     node run-all-tests.mjs              # 서버·DB 없이 도는 것만 (기본)
     node run-all-tests.mjs --update     # 지금 개수를 기준선으로 저장한다
                                         #   ⚠️ 전부 초록일 때만 하세요. 깨진 채로 저장하면
                                         #     그 깨진 상태가 새 기준이 됩니다
   ⚠️ JSDOM_FROM 은 이 파일이 알아서 붙입니다(/tmp/fast 가 있으면).
     없으면 jsdom 로드에만 5분씩 걸립니다:  npm i jsdom@29.1.1 --prefix /tmp/fast
*/
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const APP  = fileURLToPath(new URL("./", import.meta.url));
const BASE = APP + "test-baseline.json";
const UPDATE = process.argv.includes("--update");

/* 서버·DB 없이 도는 것 — 이 목록이 "언제나 초록이어야 하는 것" 이다.
   ⚠️ 검사를 새로 만들면 여기에 넣으세요. 안 넣으면 아무도 안 돌립니다. */
const OFFLINE = [
  "smoke-test-e2.mjs", "smoke-test-e3.mjs", "smoke-test-ai.mjs",
  "smoke-test-silent.mjs", "smoke-test-ledger.mjs", "smoke-test-roundtrip-map.mjs",
  "smoke-test-resolution.mjs", "smoke-test-timeout.mjs", "smoke-test-uid.mjs",
  "smoke-test-link.mjs", "smoke-test-link-entry.mjs", "smoke-test-multiorg.mjs",
  "smoke-test-zip.mjs", "smoke-test-pdf-form.mjs", "smoke-test-pdf-submit.mjs",
  "smoke-test-pdf-view.mjs", "check-silent-list.mjs",
  "smoke-test-privacy-20260904.mjs",   /* 9/4 코칭 후 결정 6가지 — 선미 추가 */
  "smoke-test-privacy-consent-20260910.mjs",  /* 동의 문구 확정안 — 국외 이전·수집 항목·보유 기간·법인 고지 (9/10 선미) */
  "smoke-test-recv-target.mjs",        /* 수취 등록 — 누른 항목이 그대로 열리는가 (9/5 선미) */
  "smoke-test-case-state.mjs",         /* 완결한 건 vs 완결할 수 있는 건 (9/5 선미) */
  "smoke-test-demo-leak.mjs",          /* 실서비스 화면에 시연용이 남았는가 (9/5 선미) */
  "smoke-test-copy-cleanup.mjs",       /* 기한·설명문·근거 딱지가 다시 안 들어왔는가 (9/5 선미) */
  "smoke-test-home-list.mjs",         /* 홈 2블록 · 목록 표 하나 (9/5 선미) */
  "smoke-test-qty-constraint.mjs",     /* 제출이 donation 수량 제약을 깨지 않는가 (9/6 선미) */
  "smoke-test-submit-safety.mjs",      /* 저장 실패 때 거짓 성공·링크 폐기가 없는가 (9/6 선미) */
  "smoke-test-auth.mjs",               /* 담당자 로그인 — Bearer 전환·로그인 벽·감사 actor·created_by (9/7 승희) */
  "smoke-test-today.mjs",              /* 기록에 찍히는 날짜가 진짜 오늘인가 (9/6 선미) */
  "smoke-test-donor-input.mjs",       /* 후원일자·연락처 — 기본값 비움 · 입력 형식 (9/6 선미 M-1·M-2) */
  "smoke-test-case-tabs.mjs",         /* 건 상세 — 수취 현황이 먼저 (9/6 선미 M-5) */
  "smoke-test-case-skeleton.mjs",     /* 건 상세 골격 — 카드가 옮겨 다니지 않는가 (설계서 §4 F) */
  "smoke-test-restore-attach.mjs",    /* 새로고침해도 낸 서류가 보이는가 (9/5 선미 · #217) */
  "smoke-test-judge-fn.mjs",          /* 서버함수 judge.js 가 켜지는가 · 주고받는 모양 (9/6) */
  "smoke-test-gate-original.mjs",     /* 발송 게이트 제거 · 원본 확인이 기본 경로 (설계서 §4 A·D · 9/7 선미) */
  "smoke-test-form-nofile.mjs",       /* 제출은 있는데 PDF 없는 행을 사실대로 말하는가 (9/7 승희 조회 → 선미) */
  "smoke-test-org-link-dist.mjs",     /* 배분처 링크 폼이 자기 배분처 이름·배분 수량을 쓰는가 · 데모 첨부 버튼 감싸기 (9/7 밤 선미 · #226) */
  "smoke-test-recv-upload.mjs",       /* 담당자 수취 등록 실제 업로드 · 버킷이 거절할 형식(docx)은 고를 때 말한다 (9/7 밤 선미 · #226·#228) */
  "smoke-test-inspect-restore.mjs",   /* 한 번 검수한 건은 새로고침해도 결과가 펼쳐진 채로 열린다 · 검수 뒤 증빙이 오면 게이트를 다시 연다 (9/8 연수 · 작업판 4번) */
  "smoke-test-toast.mjs",             /* 성공 알림은 2~3초 뒤 스스로 닫히고, 실패 알림은 그대로 남는다 (9/8 연수 · 작업판 5번) */
  "smoke-test-gate-report.mjs",       /* 결과보고서는 완결 게이트에서만 빠진다 — 항목은 화면에 그대로 (9/8 선미 결정 · #225·#228) */
  "smoke-test-corp-seal.mjs",         /* 법인은 전자서명 대신 직인 날인 — 개인 경로와 갈려 도는가 · 진짜 PDF 로 날인 확인 (9/10 선미 요청) */
  "smoke-test-bizno-reason.mjs",      /* 사업자번호 확인필요의 사유가 화면까지 오는가 — 칸·하이픈·사유 셋 (9/10 선미 실주행) */
  "smoke-test-admin.mjs",             /* 관리자 권한이 화면과 DB 양쪽에 걸려 있는가 · 통계 집계 (9/10 선미 요청) */
  "smoke-test-session-cache.mjs",     /* 권한 변경·배포가 새로고침만으로 따라오는가 — 세션 재조회 · 캐시 깨기 (9/10 연수) */
  "smoke-test-list-search.mjs",       /* 목록 검색이 구간을 가로지르고, 빈 결과가 어디 있는지 말한다 (9/8 선미 요청 · 연수) */
  "smoke-test-list-mine.mjs",         /* 목록 [내가 접수한 건만] — 화면 필터일 뿐, 권한은 원장 전체 그대로 (9/10 선미) */
  "smoke-test-dist-cancel.mjs",       /* 배분건 취소·수정은 증빙 수취 확정 전에만 — 취소는 지우지 않고 사유와 함께 남는다 (9/11 선미 결정) */
  "smoke-test-send-focus.mjs",        /* 접수 링크 발송 — 텍스트 칸을 떠나도 화면이 다시 그려져 포커스를 잃지 않는다 (9/11 선미 실주행 · 클릭 2번·Tab) */
  "smoke-test-judge-axes.mjs",        /* 검수 화면 — 수취 축(회색 제출됨·확인 전)과 AI 축(띠·판정 상자)이 갈라져 보인다 (9/11 선미 · A안) */
  "smoke-test-donor-tab.mjs",         /* 후원자 폼 — Tab 이 다음 칸으로 간다, 크롬 이벤트 순서(초점 뗀 뒤 change)에서도 (9/11 선미 실주행) */
  "smoke-test-findings-0911.mjs",     /* 루브릭 실주행 발견 3건(E2 중복·E4 사유·숫자 칸) + 취소된 배분처의 링크 카드 (9/11 선미) */
  "smoke-test-e4-once.mjs",           /* E4 건당 한 줄 · 서류끼리 다르면 지적 · E1 머리말은 사유대로 · facts 저장/복원 (9/11 승희 · 팀 결정 ⓐⓑ) */
  "smoke-test-caseno-race.mjs",       /* 접수번호 충돌 자동 회복 — DB 번호 새로 읽기 · 23505 한 번 재시도 · 키 이동 (9/11 승희 · 동료 테스트 #288) */
  "smoke-test-judge-latest.mjs",      /* 한 칸에 파일이 여럿이면 AI 는 가장 최근 파일을 본다 · 복원은 올린 순서 (9/11 승희 · 선미 발견) */
  "smoke-test-case-steps.mjs",        /* 건 상세 — 진행바 6칸이 탭 · 단계는 caseStateKey · 기관별 아코디언 · 검수 전 수취 행 (9/11 선미 · 시안 C) */
  "smoke-test-case-0912.mjs",         /* 건 상세 손질 — 단계별 카드 · 수취 취소 · 다른 서류로 수취 등록 · 배분 취소 DB 반영(#306) · 접수 링크 재발급 (9/12 선미) */
  "smoke-test-dist-save-order.mjs",   /* 다기관 — 기관을 잇달아 추가해도 항목이 자기 배분처에 붙는가 (9/13 · #323 유진) */
  "smoke-test-cancel-link.mjs",       /* 접수 취소 — 취소한 링크로 제출이 막히는가 · DB 에 남는가 (9/13 · #323 유진) */
  "smoke-test-presenter-fill.mjs",    /* 시연용 [채우기] — admin 로그인 세션에만 뜨고, assets/demo 진짜 blob 이 올라간다 · 받는 동안 제출 잠금 (9/14 승희 · 선미 9/13 결정) */
];

/* 서버·키·실 DB 가 있어야 도는 것 — 여기서는 안 돌린다.
   ⚠️ 목록에서 빼지 말고 남겨 둔다. 빼면 "그런 검사가 있다" 는 사실이 사라진다. */
const NEEDS_LIVE = [
  "smoke-test-storage.mjs", "smoke-test-rls.mjs", "smoke-test-ledger-live.mjs",
  "roundtrip-test-live.mjs", "e2e-test-live.mjs", "smoke-test-config.mjs",
  "backup-live.mjs", "check-patches-live.mjs", "verify-backup.mjs",
  "smoke-test-pdf-font.mjs",
  "roundtrip-test-pdf-live.mjs",   /* 신청서 PDF 실 DB 왕복 — 9/5 선미 */
];

/* 항목 한 줄을 세는 규칙 — 검사마다 표기가 달라서 넉넉히 잡는다.
   ⚠️ 넉넉히 잡는 쪽이 안전하다. 못 세면 "안 돌았다" 로 잘못 잡는다. */
const MARK = /(✅|❌|✔|✖)/;
const countChecks = (out) => out.split("\n").filter((l) => MARK.test(l)).length;

const env = { ...process.env };
if (!env.JSDOM_FROM && existsSync("/tmp/fast/node_modules/jsdom")) env.JSDOM_FROM = "/tmp/fast";

const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, "utf8")) : {};
const now  = {};
const rows = [];
let bad = 0;

console.log(`검사 ${OFFLINE.length}종 — 서버 없이 도는 것${env.JSDOM_FROM ? " · jsdom " + env.JSDOM_FROM : ""}\n`);

for (const f of OFFLINE){
  const t0 = Date.now();
  const r  = spawnSync(process.execPath, [APP + f], { env, encoding:"utf8", timeout: 300000 });
  const out = (r.stdout || "") + (r.stderr || "");
  const n   = countChecks(out);
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  now[f] = n;

  let verdict = "✅", why = `${n}항목`;
  /* ⏭ 건너뜀 — 실 DB 접속 설정(config.local.js)·담당자 로그인 자격(staff.local.json)·미공개 내부 문서가 없어 못 돌린 것 (test-staff-login.mjs · 2026-09-08).
     실패로 세지 않되 통과로도 안 센다 — 아래에 따로 적고, --update 는 막는다. */
  const skipped = /^⏭ 건너뜀/m.test(out);
  if (r.status !== 0)                      { verdict = "❌"; why = `실패 — 끝난 값 ${r.status} · ${n}항목`; }
  if (skipped)                             { verdict = "⏭"; why = (out.match(/^⏭ 건너뜀 — ([^\n]*)/m) || [,'건너뜀'])[1]; }
  else if (n === 0)                        { verdict = "💀"; why = "안 돌았다 — 찍은 항목이 0개"; }
  else if (base[f] && n < base[f])         { verdict = "⚠️"; why = `줄었다 — ${base[f]} → ${n}항목`; }

  if (verdict !== "✅" && verdict !== "⏭") bad++;
  rows.push({f, verdict, why, sec});
  console.log(`  ${verdict} ${f.padEnd(30)} ${why}  (${sec}s)`);

  /* 죽은 검사는 마지막 몇 줄을 보여 준다 — 안 보여 주면 또 눈으로 지나간다 */
  if (verdict === "💀" || (verdict === "❌" && n === 0)){
    out.trim().split("\n").slice(-4).forEach((l) => console.log(`       │ ${l}`));
  }
}

console.log(`\n안 돌린 것 (서버·키·실 DB 필요) ${NEEDS_LIVE.length}종 — ${NEEDS_LIVE.join(" ")}`);
const skips = rows.filter((x) => x.verdict === "⏭");
if (skips.length) console.log(`⏭ 건너뜀 ${skips.length}종 — 실 DB 접속 설정·담당자 자격·미공개 내부 문서가 없어 못 돌렸다(사유는 위 각 줄): ${skips.map((x) => x.f).join(" ")}\n   → 실 DB 검사는 app/config.local.js + STAFF_EMAIL·STAFF_PASSWORD 환경변수 또는 app/staff.local.json (test-staff-login.mjs 머리말)`);

if (UPDATE){
  if (skips.length){ console.log(`\n❌ 건너뛴 ${skips.length}종이 있어 기준선을 저장하지 않습니다 — 자격을 넣고 실제로 돌리세요.`); process.exit(1); }
  if (bad){ console.log(`\n❌ ${bad}종이 깨져 있어 기준선을 저장하지 않습니다 — 고치고 다시 하세요.`); process.exit(1); }
  writeFileSync(BASE, JSON.stringify(now, null, 2) + "\n");
  console.log(`\n📌 기준선을 저장했습니다 (${Object.keys(now).length}종) — ${BASE.replace(APP, "")}`);
  process.exit(0);
}

console.log(bad ? `\n❌ ${bad}종이 문제입니다`
  : skips.length ? `\n✅ ${OFFLINE.length - skips.length}종 통과 · ⏭ ${skips.length}종은 접속 설정·자격·내부 문서가 없어 못 돌렸습니다 (통과가 아닙니다)`
  : `\n✅ ${OFFLINE.length}종 전부 살아 있고 전부 통과합니다`);
if (!existsSync(BASE)) console.log("⚠️ 기준선이 없습니다 — 지금 전부 초록이면 `node run-all-tests.mjs --update` 로 저장하세요.");
process.exit(bad ? 1 : 0);
