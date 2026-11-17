/* 시연용 [채우기] — 발표자 화면에만 뜨고, 파일이 진짜로 올라간다 (2026-09-14 승희 · 선미 9/13 밤 결정)

   ★ 무엇을 막는 검사인가
     9/11 코칭에서 "시연 때 신청서를 손으로 다 채우면 시간이 다 간다" → [자동채우기] 를 정했다.
     그런데 이미 있는 prefillDonor 는 demoOnly() 안에 있어 **실서비스(nanumdaejang.org)에서는 안 뜨고**,
     떠도 addDemoFile 이 blob:null 을 만들어 **저장소에 아무것도 안 올라가고 AI 가 볼 게 없었다**(선미 실측).

     그래서 둘을 지킨다.
       ① 게이트 — 발표는 실운영을 가정한다. 버튼은 **이 브라우저에 admin 담당자 로그인 세션이 있을 때만** 그린다.
          심사위원 테스트 계정(role staff)·로그인 없음·로그아웃 뒤에는 **0개**. 토글도 주소 꼬리표도 없다.
       ② 진짜 파일 — assets/demo/ 의 실제 서류를 fetch 해 blob 으로 붙인다. blob 이 있어야 uploadCaseFiles 가 올린다.
          fetch 는 비동기라 **다 받기 전 [제출] 은 막는다**(빈 첨부로 나가면 9/13 과 같은 조용한 실패).
          못 받으면 조용히 빈 자리로 두지 않고 말한다.
       ③ 값은 루브릭에서 통과한 G15(법인·구매 · 250 × 8,400 = 2,100,000 · 2026-06-15) 그대로.
          [단가 불일치 건] 은 **같은 영수증에 단가만** 다르게 — AI 가 잡는 장면(E1) 하나를 만든다.

   데모 데이터로 돈다 — 서버·DB 불필요.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-presenter-fill.mjs
*/
import { readFileSync, existsSync } from 'node:fs';
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
const W = window, DB = W.DB;

let fail = 0;
const check = (n, ok, got) => { console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got))); if (!ok) fail++; };
const has = (html, s) => html.indexOf(s) >= 0;

/* 실서비스 모양 — 실제 호출은 전부 막는다 */
window.eval("SUPABASE_CONFIG = {url:'https://x.supabase.co', key:'k'}; DB_SOURCE = 'Supabase';");
W.sbGet = () => Promise.resolve([]);

/* 세션 세 모양 — db.js authLookupStaff 가 채우는 칸 그대로(staffOk · staffRole) */
const SESSION = {
  none:  null,
  staff: {access_token:'t', user:{id:'u-staff', email:'staff@example.com'}, staffOk:true,  staffRole:'staff'},
  admin: {access_token:'t', user:{id:'u-admin', email:'admin@example.com'},  staffOk:true,  staffRole:'admin'},
  adminNoStaff: {access_token:'t', user:{id:'u-x'}, staffOk:false, staffRole:'admin'}
};
const setSession = k => { W.AUTH.session = SESSION[k]; };

/* fetch 스텁 — assets/demo/… 만 받아 준다. 무엇을 요청했는지 적어 둔다 */
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPG_1PX = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
let fetched = [], fetchMode = 'ok';
W.fetch = (url) => {
  fetched.push(String(url));
  if (fetchMode === 'fail') return Promise.resolve({ok:false, status:404, blob: () => Promise.reject(new Error('404'))});
  if (!/^assets\/demo\//.test(String(url))) return Promise.reject(new Error('검사 밖 요청: ' + url));
  const png = /\.png$/i.test(String(url));
  const bytes = png ? PNG_1PX : JPG_1PX;
  return Promise.resolve({ok:true, status:200,
    blob: () => Promise.resolve(new W.Blob([new Uint8Array(bytes)], {type: png ? 'image/png' : 'image/jpeg'}))});
};

/* 후원자 폼 — 진짜 후원자 경로(링크 건 + linkCaseId). 미리보기로 그리면 버튼을 아무에게도 안 그린다 */
let SEQ = 0;
function donorCase(donorType){
  const id = 'P' + (++SEQ);
  DB.role = 'donor'; DB.screen = 'donorForm'; DB.preview = null; DB.linkEntry = null;
  DB.cases = (DB.cases || []).filter(c => c.id !== id);
  DB.cases.push({id, state:'접수 대기', donorType, acqPath:'구매',
    donor:'[검사용] 시연후원자', checklist: W.autoChecklist(donorType, '구매', false, 'foundation')});
  DB.donorForm = Object.assign(DB.donorForm || {}, {
    donorType, path:'구매', donorName:'', itemName:'', qty:'', donDate:'', unitBook:'', unitSale:'',
    giftVal:'', saleVal:'', note:'', vatDeduction:null,
    agreePurpose:false, agreeDouble:false, privacyTransfer:false, corpAck:false, privacy:false, wantsReceipt:false,
    signed:false, signImg:null, files:{}, linkCaseId:id, submittedId:null, verified:true, verifyInput:'', verifyTries:0
  });
  return DB.cases.find(c => c.id === id);
}
const donorHtml = () => W.viewDonorForm(false);
const PRESENTER_BTNS = /정상 건 채우기|단가 불일치 건 채우기|presenterFill/;
const DEMO_BTNS = /기본값 채우기\(데모용\)|빈 폼으로/;

console.log('\n════════ ① 게이트 — admin 로그인 세션이 있는 브라우저에만 그린다 ════════');
donorCase('법인');
setSession('none');
let h = donorHtml();
check('★★ 실서비스 + 로그인 없음(심사위원의 실제 후원자 링크) → 시연 버튼 0개', !PRESENTER_BTNS.test(h));
check('   데모용 버튼도 없다 (기존 demoOnly 그대로)', !DEMO_BTNS.test(h));
setSession('staff');
h = donorHtml();
check('★★ staff(심사위원 테스트 계정) 로그인 → 0개', !PRESENTER_BTNS.test(h));
setSession('adminNoStaff');
h = donorHtml();
check('★ role 만 admin 이고 staffOk 가 아니면 → 0개 (staff 행으로 확인된 사람만)', !PRESENTER_BTNS.test(h));
setSession('admin');
h = donorHtml();
check('★★ admin 로그인 → [정상 건 채우기] 가 있다', has(h, '정상 건 채우기'));
check('★★ admin 로그인 → [단가 불일치 건 채우기] 가 있다', has(h, '단가 불일치 건 채우기'));
check('   버튼은 장면 이름이지 값이 아니다 — "8,400" 같은 숫자가 버튼에 없다', !/채우기[^<]*8[,.]?[49]00/.test(h));
check('   admin 이어도 실서비스에선 데모용 버튼(가짜 주민번호)은 안 뜬다', !DEMO_BTNS.test(h));
setSession('none');
h = donorHtml();
check('★ 로그아웃하면 사라진다 — 끄는 걸 잊을 일이 없다', !PRESENTER_BTNS.test(h));
check('   isPresenter() 가 세션 하나만 본다 (토글·주소 꼬리표 없음)',
      typeof W.isPresenter === 'function' && W.isPresenter() === false && (setSession('admin'), W.isPresenter() === true));
window.eval("DB_SOURCE = '데모';");
setSession('none');
h = donorHtml();
check('데모(DB 없음)에서는 데모용 버튼이 그대로 산다 — 시연 대체 경로(긍정 케이스)', DEMO_BTNS.test(h));
check('   데모에는 시연 버튼이 없다 (세션이 없으니)', !PRESENTER_BTNS.test(h));
window.eval("DB_SOURCE = 'Supabase';");

console.log('\n════════ ② [정상 건 채우기] — 값은 G15 · 파일은 진짜 blob ════════');
let c = donorCase('법인');
setSession('admin');
fetched = []; fetchMode = 'ok';
check('presenterFillDonor 가 있다', typeof W.presenterFillDonor === 'function');
let p = W.presenterFillDonor('ok');
check('★ 프라미스를 돌려준다 (검사·화면이 끝을 기다릴 수 있게)', p && typeof p.then === 'function');
check('★★ 받는 동안 DB.presenterFilling 이 참', DB.presenterFilling === true, DB.presenterFilling);
check('   받는 동안 화면이 "파일 준비 중" 을 말한다', /파일 준비 중|준비하는 중/.test(donorHtml()));
DB.toast = null;
const r0 = W.submitDonor();
check('★★ 받는 동안 [제출] 은 막힌다 — 빈 첨부로 나가지 않는다', !DB.donorSubmitting && !!(DB.toast && /준비/.test(DB.toast.msg)), DB.toast);
check('   막힐 때 프라미스를 시작하지 않는다', !r0 || typeof r0.then !== 'function');
await p;
const f = DB.donorForm;
check('★ 다 받으면 presenterFilling 이 꺼진다', DB.presenterFilling === false, DB.presenterFilling);
const slots = W.donorSlots().map(it => it.key);
check('(전제) 법인·구매 첨부 칸 = 직인 · 구매영수증 · 물품사진', slots.join() === 'appl_corp_scan,proof_buy,photo', slots);
for (const k of slots){
  const ids = f.files[k] || [];
  const m = ids.length ? W.FILES[ids[0]] : null;
  check(`★★ ${k} 에 파일이 있고 blob 이 진짜다`, !!m && m.blob instanceof W.Blob && m.blob.size > 0, m && {blob: m.blob && m.blob.size});
  check(`   ${k} 는 demo:false · type 이 image (uploadCaseFiles 가 건너뛰지 않는다)`, !!m && m.demo === false && /^image\//.test(m.type), m && {demo:m.demo, type:m.type});
  check(`   ${k} 파일 이름에 확장자가 있다`, !!m && /\.(png|jpe?g)$/i.test(m.name), m && m.name);
}
check('영수증 칸 파일이 G15 다 (루브릭 13번 · 완전 정상)', /G15/.test(W.FILES[(f.files.proof_buy || [])[0]]?.name || ''), W.FILES[(f.files.proof_buy || [])[0]]?.name);
check('★ 요청한 주소가 전부 assets/demo/ 아래다 (배포본에 남는 폴더)', fetched.length > 0 && fetched.every(u => /^assets\/demo\/[^/]+\.(png|jpe?g)$/i.test(u)), fetched);
check('★★ 요청한 파일이 저장소에 실제로 있다 (배포하면 같이 나간다)', fetched.every(u => existsSync(APP + u)), fetched.filter(u => !existsSync(APP + u)));
check('값 — 품목 위생용품 세트', f.itemName === '위생용품 세트', f.itemName);
check('값 — 수량 250', String(f.qty) === '250', f.qty);
check('값 — 단가(장부가액) 8400 (영수증과 같다)', String(f.unitBook) === '8400', f.unitBook);
check('값 — 후원일자 2026-06-15 (영수증 6/11 뒤)', f.donDate === '2026-06-15', f.donDate);
check('값 — 사업자번호가 법인 형식이다', /^\d{3}-8\d-\d{5}$/.test(f.bizNo || ''), f.bizNo);
check('값 — 주민번호는 비어 있다 (법인 · PDF 에 가짜 번호가 안 찍힌다)', !f.rrn, f.rrn);
check('값 — 매입세액공제 "아니오" (E1 이 합계 2,100,000 과 대조해 이상 없음 · 모름이면 늘 확인 권장)', f.vatDeduction === false, f.vatDeduction);
check('값 — 후원자명 앞 [검사용] (심사 뒤 정리 SQL 이 지운다)', /^\[검사용\]/.test(f.donorName || ''), f.donorName);
check('★ 동의·확인이 다 채워져 donorErrors 가 0건 — 채웠는데 제출이 막히면 시연이 멈춘다', W.donorErrors(f).length === 0, W.donorErrors(f));
check('   법인은 서명을 채우지 않는다 (직인 이미지가 원본)', f.signed === false && !f.signImg);
h = donorHtml();
check('   다 받은 뒤 화면에 "파일 준비 중" 이 없다', !/파일 준비 중|준비하는 중/.test(h));

console.log('\n════════ ③ [단가 불일치 건 채우기] — 같은 영수증, 단가만 다르다 ════════');
c = donorCase('법인');
fetched = [];
await W.presenterFillDonor('mismatch');
const g = DB.donorForm;
check('★★ 단가만 다르다 — 8400 이 아니다', String(g.unitBook) !== '8400' && /^\d+$/.test(String(g.unitBook)), g.unitBook);
check('   차이는 그럴듯한 크기(수천 원) — 일부러 틀린 것처럼 보이지 않게', Math.abs(Number(g.unitBook) - 8400) >= 100 && Math.abs(Number(g.unitBook) - 8400) <= 2000, g.unitBook);
check('   품목·수량·일자는 정상 건과 같다', g.itemName === '위생용품 세트' && String(g.qty) === '250' && g.donDate === '2026-06-15', {i:g.itemName, q:g.qty, d:g.donDate});
check('   영수증 파일도 같은 G15 (파일은 하나로 충분하다)', /G15/.test(W.FILES[(g.files.proof_buy || [])[0]]?.name || ''));
check('   합계는 자동계산(수량×단가)이라 비워 둔다 — 비고 없이 제출이 막히지 않는다', !W.isOverridden(g.giftVal) && W.donorErrors(g).length === 0, W.donorErrors(g));
c = donorCase('법인');
await W.presenterFillDonor('없는벌');
check('   모르는 벌 이름은 정상 건으로 돈다 (조용히 빈 폼이 되지 않는다)', String(DB.donorForm.unitBook) === '8400', DB.donorForm.unitBook);

console.log('\n════════ ④ 법인외 링크에서 눌러도 산다 (시나리오는 법인이지만 막히지 않게) ════════');
c = donorCase('법인외');
fetched = [];
await W.presenterFillDonor('ok');
const e = DB.donorForm;
check('법인외 첨부 칸 = 구매영수증 · 물품사진 둘 다 blob', ['proof_buy','photo'].every(k => { const m = W.FILES[(e.files[k] || [])[0]]; return m && m.blob instanceof W.Blob; }), Object.keys(e.files));
check('   직인 칸은 없으니 요청도 없다', !fetched.some(u => /인감/.test(u)), fetched);
check('   단가(판매가액) 8400 · 서명 채움 · donorErrors 0건', String(e.unitSale) === '8400' && e.signed === true && W.donorErrors(e).length === 0, W.donorErrors(e));
check('   주민번호가 가짜 번호로 채워진다 — 개인 영수증 발급용 (PDF 에만 찍힌다)', /^\d{6}-\d{7}$/.test(e.rrn || ''), e.rrn);

console.log('\n════════ ⑤ 파일을 못 받으면 말한다 — 빈 첨부를 조용히 남기지 않는다 ════════');
c = donorCase('법인');
fetched = []; fetchMode = 'fail'; DB.toast = null;
await W.presenterFillDonor('ok');
fetchMode = 'ok';
check('★ 실패해도 presenterFilling 이 풀린다 (화면이 영영 "준비 중" 에 갇히지 않는다)', DB.presenterFilling === false, DB.presenterFilling);
check('★★ 토스트로 말한다 — 어느 파일인지', !!(DB.toast && /못 가져|실패|못 받/.test(DB.toast.msg)), DB.toast);
check('   blob 없는 파일을 칸에 남기지 않는다 (남기면 제출은 되는데 저장소엔 없다 — 9/13 과 같은 실패)',
      Object.keys(DB.donorForm.files).every(k => (DB.donorForm.files[k] || []).every(id => W.FILES[id] && W.FILES[id].blob)), DB.donorForm.files);
check('   글자 칸은 채워져 있다 (파일만 손으로 올리면 이어갈 수 있다)', DB.donorForm.itemName === '위생용품 세트');

console.log('\n════════ ⑥ 기관 폼도 같은 게이트 · 배분 물품 사진이 진짜 blob ════════');
const KA = W.COL.accessLink;
function orgCase(){
  DB.cases.length = 0;
  const oc = {id:'P9', dbId:99, donor:'[검사용] 시연후원자', donorType:'법인', item:'위생용품 세트', state:'검수 대기', acqPath:'구매',
    donation:{itemName:'위생용품 세트', qty:250, unitPrice:8400, book:2100000, fair:2100000, donorType:'법인'},
    orgName:'늘봄지역아동센터', dists:[{id:20, org_name:'늘봄지역아동센터', qty:250}],
    checklist:[
      {key:'inss',       uid:'inss#1',       n:'인수증 · 늘봄지역아동센터',       stage:'배분', kind:'A', included:true, distId:20, r:{}},
      {key:'dist_photo', uid:'dist_photo#1', n:'배분 물품 사진 · 늘봄지역아동센터', stage:'배분', kind:'A', included:true, distId:20, r:{}}
    ]};
  DB.cases.push(oc);
  DB.linkEntry = {token:'t', link:{[KA.distributionId]: 20}, state:'ok', caseId:oc.id, distId:20};
  DB.role = 'org'; DB.screen = 'orgForm'; DB.preview = false;
  DB.orgForm = {linkCaseId:oc.id, verified:true, verifyInput:'', verifyTries:0,
    receiverName:'', recvQty:'', recvPkg:'', recvDate:'', signed:false, signImg:null, confirm:false, files:{}, submittedId:null};
  return oc;
}
orgCase();
setSession('none');
h = W.viewOrgSubmit(false);
check('★★ 기관 폼 · 로그인 없음 → 시연 버튼 0개', !/배분 증빙 채우기|presenterFill/.test(h));
setSession('staff');
check('★★ 기관 폼 · staff → 0개', !/배분 증빙 채우기|presenterFill/.test(W.viewOrgSubmit(false)));
setSession('admin');
h = W.viewOrgSubmit(false);
check('★★ 기관 폼 · admin → [배분 증빙 채우기]', has(h, '배분 증빙 채우기'));
check('   실서비스라 addOrgDemoFile 버튼은 없다', !has(h, 'addOrgDemoFile'));
fetched = [];
check('presenterFillOrg 가 있다', typeof W.presenterFillOrg === 'function');
p = W.presenterFillOrg();
check('   받는 동안 presenterFilling 참', DB.presenterFilling === true);
DB.toast = null;
if (typeof W.submitOrg === 'function'){ W.submitOrg(); check('★ 받는 동안 기관 [제출] 도 막힌다', !!(DB.toast && /준비/.test(DB.toast.msg)), DB.toast); }
else check('submitOrg 가 없다 — 기관 제출 함수 이름을 확인하라', false);
await p;
const of = DB.orgForm;
const om = W.FILES[(of.files.dist_photo || [])[0]];
check('★★ 배분 물품 사진에 진짜 blob', !!om && om.blob instanceof W.Blob && om.demo === false, om);
check('   요청 주소가 assets/demo/ 이고 파일이 저장소에 있다', fetched.length === 1 && /^assets\/demo\//.test(fetched[0]) && existsSync(APP + fetched[0]), fetched);
check('   수량 250 · 날짜 · 담당자명 · 서명 · 확인이 채워져 orgErrors 0건', W.orgErrors(of, DB.cases[0]).length === 0, W.orgErrors(of, DB.cases[0]));
check('   결과보고서(선택)는 채우지 않는다 — 준비한 파일이 없다', !(of.files.report_dom || []).length);

console.log('\n════════ ⑦ 소스 — 시연 버튼은 전부 presenterOnly 안에 있다 (새로 만든 화면도 걸린다) ════════');
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/mg, '');
const bare = ['screen-donor.js','screen-staff.js','common.js'].flatMap(fn => {
  const lines = stripComments(readFileSync(APP + fn, 'utf8')).split('\n');
  return lines.filter((l, i) => /onclick="presenterFill/.test(l) &&
    !/presenterOnly\(/.test(lines.slice(Math.max(0, i - 2), i + 1).join('\n'))).map(l => fn + ': ' + l.trim().slice(0, 70));
});
check('★★ presenterFill 버튼이 presenterOnly 밖에 하나도 없다', bare.length === 0, bare);
check('   presenterOnly 는 isPresenter 하나로 갈린다', /function presenterOnly\([^)]*\)\{\s*return isPresenter\(\)/.test(stripComments(readFileSync(APP + 'common.js', 'utf8'))));
check('   isPresenter 는 AUTH.session 의 staffOk 와 staffRole===\'admin\' 둘 다 본다',
      (() => { const s = stripComments(readFileSync(APP + 'common.js', 'utf8')); const m = /function isPresenter\(\)\{([\s\S]*?)\n\}/.exec(s); return !!m && /staffOk/.test(m[1]) && /staffRole\s*===\s*'admin'/.test(m[1]); })());
check('   시연 파일 폴더 assets/demo/ 가 prepublish.sh 에서 살아남는다 (rm 목록에 assets 없음)',
      !/rm[^\n]*assets/.test(readFileSync(APP + 'prepublish.sh', 'utf8')));

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 시연 버튼은 발표자에게만 뜨고, 파일은 진짜로 올라간다');
process.exit(fail ? 1 : 0);
