/* 주소로 들어오기 — `?t=<토큰>` (2026-09-03 선미)
   요청서: (미공개 내부 기록) 범위 2·3
   db 층: (미공개 내부 기록) (유진)

   ★ 무엇을 지키는 검사인가
     ① 주소의 토큰으로 **건과 역할이 정해지는가** (지금까지 URLSearchParams 0건이었다)
     ② 열 수 없는 링크가 **각각 다른 이유로** 막히는가 (무효화·만료·제출완료는 담당자 할 일이 다르다)
     ③ ★★ 본인확인이 **DB(verify_hint)** 로 대조되는가 — 정본 20번.
        세션 메모리가 아니어야 **다른 기기·새 세션**에서도 같게 동작한다
     ④ ★★ 기관이 **자기 몫만** 보는가 — 안 좁히면 남의 배분처 서류 자리까지 본다(개인정보 노출)
     ⑤ 제출을 마치면 링크가 폐기되는가 (화면에 "1회용" 이라 적혀 있다)

   실 DB 를 쓰지 않는다 — sbGet/sbPost/fetch 를 갈아끼운다.
   ⚠️ 실 DB 에 링크를 만들면 지울 수 없다(RLS 에 delete 정책 없음). 확인은 여기서 한다.

   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-link-entry.mjs
*/
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';   /* ⚠️ .pathname 은 한글 폴더를 %ED… 로 인코딩해 파일을 못 찾는다 (2026-09-05 집 PC 실측) */
import { appScripts } from './app-scripts.mjs';   /* 스크립트 목록은 index.html 에서 읽는다 — 손으로 베끼지 않는다 (2026-09-05 · 정본 ⑥) */
const require = createRequire(process.env.JSDOM_FROM
  ? process.env.JSDOM_FROM.replace(/\/?$/, '/') + 'package.json'
  : new URL('../prototype/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const APP = fileURLToPath(new URL('./', import.meta.url));
const dom = new JSDOM(readFileSync(APP + 'index.html', 'utf8'),
  {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost:8788/'});
const {window} = dom;
window.HTMLCanvasElement.prototype.getContext = function(){const n=()=>{};return{lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n};};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
for (const f of appScripts())
  window.eval(readFileSync(APP + f, 'utf8'));

let fail = 0;
const check = (n, ok, got) => {
  console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got)));
  if (!ok) fail++;
};

window.eval("SUPABASE_CONFIG = {url:'https://x.supabase.co', key:'k'};");

/* 실 DB 대신 이 표에서 찾는다 — findAccessLink 가 token_hash 로 조회한다 */
let LINKS = [];
window.sbGet = (t, q) => {
  if (t !== 'access_link') return Promise.resolve([]);
  const m = /token_hash=eq\.([0-9a-f]{64})/.exec(q);
  if (!m) return Promise.resolve([]);
  return Promise.resolve(LINKS.filter(l => l.token_hash === m[1]));
};
let patched = [];
window.fetch = (url, opt) => {
  patched.push({url:String(url), body: opt && opt.body ? JSON.parse(opt.body) : null});
  /* 행 하나를 돌려준다 — 빈 배열이면 db.js 가 "저장되지 않았다"로 본다(방어②, RLS 204 대응) */
  return Promise.resolve({ok:true, status:200, text:()=>Promise.resolve(''),
                          json:()=>Promise.resolve([{id:1}])});
};

/* 배분처 셋이 붙은 건 하나 — 체크리스트 항목이 배분처마다 하나씩 있다 */
function seedCase(){
  window.DB.cases.length = 0;
  window.DB.cases.push({
    id:'901', dbId:5, donor:'(주)한빛유통', donorType:'법인', item:'생필품',
    state:'검수 대기', acqPath:'구매',
    dists:[{id:11, orgName:'가기관', qty:10},{id:12, orgName:'나기관', qty:10},{id:13, orgName:'다기관', qty:10}],
    checklist:[
      {key:'inss', uid:'inss#1', n:'인수증', stage:'배분', kind:'A', included:true, distId:11, r:{}},
      {key:'inss', uid:'inss#2', n:'인수증', stage:'배분', kind:'A', included:true, distId:12, r:{}},
      {key:'inss', uid:'inss#3', n:'인수증', stage:'배분', kind:'A', included:true, distId:13, r:{}}
    ]
  });
}
/* 링크 한 장을 표에 넣고, 그 원문 토큰을 돌려준다 */
function putLink(over){
  const token = window.newLinkToken();
  const row = Object.assign({
    id: LINKS.length + 1, donation_id: 5, distribution_id: null, purpose: 'intake',
    token_hash: window.sha256Hex('nd1:' + token), verify_hint: null,
    expires_at: new Date(Date.now() + 86400000).toISOString(), used_at: null, revoked: false
  }, over || {});
  if (over && over.last4) row.verify_hint = window.sha256Hex('nd1:' + token + ':' + over.last4);
  LINKS.push(row);
  return token;
}
/* 주소를 바꾸고 부팅 진입을 다시 태운다 — "다른 기기에서 링크를 연다" 와 같은 상태 */
async function openWith(token){
  dom.reconfigure({url: 'http://localhost:8788/' + (token ? '?t=' + token : '')});
  window.DB.linkEntry = null;
  window.DB.role = 'staff';
  window.DB.donorForm.linkCaseId = null; window.DB.donorForm.verified = false;
  window.DB.orgForm.linkCaseId = null;   window.DB.orgForm.verified = false;
  return window.enterByLinkToken();
}

console.log('\n[① 주소에 토큰이 없으면 링크 진입이 아니다]');
seedCase();
let entered = await openWith(null);
check('토큰이 없으면 아무것도 안 한다', entered === false, entered);
check('linkEntry 를 만들지 않는다', !window.DB.linkEntry, window.DB.linkEntry);

console.log('\n[② ★ 열 수 없는 링크는 각각 다른 이유로 막힌다]');
const cases = [
  ['없는 토큰',      null,                                'none'],
  ['무효화된 링크',  putLink({revoked:true}),             'revoked'],
  ['이미 제출한 링크', putLink({used_at:new Date().toISOString()}), 'used'],
  ['기간이 지난 링크', putLink({expires_at:'2020-01-01T00:00:00Z'}), 'expired']
];
for (const [name, tok, want] of cases){
  await openWith(tok || 'x'.repeat(40));
  const st = window.DB.linkEntry.state;
  check(name + ' → ' + want, st === want, st);
  const html = window.renderPhone();
  check('  이유를 화면에 그대로 보여 준다', html.includes(window.LINK_STATE_TEXT[want]), html.slice(0, 120));
}
/* 네 이유의 문구가 서로 달라야 한다 — 뭉치면 담당자가 무엇을 할지 모른다 */
const texts = ['none','revoked','used','expired'].map(k => window.LINK_STATE_TEXT[k]);
check('★ 네 문구가 서로 다르다 (재발급 vs 기간 연장은 할 일이 다르다)',
      new Set(texts).size === 4, texts);

console.log('\n[③ 링크는 살아 있는데 가리키는 건이 없으면 — 조용히 통과시키지 않는다]');
const orphan = putLink({donation_id: 9999});
await openWith(orphan);
check('★ 잠근다 (아무 건에도 안 묶인 폼을 열지 않는다)', window.DB.linkEntry.state === 'none', window.DB.linkEntry.state);

console.log('\n[④ purpose 로 역할이 갈린다]');
const tIntake = putLink({purpose:'intake'});
await openWith(tIntake);
check('intake → 후원자 화면', window.DB.role === 'donor', window.DB.role);
check('건에 묶인다 (#901)', window.DB.donorForm.linkCaseId === '901', window.DB.donorForm.linkCaseId);
check('배분처에 묶이지 않는다', !window.DB.linkEntry.distId, window.DB.linkEntry.distId);

const tOrg = putLink({purpose:'dist_proof', distribution_id:12});
await openWith(tOrg);
check('dist_proof → 배분기관 화면', window.DB.role === 'org', window.DB.role);
check('★ 어느 배분처인지 링크가 안다', String(window.DB.linkEntry.distId) === '12', window.DB.linkEntry.distId);

console.log('\n[⑤ ★★ 본인확인이 DB(verify_hint)로 대조된다 — 정본 20번]');
const tVerify = putLink({purpose:'intake', last4:'8241'});
await openWith(tVerify);
const c901 = window.DB.cases[0];
check('★ 세션에 값이 없어도 게이트가 뜬다 (다른 기기·새 세션)',
      !c901.verifyLast4 && window.needVerifyGate(c901, 'verifyLast4') === true,
      {세션값:c901.verifyLast4, 게이트:window.needVerifyGate(c901, 'verifyLast4')});
check('renderPhone 이 본인확인 화면을 준다', window.renderPhone().includes('본인 확인'), window.renderPhone().slice(0,80));
check('★ 틀린 4자리는 거부한다', window.verifyInputMatches('0000', c901.verifyLast4) === false);
check('★★ 맞는 4자리는 통과한다 (DB 해시와 대조)', window.verifyInputMatches('8241', c901.verifyLast4) === true);
check('★ 4자리만 해시한 값으로는 안 통과한다 (토큰을 섞는다)',
      LINKS[LINKS.length-1].verify_hint !== window.sha256Hex('8241'));

/* 본인확인을 안 건 링크는 게이트 없이 통과 — 담당자가 안 걸었으면 막지 않는다 */
const tNoVerify = putLink({purpose:'intake'});
await openWith(tNoVerify);
check('본인확인을 안 건 링크는 게이트가 없다', window.needVerifyGate(window.DB.cases[0], 'verifyLast4') === false);

console.log('\n[⑥ ★★ 기관이 자기 몫만 본다 — 안 좁히면 개인정보 노출]');
await openWith(putLink({purpose:'dist_proof', distribution_id:12}));
let slots = window.orgSlots(window.DB.cases[0]);
check('★★ 셋 중 자기 것 하나만 보인다', slots.length === 1, slots.map(s => s.uid));
check('★ 그것이 자기 배분처의 것이다', String(slots[0].distId) === '12', slots[0]);
check('★ 남의 배분처 항목이 섞이지 않는다',
      slots.every(s => String(s.distId) === '12'), slots.map(s => s.distId));

await openWith(putLink({purpose:'dist_proof', distribution_id:13}));
slots = window.orgSlots(window.DB.cases[0]);
check('다른 기관은 자기 것(13)만 본다', slots.length === 1 && String(slots[0].distId) === '13', slots.map(s => s.distId));

/* 링크 없이(담당자 대리 등록) 열면 종전대로 전부 보인다 — 예외 경로를 죽이지 않는다 */
await openWith(null);
check('링크 없이 열면 종전대로 전부 보인다 (대신 등록 경로가 산다)',
      window.orgSlots(window.DB.cases[0]).length === 3, window.orgSlots(window.DB.cases[0]).length);

console.log('\n[⑦ 제출을 마치면 링크가 폐기된다]');
await openWith(putLink({purpose:'dist_proof', distribution_id:12}));
patched = [];
window.closeLinkAfterSubmit();
await new Promise(r => setTimeout(r, 0));
check('★ access_link 를 PATCH 한다', patched.some(p => /access_link/.test(p.url)), patched.map(p => p.url));
const patch = (patched.find(p => /access_link/.test(p.url)) || {}).body || {};
check('★ used_at 을 찍는다', !!patch.used_at, patch);
check('★★ 수신 연락처를 지운다 (팀 결정 8/28 §2-⑦ C안)', patch.recipient_enc === null, patch);

console.log('\n[⑨ 링크로 들어오면 화면이 그 폼으로 간다 — 홈이 아니다 (연수 발견 9/3)]');
await openWith(putLink({purpose:'intake'}));
check('★ 후원자 링크 → 신청서 화면', window.DB.screen === 'donorForm', window.DB.screen);
check('  홈 대시보드가 아니다', window.DB.screen !== 'home', window.DB.screen);
await openWith(putLink({purpose:'dist_proof', distribution_id:12}));
check('★ 기관 링크 → 증빙 제출 화면', window.DB.screen === 'orgForm', window.DB.screen);

console.log('\n[⑩ ★★ 기관이 링크로 들어오면 잠기지 않는다 (연수 발견 9/3)]');
/* 74b5520 이 발급을 access_link 로 옮기면서 옛 c.orgLink 를 아무도 안 만든다.
   renderOrgPhone 이 그 값을 보면 **링크로 들어왔는데 "링크로만 열 수 있습니다"** 가 뜬다.
   크래시가 아니라 잠기는 것이라 더 늦게 드러난다. */
await openWith(putLink({purpose:'dist_proof', distribution_id:12}));
check('c.orgLink 는 이제 안 만들어진다 (전제 확인)', !window.DB.cases[0].orgLink, window.DB.cases[0].orgLink);
let orgHtml = window.renderPhone();
check('★★ "링크로만 열 수 있습니다" 로 잠기지 않는다',
      !orgHtml.includes('증빙 제출 링크로만 열 수 있습니다'), orgHtml.slice(0, 140));
check('★ 데모 지름길 안내도 안 뜬다 (링크로 들어온 사람에게 줄 말이 아니다)',
      !orgHtml.includes('담당자 화면에서 링크 발급하기'), orgHtml.slice(0, 140));

/* 본인확인을 건 기관 링크 — 게이트가 뜨고, c.orgLink 없이도 대조된다 */
await openWith(putLink({purpose:'dist_proof', distribution_id:12, last4:'7788'}));
orgHtml = window.renderPhone();
check('★ 본인확인 화면이 뜬다 (c.orgLink 없이도)', orgHtml.includes('본인 확인'), orgHtml.slice(0, 140));
check('★ 틀린 값 거부', window.verifyInputMatches('0000', undefined) === false);
check('★★ 맞는 값 통과 (DB 해시 대조)', window.verifyInputMatches('7788', undefined) === true);

/* 링크 없이(대신 등록) 열면 종전 안내가 그대로 나온다 — 예외 경로를 죽이지 않는다 */
await openWith(null);
window.DB.role = 'org'; window.DB.screen = 'orgForm'; window.DB.orgForm.linkCaseId = null;
check('링크 없이 열면 종전 안내가 나온다 (대신 등록 경로가 산다)',
      window.renderPhone().includes('증빙 제출 링크로만 열 수 있습니다'), window.renderPhone().slice(0,100));

console.log('\n[⑧ 이 검사가 진짜 잡는가 — 좁히기를 무력화해 본다]');
const realOrgSlots = window.orgSlots;
window.eval("orgSlots = function(c){ return distItems(c).filter(function(it){ return it.kind === 'A'; }); };");
await openWith(putLink({purpose:'dist_proof', distribution_id:12}));
check('★ 좁히기를 걷어내면 셋이 다 보인다 (그러면 ⑥이 빨개진다)',
      window.orgSlots(window.DB.cases[0]).length === 3, window.orgSlots(window.DB.cases[0]).length);
window.orgSlots = realOrgSlots;
check('되돌리면 다시 하나만 보인다', window.orgSlots(window.DB.cases[0]).length === 1);

console.log('\n' + '─'.repeat(60));
console.log(fail
  ? `❌ ${fail}건 실패 — 링크로 여는 경로가 깨졌습니다.`
  : '✅ 주소로 들어오기 — 전부 통과');
process.exit(fail ? 1 : 0);
