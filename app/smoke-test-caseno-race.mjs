/* 접수번호 충돌 자동 회복 (2026-09-11 승희 · 동료 테스트 실측 #288 · 23505 duplicate key)
   ★ 무엇을 지키나
     ① insert 직전에 DB 의 쓰인 번호를 새로 읽어, 내 메모리 번호가 남이 쓴 번호면 비어 있는 다음 번호로 옮긴다
     ② 읽고 넣는 사이 누가 끼어들어 23505 가 나면 한 번 더 읽고 다음 번호로 다시 넣는다 — 그 뒤엔 그대로 실패를 올린다
     ③ 번호가 바뀌면 화면의 건·발송 폼·오류 칸 키가 같이 옮겨지고 알림이 뜬다
     ④ case_no 가 아닌 23505(다른 unique) 는 재시도하지 않는다
   db.js 를 vm 으로 돌리고 fetch 만 가짜로 — 실 DB 없이 돈다. */
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
window.eval("SUPABASE_CONFIG = {url:'https://x.supabase.co', key:'k'};");   /* DB 연결된 것처럼 */
let pass = 0, fail = 0;
const check = (name, ok, extra) => { console.log((ok ? "  ✅ " : "  ❌ ") + name + (ok || extra === undefined ? "" : "   ← " + JSON.stringify(extra).slice(0, 160))); ok ? pass++ : fail++; };
/* 시나리오마다 fetch 만 갈아끼운다 — 같은 창을 쓴다 */
function boot(fetchImpl){ window.fetch = fetchImpl; window.DB.toast = null; window.DB.caseSaveErr = {}; return window; }
const jsonRes = (status, body) => ({ok: status < 300, status, text: async () => JSON.stringify(body), json: async () => body});
const dupErr = {code:"23505", details:null, hint:null, message:"duplicate key value violates unique constraint \"donation_case_no_key\""};

console.log("\n[① insert 직전에 DB 번호를 새로 읽어 옮긴다]");
{
  const calls = [];
  const ctx = boot(async (url, opt) => {
    calls.push({url:String(url), method:(opt && opt.method) || "GET", body: opt && opt.body});
    if (/select=case_no/.test(url)) return jsonRes(200, [{case_no:"287"}, {case_no:"288"}]);   /* 남이 288 까지 썼다 */
    if (opt && opt.method === "POST") return jsonRes(201, [{id: 9001}]);
    return jsonRes(200, []);
  });
  ctx.DB.cases = [{id:"288", dbId:null}];         /* 내 메모리는 288 이 비어 있다고 믿는다(방금 만든 건) */
  ctx.DB.req = {caseId:"288"}; ctx.DB.demo = {subs:{"288":"링크 발급됨"}};
  const c = ctx.DB.cases[0];
  const r = await ctx.createDonation(c);
  check("저장은 성공한다", r && r.ok && c.dbId === 9001, r);
  check("★ 접수번호가 288 → 289 로 옮겨졌다", c.id === "289", c.id);
  const posted = JSON.parse(calls.find(x => x.method === "POST").body)[0];
  check("   DB 에 들어간 case_no 도 289", posted.case_no === "289", posted);
  check("   발송 폼·안내 문구 키도 같이 옮겨졌다", ctx.DB.req.caseId === "289" && ctx.DB.demo.subs["289"] && !ctx.DB.demo.subs["288"]);
  check("   알림이 뜬다 (#288 → #289)", ctx.DB.toast && /#288 → #289/.test(ctx.DB.toast.msg), ctx.DB.toast);
  check("   GET 은 POST 앞에 한 번", calls.findIndex(x => /select=case_no/.test(x.url)) < calls.findIndex(x => x.method === "POST"));
}
console.log("\n[② 읽고 넣는 사이에 끼어들면 23505 → 한 번 더 읽고 다음 번호로]");
{
  let posts = 0;
  const ctx = boot(async (url, opt) => {
    if (/select=case_no/.test(url)) return jsonRes(200, posts === 0 ? [{case_no:"288"}] : [{case_no:"288"}, {case_no:"289"}]);
    if (opt && opt.method === "POST"){ posts++; return posts === 1 ? jsonRes(409, dupErr) : jsonRes(201, [{id: 9002}]); }
    return jsonRes(200, []);
  });
  ctx.DB.cases = [{id:"289", dbId:null}]; ctx.DB.req = {caseId:"289"}; ctx.DB.demo = {subs:{}};
  const c = ctx.DB.cases[0];
  const r = await ctx.createDonation(c);
  check("두 번째 시도로 저장된다", r && r.ok && c.dbId === 9002, r);
  check("★ 번호는 290", c.id === "290", c.id);
  check("   POST 는 정확히 두 번 (무한 재시도 아님)", posts === 2, posts);
}
console.log("\n[②′ 두 번째도 23505 면 그대로 실패를 올린다]");
{
  let posts = 0;
  const ctx = boot(async (url, opt) => {
    if (/select=case_no/.test(url)) return jsonRes(200, [{case_no:"288"}]);
    if (opt && opt.method === "POST"){ posts++; return jsonRes(409, dupErr); }
    return jsonRes(200, []);
  });
  ctx.DB.cases = [{id:"289", dbId:null}]; ctx.DB.req = {caseId:"289"}; ctx.DB.demo = {subs:{}};
  let err = null;
  try { await ctx.createDonation(ctx.DB.cases[0]); } catch (e) { err = e; }
  check("실패가 올라온다 (조용히 성공한 척 안 함)", !!err && /23505/.test(err.message), err && err.message);
  check("   POST 는 두 번에서 멈춘다", posts === 2, posts);
  check("   dbId 는 비어 있다", !ctx.DB.cases[0].dbId);
}
console.log("\n[④ case_no 가 아닌 unique 충돌은 재시도하지 않는다]");
{
  let posts = 0;
  const other = {code:"23505", message:"duplicate key value violates unique constraint \"access_link_token_hash_key\""};
  const ctx = boot(async (url, opt) => {
    if (/select=case_no/.test(url)) return jsonRes(200, []);
    if (opt && opt.method === "POST"){ posts++; return jsonRes(409, other); }
    return jsonRes(200, []);
  });
  ctx.DB.cases = [{id:"301", dbId:null}]; ctx.DB.req = {caseId:"301"}; ctx.DB.demo = {subs:{}};
  let err = null;
  try { await ctx.createDonation(ctx.DB.cases[0]); } catch (e) { err = e; }
  check("다른 unique 는 한 번에 실패로", !!err && posts === 1, {posts, msg: err && err.message});
  check("   번호는 그대로 301", ctx.DB.cases[0].id === "301");
}
console.log("\n[번호 읽기가 실패해도 접수는 막히지 않는다]");
{
  let posts = 0;
  const ctx = boot(async (url, opt) => {
    if (/select=case_no/.test(url)) return jsonRes(500, {message:"boom"});
    if (opt && opt.method === "POST"){ posts++; return jsonRes(201, [{id: 9003}]); }
    return jsonRes(200, []);
  });
  ctx.DB.cases = [{id:"302", dbId:null}]; ctx.DB.req = {caseId:"302"}; ctx.DB.demo = {subs:{}};
  const r = await ctx.createDonation(ctx.DB.cases[0]);
  check("GET 이 죽어도 메모리 번호로 저장한다", r && r.ok && ctx.DB.cases[0].id === "302" && posts === 1, r);
}
console.log("\n[⑤ DB 트리거가 번호를 바꿔 저장했으면 응답의 번호가 정본이다 (patch-20260911-caseno-guard)]");
{
  const ctx = boot(async (url, opt) => {
    if (/select=case_no/.test(url)) return jsonRes(200, [{case_no:"289"}]);             /* 내 번호 290 은 비어 보인다 */
    if (opt && opt.method === "POST") return jsonRes(201, [{id: 9004, case_no:"291"}]);  /* 그 순간 남이 290 을 넣어 DB 가 291 로 */
    return jsonRes(200, []);
  });
  ctx.DB.cases = [{id:"290", dbId:null}]; ctx.DB.req = {caseId:"290"}; ctx.DB.demo = {subs:{"290":"링크 발급됨"}};
  const c = ctx.DB.cases[0];
  const r = await ctx.createDonation(c);
  check("저장은 성공하고", r && r.ok && c.dbId === 9004, r);
  check("★ 화면 번호가 DB 가 준 291 로 옮겨진다", c.id === "291", c.id);
  check("   발송 폼 키·알림도 같이", ctx.DB.req.caseId === "291" && ctx.DB.toast && /#290 → #291/.test(ctx.DB.toast.msg), ctx.DB.toast);
  const same = boot(async (url, opt) => {
    if (/select=case_no/.test(url)) return jsonRes(200, []);
    if (opt && opt.method === "POST") return jsonRes(201, [{id: 9005, case_no:"292"}]);
    return jsonRes(200, []);
  });
  same.DB.cases = [{id:"292", dbId:null}]; same.DB.req = {caseId:"292"}; same.DB.demo = {subs:{}};
  await same.createDonation(same.DB.cases[0]);
  check("   번호가 같으면 아무 알림도 없다", same.DB.cases[0].id === "292" && !same.DB.toast);
}
console.log("\n[패치 파일 — DB 쪽 반쪽이 있다]");
{
  let sql = ""; try { sql = readFileSync(APP + "patch-20260911-caseno-guard.sql", "utf8"); } catch (e) {}
  check("before insert 트리거 donation_case_no_guard", /create trigger donation_case_no_guard/.test(sql) && /before insert on donation/.test(sql));
  check("★ 배정 창구 잠금(advisory lock) 이 있다 — 동시 insert 를 줄 세운다", /pg_advisory_xact_lock/.test(sql));
  check("   숫자가 아닌 번호는 건드리지 않는다", /!~ '\^\[0-9\]\+\$'/.test(sql));
  check("   security definer (RLS 로 안 보이는 행도 겹침 검사)", /security definer/.test(sql));
}
console.log("\n[화면 — 발송 흐름이 옛 번호 변수 대신 건의 현재 번호를 쓴다 (원문)]");
{
  const st = readFileSync(APP + "screen-staff.js", "utf8");
  check("caseSaveErr 키가 newCase.id", /DB\.caseSaveErr\[newCase\.id\] = \{msg/.test(st) && /delete DB\.caseSaveErr\[newCase\.id\]/.test(st));
  check("토스트 문구도 newCase.id", /'⚠️ 접수 #' \+ newCase\.id \+ ' 가 저장되지 않았습니다/.test(st));
}
console.log(`\n${fail ? "❌ " + fail + "건 실패" : "✅ 전부 통과 — 남이 먼저 쓴 접수번호는 스스로 비켜 간다"} (${pass}/${pass + fail})`);
process.exit(fail ? 1 : 0);
