/* 실 DB · Storage 수동 백업 — 읽기만 한다 (2026-09-03 선미)
   운영 기본값은 **별도 백업 없음**이다. 이 스크립트는 필요할 때 담당자가 직접 돌려 받는 **수동 백업** 수단이다.

   ★ 왜 스크립트인가
     대시보드에서 표를 하나씩 내려받으면 **빠뜨린다.** 지금 테이블이 10개다.
     그리고 "그때 이 상태였다" 를 남기는 것이 목적이라 **한 번에 같은 시각**으로 받아야 한다.

   ★ 쓰지 않는다 — GET 만 보낸다. 실 DB 를 건드리지 않는다.

   돌리는 법
     node backup-live.mjs              테이블 10개 (JSON + CSV)
     node backup-live.mjs --files      + Storage 파일 실물까지

   나오는 곳:  data/backup-YYYYMMDD-HHMM/
   ⚠️ `data/` 는 gitignore 대상이다(`.gitignore:26`). **백업에는 개인정보가 들어 있다** —
     `staff.name`·`email` · `attachment.file_name` · Storage 파일 그 자체.
     특히 --files 로 받으면 **성명·주민등록번호·서명이 담긴 신청서 PDF 원본**이 그대로 들어온다.
     git 에 올리지 말 것. 받은 즉시 안전한 곳(접근이 통제된 기관 저장소)에 원본과 같은 수준으로 보관하고,
     필요 없어지면 바로 지울 것. 보관 장소·기간은 기관의 개인정보 보관 정책을 따른다.
     ⚠️ 시스템의 파기 절차(purge_donation)는 이 백업 파일을 지우지 않는다 — 파기한 건이 백업에 남지 않게 함께 관리할 것.
*/
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP  = dirname(fileURLToPath(import.meta.url));
const ROOT = join(APP, "..", "..");
const WITH_FILES = process.argv.includes("--files");

/* ── 설정은 config.local.js 에서 읽는다 (git 에 없는 파일) ────────────── */
let cfg;
try {
  const raw = readFileSync(join(APP, "config.local.js"), "utf8");
  const url = /url\s*:\s*['"]([^'"]+)['"]/.exec(raw);
  const key = /key\s*:\s*['"]([^'"]+)['"]/.exec(raw);
  if (!url || !key) throw new Error("url·key 를 못 찾았습니다");
  cfg = { url: url[1].replace(/\/+$/, "").replace(/\/rest\/v1.*$/, ""), key: key[1] };
} catch (e) {
  console.error("❌ config.local.js 를 읽지 못했습니다 —", e.message);
  console.error("   승희 님이 주신 값이 들어 있는 파일입니다. 이 PC 에 없으면 받아서 넣어 주세요.");
  process.exit(1);
}

const TABLES = ["donation", "distribution", "checklist_item", "attachment",
                "form_submission", "staff", "access_link", "audit_log",
                "inspection", "inspection_finding"];
const BUCKET = "nanumdaejang-docs";   /* db.js:1495 와 같아야 한다 (비공개 버킷) */

const stamp = (() => {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
})();
const OUT = join(ROOT, "data", "backup-" + stamp);
mkdirSync(OUT, { recursive: true });

const H = { apikey: cfg.key, Authorization: "Bearer " + cfg.key };

/* CSV — 엑셀에서 열 수 있게. 값에 쉼표·따옴표·줄바꿈이 있어도 깨지지 않게 감싼다. */
function toCsv(rows) {
  if (!rows.length) return "";
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const cell = v => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return "﻿" + [cols.join(","), ...rows.map(r => cols.map(c => cell(r[c])).join(","))].join("\r\n");
}

let failed = 0;
const summary = [];

console.log(`\n백업 시작 — ${OUT}\n`);

/* ── ① 테이블 ─────────────────────────────────────────────────────── */
for (const t of TABLES) {
  try {
    /* 페이지로 끊어 받는다 — PostgREST 기본 상한(1000)에 조용히 잘리지 않게 */
    let rows = [], from = 0;
    for (;;) {
      const res = await fetch(`${cfg.url}/rest/v1/${t}?select=*`, {
        headers: { ...H, Range: `${from}-${from + 999}`, "Range-Unit": "items" }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 120)}`);
      const page = await res.json();
      rows = rows.concat(page);
      if (page.length < 1000) break;
      from += 1000;
    }
    writeFileSync(join(OUT, t + ".json"), JSON.stringify(rows, null, 2));
    writeFileSync(join(OUT, t + ".csv"), toCsv(rows));
    summary.push({ 대상: t, 건수: rows.length, 결과: "✅" });
    console.log(`  ✅ ${t.padEnd(20)} ${String(rows.length).padStart(5)}행`);
  } catch (e) {
    failed++;
    summary.push({ 대상: t, 건수: null, 결과: "❌ " + e.message });
    console.log(`  ❌ ${t.padEnd(20)} ${e.message}`);
  }
}

/* ── ② Storage 목록 (파일 실물은 --files 일 때만) ──────────────────── */
async function listStorage(prefix) {
  const res = await fetch(`${cfg.url}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...H, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 1000, sortBy: { column: "name", order: "asc" } })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 120)}`);
  return res.json();
}

try {
  /* 폴더 구조가 area/건번호/uuid 라 세 번 훑는다 */
  const files = [];
  for (const area of ["attachments", "forms"]) {
    const lv1 = await listStorage(area);
    for (const d of lv1) {
      if (d.id) { files.push({ path: `${area}/${d.name}`, size: d.metadata?.size ?? null }); continue; }
      const lv2 = await listStorage(`${area}/${d.name}`);
      for (const f of lv2) files.push({ path: `${area}/${d.name}/${f.name}`, size: f.metadata?.size ?? null });
    }
  }
  writeFileSync(join(OUT, "_storage-목록.json"), JSON.stringify(files, null, 2));
  writeFileSync(join(OUT, "_storage-목록.csv"), toCsv(files));
  const mb = (files.reduce((a, f) => a + (f.size || 0), 0) / 1048576).toFixed(1);
  summary.push({ 대상: "Storage 목록", 건수: files.length, 결과: `✅ 합계 ${mb}MB` });
  console.log(`  ✅ ${"Storage 목록".padEnd(18)} ${String(files.length).padStart(5)}개 · 합계 ${mb}MB`);

  if (WITH_FILES) {
    mkdirSync(join(OUT, "files"), { recursive: true });
    let ok = 0, bad = 0;
    for (const f of files) {
      try {
        const r = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${f.path}`, { headers: H });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        const dest = join(OUT, "files", f.path);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, buf);
        ok++;
      } catch (e) { bad++; console.log(`     ⚠️ ${f.path} — ${e.message}`); }
    }
    if (bad) failed++;
    summary.push({ 대상: "Storage 파일", 건수: ok, 결과: bad ? `⚠️ ${bad}건 실패` : "✅" });
    console.log(`  ${bad ? "⚠️" : "✅"} ${"Storage 파일".padEnd(18)} ${String(ok).padStart(5)}개 받음${bad ? ` · ${bad}건 실패` : ""}`);
  } else {
    console.log(`  ·  Storage 파일은 안 받았습니다 — 받으려면 --files`);
  }
} catch (e) {
  failed++;
  console.log(`  ❌ Storage — ${e.message}`);
}

/* ── ③ 받은 사람이 나중에 읽을 쪽지 ───────────────────────────────── */
writeFileSync(join(OUT, "README.txt"),
`나눔대장 실 DB 백업 — ${stamp}

받은 것
${summary.map(s => `  ${s.결과.padEnd(4)} ${s.대상}${s.건수 !== null ? ` (${s.건수})` : ""}`).join("\n")}

⚠️ 이 폴더에는 개인정보가 들어 있습니다.
   staff.name·email · attachment.file_name · Storage 파일 그 자체(영수증·신청서).
   git 에 올리지 마세요. data/ 는 .gitignore 대상입니다.

되돌리는 법 (요약)
  1. 스키마는 app/schema.sql 로 다시 만든다
  2. 각 테이블 CSV 를 Supabase 대시보드에서 import 하거나 JSON 을 PostgREST 로 POST 한다
     ⚠️ id 가 identity 컬럼이라 그대로 넣으면 충돌한다 — 넣는 순서와 id 처리를 먼저 정할 것
  3. Storage 는 files/ 를 같은 경로로 올린다 (--files 로 받았을 때만 있음)

★ 이 백업은 "그때 이 상태였다" 를 남기는 것이 1차 목적입니다.
  완전 복구 절차는 아직 검증하지 않았습니다 — 실제로 되돌려 본 적이 없습니다.
`);

console.log(`\n${"─".repeat(58)}`);
console.log(failed ? `⚠️ ${failed}건 실패 — 위 메시지를 보세요.` : `✅ 백업 완료 — ${OUT}`);
console.log(`   ⚠️ 개인정보가 들어 있습니다. git 에 올리지 마세요.`);
process.exit(failed ? 1 : 0);
