/* 파일 저장소(Supabase Storage) 실측 테스트 — 2026-09-01 유진

   ★ 실제 Supabase 로 나간다. 버킷이 아직 없으면 '없다는 것'을 확인하고 통과한다 —
     이 단계에서 확인해야 하는 것은 "성공하는가"가 아니라
     **"실패했을 때 조용히 넘어가지 않는가"** 이기 때문이다.

   ⚠️ 실제 서류를 올리지 않는다. 가상 픽스처(텍스트 몇 바이트)만 쓴다.
     로그인·RLS 가 붙기 전까지의 팀 원칙이다 (선미 조건 · 2026-09-01).

   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-storage.mjs
               (JSDOM_FROM 이유는 smoke-test-ai.mjs 주석 참조)
*/
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';   /* ⚠️ .pathname 은 한글 폴더를 %ED… 로 인코딩해 파일을 못 찾는다 (2026-09-05 집 PC 실측) */
import { appScripts } from './app-scripts.mjs';
import { staffLogin } from './test-staff-login.mjs';   /* 권한 3단계부터 담당자 동선 검사는 로그인해서 본다 (2026-09-08 승희) */   /* 스크립트 목록은 index.html 에서 읽는다 — 손으로 베끼지 않는다 (2026-09-05 · 정본 ⑥) */
const require = createRequire(process.env.JSDOM_FROM
  ? process.env.JSDOM_FROM.replace(/\/?$/, '/') + 'package.json'
  : new URL('../prototype/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const APP = fileURLToPath(new URL('./', import.meta.url));
const LAB = fileURLToPath(new URL('../ai-inspection-lab/', import.meta.url));
/* 시험용 PNG — 팀 실험 폴더(ai-inspection-lab, 미공개)가 없으면 저장소에 든 가상 샘플 서류를 쓴다 */
const FIXTURE_PNG = (() => { const p = LAB + 'inbox/T01_구매영수증.png';
  return existsSync(p) ? p : fileURLToPath(new URL('./assets/demo/B2_시가확인증빙_자사몰캡처.png', import.meta.url)); })();

const dom = new JSDOM(readFileSync(APP + 'index.html', 'utf8'),
  { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost:8788/' });
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function () {
  const noop = () => {};
  return { lineWidth:0, lineCap:'', strokeStyle:'', clearRect:noop, beginPath:noop, moveTo:noop,
           lineTo:noop, stroke:noop, drawImage:noop, bezierCurveTo:noop, quadraticCurveTo:noop,
           fill:noop, arc:noop };
};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,STUB';
/* config.local.js 는 키가 들어 있어 저장소에 없을 수 있다 — 없으면 예제본으로 대신한다.
   그 경우 sbReady() 가 false 라서 아래 업로드 검사는 건너뛴다(거짓 통과를 만들지 않는다). */
let cfg = 'config.example.js';
try { readFileSync(APP + 'config.local.js'); cfg = 'config.local.js'; } catch (e) {}
for (const f of [cfg, ...appScripts()])
  window.eval(readFileSync(APP + f, 'utf8'));
window.fetch = (u, o) => fetch(u, o);          /* 실제 Supabase 로 나간다 */
await staffLogin(window, { what: 'smoke-test-storage.mjs' });   /* ★ 올리기 전에 로그인 — 3단계부터 anon 은 Storage 를 못 읽어 서명 URL 이 막힌다 (2026-09-08) */

let fail = 0;
const check = (n, ok, got) => { console.log((ok?'  ✅ ':'  ❌ ')+n+(ok?'':'   ← '+JSON.stringify(got))); if(!ok) fail++; };

console.log('\n[경로 규칙 — 설계안 §2-④·⑤]');
const p1 = window.storagePath('attachments', 42, '매입세금계산서_OO식품.pdf');
console.log('   ' + p1);
check('건(donation) 폴더로 묶인다 — 파기가 건 단위라서', p1.startsWith('attachments/42/'), p1);
check('확장자는 남긴다', p1.endsWith('.pdf'), p1);
check('★ 원본 파일명이 경로에 안 남는다 (상호·이름이 URL·로그로 새지 않게)',
      !/OO식품|매입/.test(p1), p1);
const p2 = window.storagePath('attachments', 42, '매입세금계산서_OO식품.pdf');
check('★ 같은 이름을 또 올려도 경로가 안 겹친다 (재제출이 앞 건을 덮지 않는다)', p1 !== p2, [p1,p2]);
check('신청서 PDF 는 forms/ 로 갈린다 (권한을 따로 걸 수 있게)',
      window.storagePath('forms', 7, 'a.pdf').startsWith('forms/7/'), null);
check('건 번호가 없으면 unassigned 로 (경로가 깨지지 않는다)',
      window.storagePath('attachments', null, 'a.pdf').startsWith('attachments/unassigned/'), null);

console.log('\n[DB 연결]');
const live = window.sbReady() === true;
console.log(live ? '   Supabase 연결됨 (' + cfg + ')'
                 : '   ⚠️ config.local.js 가 없어 실호출 검사는 건너뜁니다');

if (!live) { console.log(fail ? `\n❌ 실패 ${fail}건` : '\n✅ 통과 (경로 규칙만)'); process.exit(fail?1:0); }

console.log('\n[업로드 — 실제 Supabase]');
/* ⚠️ 가상 픽스처만 쓴다(실 서류 금지 · 선미 조건). T01 은 AI 검수 실측용으로 만든 가짜 영수증이다.
   ★ 버킷이 PDF·PNG·JPEG·WEBP 만 받으므로 텍스트로 올리면 형식에서 걸린다(2026-09-01 실측). */
const png = readFileSync(FIXTURE_PNG);
/* ⚠️ Blob 은 jsdom 것이 아니라 Node 것을 쓴다.
     jsdom Blob 을 Node 의 fetch 에 넘기면 '[object Blob]'(13바이트) 문자열로 뭉개져
     올라간다. 업로드는 200 으로 성공해서 **테스트가 초록으로 거짓 통과한다**.
     2026-09-01 에 바이트 수를 대조하는 검사를 넣고서야 잡았다.
     실제 브라우저에서는 문제가 없다 — 테스트 환경만의 함정이다. */
const blob = new Blob([png], { type: 'image/png' });
const testPath = 'attachments/_test/' + Date.now() + '.png';
const r = await window.sbUploadFile(testPath, blob)
  .then(k => ({ ok:true, k })).catch(e => ({ ok:false, msg:e.message }));

if (r.ok) {
  console.log('   올라감: ' + r.k);
  check('버킷이 있고 업로드가 된다', true);
  const url = await window.sbSignedUrl(r.k, 60).then(u => u).catch(e => 'ERR ' + e.message);
  console.log('   서명 URL: ' + String(url).slice(0, 90) + '…');
  check('★ 비공개 버킷이라 서명 URL 로만 열린다', /token=/.test(String(url)), url);
  /* ★ 올린 바이트가 그대로 저장됐는가 — 이게 없으면 빈 파일을 올려도 통과한다 */
  const back = await fetch(String(url)).then(x => x.arrayBuffer()).catch(() => null);
  check('★ 올린 파일과 크기가 같다 (내용이 뭉개지지 않았다)',
        back && back.byteLength === png.length, {올림:png.length, 받음:back && back.byteLength});
} else {
  console.log('   ' + r.msg);
  check('★ 실패 사유를 사람이 읽을 수 있다 (조용히 안 넘어간다)',
        /버킷|정책|이미 있습니다/.test(r.msg), r.msg);
  console.log('   → 버킷이 아직 안 열렸다면 여기까지가 정상입니다.');
}

console.log('\n[데모 건 방어 — 지어내지 않는다]');
/* ⚠️ 2026-09-09 승희 — 전에는 DB.cases[0] 을 "데모 건" 으로 썼다. 9/8 부터 이 검사가 담당자로 로그인해 실 DB 를 읽으니
     cases[0] 은 실 DB 의 시연 건 #101 이었고, 10바이트 a.pdf 가 실제로 그 건에 올라갔다(첨부 행 94 · 지웠다).
     "데모 건" 은 DB 에 없는 건이다 — dbId 없는 가짜 건을 만들어 넘긴다. 실 DB 에는 아무것도 남지 않아야 한다. */
const demoCase = { id: 'demo-storage-check', dbId: null, checklist: [{ uid: 'inss', key: 'inss', kind: 'A', n: '(검사용)' }] };
const demoItem = demoCase.checklist[0];
const m = { id:'x', name:'a.pdf', type:'application/pdf', size:10,
            blob:new window.Blob(['x'], {type:'application/pdf'}) };
const res = await window.saveAttachment(demoCase, demoItem, m, 'donor');
check('데모 건은 저장하지 않고 사유를 돌려준다', res.ok === false && !!res.reason, res);
console.log('   사유: ' + res.reason);

console.log('\n[배분 단계 구분 — 기관마다 한 벌씩 있는 서류]');
/* 실제 DB에서 건을 읽어야 checklist_item 의 distId 가 들어온다 */
await window.loadCasesFromSupabase();
/* ★ '늘봄 인수증'과 '복지관 인수증'은 doc_key 가 같다(inss).
   distId 로 좁히지 않으면 첨부가 엉뚱한 기관 항목에 붙는다. */
/* ★ 검사는 반드시 #901(버려도 되는 건)에 올린다 (2026-09-02 선미 ④안)
     전에는 "dbId 있는 첫 번째 건" 을 골라서 시연 건(#101)에 올라갔다.
     ⚠️ 문제는 개수가 아니었다 — **테스트 파일이 시연 건의 '현재 첨부' 자리를 차지한 것**이다.
       43건을 지워야 했던 진짜 이유가 그것이다(선미 9/2).
     RLS 에 delete 정책이 없어 지울 수 없으므로, '지우지 말고 쌓이는 자리를 옮긴다'.
     ⚠️ #901 이 없으면 검사를 하지 않는다 — 시연 건에 올리느니 안 하는 것이 낫다.
     ※ 삭제 정책은 9/7 승희 RLS 재작업 때 함께 본다(시연 6일 전에 권한을 손대지 않는다). */
const TESTBED = '901';
function pickTestCase(){
  const t = window.DB.cases.find(x => String(x.id) === TESTBED && x.dbId
                                   && (x.checklist||[]).some(i => i.kind==='A' && i.dbId));
  if (!t){
    console.log('\n⏭ 건너뜁니다 — 검사용 건 #' + TESTBED + ' 이(가) 실 DB 에 없습니다.');
    console.log('   seed-e3-verify-20260902.sql 을 먼저 실행하세요.');
    console.log('   ⚠️ 시연 건에 올리지 않습니다 — 테스트 파일이 그 건의 현재 첨부 자리를 차지합니다.');
    process.exit(0);
  }
  return t;
}
const dbCase = pickTestCase();
if (dbCase) {
  const inss = (dbCase.checklist || []).filter(i => i.key === 'inss');
  console.log('   인수증 항목 ' + inss.length + '개 · distId: ' +
              JSON.stringify(inss.map(i => i.distId)));
  check('★ 배분 단계 항목이 distId 를 들고 있다 (기관을 가를 수 있다)',
        inss.length === 0 || inss.every(i => i.distId), inss.map(i => i.distId));
  check('★ 기관이 둘 이상이면 distId 가 서로 다르다',
        inss.length < 2 || new Set(inss.map(i => i.distId)).size === inss.length,
        inss.map(i => i.distId));
} else {
  console.log('   (DB 건이 없어 건너뜀)');
}

console.log('\n[다운로드 — 원본 이름으로 되돌리기]');
/* ★ 방금 올린 진짜 파일로 검사한다 — 없는 경로로 하면 '주소가 만들어지는가'를 못 본다 */
window.FILES['dl1'] = {id:'dl1', name:'매입세금계산서_OO식품.png', type:'image/png',
                       size:png.length, blob:null,
                       storageKey: r.ok ? testPath : 'attachments/1/없는파일.png'};
window.FILES['dl2'] = {id:'dl2', name:'데모.pdf', type:'application/pdf', size:100, blob:null};
const d2 = await window.downloadUrlFor('dl2');
check('★ 저장소에 없는 파일은 주소를 지어내지 않는다', d2.ok === false && !!d2.reason, d2);
console.log('   사유: ' + d2.reason);
const d3 = await window.downloadUrlFor('없는id');
check('모르는 파일도 사유를 돌려준다', d3.ok === false, d3);
const d1 = await window.downloadUrlFor('dl1');
if (d1.ok) {
  console.log('   ' + d1.url.slice(0, 110) + '…');
  check('★ 받을 주소에 원본 이름이 실린다 (UUID 대신 진짜 이름으로 저장되게)',
        /download=/.test(d1.url), d1.url);
  /* 실제로 그 이름으로 내려오는지까지 본다 — 주소에 붙었다고 먹는다는 보장은 없다 */
  const head = await fetch(d1.url);
  const cd = head.headers.get('content-disposition') || '';
  console.log('   content-disposition: ' + (cd || '(없음)'));
  check('★ 서버가 원본 이름으로 내려준다 (주소에 붙이는 것만으로 되는지 실측)',
        /매입세금계산서|filename/i.test(cd), cd);
} else {
  check('★ 실패 사유를 읽을 수 있다 (버킷 열리면 성공 경로 실측)',
        /버킷|정책|서명|HTTP/.test(d1.reason), d1.reason);
  console.log('   사유: ' + d1.reason);
}

console.log(fail ? `\n❌ 실패 ${fail}건` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
