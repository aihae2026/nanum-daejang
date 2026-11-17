/* 백업으로 정말 되돌릴 수 있는가 — 실 DB 를 건드리지 않고 확인한다 (2026-09-03 선미)

   ★ 왜 필요한가
     `backup-live.mjs` 로 받아 두긴 했는데 **되돌려 본 적이 없다.**
     "받아 뒀으니 됐다" 가 제일 위험하다 — 정작 필요할 때 안 되는 것을 그때 안다.

   ★ 왜 진짜로 복구해 보지 않는가
     복구는 INSERT 다. 실 DB 에 새 행이 생기고 **지울 수 없다**(delete 정책 부재).
     그래서 **백업 파일만으로** 되돌릴 수 있는지를 본다 — 읽기만 한다.

   무엇을 보는가
     ① 넣는 순서 — FK 의존을 위상정렬해서 순서를 낸다
     ② ★ id 를 그대로 넣을 수 있는가 — `generated always as identity` 는 그냥 넣으면 거부한다
     ③ ★ 참조 무결성 — 백업 안에서 FK 가 가리키는 행이 실제로 있는가
     ④ 자기참조(attachment.superseded_by) — 한 번에 못 넣는 자리
     ⑤ 빠진 것 — 백업에 없는 테이블, 스키마에 없는 컬럼

   돌리는 법
     node verify-backup.mjs                    가장 최근 백업
     node verify-backup.mjs ../../data/backup-20260903-1449
*/
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP  = dirname(fileURLToPath(import.meta.url));
const ROOT = join(APP, "..", "..");

/* 백업 폴더 고르기 — 인자가 없으면 가장 최근 것 */
let DIR = process.argv[2];
if (!DIR) {
  const base = join(ROOT, "data");
  if (!existsSync(base)) { console.error("❌ data/ 가 없습니다 — 먼저 backup-live.mjs 를 돌리세요."); process.exit(1); }
  const dirs = readdirSync(base).filter(d => d.startsWith("backup-")).sort();
  if (!dirs.length) { console.error("❌ 백업이 없습니다 — 먼저 backup-live.mjs 를 돌리세요."); process.exit(1); }
  DIR = join(base, dirs[dirs.length - 1]);
}

/* ── 스키마에서 뽑은 관계 (schema.sql 과 함께 고친다) ──────────────────
   ⚠️ 여기가 schema.sql 과 어긋나면 이 검사가 조용히 헛돈다.
     ⑤ 가 "스키마에 있는데 백업에 없는 테이블" 을 잡아 그 어긋남을 드러낸다. */
const FK = {
  staff:              [],
  donation:           [["created_by", "staff"]],
  distribution:       [["donation_id", "donation"], ["created_by", "staff"]],
  access_link:        [["donation_id", "donation"], ["distribution_id", "distribution"],
                       ["issued_by", "staff"], ["sent_by", "staff"]],
  checklist_item:     [["donation_id", "donation"], ["distribution_id", "distribution"],
                       ["confirmed_by", "staff"]],
  attachment:         [["checklist_item_id", "checklist_item"], ["superseded_by", "attachment"]],
  form_submission:    [["donation_id", "donation"], ["distribution_id", "distribution"],
                       ["access_link_id", "access_link"]],
  inspection:         [["donation_id", "donation"], ["triggered_by", "staff"]],
  inspection_finding: [["inspection_id", "inspection"], ["checklist_item_id", "checklist_item"],
                       ["distribution_id", "distribution"]],
  audit_log:          [],   /* FK 없음 — target_type/target_id 로 느슨하게 가리킨다 */
};
/* id 를 DB 가 만든다 — 그대로 넣으려면 특별한 구문이 필요하다 */
const IDENTITY = ["donation", "distribution", "access_link", "checklist_item", "attachment",
                  "form_submission", "audit_log", "inspection", "inspection_finding"];
const UUID_PK  = ["staff"];

let fail = 0, warn = 0;
const check = (n, ok, got) => {
  console.log((ok ? "  ✅ " : "  ❌ ") + n + (ok ? "" : "   ← " + JSON.stringify(got)));
  if (!ok) fail++;
};
const note = (n, got) => { console.log("  ⚠️  " + n + (got !== undefined ? "   ← " + JSON.stringify(got) : "")); warn++; };

console.log(`\n백업 검증 — ${DIR}\n`);

/* ── 읽기 ─────────────────────────────────────────────────────────── */
const data = {};
for (const t of Object.keys(FK)) {
  const p = join(DIR, t + ".json");
  if (!existsSync(p)) { check(`${t}.json 이 있다`, false, "파일 없음"); continue; }
  try { data[t] = JSON.parse(readFileSync(p, "utf8")); }
  catch (e) { check(`${t}.json 을 읽을 수 있다`, false, e.message); }
}

console.log("[① 넣는 순서 — FK 를 거스르지 않는 순서가 나오는가]");
const order = [], seen = new Set();
(function topo() {
  let moved = true;
  while (moved) {
    moved = false;
    for (const t of Object.keys(FK)) {
      if (seen.has(t)) continue;
      /* 자기참조는 순서 계산에서 뺀다 — 넣은 뒤 UPDATE 로 잇는다 */
      const deps = FK[t].map(([, ref]) => ref).filter(r => r !== t);
      if (deps.every(d => seen.has(d))) { seen.add(t); order.push(t); moved = true; }
    }
  }
})();
check("순환 없이 순서가 나온다", order.length === Object.keys(FK).length,
      {나온것: order.length, 전체: Object.keys(FK).length, 못푼것: Object.keys(FK).filter(t => !seen.has(t))});
console.log("     " + order.join(" → "));

console.log("\n[② ★ id 를 그대로 넣을 수 있는가]");
note("`generated always as identity` 는 id 를 지정하면 **거부한다**");
console.log("       → `insert ... overriding system value` 를 써야 옛 id 가 살아남는다.");
console.log("       → 안 쓰면 새 id 가 붙고 **FK 가 전부 옛 id 를 가리켜 깨진다.**");
for (const t of IDENTITY) {
  const rows = data[t] || [];
  const ids = rows.map(r => r.id).filter(v => v !== null && v !== undefined);
  const max = ids.length ? Math.max(...ids) : 0;
  console.log(`     ${t.padEnd(20)} ${String(rows.length).padStart(4)}행 · id 최대 ${max}` +
              (max ? `  → 넣은 뒤 시퀀스를 ${max + 1} 로 올려야 다음 접수가 충돌하지 않는다` : ""));
}
for (const t of UUID_PK) {
  const rows = data[t] || [];
  console.log(`     ${t.padEnd(20)} ${String(rows.length).padStart(4)}행 · uuid — 그대로 넣을 수 있다`);
}

console.log("\n[③ ★★ 참조 무결성 — 백업 안에서 FK 가 실제로 이어지는가]");
let broken = 0;
for (const [t, fks] of Object.entries(FK)) {
  for (const [col, ref] of fks) {
    const rows = data[t] || [], target = data[ref] || [];
    const have = new Set(target.map(r => String(r.id)));
    const bad = rows.filter(r => r[col] !== null && r[col] !== undefined && !have.has(String(r[col])));
    if (bad.length) {
      broken += bad.length;
      check(`${t}.${col} → ${ref}`, false,
            {끊긴행: bad.length, 예: bad.slice(0, 3).map(r => ({id: r.id, [col]: r[col]}))});
    }
  }
}
check("★★ 끊긴 참조가 없다", broken === 0, {끊긴수: broken});

console.log("\n[④ 자기참조 — 한 번에 못 넣는 자리]");
const selfRef = Object.entries(FK).filter(([t, fks]) => fks.some(([, r]) => r === t));
if (selfRef.length) {
  for (const [t] of selfRef) {
    const col = FK[t].find(([, r]) => r === t)[0];
    const used = (data[t] || []).filter(r => r[col] !== null && r[col] !== undefined).length;
    if (used) note(`${t}.${col} 가 ${used}행에서 쓰인다 — 넣을 때는 비우고 **뒤에 UPDATE 로 잇는다**`);
    else console.log(`  ✅ ${t}.${col} 를 쓰는 행이 없다 — 그냥 넣으면 된다`);
  }
} else console.log("  ✅ 자기참조 없음");

console.log("\n[⑤ 빠진 것]");
const schema = readFileSync(join(APP, "schema.sql"), "utf8");
const inSchema = [...schema.matchAll(/create table (?:if not exists\s+)?(\w+)/g)].map(m => m[1]);
const missing = inSchema.filter(t => !(t in FK));
check("스키마의 테이블이 이 검사에 전부 들어 있다", missing.length === 0, missing);
const noFile = Object.keys(FK).filter(t => !(t in data));
check("백업에 모든 테이블 파일이 있다", noFile.length === 0, noFile);
const empty = Object.keys(data).filter(t => !data[t].length);
if (empty.length) note("행이 0인 테이블 — 원래 비었는지 못 받은 건지 확인 필요", empty);
if (!existsSync(join(DIR, "files"))) note("Storage 파일 실물이 없다 — `--files` 없이 받은 백업이다");
else console.log("  ✅ Storage 파일 실물이 있다");

console.log("\n" + "─".repeat(60));
console.log(fail ? `❌ ${fail}건 실패 — 지금 백업으로는 되돌릴 수 없습니다.`
                 : `✅ 백업 자체는 온전합니다 (경고 ${warn}건).`);
console.log("   ⚠️ 이 검사는 '백업이 온전한가' 까지다. **실제로 되돌려 본 것은 아니다.**");
console.log("      복구 절차는 팀 내부 기록(미공개)에 있습니다.");
process.exit(fail ? 1 : 0);
