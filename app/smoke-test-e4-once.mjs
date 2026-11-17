/* 루브릭 실주행 팀 결정 2건 (2026-09-11 승희) — E4 는 건당 한 줄 · 서류끼리 다르면 지적 · E1 머리말은 사유대로
   ★ 무엇을 지키나
     ⓐ-1 수량 서류가 여럿이고 값이 같으면 한 줄 (두 번째 서류는 말하지 않는다)
     ⓐ-2 수량 서류가 여럿인데 값이 다르면 «서류끼리 수량이 다릅니다» 확인 권장 — 전에는 먼저 온 한 장만 보고 나머지는 조용히 무시
     ⓐ-3 수량 서류가 없으면 «수량 서류가 없다» 는 첫 항목 한 줄만 (G05 는 같은 말 3줄이었다)
     ⓐ-4 뽑은 값(facts)이 저장·복원되는 자리가 있다 — 새로고침 뒤 세트 판정이 영수증을 잃지 않게
     ⓑ   '확인 권장' 머리말이 사유에 따라 갈린다 — «합계와 일치» 는 "값이 다릅니다" 라고 말하지 않는다
   rules-compare.js 는 브라우저 없이 vm 으로 돌린다(run-verdict.mjs 와 같은 방식). 화면·DB 쪽은 원문 검사. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const APP = fileURLToPath(new URL("./", import.meta.url));
const require = createRequire(import.meta.url);
const vm = require("node:vm");
let pass = 0, fail = 0;
const check = (name, ok, extra) => { console.log((ok ? "  ✅ " : "  ❌ ") + name + (ok || extra === undefined ? "" : "   ← " + JSON.stringify(extra).slice(0, 160))); ok ? pass++ : fail++; };

const ctx = {console, COL:{distribution:{distDate:"dist_date", qty:"qty", orgName:"org_name", id:"id"}}};
vm.createContext(ctx);
vm.runInContext(readFileSync(APP + "rules-compare.js", "utf8"), ctx);

const receipt  = (qty) => ({docKind:"구매영수증", qty:String(qty), qtyUnit:null, unitPrice:"38,000", total:"3,800,000", unreadable:[]});
const invoice  = (qty) => ({docKind:"거래명세표", qty:String(qty), qtyUnit:null, unitPrice:"38,000", total:"3,800,000", unreadable:[]});
const photo    = {docKind:"사진", unreadable:[]};
const coststmt = {docKind:"원가명세서", total:"1,200,000", unreadable:[]};
const market   = {docKind:"시세자료", unitPrice:"54,800", unreadable:[]};
const item = (key, facts) => ({key, n:key, kind:"A", included:true, r:{facts}});
const kase = (items, qty) => ({donorType:"법인", acqPath:"구매", donation:{qty, qtyAsReceived:qty, qtyUnit:null}, dists:[], checklist:items});
const e4 = (c, it) => ctx.extractedFindings(c, it, it.r.facts).filter(f => f.rule === "E4");

console.log("\n[ⓐ-1 같은 값 두 장 → 한 줄]");
{
  const a = item("proof_buy", receipt(100)), b = item("etc", invoice(100));
  const c = kase([a, b], 120);
  const all = [...e4(c, a), ...e4(c, b)];
  check("E4 가 건당 한 줄이다", all.length === 1, all.map(f => f.reason));
  check("   그 한 줄은 신고 120 > 서류 100 확인 권장", all[0] && all[0].verdict === "확인 권장" && /120/.test(all[0].reason), all[0]);
}
console.log("\n[ⓐ-2 다른 값 두 장 → 서류끼리 다르다고 말한다]");
{
  const a = item("proof_buy", receipt(100)), b = item("etc", invoice(120));
  const c = kase([a, b], 120);
  const all = [...e4(c, a), ...e4(c, b)];
  check("★ 여전히 한 줄이다", all.length === 1, all.map(f => f.reason));
  check("★ «서류끼리 수량이 다릅니다» 확인 권장", all[0] && all[0].verdict === "확인 권장" && /서류끼리 수량이 다릅니다/.test(all[0].reason), all[0]);
  check("   양쪽 값과 서류 종류가 사유에 있다", all[0] && /구매영수증 100/.test(all[0].reason) && /거래명세표 120/.test(all[0].reason), all[0] && all[0].reason);
  check("   어느 쪽이 맞는지 단정하지 않는다 (사람 몫)", all[0] && /어느 쪽이 맞는지/.test(all[0].reason));
  check("   완결은 막지 않는다 (다른 E4 와 같은 무게)", all[0] && all[0].blocksComplete === false);
}
console.log("\n[ⓐ-3 수량 서류가 없는 건 → «서류가 없다» 는 한 줄만 (G05)]");
{
  const p = item("photo", photo), s = item("cost_stmt", coststmt), m = item("market_px", market);
  const c = kase([p, s, m], 300);
  const all = [...e4(c, p), ...e4(c, s), ...e4(c, m)];
  check("★ 세 서류가 있어도 E4 판단 보류는 한 줄", all.length === 1, all.map(f => f.reason));
  check("   사유는 «수량을 확인할 수 있는 서류가 없습니다»", all[0] && /수량을 확인할 수 있는 서류가 없습니다/.test(all[0].reason), all[0]);
  check("   첫 항목이 말한다 (물품사진)", e4(c, p).length === 1 && e4(c, s).length === 0 && e4(c, m).length === 0);
}
console.log("\n[ⓐ-3′ 영수증이 있으면 «서류가 없다» 는 아예 안 나온다 (G06 의 두 번째 줄)]");
{
  const r = item("proof_buy", receipt(100)), p = item("photo", photo), etc = item("report_dom", {docKind:"기타", unreadable:[]});
  const c = kase([r, p, etc], 120);
  const all = [...e4(c, r), ...e4(c, p), ...e4(c, etc)];
  check("E4 한 줄 · 확인 권장(120>100)", all.length === 1 && all[0].verdict === "확인 권장", all.map(f => f.reason));
  check("★ «서류가 없다» 줄이 없다", !all.some(f => /서류가 없습니다/.test(f.reason)));
}
console.log("\n[기존 규칙 그대로 — 검사 하나짜리 호출(checklist 없음)도 전과 같다]");
{
  const c = kase([], 120), it = item("proof_buy", receipt(100));
  const f = e4(c, it)[0];
  check("신고 120 > 서류 100 → 확인 권장", f && f.verdict === "확인 권장", f);
  const c2 = kase([], 80);
  check("특칙 a — 신고 80 < 서류 100 → 이상 없음", e4(c2, it)[0].verdict === "이상 없음");
  const c3 = kase([], 300), only = item("photo", photo);
  check("사진만 있고 checklist 가 비어도 «서류가 없다» 한 줄은 난다", e4(c3, only).length === 1);
}
console.log("\n[ⓐ-4 뽑은 값 저장·복원 자리 — 원문]");
{
  const db = readFileSync(APP + "db.js", "utf8"), api = readFileSync(APP + "api.js", "utf8"), st = readFileSync(APP + "screen-staff.js", "utf8");
  check("db.js COL 에 facts 컬럼", /facts:\s*'facts'/.test(db));
  check("saveInspectionRun 이 facts 를 싣는다", /if \(f\.facts\) r\[F\.facts\] = f\.facts/.test(db));
  check("rowToFindings 가 facts 를 되읽는다", /facts:\s*f\[F\.facts\] \|\| null/.test(db));
  check("screen-staff 값 뽑기 저장에 facts", /facts:it\.r\.facts/.test(st));
  check("api.js restoreSavedFacts 가 있고 restoreAllSavedJudgments 가 부른다", /function restoreSavedFacts/.test(api) && /restoreSavedFacts\(c\)/.test(api));
  check("   이번 세션 값은 덮지 않는다", /if \(!it\.r \|\| it\.r\.facts\) return;/.test(api));
  check("패치 파일이 있다", (() => { try { return /add column if not exists facts jsonb/.test(readFileSync(APP + "patch-20260911-finding-facts.sql", "utf8")); } catch (e) { return false; } })());
}
console.log("\n[ⓑ 머리말은 사유대로]");
{
  const st = readFileSync(APP + "screen-staff.js", "utf8");
  const src = st.match(/function verdictLine\(j\)\{[\s\S]*?\n\}/);
  check("verdictLine 이 있다", !!src);
  const fn = src && new Function("VERDICT_LINE", src[0] + "; return verdictLine;")({
    '이상 없음':'대조한 값이 같습니다 · 확인한 것: 금액', '확인 권장':'대조한 값이 다릅니다 — 원본을 보고 확인해 주세요', '판단 보류':'대조하지 못했습니다 — 원본을 직접 봐 주세요'});
  const L = (verdict, reason) => fn({verdict, reason});
  check("★ «합계와 일치» 는 '값이 다릅니다' 라고 말하지 않는다", fn && !/다릅니다/.test(L('확인 권장', '합계와 일치 — 공제 안 받는 건으로 보입니다. 후원자 확인 요청 (차이 0원)')));
  check("   «합계와 일치» → 매입세액공제 여부 확인", fn && /매입세액공제/.test(L('확인 권장', '합계와 일치 — 공제 안 받는 건으로 보입니다')));
  check("   «공급가액과 일치» → 공제 받는 건인지 확인", fn && /공제 받는 건/.test(L('확인 권장', '공급가액과 일치 — 공제 받는 건으로 보입니다')));
  check("   «어느 쪽과도 다름» 은 그대로 '값이 다릅니다'", fn && /다릅니다/.test(L('확인 권장', '어느 쪽과도 다름 — 금액 오류 가능성 (차이 45,000원)')));
  check("   이상 없음·판단 보류 머리말은 그대로", fn && /같습니다/.test(L('이상 없음', 'x')) && /대조하지 못했습니다/.test(L('판단 보류', 'x')));
  check("   화면이 verdictLine 을 쓴다 (VERDICT_LINE 직접 참조 아님)", /esc\(verdictLine\(j\)\)/.test(st) && !/esc\(VERDICT_LINE\[j\.verdict\]\)/.test(st));
}
console.log(`\n${fail ? "❌ " + fail + "건 실패" : "✅ 전부 통과 — E4 는 건당 한 줄, 서류끼리 다르면 말하고, 머리말은 사유대로"} (${pass}/${pass + fail})`);
process.exit(fail ? 1 : 0);
