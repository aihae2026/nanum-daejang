/* 배분처 링크 — 폼이 **자기 배분처**의 이름·수량을 쓰는가 (2026-09-07 선미 · #226 실측)

   ★ 왜 만들었나 — dev 에서 #226(초록 8 · 우리 2, 신고 10)을 돌려 보니 셋이 틀렸다.
       ① 우리지역아동센터 링크의 폼 기관명 칸 · 인수증 PDF · 제출본 payload 에 전부 "초록지역아동센터"
          (c.orgName = 첫 배분처. payload 쪽은 d.orgName 을 읽었는데 DB 행은 org_name 이라 늘 실패)
       ② 초록이 8 을 적으면 "신고 수량 10과 다릅니다" · 제출하면 담당자 화면에 수량 불일치까지
       ③ [파일 첨부 (데모)] 가 실 DB 에서도 보여, 누르면 이름뿐인 파일이 조용히 버려지고 "제출 완료" 뒤 미수취
   ★ 검사 원칙(9/7): 고치기 전 코드에서 빨간지 + 긍정 케이스가 실제로 도는지 둘 다 본다.
       ②의 긍정 케이스 = "배분 수량과 같으면 조용하다" · ③의 긍정 케이스 = "데모 모드에서는 버튼이 산다"

   실 DB 를 읽지 않는다 — sbGet·fetch 를 막고 화면 동작만 본다.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-org-link-dist.mjs
*/
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';   /* ⚠️ .pathname 은 한글 폴더를 %ED… 로 인코딩해 파일을 못 찾는다 */
import { appScripts } from './app-scripts.mjs';
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
const W = window, DB = W.DB;

let fail = 0;
const check = (n, ok, got) => {
  console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got)));
  if (!ok) fail++;
};

/* 실 DB 연결 모양 — sbReady()=true · isDemoMode()=false. 실제 호출은 전부 막는다 */
window.eval("SUPABASE_CONFIG = {url:'https://x.supabase.co', key:'k'}; DB_SOURCE = 'Supabase';");
W.sbGet = () => Promise.resolve([]);
W.fetch = () => Promise.resolve({ok:true, status:200, text:()=>Promise.resolve(''), json:()=>Promise.resolve([{id:1}])});

/* #226 과 같은 모양 — rowToCase 가 주는 대로: dists 는 DB 행(org_name) · orgName 은 첫 배분처 */
const CH = {'초록':20, '우리':21};
function seed(opt){
  opt = opt || {};
  DB.cases.length = 0;
  const c = {
    id:'226', dbId:46, donor:'검사후원자', donorType:'법인외', item:'장난감', state:'검수 대기', acqPath:'구매',
    donation:{itemName:'장난감', qty:10, unitPrice:25000, book:250000, fair:250000, donorType:'법인외'},
    orgName:'초록지역아동센터',
    dists: opt.noDists ? [] : [{id:20, org_name:'초록지역아동센터', qty:8}, {id:21, org_name:'우리지역아동센터', qty:2}],
    checklist:[
      {key:'inss',       uid:'inss#1',       n:'인수증 · 초록지역아동센터',       stage:'배분', kind:'A', included:true, distId:20, r:{}},
      {key:'dist_photo', uid:'dist_photo#1', n:'배분 물품 사진 · 초록지역아동센터', stage:'배분', kind:'A', included:true, distId:20, r:{}},
      {key:'inss',       uid:'inss#2',       n:'인수증 · 우리지역아동센터',       stage:'배분', kind:'A', included:true, distId:21, r:{}},
      {key:'dist_photo', uid:'dist_photo#2', n:'배분 물품 사진 · 우리지역아동센터', stage:'배분', kind:'A', included:true, distId:21, r:{}}
    ]
  };
  DB.cases.push(c);
  return c;
}
/* 배분처 링크로 들어온 상태 — smoke-test-pdf-submit 과 같은 직접 세팅 */
function enterOrg(c, distId, recvQty){
  const KA = W.COL.accessLink;
  DB.linkEntry = {token:'t', link:{[KA.distributionId]: distId}, state:'ok', caseId:c.id, distId:distId};
  DB.role = 'org'; DB.screen = 'orgForm'; DB.preview = false;
  DB.orgForm = {linkCaseId:c.id, verified:true, verifyInput:'', verifyTries:0,
    receiverName:'박수령', recvQty:String(recvQty), recvPkg:'', recvDate:'2026-09-07',
    signed:true, signImg:'data:image/png;base64,S', confirm:true, files:{}, submittedId:null};
}
const orgField = html => (/<label>기관명<\/label>\s*<input[^>]*value="([^"]*)"/.exec(html) || [])[1];

console.log('\n[① ★★ 두 번째 배분처 링크 — 폼이 자기 이름을 쓴다]');
let c = seed();
enterOrg(c, CH['우리'], '2');
let html = W.viewOrgSubmit(false);
check('★★ 기관명 칸 = 우리지역아동센터', orgField(html) === '우리지역아동센터', orgField(html));
check('기관명 칸에 첫 배분처(초록)가 안 들어간다', orgField(html) !== '초록지역아동센터', orgField(html));
check('화면 머리에도 우리지역아동센터', /page-d[^<]*우리지역아동센터/.test(html), (html.match(/page-d[^<]*/) || [''])[0]);
check('orgLinkDist 가 배분처 21 행을 준다 (org_name·qty 를 읽는다)',
      (() => { const d = W.orgLinkDist(c); return d && String(d.id) === '21' && d.orgName === '우리지역아동센터' && d.qty === 2; })(), W.orgLinkDist(c));

console.log('\n[② ★ 수량 힌트 — 기준은 이 배분처의 배분 수량이다]');
check('배분 수량(2)과 같으면 조용하다 (긍정 케이스)', !/다릅니다/.test(html));
enterOrg(c, CH['우리'], '3');
html = W.viewOrgSubmit(false);
check('배분 수량과 다르면 "이 기관 배분 수량 2" 를 말한다', /이 기관 배분 수량 2/.test(html), (html.match(/[^>]*다릅니다[^<]*/) || [''])[0]);
enterOrg(c, CH['우리'], '10');
html = W.viewOrgSubmit(false);
check('★ 신고 수량(10)을 적어도 "다르다" — 옛 코드는 여기서 조용했다', /다릅니다/.test(html));
check('힌트가 "신고 수량 10" 이라고 말하지 않는다', !/신고 수량 10/.test(html));

console.log('\n[③ ★ [파일 첨부 (데모)] — 실 DB 에서는 없고, 데모 모드에서는 산다]');
enterOrg(c, CH['우리'], '2');
html = W.viewOrgSubmit(false);
check('★ 실 DB 모드: 데모 첨부 버튼이 없다', html.indexOf('addOrgDemoFile') < 0);
check('실 DB 모드: 실제 파일 input 은 있다 (문구는 "파일 올리기" · 데모에서만 "실제 파일 선택")', /pickOrgFiles\(/.test(html) && html.indexOf('파일 올리기') >= 0, (html.match(/[^>]*파일[^<]*/g) || []).slice(0,3));
window.eval("DB_SOURCE = undefined;");
check('(전제) 데모 모드로 바뀌었다', W.isDemoMode() === true);
html = W.viewOrgSubmit(false);
check('데모 모드: 데모 첨부 버튼이 산다 (지운 게 아니라 감싼 것 — 긍정 케이스)', html.indexOf('addOrgDemoFile') >= 0);
window.eval("DB_SOURCE = 'Supabase';");

console.log('\n[④ ★★ 제출 — 스냅샷·제출본 payload·PDF 데이터 세 곳이 같은 기관명]');
let savedForm = null, pdfData = null;
const oSave = W.saveFormSubmission, oPdf = W.runOrgReceiptPdf;
W.saveFormSubmission = (cc, o) => { if (o.formType === '인수증') savedForm = o; return Promise.resolve({id:99}); };
W.runOrgReceiptPdf = (cc, d) => { pdfData = d; return Promise.resolve(null); };
c = seed();
W.getItem(c.id, 'dist_photo#2').r.st = 'done';           /* 사진은 이미 확정 — 인수증 폼만 남긴다 */
enterOrg(c, CH['우리'], '2');
check('(전제) 제출 전 검증 통과', W.orgErrors(DB.orgForm, c).length === 0, W.orgErrors(DB.orgForm, c));
W.submitOrg();
const inss2 = W.getItem(c.id, 'inss#2'), inss1 = W.getItem(c.id, 'inss#1');
check('제출됐다', DB.orgForm.submittedId === c.id, DB.orgForm.submittedId);
check('★★ 화면 스냅샷 기관명 = 우리지역아동센터', inss2.r.orgUpload && inss2.r.orgUpload.receipt.org === '우리지역아동센터', inss2.r.orgUpload && inss2.r.orgUpload.receipt);
check('★★ 제출본 payload 기관명 = 우리지역아동센터', savedForm && savedForm.payload['기관명'] === '우리지역아동센터', savedForm && savedForm.payload);
check('제출본이 배분처 21 에 묶인다', savedForm && String(savedForm.distId) === '21', savedForm && savedForm.distId);
check('★★ 인수증 PDF 데이터 기관명 = 우리지역아동센터', pdfData && pdfData.org === '우리지역아동센터', pdfData && pdfData.org);
check('★ 배분 수량(2)과 같으니 수량 불일치가 안 붙는다', !inss2.r.qtyFlag, inss2.r.qtyFlag);
check('초록 인수증(inss#1)은 건드리지 않는다', !inss1.r.orgUpload, inss1.r);

console.log('\n[⑤ ★ 첫 배분처(초록 8) — 8 은 정상, 10(신고 수량) 은 불일치]');
c = seed(); W.getItem(c.id, 'dist_photo#1').r.st = 'done';
enterOrg(c, CH['초록'], '8'); W.submitOrg();
let i1 = W.getItem(c.id, 'inss#1');
check('★ 8 = 배분 수량 → 불일치 없음 (옛 코드는 8≠10 으로 불일치)', !i1.r.qtyFlag, i1.r.qtyFlag);
check('스냅샷 기관명 = 초록지역아동센터', i1.r.orgUpload && i1.r.orgUpload.receipt.org === '초록지역아동센터', i1.r.orgUpload && i1.r.orgUpload.receipt.org);
c = seed(); W.getItem(c.id, 'dist_photo#1').r.st = 'done';
enterOrg(c, CH['초록'], '10'); W.submitOrg();
i1 = W.getItem(c.id, 'inss#1');
check('10 ≠ 배분 수량 8 → 불일치 {recv:10, expected:8, basis:dist}',
      i1.r.qtyFlag && i1.r.qtyFlag.recv === 10 && i1.r.qtyFlag.expected === 8 && i1.r.qtyFlag.basis === 'dist', i1.r.qtyFlag);

console.log('\n[⑥ 옛 구조(배분처 행 없음) — 신고 수량으로 떨어진다 · 기관명은 c.orgName]');
c = seed({noDists:true});
enterOrg(c, CH['초록'], '8');
check('기준 수량 = 신고 10 (basis donation)', (() => { const e = W.orgExpectedQty(c); return e && e.qty === 10 && e.basis === 'donation'; })(), W.orgExpectedQty(c));
check('기관명은 옛 값(c.orgName)으로', W.orgLinkOrgName(c) === '초록지역아동센터', W.orgLinkOrgName(c));

W.saveFormSubmission = oSave; W.runOrgReceiptPdf = oPdf;
console.log(fail ? `\n❌ ${fail}개 실패` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
