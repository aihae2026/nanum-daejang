/* 사업자등록번호가 "확인필요" 인데 왜인지 안 보였다 (2026-09-10 선미 실주행 · 연수)

   ★ 무엇이 있었나 — 세 개가 겹쳐 있었다
     ① **칸이 없었다.** 법인 사업자번호 입력칸이 [기부금영수증 발급] 을 고른 사람에게만 떴다.
        그런데 bizno_fmt 검사는 영수증과 **무관하게 늘 돈다**(루브릭 §1-1 · E3 보조확인).
        영수증을 안 받는 법인은 낼 방법이 없는 것을 요구받고 확인필요가 났다.
     ② **하이픈이 없으면 못 읽었다.** formCheck 는 `split('-')[1]`, rules-compare 의
        bizMiddle 은 '숫자만 남기고 3~5번째' — 같은 규칙이 두 곳에서 갈렸다.
        칸이 하이픈을 자동으로 안 붙여 줘서 '1288145907' 로 치면 한쪽만 못 읽었다.
     ③ **사유가 저장되지 않았다.** checklist_item 에 memo 칸이 없어(saveItemStatus 가 안 보낸다)
        새로고침하면 사유가 사라지고 "첨부 내용을 확인해 주세요" 라는 기본 문구로 떨어졌다.

   ★ 그래서 넷을 본다
     ① bizMiddle 정본이 하나뿐이고, 하이픈이 있든 없든 같게 읽는가
     ② formCheck 가 그 정본을 쓰는가 — 하이픈 없는 번호가 통과하는가
     ③ 화면이 영수증 선택과 무관하게 법인에게 사업자번호 칸을 주는가
     ④ 되읽을 때 [F] 사유가 다시 채워지는가 (기본 문구로 안 떨어지는가)

   돌리는 법:  node smoke-test-bizno-reason.mjs
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

console.log('\n════════ ① bizMiddle — 정본이 하나뿐인가 ════════');
check('하이픈이 있으면 읽는다', window.bizMiddle('128-81-45907') === '81', window.bizMiddle('128-81-45907'));
check('★★ 하이픈이 없어도 같게 읽는다 (칸이 하이픈을 안 붙여 준다)',
      window.bizMiddle('1288145907') === '81', window.bizMiddle('1288145907'));
check('공백이 섞여도 읽는다', window.bizMiddle(' 128 81 45907 ') === '81', window.bizMiddle(' 128 81 45907 '));
check('10자리가 아니면 모름(빈 문자열)', window.bizMiddle('128-81-459') === '', window.bizMiddle('128-81-459'));
check('빈 값도 모름', window.bizMiddle('') === '' && window.bizMiddle(null) === '', true);
/* ★ 두 벌로 두었다가 갈렸다 — 정의가 늘어나면 여기서 먼저 깨진다 */
const rcSrc = readFileSync(APP + 'rules-compare.js', 'utf8');
check('★★ rules-compare 에 두 번째 정의가 없다 (규칙이 다시 갈리지 않게)',
      !/function\s+bizMiddle/.test(rcSrc), (rcSrc.match(/function\s+bizMiddle/g) || []).length);
const cmSrc = readFileSync(APP + 'common.js', 'utf8');
check('   정본은 common.js 에 하나 있다',
      (cmSrc.match(/function\s+bizMiddle/g) || []).length === 1,
      (cmSrc.match(/function\s+bizMiddle/g) || []).length);
check('   formCheck 가 split(\'-\') 으로 자르지 않는다 (옛 방식이 남아 있으면 안 된다)',
      !/bizNo\s*\|\|\s*''\)\.split\('-'\)/.test(cmSrc), true);

console.log('\n════════ ② formCheck — 하이픈 없는 번호가 통과하는가 ════════');
const fc = (bizNo, t) => window.formCheck('bizno_fmt', {bizNo}, t || '법인');
check('★★ 하이픈 없이 친 법인 번호가 통과한다 (이 건이 확인필요로 났었다)',
      fc('1288145907').code === 'done', fc('1288145907'));
check('하이픈이 있어도 통과한다', fc('128-81-45907').code === 'done', fc('128-81-45907'));
check('사유에 중간자리를 적어 준다', /중간자리 81/.test(fc('128-81-45907').reason), fc('128-81-45907').reason);
check('★ 개인사업자 번호(중간 05)는 확인필요 — 유형 확인 사안이라고 말한다',
      fc('128-05-45907').code === 'unc' && /유형/.test(fc('128-05-45907').reason), fc('128-05-45907'));
check('★★ 번호가 없으면 확인필요이고, 사유에 적힌 값을 보여 준다',
      fc('').code === 'unc' && /빈칸/.test(fc('').reason), fc(''));
check('   짧게 친 번호도 사유에 그 값이 남는다 (무엇을 고쳐야 할지 보인다)',
      /12881/.test(fc('12881').reason), fc('12881').reason);
/* ★ 담당자가 유형을 법인 → 법인 외로 고치면 이 항목이 남아 있을 수 있다.
     법인 외는 사업자번호를 받지 않으므로 **판정 대상이 아니다** — 없는 것을 내라고 하지 않는다. */
check('★★ 법인 외면 판정하지 않는다 (null) — 유형을 고친 건에서 엉뚱한 사유가 났다',
      window.formCheck('bizno_fmt', {bizNo:''}, '법인외') === null,
      window.formCheck('bizno_fmt', {bizNo:''}, '법인외'));

console.log('\n════════ ③ 화면 — 영수증과 무관하게 칸이 있는가 ════════');
let SEQ = 0;
function donorHtml(donorType, wantsReceipt){
  const id = 'B' + (++SEQ);
  window.DB.role = 'donor';
  window.DB.req = Object.assign(window.DB.req || {}, {donorType, path:'구매'});
  window.DB.cases = (window.DB.cases || []).filter(c => c.id !== id);
  window.DB.cases.push({id, state:'접수 대기', donorType, acqPath:'구매', donor:'(제출 대기)',
    checklist: window.autoChecklist(donorType, '구매', wantsReceipt, 'foundation')});
  window.DB.donorForm = Object.assign(window.DB.donorForm || {}, {
    donorType, path:'구매', donorName:'(주)한결식품', itemName:'컵라면', qty:400,
    donDate:'2026-09-10', unitBook:2500, unitSale:2500, agreePurpose:true, agreeDouble:true, privacyTransfer:true, corpAck:true,
    privacy:true, wantsReceipt, signed:false, signImg:null, files:{},
    linkCaseId:id, submittedId:null, verified:true, verifyInput:'', verifyTries:0});
  return window.viewDonorForm();
}
let h = donorHtml('법인', false);
check('★★ 법인 · 영수증 미발급 — 사업자등록번호 칸이 있다 (없어서 낼 수가 없었다)',
      /id="f_bizNo"|setDonor\('bizNo'|'bizNo'/.test(h) && /사업자등록번호/.test(h), /사업자등록번호/.test(h));
/* 2026-09-11 선미 — 사업자번호 칸의 설명 문구 두 줄을 뺐다(왜 받는지 · 하이픈). 문구 대신 사실을 본다:
   설명이 없어도 칸은 있고, 영수증 카드에는 법인세법 공제 안내만 있고 사업자번호를 다시 묻지 않는다. */
check('   옛 설명 문구는 없다 (9/11 선미)',
      !/기부금영수증을 받지 않으셔도/.test(h) && !/하이픈은 있어도 없어도/.test(h), false);
h = donorHtml('법인', true);
check('★ 법인 · 영수증 발급 — 사업자번호 입력 칸이 정확히 하나다 (영수증 카드에서 다시 묻지 않는다)',
      (h.match(/setDonor\('bizNo'/g) || []).length === 1, (h.match(/setDonor\('bizNo'/g) || []).length);
check('   영수증 카드에 법인세법 제24조 공제 안내가 있다 (9/11 선미 · 안내사항 4번 이동)',
      /법인세법 제24조/.test(h), false);
h = donorHtml('법인외', false);
check('★★ 법인 외 · 영수증 미발급 — 주민번호를 묻지 않는다 (양식 규칙 그대로)',
      !/주민등록번호\(사업자번호\)/.test(h), true);
check('   법인 외에게 사업자등록번호 칸을 주지 않는다', !/사업자등록번호 <span/.test(h), true);

console.log('\n════════ ④ 되읽기 — [F] 사유가 다시 채워지는가 ════════');
const D = window.COL.donation, K = window.COL.checklistItem;
function rowFor(bizNo, status){
  const row = {};
  row[D.id] = 1; row[D.caseNo] = '901'; row[D.state] = '검수 대기';
  row[D.donorType] = '법인'; row[D.donorName] = '(주)한결식품'; row[D.donorBizNo] = bizNo;
  row[D.qty] = 400; row[D.acquisitionPath] = '구매';
  row.distribution = [];
  const it = {};
  it[K.id] = 11; it[K.docKey] = 'bizno_fmt'; it[K.docName] = '사업자등록번호 형식';
  it[K.kind] = '폼필드'; it[K.stage] = '접수'; it[K.owner] = '폼 필드';
  it[K.basis] = '기관 업무지침 · 사업자번호 (코드 검증)'; it[K.included] = true; it[K.status] = status;
  row.checklist_item = [it];
  return row;
}
const noBiz = window.rowToCase(rowFor(null, '확인필요')).checklist.find(i => i.key === 'bizno_fmt');
check('★★ 번호가 없던 건 — 사유가 채워진다 (기본 문구로 안 떨어진다)',
      !!(noBiz.r && noBiz.r.memo), noBiz.r && noBiz.r.memo);
check('★★ 화면이 진짜 이유를 말한다 (전에는 "첨부 내용을 확인해 주세요" 였다)',
      /사업자등록번호가 없거나/.test(window.itemStatus(noBiz).reason), window.itemStatus(noBiz).reason);
check('   기본 문구가 아니다', window.itemStatus(noBiz).reason !== '첨부 내용을 확인해 주세요',
      window.itemStatus(noBiz).reason);

const fixed = window.rowToCase(rowFor('128-81-45907', '확인필요')).checklist.find(i => i.key === 'bizno_fmt');
check('★★ 값이 고쳐졌으면 그 사실을 말한다 (상태는 안 건드린다)',
      /지금 값으로는 통과/.test(window.itemStatus(fixed).reason), window.itemStatus(fixed).reason);
check('   상태는 여전히 확인필요다 (저장된 판정을 덮지 않는다)',
      window.itemStatus(fixed).status === '확인필요', window.itemStatus(fixed).status);

const okRow = window.rowToCase(rowFor('128-81-45907', '수취완료')).checklist.find(i => i.key === 'bizno_fmt');
check('★ 수취완료 건은 그대로 수취완료다', window.itemStatus(okRow).status === '수취완료',
      window.itemStatus(okRow).status);
check('★ 하이픈 없이 저장된 번호도 통과로 읽는다',
      window.itemStatus(window.rowToCase(rowFor('1288145907', '수취완료')).checklist[0]).status === '수취완료',
      window.itemStatus(window.rowToCase(rowFor('1288145907', '수취완료')).checklist[0]).status);

console.log('\n' + '─'.repeat(60));
console.log(fail ? `❌ ${fail}개가 어긋납니다` : '✅ 사업자등록번호 사유가 화면까지 살아서 옵니다');
process.exit(fail ? 1 : 0);
