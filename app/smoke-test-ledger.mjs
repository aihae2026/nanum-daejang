/* 원장 쓰기 — 배분처·완결이 DB 에 남는가 (2026-09-02 유진)

   ★ 왜 만들었나 — 9/2 에 세어보니 DB 에 쓰는 테이블이 4개뿐이었다.
     donation 은 읽기만 있었고 distribution 은 쓰는 코드가 아예 없었다.
     담당자가 등록한 배분처가 브라우저 메모리에만 있었다 — 새로고침하면 사라진다.

   ★ 특히 확인하는 것: **저장 뒤 항목 uid 가 어긋나지 않는가.**
     체크리스트 항목 uid 가 'inss#sd1' 처럼 배분처 id 를 물고 있다.
     저장하면 id 가 DB PK 로 바뀌는데 uid 를 안 옮기면
     "3번 기관을 눌렀는데 1번이 처리되는" 자리로 되돌아간다(7359b83).

   실 DB 를 쓰지 않는다 — sbPost/fetch 를 갈아끼운다.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-ledger.mjs
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
const wait = () => new Promise(r => setTimeout(r, 30));

/* DB 연결된 것처럼 꾸민다 */
window.eval("SUPABASE_CONFIG = {url:'https://x.supabase.co', key:'k'};");
const c = window.DB.cases[0];
c.dbId = 1;

console.log('\n[① 배분처가 DB 로 나간다]');
let sent = null;
window.sbPost = (t, rows) => { sent = {t, rows}; return Promise.resolve([{id: 77}]); };
const d = {id:'sd1', orgName:'늘봄지역아동센터', qty:20, distDate:'2026-09-02', memo:'메모'};
c.dists = [d];
c.checklist = [window.mkItem({key:'inss', n:'인수증 · 늘봄', kind:'A', stage:'배분', distId:'sd1'})];
check('저장 전 uid 는 화면 임시 id 를 문다', c.checklist[0].uid === 'inss#sd1', c.checklist[0].uid);
let r = await window.saveDistribution(c, d);
check('distribution 테이블로 보낸다', sent && sent.t === 'distribution', sent && sent.t);
check('낱개 수량이 실린다 (E7 이 이 값으로 대조한다)', sent.rows[0].qty === 20, sent.rows[0]);
check('건 PK 가 실린다', sent.rows[0].donation_id === 1);
check('기관명이 실린다', sent.rows[0].org_name === '늘봄지역아동센터');

console.log('\n[② 저장 뒤 id 와 uid 가 함께 옮겨간다]');
check('★ 배분처 id 가 DB PK 로 바뀐다', d.id === 77, d.id);
check('★ 항목 uid 도 따라 바뀐다 (안 바뀌면 엉뚱한 기관이 처리된다)',
      c.checklist[0].uid === 'inss#77', c.checklist[0].uid);
check('규칙코드 부분은 안 건드린다', c.checklist[0].uid.split('#')[0] === 'inss');

console.log('\n[③ 다른 기관 항목은 안 건드린다]');
c.checklist = [
  window.mkItem({key:'inss', n:'인수증 · A', kind:'A', stage:'배분', distId:'sd1'}),
  window.mkItem({key:'inss', n:'인수증 · B', kind:'A', stage:'배분', distId:'sd2'})
];
window.remapDistUid(c, 'sd1', 91);
check('sd1 만 바뀐다', c.checklist[0].uid === 'inss#91', c.checklist[0].uid);
check('★ sd2 는 그대로', c.checklist[1].uid === 'inss#sd2', c.checklist[1].uid);

console.log('\n[④ 저장 실패는 조용히 넘어가지 않는다]');
window.sbPost = () => Promise.reject(new Error('HTTP 401'));
let caught = null;
await window.saveDistribution(c, {id:'sd9', orgName:'X', qty:1}).catch(e => { caught = e.message; });
check('★ 실패가 호출한 쪽으로 올라온다 (담당자에게 보여야 한다)', /401/.test(caught || ''), caught);

console.log('\n[⑤ 다시 저장은 아직 DB 에 없는 것만 보낸다]');
c.dists = [{id:77, orgName:'저장됨', qty:10}, {id:'sd2', orgName:'아직', qty:10}];
/* ★ 표(table)별로 센다 (2026-09-13 · #323) — 전에는 sbPost 호출 수만 셌는데,
     다시 저장은 배분처를 넣은 **뒤에 체크리스트도 이어 넣는다.** 한 수로 세면
     그 둘을 못 가르고, '배분처가 두 줄로 들어갔다' 와 구별되지 않는다. */
const posts = {};
window.sbPost = (t) => { posts[t] = (posts[t] || 0) + 1; return Promise.resolve([{id: 78}]); };
window.DB.distSaveErr = {}; window.DB.distSaveErr[c.id] = {org:'아직', msg:'x'};
window.render = () => {};
window.retrySaveDist(c.id);
await wait(); await wait();
check('★ 저장된 것은 다시 안 보낸다 (같은 기관이 두 줄로 들어가지 않는다)',
      posts[window.T.distribution] === 1, posts);
/* ★ 배분처만 넣으면 절반이다 (#323) — 그 기관의 항목은 배분처가 숫자 id 를 받을 때까지
     미뤄져 있다(saveChecklist 의 deferred). 여기서 안 이으면 기관 링크가 자기 몫을 못 본다. */
check('★ 배분처를 저장한 뒤 체크리스트도 이어 넣는다 (미뤄 둔 배분 항목이 들어간다)',
      posts[window.T.checklistItem] === 1, posts);
check('성공하면 경고가 사라진다', !window.DB.distSaveErr[c.id], window.DB.distSaveErr);

console.log('\n[⑥ donation 은 지정한 칸만 고친다]');
let patched = null;
window.fetch = (u, o) => { patched = {u, body:JSON.parse(o.body)};
  return Promise.resolve({ok:true, json:() => Promise.resolve([{id:1, state:'완결'}])}); };
r = await window.saveDonationFields(c, {state:'완결'});
check('donation 으로 PATCH 한다', /donation\?id=eq\.1/.test(patched.u), patched.u);
check('state 만 담는다', JSON.stringify(patched.body) === '{"state":"완결"}', patched.body);
check('★ 모르는 칸은 담지 않는다 (전부 덮어쓰면 빈 칸이 null 로 지워진다)',
      await window.saveDonationFields(c, {해괴한칸:1}).then(x => !!x.skipped), null);

console.log('\n[⑥-2 완결한 시각이 이름 붙은 칸에 남는가 (2026-09-08 연수 · #225)]');
/* ★ 왜 붙였나 — completed_at 은 COL 에 선언돼 있는데 **허용 목록에 없어서**
     넘겨도 오류 없이 그냥 버려졌다. #225 를 실제로 완결하고 DB 를 조회해서야 드러났다.
     ⚠️ 허용 목록에 없는 칸은 **조용히 안 써진다** — 이 검사가 그 자리를 지킨다.
   updated_at 으로 대신할 수 없다: 그건 '이 줄이 마지막으로 바뀐 때' 라
     나중에 수량 정정이나 [다시 검수] 한 번이면 덮인다. */
patched = null;
await window.saveDonationFields(c, {state:'완결', completedAt:'2026-09-08T04:25:42.000Z'});
check('★ completed_at 이 실려 나간다 (허용 목록에 있다)',
      patched.body.completed_at === '2026-09-08T04:25:42.000Z', patched.body);
check('   state 도 같이 간다 (한 번의 PATCH 로 끝난다)',
      patched.body.state === '완결', patched.body);

/* 화면 쪽 — [완결 처리] 가 그 값을 실제로 만들어 넘기는가.
   허용 목록만 열고 넘기는 쪽을 안 고치면 칸은 영영 빈 채로 남는다. */
const staffSrc = readFileSync(APP + 'screen-staff.js', 'utf8');
check('★ 완결 처리가 completedAt 을 만든다',
      /c\.completedAt\s*=\s*new Date\(\)\.toISOString\(\)/.test(staffSrc), false);
check('★ 완결 저장이 그 값을 함께 보낸다',
      /saveDonationFields\(c,\s*\{state:'완결',\s*completedAt:c\.completedAt\}/.test(staffSrc), false);

/* ★ 최초 한 번 — [다시 검수] 뒤 재완결해도 첫 시각이 남아야 한다 (선미 요청 2026-09-08).
     되읽지 않으면 c.completedAt 이 비어 있어 그날 시각으로 조용히 덮인다. */
check('★ 이미 찍혔으면 덮어쓰지 않는다 (최초 완결 시점)',
      /if\s*\(!c\.completedAt\)\s*c\.completedAt\s*=/.test(staffSrc), false);
const dbSrc = readFileSync(APP + 'db.js', 'utf8');
check('★ DB 에 찍힌 완결 시각을 건에 실어 온다 (이게 없으면 최초가 안 지켜진다)',
      /completedAt:\s*row\[D\.completedAt\]/.test(dbSrc), false);

console.log('\n[⑦ 빈 응답을 성공으로 읽지 않는다]');
window.fetch = () => Promise.resolve({ok:true, json:() => Promise.resolve([])});
caught = null;
await window.saveDonationFields(c, {state:'완결'}).catch(e => { caught = e.message; });
check('★ 바뀐 행이 0건이면 실패로 본다 (RLS 는 성공을 돌려주며 막는다)',
      /행이 없습니다/.test(caught || ''), caught);

console.log('\n[⑧ 데모(DB 미연결)에서는 조용하다]');
window.eval("SUPABASE_CONFIG = {url:'https://여기에-프로젝트-URL.supabase.co', key:'여기에'};");
r = await window.saveDistribution(c, {id:'sd3', orgName:'데모', qty:1});
check('데모는 성공으로 다룬다 (붙을 DB 가 없다)', r.demo === true, r);

console.log('\n[⑨ 새 접수가 donation 에 만들어진다]');
window.eval("SUPABASE_CONFIG = {url:'https://x.supabase.co', key:'k'};");
let row = null;
window.sbPost = (t, rows) => { row = {t, r:rows[0]}; return Promise.resolve([{id: 555}]); };
const nc = {id:'201', state:'제출 대기', donorType:'법인', donor:'OO교회',
            acqPath:'구매', inDate:'2026-09-02',
            submittedVia:'접수 링크 발급(담당자 직접 전달)', criteriaKey:'k1'};
r = await window.createDonation(nc);
check('donation 테이블로 보낸다', row && row.t === 'donation', row && row.t);
check('건 번호가 실린다', row.r.case_no === '201', row.r.case_no);
check('★ 화면 상태를 그대로 쓴다 (제출 대기)', row.r.state === '제출 대기', row.r.state);
check('★ dbId 가 생긴다 — 이후 저장이 전부 이 값을 쓴다', nc.dbId === 555, nc.dbId);
check('물품·금액은 안 채운다 (후원자가 내야 아는 값)',
      row.r.qty === undefined && row.r.book_value === undefined, row.r);

console.log('\n[⑩ 접수 경로는 분류로 저장한다 — 자유 문구를 넣지 않는다]');
check('★ 화면 문구가 분류로 바뀐다', row.r.submitted_via === '링크 제출', row.r.submitted_via);
check('직접 등록 → 대리등록', window.viaCategory('직접 등록(서면 접수)') === '전화 문의 후 대리등록');
check('온라인 제출 → 링크 제출', window.viaCategory('접수 링크 제출(온라인 신청서)') === '링크 제출');
check('공문 → 공문', window.viaCategory('공문 접수') === '공문');
check('★ 모르는 문구는 지어내지 않고 비운다', window.viaCategory('알 수 없는 무엇') === null);

console.log('\n[⑪ 법인 외는 실명을 남기지 않는다 (개인정보)]');
/* ★ 규칙이 바뀌었다 (선미 결정 2026-09-06) — 전에는 NULL 이었다.
     안 남기니 담당자 목록에서 같은 품목 건을 접수번호 말고는 구분할 수 없었다(#217·#218·#219).
     '안 남긴다' → '알아볼 수 없게 남긴다'. 지키는 것은 그대로다: **실명은 DB 를 지나지 않는다.** */
const nc2 = {id:'202', state:'제출 대기', donorType:'법인외', donor:'홍길동', inDate:'2026-09-02'};
await window.createDonation(nc2);
check('★ 법인 외의 실명은 DB 에 안 간다', row.r.donor_name !== '홍길동', row.r.donor_name);
/* ⚠️ DB 제약이 같은 것을 지킨다 — patch-20260906-donor-name-mask.sql (9/6 실행).
     법인 외에는 NULL 이거나 '○' 가 든 값만 들어간다. 여기서 maskName 을 빼면 400 이 난다. */
check('★ 가린 이름이 들어간다 (구분은 된다)', row.r.donor_name === '홍○동', row.r.donor_name);

console.log('\n[⑫ 이미 저장된 건은 다시 만들지 않는다]');
let posts2 = 0;
window.sbPost = () => { posts2++; return Promise.resolve([{id: 999}]); };
r = await window.createDonation({id:'203', dbId: 7});
check('★ dbId 가 있으면 insert 하지 않는다 (건이 두 줄로 안 생긴다)', posts2 === 0 && r.already, {posts2, r});

console.log('\n[⑬ 확정 체크리스트가 저장된다]');
window.eval("SUPABASE_CONFIG = {url:'https://x.supabase.co', key:'k'};");
const cc = {id:'301', dbId:9, dists:[{id:12, orgName:'늘봄지역아동센터', qty:20}], checklist:[
  window.mkItem({key:'proof_buy', n:'구매영수증', kind:'A', stage:'접수', g:'후원자 발급', basis:'기관 업무지침'}),
  window.mkItem({key:'inss', n:'인수증 · 늘봄지역아동센터', kind:'A', stage:'배분',
                 g:'배분처 수취 — 늘봄지역아동센터', distId:12})
]};
let rows = null;
window.sbPost = (t, rr) => { rows = {t, rr}; return Promise.resolve(rr.map((_, i) => ({id: 100 + i}))); };
r = await window.saveChecklist(cc);
check('checklist_item 으로 보낸다', rows && rows.t === 'checklist_item', rows && rows.t);
check('두 항목 다 보낸다', rows.rr.length === 2, rows.rr.length);
check('★ 배분 항목에 기관 id 가 실린다 (어느 기관 인수증인지)',
      rows.rr[1].distribution_id === 12, rows.rr[1].distribution_id);
check('접수 항목은 기관 id 가 없다', rows.rr[0].distribution_id === null);
check('★ 이름에서 기관 꼬리를 뗀다 (안 떼면 새로고침마다 늘어난다)',
      rows.rr[1].doc_name === '인수증', rows.rr[1].doc_name);
check('★ 담당 표기도 꼬리를 뗀다', rows.rr[1].owner === '배분처 수취', rows.rr[1].owner);
check('항목마다 dbId 가 붙는다', cc.checklist[0].dbId === 100 && cc.checklist[1].dbId === 101,
      cc.checklist.map(x => x.dbId));

console.log('\n[⑭ 이미 저장된 항목은 다시 안 넣는다]');
let posts3 = 0;
window.sbPost = () => { posts3++; return Promise.resolve([{id:1}]); };
r = await window.saveChecklist(cc);
check('★ 같은 서류가 여러 줄로 안 생긴다', posts3 === 0 && r.skipped, {posts3, r});

console.log('\n[⑮ 저장 안 된 배분처는 항목에 안 붙인다]');
const cd = {id:'302', dbId:9, dists:[{id:'sd1', orgName:'아직', qty:5}], checklist:[
  window.mkItem({key:'inss', n:'인수증 · 아직', kind:'A', stage:'배분', g:'배분처 수취 — 아직', distId:'sd1'})]};
window.sbPost = (t, rr) => { rows = {t, rr}; return Promise.resolve([{id:200}]); };
await window.saveChecklist(cd);
check('★ 화면 임시 id(sd1)는 안 넣는다 (없는 배분처를 가리키면 FK 가 깨진다)',
      rows.rr[0].distribution_id === null, rows.rr[0].distribution_id);

console.log('\n[⑯ 사유해소는 status 를 덮지 않는다]');
const it = window.mkItem({key:'photo', n:'물품사진', kind:'A', stage:'접수'});
it.r.st = 'unc';
it.r.resolution = {reason:'후원처 통화 확인', by:'담당자', date:'2026-09-02'};
const row2 = window.itemToRow({dbId:9, dists:[]}, it);
check('★ status 는 확인필요 그대로 (수취완료로 둔갑하지 않는다)', row2.status === '확인필요', row2.status);
check('사유는 따로 적힌다', row2.resolution_reason === '후원처 통화 확인', row2.resolution_reason);
check('해소한 사람·날짜도 남는다', row2.resolved_by === '담당자' && row2.resolved_at === '2026-09-02');

console.log('\n[⑰ 저장 안 된 항목은 상태 갱신을 거부한다]');
caught = null;
await window.saveItemStatus({dbId:9}, {n:'x', r:{st:'done'}}).catch(e => { caught = e.message; });
check('★ 조용히 성공으로 넘기지 않는다', /저장되지 않았습니다/.test(caught || ''), caught);

console.log('\n[⑱ 제출본이 저장된다 — 그때 낸 그대로]');
window.eval("SUPABASE_CONFIG = {url:'https://x.supabase.co', key:'k'};");
let fs = null;
window.sbPost = (t, rr) => { fs = {t, r:rr[0]}; return Promise.resolve([{id:301}]); };
const cf = {id:'401', dbId:11, donorType:'법인', acqPath:'구매'};
const form = {itemName:'즉석밥 3종', qty:'400', pkg:'박스', unitBook:'12500',
              donDate:'2026-06-30', wantsReceipt:true, signed:true,
              /* ↓ 개인정보 — 절대 payload 에 들어가면 안 되는 것들 */
              donorName:'홍길동', bizNo:'220-81-45012', phone:'010-1234-5678',
              addr:'서울시 어딘가 123', ssn:'900101-1234567', signImg:'data:image/png;base64,AAA'};
r = await window.saveFormSubmission(cf, {
  formType:'물품기부신청서(법인)',
  payload: window.submissionPayload(form, cf, 400, 5000000, 5200000),
  signed:true, role:'donor'});
check('form_submission 으로 보낸다', fs && fs.t === 'form_submission', fs && fs.t);
check('건 PK 가 실린다', fs.r.donation_id === 11);
check('서식 종류가 실린다', fs.r.form_type === '물품기부신청서(법인)');
check('서명 여부만 남는다 (이미지 아님)', fs.r.signed === true);
check('낸 사람 구분이 남는다', fs.r.submitter_role === 'donor');
check('★ pdf_key 는 비어 있다 (PDF 기능이 아직 없다 = 개인정보가 아무 데도 없다)',
      fs.r.pdf_key === undefined || fs.r.pdf_key === null, fs.r.pdf_key);

console.log('\n[⑲ ★★ payload 에 개인정보가 새지 않는가 — 제일 중요]');
const pj = JSON.stringify(fs.r.payload);
[['이름','홍길동'], ['주민번호','900101-1234567'], ['연락처','010-1234-5678'],
 ['주소','서울시 어딘가 123'], ['사업자번호','220-81-45012'], ['서명 이미지','data:image']]
  .forEach(([label, val]) => check('★ ' + label + ' 이 안 들어간다', pj.indexOf(val) < 0, label));
check('대조에 쓰는 값은 들어간다 (품목·수량·금액)',
      fs.r.payload['품목'] === '즉석밥 3종' && fs.r.payload['수량'] === 400
      && fs.r.payload['장부가액'] === 5000000, fs.r.payload);
check('★ 폼에 칸이 늘어도 안 따라 들어간다 (화이트리스트)',
      Object.keys(window.submissionPayload({...form, 새칸:'몰래'}, cf, 1, 1, 1)).indexOf('새칸') < 0);

console.log('\n[⑳ 인수증 제출본 — 수령자 이름·서명은 빼고 저장]');
const inssPayload = {'품목':'즉석밥', '수량':400, '수령일자':'2026-07-01', '기관명':'늘봄지역아동센터'};
r = await window.saveFormSubmission(cf, {formType:'인수증', distId:12,
      payload:inssPayload, signed:true, role:'org'});
check('인수증으로 저장된다', fs.r.form_type === '인수증');
check('어느 기관 것인지 남는다', fs.r.distribution_id === 12);
check('★ 수령자 이름이 payload 에 없다', JSON.stringify(fs.r.payload).indexOf('수령자') < 0, fs.r.payload);
check('저장 안 된 배분처는 안 붙인다',
      await window.saveFormSubmission(cf, {formType:'인수증', distId:'sd1', payload:{}})
        .then(() => fs.r.distribution_id === null), fs.r.distribution_id);

console.log('\n[㉑ 재제출은 새 줄로 쌓인다 — 이력 보존]');
let n = 0;
window.sbPost = () => { n++; return Promise.resolve([{id:400 + n}]); };
await window.saveFormSubmission(cf, {formType:'인수증', payload:{}});
await window.saveFormSubmission(cf, {formType:'인수증', payload:{}});
check('★ 덮어쓰지 않고 두 줄이 된다 (누가 언제 무엇을 냈나)', n === 2, n);

console.log('\n[㉒ 링크를 발급하면 받을 서류 목록도 함께 나간다 — 연수 실주행 발견]');
/* 후원자가 다른 기기로 링크를 열면 업로드 칸이 0개였다. 목록이 브라우저 메모리에만 있어서다.
   그대로 제출되면 첨부 0건으로 넘어간다 — 화면은 멀쩡하다(조용한 실패). */
window.eval("SUPABASE_CONFIG = {url:'https://x.supabase.co', key:'k'};");
const posted = [];
window.sbPost = (t, rr) => { posted.push({t, rr});
  return Promise.resolve(t === 'donation' ? [{id:55}] : rr.map((_, i) => ({id:500 + i}))); };
window.DB.req = {channel:'link', donorType:'법인', path:'구매', donorName:'테스트법인',
                 email:'', phone:'', verifyLast4:'1234', sent:false};
window.sendLink();
await wait(); await wait();
const linked = window.DB.cases[window.DB.cases.length - 1];
check('접수가 donation 으로 나간다', posted[0] && posted[0].t === 'donation', posted.map(x => x.t));
check('★ 받을 서류 목록도 나간다 (안 나가면 다른 기기에서 업로드 칸이 0개)',
      posted[1] && posted[1].t === 'checklist_item', posted.map(x => x.t));
check('★ 목록이 비어 있지 않다', !!(posted[1] && posted[1].rr.length), posted[1] && posted[1].rr.length);
check('항목이 방금 만든 건에 묶인다', !!posted[1] && posted[1].rr.every(x => x.donation_id === 55));
check('화면 항목에도 dbId 가 붙는다', linked.checklist.every(x => x.dbId), linked.checklist.map(x => x.dbId));

console.log('\n[㉓ 후원자가 제출해도 같은 서류가 두 줄이 되지 않는다]');
/* submitDonor 가 autoChecklist 로 목록을 통째로 다시 만든다 — 거기서 dbId 가 통째로 날아간다. */
const beforeIds = linked.checklist.map(x => x.dbId).join(',');
const prevList = linked.checklist;
linked.checklist = window.autoChecklist(linked.donorType, linked.acqPath, true, window.DB.promptProfile);
check('재전개 직후에는 dbId 가 없다 (여기가 함정이었다)', linked.checklist.every(x => !x.dbId));
const ad = window.adoptChecklistIds(linked, prevList);
check('★ 새 목록이 DB 줄을 물려받는다',
      linked.checklist.map(x => x.dbId).join(',') === beforeIds, linked.checklist.map(x => x.dbId));
check('내릴 항목은 없다 (목록이 그대로다)', ad.retired === 0, ad);
let posts4 = 0;
window.sbPost = () => { posts4++; return Promise.resolve([{id:1}]); };
r = await window.saveChecklist(linked);
check('★ 다시 저장해도 한 줄도 안 늘어난다', posts4 === 0 && r.skipped, {posts4, r});

console.log('\n[㉔ 재전개에서 빠진 항목은 지우지 않고 내린다]');
/* RLS 에 delete 정책이 없다(9/7 승희 과제) — 지울 수 없으니 included=false 로 내린다. */
const cg = {id:'501', dbId:12, dists:[], checklist:[
  window.mkItem({key:'a', n:'A', dbId:601}), window.mkItem({key:'b', n:'B', dbId:602})]};
const prevG = cg.checklist;
cg.checklist = [window.mkItem({key:'a', n:'A'})];
window.adoptChecklistIds(cg, prevG);
check('남은 항목은 dbId 를 물려받는다', cg.checklist[0].dbId === 601, cg.checklist[0].dbId);
check('★ 빠진 항목은 내릴 목록에 담긴다', String(cg.retiredItemIds) === '602', cg.retiredItemIds);
let retirePatch = null;
window.fetch = (url, opt) => { retirePatch = {url, opt};
  return Promise.resolve({ok:true, json: () => Promise.resolve([{id:602}])}); };
window.sbPost = (t, rr) => Promise.resolve(rr.map(() => ({id:999})));
r = await window.saveChecklist(cg);
check('★ delete 가 아니라 PATCH 로 내린다', retirePatch && retirePatch.opt.method === 'PATCH', retirePatch && retirePatch.opt.method);
check('included=false 로 내린다', JSON.parse(retirePatch.opt.body).included === false, retirePatch.opt.body);
check('★ note 는 안 건드린다 (왜 있었는지가 거기 있다)',
      Object.keys(JSON.parse(retirePatch.opt.body)).join(',') === 'included', retirePatch.opt.body);
check('내린 뒤 목록을 비운다 (두 번 안 내린다)', cg.retiredItemIds.length === 0, cg.retiredItemIds);

console.log('\n[㉕ 내리기가 안 먹었는데 성공으로 넘기지 않는다]');
window.fetch = () => Promise.resolve({ok:true, json: () => Promise.resolve([])});
caught = null;
await window.saveChecklist({id:'502', dbId:12, dists:[], checklist:[], retiredItemIds:[701]})
  .catch(e => { caught = e.message; });
check('★ 0건 내려갔는데 조용히 넘어가지 않는다 (RLS 는 거부 대신 빈 결과로 막는다)',
      /권한|RLS/.test(caught || ''), caught);

console.log('\n[㉖ ★ 다른 기기로 링크를 열어도 업로드 칸이 보인다 — 연수가 실주행에서 밟은 자리]');
/* 브라우저 메모리를 버리고 **DB 에 남은 줄만으로** 건을 다시 그린다.
   후원자가 다른 기기·다른 세션에서 링크를 여는 것이 정확히 이 상태다. */
const memSlots = window.donorSlots().length;
const savedRows = ((posted[1] || {}).rr || []).map((rr, i) => Object.assign({}, rr, {id: 500 + i}));
const reopened = window.rowToCase({
  id: 55, case_no: linked.id, state: '제출 대기', donor_type: '법인',
  acquisition_path: '구매', distribution: [], checklist_item: savedRows
});
window.DB.cases = window.DB.cases.filter(x => x !== linked);
window.DB.cases.push(reopened);
const reopenedSlots = window.donorSlots();
check('건이 DB 줄만으로 되살아난다', reopened.dbId === 55 && reopened.id === linked.id, {id:reopened.id});
check('★★ 업로드 칸이 0개가 아니다 (0이면 첨부 0건으로 제출된다)',
      reopenedSlots.length > 0, reopenedSlots.length);
check('★ 같은 기기에서 보던 것과 칸 수가 같다',
      reopenedSlots.length === memSlots, {reopened:reopenedSlots.length, memory:memSlots});
check('폼 검증 항목(F)은 업로드 칸이 되지 않는다',
      reopenedSlots.every(x => x.kind === 'A'), reopenedSlots.map(x => x.kind));
check('되살린 항목도 DB 자리를 안다 (첨부를 붙일 수 있다)',
      reopened.checklist.every(x => x.dbId), reopened.checklist.map(x => x.dbId));

console.log('\n[㉗ 접수 경로는 분류로 바꿔 보낸다 — 문장 그대로 보내면 DB 가 거부한다]');
/* 연수 실주행이 잡았다(2026-09-03) — HTTP 400 / 23514 donation_submitted_via_check.
   그리고 그 실패가 뒤의 저장 셋(체크리스트·제출본·첨부)을 통째로 데려갔다. */
let vp = null;
window.fetch = (u, o) => { vp = JSON.parse(o.body);
  return Promise.resolve({ok:true, json: () => Promise.resolve([{id:1}])}); };
await window.saveDonationFields({id:'601', dbId:1},
  {submittedVia:'접수 링크 제출(온라인 신청서)', itemName:'즉석밥'});
check('★ 화면 문장이 아니라 DB 분류가 실린다 (안 바꾸면 400 이 난다)',
      vp.submitted_via === '링크 제출', vp.submitted_via);
check('다른 칸은 그대로 간다', vp.item_name === '즉석밥', vp.item_name);
await window.saveDonationFields({id:'602', dbId:1}, {submittedVia:'직접 등록(서면 접수)'});
check('직접 등록도 분류로 바뀐다', vp.submitted_via === '전화 문의 후 대리등록', vp.submitted_via);
await window.saveDonationFields({id:'603', dbId:1}, {submittedVia:'알 수 없는 경로'});
check('★ 모르는 문구는 지어내지 않고 비운다 (틀린 분류가 통계에 섞이는 것보다 낫다)',
      vp.submitted_via === null, vp.submitted_via);
check('★ createDonation 과 같은 값을 만든다 (한 파일에서 규칙이 갈리지 않는다)',
      window.viaCategory('접수 링크 제출(온라인 신청서)') === '링크 제출');

console.log('\n[㉘ 다시 저장은 "남은 것만" 보낸다 — parts 의 뜻이 두 파일에서 같은가]');
/* screen-donor.js 가 채우고 screen-staff.js(retrySaveCase)가 읽는다.
   ★ true = 아직 안 들어갔다 = 다시 보내야 할 것.
     뒤집히면 들어간 것만 다시 보내고 빠진 것은 건너뛴다 — 조용히 어긋나는 자리다. */
window.eval("SUPABASE_CONFIG = {url:'https://x.supabase.co', key:'k'};");
const cr = {id:'701', dbId:21, dists:[], checklist:[window.mkItem({key:'a', n:'A', dbId:801})]};
window.DB.cases.push(cr);
let sentFields = null, postT = [];
window.fetch = (u, o) => { sentFields = JSON.parse(o.body);
  return Promise.resolve({ok:true, json: () => Promise.resolve([{id:21}])}); };
window.sbPost = (t, rr) => { postT.push(t); return Promise.resolve(rr.map(() => ({id:1}))); };
window.DB.caseSaveErr = {};
window.DB.caseSaveErr['701'] = {msg:'x', fields:{itemName:'즉석밥'},
  parts:{fields:true, checklist:false, form:true, files:false}};
window.retrySaveCase('701');
await wait(); await wait(); await wait();
check('★ fields 가 true 면 다시 보낸다', sentFields && sentFields.item_name === '즉석밥', sentFields);
check('★ checklist 가 false 면 새로 안 넣는다', postT.indexOf('checklist_item') < 0, postT);
check('★ 보낼 수 없는 것(제출본)은 지우지 않고 남긴다',
      !!(window.DB.caseSaveErr['701'] && /제출본/.test(window.DB.caseSaveErr['701'].msg)),
      window.DB.caseSaveErr['701']);
check('보낸 것은 내려간다 (두 번 안 보낸다)',
      window.DB.caseSaveErr['701'].parts.fields === false, window.DB.caseSaveErr['701'].parts);
check('담당자에게 무엇이 없는지 말한다',
      /후원자.*재제출/.test((window.DB.toast || {}).cap || ''), window.DB.toast);

console.log('\n[㉙ 남길 것이 없으면 다 지운다]');
const cr2 = {id:'702', dbId:22, dists:[], checklist:[window.mkItem({key:'a', n:'A', dbId:802})]};
window.DB.cases.push(cr2);
window.DB.caseSaveErr['702'] = {msg:'x', fields:{itemName:'생수'},
  parts:{fields:true, checklist:false, form:false, files:false}};
window.retrySaveCase('702');
await wait(); await wait(); await wait();
check('★ 전부 들어갔으면 경고를 지운다', !window.DB.caseSaveErr['702'], window.DB.caseSaveErr['702']);

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
