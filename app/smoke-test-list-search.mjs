/* 후원건 목록 검색 (2026-09-08 선미 요청 · 연수)

   ★ 왜 붙였나
     목록에 검색이 아예 없었다. 42건이라 아직 견뎠지만 늘면 못 쓴다.
     선미 지적의 출발점은 **"마스킹 때문에 후원자명 검색이 안 되지 않느냐"** 였는데,
     확인해 보니 마스킹이 문제가 아니라 검색 자체가 없던 것이었다.

   ★ 이 검사가 지키는 것 — 특히 ③이 본체다
     ① 화면에 보이는 칸으로 찾는다 — 건번호 · 물품 · 후원자 · 배분처
     ② 낱말을 모두 포함해야 한다 ('늘봄 티켓' 로 좁힌다) · '#' 과 대소문자는 무시한다
     ③ **검색은 구간을 가로지른다.** 구간 안에서만 찾으면, 다른 구간에 있는 건을 쳤을 때
        "없습니다" 가 뜬다 — 담당자는 건이 없는 줄 안다. 9/8 아침에 잡은
        '숫자가 안 맞는다' 와 같은 갈래의 거짓말이다.
     ④ 흐름 바 숫자가 검색 결과의 분포로 바뀐다 (어느 구간에 몇 건인지가 답이 된다)
     ⑤ 빈 결과가 거짓말하지 않는다 — 다른 구간에 있으면 그렇다고 말한다
     ⑥ 실명으로는 못 찾는다 — 막은 게 아니라 **DB 에 없다.** 가린 이름으로는 찾힌다
     ⑦ **칠 때마다 찾지 않는다 — 엔터나 [찾기] 를 눌러야 찾는다** (선미 요청 9/8)
        ⚠️ 앞 판은 oninput 마다 render() 를 불렀다. render() 가 content 를 통째로
        갈아끼우므로 입력 칸 자체가 바뀌고, **한글 조합이 그 도중에 끊겨 글자가 깨졌다.**
        조합 상태는 포커스처럼 되돌릴 수 있는 값이 아니다 — 그래서 아예 안 그리게 바꿨다.
     ⑧ 조합 중의 엔터(IME 확정용)는 검색으로 받지 않는다 — 받으면 글자가 잘린다

   데모 데이터로 돈다 — 서버·DB 불필요.
   돌리는 법:  JSDOM_FROM=/tmp/fast node smoke-test-list-search.mjs
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

/* 검색이 무엇을 집는지만 보면 되므로 건을 직접 세운다 — 구간이 서로 다른 넷 */
const mk = (id, item, donor, org, state) => ({
  c:{id:id, item:item, donor:donor, state:state,
     dists: org ? [{orgName:org, qty:1}] : [], orgName:org || null, orgId: org ? 1 : null},
  r:{}, k:''
});
const LIST = [
  mk('225', '롯데월드 어드밴처 티켓 28매', '김○수', '늘봄지역아동센터', '완결'),
  mk('226', '라면 20개입 150박스', '최○희', '우리지역아동센터', '검수 대기'),
  mk('101', '즉석밥 3종 400박스', '주식회사 온누리식품', '늘봄지역아동센터', '검수 대기'),
  mk('102', '쌀 20kg 10포', '(신청서에서 확인)', null, '접수 검토')
];
const hit = (q) => LIST.filter(x => window.caseMatches(x, window.normQuery(q))).map(x => x.c.id);

console.log('\n[① 화면에 보이는 칸으로 찾는다]');
check('★ 건번호', hit('225').join() === '225', hit('225'));
check('★ 물품',   hit('롯데월드').join() === '225', hit('롯데월드'));
check('★ 후원자(법인 상호)', hit('온누리').join() === '101', hit('온누리'));
check('★ 배분처', hit('늘봄').join() === '225,101', hit('늘봄'));
check('   배분처가 없는 건은 안 걸린다', !hit('늘봄').includes('102'), hit('늘봄'));

console.log('\n[② 낱말은 모두 포함 · # 과 대소문자는 무시]');
check('★ 두 낱말로 좁힌다', hit('늘봄 티켓').join() === '225', hit('늘봄 티켓'));
check('   한쪽만 맞으면 안 걸린다', hit('늘봄 라면').length === 0, hit('늘봄 라면'));
check('★ #225 도 225 로 읽는다', hit('#225').join() === '225', hit('#225'));
check('   앞뒤 공백을 턴다', hit('  라면  ').join() === '226', hit('  라면  '));
check('   빈 검색어는 전부 통과시킨다', hit('').length === LIST.length, hit(''));

console.log('\n[③ 실명으로는 못 찾는다 — 막은 게 아니라 DB 에 없다]');
check('★ 실명은 안 걸린다 (김나눔 같은 값이 저장돼 있지 않다)', hit('김나눔').length === 0, hit('김나눔'));
check('★ 가린 이름의 성으로는 찾힌다', hit('김').join() === '225', hit('김'));
check('   가린 이름 전체로도 찾힌다', hit('김○수').join() === '225', hit('김○수'));

console.log('\n[④ 검색이 구간을 가로지른다 — 이 검사의 본체]');
/* 실제 화면으로 확인한다. #225 는 완결, #226 은 후원접수중 구간에 있다.
   '배분 검수' 구간을 보는 중에 완결 건을 쳐도 흐름 바가 어디 있는지 말해야 한다. */
window.DB.cases = [];
window.TODAY = '2026-09-08';
const mkCase = (id, item, donor, state, org) => ({
  id, dbId:Number(id), state, donor, donorType:'법인외', acqPath:'구매', item,
  inDate:'2026-09-07', donation:{itemName:item, qty:1, unitPrice:1000, book:1000, fair:1000,
    arriveDate:'2026-09-07', donationDate:'2026-09-07'},
  orgId: org ? 1 : null, orgName: org || null,
  dists: org ? [{id:1, orgName:org, qty:1}] : [],
  checklist:[{key:'proof_buy', n:'구매영수증', kind:'A', stage:'접수', included:true, r:{st:'done'}}]
});
window.DB.cases.push(mkCase('225', '롯데월드 티켓', '김○수', '완결', '늘봄지역아동센터'));
window.DB.cases.push(mkCase('226', '라면 150박스', '최○희', '검수 대기', null));
window.DB.role = 'staff'; window.DB.screen = 'list';

window.DB.listFilter = 'dist';        /* 배분 검수 구간을 보는 중 */
window.DB.listQuery = '롯데월드';      /* 그런데 완결 구간의 건을 친다 */
let html = window.viewList();
const fbCounts = (h) => (h.match(/class="fb-c">(\d+)</g) || []).map(m => Number(m.match(/(\d+)</)[1]));
check('★ 흐름 바가 어느 구간에 있는지 말한다 (접수 0 · 배분 0 · 완결 1)',
  fbCounts(html).join(',') === '0,0,1', fbCounts(html));
check('★ 합계도 검색 결과로 바뀐다', /class="tn">1</.test(html), (html.match(/class="tn">\d+</) || [])[0]);
check('★ 빈 표가 "없습니다" 라고만 하지 않는다 — 어디 있는지 말한다',
  /다른 구간에 1건 있습니다/.test(html), '(그냥 없다고 했다)');

window.DB.listFilter = 'done';
html = window.viewList();
check('   그 구간으로 가면 실제로 있다', (html.match(/class="tb-item">#/g) || []).length === 1,
  (html.match(/class="tb-item">#/g) || []).length);

window.DB.listQuery = '없는물품이름';
html = window.viewList();
check('★ 정말 없으면 없다고 말한다', /로 찾은 건이 없습니다/.test(html), '(다른 말을 했다)');

console.log('\n[⑤ 검색 칸 · 엔터로 찾는다]');
window.DB.listQuery = '';
html = window.viewList();
check('★ 검색 칸이 있다', /id="listSearch"/.test(html), '(없다)');
check('   찾을 수 있는 것을 안내한다',
  /placeholder="건번호 · 물품 · 후원자 · 배분처"/.test(html), '(안내가 없다)');
check('   비어 있으면 지우기 버튼이 없다', !/clearListQuery/.test(html), '(빈 칸에 X 가 있다)');
check('★ [찾기] 버튼이 있다', /onclick="runListSearch\(\)"/.test(html), '(없다)');
window.DB.listQuery = '늘봄';
check('   내용이 있으면 지우기 버튼이 뜬다', /clearListQuery/.test(window.viewList()), '(X 가 없다)');

const src = readFileSync(APP + 'screen-staff.js', 'utf8');
console.log('\n[⑥ 칠 때마다 찾지 않는다 — 한글이 깨지던 자리]');
/* ★ oninput 이 남아 있으면 타이핑 도중 render() 가 돌고, 그 순간 입력 칸이 갈려
     한글 조합이 끊긴다. 이 한 줄이 이 고침의 전부다. */
check('★ 입력 칸에 oninput 이 없다 (있으면 한글이 다시 깨진다)',
  !/id="listSearch"[^>]*oninput=/.test(src), '(oninput 이 남아 있다)');
check('★ 엔터로 찾는다', /onkeydown="listSearchKey\(event\)"/.test(src), false);
check('★ 조합 중의 엔터는 무시한다 (IME 확정용이라 받으면 글자가 잘린다)',
  /isComposing/.test(src) && /keyCode\s*===\s*229/.test(src), false);
check('   찾을 때는 칸의 값을 읽어서 쓴다 (DB 를 타이핑마다 안 건드린다)',
  /function runListSearch[\s\S]{0,200}?DB\.listQuery\s*=\s*b\s*\?\s*b\.value/.test(src), false);
check('   찾은 뒤 포커스를 되돌린다 (이어서 고쳐 칠 수 있게)',
  /function runListSearch[\s\S]{0,400}?\.focus\(\)/.test(src), false);

console.log('\n[⑦ 합계가 흐름 바에 붙어 있다 — 세 구간을 더한 값이라는 게 보이게]');
window.DB.listQuery = '';
const h2 = window.viewList();
const flowChunk = (h2.match(/class="flowbar mb16"[\s\S]*?<\/div>\s*<div class="row mb16"/) || [''])[0];
check('★ 전체 칩이 흐름 바 안에 있다', /fb-sum/.test(flowChunk) && /class="tn"/.test(flowChunk),
  '(아직 아래 툴바에 있다)');
check('   툴바에는 더 이상 없다 (두 곳에 두지 않는다)',
  (h2.match(/class="tn"/g) || []).length === 1, (h2.match(/class="tn"/g) || []).length);

console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과 — 검색이 구간을 가로지르고, 빈 결과가 거짓말하지 않는다');
process.exit(fail ? 1 : 0);
