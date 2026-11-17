/* 하단 팝업이 [닫기] 를 눌러야만 사라진다 (2026-09-08 연수 · 작업판 「지금 할 일」 5번)

   ★ 무엇이 있었나
     토스트에 자동 닫힘이 **하나도 없었다.** 수취 처리·완결·저장처럼 하루에 수십 번
     뜨는 성공 알림까지 전부 [닫기] 를 눌러야 사라졌다.

   ★ 왜 전부 자동으로 닫지 않았나 — 여기가 이 고침의 핵심이다
     작업판 문구는 "[닫기]를 눌러야만 사라지는 팝업은 2~3초 뒤 스스로 닫히게" 다.
     지금은 **전부** 그렇다. 그런데 전부 자동으로 닫으면 실패 알림도 같이 사라진다 —
       · "확인 5회 실패로 잠겼습니다"
       · "“…” 수취가 저장되지 않았습니다"
       · "제출이 저장되지 않았습니다 — 다시 [제출하기] 를 눌러 주세요"
     이 저장소가 제일 경계하는 것이 **실패가 조용히 지나가는 것**이다(조용한 실패 목록).
     기본을 자동 닫힘으로 두면 앞으로 새로 붙는 실패 토스트가 **아무도 안 본 채 사라진다.**
     그래서 성공 알림에만 `auto` 를 붙여 여는 쪽으로 했다 — 위험한 쪽을 기본값으로 두지 않는다.

   ★ 그래서 여덟을 본다
     ① 성공 알림은 스스로 닫힌다 (5번의 본체)
     ② 실패 알림은 안 닫힌다 — 표시를 안 붙였으니까
     ③ act 가 있으면 auto 가 붙어도 안 닫는다 (누를 기회를 뺏지 않는다)
     ④ cap 이 있으면 안 닫는다 (읽던 것을 지우지 않는다)
     ⑤ 다른 토스트로 바뀌면 옛 시계가 새 것을 닫지 않는다
     ⑥ 화면을 여러 번 그려도 시계가 다시 걸리지 않는다 (영영 안 닫히는 것)
     ⑦ 실제 성공 자리에 표시가 붙어 있다 (빠지면 조용히 원래대로 돌아간다)
     ⑧ 실패·검증 문구에는 표시가 없다 (실수로 붙이면 여기서 빨개진다)

   ⚠️ 실 DB 없이 돈다. 기다리는 시간은 검사가 줄인다(TOAST_AUTO_MS).
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-toast.mjs
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
  { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost:8788/' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function(){ const n=()=>{}; return {lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n}; };
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
for (const f of appScripts()) window.eval(readFileSync(APP + f, 'utf8'));

let fail = 0;
const check = (n, ok, got) => { console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got))); if (!ok) fail++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* 기다리는 시간만 줄인다 — 판단 규칙은 제품 코드 그대로 쓴다 */
window.TOAST_AUTO_MS = 20;
const WAIT = 80;

console.log('\n[① 성공 알림은 스스로 닫힌다 — 5번의 본체]');
window.DB.toast = {msg:'“인수증” 수취 처리했습니다', auto:true};
window.renderToast();
check('   뜬 직후에는 떠 있다', !!window.DB.toast, window.DB.toast);
await sleep(WAIT);
check('★ 2~3초 뒤 스스로 닫힌다 ([닫기] 를 안 눌러도)', window.DB.toast === null, window.DB.toast);

console.log('\n[② 표시가 없어도 닫힌다 — 기본이 자동 닫힘 (2026-09-11 선미 · "어떤 팝업이든")]');
/* 9/8 에는 실패 알림을 남겼다. 실주행에서 닫기를 계속 눌러야 해 뒤집었다 — 실패는 카드 안 배너가 남아서 말한다 */
window.DB.toast = {msg:'“인수증” 수취가 저장되지 않았습니다'};
window.renderToast();
check('   뜬 직후에는 떠 있다', !!window.DB.toast, window.DB.toast);
await sleep(WAIT);
check('★ 표시가 없어도 스스로 닫힌다', window.DB.toast === null, window.DB.toast);
window.DB.toast = {msg:'남겨야 하는 알림', sticky:true};
window.renderToast();
await sleep(WAIT);
check('★ 남기려면 sticky 를 붙인다 — 그때만 남는다', !!window.DB.toast, window.DB.toast);
window.clearToast();

console.log('\n[③ 누를 것이 있으면 안 닫는다]');
window.DB.toast = {msg:'접수번호 #225 로 접수되었습니다',
                   act:{label:'내 접수 보기', call:"go('done')"}};
window.renderToast();
await sleep(WAIT);
check('★ act 가 있으면 닫지 않는다 (버튼이 사라지면 못 누른다)', !!window.DB.toast, window.DB.toast);
window.clearToast();

console.log('\n[④ 둘째 줄(cap)이 있으면 조금 더 있다가 닫힌다]');
window.TOAST_CAP_MS = 60;         /* 기본 20 의 세 배 */
window.DB.toast = {msg:'올릴 수 없는 파일 2건', cap:'보고서.docx / 표.hwp'};
window.renderToast();
check('★ cap 도 자동 닫힘 대상이다', window.toastAutoCloses(window.DB.toast) === true);
await sleep(30);
check('   기본 시간(20)이 지나도 아직 떠 있다 (읽을 시간)', !!window.DB.toast, window.DB.toast);
await sleep(WAIT);
check('★ 그래도 결국 닫힌다', window.DB.toast === null, window.DB.toast);
window.clearToast();

console.log('\n[⑤ 남의 알림을 대신 닫지 않는다]');
window.DB.toast = {msg:'#225 를 저장했습니다'};
window.renderToast();
/* 시계가 끝나기 전에 다른 알림으로 바뀐다 — 옛 시계가 이걸 닫으면 안 된다. 새 알림은 제 시계로 닫힌다 */
await sleep(5);
const t5 = {msg:'#225 완결을 저장하지 못했습니다'};
window.DB.toast = t5;
window.renderToast();
await sleep(12);                  /* 옛 시계(20)는 끝났을 시점 · 새 시계(5+20)는 아직 */
check('★ 뒤에 뜬 알림이 옛 시계에 지워지지 않는다', window.DB.toast === t5, window.DB.toast);
await sleep(WAIT);
check('   새 알림도 제 시계로 닫힌다', window.DB.toast === null, window.DB.toast);
window.clearToast();

console.log('\n[⑥ 화면을 여러 번 그려도 시계가 다시 걸리지 않는다]');
/* render() 는 자주 불린다. 그릴 때마다 시계를 새로 걸면 토스트가 영영 안 닫힌다. */
const t6 = {msg:'#225 완결 처리되었습니다', auto:true};
window.DB.toast = t6;
window.renderToast();
for (let i = 0; i < 6; i++){ await sleep(6); window.renderToast(); }
await sleep(WAIT);
check('★ 여러 번 그려도 제때 닫힌다', window.DB.toast === null, window.DB.toast);

console.log('\n[⑦ 실제 성공 자리에 표시가 붙어 있다]');
const staff = readFileSync(APP + 'screen-staff.js', 'utf8');
const common = readFileSync(APP + 'common.js', 'utf8');
const donor = readFileSync(APP + 'screen-donor.js', 'utf8');
[['수취 처리했습니다', staff], ['접수를 취소했습니다', staff],
 ['신청서를 확인 처리했습니다', staff], ['로그아웃했습니다', common],
 ['본인 확인 완료', donor]].forEach(([msg, src]) => {
  const line = src.split('\n').find(l => l.includes('DB.toast') && l.includes(msg))
            || src.split('\n').find(l => l.includes(msg) && l.includes('msg:'));
  check(`★ “${msg}” 는 스스로 닫힌다`, !!line && /auto:\s*true/.test(line), line || '(자리를 못 찾음)');
});

console.log('\n[⑦-2 뺀 팝업 셋은 다시 살아나지 않는다 — 선미 결정 2026-09-08]');
/* 셋 다 문구 규칙에 걸려서 뺐다. 무심코 되살아나면 여기서 빨개진다.
     ① "확인 후 발급하면 새 링크가 만들어집니다" — 미리 설명하지 않는다
     ② "완결 처리되었습니다"                    — 아래 완결 요약 카드가 같은 말을 한다
     ③ "배분처가 모두 저장돼 있습니다"          — 아무 일도 안 일어났으면 알리지 않는다 */
check('★ ① 링크 발급 전 안내의 뒷문장이 없다',
  !/확인 후 발급하면 새 링크가 만들어집니다/.test(staff), '되살아났다');
check('   ① 앞문장(무엇이 됐다)은 남아 있다',
  /정보를 불러왔습니다', auto:true/.test(staff), '같이 지워졌다');
check('★ ② 완결 토스트가 없다 (요약 카드가 말한다)',
  !/완결 처리되었습니다/.test(staff), '되살아났다');
check('   ② 완결 저장 실패 알림은 그대로 있다 (이건 지우면 안 된다)',
  /완결을 저장하지 못했습니다/.test(staff), '같이 지워졌다');
check('★ ③ "배분처가 모두 저장돼 있습니다" 가 없다',
  !/배분처가 모두 저장돼 있습니다/.test(staff), '되살아났다');

console.log('\n[⑧ 실패·검증 문구에는 표시가 없다]');
/* auto 가 붙은 토스트 객체를 전부 꺼내 실패 어휘가 섞였는지 본다 —
   나중에 누가 실패 알림에 auto 를 붙이면 여기서 빨개진다. */
const BAD = /저장되지 않|저장하지 못|찾을 수 없|올바르지 않|입력하세요|입력해야|실패|없습니다|잠겼습니다/;
let scanned = 0, leaked = [];
[staff, common, donor].forEach(src => {
  src.split('\n').forEach(line => {
    if (!/auto:\s*true/.test(line)) return;
    scanned++;
    if (BAD.test(line)) leaked.push(line.trim().slice(0, 90));
  });
});
check('   표시가 붙은 자리를 실제로 찾았다 (0건이면 검사가 헛돈다)', scanned >= 10, scanned);
check('★ 실패·검증 문구에는 표시가 없다', leaked.length === 0, leaked);

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 어떤 알림이든 스스로 닫히고, 버튼 있는 것만 남는다');
process.exit(fail ? 1 : 0);
