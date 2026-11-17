/* 관리자 페이지 — 계정·권한 / 기본 통계 / 검수 기준자료 (2026-09-10 선미 요청)

   ★ 왜 이 검사가 필요한가
     심사에서 "권한 관리"는 기본 항목이라고 했다. 그런데 권한은 **있다고 말하기 쉽고
     지켜지는지 확인하기는 어렵다.** 9/10 이전 상태가 정확히 그랬다:
       · 화면에는 admin 역할과 관리자 메뉴가 있었다
       · RLS 정책은 전부 `to authenticated using (true)` — 로그인만 하면 다 됐다
       · 실서비스에선 역할 전환 바가 꺼져 DB.role 이 늘 'staff' 라, 관리자 화면에
         **갈 길 자체가 없었다** (있는데 못 가는 상태)
     그래서 이 검사는 화면과 DB 를 **둘 다** 본다. 한쪽만 보면 "감춘 것"을
     "지켜진 것"으로 읽게 된다.

   ★ 다섯을 본다
     ① 권한 게이트 — 관리자가 아니면 본문이 잠긴다 (메뉴만 감추는 게 아니다)
     ② 입구 — 실서비스에서 관리자에게만 입구가 보인다
     ③ 통계 — 세는 함수가 순수 함수고, 숫자가 맞는가
     ④ 계정 화면 — 마지막 관리자를 내리지 못하게 막는가
     ⑤ DB 패치 — 화면이 막는 것을 DB 도 막는가 (정책·트리거가 실제로 있는가)

   돌리는 법:  node smoke-test-admin.mjs
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

/* 실서비스 흉내 — DB_SOURCE 를 'Supabase' 로 두면 isDemoMode() 가 false 가 된다 */
const asLive = (role) => {
  window.DB_SOURCE = 'Supabase';
  window.AUTH.session = {staffOk:true, staffName:'검사', staffRole:role, user_id:'u-1'};
};
const asDemo = () => { window.DB_SOURCE = undefined; window.AUTH.session = null; };

console.log('\n════════ ① 권한 게이트 — 본문이 잠기는가 ════════');
asLive('staff');
window.DB.role = 'admin'; window.DB.screen = 'adminAccounts';
let h = window.renderAdmin();
check('★★ 담당자가 관리자 화면을 열면 잠긴다', /관리자만 볼 수 있습니다/.test(h), h.slice(0, 120));
check('   계정 목록이 안 그려진다 (메뉴만 감춘 게 아니다)', !/계정 · 권한<\/h2>/.test(h), true);
window.DB.screen = 'adminStats';
check('★★ 통계도 같은 게이트를 탄다', /관리자만 볼 수 있습니다/.test(window.renderAdmin()), false);
window.DB.screen = 'adminCriteria';
check('★★ 기준자료도 같은 게이트를 탄다', /관리자만 볼 수 있습니다/.test(window.renderAdmin()), false);
check('   isAdminUser() 가 false 다', window.isAdminUser() === false, window.isAdminUser());

asLive('admin');
window.DB.screen = 'adminAccounts';
check('★ 관리자는 열린다', !/관리자만 볼 수 있습니다/.test(window.renderAdmin()), false);
check('   isAdminUser() 가 true 다', window.isAdminUser() === true, window.isAdminUser());

asDemo();
check('★ 데모에서는 통과시킨다 (지킬 데이터가 없고 예선 데모가 쓴다)',
      window.isAdminUser() === true, window.isAdminUser());

console.log('\n════════ ② 입구 — 관리자에게만 보이는가 ════════');
asLive('staff');
window.DB.role = 'staff'; window.DB.screen = 'home';
window.renderSidebar();
let side = window.el('sideStaff').innerHTML;
check('★★ 담당자 사이드바에 관리자 입구가 없다', side.indexOf('enterAdmin') < 0, side.indexOf('enterAdmin'));
asLive('admin');
window.renderSidebar();
side = window.el('sideStaff').innerHTML;
check('★★ 관리자 사이드바에는 입구가 있다', side.indexOf('enterAdmin') >= 0, false);
window.el('sideAdmin') && check('★ 관리자 화면에는 나가는 길이 있다',
  window.el('sideAdmin').innerHTML.indexOf('exitAdmin') >= 0, false);
/* enterAdmin 은 권한을 보고, setRole(데모 전환)은 안 본다 — 둘을 섞지 않았는지 */
asLive('staff');
window.DB.role = 'staff';
window.enterAdmin();
check('★★ 담당자가 enterAdmin() 을 직접 불러도 안 들어간다',
      window.DB.role === 'staff', window.DB.role);
asLive('admin');
window.enterAdmin();
check('★ 관리자는 들어간다', window.DB.role === 'admin', window.DB.role);
window.exitAdmin();
check('   나올 수 있다', window.DB.role === 'staff' && window.DB.screen === 'home', [window.DB.role, window.DB.screen]);

console.log('\n════════ ③ 통계 — 세는 함수가 맞는가 ════════');
const D = window.COL.donation, CI = window.COL.checklistItem, I = window.COL.inspection, F = window.COL.inspectionFinding;
const don = (state, inD, comp, t, p) => { const r={}; r[D.state]=state; r[D.inDate]=inD; r[D.completedAt]=comp; r[D.donorType]=t; r[D.acquisitionPath]=p; return r; };
const item = (name, st) => { const r={}; r[CI.docName]=name; r[CI.status]=st; return r; };
const run  = (st) => { const r={}; r[I.status]=st; r[I.startedAt]='2026-09-10T01:00:00Z'; return r; };
const fnd  = (v) => { const r={}; r[F.verdict]=v; return r; };
const st = window.adminStatsFrom({
  donations:[don('완결','2026-09-01','2026-09-05','법인','구매'),
             don('완결','2026-09-01','2026-09-09','법인외','구매'),
             don('완결','2026-09-01','2026-09-02','법인','제조·유통'),
             don('검수 대기','2026-09-08',null,'법인','구매')],
  items:[item('구매영수증 또는 매입세금계산서','확인필요'), item('구매영수증 또는 매입세금계산서','확인필요'),
         item('물품사진','확인필요'), item('물품사진','수취완료')],
  runs:[run('success'), run('success'), run('quota')],
  findings:[fnd('이상 없음'), fnd('확인 권장'), fnd('확인 권장'), fnd('판단 보류')]
});
check('전체 건수', st.total === 4, st.total);
check('완결 건수', st.completed === 3, st.completed);
check('★★ 완결까지 중앙값 (1·4·8일 → 4일)', st.medianDays === 4, {days:st.medianDays});
check('   가장 오래 걸린 건', st.maxDays === 8, st.maxDays);
check('구간별 분포', st.byState['완결'] === 3 && st.byState['검수 대기'] === 1, st.byState);
check('후원자 유형 분포', st.byDonor['법인'] === 3 && st.byDonor['법인외'] === 1, st.byDonor);
check('AI 실행 횟수', st.runs === 3, st.runs);
check('★ 실패한 실행을 따로 센다 (quota 는 성공이 아니다)', st.runsFailed === 1, st.runsFailed);
check('판정 분포', st.byVerdict['확인 권장'] === 2, st.byVerdict);
check('★★ 확인필요가 잦은 서류 1위', st.uncTop[0].name === '구매영수증 또는 매입세금계산서' && st.uncTop[0].n === 2, st.uncTop);
check('   수취완료는 안 센다', st.uncTop.filter(u => u.name === '물품사진')[0].n === 1, st.uncTop);
const empty = window.adminStatsFrom({donations:[], items:[], runs:[], findings:[]});
check('★ 아무것도 없어도 안 깨진다', empty.total === 0 && empty.medianDays === null, empty);

console.log('\n════════ ④ 계정 화면 — 마지막 관리자를 지키는가 ════════');
asDemo();
window.ADMIN_DATA.staff = {demo:false, rows:[
  {id:'a', name:'관리자하나', email:'a@example.org', role:'admin', status:'active', lastLoginAt:'2026-09-10'},
  {id:'b', name:'담당자',     email:'b@example.org', role:'staff', status:'active', lastLoginAt:'2026-09-09'}
]};
h = window.viewAdminAccounts();
check('★★ 활성 관리자가 1명이면 그 사람 버튼이 잠긴다', /마지막 관리자입니다/.test(h), false);
check('   담당자를 관리자로 올리는 버튼은 열려 있다', /setStaffField\('b','role','admin'\)/.test(h), false);
window.ADMIN_DATA.staff.rows.push({id:'c', name:'관리자둘', email:'c@example.org', role:'admin', status:'active', lastLoginAt:'2026-09-08'});
h = window.viewAdminAccounts();
check('★ 관리자가 둘이면 잠금이 풀린다', !/마지막 관리자입니다/.test(h), true);
window.ADMIN_DATA.staff = {demo:true, rows:window.DEMO_STAFF};
h = window.viewAdminAccounts();
check('★ 데모 계정이면 바꿀 수 없다고 말한다', /데모에서는 바꿀 수 없습니다/.test(h), false);
check('   [계정 추가] 버튼은 없다 (Auth 사용자 생성이 앱에서 안 된다)',
      !/계정 추가/.test(h), true);

console.log('\n════════ ⑤ DB 패치 — 화면이 막는 것을 DB 도 막는가 ════════');
const sql = readFileSync(APP + 'patch-20260910-admin-rls.sql', 'utf8');
check('★★ is_admin() 이 있다', /create or replace function public\.is_admin\(\)/.test(sql), false);
check('★★ security definer 다 (staff 정책이 staff 를 조회해 재귀하지 않게)',
      /is_admin[\s\S]{0,400}?security definer/.test(sql), false);
check('★★ search_path 를 고정했다 (definer 함수의 기본 방어)',
      /is_admin[\s\S]{0,400}?set search_path = public/.test(sql), false);
check('★★ staff update 정책이 is_admin() 을 본다',
      /create policy[\s\S]{0,200}on staff[\s\S]{0,200}using \(public\.is_admin\(\)\)/.test(sql), false);
check('   with check 도 걸었다 (통과시킨 뒤 딴 값으로 바꾸지 못하게)',
      /with check \(public\.is_admin\(\)\)/.test(sql), false);
check('★★ 마지막 관리자 보호 트리거가 있다', /trg_guard_last_admin/.test(sql) && /raise exception/.test(sql), false);
check('★ insert/delete 정책은 일부러 안 만들었다고 적혀 있다',
      /insert\/delete 정책은 만들지 않는다/.test(sql), false);
check('★ 아직 못 막는 것(status disabled)을 적어 뒀다',
      /status='disabled' 는 화면\(authLookupStaff\)만 막는다/.test(sql), false);
/* 화면과 DB 가 같은 것을 막는지 — 한쪽만 고치면 갈린다 */
const cm = readFileSync(APP + 'common.js', 'utf8');
check('★★ 화면 게이트가 staff.role 을 본다 (DB.role 이 아니라)',
      /function isAdminUser\(\)[\s\S]{0,200}authStaffRole\(\) === 'admin'/.test(cm), false);
check('   DB.role 로 관리자를 판정하지 않는다',
      !/function isAdminUser\(\)[\s\S]{0,200}DB\.role === 'admin'/.test(cm), true);

console.log('\n════════ ⑤-2 통계 화면 — 도넛과 숫자가 맞는가 ════════');
/* ★ 2026-09-10 — 가로 막대를 도넛으로 바꿨다. 실 데이터가 들어오자 막대가 화면을 가로질러
     오른쪽 건수·비율이 **잘렸다**(연수 캡처). 넷 다 부분-전체라 도넛이 맞는 형태다. */
window.ADMIN_DATA.stats = window.adminStatsFrom({
  donations:[don('완결','2026-09-01','2026-09-05','법인','구매'),
             don('완결','2026-09-01',null,'법인','구매'),
             don('검수 대기','2026-09-08',null,'법인외','제조·유통')],
  items:[item('물품사진','확인필요')], runs:[run('success')], findings:[fnd('이상 없음'), fnd('확인 권장')]
});
let sh = window.viewAdminStats();
check('★★ 도넛을 그린다 (막대가 아니다)', /<svg class="dn-svg"/.test(sh), false);
check('★★ 옆에 건수와 비율이 같이 온다', /class="dn-n">1건/.test(sh) && /class="dn-p">/.test(sh), false);
check('★ 조각마다 이름·건수·비율 툴팁이 있다', /<title>완결 · 2건 · 67%<\/title>/.test(sh), false);
check('★ 범례가 있다 (색만으로 구분하게 두지 않는다)', /class="dn-legend"/.test(sh), false);
check('   가운데에 합계가 선다', /class="dn-tot">3<\/text>/.test(sh), false);
/* ★★ 같은 화면에서 숫자가 어긋나던 것 — 타일은 5, 막대는 14 였다(연수 발견 9/10).
     타일이 '완결 시각이 있는 건' 만 세고 있었다. completed_at 은 9/8 부터 채운다. */
check('★★ 완결 타일이 상태로 센다 (완결 시각이 없어도 완결이다)',
      /완결<\/div><div style="font-size:[0-9.]+px[^>]*>2</.test(sh.replace(/\s+/g, ' ')), sh.indexOf('완결'));
check('★★ 중앙값이 몇 건 기준인지 밝힌다 (타일 둘이 달라 보이는 이유를 말한다)',
      /1건 기준/.test(sh), false);
check('★ 순위(확인필요 잦은 서류)는 도넛이 아니라 표다 — 부분-전체가 아니다',
      sh.indexOf('확인필요가 잦은 서류') >= 0 && /<table class="tbl">[\s\S]*물품사진/.test(sh), false);
check('★ 아무것도 없는 분포는 안 그리고 말로 한다',
      /아직 없습니다/.test(window.donutCard('빈 것', {})), false);
/* 색은 눈으로 고르지 않았다 — 검증기를 돌린 값이다 */
/* ★ 초록우산 BI 색만 쓴다(연수 결정 9/10). BI 원색은 **순서가 곧 통과 여부**다 —
     120가지 중 검증기를 통과하는 순서는 둘뿐이었다. 그래서 순서까지 못 박는다. */
check('★★ 초록우산 BI 색 5개만 쓴다',
      JSON.stringify(window.STAT_COLORS) === JSON.stringify(['#009465','#B6AC40','#00ACA7','#E5006A','#69BD83']),
      window.STAT_COLORS);
check('★★ 첫 칸이 주색(340C)이다', window.STAT_COLORS[0] === '#009465', window.STAT_COLORS[0]);
/* 검증기에서 떨어졌던 이웃 세 쌍 — 다시 붙으면 여기서 잡는다 */
[['#009465','#E5006A','적록색약 ΔE 2.3'], ['#69BD83','#B6AC40','정상시야 ΔE 10.2'],
 ['#00ACA7','#009465','정상시야 ΔE 10.4']].forEach(function(t){
  var i = window.STAT_COLORS.indexOf(t[0]), j = window.STAT_COLORS.indexOf(t[1]);
  check('   ' + t[0] + ' 와 ' + t[1] + ' 가 이웃이 아니다 (' + t[2] + ')',
        Math.abs(i - j) !== 1, [i, j]);
});
check('   BI 밖 색이 섞이지 않았다',
      window.STAT_COLORS.every(function(c){
        return ['#009465','#B6AC40','#00ACA7','#E5006A','#69BD83'].indexOf(c) >= 0; }),
      window.STAT_COLORS);
/* ★ 색보다 범주가 많으면 색을 지어내지 않는다 — '기타' 로 접는다 */
var many = {}; '가나다라마바사'.split('').forEach(function(c, i){ many[c] = 10 - i; });
var hMany = window.donutCard('많은 범주', many);
check('★★ 범주가 색보다 많으면 기타로 접는다 (색을 지어내지 않는다)',
      /기타 3종/.test(hMany), false);
check('   접어도 합계는 그대로다', /class="dn-tot">49</.test(hMany), false);

console.log('\n[검수 기준자료 — 화면에서 [A] 를 뺀다 (연수 9/10)]');
check('★ 메뉴 이름에 [A] 가 없다',
      window.ADMIN_MENU.filter(function(m){ return m.id === 'adminCriteria'; })[0].label === '검수 기준자료',
      window.ADMIN_MENU.filter(function(m){ return m.id === 'adminCriteria'; })[0].label);
check('★ 화면 제목에도 없다', window.SCREEN_TITLE.adminCriteria.indexOf('[A]') < 0,
      window.SCREEN_TITLE.adminCriteria);
window.DB.screen = 'adminCriteria';
check('★ 본문 머리글에도 없다', window.viewAdminCriteria().indexOf('[A] 관리') < 0, false);

console.log('\n════════ ⑥ 계정 패치 — 관리자 0명 상태를 푸는가 ════════');
const acc = readFileSync(APP + 'patch-20260910-admin-accounts.sql', 'utf8');
const TEAM = ['admin1@example.org','admin2@example.org','admin3@example.org','admin4@example.org'];
TEAM.forEach(function(e){
  check('관리자로 올린다 — ' + e.split('@')[0], acc.indexOf(e) >= 0, e);
});
check('★★ 심사위원도 관리자다 (심사 항목이라 화면을 봐야 한다 · 연수 결정)',
      /'admin@example\.org'.*심사위원/.test(acc), false);
check('★★ 테스터는 담당자로 둔다 (동료 10명이 같이 쓰는 계정이다)',
      acc.indexOf("'tester@example.org',") < 0 && /테스터.*담당자로 둔다/.test(acc), false);
check('★★ 시드 더미를 지우기 전에 참조를 끊는다 (그냥 delete 하면 외래키가 막는다)',
      /update donation\s+set created_by\s+= null/.test(acc) && /delete from staff where id = dummy_id/.test(acc), false);
check('   6개 참조 칸을 모두 끊는다', ['donation','distribution','access_link','checklist_item','inspection']
        .every(function(t){ return acc.indexOf(t) >= 0; }), false);
check('★ audit_log 는 손대지 않는다 (감사 기록을 고쳐 쓰지 않는다)',
      /audit_log 가 남아 있다/.test(acc) && !/update audit_log/.test(acc), false);
check('★ 이메일로 못 박아 실제 계정을 건드리지 않는다',
      /where email = 'test-staff@example\.com'/.test(acc), false);
check('★★ 드라이런이 먼저 있다 (무엇이 걸려 있는지 세고 시작한다)',
      acc.indexOf('[A] 드라이런') < acc.indexOf('[B] 실행'), false);
check('★ 트랜잭션으로 묶었다 (반만 되는 상태를 안 만든다)',
      /begin;[\s\S]*commit;/.test(acc), false);
check('★★ 심사 뒤 회수 방법이 적혀 있다 (권한을 준 채로 잊지 않게)',
      /\[C\][\s\S]*심사위원 관리자 권한 회수/.test(acc) && /2026-10-02/.test(acc), false);
check('   회수는 주석 처리해 뒀다 (지금 실행되면 안 된다)',
      /^-- update staff set role = 'staff' where email = 'admin@example\.org'/m.test(acc), false);
/* 두 패치의 순서 — 관리자 0명 상태로 정책을 걸면 아무도 계정을 못 고친다 */
check('★★ RLS 패치보다 먼저 돌리라고 적혀 있다',
      /patch-20260910-admin-rls\.sql 을 돌리기 \*\*전에\*\*/.test(acc), false);

/* ─────────────────────────────────────────────────────────────────────────
   검수 기준자료 화면 ↔ 정본 (2026-09-14 선미)

   ★ 경위 — 이 화면에는 ①공통 기준층 · ②기관 덧쓰기층 두 표가 있었고, 둘 다 db.js 에
     **손으로 적은 사본**이었다. 정본(common.js 의 DOC_MATRIX · DIST_DOCS)이 바뀌어도
     안 따라와 서류 5종이 빠져 있었다 — 법인인감 날인(9/10 신설) · 구매영수증 ·
     원가명세서 · 시가 확인 증빙 · 배분 물품 사진(v6). 관리자 화면은 **심사위원도 여는 자리**라,
     거기서 제품이 자기 규칙을 틀리게 말하고 있었다.

   ★ 고친 방향은 사본을 고치는 것이 아니라 **사본을 없애는 것**이다 — 화면이 정본에서 그린다.
     그래서 이 검사는 "표에 다 적혀 있나" 가 아니라 **"화면에 다 그려지나"** 를 본다.
     정본에 서류나 규칙을 더하면 화면에 저절로 나타나야 하고, 안 나타나면 빨개진다.
   ───────────────────────────────────────────────────────────────────────── */
console.log('\n[검수 기준자료 화면 ↔ 정본 — 정본에 더한 것이 화면에 나타나는가]');
{
  const html = window.viewAdminCriteria();

  /* ① 받아야 할 서류 — DOC_MATRIX · DIST_DOCS 전부 */
  const docs = [];
  Object.keys(window.DOC_MATRIX).forEach(function(path){
    Object.keys(window.DOC_MATRIX[path]).forEach(function(type){
      window.DOC_MATRIX[path][type].forEach(function(d){ if (docs.indexOf(d.name) < 0) docs.push(d.name); });
    });
  });
  window.DIST_DOCS.forEach(function(d){ if (docs.indexOf(d.name) < 0) docs.push(d.name); });
  const missingDocs = docs.filter(function(n){ return html.indexOf(n) < 0; });
  check('★★ 정본의 서류가 화면에 하나도 빠지지 않고 그려진다', missingDocs.length === 0, missingDocs);
  check('   법인인감(직인) 날인 이미지 (9/10 신설 · 사본에 빠져 있던 것)',
        html.indexOf('법인인감(직인) 날인 이미지') >= 0, false);
  check('   배분 물품 사진 (v6 신설 · 사본에 빠져 있던 것)', html.indexOf('배분 물품 사진') >= 0, false);

  /* ② 검수 기준 — FINDING_LABEL 전부 · 설명이 규칙과 같은 키 */
  const codes = Object.keys(window.FINDING_LABEL);
  const missingRules = codes.filter(function(c){ return html.indexOf(window.FINDING_LABEL[c]) < 0; });
  check('★★ 판정 규칙이 화면에 하나도 빠지지 않고 그려진다', missingRules.length === 0, missingRules);
  check('★★ 규칙 설명(FINDING_DESC)이 규칙 이름과 같은 키를 덮는다 — 규칙을 더하고 설명을 잊으면 걸린다',
        codes.every(function(c){ return window.FINDING_DESC[c] && window.FINDING_DESC[c].by && window.FINDING_DESC[c].what; }),
        codes.filter(function(c){ return !window.FINDING_DESC[c]; }));
  check('   화면이 검수 기준을 실제로 싣는다 (이름이 검수 기준자료인데 기준이 없던 자리)',
        /검수 기준 — 판정 \d+가지/.test(html), false);

  /* ③ 없앤 것이 정말 없는가 — 교체 데모의 흔적 */
  check('★ 기관 프로필 교체 데모가 남아 있지 않다 (오픈소스로 내주면 기관이 다시 만든다 · 선미 9/14)',
        !window.ORG_PROFILES.generic && html.indexOf('예시 기관') < 0 && typeof window.setProfile === 'undefined',
        Object.keys(window.ORG_PROFILES));
  check('★ 심사위원이 여는 화면에 “구버전 · 개정 검토 필요” 데모 행이 없다',
        html.indexOf('구버전') < 0 && !window.CRITERIA.corp_v2_stale, Object.keys(window.CRITERIA));
  check('   손으로 적던 사본 표를 없앴다 (서류를 더할 곳은 common.js 한 곳)',
        !window.DB.criteria.common && !window.DB.criteria.orgLayer, Object.keys(window.DB.criteria));
  check('   프로필 구조 자체는 남겨 둬 체크리스트 생성 경로가 그대로다',
        typeof window.getProfile === 'function' && window.getProfile('없는키').matrix === window.DOC_MATRIX, false);
}

console.log('\n' + '─'.repeat(60));
console.log(fail ? `❌ ${fail}개가 어긋납니다` : '✅ 관리자 권한이 화면과 DB 양쪽에 걸려 있습니다');
process.exit(fail ? 1 : 0);
