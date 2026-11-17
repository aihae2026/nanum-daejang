/* 9/10~11 루브릭 실주행 발견 3건 + 배분 취소 뒷정리 (2026-09-11 선미)
   ① E2 중복 표시 — 같은 파일이 두 칸에 붙어도 대조 판정에 한 줄 (이번 세션 판정도)
   ② E4 사유 — 영수증이 있는데 수량을 하나로 못 읽으면 "서류가 없다" 가 아니라 그 사실을 말한다 (루브릭은 그대로)
   ③ 수량·단가·가액 칸 — 숫자 아닌 값은 제출이 막힌다 ('450 (200+150+100)' 이 0 으로 앉던 #270)
   ④ 취소된 배분처에는 증빙 링크 카드가 없고 '지정' 수에서도 빠진다
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-findings-0911.mjs */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { appScripts } from './app-scripts.mjs';
const require = createRequire(process.env.JSDOM_FROM ? process.env.JSDOM_FROM.replace(/\/?$/, '/') + 'package.json' : new URL('../prototype/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const APP = fileURLToPath(new URL('./', import.meta.url));
const dom = new JSDOM(readFileSync(APP + 'index.html', 'utf8'), {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost:8788/'});
const {window} = dom;
window.HTMLCanvasElement.prototype.getContext = function(){const n=()=>{};return{lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n};};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
for (const f of appScripts()) window.eval(readFileSync(APP + f, 'utf8'));
const W = window;
let fail = 0;
const check = (n, ok, got) => { console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got))); if (!ok) fail++; };

console.log('\n── ① E2 중복 — 같은 영수증이 구매영수증·물품사진 두 칸에 ──');
{
  const facts = {docKind:'구매영수증', qty:250, amount:2100000, issueDate:'2026-06-11', fileId:'f1'};
  const c = {id:'1', donorType:'법인', acqPath:'구매', inDate:'2026-06-15', dists:[],
    donation:{qty:250, donationDate:'2026-06-15'},
    checklist:[{key:'proof_buy', uid:'p', n:'구매영수증', kind:'A', included:true, r:{facts:facts}},
               {key:'photo',     uid:'q', n:'물품사진',   kind:'A', included:true, r:{facts:facts}}]};
  W.fileMeta = () => ({name:'G15.jpg'});
  const html = W.compareBlock(c);
  const e2 = (html.match(/일자 순서/g) || []).length;
  check('E2 가 실제로 났다 (검사가 헛돌지 않는다)', e2 >= 1, html.slice(0,200));
  check('「일자 순서」 가 한 줄뿐이다', e2 === 1, e2);
}
console.log('\n── ② E4 사유 — 3줄 영수증(수량 없음) + 사진 ──');
{
  const receipt = {docKind:'구매영수증', qty:null, amount:2900000, fileId:'f2'};
  const photo   = {docKind:'사진', fileId:'f3'};
  const c = {id:'2', donorType:'법인외', acqPath:'구매', donation:{qty:450}, dists:[],
    checklist:[{key:'proof_buy', uid:'p', r:{facts:receipt}}, {key:'photo', uid:'q', r:{facts:photo}}]};
  const r = W.checkE4(c, photo);
  check('판정은 그대로 판단 보류', r && r.verdict === '판단 보류', r);
  check('"서류가 없다" 고 하지 않는다', r && !/서류가 없습니다/.test(r.reason), r && r.reason);
  check('수량을 하나로 못 읽었다고 말한다', r && /하나로 읽지 못했습니다/.test(r.reason), r && r.reason);
  const c2 = {id:'3', donorType:'법인외', acqPath:'구매', donation:{qty:450}, dists:[],
    checklist:[{key:'photo', uid:'q', r:{facts:photo}}]};
  const r2 = W.checkE4(c2, photo);
  check('영수증이 정말 없으면 예전 문장 그대로', r2 && /서류가 없습니다/.test(r2.reason), r2 && r2.reason);
}
console.log('\n── ③ 숫자 칸 검증 ──');
{
  const base = () => Object.assign({}, W.DB.donorForm, {donorType:'법인외', path:'구매', donorName:'김검사', donDate:'2026-07-25',
    itemName:'양말', qty:'450', unitSale:'6444', giftVal:'', saleVal:'', note:'', agreePurpose:true, agreeDouble:true,
    privacy:true, privacyTransfer:true, signed:true, files:{}});
  const errs = f => W.donorErrors(f).filter(e => /숫자만/.test(e));
  check('450 은 통과', errs(base()).length === 0, errs(base()));
  check("'450 (200+150+100)' 은 막힌다", errs(Object.assign(base(), {qty:'450 (200+150+100)'})).length === 1, errs(Object.assign(base(), {qty:'450 (200+150+100)'})));
  check("'450개' 도 막힌다", errs(Object.assign(base(), {qty:'450개'})).length === 1);
  check('단가에 글자가 섞여도 막힌다', errs(Object.assign(base(), {unitSale:'6,444'})).length === 1);
  check('직접 입력한 기부가액도 본다', errs(Object.assign(base(), {giftVal:'2,900,000'})).length === 1);
}
console.log('\n── ④ 취소된 배분처 — 링크 카드·지정 수 ──');
{
  const c = {id:'4', dbId:4, donorType:'법인', acqPath:'구매', state:'검수 대기', orgId:20, orgName:'늘봄',
    donation:{qty:50}, dists:[{id:20, org_name:'늘봄지역아동센터', qty:20, cancelled_at:'2026-09-11T00:00:00Z', cancel_reason:'재배분'},
                            {id:21, org_name:'늘봄지역아동센터', qty:30}],
    checklist:[{key:'inss', uid:'inss#21', n:'인수증 · 늘봄', kind:'A', included:true, stage:'배분', distId:21, r:{}}]};
  c.orgLinks = [];
  const html = W.orgLinkBlock(c);
  if (html === null){ console.log('  (링크 카드 함수 이름을 못 찾아 건너뜀)'); }
  else {
    check('링크 카드가 살아 있는 배분처 수(1)만큼', (html.match(/증빙 제출 링크 발급|재발급/g) || []).length === 1, (html.match(/증빙 제출 링크 발급|재발급/g) || []).length);
  }
  check('liveDists 는 1곳', W.liveDists(c).length === 1);
}
console.log('\n' + (fail ? '❌ ' + fail + '항목 실패' : '✅ 전부 통과'));
process.exit(fail ? 1 : 0);
