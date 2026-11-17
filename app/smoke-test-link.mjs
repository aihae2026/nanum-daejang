/* 접수·증빙 제출 링크 (access_link) — 2026-09-03 유진
   선미 요청: (미공개 내부 기록)

   ★ 무엇을 지키는 검사인가
     ① 원문 토큰과 본인확인 값 원문이 **DB 로 나가지 않는가** (해시만 나가야 한다)
     ② 기관마다 링크가 **각각** 나가고, 서로 남의 것을 못 여는가
     ③ 무효화·만료·제출완료가 **각각 다른 이유로** 막히는가
     ④ 저장 안 된 배분처(sd1)로는 발급되지 않는가 (FK 가 깨진다)

   실 DB 를 쓰지 않는다 — sbPost/sbGet/fetch 를 갈아끼운다.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-link.mjs
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

console.log('\n[① SHA-256 이 표준값과 같은가 — 이게 틀리면 나머지가 다 헛돈다]');
check('sha256("abc")', window.sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
check('sha256("")', window.sha256Hex('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
check('한글도 같은 값을 낸다 (UTF-8)', /^[0-9a-f]{64}$/.test(window.sha256Hex('늘봄지역아동센터')));
check('★ crypto.subtle 없이 돈다 (file:// · jsdom 에서도)', typeof window.sha256Hex('x') === 'string');

console.log('\n[② ★★ 원문이 DB 로 나가지 않는가 — 제일 중요]');
window.eval("SUPABASE_CONFIG = {url:'https://x.supabase.co', key:'k'};");
let sent = null, seq = 0;
window.sbPost = (t, rows) => { sent = {t, row:rows[0]}; return Promise.resolve([Object.assign({id: ++seq}, rows[0])]); };
const c = {id:'901', dbId:5, dists:[{id:12, orgName:'늘봄지역아동센터', qty:10}]};
let r = await window.issueAccessLink(c, {purpose:'intake', verifyLast4:'0000'});
check('access_link 로 보낸다', sent && sent.t === 'access_link', sent && sent.t);
check('토큰을 한 번 돌려준다 (주소에 넣을 유일한 비밀)', !!r.token && r.token.length >= 32, r.token && r.token.length);
const body = JSON.stringify(sent.row);
check('★★ 원문 토큰이 DB 로 안 나간다', body.indexOf(r.token) < 0, body.slice(0, 120));
check('★★ 본인확인 값 원문(0000)이 DB 로 안 나간다', body.indexOf('0000') < 0, sent.row.verify_hint);
check('토큰은 해시로 나간다', sent.row.token_hash === window.sha256Hex('nd1:' + r.token));
check('★ 본인확인 해시에 토큰이 섞인다 (4자리만 해시하면 1만 개로 뚫린다)',
      sent.row.verify_hint !== window.sha256Hex('0000') && sent.row.verify_hint !== window.sha256Hex('nd1:0000'),
      sent.row.verify_hint);
check('건에 묶인다', sent.row.donation_id === 5);
check('접수 링크는 배분처가 없다 (건당 1장)', sent.row.distribution_id === null, sent.row.distribution_id);
check('유효기간이 붙는다 (담당자가 잊어도 영원히 안 열린다)', !!sent.row.expires_at, sent.row.expires_at);

console.log('\n[③ ★ 기관마다 링크가 각각 나간다 — 이게 이번 작업의 전부]');
const dists = [{id:12, orgName:'늘봄'}, {id:13, orgName:'복지관'}, {id:14, orgName:'꿈터'}];
const issued = [];
for (const d of dists){
  const res = await window.issueAccessLink(c, {purpose:'dist_proof', distId:d.id, verifyLast4:'1234'});
  issued.push({org:d.orgName, distId:d.id, token:res.token, row:sent.row});
}
check('세 기관에 세 장이 나간다', issued.length === 3);
check('★ 토큰이 전부 다르다', new Set(issued.map(x => x.token)).size === 3, issued.map(x => x.token.slice(0,8)));
check('★ 링크마다 어느 기관인지 실린다 (이게 없어서 발급을 막아 뒀다)',
      issued.map(x => x.row.distribution_id).join(',') === '12,13,14',
      issued.map(x => x.row.distribution_id));
check('증빙 링크로 표시된다', issued.every(x => x.row.purpose === 'dist_proof'));
check('★ 같은 본인확인 값이어도 해시가 다르다 (토큰이 섞이므로)',
      new Set(issued.map(x => x.row.verify_hint)).size === 3, issued.map(x => (x.row.verify_hint||'').slice(0,8)));

console.log('\n[④ ★ 남의 링크로는 못 연다]');
const store = {};
issued.forEach(function(x){ store[window.sha256Hex('nd1:' + x.token)] = {
  id:x.distId, donation_id:5, distribution_id:x.distId, purpose:'dist_proof',
  token_hash:window.sha256Hex('nd1:' + x.token), verify_hint:x.row.verify_hint,
  expires_at:new Date(Date.now()+864000000).toISOString(), used_at:null, revoked:false}; });
window.sbGet = (t, q) => {
  const m = /token_hash=eq\.([0-9a-f]{64})/.exec(q);
  return Promise.resolve(m && store[m[1]] ? [store[m[1]]] : []);
};
const linkA = await window.findAccessLink(issued[0].token);
const linkB = await window.findAccessLink(issued[1].token);
check('자기 토큰으로는 찾는다', !!linkA && linkA.distribution_id === 12, linkA && linkA.distribution_id);
check('★ 다른 기관 토큰은 다른 링크를 준다 (자기 것만 본다)', linkB.distribution_id === 13, linkB.distribution_id);
check('★ 없는 토큰이면 null (없다 ≠ 못 연다)', (await window.findAccessLink('아무거나')) === null);
check('★ A 링크에 B 의 본인확인을 넣어도 안 열린다',
      window.verifyAccessLink(linkA, issued[1].token, '1234') === false);
check('자기 토큰 + 맞는 4자리면 열린다', window.verifyAccessLink(linkA, issued[0].token, '1234') === true);
check('★ 자기 토큰이어도 4자리가 틀리면 안 열린다',
      window.verifyAccessLink(linkA, issued[0].token, '9999') === false);

console.log('\n[⑤ 못 여는 이유가 각각 다르다 — 담당자가 할 일이 다르다]');
const base = {revoked:false, used_at:null, expires_at:new Date(Date.now()+86400000).toISOString()};
check('정상', window.accessLinkState(base) === 'ok', window.accessLinkState(base));
check('★ 무효화 (재발급해야 한다)', window.accessLinkState({...base, revoked:true}) === 'revoked');
check('★ 제출 완료 (1회용)', window.accessLinkState({...base, used_at:'2026-09-03'}) === 'used');
check('★ 만료 (기간을 늘려야 한다)',
      window.accessLinkState({...base, expires_at:'2026-01-01T00:00:00Z'}) === 'expired');
check('링크 자체가 없음', window.accessLinkState(null) === 'none');
check('이유마다 안내 문구가 다르다',
      new Set(['revoked','used','expired','none'].map(k => window.LINK_STATE_TEXT[k])).size === 4);

console.log('\n[⑥ 저장 안 된 배분처로는 발급하지 않는다 — FK 가 깨진다]');
let caught = null;
await window.issueAccessLink(c, {purpose:'dist_proof', distId:'sd1'}).catch(e => { caught = e.message; });
check('★ 화면 임시 id(sd1)면 거부한다', /저장되지 않았습니다/.test(caught || ''), caught);
caught = null;
await window.issueAccessLink(c, {purpose:'dist_proof'}).catch(e => { caught = e.message; });
check('★ 기관을 안 정하면 거부한다 (어느 기관 것인지 모르는 링크가 생긴다)', !!caught, caught);

console.log('\n[⑦ 무효화·제출완료는 지우지 않고 표시한다 (RLS 에 delete 정책이 없다)]');
let patched = null;
window.fetch = (u, o) => { patched = {u, body:JSON.parse(o.body), method:o.method};
  return Promise.resolve({ok:true, json: () => Promise.resolve([{id:1}])}); };
await window.revokeAccessLink(1);
check('★ delete 가 아니라 PATCH 다', patched.method === 'PATCH', patched.method);
check('revoked=true 로 표시한다', patched.body.revoked === true, patched.body);
await window.markAccessLinkUsed(1);
check('제출 시각을 남긴다', !!patched.body.used_at, patched.body);
check('★ 이때 수신 연락처를 지운다 (팀 결정 8/28 §2-⑦ C안)',
      patched.body.recipient_enc === null, patched.body);
window.fetch = () => Promise.resolve({ok:true, json: () => Promise.resolve([])});
caught = null;
await window.revokeAccessLink(1).catch(e => { caught = e.message; });
check('★ 바뀐 행이 0건이면 실패로 본다 (RLS 는 성공을 돌려주며 막는다)', /권한|RLS/.test(caught || ''), caught);

console.log('\n[⑧ 링크 주소에는 토큰만 들어간다]');
const u = window.accessUrl('abc123');
check('★ 토큰이 주소에 실린다', u.indexOf('t=abc123') >= 0, u);
check('★ 건 번호가 안 들어간다 (201·202 는 찍어볼 수 있다)', !/\/(s|o)\/\d+/.test(u), u);
check('★ 가짜 도메인이 아니라 지금 이 주소를 쓴다 (복사해서 열린다)',
      u.indexOf('nanumdaejang.org') < 0 && u.indexOf(window.location.origin) === 0, u);
check('종류마다 경로를 나누지 않는다 (purpose 로 갈린다)',
      window.accessUrl('x').replace(/t=x$/, '') === window.location.origin + '/?', window.accessUrl('x'));
check('발급 전에는 자리만 보여준다', /········/.test(window.accessUrl(null)), window.accessUrl(null));

console.log('\n[⑨ 발송 채널도 분류로 바꿔 보낸다 — 연수 실주행이 잡은 400]');
/* 정본 15번(submitted_via)과 같은 모양이 같은 날 한 번 더 났다.
   DB 는 '문자'·'유선 안내'·'직접 전달'·'메일' 넷을 받는데 화면은 'link'·'email' 을 쓴다.
   ('메일' 은 2026-09-07 승희 결정으로 허용값에 들어갔다 — patch-20260907-sent-channel-mail.sql) */
window.eval("SUPABASE_CONFIG = {url:'https://x.supabase.co', key:'k'};");
let chRow = null;
window.sbPost = (t, rr) => { chRow = rr[0]; return Promise.resolve([Object.assign({id:1}, rr[0])]); };
const cc = {id:'901', dbId:5, dists:[]};
await window.issueAccessLink(cc, {purpose:'intake', verifyLast4:'1234', channel:'link'});
check('★ 화면 값(link)이 아니라 DB 분류가 실린다', chRow.sent_channel === '직접 전달', chRow.sent_channel);
await window.issueAccessLink(cc, {purpose:'intake', channel:'문자'});
check('이미 분류인 값은 그대로 간다', chRow.sent_channel === '문자', chRow.sent_channel);
await window.issueAccessLink(cc, {purpose:'intake', channel:'email'});
check('★★ email 은 \'메일\' 로 실린다 (2026-09-07 허용값 추가)', chRow.sent_channel === '메일', chRow.sent_channel);
await window.issueAccessLink(cc, {purpose:'intake', channel:'fax'});
check('★★ 매핑할 값이 없으면 비운다 (지어내지 않는다)', chRow.sent_channel === undefined, chRow.sent_channel);
await window.issueAccessLink(cc, {purpose:'intake'});
check('채널을 안 주면 칸이 없다', chRow.sent_channel === undefined, chRow.sent_channel);
check('★ purpose 는 DB 허용값 두 가지뿐이다', chRow.purpose === 'intake', chRow.purpose);
await window.issueAccessLink(cc, {purpose:'dist_proof', distId:12});
check('증빙 링크도 허용값이다', chRow.purpose === 'dist_proof', chRow.purpose);

console.log('\n[⑩ 접수 대기 건이 목록에 "null" 로 뜨지 않는가]');
/* 접수 링크만 발급한 건은 item_name 이 NULL 이다 — 설계대로다.
   그런데 JS 가 null + \' \' 를 "null " 로 만들어 화면에 그대로 떴다(연수·김연수 과장 발견). */
const asCase = (row) => window.rowToCase(Object.assign(
  {id:9, case_no:'201', state:'제출 대기', donor_type:'법인', distribution:[], checklist_item:[]}, row));
check('★★ 품목이 없어도 "null" 이 안 나온다',
      asCase({item_name:null, qty:null}).item.indexOf('null') < 0, asCase({item_name:null, qty:null}).item);
check('대신 무슨 상태인지 말한다',
      asCase({item_name:null, qty:null}).item === '(후원자 제출 대기)', asCase({item_name:null, qty:null}).item);
check('★ 수량만 있어도 "null 10개" 가 안 나온다',
      asCase({item_name:null, qty:10}).item.indexOf('null') < 0, asCase({item_name:null, qty:10}).item);
check('품목이 있으면 그대로 그린다',
      asCase({item_name:'생수 2L', qty:300}).item === '생수 2L 300', asCase({item_name:'생수 2L', qty:300}).item);

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
