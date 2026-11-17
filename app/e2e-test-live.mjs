/* E4·E5·E6·E2 화면 배선 — 실호출 E2E (2026-09-01 유진)

   ★ smoke-test-ai.mjs 와 다르다. 저쪽은 fetch 를 스텁으로 바꿔 배선만 본다.
     여기는 진짜 서버(wrangler)를 부르고 진짜 픽스처를 올린다 —
     핸드오프 §15 "코드는 들어갔는데 실호출을 못 해봤다"를 닫기 위한 것이다.

   돌리는 법 (서버가 떠 있어야 하고 Gemini 키를 실제로 쓴다)
     1) cd app
        set -a && . ../prototype/.env && set +a
        npx wrangler@latest pages dev . --port 8788 \
          --binding GEMINI_API_KEY="$GEMINI_API_KEY" GEMINI_MODEL="$GEMINI_MODEL"
     2) JSDOM_FROM=/tmp/fast node e2e-test-live.mjs
        (JSDOM_FROM 이유는 smoke-test-ai.mjs 주석 참조 — /mnt/c 에서 jsdom 이 매우 느리다)

   ⚠️ 모델 응답은 실행마다 달라진다. 이 테스트가 고정하는 것은 '배선이 도는가'이지
     '모델이 무슨 값을 주는가'가 아니다. 값의 정확도는 run-extract.mjs 로 잰다.
     실측 메모(2026-09-01): 같은 T01·같은 promptHash 인데 total 이 3회 중 2회 비어 왔다.
     §4 방어(checkExtractionGaps)가 그때마다 '판단 보류'로 붙잡는 것을 눈으로 확인했다.
*/
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';   /* ⚠️ .pathname 은 한글 폴더를 %ED… 로 인코딩해 파일을 못 찾는다 (2026-09-05 집 PC 실측) */
import { appScripts } from './app-scripts.mjs';   /* 스크립트 목록은 index.html 에서 읽는다 — 손으로 베끼지 않는다 (2026-09-05 · 정본 ⑥) */

const APP  = fileURLToPath(new URL('./', import.meta.url));
const LAB  = fileURLToPath(new URL('../ai-inspection-lab/', import.meta.url));
/* 시험용 PNG — 팀 실험 폴더(ai-inspection-lab, 미공개)가 없으면 저장소에 든 가상 샘플 서류를 쓴다 */
const FIXTURE_PNG = (() => { const p = LAB + 'inbox/T01_구매영수증.png';
  return existsSync(p) ? p : fileURLToPath(new URL('./assets/demo/B2_시가확인증빙_자사몰캡처.png', import.meta.url)); })();
const require = createRequire(process.env.JSDOM_FROM
  ? process.env.JSDOM_FROM.replace(/\/?$/, '/') + 'package.json'
  : new URL('../prototype/package.json', import.meta.url));
const t0 = Date.now();
const { JSDOM } = require('jsdom');
console.log(`jsdom 로드 ${((Date.now()-t0)/1000).toFixed(1)}초`);

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
for (const f of appScripts())
  window.eval(readFileSync(APP + f, 'utf8'));

/* 실제 서버로 나가게 한다 — 이게 이 테스트의 전부다 */
/* 기본은 로컬 서버(wrangler pages dev). 2026-09-09 부터 Access 를 떼서
   배포본으로도 쏠 수 있다:  E2E_ORIGIN=https://dev.your-domain.example node e2e-test-live.mjs */
const ORIGIN = process.env.E2E_ORIGIN || 'http://localhost:8788';
console.log(`[대상] ${ORIGIN}`);
window.fetch = (u, o) => fetch(String(u).startsWith('http') ? u : ORIGIN + u, o);
/* ★ 시간 끊기(api.js 의 AbortController)를 Node 것으로 바꿔 준다 — 2026-09-09.
   jsdom 이 만든 AbortSignal 을 Node 의 fetch 가 "내 것이 아니다" 며 거부해서
   (RequestInit: Expected signal to be an instance of AbortSignal) 실호출이
   시작조차 못 하고 이 검사 4항목이 빨갛게 났다. 진짜 브라우저에서는 둘이
   같은 곳에서 나오니 안 생기는 일 — 제품이 아니라 검사 환경 문제다. */
window.AbortController = AbortController;
window.AbortSignal = AbortSignal;
/* jsdom 에는 이미지 디코더가 없어 축소(shrinkForJudge)가 원본을 그대로 돌려준다.
   base64 변환만 진짜로 해 준다 — 서버가 받는 바이트는 진짜 픽스처다. */
const png = readFileSync(FIXTURE_PNG);
window.FileReader = class {
  readAsDataURL() { this.result = 'data:image/png;base64,' + png.toString('base64');
                    setTimeout(() => this.onload(), 0); }
};
window.eval('setBodyRole(DB.role); render();');

let fail = 0;
const check = (n, ok, got) => { console.log((ok?'  ✅ ':'  ❌ ')+n+(ok?'':'   ← '+JSON.stringify(got,null,1))); if(!ok) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 검수 대기 건에 진짜 파일을 붙인다 */
const c = window.DB.cases.find(x => x.state === '검수 대기');
const it = c.checklist.find(i => i.kind === 'A' && i.key === 'proof_buy');
window.FILES['e2e1'] = { id:'e2e1', name:'T01_구매영수증.png', type:'image/png',
                         size:png.length, blob:new window.Blob([png],{type:'image/png'}), demo:false };
it.r.fileIds = ['e2e1'];
console.log(`\n대상 건 ${c.id} · 항목 "${it.n}"`);

check('추출 대상으로 잡힌다', window.extractableItems(c).some(x => x.key === 'proof_buy'));

window.DB.caseId = c.id;
window.go('case', c.id, 'checklist');   /* 기본 탭이 '수취 현황' 으로 바뀌었다 (2026-09-06 M-5) — 검수 결과를 본다 */
console.log('\n[검수 실행] 누름 — 실호출 대기...');
window.runInspect();

for (let i = 0; i < 60 && (it.r.extracting || !it.r.facts && !it.r.factsError); i++) await sleep(1000);

console.log('\n[추출 결과]');
check('★ 실호출이 성공했다 (facts 가 붙었다)', !!it.r.facts, it.r.factsError);
if (it.r.facts) {
  const f = it.r.facts;
  console.log('  ' + JSON.stringify({docKind:f.docKind, qty:f.qty, total:f.total, issueDate:f.issueDate}));
  check('서류 종류를 읽었다', !!f.docKind && f.docKind !== '판독불가', f.docKind);
  check('★ E2 가 쓸 issueDate 가 채워졌다', !!f.issueDate, f.issueDate);
  check('저장에 필요한 model 이 함께 왔다', !!f.model, f.model);
  check('어느 파일에서 뽑았는지 기록된다', f.file === 'T01_구매영수증.png', f.file);
}

console.log('\n[대조 판정 카드 — 화면 렌더]');
const html = window.compareBlock(c);
const rules = [...html.matchAll(/>(E\d) · ([^<]*)</g)].map(m => m[1]+' '+m[2].trim());
console.log('  카드에 뜬 판정: ' + (rules.join(' | ') || '(없음)'));
let all = window.compareFindings(c);
(c.checklist||[]).forEach(i => { if (i.r && i.r.facts) all = all.concat(window.extractedFindings(c, i, i.r.facts)); });
all.forEach(f => console.log('   [' + f.rule + ' · ' + f.verdict + '] ' + f.reason));
console.log('\n[facts 가 붙은 항목 전부]');
(c.checklist||[]).forEach(i => { if (i.r && i.r.facts) console.log('   ' + i.key + ' → ' + JSON.stringify(i.r.facts)); });
for (const m of html.matchAll(/>(E\d) · ([^<]*)<[\s\S]*?pill ([a-z]+)"><span class="pd"><\/span>([^<]*)<\/span><\/b><small>([^<]*)</g))
  console.log();
check('★ 카드가 그려진다', html.length > 0);
/* 카드에는 E 번호 대신 규칙 이름(FINDING_LABEL)이 뜬다 (문구 수정 9/10) */
check('★ E2(일자 순서)가 카드에 뜬다', /일자 순서/.test(html));
check('E4·E5·E6 중 하나 이상이 추출값으로 뜬다', /수량 대조|취득경로|증빙서류 적격/.test(html));
check('E7(배분 수량 합계) 자리도 살아 있다', /배분 수량 합계/.test(html) || (c.dists||[]).length === 0);

console.log('\n[안전망 — 2안이 1안 대신 지켜야 하는 것]');
const body = ['content','modalWrap'].map(id => (window.document.getElementById(id)||{}).textContent||'').join('\n');
check('★ 화면이 살아 있다 (AI 호출이 화면을 붙잡지 않았다)', body.length > 100, body.length);
check('★ AI 자리에 담당자 확정값(수취완료)이 새지 않는다', !/수취완료/.test(html), html.slice(0,200));

console.log(fail ? `\n❌ 실패 ${fail}건` : `\n✅ 전부 통과 (${((Date.now()-t0)/1000).toFixed(0)}초)`);
process.exit(fail ? 1 : 0);
