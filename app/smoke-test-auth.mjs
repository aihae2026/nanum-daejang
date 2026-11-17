/* 담당자 로그인 (2026-09-07 승희 · 권한 2단계)

   ★ 무엇을 지키나
     ① 세션이 없으면 Bearer 는 anon key — 후원자(링크)는 그대로 anon 으로 돈다
     ② 로그인하면 Bearer 가 access_token 으로 바뀐다 · staff 행을 찾으면 staffOk
     ③ 새로고침해도 세션이 남는다(localStorage) · 만료 임박이면 refresh 로 새 토큰
     ④ 로그인 벽 — 실 DB + 담당자 역할 + 세션 없음 일 때만 · 후원자(donor)·데모는 벽이 없다
     ⑤ 감사 기록(pdf.view · bulk.download)의 actor_ref 에 uid 가 실린다 · 없으면 그 사실을 남긴다
     ⑥ 새 접수의 created_by — staff 행이 있을 때만 uid, 없으면 비운다(FK)
     ⑦ 틀린 비밀번호는 사람이 읽을 문장으로 · 로그아웃하면 anon 으로 돌아온다

   fetch 를 흉내낸다 — 서버·DB 불필요.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-auth.mjs
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
  { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost:8788/' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function(){ const n=()=>{}; return {lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n}; };
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
for (const f of appScripts()) window.eval(readFileSync(APP + f, 'utf8'));

let fail = 0;
const check = (n, ok, got) => { console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got))); if (!ok) fail++; };
const tick = () => new Promise(r => setTimeout(r, 0));

/* 가짜 Supabase — auth 두 주소 + staff 조회 */
window.eval("SUPABASE_CONFIG = {url:'https://x.supabase.co', key:'anon-k'};");
const calls = [];
let staffRows = [{id:'u1', name:'홍승희', role:'staff', status:'active'}];
let pwOk = true, tokenNo = 0;
window.fetch = (url, opt) => {
  calls.push({url:String(url), opt});
  const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
  if (/\/auth\/v1\/token\?grant_type=password/.test(url)){
    if (!pwOk) return json(400, {error:'invalid_grant', error_description:'Invalid login credentials'});
    tokenNo++; return json(200, {access_token:'tok' + tokenNo, refresh_token:'ref' + tokenNo, expires_in:3600, user:{id:'u1', email:'a@b.kr'}});
  }
  if (/\/auth\/v1\/token\?grant_type=refresh_token/.test(url)){ tokenNo++; return json(200, {access_token:'tok' + tokenNo, refresh_token:'ref' + tokenNo, expires_in:3600, user:{id:'u1', email:'a@b.kr'}}); }
  if (/\/auth\/v1\/logout/.test(url)) return json(204, {});
  if (/\/rest\/v1\/staff\?/.test(url)) return json(200, staffRows);
  return json(200, []);
};

console.log('\n[① 세션 없음 — anon]');
window.authLoad();
check('세션 없음', window.authUser() === null, window.authUser());
check('★ Bearer 는 anon key', window.sbBearer() === 'Bearer anon-k', window.sbBearer());
check('staffId 없음', window.authStaffId() === null, window.authStaffId());

console.log('\n[①′ 실 DB 가 0건을 주면 "실 DB · 0건" 이지 데모가 아니다 (2026-09-08 · 권한 3단계 뒤 선미 발견)]');
/* ★ 3단계부터 로그인 전(anon · 링크 없음)에는 donation 이 0건이다. 전에는 anon 이 전부 읽어 늘 ≥1건이었다.
     0건을 "DB 미연결(데모)" 로 읽으면 로그인 벽이 안 서고 역할 전환 바가 되살아난다 — dev 에서 실제로 났다. */
window.DB.role = 'staff';
const demoN = window.DB.cases.length;
let okLoad = await window.loadCasesFromSupabase();          /* 모킹: /rest/v1/donation → 200 [] */
check('★ 200 + 빈 배열은 "연결됨" 이다 (DB_SOURCE = Supabase)', window.DB_SOURCE === 'Supabase', window.DB_SOURCE);
check('★ 데모 데이터로 떨어지지 않는다 (cases 0건)', window.DB.cases.length === 0, {demoN, now: window.DB.cases.length});
check('★ 세션 없는 담당자에겐 로그인 벽이 선다', window.authWall() === true, {demo: window.isDemoMode(), wall: window.authWall()});
check('   isDemoMode 거짓 — 역할 전환 바를 안 그린다', window.isDemoMode() === false, window.isDemoMode());

console.log('\n[② 로그인]');
const nDonBefore = calls.filter(c => /\/rest\/v1\/donation\?/.test(c.url)).length;
let r = await window.authSignIn('a@b.kr', 'pw');
check('★ 로그인 성공', r.ok === true, r);
/* ★ 로그인하면 원장을 다시 읽는다 — 부팅 때는 anon 이라 0건이었다 (2026-09-08 · 권한 3단계) */
const nDonAfter = calls.filter(c => /\/rest\/v1\/donation\?/.test(c.url)).length;
check('★ 로그인 뒤 원장을 다시 읽는다 (donation 조회가 한 번 더 나간다)', nDonAfter > nDonBefore, {nDonBefore, nDonAfter});
check('★ Bearer 가 access_token 으로 바뀐다', window.sbBearer() === 'Bearer tok1', window.sbBearer());
check('uid', window.authUid() === 'u1', window.authUid());
check('★ staff 행을 찾아 staffOk · 이름', window.authStaffId() === 'u1' && window.authName() === '홍승희', {id:window.authStaffId(), name:window.authName()});
check('staff 조회는 자기 행만 묻는다 (id=eq.uid)', calls.some(c => /rest\/v1\/staff\?.*id=eq\.u1/.test(c.url)), calls.map(c=>c.url));
check('apikey 는 여전히 anon key', calls.every(c => !c.opt || !c.opt.headers || !c.opt.headers.apikey || c.opt.headers.apikey === 'anon-k'), null);

console.log('\n[③ 새로고침 · 갱신]');
const saved = JSON.parse(window.localStorage.getItem('nd_auth_v1'));
check('★ localStorage 에 세션이 남는다', saved && saved.access_token === 'tok1' && saved.staffOk === true, saved);
window.AUTH.session = null;
window.authLoad();
check('authLoad 로 되살아난다', window.sbBearer() === 'Bearer tok1' && window.authStaffId() === 'u1', window.sbBearer());
window.AUTH.session.expires_at = Math.floor(Date.now()/1000) + 60;   /* 1분 남음 → 갱신 대상 */
await window.authEnsure();
check('★ 만료 임박이면 refresh 로 새 토큰', window.sbBearer() === 'Bearer tok2', window.sbBearer());
check('갱신해도 staffOk 가 유지된다', window.authStaffId() === 'u1', window.AUTH.session);
window.AUTH.session.expires_at = Math.floor(Date.now()/1000) + 3600;
await window.authEnsure();
check('여유 있으면 안 부른다', window.sbBearer() === 'Bearer tok2', window.sbBearer());

console.log('\n[④ 로그인 벽]');
window.DB.role = 'staff';
check('데모(DB 미연결)에는 벽이 없다', window.authWall() === false, {demo:window.isDemoMode()});
window.eval("DB_SOURCE = 'Supabase';");
check('실 DB · 로그인 상태 → 벽 없음', window.authWall() === false, null);
await window.authSignOut();
check('★ 실 DB · 담당자 · 세션 없음 → 벽', window.authWall() === true, null);
window.render();
check('★ 화면에 로그인 폼이 그려진다', !!window.document.getElementById('loginEmail'), window.document.getElementById('content').innerHTML.slice(0,80));
check('상단 로그아웃 표시는 없다', window.document.getElementById('authBox').innerHTML === '', window.document.getElementById('authBox').innerHTML);
window.DB.role = 'donor';
check('★ 후원자(링크) 역할에는 벽이 없다 — anon 으로 돈다', window.authWall() === false, null);
window.DB.role = 'staff';
/* 폼으로 로그인 */
window.render();
window.document.getElementById('loginEmail').value = 'a@b.kr';
window.document.getElementById('loginPw').value = 'pw';
window.submitLogin({preventDefault(){}});
check('확인 중 — 버튼이 잠긴다', window.document.getElementById('loginBtn') && window.document.getElementById('loginBtn').disabled === true, null);
await tick(); await tick(); await tick();
check('★ 폼 로그인 뒤 벽이 걷힌다', window.authWall() === false && !window.document.getElementById('loginEmail'), window.document.getElementById('content').innerHTML.slice(0,60));
check('상단에 이름 + 로그아웃', /홍승희/.test(window.document.getElementById('authBox').innerHTML) && /doSignOut/.test(window.document.getElementById('authBox').innerHTML), window.document.getElementById('authBox').innerHTML);
check('토스트 — 누가 로그인했는지', window.DB.toast && /홍승희/.test(window.DB.toast.msg), window.DB.toast);

console.log('\n[⑤ 감사 기록의 actor]');
let posted = null;
window.sbPost = (t, rr, opt) => { posted = {t, row: rr[0], opt}; return Promise.resolve([Object.assign({id:1}, rr[0])]); };
await window.logPdfView({id:'901', dbId:5}, {submissionId:7, formType:'appl', storageKey:'forms/x.pdf'});
check('★ pdf.view 의 actor_ref = uid', posted && posted.row.actor_ref === 'u1', posted && posted.row);
check('로그인 상태면 "특정할 수 없다" 문구가 없다', posted && !('주의' in posted.row.after_value && posted.row.after_value.주의), posted && posted.row.after_value);
check('감사 기록은 minimal 로 넣는다', posted && posted.opt && posted.opt.minimal === true, posted && posted.opt);
await window.logBulkDownload({id:'901', dbId:5}, [{name:'a.pdf'}]);
check('★ bulk.download 의 actor_ref = uid', posted && posted.row.actor_ref === 'u1', posted && posted.row);
const sess = window.AUTH.session;
window.AUTH.session = null;
await window.logPdfView({id:'901', dbId:5}, {submissionId:7, formType:'appl', storageKey:'forms/x.pdf'});
check('세션 없이 실행되면 actor_ref null + 그 사실을 남긴다', posted.row.actor_ref === null && /특정할 수 없습니다/.test(posted.row.after_value.주의 || ''), posted.row);
window.AUTH.session = sess;

console.log('\n[⑥ created_by · triggered_by — staff 행이 있을 때만]');
window.sbGet = () => Promise.resolve([]);
posted = null;
try { await window.createDonation({id:'950', donorType:'법인', donor:'테스트', acqPath:'구매', checklist:[], dists:[]}); } catch (e) {}
check('★ 새 접수 created_by = uid', posted && posted.t === 'donation' && posted.row.created_by === 'u1', posted && posted.row);
window.AUTH.session.staffOk = false;
posted = null;
try { await window.createDonation({id:'951', donorType:'법인', donor:'테스트', acqPath:'구매', checklist:[], dists:[]}); } catch (e) {}
check('★ staff 행이 없으면 created_by 를 비운다 (FK 보호)', posted && posted.t === 'donation' && !('created_by' in posted.row), posted && posted.row);
window.AUTH.session.staffOk = true;
const postedAll = [];
window.sbPost = (t, rr, opt) => { postedAll.push({t, row: rr[0]}); return Promise.resolve(rr.map((r, i) => Object.assign({id: i + 1}, r))); };
await window.saveInspectionRun({id:'901', dbId:5, criteriaKey:null}, {model:'m', status:'done'}, [{code:'x', verdict:'적합', title:'t'}]).catch(()=>{});
const insp = postedAll.find(x => x.t === 'inspection');
check('★ 판정 실행의 triggered_by = uid', insp && insp.row.triggered_by === 'u1', insp && insp.row);

console.log('\n[⑦ 틀린 비밀번호 · 로그아웃]');
pwOk = false;
const before = window.sbBearer();
r = await window.authSignIn('a@b.kr', 'bad');
check('★ 틀리면 사람이 읽을 문장', r.ok === false && /맞지 않습니다/.test(r.reason), r);
check('틀려도 기존 세션은 그대로', window.sbBearer() === before && before !== 'Bearer anon-k', {before, now: window.sbBearer()});
pwOk = true;
await window.authSignOut();
check('★ 로그아웃 → anon', window.sbBearer() === 'Bearer anon-k' && window.authUser() === null, window.sbBearer());
check('localStorage 도 비운다', window.localStorage.getItem('nd_auth_v1') === null, window.localStorage.getItem('nd_auth_v1'));
check('logout 주소를 불렀다', calls.some(c => /\/auth\/v1\/logout/.test(c.url)), null);

console.log('\n[링크 토큰 헤더 — sbHeaders() 가 ?t= 의 해시를 x-link-token 으로 싣는다 (2026-09-08 · 권한 3단계)]');
window.LINK_TOKEN_HASH = undefined;                       /* 아직 안 봄 상태로 되돌린다 */
window.history.replaceState(null, '', '/?t=abc');
let hh = window.sbHeaders();
check('★ 주소에 ?t= 가 있으면 x-link-token = 토큰 해시 (원문이 아니다)', hh['x-link-token'] === window.tokenHashOf('abc') && hh['x-link-token'] !== 'abc', hh['x-link-token']);
check('   apikey·Authorization 도 함께 (전과 같은 두 헤더)', hh.apikey === 'anon-k' && /^Bearer /.test(hh.Authorization), hh);
hh = window.sbHeaders({ Prefer: 'return=minimal', 'Content-Type': 'application/json' });
check('   추가 헤더를 합친다 (12곳이 각자 붙이던 것)', hh.Prefer === 'return=minimal' && hh['Content-Type'] === 'application/json' && hh['x-link-token'], hh);
window.LINK_TOKEN_HASH = undefined;
window.history.replaceState(null, '', '/');
hh = window.sbHeaders();
check('★ 토큰이 없으면 x-link-token 을 아예 안 붙인다 ("undefined" 문자열 금지)', !('x-link-token' in hh), hh);

console.log(fail ? `\n❌ 실패 ${fail}건` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
