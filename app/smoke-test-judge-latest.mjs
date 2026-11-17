/* 담당자가 서류를 다시 올려도 AI 가 처음 파일만 보던 것 (2026-09-11 · 선미 새벽 발견 · 승희 고침)
   ★ 무엇을 지키나
     ① 한 칸에 파일이 여럿이면 판정 대상은 **가장 최근(마지막)** 파일이다
     ② 최근 파일을 볼 수 없으면(blob·storageKey 없음 — 데모 항목) 그 앞의 볼 수 있는 파일로 물러난다
     ③ 파일이 바뀌면 needsJudge 가 다시 부른다 — 옛 판정이 새 파일 옆에 남지 않는다
     ④ 새로고침 뒤 첨부 복원이 올린 순서(uploaded_at)로 읽는다 — 그래야 "마지막 = 최근" 이 새로고침 뒤에도 참이다
   jsdom 으로 앱을 싣고 FILES 만 직접 채운다. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { appScripts } from "./app-scripts.mjs";
const require = createRequire(process.env.JSDOM_FROM
  ? process.env.JSDOM_FROM.replace(/\/?$/, "/") + "package.json"
  : new URL("../prototype/package.json", import.meta.url));
const { JSDOM } = require("jsdom");
const APP = fileURLToPath(new URL("./", import.meta.url));
const dom = new JSDOM(readFileSync(APP + "index.html", "utf8"), {runScripts:"dangerously", pretendToBeVisual:true, url:"http://localhost:8788/"});
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function(){const n=()=>{};return{lineWidth:0,lineCap:"",strokeStyle:"",clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n};};
window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,S";
for (const f of appScripts()) window.eval(readFileSync(APP + f, "utf8"));
window.eval("render = function(){};");
let pass = 0, fail = 0;
const check = (name, ok, extra) => { console.log((ok ? "  ✅ " : "  ❌ ") + name + (ok || extra === undefined ? "" : "   ← " + JSON.stringify(extra).slice(0, 160))); ok ? pass++ : fail++; };

const put = (id, name, opt) => { window.FILES[id] = Object.assign({id, name, type:"image/jpeg", size:100, blob:null, demo:false, storageKey:null}, opt || {}); return id; };
const item = (ids) => ({key:"proof_buy", n:"구매영수증 또는 매입세금계산서", kind:"A", included:true, r:{fileIds:ids}});

console.log("\n[① 여러 파일이면 마지막(최근) 파일을 판정한다]");
{
  const a = put("f-old", "후원자_틀린영수증.jpg", {storageKey:"attachments/old.jpg"});
  const b = put("f-new", "담당자_올바른영수증.jpg", {storageKey:"attachments/new.jpg"});
  check("★ 판정 대상 = 마지막 파일", window.judgeableFileId(item([a, b])) === "f-new", window.judgeableFileId(item([a, b])));
  check("   파일 하나면 그 파일", window.judgeableFileId(item([a])) === "f-old");
  check("   파일 없으면 null", window.judgeableFileId(item([])) === null);
}
console.log("\n[② 최근 파일을 볼 수 없으면 앞의 볼 수 있는 파일로]");
{
  const a = put("f-ok", "영수증.jpg", {storageKey:"attachments/ok.jpg"});
  const d = put("f-demo", "데모.jpg", {demo:true});                 /* blob·storageKey 없음 */
  check("데모 항목이 마지막이면 그 앞 파일", window.judgeableFileId(item([a, d])) === "f-ok", window.judgeableFileId(item([a, d])));
}
console.log("\n[③ 파일이 바뀌면 다시 부른다 — 옛 판정을 새 파일 옆에 두지 않는다]");
{
  const a = put("f-1", "틀린영수증.jpg", {storageKey:"attachments/1.jpg"});
  const it = item([a]);
  it.r.aiJudge = {state:"done", verdict:"확인 권장", reason:"차이 45,000", file:"틀린영수증.jpg", fileId:"f-1"};
  check("판정한 파일 그대로면 다시 안 부른다", window.needsJudge(it) === false);
  const b = put("f-2", "올바른영수증.jpg", {storageKey:"attachments/2.jpg"});
  it.r.fileIds = [a, b];                                             /* 담당자가 [수취 등록]으로 올림 → 뒤에 붙는다 */
  check("★ 담당자가 새 파일을 올리면 다시 부른다", window.needsJudge(it) === true);
  const it2 = item([a, b]);
  it2.r.aiJudge = {state:"done", verdict:"확인 권장", reason:"-", file:"틀린영수증.jpg", restored:true};   /* DB 에서 되살린 판정(fileId 없음) */
  check("   되살린 판정도 이름이 다르면 다시 부른다", window.needsJudge(it2) === true);
}
console.log("\n[④ 첨부 복원이 올린 순서로 읽는다 (원문)]");
{
  const db = readFileSync(APP + "db.js", "utf8");
  const m = db.match(/function restoreAttachments[\s\S]*?sbGet\(T\.attachment,[\s\S]*?\)\s*\n/);
  check("restoreAttachments 조회에 order=uploaded_at.asc 가 있다", !!m && /order=' \+ A\.uploadedAt \+ '\.asc/.test(m[0]), m && m[0].slice(0, 300));
}
console.log(`\n${fail ? "❌ " + fail + "건 실패" : "✅ 전부 통과 — 담당자가 다시 올린 서류를 AI 가 본다"} (${pass}/${pass + fail})`);
process.exit(fail ? 1 : 0);
