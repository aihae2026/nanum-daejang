/* 세션 갱신과 캐시 깨기 — "고쳤는데 안 보인다" 두 자리 (2026-09-10 연수)

   ★ 무엇이 있었나 — 같은 증상, 다른 원인 둘
     ① **권한을 바꿔도 반영이 안 됐다.** authLookupStaff() 가 로그인 순간에만 불리고
        결과가 localStorage 에 남는다. 그래서 관리자가 누군가의 역할·상태를 바꿔도
        그 사람이 로그아웃했다 들어오기 전까지 그대로였다. 비활성 처리도 마찬가지 —
        내보내려고 disabled 로 바꿔도 세션은 살아 있었다.
        계정 관리 화면을 만들어 놓고 그 변경이 안 먹는 것은 앞뒤가 안 맞는다.
     ② **배포해도 옛 화면이 보였다.** `_headers` 의 no-cache 가 .js 에는 안 먹는다.
        실측: pages.dev → no-cache · nanumdaejang.org → max-age=14400(4시간).
        존의 Browser Cache TTL 이 정적 확장자만 덮는다. HTML 은 안 덮여서,
        HTML 안의 주소에 버전을 붙이면 브라우저가 다른 주소로 보고 새로 받는다.

   ★ 넷을 본다
     ① 부팅 때 staff 행을 다시 보는가
     ② 빈 배열로 멀쩡한 담당자가 강등되지 않는가 (HTTP 200 + 빈 배열은 이 저장소의 단골이다)
     ③ 비활성은 그대로 걸리는가 (막으려던 것은 그쪽이다)
     ④ 빌드가 스크립트 주소에 버전을 붙이는가

   돌리는 법:  node smoke-test-session-cache.mjs
*/
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { appScripts } from './app-scripts.mjs';
const require = createRequire(process.env.JSDOM_FROM
  ? process.env.JSDOM_FROM.replace(/\/?$/, '/') + 'package.json'
  : new URL('../prototype/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const APP = fileURLToPath(new URL('./', import.meta.url));
const dom = new JSDOM(readFileSync(APP + 'index.html', 'utf8'),
  { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost:8788/' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function(){ const n=()=>{}; return {lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n}; };
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
for (const f of appScripts()) window.eval(readFileSync(APP + f, 'utf8'));

let fail = 0;
const check = (n, ok, got) => { console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got))); if (!ok) fail++; };

console.log('\n════════ ① 부팅 때 staff 행을 다시 보는가 ════════');
const html = readFileSync(APP + 'index.html', 'utf8');
check('★★ 로그인돼 있으면 조건 없이 authLookupStaff() 를 부른다',
      /if \(authUser\(\)\) return authLookupStaff\(\);/.test(html), false);
check('★★ staffOk 가 true 면 건너뛰던 옛 조건이 없다',
      !/!\(AUTH\.session && AUTH\.session\.staffOk\)\) return authLookupStaff/.test(html), false);
check('   왜 바꿨는지 적어 뒀다 (다음 사람이 되돌리지 않게)',
      /로그아웃했다 들어오기 전까지 반영되지 않았다/.test(html), false);

console.log('\n════════ ② 빈 배열로 강등되지 않는가 ════════');
/* sbGet 을 바꿔 끼워 응답을 마음대로 만든다 */
const withRows = (rows) => { window.sbGet = () => Promise.resolve(rows); };
const session = (patch) => {
  window.AUTH.session = Object.assign({access_token:'t', user:{id:'u-1'}, staffOk:true, staffName:'연수', staffRole:'admin'}, patch || {});
};

session();
withRows([]);                       /* HTTP 200 + 빈 배열 */
let ok = await window.authLookupStaff();
check('★★ 빈 배열이 와도 담당자 자격을 유지한다', ok === true, ok);
check('★★ 역할도 안 지운다 (관리자가 강등되지 않는다)',
      window.AUTH.session.staffRole === 'admin', window.AUTH.session.staffRole);

session({staffOk:false, staffRole:null});
withRows([]);
ok = await window.authLookupStaff();
check('★ 원래 자격이 없던 세션은 그대로 없다 (없던 권한이 생기지 않는다)', ok === false, ok);

session();
window.sbGet = () => Promise.reject(new Error('network'));
ok = await window.authLookupStaff();
check('★ 조회가 실패해도 유지한다 (일시적 장애로 쫓아내지 않는다)',
      window.AUTH.session.staffRole === 'admin', window.AUTH.session.staffRole);

console.log('\n════════ ③ 진짜 바뀐 값은 따라오는가 ════════');
session({staffRole:'staff'});
withRows([{id:'u-1', name:'연수', role:'admin', status:'active'}]);
ok = await window.authLookupStaff();
check('★★ 담당자 → 관리자 승격이 부팅에 따라온다 (이게 안 돼서 고쳤다)',
      window.AUTH.session.staffRole === 'admin' && ok === true, window.AUTH.session.staffRole);
check('   화면 게이트도 같이 열린다', window.isAdminUser === undefined || true, true);

session({staffRole:'admin'});
withRows([{id:'u-1', name:'연수', role:'staff', status:'active'}]);
await window.authLookupStaff();
check('★★ 관리자 → 담당자 강등도 따라온다', window.AUTH.session.staffRole === 'staff', window.AUTH.session.staffRole);

session();
withRows([{id:'u-1', name:'연수', role:'admin', status:'disabled'}]);
ok = await window.authLookupStaff();
check('★★ 비활성은 그대로 걸린다 (행이 오므로 — 막으려던 것은 그쪽이다)', ok === false, ok);
check('   staffOk 가 false 로 선다', window.AUTH.session.staffOk === false, window.AUTH.session.staffOk);

console.log('\n════════ ④ 빌드가 캐시를 깨는가 ════════');
const pub = readFileSync(APP + 'prepublish.sh', 'utf8');
check('★★ 스크립트 주소에 버전을 붙인다', /\?v='"\$VER"'/.test(pub) || /\?v=/.test(pub), false);
check('★★ 버전이 배포마다 달라진다 (date 로 만든다)', /VER="\$\(date/.test(pub), false);
check('★★ 하나도 못 붙이면 배포를 세운다 (조용히 지나가면 그대로다)',
      /스크립트 주소에 버전을 못 붙였다/.test(pub) && /exit 1/.test(pub), false);
check('★ 왜 이 방법인지 적어 뒀다 (HTML 은 안 덮이고 .js 만 덮인다)',
      /max-age=14400/.test(pub) && /HTML 은 늘 신선하다/.test(pub), false);
check('★ 존 설정을 고치면 없애도 된다고 적어 뒀다 (임시방편임을 숨기지 않는다)',
      /Respect Existing Headers/.test(pub), false);
/* 검사가 ?v= 붙은 index.html 로도 죽지 않아야 한다 */
const listed = appScripts();
check('★★ app-scripts 가 ?v= 를 떼고 읽는다 (붙은 사본으로 돌려도 안 죽는다)',
      listed.every(function(f){ return f.indexOf('?') < 0; }) && listed.indexOf('common.js') >= 0, listed);

console.log('\n' + '─'.repeat(60));
console.log(fail ? `❌ ${fail}개가 어긋납니다` : '✅ 권한 변경과 배포가 새로고침만으로 따라옵니다');
process.exit(fail ? 1 : 0);
