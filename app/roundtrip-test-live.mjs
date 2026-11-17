/* 파일 저장소 왕복 실측 — 2026-09-01 유진

   올리기 → attachment 행 → **새로고침** → 되살리기 → 열기 → 파일로 받기.
   ★ 이 작업의 목적("새로고침하면 사라진다"를 고친다)이 실제로 달성됐는지
     끝에서 끝까지 확인하는 유일한 테스트다. 조각 테스트만으로는 알 수 없다.

   ⚠️ 실제 Supabase 에 진짜로 파일을 올린다. 가상 픽스처(T01)만 쓴다 —
     로그인·RLS 붙기 전까지 실 서류 금지(선미 조건 2026-09-01).
   ⚠️ 돌릴 때마다 attachments/{건}/ 아래에 파일이 하나씩 쌓인다.
     자주 돌렸다면 대시보드에서 정리한다.

   돌리는 법:  JSDOM_FROM=/tmp/fast node roundtrip-test-live.mjs
*/
import { readFileSync, existsSync } from 'node:fs';
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
const dom=new JSDOM(readFileSync(APP+'index.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost:8788/'});
const {window}=dom;
window.HTMLCanvasElement.prototype.getContext=function(){const n=()=>{};return{lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n};};
window.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,S';
for(const f of appScripts({ config: true }))
  window.eval(readFileSync(APP+f,'utf8'));
window.fetch=(u,o)=>fetch(u,o);

let fail=0; const check=(n,ok,got)=>{console.log((ok?'  ✅ ':'  ❌ ')+n+(ok?'':'   ← '+JSON.stringify(got))); if(!ok)fail++;};

await staffLogin(window, { what: 'roundtrip-test-live.mjs' });   /* anon 은 링크 없이는 0건 — 담당자로 읽는다 */
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
console.log(`\n대상: 건 ${c.id} (dbId ${c.dbId}) · 항목 "${it.n}" (dbId ${it.dbId})`);

const png = readFileSync(FIXTURE_PNG);
/* ⚠️ Blob 은 jsdom 것이 아니라 Node 것을 쓴다.
   jsdom Blob 을 Node 의 fetch 에 넘기면 '[object Blob]'(13바이트) 문자열로 뭉개져 올라간다.
   업로드는 200 으로 성공해서 **테스트가 초록으로 거짓 통과한다** —
   바이트 수를 대조하는 검사(③)를 넣고서야 잡았다(2026-09-01).
   실제 브라우저에서는 문제가 없다. 테스트 환경만의 함정이다. */
const m = {id:'rt1', name:'왕복테스트_영수증.png', type:'image/png', size:png.length,
           blob:new Blob([png],{type:'image/png'}), demo:false};

console.log('\n[① 올리기 + attachment 행]');
const r = await window.saveAttachment(c, it, m, 'donor');
check('★ 저장소에 올라가고 DB에 행이 남는다', r.ok === true, r);
if(!r.ok){ console.log('   사유: '+r.reason); process.exit(1); }
console.log('   경로: ' + r.storageKey);
check('경로가 이 건 폴더 아래다', r.storageKey.startsWith('attachments/'+c.dbId+'/'), r.storageKey);
check('★ 원본 이름이 경로에 없다', !r.storageKey.includes('왕복테스트'), r.storageKey);
check('DB 행에 원본 이름이 남는다', r.row && r.row.file_name === '왕복테스트_영수증.png', r.row && r.row.file_name);
check('누가 올렸는지 남는다', r.row && r.row.uploaded_by_role === 'donor', r.row && r.row.uploaded_by_role);

console.log('\n[② 새로고침 — 처음부터 다시 읽는다]');
window.FILES = {};                       /* 브라우저 메모리를 통째로 비운다 = 새로고침 */
window.DB.cases = [];
await window.loadCasesFromSupabase();
const c2 = window.DB.cases.find(x => x.dbId === c.dbId);
const it2 = c2.checklist.find(i => i.dbId === it.dbId);
const fids = (it2.r.fileIds || []);
check('★ 새로고침해도 첨부가 살아 있다 (이번 작업의 핵심)', fids.length > 0, fids);
if(!fids.length){ console.log(fail?`\n❌ 실패 ${fail}건`:''); process.exit(1); }
const restored = window.FILES[fids[fids.length-1]];
console.log('   되살아난 이름: ' + restored.name);
check('원본 이름으로 보인다', /왕복테스트_영수증\.png/.test(restored.name), restored.name);
check('파일 바이트는 미리 안 받는다 (blob 없음)', restored.blob === null, restored.blob);

console.log('\n[③ 화면에서 열기]');
const url = window.fileUrl(restored.id);
check('★ fileUrl 이 주소를 준다 (선미님 두 줄 + 제 서명 URL이 맞물린다)', !!url, url);
const res = await fetch(url);
check('★ 그 주소로 진짜 파일이 내려온다', res.ok, res.status);
const got = Buffer.from(await res.arrayBuffer());
check('★ 올린 파일과 바이트가 같다', got.length === png.length, {올림:png.length, 받음:got.length});

console.log('\n[③-2 주소 만료 — 오래 열어 둔 화면]');
/* ★ 30분을 기다릴 수 없으니 만료 시각을 과거로 당겨 '곧 만료' 상태를 만든다.
   이 검사가 없으면 "화면을 오래 켜두면 파일이 안 열린다"를 아무도 못 잡는다. */
/* 주소에 실린 토큰에서 '서버가 아는 진짜 만료 시각'을 꺼낸다.
   ★ 우리가 들고 있는 urlExpiresAt 은 어디까지나 추정이다 — 서명 시각을 우리가 정한 게 아니다.
     둘이 어긋나면 "갱신했는데 여전히 만료"가 되므로, 서버 값으로 확인한다. */
const tokenExp = (u) => {
  const t = new URL(u).searchParams.get('token');
  return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).exp;
};
const beforeExp = tokenExp(restored.url);
check('되살릴 때 만료 시각이 기록된다', typeof restored.urlExpiresAt === 'number', restored.urlExpiresAt);
check('토큰 유효기간이 30분이다', Math.abs((beforeExp * 1000 - Date.now()) - 1800e3) < 60e3,
      Math.round((beforeExp * 1000 - Date.now()) / 1000) + '초');

await new Promise(r => setTimeout(r, 1100));         /* 서명 시각이 1초 넘게 달라지도록 */
restored.urlExpiresAt = Date.now() + 60 * 1000;      /* 1분 뒤 만료 = 갱신 대상 */
const n = await window.refreshExpiringUrls();
check('★ 곧 만료될 주소를 다시 받아온다', n === 1, n);
const afterExp = tokenExp(window.FILES[restored.id].url);
check('★ 서버가 아는 만료 시각이 실제로 미뤄진다 (우리 추정이 아니라)',
      afterExp > beforeExp, {before:beforeExp, after:afterExp});
const res2 = await fetch(window.FILES[restored.id].url);
check('★ 갱신된 주소로도 파일이 내려온다', res2.ok, res2.status);

/* 아직 여유 있는 주소는 건드리지 않는다 — 쓸데없이 요청을 늘리지 않는다 */
const n2 = await window.refreshExpiringUrls();
check('★ 여유 있는 주소는 다시 받지 않는다', n2 === 0, n2);

console.log('\n[④ 파일로 받기]');
const d = await window.downloadUrlFor(restored.id);
check('받을 주소가 나온다', d.ok === true, d);
const head = await fetch(d.url);
const cd = head.headers.get('content-disposition') || '';
check('★ 원본 이름으로 저장된다', /왕복테스트|filename/i.test(cd), cd);

console.log(fail ? `\n❌ 실패 ${fail}건` : '\n✅ 왕복 전부 통과');
process.exit(fail?1:0);
