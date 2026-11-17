/* 검수 화면 — 수취 축과 AI 축이 갈라져 보이는가 (2026-09-11 선미 · A안)

   ★ 왜 만들었나 — 9/10~11 루브릭 실주행에서 "확인필요" (담당자가 아직 안 봄) 와 "확인 권장" (AI 가 걸린 게 있음) 이
       둘 다 주황 알약이라 읽기 전엔 구분이 안 됐다. "확인필요 3건 차단" 이 미수취인지 오류인지도 알 수 없었다.
   ★ 정한 것 — 수취 상태는 제목 줄 회색 「제출됨 · 확인 전」, AI 판정은 왼쪽 띠 + 판정 상자에만 색.
       판단 보류는 회색이 아니라 청록(사람이 대신 봐야 하는 판정). 알약 밑에 판정 뜻 한 줄 고정. 요약줄은 두 축을 따로 센다.
       "수취 대기" 라 하지 않는다 — 안 온 것으로 읽힌다.

   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-judge-axes.mjs
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
  {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost:8788/'});
const {window} = dom;
window.HTMLCanvasElement.prototype.getContext = function(){const n=()=>{};return{lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n};};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
for (const f of appScripts()) window.eval(readFileSync(APP + f, 'utf8'));
const W = window;
let fail = 0;
const check = (n, ok, got) => { console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got))); if (!ok) fail++; };
const css = readFileSync(APP + 'styles.css', 'utf8');

const c = {id:'259', dbId:59, donor:'(주)가나유통', donorType:'법인', state:'검수 대기', acqPath:'구매',
  donation:{itemName:'컵라면 종합세트', qty:500, unitPrice:2500, book:1205000, fair:1205000}, dists:[], checklist:[]};
const up = {donorUpload:{status:'uploaded', date:'2026-09-10', fileName:'x.jpg'}, fileIds:['f1']};
const photo = {key:'photo', uid:'photo', n:'물품사진', kind:'A', included:true, stage:'접수', r:Object.assign({}, up)};
const proof = {key:'proof_buy', uid:'proof_buy', n:'구매영수증 또는 매입세금계산서', kind:'A', included:true, stage:'접수',
  r:Object.assign({}, up, {aiJudge:{state:'ok', verdict:'확인 권장', reason:'어느 쪽과도 다름 — 차이 45,000원', amount:'1,250,000', file:'G01_구매영수증.jpg', at:'2026-09-10'}})};
const hold  = {key:'market_px', uid:'market_px', n:'시가 확인 증빙', kind:'A', included:true, stage:'접수',
  r:Object.assign({}, up, {aiJudge:{state:'ok', verdict:'판단 보류', reason:'읽지 못했습니다', file:'x', at:'2026-09-10'}})};
const okay  = {key:'x', uid:'x', n:'기타', kind:'A', included:true, stage:'접수',
  r:Object.assign({}, up, {aiJudge:{state:'ok', verdict:'이상 없음', reason:'합계와 일치', file:'x', at:'2026-09-10'}})};
c.checklist = [photo, proof, hold, okay];
W.fileMeta = () => ({name:'x.jpg'}); W.fileKind = () => 'image';

console.log('\n── ① 수취 축 — 제출됐지만 담당자가 안 본 상태는 회색 「제출됨 · 확인 전」 ──');
{
  const st = W.itemStatus(photo);
  check('status = 제출됨 · 확인 전', st.status === '제출됨 · 확인 전', st.status);
  check('code 는 unc 그대로 (게이트·수취 흐름 불변)', st.code === 'unc', st.code);
  check('tone = neu (회색)', st.tone === 'neu', st.tone);
  check('"수취 대기" 라 하지 않는다 — 안 온 것으로 읽힌다', !/수취 대기/.test(st.status));
  const h = W.itemCard(c, photo);
  check('카드 알약이 회색(neu) 이고 주황(warn) 이 아니다', /pill neu/.test(h) && !/pill warn/.test(h), h.match(/pill \w+/g));
  check('카드에 st-sub 가 붙고 st-unc(주황 띠) 는 아니다', /item-card st-sub/.test(h) && !/st-unc/.test(h));
  check('AI 판정이 없는 항목엔 ai-* 띠가 없다', !/ai-(ok|warn|hold)/.test(h));
}

console.log('\n── ② AI 축 — 왼쪽 띠와 판정 상자에만 색 ──');
{
  const h = W.itemCard(c, proof);
  check('확인 권장 → ai-warn 띠', /ai-warn/.test(h));
  check('제목 줄 알약은 여전히 회색 제출됨 · 확인 전', /pill neu"><span class="pd"><\/span>제출됨 · 확인 전/.test(h));
  check('판정 상자에 주황 알약 확인 권장', /pill warn"><span class="pd"><\/span>확인 권장/.test(h));
  check('판정 뜻 한 줄 고정 — "대조한 값이 다릅니다"', /대조한 값이 다릅니다 — 원본을 보고 확인해 주세요/.test(h));
  const h2 = W.itemCard(c, hold);
  check('판단 보류 → ai-hold 띠 + 청록(info) 알약 (회색 아님)', /ai-hold/.test(h2) && /pill info"><span class="pd"><\/span>판단 보류/.test(h2), h2.match(/pill \w+/g));
  check('판단 보류 고정 문구 — "대조하지 못했습니다"', /대조하지 못했습니다 — 원본을 직접 봐 주세요/.test(h2));
  const h3 = W.itemCard(c, okay);
  check('이상 없음 → ai-ok 띠 + 초록 알약', /ai-ok/.test(h3) && /pill ok"><span class="pd"><\/span>이상 없음/.test(h3));
  check('이상 없음에도 제목 줄엔 회색 제출됨 · 확인 전 이 남는다 (담당자가 볼 게 끝난 게 아니다)', /제출됨 · 확인 전/.test(h3));
  check('이상 없음 고정 문구에 확인 범위가 있다 (루브릭 규칙 B)', /확인한 것: 금액/.test(h3));
}

console.log('\n── ③ 요약줄 — 두 축을 따로 센다 ──');
{
  /* 대조 판정(E2·E4·E7)도 같은 줄에 센다 — 이 시드는 기부일이 없어 E2 가 '판단 보류' 를 하나 더 낸다. 그것까지 사실대로 */
  const cmp = W.compareFindings(c) || [];
  const cmpHold = cmp.filter(f => f.verdict === '판단 보류').length;
  const cmpWarn = cmp.filter(f => f.verdict === '확인 권장').length;
  const line = W.aiCountLine(c);
  check('AI 지적 ' + (1 + cmpWarn) + '건 · 판단 보류 ' + (1 + cmpHold) + '건 (항목 판정 + 대조 판정)',
        new RegExp('AI 지적 ' + (1 + cmpWarn) + '건').test(line) && new RegExp('판단 보류 ' + (1 + cmpHold) + '건').test(line), line);
  const g = W.gateBlockText({canInspect:true, verdict:'미완결', missingCount:0, reviewCount:4, distOpen:0});
  check('게이트 문장은 "확인 전 N건 차단" (확인필요 아님)', /확인 전 4건 차단/.test(g) && !/확인필요/.test(g), g);
  /* AI 판정도 대조 판정도 없는 건 — 배분 전이고 기부일이 있으면 대조 판정이 안 난다 */
  const quiet = {id:'q', checklist:[photo], dists:[], donation:{qty:1}, inDate:'2026-09-01'};
  const cmpQ = (W.compareFindings(quiet) || []).filter(f => f.verdict !== '이상 없음').length;
  const none = W.aiCountLine(quiet);
  check('AI 지적이 없으면 줄 자체가 없다 (잔말 금지)' + (cmpQ ? ' — 시드에 대조 판정이 남아 건너뜀' : ''), cmpQ ? true : none === '', none);
}

console.log('\n── ④ CSS 가 뒤따른다 ──');
{
  check('.item-card.st-sub 가 있다', /\.item-card\.st-sub\{/.test(css));
  check('.item-card.ai-hold 가 info 색이다', /\.item-card\.ai-hold\{border-left-color:var\(--info\)/.test(css));
  check('ai-* 규칙이 st-done(461행) 보다 뒤에 있어 띠 색을 덮는다', css.lastIndexOf('.item-card.ai-ok') > css.lastIndexOf('.item-card.st-done{border-left-width:3px'));
}

console.log('\n' + (fail ? '❌ ' + fail + '항목 실패' : '✅ 전부 통과'));
process.exit(fail ? 1 : 0);
