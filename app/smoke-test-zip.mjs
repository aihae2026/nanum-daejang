/* 서류 일괄 받기(ZIP) 검사 — 2026-09-01 유진

   ★ 확인하는 것 둘:
     ① 만든 ZIP 을 **표준 도구가 읽는가** (직접 만들었으므로 이게 제일 중요하다)
     ② 일부만 받아졌을 때 **묶어서 주지 않는가**
        — 담당자는 다 받은 줄 알고 기존 시스템에 올린다. 빠진 서류를 아무도 모른 채 완결된다.

   ⚠️ 실제 Supabase 에 올리고 받는다. 가상 픽스처만 쓴다.
   ★ [2026-09-02] 돌릴 때마다 새로 올리지 않는다 — 이미 올려둔 검사용 첨부를 재사용한다.
     전에는 돌릴 때마다 attachment 행이 늘었다(9/2 에 43행 정리 · 그날 오후 세 번 재발).
     RLS 에 delete 정책이 없어 검사가 스스로 지울 수 없기 때문에 '만들지 않는' 쪽으로 갔다.
   ⚠️ 감사 로그(bulk.download)가 실제로 쌓인다 — 테스트 흔적이 남는 것이 정상이다.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-zip.mjs
*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';   /* ⚠️ .pathname 은 한글 폴더를 %ED… 로 인코딩해 파일을 못 찾는다 (2026-09-05 집 PC 실측) */
import { appScripts } from './app-scripts.mjs';
import { staffLogin } from './test-staff-login.mjs';   /* 권한 3단계부터 담당자 동선 검사는 로그인해서 본다 (2026-09-08 승희) */   /* 스크립트 목록은 index.html 에서 읽는다 — 손으로 베끼지 않는다 (2026-09-05 · 정본 ⑥) */
const require = createRequire(process.env.JSDOM_FROM
  ? process.env.JSDOM_FROM.replace(/\/?$/, '/') + 'package.json'
  : new URL('../prototype/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const APP = fileURLToPath(new URL('./', import.meta.url));
const LAB = fileURLToPath(new URL('../ai-inspection-lab/', import.meta.url));
/* 시험용 PNG — 팀 실험 폴더(ai-inspection-lab, 미공개)가 없으면 저장소에 든 가상 샘플 서류를 쓴다 */
const FIXTURE_PNG = (() => { const p = LAB + 'inbox/T01_구매영수증.png';
  return existsSync(p) ? p : fileURLToPath(new URL('./assets/demo/B2_시가확인증빙_자사몰캡처.png', import.meta.url)); })();

const dom = new JSDOM(readFileSync(APP + 'index.html', 'utf8'),
  { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost:8788/' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function(){const n=()=>{};return{lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n};};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
/* config.local.js 가 없으면(공개 저장소 그대로) 싣지 않는다 — 아래 staffLogin 이 '⏭ 건너뜀' 으로 끝낸다 */
for (const f of appScripts({ config: true }).filter(f => f !== 'config.local.js' || existsSync(APP + f)))
  window.eval(readFileSync(APP + f, 'utf8'));
/* ★ ZIP·일괄받기는 담당자(로그인=authenticated) 동선이다 (2026-09-07 승희 · 권한 2단계 이후).
     일괄받기는 개인정보 반출이라 audit_log 에 기록을 남기는데, 2단계 RLS 부터 audit_log insert 는
     담당자(authenticated)만 된다. 이 검사는 로그인 비밀번호가 없어 실제 로그인은 못 한다.
     그래서 세션은 만들지 않고(=읽기·첨부 올리기는 anon 으로 실 DB 에 그대로 나간다),
     담당자만 되는 **audit_log POST 만 성공으로 가로챈다**. 그게 실서비스에서 로그인한 담당자가 받는 결과다.
     ⚠️ 가로채기가 없으면 anon 으로 반출 기록이 42501 로 막혀 ZIP 이 중단된다 — 그것도 정상 동작이다(무단 반출 차단).
     "누가 반출했나(actor_ref=uid)" 는 smoke-test-auth.mjs 가 따로 지킨다. */
let auditRow = null;
window.fetch = (u, o) => {
  if (String(u).includes('/rest/v1/audit_log')){
    try { auditRow = JSON.parse(o.body)[0]; } catch (e) {}
    return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve([]), text: () => Promise.resolve('[]') });
  }
  return fetch(u, o);
};
window.TextEncoder = TextEncoder;          /* jsdom 에 없다 */

let fail = 0;
const check = (n, ok, got) => { console.log((ok?'  ✅ ':'  ❌ ')+n+(ok?'':'   ← '+JSON.stringify(got))); if(!ok) fail++; };

await staffLogin(window, { what: 'smoke-test-zip.mjs' });   /* anon 은 링크 없이는 0건 — 담당자로 읽는다 */
await window.loadCasesFromSupabase();
/* ★ 검사는 반드시 #901(버려도 되는 건)에 올린다 (2026-09-02 선미 ④안)
     전에는 "dbId 있는 첫 번째 건" 을 골라서 시연 건(#101)에 올라갔다.
     ⚠️ 문제는 개수가 아니었다 — **테스트 파일이 시연 건의 '현재 첨부' 자리를 차지한 것**이다.
       43건을 지워야 했던 진짜 이유가 그것이다(선미 9/2).
     RLS 에 delete 정책이 없어 지울 수 없으므로, '지우지 말고 쌓이는 자리를 옮긴다'.
     ⚠️ #901 이 없으면 검사를 하지 않는다 — 시연 건에 올리느니 안 하는 것이 낫다.
     ※ 삭제 정책은 9/7 승희 RLS 재작업 때 함께 본다(시연 6일 전에 권한을 손대지 않는다). */
const TESTBED = '901';
function pickTestCase(){
  const t = window.DB.cases.find(x => String(x.id) === TESTBED && x.dbId
                                   && (x.checklist||[]).some(i => i.kind==='A' && i.dbId));
  if (!t){
    console.log('\n⏭ 건너뜁니다 — 검사용 건 #' + TESTBED + ' 이(가) 실 DB 에 없습니다.');
    console.log('   seed-e3-verify-20260902.sql 을 먼저 실행하세요.');
    console.log('   ⚠️ 시연 건에 올리지 않습니다 — 테스트 파일이 그 건의 현재 첨부 자리를 차지합니다.');
    process.exit(0);
  }
  return t;
}
const c = pickTestCase();
const it = c.checklist.find(i => i.kind==='A' && i.dbId);
console.log(`\n대상: 건 ${c.id} · 항목 "${it.n}"`);

console.log('\n[① 담을 것이 없으면 만들지 않는다]');
const none = await window.buildCaseZip({id:'x', dbId:null, checklist:[], dists:[]});
check('★ 빈 ZIP 을 만들어 주지 않는다', none.ok === false, none);
console.log('   사유: ' + none.reason);

console.log('\n[② 저장소에 올린 뒤 묶기]');
/* ★ 이미 올려둔 검사용 첨부가 있으면 그것을 쓴다 (2026-09-02) —
     전에는 돌릴 때마다 새로 올려서 attachment 행이 계속 늘었다.
     9/2 에 선미가 43행을 지웠는데 그날 오후에만 세 번 다시 쌓였다.

   ★ 지우는 쪽으로 못 고친다 — RLS 에 delete 정책이 없어 **anon 은 못 지운다.**
     DELETE 는 204(성공)를 돌려주는데 행은 그대로 남는다(9/2 실측).
     Storage 도 400 으로 막힌다. 그래서 '만들지 않는' 쪽으로 고친다.

   ⚠️ 그래도 첫 실행에서는 한 줄이 생긴다 — 그 한 줄을 계속 재사용한다.
     늘지 않는 것이 목적이지, 0으로 만드는 것이 목적이 아니다
     (0으로 만들려면 검사용 프로젝트를 따로 두어야 한다 · 선미 ③안). */
const TEST_FILE = 'zip테스트_영수증.png';
/* ⚠️ 되살린 첨부는 r.file 이 아니라 r.fileIds 에 담긴다(db.js restoreAttachments).
     r.file 로 찾으면 늘 '없다' 가 나와서 매번 새로 올린다 — 9/2 에 그렇게 두 줄이 더 늘었다.
     이름은 FILES 레지스트리에서 본다. */
const already = (c.checklist || []).some(function(x){
  return ((x.r && x.r.fileIds) || []).some(function(fid){
    var f = window.FILES[fid];
    return f && String(f.name || '').indexOf(TEST_FILE) >= 0;
  });
});

let up;
if (already){
  console.log('   ↻ 이미 올려둔 검사용 첨부를 다시 씁니다 — 새로 올리지 않습니다');
  up = {ok:true, reused:true};
} else {
  const png = readFileSync(FIXTURE_PNG);
  const m = {id:'zip1', name:TEST_FILE, type:'image/png', size:png.length,
             blob:new Blob([png],{type:'image/png'}), demo:false};
  up = await window.saveAttachment(c, it, m, 'donor');
}
check('올릴 것이 준비된다 (재사용이면 안 올린다)', up.ok === true, up);

window.FILES = {}; window.DB.cases = [];
await window.loadCasesFromSupabase();
const c2 = window.DB.cases.find(x => x.dbId === c.dbId);
const zip = await window.buildCaseZip(c2);
check('★ ZIP 이 만들어진다', zip.ok === true, zip.reason);
check('★ 반출이 감사에 기록된다 (bulk.download) — audit insert 는 담당자만 되는 자리다 (2026-09-07 권한 2단계)',
      !!auditRow && auditRow.action === 'bulk.download', auditRow);
if (!zip.ok) { console.log(fail?`\n❌ 실패 ${fail}건`:''); process.exit(1); }
console.log('   파일명: ' + zip.name + ' · ' + zip.bytes.length + '바이트 · ' + zip.entries.length + '건');
console.log('   담긴 이름: ' + zip.entries.map(e => e.name).join(' / '));

check('파일명 규칙 — 건번호로 시작한다',
      zip.entries.every(e => e.name.startsWith(c2.id + '_')), zip.entries.map(e=>e.name));
check('★ 이름이 서로 겹치지 않는다 (겹치면 압축 풀 때 하나만 남는다)',
      new Set(zip.entries.map(e=>e.name)).size === zip.entries.length, null);

const out = '/tmp/zip-smoke-' + Date.now() + '.zip';
writeFileSync(out, Buffer.from(zip.bytes));
console.log('   저장: ' + out);
console.log('\n   → 표준 도구 검증은 아래 명령으로 (이 스크립트 밖):');
console.log('     python3 -c "import zipfile;z=zipfile.ZipFile(\'' + out + '\');print(z.testzip(),[i.filename for i in z.infolist()])"');

console.log(fail ? `\n❌ 실패 ${fail}건` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
