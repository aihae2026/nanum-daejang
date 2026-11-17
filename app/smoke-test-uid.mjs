/* 항목 주소(uid) 검사 — 2026-09-01 유진 · 연수 합의

   ★ 확인하는 것: 다기관 배분에서 **엉뚱한 기관 항목을 잡지 않는가.**
     예전 getItem 은 key 로만 찾아 여러 개가 걸리면 첫 번째를 조용히 반환했다.
     그래서 담당자가 3번 기관 인수증을 수취 처리해도 1번 기관 것이 처리됐다 — 에러도 없이.
     수취 처리·AI 판정이 전부 이 함수를 지나간다(호출부 13곳).

   ⚠️ 실제 Supabase 를 읽는다. 실 DB 101번이 기관 3곳이라 이 검사가 성립한다.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-uid.mjs
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
const dom=new JSDOM(readFileSync(APP+'index.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost:8788/'});
const {window}=dom;
window.HTMLCanvasElement.prototype.getContext=function(){const n=()=>{};return{lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n};};
window.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/png;base64,S';
/* config.local.js 가 없으면(공개 저장소 그대로) 싣지 않는다 — 아래 staffLogin 이 '⏭ 건너뜀' 으로 끝낸다 */
for(const f of appScripts({ config: true }).filter(f => f !== 'config.local.js' || existsSync(APP+f)))
  window.eval(readFileSync(APP+f,'utf8'));
window.fetch=(u,o)=>fetch(u,o);
let fail=0; const check=(n,ok,got)=>{console.log((ok?'  ✅ ':'  ❌ ')+n+(ok?'':'   ← '+JSON.stringify(got))); if(!ok)fail++;};

await staffLogin(window, { what: 'smoke-test-uid.mjs' });   /* anon 은 링크 없이는 0건 — 담당자로 읽는다 */
await window.loadCasesFromSupabase();
const c = window.DB.cases.find(x => (x.dists||[]).length > 1);
console.log(`\n대상: 건 ${c.id} · 배분처 ${c.dists.length}곳`);
const inss = c.checklist.filter(i => i.key === 'inss');
console.log('   인수증 uid: ' + inss.map(i => i.uid).join(' · '));

console.log('\n[uid 로 부르면 정확히 하나]');
inss.forEach(it => {
  const got = window.getItem(c.id, it.uid);
  check('  ' + it.uid + ' → ' + (got ? got.n : 'null'), got === it, got && got.n);
});

console.log('\n[key 로만 부르면 — 예전에는 1번 기관을 조용히 줬다]');
const amb = window.getItem(c.id, 'inss');
check('★ 첫 번째를 주지 않고 null 을 준다', amb === null, amb && amb.n);
const msg = window.itemLookupError(c.id, 'inss');
console.log('   사유: ' + msg);
check('★ 왜 못 찾았는지 사람이 읽을 수 있다 (화면이 토스트로 띄울 것)',
      /같은 서류가 3개|배분기관별/.test(msg || ''), msg);

console.log('\n[접수 단계는 그대로 — 기존 호출부가 안 깨진다]');
const one = window.getItem(c.id, 'proof_buy');
check('key 로 불러도 잘 찾는다', !!one, one);
check('  uid 가 key 와 같다 (배분 아님)', one && one.uid === 'proof_buy', one && one.uid);
check('없는 항목은 사유를 준다', /찾을 수 없습니다/.test(window.itemLookupError(c.id,'없는키')||''), null);
check('찾았으면 사유가 null', window.itemLookupError(c.id, inss[0].uid) === null, null);

console.log('\n[uid 가 순번이 아니라 기관 id 기반인가 — 연수 지적]');
check('★ uid 에 distribution_id 가 들어 있다',
      inss.every(i => i.uid === 'inss#' + i.distId), inss.map(i => [i.uid, i.distId]));
console.log(fail ? `\n❌ 실패 ${fail}건` : '\n✅ 전부 통과');
process.exit(fail?1:0);
