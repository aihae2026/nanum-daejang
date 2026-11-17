/* E3(가액 산정 방식) 완결 게이트 — 시연 건과 배선이 살아 있는가 (2026-09-02 연수)

   ★ 확인하는 것: **E3 를 켤 대상이 하나라도 있는가.**
     2026-09-02 확인 시점에 데모·실 DB 전 건이 장부가액을 갖고 있어
     checkE3 의 `if (book) return null` 에서 전부 넘어갔다 — E3 를 켜도 걸리는 건이 0건이었다.
     화면(사유 해소 UI)은 다 만들어져 있는데 띄울 데이터가 없는 상태였다.
     그래서 #117 을 시연용으로 넣었다. 누가 이 건의 장부가액을 채우면 시연이 조용히 사라진다.

   ★ 함께 확인: donorBizNo 가 실제로 실려 오는가.
     COL 상수(db.js:33)는 선언돼 있었지만 rowToCase 가 쓰지 않아 늘 undefined 였고,
     isProfitCorp() 가 항상 '모름'을 돌려줬다. 선언만 보고 매핑됐다고 읽기 쉬운 자리다.

   ⚠️ 이 검사는 rules-compare.js:89 의 blocksComplete 값을 보지 않는다 —
     켜고 끄는 판단은 선미 몫이고, 이 검사는 '켤 때 걸릴 것이 있는가' 만 본다.

   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-e3.mjs
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

console.log('\n[E3 를 켤 대상이 있는가]');
const withE3 = window.DB.cases.filter(c => !!window.checkE3(c));
check('★ E3 가 걸리는 건이 최소 1건 있다 (0건이면 켤 이유가 없다)',
      withE3.length >= 1, withE3.length);

const c = window.getCase('117');
check('시연 건 #117 이 있다', !!c, c && c.id);
if (c){
  check('장부가액이 비어 있다 (채우면 E3 가 조용히 사라진다)', !c.donation.book, c.donation.book);
  check('시가가 있다', c.donation.fair > 0, c.donation.fair);
  check('★ 영리법인으로 판정된다 (사업자번호 중간자리 81~88)',
        window.isProfitCorp(c) === true, c.donorBizNo + ' → ' + window.bizMiddle(c.donorBizNo));
}

console.log('\n[E3 만 막는가 — 무엇이 완결을 막는지 흐려지면 안 된다]');
if (c){
  const fs = window.compareFindings(c);
  const e3 = fs.find(f => f.rule === 'E3');
  check('E3 가 뜬다', !!e3, fs.map(f => f.rule));
  check('사유에 영리법인 근거가 적힌다', /영리법인/.test((e3 && e3.reason) || ''), e3 && e3.reason);
  const others = fs.filter(f => f.rule !== 'E3');
  check('★ E2·E7 은 이상 없음이다 (합계·일자가 맞게 짜여 있다)',
        others.every(f => f.blocksComplete === false), others.map(f => f.rule + ':' + f.verdict));
  check('E3 는 사유로 해소할 수 있는 모양이다 (isError=true)', e3 && e3.isError === true, e3 && e3.isError);
}

console.log('\n[서류는 다 왔는데 대조만 남은 상태인가]');
if (c){
  const raw = window.inspect(c, window.TODAY);
  check('★ 항목만 보면 완결 가능이다 (미수취·확인필요 0건)',
        raw.verdict === '완결' && raw.missingCount === 0 && raw.reviewCount === 0,
        raw.verdict + ' · 미수취' + raw.missingCount + ' · 확인필요' + raw.reviewCount);
}

console.log('\n[donorBizNo 가 DB 행에서 실려 오는가]');
const row = {case_no:'999', state:'검수 대기', donor_type:'법인', donor_name:'테스트(주)',
             donor_biz_no:'124-81-55678', item_name:'테스트', qty:1, qty_as_received:1,
             qty_unit:'개', pack_size:1, unit_price:0, book_value:0, fair_value:1000,
             in_date:'2026-07-01', deadline:'2026-07-30'};
const mapped = window.rowToCase(row);
check('★ rowToCase 가 donorBizNo 를 옮긴다 (COL 선언만 있고 안 쓰던 자리)',
      mapped.donorBizNo === '124-81-55678', mapped.donorBizNo);
check('그래서 영리 판정이 돈다', window.isProfitCorp(mapped) === true, window.isProfitCorp(mapped));

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과');
process.exit(fail ? 1 : 0);
