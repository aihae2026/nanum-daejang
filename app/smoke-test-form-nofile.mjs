/* 제출은 있는데 서류 파일(PDF)이 없는 행 — 화면이 "미수취" 로 거짓말하던 자리
   (2026-09-07 · 승희 실 DB 조회 → 선미 구현)

   ★ 무엇이 있었나
     `loadFormPdfs` 는 **PDF 가 저장된 제출분만** 읽는다(`db.js` `pdf_key=not.is.null`).
     그런데 9/4 에 순서를 일부러 뒤집었다 — *"제출본을 먼저 남기고(주소 칸은 빈칸), PDF 가 되면 채운다"*
     (`db.js:946`). 그 전에는 PDF 만들기가 멈추면 **제출 내용 저장이 시작조차 안 돼서**
     후원자가 낸 것이 통째로 사라졌기 때문이다. 옳은 결정이었다.
     대신 **"제출은 있는데 PDF 는 없는 행"** 이 생길 수 있게 됐고, 복원이 그것을 건너뛰므로
     화면은 그 항목을 **'미수취'** 로 세운다. 냈는데 안 왔다고 말하는 자리다.

   ★ 실 DB 조회 결과 (승희 2026-09-07) — 7건 · 전부 9/2~9/3 · 9/4 이후 0건
       인수증  1건  (제출 7 · 접수 5 · 배분처 13 · role=org)
       신청서  6건  (제출 1~6 · 접수 9·10·13·15·16·20 · role=donor)
     ★ **인수증만이 아니다.** 신청서 경로(formSubmit)에도 같은 증상이 있어
       한쪽만 고치면 6건이 그대로 남는다.

   ★ 방향 — 복원을 넓히지 않고 **화면이 사실대로 말하게** 한다
     PDF 없는 행까지 그냥 되살리면 **열리지 않는 [PDF 열기] 버튼**이 생긴다.
     지금 거짓말을 다른 거짓말로 바꾸는 것이다. 그래서 파일은 등록하지 않고
     "제출됨 · 서류 파일 없음 — 재제출 요청 필요" 로 세운다.

   ★ 그래서 다섯을 본다
     ① 신청서 항목이 미수취가 아니라 '확인필요' 로 서고 사유가 사실을 말한다
     ② 인수증 항목도 같다 — 그리고 **배분처가 같은 항목에만** 붙는다
     ③ ★ 열리지 않는 파일을 만들지 않는다 (FILES 에 등록하지 않는다)
     ④ ★ 진짜 제출본(PDF 있음)이 있으면 그쪽이 이긴다 — 이 표시로 덮이지 않는다
     ⑤ ★ 담당자가 이미 확정한 항목은 건드리지 않는다

   데모 데이터로 돈다 — 서버·DB 불필요.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-form-nofile.mjs
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

/* 실 DB 를 부르지 않고 그 자리에 승희가 뽑아 준 모양 그대로를 끼운다 */
const NOPDF = [
  {id:1, formType:'물품기부신청서(법인)', submittedAt:'2026-09-02T01:00:00+00:00', role:'donor', distId:null},
  {id:7, formType:'인수증',              submittedAt:'2026-09-03T02:00:00+00:00', role:'org',   distId:13}
];

console.log('\n[① 신청서 — 미수취가 아니라 사실을 말한다]');
const c = window.DB.cases[0];
const sItem = (c.checklist || []).filter(x => x.kind === 'S' && x.included)[0];
check('신청서 항목이 있다', !!sItem, sItem && sItem.key);
sItem.r = Object.assign({}, sItem.r, {st:'miss', formSubmit:null, formNoFile:null, resolution:null});
check('손대기 전에는 미수취다', window.itemStatus(sItem).code === 'miss', window.itemStatus(sItem).code);

window.markFormSubmissionsWithoutPdf(c, NOPDF);
const s1 = window.itemStatus(sItem);
check('★ 미수취가 아니다', s1.code !== 'miss', s1);
check('★ 확인필요로 선다', s1.code === 'unc', s1.code);
check('★ 사유가 사실을 말한다 (서류 파일 없음)', /서류 파일 없음/.test(s1.reason + s1.meta), s1);
check('재제출 요청이라고 알려준다', /재제출/.test(s1.reason + s1.meta), s1);

console.log('\n[② 인수증 — 배분처가 같은 항목에만 붙는다]');
/* ⚠️ 데모에는 배분처 13 이 없다. 있는 것만 보고 지나가면 **긍정 케이스가 안 돌고 초록이 된다**
     (이 저장소에서 두 번 겪은 거짓 통과다). 그래서 배분처 번호를 직접 만들어 둘을 세운다. */
let inssAll = (c.checklist || []).filter(x => x.key === 'inss');
check('데모에 인수증 항목이 있다', inssAll.length >= 1, inssAll.length);
if (inssAll.length < 2){          /* 다기관 상황을 만들어야 "남의 것으로 서지 않는가" 를 볼 수 있다 */
  const clone = JSON.parse(JSON.stringify(inssAll[0]));
  clone.uid = 'inss#99';
  c.checklist.push(clone);
  inssAll = (c.checklist || []).filter(x => x.key === 'inss');
}
const mine = inssAll[0], other = inssAll[1];
mine.included = true;  mine.distId = 13;      /* 이 기관이 냈다 */
other.included = true; other.distId = 99;     /* 이 기관은 안 냈다 */
[mine, other].forEach(x => { x.r = Object.assign({}, x.r, {st:'miss', orgUpload:null, formSubmit:null, formNoFile:null, resolution:null}); });
check('붙이기 전에는 둘 다 미수취다',
  window.itemStatus(mine).code === 'miss' && window.itemStatus(other).code === 'miss',
  [window.itemStatus(mine).code, window.itemStatus(other).code]);

window.markFormSubmissionsWithoutPdf(c, NOPDF);
check('★ 배분처 13 인수증이 확인필요로 선다', window.itemStatus(mine).code === 'unc', window.itemStatus(mine));
check('★ 사유가 배분기관이라고 말한다', /배분기관이/.test(window.itemStatus(mine).reason), window.itemStatus(mine).reason);
check('★ 다른 배분처는 그대로 미수취 (남의 것으로 서지 않는다)',
  window.itemStatus(other).code === 'miss', {distId:other.distId, st:window.itemStatus(other).code});

console.log('\n[③ ★ 열리지 않는 파일을 만들지 않는다]');
check('★ FILES 에 fp1 이 없다', !window.FILES['fp1'], Object.keys(window.FILES).filter(k => /^fp/.test(k)));
check('★ FILES 에 fp7 이 없다', !window.FILES['fp7'], Object.keys(window.FILES).filter(k => /^fp/.test(k)));
check('formPdfIds 에 섞이지 않는다', !(c.formPdfIds || []).some(x => x === 'fp1' || x === 'fp7'), c.formPdfIds);

console.log('\n[④ ★ 진짜 제출본이 있으면 그쪽이 이긴다]');
sItem.r.formSubmit = {status:'submitted', date:'2026-09-05', signed:true};
const s2 = window.itemStatus(sItem);
check('★ 수취완료로 선다 (파일 없음 표시가 덮지 않는다)', s2.code === 'done', s2.code);
check('사유에 "서류 파일 없음" 이 안 나온다', !/서류 파일 없음/.test(s2.reason + s2.meta), s2);

console.log('\n[⑤ ★ 담당자가 확정한 것은 건드리지 않는다]');
sItem.r = Object.assign({}, sItem.r, {st:'done', formSubmit:null, formNoFile:null, date:'2026-09-06', by:'담당자'});
window.markFormSubmissionsWithoutPdf(c, NOPDF);
check('★ 수취완료 그대로다', window.itemStatus(sItem).code === 'done', window.itemStatus(sItem).code);
check('★ 표시를 새로 붙이지 않는다', !sItem.r.formNoFile, sItem.r.formNoFile);

console.log(fail ? '\n❌ 실패 ' + fail + '건' : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
