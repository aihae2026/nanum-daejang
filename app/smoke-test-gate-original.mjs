/* 설계서 §4 A·D — 게이트 제거 · 원본 확인을 기본 경로로 (2026-09-07 선미)
   정본: 10-planning/ui-redesign-audit-20260905.md §2-A · §2-D · §4-A · §4-D

   ── §4 A. 발송 화면의 게이트 ──────────────────────────────
   ★ 무엇이 있었나
     [전달 방법] 4개 중 **3개가 disabled '준비 중'** 이라 실제로 고를 수 있는 건 [링크 복사] 하나뿐인데,
     `DB.req.channel` 기본값이 `''` 라서 **그 하나를 반드시 눌러야** 아래 본인확인 값 칸과
     [발급] 버튼이 나타났다. 하나뿐인 선택지를 고르게 하는 클릭 + 그것이 게이트라서 필드까지 숨는 이중 손해.
     처음 여는 사람(심사위원)에게는 "발급 버튼이 없다"로 보인다.

   ★ 그래서 넷을 본다
     ① 기본값이 'copy' 다 (db.js 상수 한 곳)
     ② '준비 중' 버튼이 화면에 없다 (문구 규칙 9번 — 안 되는 기능은 버튼을 없앤다)
     ③ 고를 것이 하나뿐이면 [전달 방법] 필드 자체가 없다
     ④ ★ **게이트가 진짜로 없어졌다** — 채널을 비워도 본인확인 칸과 발급 버튼이 나온다
        (①만 고치면 기본값에 가려 게이트가 남아 있는 것을 못 본다. 그래서 값을 비우고 확인한다)

   ── §4 D. 확인을 건너뛰는 경로 ────────────────────────────
   ★ 무엇이 있었나
     확인필요 항목 카드에 길이 둘이었다.
         원본 안 보고 승인   [✓ 확인 후 수취 처리]                     — 1클릭
         원본 보고 승인      [원본 보고 처리] → 모달 → [✓ 확인했습니다] — 2클릭
     **성실한 쪽이 손해다.** 감사 대응이 이 제품의 목적인데 확인을 건너뛰는 경로가 더 짧았다.

   ★ 그래서 셋을 본다
     ⑤ 볼 원본이 있으면 1차 버튼은 [원본 보고 처리] 하나다 — 건너뛰기 버튼이 없다
     ⑥ ★ 볼 원본이 없는 항목에서는 [✓ 확인 후 수취 처리] 가 남는다
        (없애 버리면 파일 없이 제출된 항목을 영영 처리할 수 없다 — 길을 막는 것이 아니라 옮기는 것이다)
     ⑦ 승인 지점은 모달 안에 그대로 있다 (common.js — 이미 있던 것을 지우지 않았다)

   데모 데이터로 돈다 — 서버·DB 불필요.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-gate-original.mjs
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

window.DB.role = 'staff';

/* ══ §4 A. 발송 화면 ══════════════════════════════════════ */
console.log('\n[① 전달 방법 기본값 — 한 곳(db.js)에서 온다]');
check('★ DB.req.channel 기본값이 copy', window.DB.req.channel === 'copy', window.DB.req.channel);

console.log('\n[② 준비 중 버튼이 없다]');
window.DB.screen = 'send';
let send = window.viewSend();
check('★ "준비 중" 딱지가 화면에 없다', !send.includes('준비 중'),
  (send.match(/.{30}준비 중.{20}/) || [])[0]);
check('disabled 채널 버튼이 없다', !/setReq\('channel'[^)]*\)"?\s*disabled/.test(send) && !/disabled[^>]*>\s*(이메일|카카오 알림톡|문자)/.test(send),
  (send.match(/<button[^>]*disabled[^>]*>[^<]*/g) || []).slice(0, 4));

console.log('\n[③ 고를 것이 하나뿐이면 전달 방법 필드가 없다]');
check('★ [전달 방법] 라벨이 없다', !send.includes('<label>전달 방법</label>'),
  send.includes('<label>전달 방법</label>'));

console.log('\n[④ ★ 게이트가 진짜로 없어졌다 — 채널을 비워도 열려 있다]');
window.DB.req.channel = '';                       /* 기본값에 가려진 게이트를 드러낸다 */
const bare = window.viewSend();
check('★ 본인확인 값 칸이 그대로 있다', bare.includes('본인확인 값'), bare.includes('본인확인 값'));
check('★ 발급 버튼이 그대로 있다', bare.includes('sendLink()'), bare.includes('sendLink()'));
window.DB.req.channel = 'copy';

/* ══ §4 D. 확인필요 항목 카드 ═════════════════════════════ */
console.log('\n[⑤ 볼 원본이 있으면 건너뛰기 버튼이 없다]');
const c = window.DB.cases[0];
const it = (c.checklist || []).filter(function(x){ return x.included && x.kind === 'A'; })[0];
check('검사용 항목을 찾았다', !!it, it && it.key);
/* 후원자가 제출했고 AI 지적도 없는 상태 — 담당자가 내용만 확인하면 되는 자리 */
it.r = Object.assign({}, it.r, {donorUpload:{status:'uploaded', date:'2026-09-07', fileName:'영수증.png'},
  fileIds:['f-test-1'], ai:null, broken:null, qtyFlag:null, resolution:null, st:'unc'});
const withFile = window.itemCard(c, it);
check('상태가 확인필요다', window.itemStatus(it).code === 'unc', window.itemStatus(it).code);
check('[원본 보고 처리] 가 있다', withFile.includes('원본 보고 처리'), false);
check('★ [✓ 확인 후 수취 처리] 가 없다 — 성실한 경로가 유일하다',
  !withFile.includes('확인 후 수취 처리'),
  (withFile.match(/<button[^>]*>[^<]*처리<\/button>/g) || []));

console.log('\n[⑥ ★ 볼 원본이 없으면 그 버튼이 남는다 — 길을 막지 않는다]');
it.r.fileIds = [];
const noFile = window.itemCard(c, it);
check('★ [✓ 확인 후 수취 처리] 가 남아 있다', noFile.includes('확인 후 수취 처리'),
  (noFile.match(/<button[^>]*>[^<]*<\/button>/g) || []).slice(0, 4));
check('원본 보고 처리는 없다 (볼 것이 없으므로)', !noFile.includes('원본 보고 처리'), true);

console.log('\n[⑦ 승인 지점은 모달 안에 그대로 있다]');
const commonSrc = readFileSync(APP + 'common.js', 'utf8');
check('★ 모달의 [✓ 원문 확인 · 수취 처리] 를 지우지 않았다',
  commonSrc.includes('원문 확인 · 수취 처리'), false);
check('모달이 confirmUpload 를 부른다', /confirmUpload\(/.test(commonSrc), false);

console.log(fail ? '\n❌ 실패 ' + fail + '건' : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
