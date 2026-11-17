/* 제출이 DB 제약을 깨뜨리지 않는가 (2026-09-06 선미 실주행에서 터진 것)

   ★ 무엇을 막는 검사인가
     donation 에는 불변식이 걸려 있다 (patch-20260828-unit.sql:15)
       check (qty_as_received is null or pack_size is null or qty = qty_as_received * pack_size)
     그런데 후원자 폼은 '포장 단위 (선택)' **자유 텍스트**(예: "5박스", 참고용)를
     pack_size(1단위당 낱개 수)에 넣고 있었다.
       "5박스" → Number() 가 NaN → null → **우연히** 통과
       "5"     → pack_size=5 → 100 = 100 × 5 이 거짓 → HTTP 400 / 23514
     실제로 #214·#215 가 이렇게 깨졌다. 더 나쁜 것은 그때 링크가 **이미 폐기**돼
     후원자가 다시 낼 수 없었고, 화면은 "접수되었습니다" 라고 말했다는 점이다.

   ★ 그래서 제약을 여기서 그대로 흉내 낸다 — 어떤 입력이 와도 불변식이 깨지지 않아야 한다.
     saveDonationFields 를 가로채 **실제로 DB 로 나갈 값**을 본다(폼 계산이 아니라 전송값).

   데모 데이터로 돈다 — 서버·DB 불필요.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-qty-constraint.mjs
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

let fail = 0;
const check = (n, ok, got) => { console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got))); if (!ok) fail++; };

/* DB 제약을 그대로 옮긴 것 — 이 함수를 고치려거든 patch-20260828-unit.sql 을 먼저 고칠 것 */
const constraintOk = (r) =>
  r.qtyAsReceived == null || r.packSize == null || r.qty === r.qtyAsReceived * r.packSize;

async function submitWith(pkg, qtyText){
  const dom = new JSDOM(readFileSync(APP + 'index.html', 'utf8'),
    { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost:8788/' });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = function(){ const n=()=>{}; return {lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n}; };
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
  for (const f of appScripts()) window.eval(readFileSync(APP + f, 'utf8'));

  /* 실제로 DB 로 나가는 값을 가로챈다 */
  let sent = null;
  window.saveDonationFields = function(c, fields){ sent = fields; return Promise.resolve({ok:true}); };

  Object.assign(window.DB.req, {donorType:'법인외', path:'구매', donorName:'김초록',
    phone:'010-1234-1234', channel:'copy', verifyLast4:'1234'});
  window.sendLink();
  const id = window.DB.req.caseId;

  const f = window.DB.donorForm;
  f.linkCaseId = id;
  Object.assign(f, {donorType:'법인외', path:'구매', donorName:'김초록', donDate:'2026-09-05',
    addr:'서울시 중구 무교로 20', phone:'01012341234', wantsReceipt:true, rrn:'910216-1234213',
    purpose:'지역아동 생필품 지원', itemName:'우산', qty:qtyText, pkg:pkg, unitSale:'5000',
    signed:true, signImg:'data:image/png;base64,S',
    agreePurpose:true, agreeDouble:true, privacyTransfer:true, corpAck:true, privacy:true});
  ['proof_buy','photo'].forEach(k => { f.files[k] = ['demo:' + k]; });
  const errs = window.donorErrors(f);
  if (errs.length) return {err:errs};
  await window.submitDonor();
  return {sent, window, id};
}

console.log('\n[포장 단위 칸에 무엇을 써도 불변식이 깨지지 않는다]');
/* ★ 숫자만 쓴 경우가 실제로 터진 입력이다 */
for (const pkg of ['', '5박스', '5', '10', '1', '박스', '5 박스', '0']){
  const {sent, err} = await submitWith(pkg, '100');
  if (err){ check(`  포장="${pkg}"`, false, err); continue; }
  const ok = constraintOk(sent);
  check(`  포장="${pkg}" → qty=${sent.qty} · 서류수량=${sent.qtyAsReceived} · 낱개환산=${sent.packSize}`,
    ok, sent);
}

console.log('\n[수량이 비면 안전하게 빠진다]');
{
  const {sent, err} = await submitWith('5', '');
  if (err) check('  수량 빈 값은 폼 검증이 막는다', true, err.length);
  else check('  수량 빈 값 → 불변식 유지', constraintOk(sent), sent);
}

console.log('\n[포장 단위 글자는 버리지 않는다 — 제출본에 남는다]');
{
  const {sent, window, id} = await submitWith('5박스', '100');
  const payload = window.submissionPayload
    ? window.submissionPayload(window.DB.donorForm, window.getCase(id))
    : null;
  if (payload) check("  제출본 '단위' 에 원문이 남는다", payload['단위'] === '5박스', payload['단위']);
  else check('  submissionPayload 를 찾을 수 없다', false, '(함수 없음)');
  check('  낱개 수량은 그대로 100', sent.qty === 100, sent.qty);
}

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 어떤 포장 단위 입력에도 제약이 안 깨진다');
process.exit(fail ? 1 : 0);
