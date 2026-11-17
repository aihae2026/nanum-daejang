/* ════════════════════════════════════════════════════════════
   screen-staff.js — 담당자 화면(홈·접수·목록·건상세·검수·수취) + 관리자(기준자료)
   담당: 선미·연수 (승희 9/7 복귀 후 합류)
   ════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════
   관리자(admin) — 계정·권한 / 기본 통계 / 검수 기준자료
   ★ 권한은 로그인한 계정의 staff.role 이 정한다(common.js isAdminUser).
     DB 쪽은 patch-20260910-admin-rls.sql 이 막는다 — 화면만 막으면 절반이다.
   ══════════════════════════════════════════════════════════════ */
function renderAdmin(){
  /* ⚠️ 게이트를 화면 하나가 아니라 **관리자 본문 전체** 앞에 둔다.
       메뉴만 감추면 go('adminAccounts') 한 줄로 열린다. */
  if (!isAdminUser())
    return '<div class="lock-box"><div class="lk">🔒</div>' +
      '<div class="page-t">관리자만 볼 수 있습니다</div>' +
      '<div class="page-d">이 화면은 계정의 권한이 <b>관리자</b>일 때 열립니다. ' +
      '권한이 필요하면 관리자에게 요청해 주세요.</div></div>';
  if (DB.screen === 'adminAccounts') return viewAdminAccounts();
  if (DB.screen === 'adminStats')    return viewAdminStats();
  return viewAdminCriteria();
}

/* ── 계정 · 권한 ─────────────────────────────────────────────── */
var ADMIN_DATA = {staff:null, stats:null, loading:false, err:''};

function adminLoad(what){
  if (ADMIN_DATA.loading) return;
  ADMIN_DATA.loading = true; ADMIN_DATA.err = '';
  var job = (what === 'staff') ? loadStaffList() : loadAdminStats();
  job.then(function(r){
    if (what === 'staff') ADMIN_DATA.staff = r; else ADMIN_DATA.stats = r;
  }).catch(function(e){
    ADMIN_DATA.err = (e && e.message) || String(e);
    console.error('[관리자] 불러오지 못했습니다:', e);
  }).then(function(){ ADMIN_DATA.loading = false; render(); });
}

function setStaffField(id, field, value){
  if (!isAdminUser()) return;
  saveStaffField(id, field, value).then(function(){
    DB.toast = {msg:'바꿨습니다'};
    ADMIN_DATA.staff = null; adminLoad('staff');
  }).catch(function(e){
    /* ⚠️ 실패를 조용히 넘기지 않는다 — 화면만 바뀌고 DB 는 그대로인 상태가 제일 나쁘다 */
    DB.toast = {msg:'바꾸지 못했습니다 — ' + ((e && e.message) || e), cap:true};
    render();
  });
}

function viewAdminAccounts(){
  var d = ADMIN_DATA.staff;
  if (!d && !ADMIN_DATA.loading){ adminLoad('staff'); }
  var head = '<div class="page-head"><h2>계정 · 권한</h2>' +
    '<p>역할이 화면과 데이터 접근을 함께 정합니다</p></div>';
  if (ADMIN_DATA.err)
    return head + '<div class="banner warn"><span class="bi">⚠</span><div>' + esc(ADMIN_DATA.err) + '</div></div>';
  if (!d) return head + '<div class="card"><div class="card-b muted">불러오는 중…</div></div>';

  var rows = d.rows || [];
  var admins = rows.filter(function(r){ return r.role === 'admin' && r.status === 'active'; }).length;
  var me = (typeof AUTH !== 'undefined' && AUTH.session && AUTH.session.user_id) || null;

  var h = head;
  if (d.demo)
    h += '<div class="banner info mb12"><span class="bi">🧪</span><div>데모 계정입니다 — 실 DB 에 연결하면 실제 계정이 보입니다. 데모에서는 바꿀 수 없습니다.</div></div>';
  h += '<div class="card mb12"><div class="card-h"><h3>계정 ' + rows.length + '명</h3>' +
       '<span class="tag">관리자 ' + admins + '명 · 활성 ' + rows.filter(function(r){ return r.status === 'active'; }).length + '명</span></div>' +
       '<div class="card-b" style="padding:0">' +
       '<table class="tbl"><thead><tr><th>이름</th><th>이메일</th><th>역할</th><th>상태</th><th>마지막 로그인</th></tr></thead><tbody>';
  rows.forEach(function(r){
    /* ★ 마지막 관리자를 스스로 내리지 못하게 한다 — 내리면 계정 화면에 아무도 못 들어와
         SQL 로만 되돌릴 수 있다. DB 쪽 트리거가 같은 것을 한 번 더 막는다. */
    var lastAdmin = (r.role === 'admin' && r.status === 'active' && admins <= 1);
    var lock = d.demo || lastAdmin;
    var why  = d.demo ? '데모에서는 바꿀 수 없습니다' : lastAdmin ? '마지막 관리자입니다 — 다른 사람을 관리자로 올린 뒤에 바꿀 수 있습니다' : '';
    h += '<tr><td><b>' + esc(r.name || '—') + '</b>' + (r.id === me ? ' <span class="tag">나</span>' : '') + '</td>' +
      '<td class="mono small">' + esc(r.email || '') + '</td>' +
      '<td>' + adminSeg(r.id, 'role', r.role, [['staff','담당자'],['admin','관리자']], lock, why) + '</td>' +
      '<td>' + adminSeg(r.id, 'status', r.status, [['active','활성'],['disabled','비활성']], lock, why) + '</td>' +
      '<td class="small muted">' + esc(String(r.lastLoginAt || '—').slice(0, 10)) + '</td></tr>';
  });
  h += '</tbody></table></div></div>' +
    '<div class="card"><div class="card-h"><h3>역할이 정하는 것</h3></div><div class="card-b">' +
    '<table class="tbl"><thead><tr><th>역할</th><th>할 수 있는 일</th></tr></thead><tbody>' +
    '<tr><td><b>담당자</b></td><td>신규 접수 · 검수 · 배분 · 완결. 원장 전체를 봅니다(한 부서가 한 원장을 이어받는 구조)</td></tr>' +
    '<tr><td><b>관리자</b></td><td>담당자가 하는 일 전부 + <b>이 화면</b>(계정·권한) · 기본 통계 · 검수 기준자료</td></tr>' +
    '</tbody></table>' +
    '<div class="hint">비활성 계정은 로그인해도 담당자로 인정되지 않습니다 — 건을 만들거나 검수할 수 없습니다.</div>' +
    '</div></div>';
  return h;
}

/* 역할·상태 토글 — 잠긴 이유를 말해 준다(누를 수 없는 버튼만 두지 않는다) */
function adminSeg(id, field, cur, opts, lock, why){
  var h = '<div class="seg" style="min-width:150px">' + opts.map(function(o){
    var on = (cur === o[0]);
    return '<button class="' + (on ? 'on' : '') + '"' +
      (lock || on ? ' disabled' : ' onclick="setStaffField(\'' + id + '\',\'' + field + '\',\'' + o[0] + '\')"') +
      '>' + o[1] + '</button>';
  }).join('') + '</div>';
  if (lock && why) h += '<div class="hint">' + esc(why) + '</div>';
  return h;
}

/* ── 기본 통계 ─────────────────────────────────────────────────
   ★ 도넛 + 옆에 건수·비율 (2026-09-10 연수 요청) — 전에는 가로 막대였는데
     실 데이터가 들어오자 막대가 화면을 가로질러 **오른쪽 숫자가 잘렸다.**
     여기 넷은 전부 '전체 중 얼마'(부분-전체)라 도넛이 맞는 형태다.
     '확인필요가 잦은 서류' 만 순위라 표로 남긴다 — 순위를 도넛으로 그리면 안 된다.
   ★ 색 — **초록우산 BI 색만** 쓴다 (연수 결정 2026-09-10).
     ⚠️ BI 원색은 순서를 잘못 두면 검증기에서 떨어진다. 실측한 위험한 이웃:
       · 340C(#009465) ↔ 213C(#E5006A) — 적록색약 ΔE 2.3. 거의 같은 색으로 보인다
       · 346C(#69BD83) ↔ 7765C(#B6AC40) — 정상 시야에서도 ΔE 10.2 (기준 15)
       · 326C(#00ACA7) ↔ 340C — 정상 시야 ΔE 10.4
     세 쌍을 **이웃에 두지 않는 순서**를 전수로 찾았다. 120가지 중 통과하는 순서는 **둘뿐**이고,
     그중 주색으로 시작하는 이 순서를 쓴다:
       1 #009465 340C(주색) · 2 #B6AC40 7765C · 3 #00ACA7 326C · 4 #E5006A 213C · 5 #69BD83 346C
     검증기(dataviz validate_palette) **ALL CHECKS PASS** —
       밝기대역 · 채도바닥 · 색각이상 분리(최악 ΔE 9.5 deutan) · 정상시야 분리(17.9)
     · 배경 대비는 WARN 이 남는다(7765C 2.28 · 326C 2.74 · 346C 2.22). 범례에 **이름·건수가 글자로**
       있어 색만으로 구분하지 않으므로 해소된다 — 그래서 범례를 빼면 안 된다.
     ⚠️ **순서를 바꾸면 떨어진다.** 눈으로 판단하지 말고 검증기를 다시 돌린다.
     ⚠️ 6번째 색은 없다 — BI 의 나머지(568C·7464C·골드)는 밝기·채도 기준에서 떨어진다.
       범주가 6개를 넘으면 색을 지어내지 않고 **'기타'로 접는다**(아래 donutCard). */
var STAT_COLORS = ['#009465', '#B6AC40', '#00ACA7', '#E5006A', '#69BD83'];

/* 도넛 하나 — 조각마다 2px 틈(마크 규격)·가운데 합계·옆에 범례
   ⚠️ 범례는 2계열 이상이면 늘 있다. 색만으로 구분하게 두지 않는다. */
function donutCard(title, map, note){
  var all = Object.keys(map || {}).sort(function(a, b){ return map[b] - map[a]; });
  var tot = all.reduce(function(a, k){ return a + map[k]; }, 0);
  /* ★ 색이 모자라면 색을 지어내지 않는다 — 큰 것부터 두고 나머지를 '기타' 로 접는다.
       범주를 색 수만큼만 보여 주는 것보다, 나머지가 얼마인지 말해 주는 편이 정직하다. */
  var keys = all, map2 = map;
  if (all.length > STAT_COLORS.length){
    keys = all.slice(0, STAT_COLORS.length - 1);
    map2 = {}; keys.forEach(function(k){ map2[k] = map[k]; });
    var rest = all.slice(STAT_COLORS.length - 1);
    var restN = rest.reduce(function(a, k){ return a + map[k]; }, 0);
    var label = '기타 ' + rest.length + '종';
    keys = keys.concat([label]); map2[label] = restN;
  }
  map = map2;
  var head = '<div class="card mb12"><div class="card-h"><h3>' + esc(title) + '</h3></div><div class="card-b">';
  var foot = (note ? '<div class="hint">' + esc(note) + '</div>' : '') + '</div></div>';
  if (!tot) return head + '<div class="muted small">아직 없습니다</div>' + foot;

  var R = 48, SW = 16, C = 2 * Math.PI * R, GAP = keys.length > 1 ? 2 : 0;
  var acc = 0, arcs = '', rows = '';
  keys.forEach(function(k, i){
    var n = map[k], pct = n / tot;
    var len = Math.max(C * pct - GAP, 0.6);          /* 아주 작은 조각도 보이게 */
    var col = STAT_COLORS[i % STAT_COLORS.length];
    arcs += '<circle class="dn-seg" cx="60" cy="60" r="' + R + '" fill="none" stroke="' + col + '"' +
            ' stroke-width="' + SW + '" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '"' +
            ' stroke-dashoffset="' + (-acc).toFixed(2) + '"><title>' + esc(k) + ' · ' + n + '건 · ' +
            Math.round(pct * 100) + '%</title></circle>';
    rows += '<div class="dn-row"><span class="dn-dot" style="background:' + col + '"></span>' +
            '<span class="dn-name">' + esc(k) + '</span>' +
            '<b class="dn-n">' + n + '건</b>' +
            '<span class="dn-p">' + Math.round(pct * 100) + '%</span></div>';
    acc += C * pct;
  });
  return head +
    '<div class="dn-wrap">' +
      '<svg class="dn-svg" viewBox="0 0 120 120" role="img" aria-label="' + esc(title) + '">' +
        '<g transform="rotate(-90 60 60)">' + arcs + '</g>' +
        '<text x="60" y="57" text-anchor="middle" class="dn-tot">' + tot + '</text>' +
        '<text x="60" y="72" text-anchor="middle" class="dn-cap">건</text>' +
      '</svg>' +
      '<div class="dn-legend">' + rows + '</div>' +
    '</div>' + foot;
}

function viewAdminStats(){
  var st = ADMIN_DATA.stats;
  if (!st && !ADMIN_DATA.loading){ adminLoad('stats'); }
  var head = '<div class="page-head"><h2>기본 통계</h2><p>지금 원장에 있는 값으로 셉니다</p></div>';
  if (ADMIN_DATA.err)
    return head + '<div class="banner warn"><span class="bi">⚠</span><div>' + esc(ADMIN_DATA.err) + '</div></div>';
  if (!st) return head + '<div class="card"><div class="card-b muted">세는 중…</div></div>';

  var tile = function(label, value, sub){
    return '<div class="card" style="flex:1;min-width:150px"><div class="card-b">' +
      '<div class="small muted">' + esc(label) + '</div>' +
      '<div style="font-size:28px;font-weight:700;line-height:1.2;margin-top:4px">' + esc(String(value)) + '</div>' +
      (sub ? '<div class="small muted" style="margin-top:2px">' + esc(sub) + '</div>' : '') +
      '</div></div>';
  };
  /* ★ 완결 건수는 **상태**로 센다 (2026-09-10) — 전에는 완결 시각이 있는 건만 세어,
       같은 화면에서 타일은 5, 구간별 막대는 14 로 서로 달랐다(연수 발견).
       completed_at 은 9/8 에 채우기 시작해서 그 전 완결 건에는 없다. */
  var doneN = st.byState && st.byState['완결'] || 0;
  var medSub = st.medianDays === null ? '완결 시각이 기록된 건이 없습니다'
             : st.completed + '건 기준 · 가장 오래 ' + st.maxDays + '일';

  return head +
    '<div class="row mb12" style="gap:10px;flex-wrap:wrap">' +
      tile('전체 건', st.total) +
      tile('완결', doneN, st.total ? Math.round(doneN / st.total * 100) + '%' : '') +
      tile('완결까지', st.medianDays === null ? '—' : st.medianDays + '일', medSub) +
      tile('AI 검수 실행', st.runs, st.runsFailed ? '실패 ' + st.runsFailed + '회' : '') +
    '</div>' +
    '<div class="stat-grid">' +
      donutCard('구간별 건수', st.byState) +
      donutCard('AI 판정 분포', st.byVerdict,
                'AI 는 확정하지 않는다 — 최종 판정은 담당자 몫이다. 대기중은 아직 판정이 안 붙은 것') +
      donutCard('후원자 유형', st.byDonor) +
      donutCard('취득경로', st.byPath) +
    '</div>' +
    '<div class="card mb12"><div class="card-h"><h3>확인필요가 잦은 서류</h3>' +
    '<span class="tag">안내를 고칠 순서</span></div><div class="card-b">' +
    (st.uncTop && st.uncTop.length
      ? '<table class="tbl"><thead><tr><th>서류</th><th style="width:90px">확인필요</th></tr></thead><tbody>' +
        st.uncTop.map(function(u){ return '<tr><td>' + esc(u.name) + '</td><td><b>' + u.n + '</b>건</td></tr>'; }).join('') +
        '</tbody></table>'
      : '<div class="muted small">아직 없습니다</div>') +
    '</div></div>' +
    '<div class="hint">마지막 AI 검수 ' + esc(fmtKst(st.lastRunAt) || '—') +
    ' · 판정 낱개 ' + st.findings + '건. 건수가 수천이 되면 서버 집계로 옮깁니다.</div>';
}

function refreshCriteria(key){
  var c = CRITERIA[key]; if (!c) return;
  c.updated = TODAY;
  /* 검수 화면의 신선도 배지가 같이 바뀐다 — 화면에는 안 쓴다(문구 규칙 9/5). 역할 사이를 건너뛰는 버튼은 걷어냈다(9/3) */
  DB.toast = {msg:'기준일을 ' + TODAY + ' 로 갱신했습니다', act:null, cap:'', auto:true};
  render();
}
/* ── 검수 기준 축적 이력 ────────────────────────────────────
   담당자가 개별 건에서 내린 판단이 예외 규칙으로 올라가 다음 검수부터 적용된다.
   같은 오탐을 다음 사람이 다시 겪지 않게 하는 경로가 있다는 것을 화면으로 보여준다. */
var CRITERIA_LOG = [
  {date:'2026-07-22', rule:'장부가액 확인서로 원가명세서 대체 인정',
   from:'제조·유통 법인 건에서 원가명세서를 받지 못해 반려 직전까지 갔으나, 신청서 내 장부가액 확인서로 가액이 확인됨 (기관 업무지침 · 제출 불가 시 갈음)'},
  {date:'2026-07-15', rule:'면세사업자 간이영수증은 적격 증빙으로 인정',
   from:'간이영수증을 일괄 증빙 불가로 보던 규칙이 면세사업자 건을 오반려. 사업자 유형을 함께 보도록 조건 추가'},
  {date:'2026-07-08', rule:'원 단위 반올림·단수처리 차이는 금액 불일치로 보지 않음',
   from:'신고액과 증빙액이 몇 원 차이 나는 건이 반복 지적됨. 허용범위를 정해 사람이 다시 볼 일을 없앰'},
  {date:'2026-06-30', rule:'사업자번호 중간자리만으로 법인 여부를 단정하지 않음',
   from:'조합 형태 공동사업자·고유번호 부여 단체가 법인 구분코드와 달라 확인필요로 잡힘. 단정 대신 담당자 참고 안내로 낮춤'}
];
function criteriaLogBlock(){
  /* "규칙은 처음부터 완성되지 않는다 · 같은 오탐을 다음 사람이 안 겪게 하는 경로" 설명 배너와
     "승격된 규칙은 코드에 반영 · 직접 편집은 본선" 안내는 화면에서 뺐다(문구 규칙 9/5) — 이력 행이 그 자체로 말한다. */
  return '<div class="card mb16"><div class="card-h"><h3>검수 기준 축적 이력</h3>' +
    '<span class="tag">' + CRITERIA_LOG.length + '건</span></div><div class="card-b">' +
    CRITERIA_LOG.map(function(g){
      return '<div class="doc-row"><div class="di">📝</div><div style="flex:1">' +
        '<b>' + esc(g.date) + ' · ' + esc(g.rule) + '</b>' +
        '<small>' + esc(g.from) + '</small></div></div>';
    }).join('') +
    '</div></div>';
}
/* 받아야 할 서류를 '서류별 한 줄' 로 모은다 (2026-09-14).
   정본(DOC_MATRIX·DIST_DOCS)을 훑어 같은 서류가 어느 유형×경로에 걸리는지 세고,
   네 칸 모두면 '모든 건', 한쪽 유형 전부면 '법인 전체' 처럼 줄여 적는다 —
   화면이 조건을 **계산**하므로 정본이 바뀌면 이 줄도 바뀐다. */
function adminDocRows(mtx, dist){
  var paths = ['구매', '제조·유통'], types = ['법인', '법인외'];
  var order = [], seen = {};
  paths.forEach(function(p){
    types.forEach(function(t){
      ((mtx[p] || {})[t] || []).forEach(function(d){
        if (!seen[d.key]) { seen[d.key] = {doc:d, at:[]}; order.push(d.key); }
        seen[d.key].at.push({p:p, t:t});
      });
    });
  });
  var label = function(t){ return t === '법인외' ? '법인 외' : t; };
  var rows = order.map(function(k){
    var e = seen[k], at = e.at;
    var allTypes = types.filter(function(t){ return at.some(function(a){ return a.t === t; }); });
    var allPaths = paths.filter(function(p){ return at.some(function(a){ return a.p === p; }); });
    var when;
    if (at.length === 4) when = '모든 건';
    else if (allTypes.length === 1 && allPaths.length === 2) when = label(allTypes[0]) + ' 전체';
    else if (allPaths.length === 1 && allTypes.length === 2) when = allPaths[0] + ' 전체';
    else when = at.map(function(a){ return label(a.t) + ' × ' + a.p; }).join(' · ');
    return {name:e.doc.name, when:when, basis:e.doc.basis || '기관 업무지침 · 유형별 필수서류'};
  });
  (dist || []).forEach(function(d){
    rows.push({name:d.name, when:'배분처 수취 (기관마다)', basis:d.basis || '기관 업무지침 · 인수증 양식'});
  });
  return rows;
}

/* ── 검수 기준자료 관리 (2026-09-14 재정리 · 선미) ──────────────────────────
   ★ 왜 줄였나 — 카드가 일곱이었고, **같은 서류 목록을 세 군데**(①공통 기준층 · ②기관 덧쓰기층 ·
     유형별 매트릭스)에 나눠 적고 있었다. 그 셋으로 나뉜 이유는 '기관 프로필 교체' 전제였다 —
     "다른 기관이 그대로 가져다 쓰니 법령층은 못 바꾸고 기관 매뉴얼로 덧쓴다". 오픈소스로 내주면
     기관이 자기 것으로 다시 만들기 때문에 그 전제를 접었고(선미 9/14), 접는 순간
     **두 층이 할 일이 없어졌다.** 그리고 손으로 세 번 적던 표는 실제로 낡아 있었다(같은 날 발견).

   ★ 그래서 두 가지만 남긴다 — 관리자가 여기서 알고 싶은 것이 그 둘이다.
       ① 받아야 할 서류 — DOC_MATRIX · DIST_DOCS 에서 **그려낸다**(사본을 두지 않는다)
       ② 검수 기준     — FINDING_LABEL · FINDING_DESC 에서 **그려낸다**
     화면 이름이 '검수 기준자료' 인데 정작 검수 기준(판정 8가지)이 없었다 — ②가 그 자리다.
   ⚠️ 사본을 만들지 않는 것이 핵심이다. 여기에 서류 이름을 손으로 적는 순간 9/14 가 되풀이된다. */
function viewAdminCriteria(){
  var prof = getProfile(DB.promptProfile);
  var mtx = prof.matrix;
  var dist = prof.distDocs || DIST_DOCS;
  var pills = function(ds){
    return ds.map(function(d){
      return '<span class="pill neu" style="margin:0 5px 5px 0"><span class="pd"></span>' + esc(d.name) + '</span>';
    }).join('');
  };

  return '<div class="page-head"><h2>검수 기준자료</h2><p>여기가 접수 체크리스트와 검수 판정의 근거입니다</p></div>' +

    /* ① 받아야 할 서류 — 정본에서 그린다.
       서류별 한 줄로 모으고 '언제 받나' 는 정본을 훑어 계산한다 — 유형×경로 네 칸에
       같은 서류를 네 번 적으면 그게 다시 사본이 된다. 근거(basis)도 정본 옆에서 온다. */
    '<div class="card mb16"><div class="card-h"><h3>받아야 할 서류</h3>' +
    '<span class="tag">기관 업무지침 「필수서류」</span></div>' +
    '<table><thead><tr><th>서류명</th><th>언제 받나</th><th>근거</th></tr></thead><tbody>' +
    adminDocRows(mtx, dist).map(function(d){
      return '<tr><td class="tb-item">' + esc(d.name) + '</td>' +
        '<td class="small">' + esc(d.when) + '</td>' +
        '<td class="small muted">' + esc(d.basis) + '</td></tr>';
    }).join('') +
    '</tbody></table>' +
    '<div class="card-b"><div class="small muted">' + esc(prof.note) +
    ' 신청서는 파일이 아니라 접수 링크의 <b>폼</b>으로 받습니다 — 그래서 빠질 수가 없습니다.' +
    '</div></div></div>' +

    /* ② 검수 기준 — 판정 카드가 쓰는 그 정본에서 그린다 */
    '<div class="card mb16"><div class="card-h"><h3>검수 기준 — 판정 ' +
    Object.keys(FINDING_LABEL).length + '가지</h3>' +
    '<span class="tag">' + AI_SCOPE.covered + ' / ' + AI_SCOPE.total + ' 세부유형을 AI가 봅니다</span></div>' +
    '<table><thead><tr><th>무엇을 잡나</th><th>어떻게 보나</th><th>누가</th></tr></thead><tbody>' +
    Object.keys(FINDING_LABEL).map(function(code){
      var d = FINDING_DESC[code] || {by:'—', what:'—'};
      var isAi = d.by.indexOf('AI') >= 0;
      return '<tr><td class="tb-item">' + esc(FINDING_LABEL[code]) + '</td>' +
        '<td class="small">' + esc(d.what) + '</td>' +
        '<td><span class="pill ' + (isAi ? 'gold' : 'neu') + '"><span class="pd"></span>' + esc(d.by) + '</span></td></tr>';
    }).join('') +
    '</tbody></table>' +
    '<div class="card-b"><div class="small muted">' +
    '<b>확인 권장이 떠도 완결을 막을지는 규칙이 아니라 상황마다 다릅니다</b> — 수량 대조는 인수증 축에서만 막고, 일자 순서는 기부→배분 축을 막지 않습니다. ' +
    '어느 쪽이든 담당자가 <b>사유를 적으면 넘어갈 수 있고, 그 사유는 기록에 남습니다</b>. ' +
    esc(AI_BLIND_NOTE) + '.' +
    '</div></div></div>' +

    /* ③ 기준 문서 · 기준일 */
    '<div class="card mb16"><div class="card-h"><h3>기준 문서 · 기준일</h3><span class="tag">신선도 배지</span></div><div class="card-b">' +
    Object.keys(CRITERIA).map(function(k){
      var c = CRITERIA[k], fr = criteriaFreshness(c.updated, TODAY);
      var pl = {none:'ok', info:'info', review:'warn'}[fr.level];
      return '<div class="doc-row"><div class="di">📘</div><div style="flex:1"><b>' + esc(c.name) + '</b>' +
        '<small>기준일 ' + esc(c.updated) + ' · ' + esc(c.guideline) + '</small></div>' +
        '<div class="st"><span class="pill ' + pl + '" style="margin-right:8px"><span class="pd"></span>' +
        esc(fr.label) + '</span>' +
        '<button class="btn ghost sm" onclick="refreshCriteria(\'' + k + '\')">오늘 날짜로 갱신</button></div></div>';
    }).join('') + '</div></div>' +

    /* ④ 축적 이력 */
    criteriaLogBlock();
}
/* ══════════════════════════════════════════════════════════════
   담당자(staff) 화면군 15개
   ══════════════════════════════════════════════════════════════ */
function renderStaff(){
  if (DB.preview) return viewPreview();   /* role은 staff 유지한 채 상대 화면 곁눈질 */
  var f = {home:viewHome, send:viewSend,
    list:viewList, 'case':viewCase, intakeSrc:viewIntakeSrc, receive:viewReceive}[DB.screen];
  return f ? f() : viewHome();
}
/* ★ [직접 등록] 신청서 대리 작성 화면은 없앴다 (2026-09-04 선미 결정)
     원칙: **접수는 무조건 링크로 받는다.** 담당자가 후원자 대신 신청서를 쓰는 경로를 두지 않는다.
     법인 인감 건도 링크로 받는다 — 폼을 쓰고 인감 스캔본을 첨부하면 된다(corpApplRoute).
     ⚠️ 되살릴 일이 생기면 커밋 이력에서 viewProxyForm·openProxy·paperizeChecklist 를 찾을 것. */

/* [v6 범위축소] 배분·재고·수혜기관 스텁 화면 제거 — 메뉴에서도 빠져 접근 경로가 없다.
   배분기관 증빙(인수증·물품 사진)은 건 상세(검수 결과) 하단의 제출 링크로 받는다. */

/* ── 1. 홈 대시보드 ── */
/* ★ qtyLabel · homeBar · kpi · stat 은 지웠다 (2026-09-05) — 홈에서 접수 물품 현황 표,
     체크리스트 통과율 진행바, KPI 4장을 걷어내면서 부르는 곳이 사라졌다.
     되살릴 일이 있으면 커밋 이력에서 찾을 것. */
/* 화면이 보는 검수 결과 — inspect() 를 감싼다.
   inspect()(common.js)는 대조 판정을 모르고, rules-compare.js 는 사유 해소를 모른다.
   그래서 항목이 다 수취돼 verdict='완결'(=완결 가능) 로 나와도, 해소되지 않은
   대조 판정이 남아 있으면 완결이 아니다.
   ★ 게이트 버튼은 이미 막고 있는데 요약만 "완결" 이라고 하면 담당자는 왜 못 누르는지
     알 수 없다 — "완결이라면서요?" 가 된다 (2026-09-02 브라우저 확인).
   ★ 표시·집계·필터가 한 값을 보게 하려고 여기서 한 번만 보정한다.
     화면은 inspect() 를 직접 부르지 않는다 (decideDist 의 로직용 호출은 예외).
   재현: 3기관 증빙을 전부 수취하고 배분 합계만 모자라면 E7 이 이 상태를 만든다. */
function inspectView(c, todayStr){
  var res = inspect(c, todayStr || TODAY);
  var blk = unresolvedBlocking(c);
  if (res.verdict === '완결' && blk.length){
    res.verdict = '미완결';
    res.canComplete = false;
    res.reasonMessage = '서류는 다 갖춰졌습니다. ' +
      blk.map(function(f){ return findingLabel(f) + ' ' + f.verdict; }).join(' · ') +
      ' 판정이 남아 완결할 수 없습니다. [대조 판정]에서 해소하세요.';
  }
  return res;
}
/* ── 홈 — **갈래 둘** (2026-09-05 선미 재설계) ────────────────────────────────
   ★ 왜 또 바꿨나 — 앞 판(숫자 셋 + [내가 할 일] 목록)은 결국 **목록의 복사본**이었다.
     완결 뺀 건이 전부 홈에 나열되니 "홈이 목록이랑 뭐가 다른가" 가 된다(선미 9/5).
     그리고 [내가 할 일]/[기다리는 중] 은 코드에 없는 개념이라 기준을 말로 설명할 수 없었다 —
     같은 '서류가 덜 왔다' 가 제출 전이면 기다리는 중, 제출 후면 내 일이었다.
   ★ 그래서 홈은 **나열하지 않는다.** 담당자가 여기서 하는 일은 둘 중 하나를 고르는 것뿐이다.
       신규 접수 → 접수 링크 발송      ·      검수 → 후원건 검수 목록
     건을 보는 자리는 목록 하나다. 홈은 그 앞의 갈림길이다. */
function viewHome(){
  var live = DB.cases.filter(isRegistered).map(caseView);
  var n = function(id){ return live.filter(caseFilter(id).test).length; };
  /* 갈래 아이콘 (2026-09-12 선미 — "홈이 너무 없어 보인다") — 신규 접수는 링크를 내보내는 화살, 검수는 체크.
       클립아트가 아니라 선 하나씩. 색은 CSS(.home-gate .ic)가 정한다 */
  var GATE_ICON = {
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h12M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  var gate = function(title, desc, sub, act, icon){
    return '<button class="home-gate" onclick="' + act + '">' +
      '<span class="ic">' + (GATE_ICON[icon] || '') + '</span>' +
      '<span class="t">' + esc(title) + '</span>' +
      '<span class="d">' + esc(desc) + '</span>' +
      (sub ? '<span class="s">' + sub + '</span>' : '') + '</button>';
  };
  /* ★ 라벨도 CASE_FILTERS 에서 가져온다 (2026-09-08) — 전에는 홈에 문구를 따로 적어 뒀다.
       목록 탭 이름을 고치는 순간 홈만 옛 이름으로 남는다. 숫자를 두 곳에 적으면 갈리듯 말도 갈린다. */
  var lb = function(id){ return caseFilter(id).label; };
  var nIn = n('intake'), nDi = n('dist');
  /* ★ 히어로 — 갈림길 위에 로고와 한 줄 (2026-09-12 선미). 홈은 나열하지 않으니 여백이 많다.
       그 자리에 숫자가 아니라 정체성을 둔다. 높이 약 150px — 노트북에서 갈래 둘이 스크롤 없이 보여야 한다.
       마크는 common.js brandMark() 정본. 문구엔 재단 이름을 넣지 않는다(아직 공식 아님). */
  /* .home 이 본문 세로 가운데에 앉는다(styles.css) — 위에 붙어 있으면 빈 화면처럼 보였다(선미 9/12).
       흐름 한 줄(접수 링크 발송 → … → 완결)과 초록 띠·상태 숫자 줄은 넣었다가 뺐다(선미 9/12 저녁 — 클릭도 안 되는 글줄이 쌩뚱맞다). */
  return '<div class="home">' +
    '<div class="home-hero">' +
      '<div class="mark-row">' + brandMark() + '<span class="wm">나눔대장</span></div>' +
      '<p class="tag">후원물품 서류를 받고, 검수하고, 기록합니다</p>' +
    '</div>' +
    '<div class="home-gates">' +
    gate('신규 접수', '후원자에게 접수 링크를 보냅니다', '', "go('send')", 'send') +
    gate('검수', '접수된 건의 서류를 검수합니다',
      '<b>' + nIn + '</b>건 ' + esc(lb('intake')) + ' · <b>' + nDi + '</b>건 ' + esc(lb('dist')),
      "goList('all')", 'check') +
    '</div>' +
  '</div>';
}
/* ── 흐름 정본 — **탭 · 판정 배지 · 홈이 이 표 하나를 쓴다** (2026-09-05 선미) ──────────
   ★ 왜 다시 짰나 — 앞 판(전체/검수할 건/배분 정할 건/증빙 미수취/완결)은 겹치고 빠졌다.
       #103 은 [후원접수검수] 와 [증빙 미수취] **양쪽에** 걸리고, 제출 대기인 #115 는
       **어느 필터에도 안 걸렸다**. 합계가 맞아 보였던 건 겹침 1 + 누락 1 이 상쇄된 우연이다(9/5 실측).
     원인은 '증빙 미수취' 를 상태가 아니라 **조건**(남은 증빙이 있는가)으로 정의한 것이다.
     그래서 이번엔 inspect() 의 판정을 그대로 접어 쓴다 — **배타적이고 빠짐이 없다.**

   ★ 흐름 6단계를 셋으로 접는다 (선미 지정)
       ① 검수대기(제출 대기) ② 미완결(후원자 서류 검수) ③ 후원자서류완비(배분기관 미지정)
         → **후원접수중** · 링크 발송부터 후원자 서류 검수가 끝날 때까지
       ④ 배분진행(기관 증빙 대기·검수) ⑤ 완결가능(다 모임 · 완결 처리만 남음)
         → **배분진행중** · 배분확정 이후 배분 서류를 받고 검수할 때까지
       ⑥ 완결확정 → **완결**
     ③ 을 앞쪽에 둔 이유 — 아직 배분확정 **전**이고, 다음 할 일(배분기관 지정)이
       후원 접수 처리의 마무리다. 기관을 정하는 순간 뒤쪽으로 넘어간다.

   ⚠️ 탭과 판정 배지가 **같은 함수**를 본다. 갈리면 "배분검수 탭인데 후원접수중이라고 뜬다" 가 난다. */
var CASE_STAGES = ['후원접수중', '배분진행중', '완결'];
function caseStage(c, r){
  var k = caseStateKey(c, r);
  if (k === '완결확정') return '완결';
  if (k === '배분진행' || k === '완결가능') return '배분진행중';
  return '후원접수중';                       /* 검수대기 · 미완결 · 후원자서류완비 */
}
var STAGE_PILL = {'후원접수중':'warn', '배분진행중':'info', '완결':'ok'};
function stagePill(c, r){
  var g = caseStage(c, r);
  return '<span class="pill ' + STAGE_PILL[g] + '"><span class="pd"></span>' + g + '</span>';
}
/* 판정 옆 한 줄 — **무엇이 남았나**. 배지가 셋뿐이라 자세한 것은 여기서 말한다 */
function stageDetail(c, r){
  var k = caseStateKey(c, r);
  if (k === '검수대기') return c.awaitingSubmit ? '후원자 제출 대기' : '필수정보 미입력';
  if (k === '미완결'){
    var parts = [];
    if (r.missingCount > 0) parts.push('미수취 ' + r.missingCount);
    if (r.reviewCount > 0)  parts.push('확인필요 ' + r.reviewCount);
    var blk = unresolvedBlocking(c);
    if (blk.length) parts.push(blk.map(function(f){ return findingLabel(f); }).join('·') + ' 대조 판정');
    return parts.join(' · ');
  }
  if (k === '후원자서류완비') return '배분기관 미지정';
  if (k === '배분진행'){
    var dp = distPendingItems(c);
    var up = dp.some(function(it){ return it.r.orgUpload && it.r.orgUpload.status === 'uploaded'; });
    return up ? '기관 제출 · 확인 필요' : '기관 증빙 대기 ' + dp.length;
  }
  if (k === '완결가능') return '완결 처리만 남음';
  return '';
}
/* 목록 탭 — 흐름 3단계 + 합계.
   ★ 전에는 [완결] 을 두지 않았다("액션이 없다 · 전체에서 본다").
     그런데 화면에는 그 사정이 안 적혀 있어서 **[전체 41][후원접수검수 26][배분검수 5]**
     가 나란히 놓였고, 26+5=31 이라 **10건이 어디에도 없는 것처럼** 보였다
     (2026-09-08 선미 지적 · 실 DB 에서 완결 정확히 10건 확인).
   ★ 그래서 완결을 셋째 구간으로 세운다 — 액션이 없는 것은 화면 톤으로 말하고(끄기),
     숫자는 셈에 넣는다. **안 보여 주는 것과 차분하게 보여 주는 것은 다르다.**
   ⚠️ 'all' 은 지우지 않는다 — 홈의 goList('all') 이 여기로 온다. 화면에서는 구간이
     아니라 **합계 칩**으로 그린다(세 구간을 더하면 그 수가 나와야 한다). */
var CASE_FILTERS = [
  {id:'all',    label:'전체',        test:function(x){ return true; }},
  {id:'intake', label:'후원 접수·검수', step:'1', test:function(x){ return caseStage(x.c, x.r) === '후원접수중'; }},
  {id:'dist',   label:'배분 검수',     step:'2', test:function(x){ return caseStage(x.c, x.r) === '배분진행중'; }},
  {id:'done',   label:'완결',         step:'3', test:function(x){ return caseStage(x.c, x.r) === '완결'; }}
];
/* 흐름 바에 그리는 구간 셋 — 'all' 은 합계라 빠진다 */
function stageFilters(){ return CASE_FILTERS.filter(function(f){ return !!f.step; }); }

/* ── 목록 검색 (2026-09-08 연수) ─────────────────────────────────
   ★ **화면에 보이는 칸으로만 찾는다** — 건번호 · 물품 · 후원자 · 배분처.
     안 보이는 값으로 걸리면 "왜 이게 나오지" 가 되고, 담당자가 결과를 못 믿는다.
   ⚠️ 개인 후원자 **실명으로는 못 찾는다.** 못 찾게 막은 게 아니라 **DB 에 없다** —
     법인 외는 가린 이름만 저장되고(donor_name CHECK 제약) 실명은 신청서 PDF 안에만 있다.
     대신 '김' 으로 성 검색은 된다(김○수 · 김○록). 법인은 상호가 그대로라 완전 검색된다. */
function normQuery(s){ return String(s == null ? '' : s).trim().toLowerCase().replace(/#/g, ''); }
function caseMatches(x, q){
  if (!q) return true;
  var c = x.c;
  var hay = [c.id, c.item, c.donor, orgLabel(c)].join(' ').toLowerCase().replace(/#/g, '');
  /* 낱말을 모두 포함해야 한다 — '늘봄 티켓' 로 좁힐 수 있다 */
  return q.split(/\s+/).every(function(w){ return !w || hay.indexOf(w) >= 0; });
}
/* ★ 칠 때마다 찾지 않는다 — **엔터나 [찾기] 를 눌러야** 찾는다 (2026-09-08 선미 요청).
   ⚠️ 왜 바꿨나 — 앞 판은 oninput 마다 render() 를 불렀다. render() 는 content 를
     **통째로 갈아끼우므로** 입력 칸 자체가 새 것으로 바뀐다. 그래서 한글이 깨졌다:
     한글은 자음·모음이 **조합 중(composition)** 인 상태로 칸 안에 있는데, 그 도중에
     칸이 갈리면 조합이 끊겨 '한' 이 'ㅎ' + 'ㅏ' + 'ㄴ' 으로 흩어지거나 글자가 사라진다.
     포커스를 되돌려도 조합 상태는 못 되돌린다 — 되돌릴 수 있는 값이 아니다.
     엔터로 바꾸면 조합이 끝난 뒤에만 다시 그리므로 이 문제가 통째로 사라진다.
   ★ 그래서 타이핑 중에는 화면을 건드리지 않는다. DB.listQuery 는 **찾을 때만** 바뀐다. */
function runListSearch(){
  var b = el('listSearch');
  DB.listQuery = b ? b.value : '';
  render();
  var b2 = el('listSearch');
  if (b2){ b2.focus(); try { b2.setSelectionRange(b2.value.length, b2.value.length); } catch (err) {} }
}
/* 엔터로 찾는다. ⚠️ 한글 조합 중의 엔터는 무시한다 —
     IME 가 조합을 확정하려고 보내는 엔터라, 그걸 검색으로 받으면 글자가 잘린다. */
function listSearchKey(ev){
  if (!ev || ev.key !== 'Enter') return;
  if (ev.isComposing || ev.keyCode === 229) return;
  ev.preventDefault();
  runListSearch();
}
function clearListQuery(){
  var b = el('listSearch');
  if (b) b.value = '';
  DB.listQuery = '';
  render();
  var b2 = el('listSearch'); if (b2) b2.focus();
}
function caseFilter(id){
  for (var i = 0; i < CASE_FILTERS.length; i++) if (CASE_FILTERS[i].id === id) return CASE_FILTERS[i];
  return CASE_FILTERS[0];   /* 모르는 값이면 전체 — 빈 화면을 보여주지 않는다 */
}
/* 건 하나를 필터가 보는 모양으로 — 홈·목록이 같은 것을 넘긴다 */
function caseView(c){
  var r = inspectView(c, TODAY);
  return {c:c, r:r, k:caseStateKey(c, r)};
}
/* 카운터를 누르면 목록이 **그 필터로** 열린다.
   ⚠️ 예전에는 홈의 클릭 타깃 8개가 전부 go('list') 였다 — 정보는 8종인데 목적지가 하나라
     목록에 도착해서 방금 본 숫자를 손으로 다시 찾아야 했다. */
function goList(filter){
  DB.listFilter = filter || 'all';
  go('list');
}
/* 체크리스트 항목의 3개 층 —
   F 폼 필드(코드 검증) · S 신청서 폼 제출(폼+전자서명) · A 첨부 파일(AI 내용 판정) */
function layerBadge(kind, full){
  if (kind === 'F') return '<span class="layer-badge layer-f">자동 확인' + (full ? ' · 할 일 없음' : '') + '</span>';
  if (kind === 'S') return '<span class="layer-badge layer-s">작성·서명' + (full ? ' · 폼과 전자서명' : '') + '</span>';
  return '<span class="layer-badge layer-a">파일 올리기' + (full ? ' · AI가 내용 확인' : '') + '</span>';
}
/* ★ verdictPill 은 지웠다 (2026-09-05) — r.verdict 를 그대로 찍는 배지였다.
     inspect() 가 c.state 를 안 보므로 '완결 처리' 를 누른 건과 안 누른 건을 똑같이 '완결' 이라고 찍었다.
     화면 배지는 전부 casePill(c, r) 하나를 쓴다. 되살리지 말 것. */
/* ── 건 하나의 표시 상태 — 홈·목록·상세가 **같은 값 하나**를 본다 (2026-09-05 선미) ─────────
   ★ inspect() 는 caseObj.state 를 보지 않는다 (common.js:284~308).
     그래서 [완결 처리] 를 눌러 확정한 건과, 아직 안 누른 건이 **둘 다 verdict === '완결'** 이다.
     그 둘을 가르는 곳은 여기 하나다.
   ⚠️ 예전에는 홈만 이 구분을 했고(casePill) 목록은 verdictPill 로 둘 다 '완결' 이라고 찍었다.
     목록 [완결 N] 필터에 **아직 완결 안 된 건이 섞여** 담당자가 끝났다고 믿고 넘어갈 수 있었다. */
var CASE_STATE_PILL = {
  '완결확정':'ok', '완결가능':'info', '배분진행':'info',
  '후원자서류완비':'ok', '미완결':'warn', '검수대기':'neu'
};
function caseStateKey(c, r){
  if (c && c.state === '완결') return '완결확정';
  if (r && r.verdict === '완결') return '완결가능';
  return (r && r.verdict) || '검수대기';
}
/* ★ caseUrgency 는 지웠다 (2026-09-05) — 홈의 [내가 할 일]/[기다리는 중] 과
     목록의 [급한 순] 정렬이 함께 사라지면서 부르는 곳이 없어졌다.
     그 개념 자체가 코드에 없던 것이라 기준을 말로 설명할 수 없었다. 되살리지 말 것. */
/* 건 상태 배지 — 홈·목록·상세 통일 (팀3 · 2026-07-27 상태 체계 확장) */
function casePill(c, r){
  var k = caseStateKey(c, r);
  return '<span class="pill ' + (CASE_STATE_PILL[k] || 'neu') + '"><span class="pd"></span>' + esc(k) + '</span>';
}

/* ── 4. 접수 링크 발송 — 건 생성의 시작점 ──
   PRD Q3 확정: 후원자 유형·취득 경로는 후원자 자기신고가 아니라 담당자가 지정한다.
   지정과 동시에 체크리스트가 규칙 기반으로 전개되고, 그 건에 묶인 링크가 발송된다. */
/* 텍스트 칸용 — 화면을 다시 그리지 않고 값만 저장한다 (2026-09-11 선미 실주행 · 루브릭 테스트 중 발견)
   ★ 왜 따로 두나 — setReq 는 매번 render() 로 화면 전체를 다시 그린다. 텍스트 칸은 onchange 라
       **칸을 떠나는 순간**(다른 칸 클릭·Tab) 발동하는데, 그때 화면이 통째로 바뀌면 방금 누른 칸이
       사라져 클릭이 허공에 떨어진다. 그래서 연락처 칸을 **두 번** 눌러야 커서가 들어갔고, Tab 은
       포커스를 잃었다. 텍스트 칸 값은 화면 다른 곳에 안 쓰이므로(본인확인 값 한 곳만 아래서 직접 갱신)
       다시 그릴 이유가 없다.
   ⚠️ 다시 그려야 하는 한 경우 — 이미 링크를 발급한 뒤 값을 고치면 링크가 무효가 되어 ③ 발송 카드가
       바뀌어야 한다. 그때만 그리고, 타이핑 중이던 칸에 포커스를 되돌린다(id 로 찾는다 · 커서는 끝으로). */
function setReqQuiet(k, v, elId){
  DB.req[k] = v;
  if (k === 'phone'){
    var digits = String(v || '').replace(/\D/g, '');
    if (digits.length >= 4){
      DB.req.verifyLast4 = digits.slice(-4);
      var v4 = document.getElementById('req-verify4');
      if (v4 && v4.value !== DB.req.verifyLast4) v4.value = DB.req.verifyLast4;
    }
  }
  refreshSendGate();
  if (k === 'channel' || k === 'email') return;
  if (!DB.req.sent && !DB.req.caseId && !DB.req.copied) return;   /* 링크 발급 전 — 그릴 것이 없다 */
  DB.req.sent = false; DB.req.caseId = null; DB.req.copied = false;
  render();
  var el = elId && document.getElementById(elId);
  if (el){ el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch(e){} }
}
/* 발급 버튼과 그 힌트만 제자리에서 갱신 — 화면 전체를 다시 그리지 않고도 잠금이 풀리게 */
function refreshSendGate(){
  var r = DB.req, btn = document.getElementById('req-send-btn');
  if (!btn) return;
  var vOk = reqVerifyOk(r), eOk = reqEmailOk(r);
  btn.disabled = !(vOk && eOk);
  var vh = document.getElementById('req-verify-hint'), eh = document.getElementById('req-email-hint');
  if (vh) vh.style.display = vOk ? 'none' : '';
  if (eh) eh.style.display = eOk ? 'none' : '';
}
function setReq(k, v){
  DB.req[k] = v;
  /* 연락처를 입력하면 본인확인 값은 그 뒷 4자리로 자동 채움 — 담당자가 필요하면 덮어쓸 수 있다 */
  if (k === 'phone'){
    var digits = String(v || '').replace(/\D/g, '');
    if (digits.length >= 4) DB.req.verifyLast4 = digits.slice(-4);
  }
  /* 유형·경로·후원자명·연락처(본인확인 값)가 바뀌면 링크를 다시 발급해야 한다.
     전달 방법·이메일 주소만 바꾸는 것은 이미 발급된 링크에 영향이 없다. */
  if (k !== 'channel' && k !== 'email'){ DB.req.sent = false; DB.req.caseId = null; DB.req.copied = false; }
  render();
}
/* ── 발송 채널 — 예선/본선 범위를 정직하게 구분 ──
   copy : 링크를 만들어 담당자가 쓰던 채널(전화·카톡·메일)로 직접 전달 — 발송 인프라 불필요
   email: 심사 절차가 없는 유일한 자동 발송 채널 — 본선에서 실제 연동
   kakao/sms: 채널 인증·템플릿 심사·발신번호 등록이 선행돼야 함 — 접수 월 4~5건 규모에는 과설계라 본선 검토로 이월 */
/* 화면 문구 규칙(10-planning/ui-copy-rules-20260905.md) — 왜 아직 안 되는지는 여기 주석에만 둔다.
   email: 실제 발송 연동이 없다. 9/5 까지는 '발송 시뮬레이션' 목업을 그렸는데, 보내지지 않는 것을
          보내는 것처럼 보이는 자리라 준비 중으로 내렸다(SEND_CHANNELS 의 future 하나로 되돌릴 수 있다).
   kakao: 채널 개설·비즈니스 인증·템플릿 심사(영업일 2~3일) 선행. 접수 월 4~5건에는 과설계.
   sms:   발신번호 사전등록(전기통신사업법 §84)·대행사 계약 선행. 알림톡 실패 시 폴백으로 함께 검토. */
var SEND_CHANNELS = [
  {id:'copy',  label:'링크 복사',    future:false, hint:'복사한 링크를 전화·카카오톡·메일로 보냅니다.'},
  {id:'email', label:'이메일',       future:true,  hint:''},
  {id:'kakao', label:'카카오 알림톡', future:true,  hint:''},
  {id:'sms',   label:'문자',         future:true,  hint:''}
];
function getChannel(id){ return SEND_CHANNELS.filter(function(c){ return c.id === id; })[0] || SEND_CHANNELS[0]; }
/* 접수 링크 주소 — 건 번호가 아니라 **토큰**으로 만든다 (2026-09-03 · 유진·선미 합의).
   ★ 왜 바꿨나 — 예전엔 '/s/201' 처럼 건 번호를 주소에 넣었다. 201·202 는 찍어볼 수 있는 번호라
     토큰을 해시로 감춘 노력이 반감된다. 그리고 nanumdaejang.org 는 실제 주소가 아니어서
     **복사해도 못 여는 주소**가 나가고 있었다. accessUrl 이 location.origin + '/?t=' 로 만든다.
   ★ 토큰은 발급 때 한 번만 돌려받는다 — DB 엔 해시만 남아 다시 못 꺼낸다.
     그래서 c.linkToken 이 새로고침에 사라지는 것은 **정상**이고, 그때는 재발급이 정답이다.
     ⚠️ 없을 때 자리표시 주소를 돌려주면 담당자가 그것을 복사해 보낸다 — 그래서 빈 문자열을 준다.
        부르는 쪽이 '없음' 을 눈에 보이게 다뤄야 한다. */
function linkUrl(caseId){
  var c = getCase(caseId);
  return (c && c.linkToken) ? accessUrl(c.linkToken) : '';
}
/* 주소를 잃었을 때 담당자에게 할 말 — 세 자리가 같은 문장을 쓴다 */
var LINK_LOST_MSG = '주소는 발급할 때 한 번만 보입니다. 다시 보내려면 재발급하세요.';
/* file://로 열면 navigator.clipboard가 없다(보안 컨텍스트 아님) — execCommand로 폴백하고,
   둘 다 실패하면 "복사했다"고 거짓말하지 않고 직접 복사하도록 안내한다. */
function copyToClipboard(url){
  var ok = false;
  try {
    var ta = document.createElement('textarea');
    ta.value = url;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, url.length);
    ok = document.execCommand('copy');
    document.body.removeChild(ta);
  } catch (e) { ok = false; }
  if (!ok && navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url); ok = true;
  }
  return ok;
}
function copyLink(){
  var url = linkUrl(DB.req.caseId);
  if (!url){ DB.toast = {msg:LINK_LOST_MSG}; render(); return; }   /* 가짜 주소를 복사시키지 않는다 */
  var ok = copyToClipboard(url);
  DB.req.copied = ok;
  /* ★ 성공 알림은 스스로 닫힌다 (2026-09-10 승희) — 전에는 cap 에 주소를 실어 [닫기] 를 눌러야만 사라졌다.
       주소는 바로 위 링크 칸에 그대로 있으니 토스트가 되풀이할 이유가 없다. 실패 쪽은 그대로 cap 을 실어 남긴다. */
  DB.toast = ok
    ? {msg:'링크를 복사했습니다', auto:true}
    : {msg:'자동 복사가 막혔습니다. 링크 칸의 주소를 직접 복사하세요.', cap:url};
  render();
}
/* 발송 이력에서 기존 건의 링크를 다시 복사 — 제출 전(링크 생존) 건만 노출된다 */
function copyHistLink(caseId){
  var url = linkUrl(caseId);
  if (!url){ DB.toast = {msg:'#' + caseId + ' — ' + LINK_LOST_MSG}; render(); return; }
  var ok = copyToClipboard(url);
  DB.toast = ok
    ? {msg:'#' + caseId + ' 링크를 복사했습니다', auto:true}
    : {msg:'자동 복사가 막혔습니다. 아래 주소를 직접 복사하세요.', cap:url};
  render();
}
/* 발송 이력에서 기존 건의 정보를 발송 폼으로 불러오기 — 같은 후원자에게 새 링크를 발급할 때 재입력을 없앤다 */
function loadReqFrom(caseId){
  var c = getCase(caseId);
  if (!c) return;
  var r = DB.req;
  r.donorType = c.donorType;
  if (c.acqPath) r.path = c.acqPath;
  r.donorName = (c.donor && c.donor.charAt(0) !== '(') ? c.donor : '';   /* '(제출 대기)' 자리표시자는 제외 */
  r.phone = c.donorPhone || '';
  r.verifyLast4 = c.verifyLast4 || '';
  r.sent = false; r.caseId = null; r.copied = false;
  r.loadedFrom = caseId;   /* 불러온 초안 표시 — 발급 없이 화면을 떠나면 자동으로 비운다 */
  DB.toast = {msg:'#' + caseId + ' 정보를 불러왔습니다', auto:true};
  render();
}

function viewSend(){
  var r = DB.req;
  var ch = getChannel(r.channel);
  /* 지금 실제로 쓸 수 있는 채널만 (설계서 §4 A) — 준비 중인 것은 화면에 아예 안 나온다 */
  var openChannels = SEND_CHANNELS.filter(function(c){ return !c.future; });
  var seg = function(key, opts){
    return '<div class="seg mb12" style="display:flex;width:100%">' + opts.map(function(o){
      return '<button class="' + (r[key] === o ? 'on' : '') + '" onclick="setReq(\'' + key + '\',\'' + o + '\')" style="flex:1;white-space:nowrap">' + o + '</button>';
    }).join('') + '</div>';
  };
  var docs = autoChecklist(r.donorType, r.path, true, DB.promptProfile).filter(function(d){ return d.included; });
  var url = linkUrl(r.caseId);
  /* 문구는 10-planning/ui-copy-rules-20260905.md 를 따른다 — 왜는 주석에, 화면에는 무엇만.
     PRD Q3: 유형·경로는 후원자 자기신고가 아니라 담당자 지정. 지정과 동시에 체크리스트가 규칙(코드)로 전개된다. */
  return '<div class="page-head" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
    '<div><h2>신규 접수</h2></div>' +
    /* 어떤 상태에서든 한 번에 새 접수 입력을 시작하는 확실한 리셋 — 발급된 링크·정보는 [발송 이력]에 남는다
       ★ 툴팁 (2026-09-11 선미) — "비워진다" 를 누르기 **전에** 말해 준다. 되돌리기가 없는 버튼이기 때문.
       ⚠️ 터치 기기는 마우스오버가 없어 뜨지 않는다 — 그래서 툴팁에만 있는 정보를 두지 않는다.
         버튼 이름(＋ 신규생성)만으로도 무엇을 하는지는 알 수 있어야 한다. aria-label 은 낭독기용. */
    '<button class="btn pri tip" data-tip="' + esc(NEW_REQ_TIP) + '" aria-label="' + esc(NEW_REQ_TIP) + '"' +
      ' onclick="startNewReq()">＋ 신규생성</button></div>' +

    /* [레이아웃 3존] 상단 가로 = 접수 유형 (유형·경로 seg는 한 줄 유지)
       ★ 번호를 글자(①)가 아니라 초록 원(.sec-n)으로 뗐다 (2026-09-11 선미) —
         후원자 신청서의 단계 표기와 같은 모양이다. 원문자 ①②③ 은 낭독기가 읽는 방식이 제각각이고
         글꼴에 따라 안 보이기도 한다. .card-h 가 이미 flex 라 형제로 넣으면 세로 가운데가 맞는다. */
    '<div class="card mb16"><div class="card-h sec-h">' + secN(1) + '<h3>접수 유형</h3></div>' +
      '<div class="card-b"><div class="row" style="gap:22px;align-items:flex-start">' +
        '<div class="field" style="flex:0 0 auto;min-width:170px;margin-bottom:0"><label>후원자 유형 <span class="req">*</span></label>' + seg('donorType', ['법인','법인외']) + '</div>' +
        '<div class="field" style="flex:0 0 auto;min-width:210px;margin-bottom:0"><label>취득경로 <span class="req">*</span></label>' + seg('path', ['구매','제조·유통']) + '</div>' +
        '<div class="field" style="flex:1;min-width:200px;margin-bottom:0"><label>후원자명</label><input type="text" id="req-donorName" value="' + esc(r.donorName) +
          '" placeholder="예: 주식회사 온누리식품" oninput="setReqQuiet(\'donorName\',this.value,this.id)"></div>' +
        /* 숫자만 받고 하이픈은 칸이 붙인다 — 후원자 폼과 같은 방식(maskPhone · 2026-09-06) */
        '<div class="field" style="flex:1;min-width:180px;margin-bottom:0"><label>연락처</label><input type="text" inputmode="numeric" id="req-phone" value="' + esc(r.phone || '') +
          '" placeholder="000-0000-0000" oninput="this.value=maskPhone(this.value);setReqQuiet(\'phone\',this.value,this.id)"></div>' +
      '</div></div></div>' +

    /* [레이아웃 3존] 가운데 = 필요 서류 ② — **카드 하나** 안에 좌 서류목록 / 우 미리보기
       ★ 2026-09-11 선미 — ①②③ 을 세로로 세운다. 전에는 ② 와 ③ 이 좌우였고 미리보기는 ② 안의 버튼이었다.
         발송(③)은 이 화면의 **마지막 행동**인데 오른쪽 위에 있어 순서가 화면과 어긋났다.
       ★ 미리보기를 ② 의 **형제 카드가 아니라 자식**으로 둔다 (2026-09-11 선미 · 실주행).
         카드 둘을 나란히 놓았더니 서로 남남인 섹션처럼 보였다. 미리보기는 "이 서류들을 후원자가
         어떤 화면에서 내는가" 라 ② 에 딸린 것이지 ② 와 대등한 것이 아니다. */
    '<div class="card mb16"><div class="card-h sec-h">' + secN(2) + '<h3>필요 서류</h3>' +
      '<span class="tag">' + esc(r.donorType) + ' × ' + esc(r.path) + ' · ' + docs.length + '항목</span></div>' +
      '<div class="card-b"><div class="row" style="align-items:flex-start">' +
        '<div style="flex:1;min-width:260px">' +
          '<div class="sub-h">후원자가 제출할 서류</div>' +
          /* ★ 층 딱지(자동 확인·작성·서명·파일 올리기)를 뺐다 (2026-09-11 선미) — 여기서만.
               이 칸이 답하는 질문은 "무슨 서류가 필요한가" 하나다. 누가 어떻게 채우는지는 건 상세의 몫이고
               거기 딱지는 그대로 둔다(screen-staff.js 의 나머지 layerBadge 호출 2곳). */
          docs.map(function(d){
            return '<div class="doc-row"><div class="di">' + (d.kind === 'F' ? '🧮' : '📄') + '</div>' +
              '<div style="flex:1"><b>' + esc(d.n) + '</b></div></div>';
          }).join('') +
        '</div>' +
        sendPreviewPane() +
      '</div></div></div>' +

    /* [레이아웃 3존] 하단 가로 = 발송 카드 ③
       ★ 안쪽 내용에 최대 폭을 둔다 — 가로 전체가 되면서 본인확인 값 칸이 모니터를 가로지르면
         읽기도 누르기도 나빠진다. 카드는 전폭, 내용은 760px. */
    '<div class="card"><div class="card-h sec-h">' + secN(3) + '<h3>발송</h3></div>' +
      '<div class="card-b" style="max-width:760px">' +
      '<div class="form-dense" style="max-width:460px">' +
      '<div class="form-dense" style="max-width:460px">' +
        /* ★ 쓸 수 있는 채널만 그린다 (2026-09-07 · 설계서 §4 A)
             전에는 준비 중 3개를 disabled 로 함께 그렸다 — 문구 규칙 9번("안 되는 기능은 버튼을 없앤다")에 어긋나고,
             고를 것이 하나뿐인데 고르는 클릭을 만들었다.
           ★ 하나뿐이면 [전달 방법] 필드 자체를 없앤다 — 선택지가 하나인 선택은 선택이 아니다.
           ⚠️ SEND_CHANNELS 배열은 그대로 둔다. 되살리려면 그 표의 future 하나만 false 로 바꾸면
             버튼도 필드도 자동으로 돌아온다(이메일은 sent_channel 에 '메일' 이 이미 있다 · 승희 9/7). */
        (openChannels.length > 1
          ? '<div class="field"><label>전달 방법</label>' +
            openChannels.map(function(c){
              return '<button class="btn ' + (r.channel === c.id ? 'pri' : 'ghost') + ' sm" style="margin:0 6px 6px 0"' +
                ' onclick="setReq(\'channel\',\'' + c.id + '\')">' + c.label + '</button>';
            }).join('') +
            (ch.hint ? '<div class="hint">' + esc(ch.hint) + '</div>' : '') +
            '</div>'
          : '') +
        /* 본인확인 값 — 처음부터 보인다(2026-09-07 게이트 제거 전에는 채널을 고른 뒤에만 나왔다).
           ★ 2026-09-03 — access_link.verify_hint 로 DB 에 남는다. 해시에 토큰을 섞어 저장하므로(유진) DB 를 통째로 봐도 남의 링크를 못 연다.
             화면에서 이 값을 확인하고 5회 틀리면 화면이 잠긴다(화면 보호 — DB 에서는 링크 주소가 곧 열쇠, README 보안 주의 참고) — 화면에는 안 쓴다(후원자 화면이 그때 말한다). */
        /* ★ 게이트 제거 (2026-09-07 · 설계서 §4 A) — 전에는 `r.channel ?` 로 감싸 채널을 고르기 전엔 이 칸이 없었다.
             기본값을 'copy' 로 바꾼 것만으로는 게이트가 남는다(값이 비면 다시 사라진다). 조건 자체를 걷는다. */
        '<div class="field"><label>본인확인 값 <span class="req">*</span></label>' +
          '<input type="text" inputmode="numeric" maxlength="4" id="req-verify4" value="' + esc(r.verifyLast4 || '') +
          '" placeholder="후원자 연락처 뒷 4자리" oninput="setReqQuiet(\'verifyLast4\',this.value,this.id)">' +
          '<div class="hint">후원자가 링크를 열 때 넣는 번호입니다. 연락처를 적으면 뒷 4자리가 자동으로 들어갑니다.</div></div>' +
        (r.channel === 'email'
          ? '<div class="field"><label>후원자 이메일 <span class="req">*</span></label><input type="text" value="' + esc(r.email) +
            '" placeholder="예: donor@example.com" id="req-email" oninput="setReqQuiet(\'email\',this.value,this.id)"></div>'
          : '') +
      '</div>' +

      /* 접수 생성은 이 버튼에서 일어난다.
         링크 만료(LINK_TTL_DAYS): 개인정보 입력 페이지가 열린 채 방치되지 않게 하는 보안 기본값. 서류 제출 마감과 무관. 기한 선택 없음.
         ★ 게이트 제거 (2026-09-07 · 설계서 §4 A) — 전에는 채널을 고른 뒤에만 나타났다. 이제 처음부터 보인다.
           누를 수 있는지는 여전히 값으로 판단한다(본인확인 값 · 이메일) — 버튼을 숨기는 대신 disabled 로 말한다. */
      /* ★ id 를 둔다 — 텍스트 칸은 화면을 다시 안 그리므로(setReqQuiet) 버튼·힌트는 refreshSendGate 가 제자리에서 갱신한다.
           9/11 실주행: 연락처를 Tab 으로 적고 본인확인 값이 채워졌는데 버튼이 잠긴 채 남았다(처음 그린 빈 값 기준). */
      '<button class="btn pri" id="req-send-btn"' + ((reqEmailOk(r) && reqVerifyOk(r)) ? '' : ' disabled') + ' onclick="sendLink()">' + (r.sent ? '재발급 (새 접수 생성)' : '접수 생성 + 링크 발급') + '</button>' +
      '<div class="hint" id="req-verify-hint" style="color:var(--warn);margin-top:6px' + (reqVerifyOk(r) ? ';display:none' : '') + '">본인확인 값을 넣어야 발급됩니다.</div>' +
      '<div class="hint" id="req-email-hint" style="color:var(--warn);margin-top:6px' + (reqEmailOk(r) ? ';display:none' : '') + '">이메일 주소를 넣거나 [링크 복사]로 바꾸세요.</div>' +
      /* ⚠️ 일수를 손으로 적지 않는다 — 9/7 에 승희가 14 → 30 으로 바꿨는데 화면은 "14일"이라고 말하고 있었다.
           같은 사실을 두 곳에 적으면 갈린다. 상수를 읽는다(db.js LINK_TTL_DAYS). */
      '<div class="hint" style="margin-top:6px">링크는 ' + LINK_TTL_DAYS + '일 뒤 만료됩니다. 만료되면 재발급합니다.</div>' +

      ((r.sent && (DB.caseSaveErr || {})[r.caseId])
        ? '<div class="banner warn mt12"><span class="bi">⚠</span><div>' +
          '<b>접수 #' + esc(r.caseId) + ' 가 저장되지 않았습니다.</b> 새로고침하면 사라집니다.<br>' +
          '<span class="small muted">' + esc(DB.caseSaveErr[r.caseId].msg) + '</span>' +
          '<div class="row mt8"><button class="btn pri sm" onclick="retrySaveCase(\'' + esc(r.caseId) + '\')">접수 다시 저장</button></div>' +
          '</div></div>'
        : '') +
      (r.sent ? '<div class="banner ok mt12"><span class="bi">✅</span><div><b>접수 #' + esc(r.caseId) + ' · 링크 발급</b><br>' + esc(r.sentAt) + '</div></div>' +
        /* 링크를 확인 게이트보다 먼저 보여준다 — 무엇을 누구에게 보냈는지 봐야 오발송인지 판단할 수 있기 때문.
           토큰이 없으면 주소 칸을 비우고 사실을 적는다 — 자리표시 주소를 복사해 보내는 사고를 막는다. */
        '<div class="field mt12"><label>접수 링크</label>' +
        '<div class="row" style="gap:8px;align-items:center">' +
        (url
          ? '<input type="text" readonly value="' + esc(url) + '" style="flex:1;min-width:200px">' +
            '<button class="btn ' + (r.copied ? 'ghost' : 'pri') + ' sm" onclick="copyLink()">' + (r.copied ? '✓ 복사됨 · 다시 복사' : '링크 복사') + '</button>'
          : '<div class="hint" style="flex:1">' + esc(LINK_LOST_MSG) + '</div>') +
        /* 본인확인·제출 후 닫힘은 **화면에서의** 보호다 — DB 는 토큰과 만료·무효만 본다(링크 주소가 곧 열쇠 · 오픈소스 점검 §1-4). 화면에는 한 줄만. */
        '</div><div class="hint">화면에서 본인확인을 거쳐야 열리고, 제출하면 닫힙니다 · 주소가 곧 열쇠이니 받을 분에게만 보내 주세요(단체 대화방 금지).</div></div>' +

        /* ★ 후원자 화면을 **실제로 열어보는 법** (2026-09-04) — 실 DB 로 열면 역할 전환 바가 없다(심사위원 방어 · 0-A).
             그때 후원자 화면으로 가는 길은 주소를 새 탭에서 여는 것 하나뿐이라, 안내가 아니라 **동선**으로 적는다.
             상대가 없는 사람(심사위원·처음 쓰는 담당자)에게는 이 한 줄이 유일한 길이다(2026-09-03 선미 · 0-A).
             오발송 취소·다음 접수 버튼(sendConfirmBlock)을 같은 배너에 붙여 발급 뒤 배너를 하나로 줄였다(9/5 문구 규칙). */
        /* ★ 2026-09-11 선미 — "후원자 화면을 직접 써 보려면…" 안내와 [다음 접수]·[테스트] 를 걷었다.
             다음 접수는 우측 상단 [＋ 신규생성] 이 이미 하고, 테스트 취소 사유는 실제 운영에서 쓸 일이 없다.
             9/3·9/4 에 이 안내를 "심사위원에게 유일한 길" 로 둔 이력이 있는데, [링크 복사] 버튼과
             "본인확인을 거쳐야 열리고…" 힌트가 그대로 남아 그 길은 살아 있다 — 설명만 뺀 것이다. */
        sendConfirmBlock(r.caseId) : '') +
    /* card-b · card 를 닫는다 — ③ 은 이제 .row 밖이라 닫는 태그가 하나 줄었다 (2026-09-11) */
    '</div></div>' +
    sendHistoryBlock();
}

/* ── 후원자 화면 미리보기 — ② 옆 칸에서 그 자리에 편다 (2026-09-11 선미) ─────────
   9/4 에 되살린 전체화면 미리보기(openPreview('donor'))를 **칸 안**으로 옮겼다.
   역할은 담당자 그대로이고, viewDonorForm(pv=true) 가 입력·버튼·제출을 전부 잠근 채 그린다(ro = pv || done).
   ⚠️ 링크를 발급하기 전에도 열린다 — viewDonorForm(pv) 가 DB.req 의 유형·경로를 읽는다.
     그래서 ① 에서 유형·경로를 바꾸면 열려 있는 미리보기가 곧바로 따라 바뀐다.

   ★ 폰 목업(.phone 검은 베젤·노치)을 여기서는 쓰지 않는다 — **실 DB 에서는 그 틀이 벗겨진다.**
     styles.css 의 `@media(min-width:601px) body:not(.demo) .phone .scr{height:auto;overflow:visible}` 가
     640px 스크롤 상자를 풀어 버려, 그대로 쓰면 신청서가 통째로 펼쳐지고 ③ 발송이 저 아래로 밀린다.
     그래서 높이는 .pv-inline 이 직접 잡는다(min(640px, 70vh)).

   ★ 폰(≤600px)에서는 인라인으로 열지 않고 전체화면으로 보낸다 — toggleSendPreview().
     실기기에서 안쪽 스크롤 상자를 두지 않는 것은 9/4 연수·9/5 선미가 이미 내린 결정이다
     (같은 이유로 위 두 미디어쿼리가 폰 목업을 벗긴다). 손가락 스크롤이 상자와 페이지 사이에서 걸린다. */
var SEND_PV_OPEN = false;
var NEW_REQ_TIP = '새로운 건을 신규접수 시 사용합니다. 클릭 시 기존 작성 내용은 비워집니다';

/* 섹션 번호 원 — 신규 접수의 ①②③ (2026-09-11 선미)
   ⚠️ aria-hidden 을 둔다 — 낭독기에는 바로 뒤 <h3> 제목만 들리면 된다.
     숫자를 따로 읽으면 "2 필요 서류" 가 아니라 "이 필요 서류" 처럼 들린다. */
function secN(n){ return '<span class="sec-n" aria-hidden="true">' + n + '</span>'; }

function isPhoneWidth(){
  try { return !!(window.matchMedia && window.matchMedia('(max-width:600px)').matches); }
  catch (e) { return false; }       /* matchMedia 가 없으면 넓은 화면으로 본다 — 인라인이 기본이다 */
}
function toggleSendPreview(){
  if (isPhoneWidth()){ openPreview('donor'); return; }   /* 폰 — 지금까지처럼 전체화면 */
  SEND_PV_OPEN = !SEND_PV_OPEN;
  render();
}
function sendPreviewPane(){
  var open = SEND_PV_OPEN && !isPhoneWidth();
  var h = '<div style="flex:1;min-width:320px">' +
    '<div class="sub-h">후원자 화면 미리보기' +
      (open ? ' <span class="tag">보기 전용</span>' : '') + '</div>' +
    '<button class="btn ghost sm" onclick="toggleSendPreview()">' +
      (open ? '✕ 미리보기 닫기' : '🔎 미리보기 열기') + '</button>';
  if (open)
    h += '<div class="pv-inline mt12">' +
      '<div class="ph-top"><div class="brand">🌱 나눔대장</div>' +
      '<div class="small" style="opacity:.9">물품기부신청서</div></div>' +
      '<div class="pv-scroll"><div class="ph-body">' + viewDonorForm(true) + '</div></div>' +
    '</div>';
  h += '<div class="hint" style="margin-top:6px">' +
    (open ? '보기만 합니다. 저장되지 않습니다.'
          : '위 서류들을 후원자가 어떤 화면에서 내는지 봅니다. 보기만 합니다.') +
    '</div></div>';
  return h;
}
/* ── 발송 이력 — 발송을 마치면 폼이 비워지므로, 발급했던 링크의 재전달·정보 재사용은 여기서 한다 ──
   이 화면에서 발급한 건(submittedVia가 '접수 링크'로 시작)만 최신순으로 보여준다. */
function sendHistoryBlock(){
  var list = DB.cases.filter(function(c){
    return String(c.submittedVia || '').indexOf('접수 링크') === 0;
  }).slice().reverse();
  if (!list.length) return '';
  return '<div class="card mt16"><div class="card-h"><h3>발송 이력</h3>' +
    '<span class="tag">' + list.length + '건</span></div><div class="card-b">' +
    list.map(function(c){
      var alive = !!c.awaitingSubmit;   /* 제출·취소 전까지만 링크가 살아있다 */
      var icon = c.state === '취소' ? '🚫' : (alive ? '🔗' : '✅');
      return '<div class="doc-row"><div class="di">' + icon + '</div><div style="flex:1"><b>#' + c.id + ' · ' + esc(c.donor) + '</b>' +
        '<small>' + esc(c.donorType) + ' × ' + esc(c.acqPath || '') + ' · ' + esc(c.state) +
        ' · 발급 ' + esc(c.inDate) +
        (c.verifyLast4 ? ' · 본인확인 ' + esc(c.verifyLast4) : '') +
        (c.donorPhone ? ' · ' + esc(c.donorPhone) : '') + '</small></div>' +
        '<div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">' +
        /* 링크 재복사는 제출 전(링크 생존)에만 — 폐기·무효 링크는 버튼 대신 사유를 보여준다 */
        (alive
          ? '<button class="btn ghost sm" onclick="copyHistLink(\'' + c.id + '\')">링크 다시 복사</button>' +
            (isRegistered(c) && DB.donorForm.linkCaseId === c.id
              ? '' : '')
          : '<span class="small muted">' + (c.state === '취소' ? '취소됨 · 링크 무효' : '제출 완료 · 링크 폐기됨') + '</span>') +
        '<button class="btn ghost sm" onclick="loadReqFrom(\'' + c.id + '\')">정보 불러오기</button>' +
        '</div></div>';
    }).join('') +
    '</div></div>';
}
/* [보완] 이메일 자동 발송 채널일 때만 주소 유효성을 요구한다(링크 복사 채널은 주소 불필요). */
function reqEmailOk(r){ return r.channel !== 'email' || /\S+@\S+\.\S+/.test(String(r.email || '')); }
/* [3중 방어 ②] 본인확인 값은 숫자 4자리 필수 — 화면에서의 보호다. DB 는 이 값을 보지 않으므로 유출 URL을 무력화하지는 못한다(무효화·재발급으로 막는다 · 오픈소스 점검 §1-4). */
function reqVerifyOk(r){ return /^\d{4}$/.test(String(r.verifyLast4 || '')); }
function sendLink(){
  var r = DB.req;
  /* ★ [직접 등록] 분기는 없앴다 (2026-09-04) — 접수는 무조건 링크로 받는다.
       그래서 본인확인 값과 링크 발급이 **예외 없이** 걸린다. 전에는 direct 가 그 둘을 건너뛰었다. */
  /* [보완] 이메일 자동 발송을 골랐으면 주소가 유효할 때만 접수를 생성한다 —
     주소 없이 "(주소 미입력)"으로 발송 시뮬레이션되던 조용한 실패를 차단. */
  if (!reqEmailOk(r)){
    DB.toast = {msg:'이메일 주소가 올바르지 않습니다. 주소를 넣거나 [링크 복사]로 바꾸세요.'};
    render(); return;
  }
  /* [3중 방어 ②] 본인확인 값 없이는 링크를 발급하지 않는다. */
  if (!reqVerifyOk(r)){
    DB.toast = {msg:'본인확인 값(연락처 뒷 4자리 숫자)을 입력해 주세요 — 화면에서 링크를 열 때 확인하는 값입니다'};
    render(); return;
  }
  DB.demo.seq++;
  /* ★ 이미 쓰인 접수번호를 피해서 뽑는다 (db.js · 2026-09-03).
       전에는 200+seq 라 페이지를 새로 열 때마다 201 부터 다시 나왔고,
       실 DB 에 남아 있는 201 과 겹쳐 '옛 건이 집히는' 자리로 갔다. */
  var id = nextCaseNo();
  var cl = autoChecklist(r.donorType, r.path, true, DB.promptProfile);
  /* 발급 즉시 후원자가 제출할 수 있는 '제출 대기'로 만든다 — 별도 등록 게이트를 두면
     담당자가 등록을 잊었을 때 후원자가 계속 막히기 때문. 오발송 대비는 취소(사유 보존)로 한다. */
  DB.cases.push({id:id, state:'제출 대기', donor:(r.donorName || '(제출 대기)'), donorType:r.donorType,
    item:'(후원자 제출 대기)', inDate:TODAY, deadline:'—', orgId:null, orgName:'',
    criteriaKey:profileCriteriaKey(DB.promptProfile),
    submittedVia:'접수 링크 ' + (r.channel === 'email' ? '메일 발송' : '발급(담당자 직접 전달)'),
    acqPath:r.path, awaitingSubmit:true,
    verifyLast4:r.verifyLast4,   /* [3중 방어 ②] 후원자가 링크 열 때 대조할 본인확인 값 */
    /* 방금 만든 건이 [내가 접수한 건만] 에서 바로 보이게 — DB 되읽기 전에도 (2026-09-10) */
    createdBy:(typeof authStaffId === 'function' ? authStaffId() : null),
    donorPhone:r.phone || '',    /* 발송 이력 [정보 불러오기] 재사용을 위해 보관 */
    donation:{itemName:'', qty:0, unitPrice:0, book:0, fair:0, arriveDate:''},
    checklist:cl});
  /* ★ DB 에 접수를 만든다 (2026-09-02) — 전에는 브라우저 메모리에만 있었다.
       여기서 c.dbId 가 생긴다. 이후의 모든 저장(배분처·완결·판정·첨부)이 이 값을 쓰므로,
       여기서 실패하면 그 건은 이후에도 아무것도 저장되지 않는다.
       그래서 실패를 접수 화면에 세워 담당자가 바로 알게 한다. */
  var newCase = DB.cases[DB.cases.length - 1];
  createDonation(newCase).then(function(res){
    if (res && res.demo) return;
    /* ★ 받을 서류 목록도 여기서 남긴다 (2026-09-03 유진 · 연수 실주행 발견)
         전에는 이 목록이 브라우저 메모리에만 있었다. 그래서 후원자가 **다른 기기로**
         링크를 열면 업로드 칸이 0개였고, 그대로 제출하면 첨부 0건으로 넘어갔다.
         화면은 멀쩡해 보인다 — 조용한 실패다. */
    return saveChecklist(newCase);
  }).then(function(){
    /* ★ 접수 링크를 발급한다 (2026-09-03 · B안). 주소에 들어가는 것은 토큰 하나뿐이다.
         ★ 예외가 없다 (2026-09-04) — 모든 건이 링크를 받는다.
       ⚠️ 토큰은 여기서 한 번만 돌려받는다. DB 엔 해시만 남아 다시 못 꺼낸다.
         화면이 잃으면 재발급이 정답이다(유출 대비로 그렇게 설계됐다). */
    /* ✅ channel 을 다시 보낸다 (2026-09-07 승희).
         9/3 에는 DB 가 '문자'|'유선 안내'|'직접 전달' 셋만 받아 400 이 나서 뺐었다.
         지금은 db.js linkChannel() 이 경계에서 분류로 바꾸고('link'→'직접 전달' · 'email'→'메일'),
         허용값에 '메일' 도 들어갔다(patch-20260907-sent-channel-mail.sql). 모르는 값은 db.js 가 비운다. */
    return issueAccessLink(newCase, {purpose:'intake', verifyLast4:r.verifyLast4, channel:r.channel})
      .then(function(res){ if (res && res.token) newCase.linkToken = res.token; });
  }).then(function(){
    /* ★ id 가 아니라 newCase.id — 저장 중 접수번호가 바뀔 수 있다(db.js renumberCase · 2026-09-11) */
    DB.caseSaveErr = DB.caseSaveErr || {}; delete DB.caseSaveErr[newCase.id];
    render();
  }).catch(function(err){
    DB.caseSaveErr = DB.caseSaveErr || {};
    DB.caseSaveErr[newCase.id] = {msg:(err && err.message) || String(err), fields:null};
    /* 어디까지 갔는지로 문구가 갈린다 — 건 자체가 없는 것과 목록만 없는 것은 다른 사고다. */
    DB.toast = newCase.dbId
      ? {msg:'⚠️ 접수 #' + newCase.id + ' 의 받을 서류 목록이 저장되지 않았습니다',
         cap:'후원자가 다른 기기에서 링크를 열면 업로드 칸이 비어 있습니다. 아래 [접수 다시 저장]을 눌러 주세요'}
      : {msg:'⚠️ 접수 #' + newCase.id + ' 가 저장되지 않았습니다 — 화면에만 있습니다',
         cap:'이 건은 배분·완결·판정도 저장되지 않습니다. 아래 [접수 다시 저장]을 눌러 주세요'};
    render();
  });

  DB.demo.subs[id] = '링크 발급됨 — 후원자가 바로 작성할 수 있습니다 (오발송이면 취소)';
  r.sent = true; r.sentAt = TODAY;   /* 배너 제목이 '링크 발급' 이라 꼬리표는 뺐다(문구 규칙 9/5) */ r.caseId = id; r.copied = false; r.loadedFrom = null;
  /* 후원자 폼을 이 건에 바인딩 — 유형·경로는 잠긴다 */
  DB.donorForm = {donorType:r.donorType, donorName:r.donorName || '', bizNo:(r.donorType === '법인' ? '220-81-45012' : ''),
    path:r.path, itemName:'', qty:'', expiry:'', arriveDate:'', book:'',
    wantsReceipt:true, sponsorKind:'일반 기부(물품)', privacy:false, files:[], signed:false,
    pkg:'', under14:false, guardian:false,           /* 정본 포장단위 · 팀3 법정대리인 — 리셋 시 유실 방지 */
    verified:false, verifyInput:'', verifyTries:0,   /* [3중 방어 ②] 링크마다 새로 본인확인 */
    submittedId:null, linkCaseId:id};
  render();
}

/* ── 오발송 대비 ────────────────────────
   발급 즉시 후원자가 제출할 수 있다 — 별도 등록 게이트를 두면 담당자가 잊었을 때
   후원자가 계속 막히기 때문에 게이트를 없앴다. 오발송·중복·테스트는 취소로 처리하고,
   취소 건은 삭제하지 않고 '취소' 상태로 남겨 감사 이력에 표시한다.
   후원자 제출 후에도 완결 전까지는 건 상세에서 취소할 수 있다. */
function isRegistered(c){ return !!c && c.state !== '취소'; }
/* 발송 폼 비우기 — 이 건의 발송이 끝났으므로 다음 접수에 이전 후원자 정보가 남지 않게 한다.
   발급한 링크의 재복사·정보 재사용은 [발송 이력]에서 한다. */
function resetReqForm(){
  var r = DB.req;
  r.donorName = ''; r.phone = ''; r.verifyLast4 = ''; r.email = '';
  r.sent = false; r.sentAt = ''; r.caseId = null; r.copied = false; r.loadedFrom = null;
}
function startNewReq(){
  var id = DB.req.caseId;
  resetReqForm();
  DB.toast = {msg: id
    ? '#' + id + ' 발송을 마쳤습니다. 링크는 [발송 이력]에서 다시 복사할 수 있습니다.'
    : '폼을 비웠습니다.'};
  render();
}
/* 발급된 링크 또는 [정보 불러오기]로 채운 폼을 남겨둔 채 다른 화면으로 이동하면 자동으로 비운다 —
   링크·정보는 [발송 이력]에 남아 있으므로 잃는 것이 없고, 다음 접수는 빈 폼에서 시작된다.
   (담당자가 직접 타이핑하던 미발급 초안은 지우지 않는다 — 작성 중 이탈로 입력이 날아가면 안 되므로) */
function leaveSendReset(){
  if (DB.screen === 'send' && (DB.req.sent || DB.req.loadedFrom)) resetReqForm();
}
function cancelCase(caseId){
  if (writeBlocked()) return;
  var c = getCase(caseId);
  if (!c || c.state === '취소' || c.state === '완결' || c.cancelling) return;   /* 완결 건은 취소하지 않는다 */
  var before = {state:c.state, awaitingSubmit:c.awaitingSubmit, sub:DB.demo.subs[caseId]};   /* 실패하면 이대로 되돌린다 */
  c.state = '취소'; c.cancelDate = TODAY; c.awaitingSubmit = false;   /* 사유는 받지 않는다 — cancelReasonButtons 주석 */
  DB.demo.subs[caseId] = '접수 취소됨';
  /* ★ 메모리만 바꾸면 취소가 아니다 (2026-09-13 · #323 유진 실주행) — 오발송으로 취소한 링크를
       후원자가 그대로 열어 제출했고 접수됐다. DB 의 건은 '제출 대기' 그대로였고 링크도 살아 있었다.
       후원자 브라우저는 DB 를 읽으므로 담당자 화면의 '취소' 를 알 길이 없다.
       새로고침하면 담당자 쪽에서도 취소가 사라졌을 것이다(같은 뿌리 · 9/12 awaitingSubmit 과 같은 모양).
     둘 다 DB 에 남긴다 — ① 살아 있는 접수 링크 무효화(enterByLinkToken 이 잠근다)
                       ② 건 상태 '취소'(submitDonor 가 막는다 · 되읽어도 취소로 선다)
     ⚠️ 실패는 감추지 않는다. "취소했다" 고 믿는데 링크가 살아 있는 것이 제일 나쁜 모양이다.
       실패하면 화면 상태를 되돌려 담당자가 다시 누를 수 있게 한다. */
  c.cancelling = true;
  DB.toast = {msg:'#' + caseId + ' 접수를 취소하는 중…'};
  render();
  var K = COL.accessLink;
  loadAccessLinks(c).then(function(rows){
    var alive = (rows || []).filter(function(r){ return r[K.purpose] === 'intake' && accessLinkState(r) === 'ok'; });
    return Promise.all(alive.map(function(r){ return revokeAccessLink(r[K.id]); }));
  }).then(function(){
    return saveDonationFields(c, {state:'취소'});
  }).then(function(){
    c.cancelling = false;
    DB.toast = {msg:'#' + caseId + ' 접수를 취소했습니다', auto:true};
    render();
  }).catch(function(err){
    c.cancelling = false;
    c.state = before.state; c.awaitingSubmit = before.awaitingSubmit; delete c.cancelDate;
    if (before.sub === undefined) delete DB.demo.subs[caseId]; else DB.demo.subs[caseId] = before.sub;
    DB.toast = {msg:'#' + caseId + ' 취소하지 못했습니다 — 링크가 아직 살아 있을 수 있습니다',
                cap:(err && err.message) || String(err)};
    render();
  });
}
function cancelReasonButtons(caseId){
  /* '테스트' 는 뺐다 (2026-09-11 선미) — 실제 운영 화면이고, 테스트 건은 취소해도 감사 이력에 남는다.
     ★ [오발송]·[중복접수] 를 [접수 취소] 하나로 합쳤다 (2026-09-13 선미 결정) —
       둘은 사유 글자만 다르고 하는 일이 같았다(건 '취소' + 링크 무효화). 그 사유는 donation 에
       남길 칸이 없어 화면에만 잠깐 보였다. **남지 않는 것을 고르게 하지 않는다.**
       사유를 남겨야 할 때가 오면 칸부터 만든다 — 버튼을 먼저 늘리지 않는다. */
  return '<button class="btn danger sm" onclick="cancelCase(\'' + caseId + '\')">접수 취소</button>';
}
function sendConfirmBlock(caseId){
  var c = getCase(caseId);
  if (!c) return '';
  if (c.state === '취소'){
    return '<div class="banner dg mt12"><span class="bi">🚫</span><div><b>접수 취소</b><br>' +
      '후원건으로 등록되지 않았습니다. 감사 이력에는 남습니다.</div></div>';
  }
  if (c.awaitingSubmit){
    /* 발급 즉시 후원자가 쓸 수 있다 — 별도 등록 게이트 없음. 오발송·중복·테스트는 취소로(삭제가 아니라 '취소' 상태로 남는다). */
    return '<div class="row mt8" style="gap:8px;flex-wrap:wrap;align-items:center">' +
      '<span class="small muted">잘못 보냈으면 취소 →</span>' + cancelReasonButtons(c.id) +
      '</div>';
  }
  return '<div class="banner ok mt12"><span class="bi">✅</span><div><b>후원자가 제출했습니다.</b> 검수 화면에서 확인합니다.</div></div>';
}

/* ── 7. 후원건 목록 ── */
/* 기한까지 남은 일수 — 순수 함수 (음수 = 경과).
   ★ 지금 부르는 곳이 없다 (2026-09-05 · 기한을 화면에서 뺐다).
     지우지 않고 남긴다 — 업무지침에서 서류 제출 마감 규정이 확인되면 그대로 다시 쓴다.
     DB 컬럼(donation.deadline · checklist_item.due_date)도 같은 이유로 남아 있다. */
function daysUntil(dateStr, todayStr){
  if (!dateStr) return null;
  var a = new Date(todayStr + 'T00:00:00'), b = new Date(dateStr + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}
function setListFilter(v){ DB.listFilter = v; render(); }
function setListSort(v){ DB.listSort = v; render(); }
/* [내가 접수한 건만] (2026-09-10 선미) — 화면 필터다. 권한은 그대로 원장 전체.
   ★ 검색처럼 **구간을 가로지른다** — 먼저 걸러 놓고 흐름 바가 그 분포를 센다.
   ⚠️ 로그인해서 staff 행이 있을 때만 그린다 — 데모·anon 에는 '나' 가 없다. */
function toggleListMine(){ DB.listMine = !DB.listMine; render(); }
function listMineId(){ return (typeof authStaffId === 'function') ? authStaffId() : null; }
function viewList(){
  /* 전체 건 판정 1회 계산 → 상태별 분리·집계 (취소는 검수 대상서 제외) */
  var vlist = DB.cases.map(caseView);
  var cancelled = vlist.filter(function(x){ return x.c.state === '취소'; });
  var active    = vlist.filter(function(x){ return isRegistered(x.c); });
  /* ★ 세는 것도 거르는 것도 CASE_FILTERS 하나를 쓴다 — 홈 카운터와 같은 표다.
       갈리면 "홈은 2건이라는데 목록엔 1건" 이 난다 (2026-09-05). */
  var filter = caseFilter(DB.listFilter || 'all');
  var sortKey = DB.listSort || 'oldest';
  var keep = filter.test;
  /* ★ 검색은 **구간을 가로지른다** — 먼저 걸러 놓고 구간별로 센다.
       구간 안에서만 찾으면, 다른 구간에 있는 건을 쳤을 때 "없습니다" 가 뜬다.
       담당자는 건이 없는 줄 안다 — 오늘 아침에 잡은 '숫자가 안 맞는다' 와 같은 거짓말이다.
       가로지르면 흐름 바가 그대로 답이 된다: 어느 구간에 몇 건인지 한눈에 보인다. */
  var q = normQuery(DB.listQuery);
  var foundAll = active.filter(function(x){ return caseMatches(x, q); });
  /* [내가 접수한 건만] — 검색 다음, 구간 세기 전에 건다 (toggleListMine 주석) */
  var me = listMineId();
  var mineOn = !!(DB.listMine && me);
  var found = mineOn ? foundAll.filter(function(x){ return x.c.createdBy === me; }) : foundAll;
  /* ★ '기한 임박순' 도 '급한 순' 도 없앴다 (2026-09-05 선미).
       기한: deadline 은 값을 넣는 코드가 없어 실서비스 건은 전부 '—' 였다 — 정렬한다면서 안 했다.
       급한 순: 기준을 이름이 말하지 못했다("무슨 기준이지?"). 지금은 **탭이 흐름을 말하므로**
         탭 안에서는 날짜 하나면 된다. 오래 밀린 것부터가 기본이다. */
  var sortFn = function(a, b){
    return (sortKey === 'newest')
      ? (a.c.inDate < b.c.inDate ? 1 : -1)            /* 최신순 */
      : (a.c.inDate < b.c.inDate ? -1 : 1);           /* 오래된 순 — 기본 */
  };
  /* ★ 배분 확정/배분 전 으로 가르던 두 갈래는 없앴다 (2026-09-05) — 표가 하나다 */
  var shown = found.filter(keep).sort(sortFn);

  var rows = function(list){
    return list.length ? list.map(function(x){
      var c = x.c, r = x.r;
      /* 판정 칸 = **알약 하나 + 글 한 줄** (2026-09-05).
         전에는 한 행에 알약이 최대 다섯이었다(판정 3 · 기한 1 · 방금 접수됨 1).
         배지는 흐름 3단계로 줄이고, 무엇이 남았는지는 stageDetail 이 한 줄로 말한다. */
      var detail = stageDetail(c, r);
      var remain = detail ? '<div class="tb-sub">' + esc(detail) + '</div>' : '';
      /* ★ 행 전체를 누른다 (2026-09-05) — 홈 표는 행 클릭인데 목록만 버튼이었다.
           같은 데이터·같은 목적지인데 조작법이 달랐다. 버튼 칸을 지워 7칸 → 6칸. */
      return '<tr onclick="go(\'case\',\'' + c.id + '\')" style="cursor:pointer">' +
        '<td class="tb-item">#' + c.id + '</td><td><b>' + esc(c.item) + '</b>' +
        (c.isNew ? '<div class="tb-sub">방금 접수됨</div>' : '') +
        /* ★ 데모 설명 문구는 **데모에서만** (2026-09-05 선미) — isDemoMode() 게이트가 없었다.
             DB.demo.subs 의 키가 '101'·'103'·'107' 인데 **실 DB 에 case_no='101' 이 있다**(db.js:468 주석).
             그래서 실서비스 목록의 #101 물품 아래에 "전 항목 수취완료 — 완결 판정 시연" 이 찍혔다.
             신규 발번은 201부터라(nextCaseNo) 새로 만든 건은 원래 안전했고, 기존 건만 위험했다. */
        demoOnly('<div class="tb-sub">' + esc(DB.demo.subs[c.id] || '') + '</div>') + '</td>' +
        '<td>' + esc(c.donor) + '<div class="tb-sub">' + esc(c.donorType) + '</div></td>' +
        '<td>' + esc(orgLabel(c) || '—') + '</td>' +
        '<td>' + esc(c.inDate) + '</td>' +
        (showDone ? '<td>' + (c.completedAt
            ? '<b>' + esc(String(c.completedAt).slice(0, 10)) + '</b>'
            : '<span class="muted">—</span>') + '</td>' : '') +
        '<td>' + stagePill(c, r) + remain + '</td></tr>';
    }).join('') : '<tr><td colspan="' + nCols + '" class="muted" style="text-align:center;padding:24px">' + esc(emptyMsg) + '</td></tr>';
  };
  /* ★ 완결일은 완결 구간에서만 칸으로 세운다 (2026-09-08 선미 요청).
       판정 밑의 회색 한 줄로 흘리지 않는다 — 칸이면 정렬도 되고 **비어 있는 것도 드러난다.**
     ⚠️ 9/8 이전 완결 건은 completed_at 이 비어 있다(그때는 저장하는 코드가 없었다).
       지어내지 않고 '—' 로 둔다 — updated_at 을 옮겨 적으면 완결 시각이 아닌 것을 그렇게 적는 것이다. */
  /* ★ 빈 결과가 거짓말하지 않게 — 다른 구간에 있으면 그렇다고 말한다.
       "해당 내역이 없습니다" 만 띄우면 담당자는 그 건이 없는 줄 안다. */
  var emptyMsg = (mineOn && !found.length)
    ? '내가 접수한 건이 없습니다 — 전체 ' + foundAll.length + '건'
    : !q ? '해당 내역이 없습니다'
    : (found.length ? '이 구간에는 없습니다 — 다른 구간에 ' + found.length + '건 있습니다'
                    : '\u201c' + (DB.listQuery || '').trim() + '\u201d 로 찾은 건이 없습니다');
  var showDone = filter.id === 'done';
  var head = '<thead><tr><th>번호</th><th>물품</th><th>후원자</th><th>배분처</th><th>접수일</th>' +
    (showDone ? '<th>완결일</th>' : '') + '<th>판정</th></tr></thead>';
  var nCols = showDone ? 7 : 6;

  /* 흐름 바 + 합계 + 정렬 — 세는 것은 여전히 CASE_FILTERS 하나다 (홈 카운터와 같은 표) */
  var arrow = '<div class="fb-a"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></div>';
  var steps = stageFilters();
  var flow = '<div class="flowbar mb16">' + steps.map(function(f, i){
    return '<button class="fb ' + (filter.id === f.id ? 'on' : '') + '" onclick="setListFilter(\'' + f.id + '\')">' +
      '<span class="fb-t"><span class="fb-n">' + esc(f.step) + '</span>' +
      '<span class="fb-name">' + esc(f.label) + '</span></span>' +
      '<span class="fb-v"><span class="fb-c">' + found.filter(f.test).length + '</span>' +
      '<span class="fb-u">건</span></span></button>' + (i < steps.length - 1 ? arrow : '');
  }).join('') +
    /* ★ 합계를 흐름 바 안 오른쪽 끝에 붙인다 (2026-09-08 선미 — "너무 동떨어져 있다").
         전에는 아래 툴바에 따로 떠 있어서 **세 구간을 더한 값이라는 게 안 보였다.**
         구간과 같은 줄에 두되 선으로 갈라, 넷째 구간처럼 읽히지는 않게 한다. */
    '<div class="fb-sum"><button class="total-chip ' + (filter.id === 'all' ? 'on' : '') +
      '" onclick="setListFilter(\'all\')">' +
      '<span class="tl">전체</span><span class="tn">' + found.length + '</span>' +
      '<span class="tu">건</span></button></div>' +
    '</div>';
  /* ⚠️ oninput 이 없다 — 타이핑 중에는 화면을 다시 그리지 않는다(runListSearch 주석) */
  /* 칸과 [찾기] 는 한 덩어리다 — 떨어져 있으면 그 버튼이 무엇을 찾는지 안 보인다 */
  var searchBox = '<div class="lsearch-group">' +
    '<div class="lsearch">' +
    '<span class="li"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></span>' +
    '<input id="listSearch" type="text" autocomplete="off" placeholder="건번호 · 물품 · 후원자 · 배분처" ' +
      'value="' + esc(DB.listQuery || '') + '" onkeydown="listSearchKey(event)">' +
    (q ? '<button class="lx" onclick="clearListQuery()" title="지우기">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" ' +
      'stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg></button>' : '') +
    '</div>' +
    '<button class="lgo" onclick="runListSearch()">찾기</button></div>';
  /* [내가 접수한 건만] — 로그인한 담당자에게만. 켜지면 흐름 바 숫자도 내 건 분포로 바뀐다 */
  var mineBtn = me ? '<button class="lmine' + (mineOn ? ' on' : '') + '" onclick="toggleListMine()" ' +
      'aria-pressed="' + (mineOn ? 'true' : 'false') + '">' +
      '<span class="lm-dot"></span>내가 접수한 건만</button>' : '';
  var toolbar = '<div class="row mb16" style="justify-content:space-between;align-items:center;gap:10px">' +
    searchBox + mineBtn +
    '<div class="seg">' +
      '<button class="' + (sortKey !== 'newest' ? 'on' : '') + '" onclick="setListSort(\'oldest\')">오래된 순</button>' +
      '<button class="' + (sortKey === 'newest' ? 'on' : '') + '" onclick="setListSort(\'newest\')">최신순</button>' +
    '</div></div>';

  /* 취소됨 — 삭제하지 않고 감사 이력으로 남긴다 (사유는 안 받는다 · cancelReasonButtons) */
  var cancelledCard = cancelled.length ? '<div class="card mt16">' +
    '<div class="card-h"><h3>취소됨</h3><span class="tag">' + cancelled.length + '건</span></div>' +
    '<div class="card-b">' + cancelled.map(function(x){ var c = x.c;
      return '<div class="doc-row"><div class="di">🚫</div><div style="flex:1"><b class="muted">#' + c.id + ' · ' + esc(c.donor) + '</b>' +
        '<small>' + (c.cancelDate ? '취소 ' + esc(c.cancelDate) : '취소됨') + '</small></div>' +
        '<span class="pill neu"><span class="pd"></span>취소</span></div>';
    }).join('') + '</div></div>' : '';

  /* ★ 표 하나로 합쳤다 (2026-09-05 선미) — 전에는 '배분 확정' / '배분 전' 두 표에
       **같은 필터·같은 정렬이 각각** 걸렸다. 그래서
         · 필터를 걸면 한쪽이 "해당 내역이 없습니다" 빈 카드로 남고
         · '기한 임박순' 인데 두 표가 **각자** 임박순이라 제일 급한 건이 한눈에 안 보였다.
       배분 여부는 [배분처] 칸이 이미 말한다(미배정이면 '—'). */
  return '<div class="page-head"><h2>후원 목록</h2></div>' + flow + toolbar +
    '<div class="card"><div class="card-h"><h3>' + esc(filter.label) + '</h3>' +
    '<span class="tag">' + shown.length + '건</span></div>' +
    '<table>' + head + '<tbody>' + rows(shown) + '</tbody></table></div>' + cancelledCard;
}

/* ── 검수 규칙의 근거 패널 (표시 전용) ──────────────────────────
   "왜 하필 이 6종인가"에 화면에서 답한다. 재단 실측 검수 기록과 실서류 검증 결과 그대로. */
function aiEvidenceBlock(){
  var e = AI_EVIDENCE;
  return '<div class="card mb16"><div class="card-h"><h3>이 검수 규칙은 어디서 나왔나</h3>' +
    '<span class="tag">재단 실측 검수 기록 · 실서류 검증</span></div><div class="card-b">' +
    '<div class="doc-row"><div class="di">📚</div><div style="flex:1">' +
    '<b>재단 실측 검수 ' + esc(e.reviewed) + '건 · 그중 오류 지적 ' + esc(e.flagged) + '건</b>' +
    '<small>' + esc(e.flagged) + '건을 유형으로 묶어, AI가 판단 가능한 오류 ' + esc(e.errorTypes) +
    '종만 검수 대상으로 채택했습니다 — 나머지는 담당자 판단 영역으로 남겼습니다.</small>' +
    '</div></div>' +
    '<div class="doc-row"><div class="di">🧪</div><div style="flex:1">' +
    '<b>실서류 ' + esc(e.docs) + '건 검증 — AI 단독 1차 판정 오탐 ' + esc(e.falsePositive) + '건 → ' +
    '실무 규칙 결합 후 ' + esc(e.afterRules) + ' 정확</b>' +
    '<small>놓친 진짜 오류(미탐) ' + esc(e.missed) + '건. 오탐을 없앤 것은 더 좋은 모델이 아니라 ' +
    '현장에서 쌓인 실무 예외 규칙이었습니다.</small>' +
    '</div></div>' +
    '</div></div>';
}
/* ── AI 확인 범위 상시 표시 (표시 전용) ─────────────────────────
   AI가 정확할수록 사람이 덜 보게 된다. 무엇을 안 봤는지를 화면에 늘 남겨 자동화 편향을 막는다. */
function aiScopeBlock(){
  var s = AI_SCOPE;
  return '<div class="banner warn mb16"><span class="bi">🔍</span><div>' +
    '<b>AI가 확인한 범위 — 재단 검수 세부유형 ' + esc(s.total) + '개 중 ' + esc(s.covered) +
    '개(' + esc(s.pct) + '%)</b><br>' +
    '나머지 ' + esc(s.blind) + '개는 담당자가 직접 확인해야 합니다 — AI가 정확할수록 사람이 덜 보게 되므로 ' +
    '이 구분을 화면에 늘 남깁니다.</div></div>';
}
/* 완결 직후 요약 (표시 전용) — 무엇으로 완결됐고 무엇이 확인되지 않은 채 남았는지 한 번 더 적는다 */
function completedSummary(c, res){
  /* AI 확인 범위(재단 검수 세부유형 AI_SCOPE.total 중 covered · 나머지는 담당자 직접 확인으로 기록)와
     "사유해소는 감사 이력에 그대로 남는다" 는 화면에서 뺐다(문구 규칙 9/5) — 아래 🔍 배너와 대조 판정 카드가 이미 말한다.
     완결 다음 행동은 "서류를 받아 기존 시스템에 올리기" 다 — 그 자리에 버튼을 둔다. ZIP 은 개인정보 반출이라 감사 로그에 남는다. */
  /* "N항목 중 M항목 확인" · AI_BLIND_NOTE · "받은 기록이 감사 로그에 남습니다" 세 줄은 뺐다 (선미 9/10) —
     감사 로그 기록 자체는 downloadCaseZip 이 그대로 남긴다. */
  return '<div class="banner ok mb16"><span class="bi">✅</span><div>' +
    '<b>#' + esc(c.id) + ' 완결</b>' +
    (c.completedAt ? '<div class="small mt8">완결 ' + esc(String(c.completedAt).slice(0, 10)) + '</div>' : '') +
    '</div></div>';
}
/* [서류 일괄 받기 (ZIP)] — [완결 처리] 옆 한 자리 (2026-09-12 선미). 완결 전에는 잠금 + 툴팁 */
var ZIP_LOCK_TIP = '완결 처리 후에 서류를 다운로드 받을 수 있습니다';
function zipButton(c){
  var done = c.state === '완결', busy = DB.zipBusy === c.id;
  if (!done){
    return '<span class="tip" data-tip="' + esc(ZIP_LOCK_TIP) + '" tabindex="0" aria-label="' + esc(ZIP_LOCK_TIP) + '">' +
      '<button class="btn ghost" disabled>서류 일괄 받기 (ZIP)</button></span>';
  }
  return '<button class="btn ghost"' + (busy ? ' disabled' : '') + ' onclick="downloadCaseZip(\'' + c.id + '\')">' +
    (busy ? '서류를 모으는 중…' : '서류 일괄 받기 (ZIP)') + '</button>';
}
/* ── 서류 일괄 받기 (ZIP) ────────────────────────────────────
   묶는 일 자체는 db.js buildCaseZip(c) 이 한다 (유진 2026-09-01).
   여기서는 누르는 자리와 결과 알림만 맡는다.

   ★ 실패하면 파일을 주지 않는다 — 일부만 든 ZIP 은 "다 받았다"는 착각을 만들고,
     담당자가 그대로 기존 시스템에 올리면 빠진 서류를 아무도 모른 채 넘어간다.
     그래서 무엇이 왜 안 됐는지를 그대로 띄운다(사유를 요약하지 않는다).
   ★ 감사 로그를 못 남기면 buildCaseZip 쪽에서 이미 중단한다 —
     반출은 됐는데 기록만 없는 상태가 제일 나쁘기 때문이다. */
function downloadCaseZip(caseId){
  if (writeBlocked()) return;          /* 미리보기 모드 — 감사 로그를 쓰므로 실행하지 않는다 */
  if (DB.zipBusy) return;              /* 두 번 눌러 두 벌 받는 것을 막는다 */
  var c = getCase(caseId);
  if (!c) return;

  DB.zipBusy = caseId; render();
  buildCaseZip(c).then(function(r){
    DB.zipBusy = null;
    if (!r || !r.ok){
      DB.toast = {msg:'서류를 묶지 못해 받지 않았습니다',
                  cap:(r && r.reason) || '알 수 없는 오류'};
      render(); return;
    }
    saveBytesAsFile(r.name, r.bytes);
    DB.toast = {msg:r.name + ' 내려받았습니다',
                cap:'서류 ' + r.entries.length + '건 · 감사 로그에 남았습니다'};
    render();
  }).catch(function(err){
    DB.zipBusy = null;
    DB.toast = {msg:'서류를 묶지 못해 받지 않았습니다',
                cap:String((err && err.message) || err)};
    render();
  });
}
/* ── 신청서 PDF 열기 — 개인정보 열람 (2026-09-04 선미) ────────────
   ★ 순서가 곧 약속이다: 기록(pdf.view) → 주소 발급 → 뷰어.
     기록이 안 남으면 열지 않는다(bulk.download 와 같다). 주소는 열 때마다 새로 받는다 —
     그래서 열 때마다 기록이 한 줄씩 남는다. 주소는 10분 뒤 만료(sbSignedUrl 기본).
   데모(DB 미연결): 제출 때 메모리에 둔 c.formPdf 를 그 자리에서 연다 — 기록할 DB 가 없다. */
function openFormPdf(caseId, fid){
  var c = getCase(caseId);
  if (!c) return;
  if (!sbReady()){
    var wantRc = !!(fid && String(fid).indexOf('fprdemo') === 0);          /* 인수증 데모 (2026-09-05) */
    var src = wantRc ? c.orgReceiptPdf : c.formPdf;
    if (!src){
      DB.toast = {msg:(wantRc ? '인수증' : '신청서') + ' PDF 가 없습니다', cap:'데모 데이터이거나 이 브라우저에서 제출되지 않은 건입니다'};
      renderToast(); return;
    }
    var did = (wantRc ? 'fprdemo' : 'fpdemo') + c.id;
    if (!FILES[did]) FILES[did] = {id:did, name:src.name, type:'application/pdf', size:src.bytes.length,
                                   demo:false, formPdf:true, blob:new Blob([src.bytes], {type:'application/pdf'})};
    openViewer([did], 0, c.id, null);
    return;
  }
  var m = FILES[fid];
  if (!m || !m.formPdf || !m.storageKey){
    DB.toast = {msg:'신청서 PDF 를 찾을 수 없습니다', cap:'새로고침 후 다시 시도해 주세요'}; renderToast(); return;
  }
  DB.pdfBusy = fid; render();
  var logged = false;
  logPdfView(c, m)
    .then(function(){ logged = true; return sbSignedUrl(m.storageKey, 600); })
    .then(function(u){
      m.url = u; m.urlExpiresAt = Date.now() + 600 * 1000;
      DB.pdfBusy = null;
      openViewer([fid], 0, c.id, null);
    })
    .catch(function(err){
      DB.pdfBusy = null;
      DB.toast = logged
        ? {msg:'신청서 PDF 주소를 받지 못했습니다', cap:String((err && err.message) || err)}
        : {msg:'열람 기록을 남기지 못해 열지 않았습니다', cap:String((err && err.message) || err)};
      render();
    });
}
/* [S] 신청서 항목·신청서 원문 팝업에 놓는 버튼 — 제출본 PDF 가 여러 장이면(재제출) 전부 보여 준다 */
/* kind (2026-09-05): 'application'(기본) = 신청서 PDF · 'receipt' = 인수증 PDF(배분처별 · distId 로 좁힌다).
   ⚠️ 갈래를 나눈 이유 — 인수증 PDF 가 있다고 "신청서 원본 없음" 경고가 꺼지면 안 된다. 서로 다른 개인정보다.
   quiet: 없을 때 경고 대신 빈 문자열(인수증이 아직 제출되지 않은 카드에서 쓴다). */
function formPdfButtonsHtml(c, kind, distId, quiet){
  if (!c) return '';
  kind = kind || 'application';
  var isReceipt = (kind === 'receipt');
  var isRcMeta = function(m){ return /인수증/.test(String((m && m.formType) || '')); };
  var btn = function(fid, label){
    return '<button class="btn soft sm"' + (DB.pdfBusy === fid ? ' disabled' : '') +
      ' onclick="openFormPdf(\'' + esc(c.id) + '\',\'' + esc(fid) + '\')">' + (DB.pdfBusy === fid ? '기록 중…' : '📄 ' + label) + '</button>';
  };
  if (!sbReady()){
    if (isReceipt) return c.orgReceiptPdf ? btn('fprdemo' + c.id, '인수증 PDF 열기') + '<span class="small muted">이 브라우저에서 제출한 PDF · 열람 기록 없음</span>' : '';
    return c.formPdf ? btn('fpdemo' + c.id, '신청서 PDF 열기') + '<span class="small muted">이 브라우저에서 제출한 PDF · 열람 기록 없음</span>' : '';
  }
  var ids = (c.formPdfIds || []).filter(function(fid){
    var m = FILES[fid] || {};
    if (isRcMeta(m) !== isReceipt) return false;
    if (isReceipt && distId && m.distId && String(m.distId) !== String(distId)) return false;
    return true;
  });
  if (isReceipt && !ids.length){
    if (quiet) return '';
    /* PDF 기능 이전 제출이거나 제출 때 만들어지지 않은 것 — 담당자가 대신 만들 수 없다(값이 기관 브라우저에만 있었다). 재제출뿐. */
    return '<div class="banner warn" style="flex:1 1 100%"><span class="bi">⚠️</span><div>' +
      '<b>인수증 PDF가 없습니다. 담당자명·서명이 어디에도 저장되지 않았습니다.</b><br>' +
      '<span class="small">기관에 재제출을 요청하세요.</span>' +
      '</div></div>';
  }
  /* ★ 2026-09-04 — 회색 글씨였던 것을 경고로 올렸다.
       이 한 줄이 **담당자에게 실제로 가는 유일한 신호**다. 후원자 브라우저의 pending·caseSaveErr 는
       다른 컴퓨터라 담당자에게 못 간다. 그런데 뜻은 "이 건의 이름·주민번호·서명이 어디에도 없다" 이다 —
       회색 글씨로 할 말이 아니다. 방어⑱ · (미공개 내부 기록) */
  /* PDF 기능 이전 제출이거나 제출 때 만들어지지 않은 것 — 담당자가 대신 만들 수 없다(값이 후원자 브라우저에만 있었다). 재제출뿐. */
  if (!ids.length) return '<div class="banner warn" style="flex:1 1 100%"><span class="bi">⚠️</span><div>' +
    '<b>신청서 PDF가 없습니다. 이 건의 개인정보·서명이 어디에도 저장되지 않았습니다.</b><br>' +
    '<span class="small">후원자에게 재제출을 요청하세요.</span>' +
    '</div></div>';
  var word = isReceipt ? '인수증 PDF' : '신청서 PDF';
  /* ★ 최신 한 장만 펴 두고 나머지는 접는다 (2026-09-12 선미 · #315).
       왜 여러 장이 생기나 — 제출 저장이 **부분 실패**하면(예: 매입세액공제 400) 건 내용은 안 들어갔지만
       제출본·PDF 는 이미 성공한 뒤다. 후원자는 안내대로 [제출하기] 를 다시 누르고, 누를 때마다
       form_submission 한 줄 + PDF 한 장이 더 붙는다. #315 는 그렇게 6장이 됐다(13:07×3·13:09·13:11·13:18).
     ★ 지우지 않는다 — 제출본은 '그때 낸 그대로' 라 감사 흔적이고, 어느 장이 진짜였는지는
       담당자만 안다. 화면에서 **최신을 앞에 세우고** 나머지를 접을 뿐이다.
     ⚠️ 목록은 submitted_at 오름차순이므로(loadFormPdfs) 마지막이 최신이다. */
  var lineOf = function(fid){
    var m = FILES[fid] || {};
    var when = fmtKst(m.submittedAt);   /* 한국 시간 — DB 는 UTC 다 (2026-09-12 · #315) */
    return {fid:fid, when:when};
  };
  var rows = ids.map(lineOf);
  var last = rows[rows.length - 1];
  var head = btn(last.fid, word + ' 열기' + (last.when ? ' · ' + last.when : ''));
  if (rows.length === 1) return head;
  var older = rows.slice(0, -1).reverse();
  return head +
    '<details class="pdf-old"><summary>이전 제출 ' + older.length + '건 <span class="oa-chev">›</span></summary>' +
    '<div class="po-b"><p class="small muted">저장이 도중에 실패해 후원자가 다시 낸 것일 수 있습니다 — 맨 위가 마지막 제출입니다.</p>' +
    older.map(function(r, i){
      return btn(r.fid, word + ' ' + (older.length - i) + (r.when ? ' · ' + r.when : ''));
    }).join('') + '</div></details>';
  /* "열 때마다 감사 로그에 남습니다" 줄은 뺐다 (2026-09-12 선미) — 기록(pdf.view)은 그대로 남는다 */
}
/* 바이트 묶음을 파일로 저장시킨다 — 서버를 거치지 않고 브라우저가 바로 내려받는다 */
function saveBytesAsFile(name, bytes){
  var url = URL.createObjectURL(new Blob([bytes], {type:'application/zip'}));
  var a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
}

/* ── 8. ⭐ 건 상세 · 검수 (Must) ── */
/* 케이스 스위처에 띄울 건 목록.
   ⚠️ 예선에는 데모 4건이 고정돼 있었으나, 실제 DB를 붙이면 없는 건(#107·#115)을 그리다 깨진다
      (유진 발견 2026-08-28). 이제 화면에 실제로 있는 건에서 가져온다. */
function demoCaseIds(){
  return DB.cases.filter(isRegistered).map(function(c){ return c.id; }).slice(0, 6);
}
/* ── ③ 배분결정 · 배분 현황 카드 (2026-09-12 선미) ─────────────────────────────
   ★ 검수 실행 게이트 **밖**에 둔다. 전에는 '실행 완료' 분기 안에서만 만들어져, ⑤ 에서 기관 증빙이 새로 와
     검수 표시가 지워지면(markStaleInspection) ③ 의 배분 현황까지 같이 사라졌다 — "배분기관이 어디인지 안 나온다".
     기관을 어디로 정했나는 검수와 무관한 사실이다. ③ 단계(또는 취소 건)에서만 그린다. */
function distDecideCards(c, res){
  var sDist = '';
  var distLeft = distRemainingQty(c);
  /* ★ 배분 현황 — 지정된 기관을 줄로 세우고, 수취 확정 전이면 여기서 고치거나 취소한다
       (2026-09-11 선미 결정 · patch-20260911-dist-cancel.sql).
     ⚠️ 배분결정 카드와 **따로** 그린다. 그 카드는 남은 수량이 0 이면 사라지는데,
       고쳐야 할 배분은 대개 전량을 다 넣은 뒤에 드러난다. 같은 카드에 두면
       "다 채우고 나면 손댈 수 없는" 지금 그 자리로 되돌아간다. */
  /* ★ 배분 현황·배분결정 카드는 ③ 배분기관 지정 단계에서만 (2026-09-12 선미).
       전에는 ②에도 ③에도 떠서 어디서 정해야 하는지 헷갈렸다. 취소 건(step null)은 전부 그린다. */
  if ((c.dists || []).length && c.state !== '완결' && c.state !== '취소'){
    sDist += distStatusCard(c);
  }
  var moreDist = !!c.orgId && c.state !== '완결' && c.state !== '취소' && distLeft > 0;
  if ((res.canDecideDist || moreDist) && c.state !== '완결'){
    if (DB.distForm.caseId !== c.id){ DB.distForm = {caseId:c.id, orgName:'', qty:'', memo:''}; }
    var already = liveDists(c).length;           /* 취소분은 '지정' 이 아니다 */
    sDist += '<div class="card mb16"><div class="card-h"><h3>배분결정' +
      (already ? ' · 기관 추가' : '') + '</h3>' +
      (already ? '<span class="tag">' + already + '곳 지정 · 남은 수량 ' + distLeft + '개</span>' : '') +
      '</div><div class="card-b">' +
      (already
        ? '<div class="small muted mb12">지정된 기관: ' + esc(orgLabel(c, true)) + '</div>'
        : '') +
      '<div class="field"><label>배분기관 <span class="req">*</span></label>' +
      '<div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:6px;align-items:center">' +
      '<span class="small muted">예시 기관</span>' +
      ['늘봄지역아동센터','햇살지역아동센터','한빛지역아동센터'].map(function(nm){
        return '<button class="btn ghost sm" onclick="DB.distForm.orgName=\'' + nm + '\';render()">' + nm + '</button>';
      }).join('') + '</div>' +
      '<input type="text" value="' + esc(DB.distForm.orgName) + '" placeholder="기관명 직접 입력"' +
      ' onchange="DB.distForm.orgName=this.value"></div>' +
      /* ★ 수량을 받는다 — E7(배분 합계 = 접수 수량)이 대조할 값이다.
           안 받으면 기관만 늘고 합계가 0이라 완결 게이트에서 영문 모를 차단이 난다. */
      '<div class="field"><label>배분 수량 · 낱개 <span class="req">*</span> ' +
        '<span class="small muted">남은 ' + distLeft + '개</span></label>' +
      '<input type="number" min="1" value="' + esc(String(DB.distForm.qty || distLeft)) + '"' +
      ' onchange="DB.distForm.qty=this.value"></div>' +
      '<div class="field"><label>메모</label>' +
      '<input type="text" value="' + esc(DB.distForm.memo) + '" placeholder="예: 인수증 서면 수령 예정"' +
      ' onchange="DB.distForm.memo=this.value"></div>' +
      '<button class="btn pri" onclick="decideDist(\'' + c.id + '\')">' +
        (already ? '기관 추가' : '배분결정 확정') + '</button>' +
      /* ⚠️ 2026-09-04 연수 — 여기가 옛말이었다. 다기관이면 링크를 막던 시절 문장이
           74b5520(기관마다 한 장) 뒤에도 남아 있었다. 바로 위 카드가 기관별 링크를
           그리고 있는데 이 줄만 "쓸 수 없다"고 말했다. 9/2 에 안내 3곳이 남았던 것과 같은 모양이다.
         확정 뒤 일어나는 일(기관마다 제출 링크 카드가 열림 · 서면 인수증은 [수취 등록] · 남은 수량만큼 카드가 계속 열림 ·
         배분 합계 = 접수 수량이어야 완결)은 그때 화면이 말한다 — 힌트 두 줄을 한 줄로(문구 규칙 9/5 · 미리 설명하지 않는다). */
      '<div class="hint" style="margin-top:8px">확정하면 이 기관의 인수증·배분물품사진·결과보고서 항목이 추가됩니다.</div>' +
      '</div></div>';
  }
  return sDist;
}
function viewCase(){
  var c = getCase(DB.caseId);
  if (!c) return '<div class="empty">건을 찾을 수 없습니다</div>';
  var res = inspectView(c, TODAY);
  var crit = getCriteria(c.criteriaKey);
  var fresh = criteriaFreshness(crit.updated, TODAY);
  var freshPill = {none:'ok', info:'info', review:'warn'}[fresh.level];

  /* ★ 케이스 스위처는 **데모에서만** (2026-09-05 선미) — isDemoMode() 게이트가 없었다.
       실 DB 로 열어도 건 상세 **맨 위, 제목보다 위**에 #101 #103 … 버튼이 떴다.
       심사위원이 건 상세에서 처음 보는 줄이 시연용 지름길이 된다. 건 사이 이동은 목록이 한다. */
  var h = demoOnly('<div class="case-switch mb12"><span class="small muted">케이스 스위처</span>' +
    demoCaseIds().map(function(id){
      var cc = getCase(id); if (!cc) return '';
      var rr = inspectView(cc, TODAY);
      return '<button class="btn ghost sm ' + (id === DB.caseId ? 'on' : '') + '" onclick="go(\'case\',\'' + id + '\')">#' + id + ' ' + caseStateKey(cc, rr) + '</button>';
    }).join('') + '</div>') +
    /* ★ [서류 일괄 받기 (ZIP)] 를 제목 줄에도 (2026-09-12 선미) — 전에는 완결 배너 안에만 있어 완결 전에는 서류를 어디서 받는지 알 수 없었다.
         받을 파일이 하나라도 있고 취소 건이 아니면 어느 단계에서든. 반출은 그대로 감사 로그에 남는다(downloadCaseZip). */
    '<div class="page-head"><h2>#' + esc(c.id) + ' · ' + esc(c.item) + '</h2>' +
    '<p>' + esc(c.donor) + ' (' + esc(c.donorType) + ') · 접수 ' + esc(c.inDate) + ' · 배분처 ' + esc(orgLabel(c) || '미정') + '</p></div>' +
    /* [v6 간소화] 데모 안내 문구(demo-sub)·기준×확정 비교 카드 제거 — 담당자 행동(판정·항목·조치) 중심 */
    /* ★ 진행바가 탭이다 (2026-09-11 선미 · 시안 C · 10-planning/case-detail-steps-design-20260911.md)
         전에는 [수취 현황][검수 결과] 두 탭이 **같은 체크리스트를 각각** 그렸다(9/6 M-5 · 수취 현황이 먼저).
         담당자가 같은 서류를 두 번 훑고, 검수 결과는 14장을 한 줄로 펼쳤다.
         이제 화면은 하나고, 어느 단계를 보는지만 고른다. 지금 단계는 caseStepOf() = caseStateKey() 가 정한다 —
         목록 구간·판정 배지와 같은 함수라 갈릴 수 없다.
       ⚠️ 취소 건은 진행바가 없다 — 흐름 밖의 건이라 단계가 없다. 전부 그린다(step = null). */
    stepBar(c, res);
  var step = caseStepSel(c, res);

  /* ══ 골격 고정 (설계서 §4 F · 2026-09-06) ═════════════════════════════
       전에는 카드가 건의 상태마다 위아래로 옮겨 다녔다 —
         · 저장 실패 배너가 판정 요약보다 위
         · 배분결정 카드가 항목 카드보다 위
         · 배분기관 증빙 링크는 **기다리는 동안에만 맨 위로 튀어 올랐다가** 제출되면 맨 아래로
       담당자는 건마다 다른 화면을 읽게 된다. 그래서 자리를 다섯으로 못박고,
       아래 코드는 **그리는 순서가 아니라 어느 자리에 넣을지**만 정한다.
         ① sGate   판정 요약 · [완결 처리] (검수 전이면 [검수 실행])
         ② sBanner 저장 실패 배너 (있을 때만)
         ③ sItems  항목 카드 본문
         ④ sDist   배분결정 · 배분기관 증빙 링크
         ⑤ sBottom 하단 액션
       ⚠️ 새 카드를 붙일 때도 h 에 직접 붙이지 마세요 — 다섯 중 하나를 고르세요.
          h 에 붙이면 그 카드만 다시 순서 밖으로 나갑니다.
     ══════════════════════════════════════════════════════════════════ */
  var sGate = '', sBanner = '', sItems = '', sDist = '', sBottom = '';

  /* [v6 간소화] 기준×확정 비교 카드 삭제 — 기준자료 상태는 관리자 화면, 수취 집계는 검수 결과 요약에서 확인한다.
     (기준자료가 낡았을 때만 경고 한 줄을 남긴다 — 잘못된 기준으로 검수하는 것은 막아야 하므로) */
  if (fresh.msg) sBanner += '<div class="banner warn mb16"><span class="bi">⚠</span><div class="small">' + esc(fresh.msg) + ' · 기준: ' + esc(crit.name) + '</div></div>';

  /* ★ 배분처가 화면에만 있는 상태 — 새로고침하면 사라진다.
       조용히 두면 담당자는 등록됐다고 믿고 넘어간다(9/1 에 다섯 번 밟은 그 모양).
       그래서 검수 화면 맨 위에 세워 두고, 다시 저장할 길을 함께 준다. */
  /* 접수·제출 내용이 DB 에 없다 — 배분처 경고보다 위다. 이 건은 이후 저장도 전부 못 한다 */
  var cse = (DB.caseSaveErr || {})[c.id];
  if (cse){
    /* 접수가 DB 에 없으면 배분·완결·판정도 저장되지 않는다 — 화면에는 '접수가 DB에 없습니다' 까지만(문구 규칙 9/5) */
    sBanner += '<div class="banner warn mb16"><span class="bi">⚠</span><div>' +
      '<b>이 건은 저장되지 않았습니다.</b> 새로고침하면 사라집니다.<br>' +
      (c.dbId ? '제출 내용이 비어 있습니다.' : '접수가 DB에 없습니다.') +
      '<br><span class="small muted">' + esc(cse.msg) + '</span>' +
      '<div class="row mt8"><button class="btn pri sm" onclick="retrySaveCase(\'' + c.id + '\')">다시 저장</button></div>' +
      '</div></div>';
  }

  /* 항목 상태가 화면에만 반영된 상태 — 새로고침하면 되돌아간다 */
  var ise = (DB.itemSaveErr || {})[c.id];
  if (ise){
    /* 새로고침하면 처리 전으로 돌아가 같은 서류를 두 번 처리하게 된다 — 화면에는 앞 문장만 */
    sBanner += '<div class="banner warn mb16"><span class="bi">⚠</span><div>' +
      '<b>“' + esc(ise.name) + '” 처리가 저장되지 않았습니다.</b> 새로고침하면 처리 전으로 돌아갑니다.<br>' +
      '<span class="small muted">' + esc(ise.msg) + '</span></div></div>';
  }

  var dse = (DB.distSaveErr || {})[c.id];
  if (dse){
    sBanner += '<div class="banner warn mb16"><span class="bi">⚠</span><div>' +
      '<b>배분처 “' + esc(dse.org) + '” 가 저장되지 않았습니다.</b> 새로고침하면 사라집니다.<br>' +
      '<span class="small muted">' + esc(dse.msg) + '</span>' +
      '<div class="row mt8"><button class="btn pri sm" onclick="retrySaveDist(\'' + c.id + '\')">배분처 다시 저장</button></div>' +
      '</div></div>';
  }

  /* ★ 증빙 링크 카드는 **자리를 옮기지 않는다** (설계서 §4 F · 2026-09-06).
       2026-07-28 에는 "기관 증빙이 안 들어온 건은 링크 카드를 검수 영역 위에 둔다(첫 행동이니까)" 였다.
       그래서 같은 화면이 기다리는 동안에는 링크가 맨 위, 제출된 뒤에는 맨 아래가 됐다.
       첫 행동을 위로 올리는 것보다, 늘 같은 자리에 있는 것이 담당자에게 낫다 —
       지금은 ④ 자리(sDist)에 한 번만 넣는다. */
  var distPend = distPendingItems(c);
  /* ★ c.orgLink 자리를 걷었다 (2026-09-03) — 링크가 배분처마다라 '건에 링크 하나' 가 없다.
       제출 여부는 **올라온 증빙**으로 판정한다. 링크 상태(used)는 카드가 따로 보여준다. */
  var orgSubmittedFlag = !!distPend.length &&
     distPend.some(function(it){ return it.r.orgUpload && it.r.orgUpload.status === 'uploaded'; });
  var awaitingOrgDocs = !!distPend.length && !orgSubmittedFlag && c.state !== '완결' && c.state !== '취소';
  /* ③ 검수 실행 — 결과는 '실행'한 뒤에만 노출한다.
     진입하자마자 판정이 떠 있으면 아래 '검수 실행' 버튼이 모순되므로,
     검수 가능한 건은 실행 전까지 판정·완결 게이트·항목 결과를 감춘다.
     단, 한 번 실행한 건(c.inspectedAt)은 화면을 떠났다 돌아와도 결과를 그대로 보여준다 —
     판정은 순수 함수라 현재 수취 현황 기준으로 다시 계산돼 표시된다.
     완결 건은 검수를 통과해야만 도달하므로 항상 실행된 것으로 본다. */
  /* ★ 후원자 서류가 전부 확정된 건(③ 이후)은 검수 실행 게이트를 세우지 않는다 (2026-09-12 선미 · #308 실주행).
       게이트는 "실행 전에 판정을 미리 보여 주지 않으려고" 둔 것인데(9/6), 담당자가 항목을 다 확정한 뒤에는
       숨길 판정이 없고 오히려 배분결정 카드까지 같이 숨겨 ③ 에서 할 일이 사라졌다. 단계는 caseStepOf 가 정한다. */
  var nowStep = caseStepOf(c, res);
  var inspected = !!c.inspectedAt || c.state === '완결' || (DB.inspectCaseId === c.id) ||
                  nowStep === 'distDecide' || nowStep === 'distRecv';   /* ⑤ 배분처 서류 검수는 다시 [검수 실행] 을 거친다 (2026-09-12 선미) */
  if (res.canInspect && DB.inspecting){
    /* 실행 중 — 로딩 연출 */
    sGate += '<div class="banner info mb16"><span class="bi"><span class="spin"></span></span><div><b>검수 중…</b><br>' + esc(DB.inspectStage) + '</div></div>';
  } else if (res.canInspect && !inspected){
    /* 아직 실행 안 함 — 실행 안내 + 버튼만 (판정·항목 결과는 감춤) */
    /* 검수 실행 = 받아야 할 서류·받은 서류·수취 현황을 규칙으로 대조하고, 첨부 내용 판독만 AI가 맡는다. 완결 가능 여부는 그 결과로.
       그 설명과 "실행하면 여기에 표시됩니다" 자리는 뺐다(문구 규칙 9/5 · 미리 설명하지 않는다).
       배너는 상태가 바뀐 경우(기관 증빙이 새로 제출됨)에만 — 실행하면 인수증 수량 대조 등 새 증빙까지 함께 대조한다. */
    sGate += (orgSubmittedFlag
        ? '<div class="banner info mb16"><span class="bi">🏫</span><div><b>배분기관 증빙이 제출되었습니다.</b> 검수를 실행하면 함께 대조합니다.</div></div>'
        : '') +
      /* "AI 검수는 실제 판정입니다 — …(E1)" 고지는 뺐다 (2026-09-12 선미). aiNotice() 는 검사가 쓰므로 함수는 남긴다 */
      '<div class="row mb16"><button class="btn pri" onclick="runInspect()">검수 실행</button></div>';
  } else if (res.canInspect){
    /* 실행 완료 — 검수 결과 요약 + 완결 게이트 (다시 검수 가능) */
    if (c.state === '완결') sGate += completedSummary(c, res);
    sGate += '<div class="gate-row mb16"><div>' +
      '<div class="row" style="gap:8px;align-items:center;margin-bottom:6px">' +
        '<b style="font-size:16px">검수 결과 요약</b>' + casePill(c, res) +
        /* 건 단위 판정은 담당자 수취 현황의 규칙 기반 집계다 — "AI 검수" 라벨을 붙이면
           AI가 건 전체를 봤다는 착각(자동화 편향)을 만든다. 그래서 여기엔 AI 라벨이 없다.
           "규칙 기반 집계 — AI 아님" 태그는 뺐다(문구 규칙 9/5 · 왜는 쓰지 않는다). */
        /* ⑥ 완결에는 [다시 검수] 가 없다 (2026-09-12 선미) — 완결은 되돌리지 않으므로 다시 돌려도 바뀔 것이 없다 */
        (step === 'done' ? '' : '<button class="btn ghost sm" onclick="runInspect()">다시 검수</button>') + '</div>' +
      /* ★ 세 줄을 뺐다 (2026-09-05 선미) — 요약 아래에 있던
           ① "완결 처리 전 미수취 항목을 확인해 주세요"(reasonMessage)
           ② "확정 체크리스트 N항목 중 …"(reasonLine)
           ③ AI 고지(aiNotice)
         셋 다 **오른쪽이 이미 말하는 것**이다. [완결 처리] 옆의 빨간 줄이
         "미수취 1건 · 확인필요 2건 차단" 이라고 건수까지 적고, 무엇을 봐야 하는지는
         아래 항목 카드가 항목마다 말한다. 같은 말을 세 번 하면 아무도 안 읽는다.
       ⚠️ AI 고지는 없앤 것이 아니다 — 검수 실행 줄과 항목 카드의 AI 판정 블록
         ("수취 확정은 담당자")에 그대로 있다. 루브릭 §0-1 규칙 B 는 거기서 지켜진다. */
      '</div><div style="text-align:right">' +
        /* ★ 대조 판정도 완결을 막는다 — 항목이 다 수취돼도 배분 수량 합계가 안 맞으면 완결이 아니다.
           (루브릭 E7: 미달은 오류가 아니지만 완결 게이트에서는 차단) */
        /* ★ [서류 일괄 받기 (ZIP)] 는 [완결 처리] 오른쪽 (2026-09-12 선미) — 완결 전에는 잠그고 툴팁이 이유를 말한다.
             제목 줄에 뒀던 버튼(같은 날 오전)은 뺐다. 완결 배너 안의 버튼도 여기로 합쳤다. */
        '<div class="row" style="gap:8px;justify-content:flex-end;flex-wrap:wrap">' +
        (c.state === '완결'
          /* 완결한 뒤에는 같은 자리가 [완결 처리 취소] 가 된다 (2026-09-12 선미) — 잘못 누른 완결을 되돌린다 */
          ? '<button class="btn ghost" onclick="uncompleteCase(\'' + c.id + '\')">완결 처리 취소</button>'
          : '<button class="btn pri" ' + ((res.canComplete && !unresolvedBlocking(c).length) ? '' : 'disabled') +
            ' onclick="completeCase(\'' + c.id + '\')">완결 처리</button>') +
        zipButton(c) + '</div>' +
        /* 완결 직전 재상기 — 누르기 전에 AI가 보지 않은 것을 한 번 더 읽게 한다 */
        /* ★ AI 축을 게이트 문장과 따로 센다 (2026-09-11 선미 · A안) — "확인필요 3건 차단" 이
             미수취인지 AI 지적인지 읽기 전엔 알 수 없었다. 위 줄은 AI, 아래 줄은 수취 게이트. */
        aiCountLine(c) +
        (unresolvedBlocking(c).length
          ? '<div class="gate-block mt8">' + esc(unresolvedBlockText(c)) + '</div>'
          : res.canComplete
            ? '<div class="gate-note" style="max-width:320px">' + esc(AI_BLIND_NOTE) + '</div>'
            : '<div class="gate-block mt8">' + esc(gateBlockText(res)) + '</div>') +
      '</div></div>';
    /* [2026-07-27] 배분결정 — 후원자 서류가 모두 수취된 건에서만 열리는 다음 단계.
       기관을 지정하면 기관 증빙 3종이 체크리스트에 추가되고 '배분 확정' 리스트로 이동한다.
       [2026-09-01] 다기관 — 첫 기관을 정한 뒤에도 남은 수량이 있으면 카드를 계속 연다.
       예전에는 orgId 가 생기는 순간 카드가 사라져서 두 번째 기관을 넣을 방법이 아예 없었다. */
    /* [v6 간소화] 실증 패널(1,182건)·AI 확인 범위 상세 블록은 화면에서 제거 — 함수는 남겨 되살리기 쉽게 */
  }

  /* ★ 단계마다 그리는 것이 고정이다 (2026-09-12 선미 실주행) — 전에는 "검수했나"(inspected) 로 수취 행/항목 카드를 골라
       검수하고 나면 ①도 ②와 같은 화면이 됐고, 기관이 제출하면 ④·⑤가 같아졌다.
         ①④ 수취 단계 = 수취 요약 + 서류별 파일·상태·[수취 등록]   (검수 결과 요약·AI 고지·판정 없음)
         ②⑤ 검수 단계 = 검수 결과 요약·[완결 처리] + AI 고지 + 대조 판정 + 항목 카드(AI 판정·원본 보고 처리)
         ③ 배분결정만 · ⑥ 전부 · 취소 건(null) 전부
       sDist(배분결정) 는 위 분기가 이미 채웠으므로 sGate 만 비운다. */
  var checkStep = (step === null || step === 'donorCheck' || step === 'distCheck' || step === 'done');
  if (!checkStep) sGate = '';
  /* AI 확인 범위 고지 — 루브릭 §0-1 규칙 B에 따라 생략하지 않되, [v6 간소화] 한 줄로 줄인다.
     AI가 정확할수록 담당자는 덜 보게 되므로("이상 없음"만 보고 AI가 안 본 항목까지 통과로 착각) 이 한 줄은 유지한다. */
  if (checkStep) sItems += '<div class="banner info mb16"><span class="bi">🔍</span><div class="small">' +
    'AI는 <b>금액·일자·수량·취득경로</b>만 대조합니다. 그 외와 최종 확인은 담당자가 합니다.' +
    /* 판정값은 셋뿐이다 — 처음 보는 사람이 그걸 알 자리는 여기뿐 (2026-09-11 선미) */
    '<span class="legend"><span class="pill ok"><span class="pd"></span>이상 없음</span>' +
    '<span class="pill warn"><span class="pd"></span>확인 권장</span>' +
    '<span class="pill info"><span class="pd"></span>판단 보류</span></span>' +
    '</div></div>';

  /* ③-2 대조 판정 (층 ②) — 루브릭 §2 "체크리스트 아래 별도 영역"
     서류 한 장으로는 답이 안 나오는 것들(수량 합계·가액 산정 방식·일자 순서)을 여기 모은다.
     실행 전에는 감춘다 — 판정·항목 결과를 감추는 것과 같은 이유(검수 실행 버튼과의 모순). */
  /* ★ 단계에 맞는 판정만 (2026-09-12 선미) — ②는 후원자 서류 쪽(E3·E4·E5·E6·E8·E2 구매→기부),
       ⑤는 배분처 쪽(E7·E2 기부→배분), ⑥·취소 건은 전부. ③·④에는 안 그린다(그 단계의 일이 아니다). */
  var cmpSide = (step === null || step === 'done') ? null
              : (step === 'donorCheck') ? 'donor'
              : (step === 'distCheck') ? 'dist' : 'none';   /* ①③④ 수취·지정 단계에는 판정이 없다 */
  if (res.canInspect && inspected && cmpSide !== 'none') sItems += compareBlock(c, cmpSide);

  /* ④ 항목 카드 리스트
     (구 S3 "체크리스트 확정하기" 카드는 제거 — 확정 클릭은 새 정보가 없는 중복 단계였다.
      검수대기는 이제 실질 사유(필수정보 미입력·제출 대기)로만 발생한다) */
  if (!res.canInspect && step && step !== 'donorRecv' && step !== 'donorCheck'){
    /* 검수 전 건에서 뒤 단계를 눌렀다 — 아직 그 단계의 서류가 없다 (2026-09-11) */
    sItems += stepEmptyCard();
  } else if (!res.canInspect){
    /* [v6 간소화] 검수대기 배너와 조치 카드가 같은 정보를 반복하지 않게 — 조치 카드가 나올 때는 배너를 생략한다 */
    var awaiting = c.awaitingSubmit && c.state !== '취소' && c.state !== '완결';
    var needInfo = !awaiting && c.state !== '취소' && c.state !== '완결' && (c.missingRequired || []).length;
    if (!awaiting && !needInfo){
      sItems += '<div class="banner dg mb16"><span class="bi">⛔</span><div><b>검수대기</b><br>' + esc(res.reasonMessage) +
        (c.missingRequired ? '<br>미입력: ' + esc(c.missingRequired.join(' · ')) : '') + '</div></div>';
    }
    /* 후원자 제출 대기 건 — 자동 구성된 체크리스트를 미리 보여주고, 오발송 대비 취소 경로만 연다.
       (구 "체크리스트 확정하기" 클릭 단계는 제거 — 제출되면 바로 검수가 열린다) */
    if (awaiting){
      /* 접수 링크 — 잃었으면 여기서 같은 건에 재발급한다 (2026-09-12 선미 · intakeLinkCard 주석) */
      sItems += intakeLinkCard(c);
      /* 체크리스트는 유형 × 취득경로로 규칙(코드)이 구성한다 — AI 아님. 제출되면 바로 검수가 열린다.
         그 설명 배너·"규칙 기반 — AI 아님" 태그는 뺐다(문구 규칙 9/5) — 경로·접수일·조합은 한 줄로 */
      sItems += '<div class="card"><div class="card-h"><h3>체크리스트 · 후원자 제출 대기</h3></div><div class="card-b">' +
        '<div class="small muted mb12">' + esc(c.submittedVia) + ' · 접수 ' + esc(c.inDate) +
        ' · ' + esc(c.donorType) + ' × ' + esc(c.acqPath || '구매') + '</div>' +
        c.checklist.filter(function(it){ return it.included; }).map(function(it){
          return '<div class="doc-row"><div class="di">' + (it.kind === 'F' ? '🧮' : '📄') + '</div>' +
            '<div style="flex:1"><b>' + esc(it.n) + ' ' + layerBadge(it.kind, false) + '</b>' +
            '<small>' + esc(it.note || '') + '</small></div></div>';
        }).join('') +
        (c.donorFiles && c.donorFiles.length
          ? '<div class="item-meta mt12">후원자 첨부: ' + esc(c.donorFiles.join(' · ')) + '</div>' : '') +
        '<div class="row mt12" style="gap:8px;flex-wrap:wrap;align-items:center"><span class="small muted">잘못 보냈으면 취소 →</span>' + cancelReasonButtons(c.id) + '</div>' +
        /* 제출 전 검수 차단 = 덜 들어온 건을 완결로 밀지 않기 위한 것 — 화면에는 사실만 */
        '<div class="gate-note">제출 전에는 검수할 수 없습니다.</div>' +
        '</div></div>';
    } else if (needInfo){
      /* 필수항목이 비어 있는 건 — 체크리스트를 전개할 수 없으므로 취소·보완 경로를 여기서 열어준다.
         이 분기가 없으면 진행도 취소도 못 하는 상태로 남는다. */
      /* 유형·경로가 비면 어떤 서류가 필요한지 정할 수 없다 — 링크를 다시 보내 확정하거나 취소. 두 버튼이 그 둘이다. */
      sItems += '<div class="card"><div class="card-h"><h3>검수대기</h3>' +
        '<span class="tag">필수항목 미입력</span></div><div class="card-b">' +
        '<div class="banner warn mb16"><span class="bi">🧾</span><div><b>필수항목이 비어 있어 체크리스트를 만들 수 없습니다.</b><br>' +
        esc(c.submittedVia || '경로 미상') + ' · 접수 ' + esc(c.inDate) +
        ((c.missingRequired || []).length ? '<br>미입력: ' + esc(c.missingRequired.join(' · ')) : '') +
        '</div></div>' +
        '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">' +
        '<button class="btn pri sm" onclick="go(\'send\')">접수 링크 다시 발송</button>' +
        '<span class="small muted">잘못된 접수면 →</span>' + cancelReasonButtons(c.id) +
        '</div>' +
        '<div class="gate-note">취소한 건은 감사 이력에 남습니다.</div>' +
        '</div></div>';
    }
  } else {
    /* ★ 검수 실행 전에도 서류가 보인다 (2026-09-11) — 전에는 [수취 현황] 탭이 그 자리였다.
         실행 전 = 수취 현황 행(receiptRow · 항목 옆 [수취 등록]) · 실행 후 = 항목 카드(itemCard).
         무엇을 넣을지는 단계가 정한다 — 후원자 서류 / 배분기관 / 기관별 아코디언. */
    /* 항목 카드는 검수 단계(②⑤⑥·취소 건)에서 검수를 마친 뒤에만 — 수취 단계(①④)는 늘 수취 행 */
    sItems += stepItemsBlock(c, res, step, inspected && checkStep);
  }

  /* ④ 배분기관 증빙 제출 링크 — 기다리는 중이든 제출된 뒤든 **같은 자리**다.
       (전에는 기다리는 동안 맨 위, 제출 뒤 맨 아래로 옮겨 다녔다 — 조건 두 개가 이 한 줄이 됐다) */
  /* ③ 배분결정 · 배분 현황 — 검수 게이트와 무관하게 (distDecideCards 주석) */
  if (res.canInspect && (step === null || step === 'distDecide')) sDist += distDecideCards(c, res);
  /* ③④ 에서만 (2026-09-12 선미) — 링크는 배분처를 정하고 서류를 받는 자리의 일이다. ⑤ 검수·⑥ 완결에는 없다.
       기관이 잘못 낸 서류를 다시 받을 때는 ④ 에서 재발급한다. */
  var showLink = (step === null || step === 'distDecide' || step === 'distRecv');
  if ((awaitingOrgDocs || inspected) && showLink) sDist += orgLinkBlock(c);

  /* ⑤ 하단 액션 — 지금은 비어 있다 (설계서 §4 F · 2026-09-06).
       전에는 여기에 [수취 등록] 이 있었다. 그 버튼은 uid 없이 가서 **첫 대기 항목**이 열린다 —
       담당자가 처리하려던 항목이 아닐 수 있다(2026-09-05 에 고친 오처리와 같은 경로).
       수취 등록은 이제 **그 항목 옆에서만** 연다 — 항목 카드(검수 결과)와 수취 현황 각 행.
       자리는 남겨 둔다: 건 단위 액션이 생기면 여기다. */

  /* ★ 골격 — 여기가 순서를 정하는 **유일한 자리**다 (설계서 §4 F) */
  return h + sGate + sBanner + sItems + sDist + sBottom;
}
/* 대조 판정 카드 — 서류들·등록값들 '사이'의 판정 (E2·E3·E7 · AI 아님)
   ★ '이상 없음'도 지운 채로 두지 않는다. 무엇을 봤는지가 보여야 담당자가
     "안 본 것"과 "보고 통과시킨 것"을 구분할 수 있다(자동화 편향 방지). */
/* ── 대조 판정 사유 해소 (E3 완결 게이트) ────────────────────────
   해소 상태는 건(c)에 판정 키로 건다. compareFindings() 가 매 렌더마다 판정을
   새로 계산해서, 판정 객체 자체에는 상태를 붙일 자리가 없기 때문이다.
   DB 저장은 inspection_finding 의 resolution_reason·resolved_by·resolved_at
   (patch-20260901-finding-resolution.sql · 선미 결정 2026-09-01). */

/* 판정 하나를 가리키는 키 — ★ 규칙코드만으로는 부족하다.
   extractedFindings() 가 첨부 항목마다 돌기 때문에 같은 규칙(E2·E4·E5·E6)이
   한 카드에 여러 번 뜬다. 규칙코드로만 걸면 하나를 해소했을 때 같은 규칙이
   전부 해소된다. 지금은 그것들이 blocksComplete=false 라 드러나지 않지만,
   누군가 true 로 올리는 순간 조용한 과완결 구멍이 된다. */
function findingKey(f){
  return f.rule + (f.axis ? '_' + f.axis : '');
}
function findingRes(c, key){
  return (c && c.findingRes && c.findingRes[key]) || null;
}
/* 사유로 해소할 수 있는 판정인가 —
   ★ isError(담당자 판단이 필요한 지적)이면서 완결을 막는 것만이다.
     E7 미달('배분 진행 중')은 isError=false 다. 사유로 넘어갈 것이 아니라
     배분처를 마저 정해야 풀리는 '상태'라서다. 여기를 넓히면 과완결 구멍이 된다.
   ※ E3 는 지금 blocksComplete=false 라 아직 안 뜬다 —
     rules-compare.js:78 이 true 로 바뀌면 화면은 안 고쳐도 자동으로 붙는다. */
function findingResolvable(f){
  return !!(f && f.isError && f.blocksComplete);
}
/* 화면이 보는 완결 차단 목록 — 해소된 것은 뺀다.
   rules-compare.js 는 해소를 모르므로(계약 밖) 여기서 거른다. */
function unresolvedBlocking(c){
  return compareBlocking(c).filter(function(f){ return !findingRes(c, findingKey(f)); });
}
/* ★ 판정의 **자기 설명문**을 쓴다 (2026-09-15 선미 · 테스트 참여자 의견 · 동료 피드백 후보 ②)
     ★ 전에는 규칙명 + 판정값 + 꼬리말을 구분자 없이 이어 붙였다. 그래서 나온 글자가
       "배분 수량 합계 배분 진행 중 판정이 완결을 막고 있습니다" 였다 —
       '배분' 이 두 번 나오고, '진행 중 판정' 이라는 없는 말이 생기고,
       **무엇이 얼마나 모자란지는 한 글자도 없었다.**
     ★ 그런데 같은 판정이 자기 설명문을 이미 갖고 있다:
       "아직 배분처를 다 정하지 않았습니다 — 배분 합계 250 / 접수 수량 400 (…) · 남은 수량 150"
       새 문구를 쓸 게 아니라 이걸 가져다 쓰면 된다 — 이미 [대조 판정] 카드에서 읽히는 문장이다.
     ★ 자르는 규칙 — 막는 판정 넷(E7 초과·E7 미달·E4 인수증·E3)이 모두
       `핵심 문장 — 자세한 값` 꼴이라 **마지막 ' — ' 뒤**를 뗀다. 숫자는 바로 아래 카드가 말한다.
       E4 는 앞에 기관명이 한 번 더 ' — ' 로 붙는데(at), 마지막 것만 떼므로 기관명은 남는다 —
       여러 기관 중 어느 곳인지가 게이트 줄에서 보여야 한다.
     ⚠️ ' — ' 가 없는 판정이 생기면 문장을 통째로 쓴다 — 빈 줄을 내보내면 왜 못 누르는지가 사라진다.
     ⚠️ 규칙별 안내문을 새로 쓰지 않는다(그건 이 함수 밖으로 새는 일이다). 있는 문장을 고른다. */
function blockHeadline(f){
  var parts = String(f.reason || '').split(' — ');
  var head = (parts.length > 1) ? parts.slice(0, -1).join(' — ') : String(f.reason || '');
  return head.trim() || (findingLabel(f) + ' ' + f.verdict);
}
function unresolvedBlockText(c){
  var b = unresolvedBlocking(c);
  if (!b.length) return '';
  /* 여럿이면 두 개까지 — 게이트 줄은 한 줄이다. 나머지는 건수로 알리고 카드에 맡긴다. */
  var head = b.slice(0, 2).map(blockHeadline).join(' · ');
  return (b.length > 2) ? head + ' · 그 외 ' + (b.length - 2) + '건' : head;
}
/* 판정이 어느 쪽 서류의 일인가 — 배분 합계(E7)와 기부→배분 일자(E2)만 배분처 쪽, 나머지는 후원자 쪽 */
function findingSide(f){
  if (f.rule === 'E7') return 'dist';
  if (f.rule === 'E2' && f.axis === '기부→배분') return 'dist';
  if (f.rule === 'E4' && f.axis === '인수증 ↔ 배분') return 'dist';   /* 배분처가 낸 서류다 (2026-09-12 · #317) */
  return 'donor';
}
function compareBlock(c, side){
  var list = compareFindings(c);
  /* 첨부에서 뽑은 값으로 나온 판정(E4·E5·E6)도 같은 자리에 모은다 —
     이것들도 '서류 한 장으로는 답이 안 나오는' 대조 판정이기 때문이다. */
  (c.checklist || []).forEach(function(it){
    if (it.r && it.r.facts) list = list.concat(extractedFindings(c, it, it.r.facts));
    else list = list.concat(restoredExtractFindings(c, it));   /* 새로고침 뒤 — 저장된 판정으로 (2026-09-10) */
  });
  /* 같은 파일이 두 자리에 붙은 드문 경우 되살린 줄이 겹친다 — 규칙·판정·사유가 같으면 하나만 */
  /* ★ 복원된 것만 거르던 것을 전부로 (2026-09-11 선미 · 발견 1) — 이번 세션에서 뽑은 판정도 같은 파일이
       두 칸에 붙으면 E2 가 두 줄로 났다(G14 실측). 키에 사유가 들어 있어 E2 의 두 고리(구매→기부/기부→배분)는 남는다. */
  var dupe = {};
  list = list.filter(function(f){
    var k = f.rule + '|' + f.verdict + '|' + f.reason;
    if (dupe[k]) return false;
    dupe[k] = true; return true;
  });
  if (side) list = list.filter(function(f){ return findingSide(f) === side; });   /* 단계별 (2026-09-12) */
  if (!list.length) return '';
  var tone = {'확인 권장':'warn', '이상 없음':'ok', '배분 진행 중':'info', '판단 보류':'info'};   /* 판단 보류는 회색이 아니다 — 사람이 대신 봐야 하는 판정 (2026-09-11) */
  /* 규칙 이름은 rules-compare.js 의 FINDING_LABEL 하나에서 온다 — E 번호는 화면에 안 그린다 (문구 수정 9/10).
     여기 모이는 것은 서류 한 장으로는 답이 안 나오는, 값들 '사이'의 판정이다(규칙 기반 · AI 아님).
     그 설명 태그·힌트는 뺐다(문구 규칙 9/5) — 행마다 규칙명과 사유가 있다. */
  return '<div class="card mb16"><div class="card-h"><h3>대조 판정</h3></div><div class="card-b">' +
    list.map(function(f){
      var rz = findingRes(c, findingKey(f));
      var h = '<div class="doc-row"><div class="di">' + (f.blocking ? '⚠️' : '🧮') + '</div>' +
        /* ★ f.axis — E2 는 사슬의 서로 다른 고리(구매→기부 / 기부→배분)를 보는 판정이
             한 카드에 둘 다 뜰 수 있다. 라벨이 같으면 같은 판정이 두 번 뜬 것처럼 읽힌다.
             표시에만 붙는다 — 저장되는 rule_code 는 그대로 'E2' 다(통계 안 바뀜). */
        '<div style="flex:1"><b>' + esc(findingLabel(f)) + ' ' +
        '<span class="pill ' + (tone[f.verdict] || 'neu') + '"><span class="pd"></span>' +
        esc(f.verdict) + '</span>' +
        (rz ? ' <span class="pill ok"><span class="pd"></span>사유해소</span>' : '') + '</b>' +
        '<small>' + esc(f.reason) + '</small>';
      /* 해소됨 — 사유를 지우지 않고 그대로 보여준다. 완결을 통과시킨 근거라 감사 대상이다 */
      if (rz){
        h += '<div class="item-meta mt8">사유해소 · ' + esc(rz.by) + ' · ' + esc(rz.date) +
             '<br>' + esc(rz.reason) + '</div>';
      } else if (findingResolvable(f)){
        var fk   = findingKey(f);
        var busy = !!(DB.resolving && DB.resolving[fk]);
        var errm = (DB.resolveErr && DB.resolveErr[fk]) || '';
        var draft= (DB.resolveDraft && DB.resolveDraft[fk]) || '';
        h += '<div class="row mt12" style="gap:8px;align-items:center">' +
          '<input type="text" id="resf-' + esc(fk) + '" value="' + esc(draft) + '"' +
          ' placeholder="해소 사유 · 예: 후원처 통화로 가액 산정 경위 확인"' +
          (busy ? ' disabled' : '') +
          ' style="flex:1;min-width:220px;padding:8px 10px;border:1.5px solid var(--line);border-radius:9px;font-size:15px">' +
          '<button class="btn ghost sm"' + (busy ? ' disabled' : '') +
          ' onclick="resolveFinding(\'' + c.id + '\',\'' + esc(fk) + '\')">' +
          (busy ? '저장 중…' : '사유로 해소') + '</button></div>';
        /* ★ 실패를 화면에 세운다 — 조용히 넘기면 담당자는 해소된 줄 알고 완결시킨다 */
        if (errm){
          /* 저장돼야 해소다 — 저장 없이 화면만 열리면 완결 근거가 DB 에 없다. 화면에는 사실만 */
          h += '<div class="banner warn mt8"><span class="bi">⚠</span><div>' +
            '<b>사유가 저장되지 않았습니다.</b> 해소되지 않았습니다.<br>' +
            '<span class="small muted">' + esc(errm) + '</span></div></div>';
        }
      }
      return h + '</div></div>';
    }).join('') +
    '</div></div>';
}

/* AI 판정 결과 한 덩어리 — 성공/실패 어느 쪽이든 담당자가 다음 행동을 할 수 있게 그린다.
   ★ 판정값은 '이상 없음 / 확인 권장 / 판단 보류' 뿐이다. '수취완료'는 담당자 확정값이라
     AI 자리에 절대 나오지 않는다(루브릭 §0-1 규칙 A · api.js 에서 한 번 더 막는다). */
var VERDICT_LINE = {
  '이상 없음': '대조한 값이 같습니다 · 확인한 것: 금액',
  '확인 권장': '대조한 값이 다릅니다 — 원본을 보고 확인해 주세요',
  '판단 보류': '대조하지 못했습니다 — 원본을 직접 봐 주세요'
};
/* ★ 머리말은 사유에 따라 갈린다 (2026-09-11 승희 · 루브릭 G06·G07·G08 실주행 · 팀 결정 ⓑ)
   '확인 권장' 안에 성격이 다른 둘이 섞여 있다 — 진짜 오류("어느 쪽과도 다름 · 차이 45,000")와
   '모름' 규칙의 확인 절차("합계와 일치 · 차이 0원" · 매입세액공제 여부를 폼에서 안 받아 늘 이쪽).
   머리말이 둘을 똑같이 "값이 다릅니다"라 부르니 담당자가 정상 건마다 오탐으로 읽었다(승희가 두 번 헷갈림).
   판정·색은 그대로 두고 머리말만 사유에 맞춘다 — 규칙·통계는 안 바뀐다. 근본 해결(폼에 공제 여부)은 제출 뒤. */
function verdictLine(j){
  var v = j && j.verdict, r = String((j && j.reason) || '');
  if (v === '확인 권장'){
    if (/공급가액과 일치/.test(r)) return '공급가액과 맞습니다 — 공제 받는 건인지 후원자에게 확인해 주세요';
    if (/합계와 일치/.test(r))     return '금액은 맞습니다 — 매입세액공제 여부만 후원자에게 확인해 주세요';
  }
  return VERDICT_LINE[v] || '';
}
/* 요약 카드의 AI 줄 — 항목 판정(aiJudge) 과 대조 판정(compareFindings) 의 '확인 권장'·'판단 보류' 를 센다 */
function aiCountLine(c){
  /* ★ 담당자가 처리한 지적은 따로 센다 (2026-09-12 선미 · #309) — 전에는 원본을 보고 수취 처리한 뒤에도
       "AI 지적 1건" 이 주황으로 계속 남아 아직 할 일이 있는 것처럼 읽혔다. 지적 자체는 기록이라 지우지 않고,
       처리된 것뿐이면 회색으로 "담당자 확인함" 을 붙인다. */
  var warn = 0, hold = 0, handled = 0;
  (c.checklist || []).forEach(function(it){
    var v = it.r && it.r.aiJudge && it.r.aiJudge.verdict;
    if (v !== '확인 권장' && v !== '판단 보류') return;
    var k = itemStatus(it).code;
    if (k === 'done' || k === 'res') handled++;
    else if (v === '확인 권장') warn++; else hold++;
  });
  (compareFindings(c) || []).forEach(function(f){
    if (f.verdict !== '확인 권장' && f.verdict !== '판단 보류') return;
    if (findingRes(c, findingKey(f))) handled++;
    else if (f.verdict === '확인 권장') warn++; else hold++;
  });
  if (!warn && !hold && !handled) return '';
  var p = [];
  if (warn) p.push('AI 지적 ' + warn + '건');
  if (hold) p.push('판단 보류 ' + hold + '건');
  if (!p.length) return '<div class="gate-ai done mt8">' + esc('AI 지적 ' + handled + '건 · 담당자 확인함') + '</div>';
  if (handled) p.push('확인함 ' + handled + '건');
  return '<div class="gate-ai mt8">' + esc(p.join(' · ')) + '</div>';
}
function aiJudgeBlock(c, it, j){
  if (j.state === 'error'){
    return '<div class="mt8"><span class="ai-chip">AI 검수 실패</span>' +
      '<div class="item-meta mt8">' + esc(j.reason) + '</div>' +
      (j.error ? '<div class="item-meta" style="opacity:.6">' + esc(j.error) + '</div>' : '') +
      '<div class="row mt8" style="gap:8px;align-items:center">' +
      /* 판정이 없어도 완결 게이트는 담당자 수취 기록으로 계속 동작한다 — 화면에는 안 쓴다(문구 규칙 9/5) */
      '<button class="btn ghost sm" onclick="judgeItem(\'' + c.id + '\',\'' + esc(it.uid) + '\')">다시 판정</button>' +
      '</div></div>';
  }
  var tone = {'이상 없음':'ok', '확인 권장':'warn', '판단 보류':'info'}[j.verdict] || 'neu';
  return '<div class="mt8"><span class="ai-chip">AI 판정 · 금액 대조</span> ' +
    '<span class="pill ' + tone + '"><span class="pd"></span>' + esc(j.verdict) + '</span>' +
    /* 판정값이 무슨 뜻인지 한 줄 — 사유는 건마다 다르지만 이 줄은 판정마다 같다 (2026-09-11 선미) */
    (verdictLine(j) ? '<div class="item-meta mt8"><b>' + esc(verdictLine(j)) + '</b></div>' : '') +
    '<div class="item-meta mt8">"' + esc(j.reason) + '"</div>' +
    (j.amount ? '<div class="item-meta">서류에서 읽은 금액: ' + esc(j.amount) + '</div>' : '') +
    '<div class="item-meta" style="opacity:.6">' + esc(j.file || '') + ' · ' + esc(j.at || '') +
      ' · 수취 확정은 담당자가 합니다</div>' +
    '<div class="row mt8"><button class="btn ghost sm" onclick="judgeItem(\'' + c.id + '\',\'' + esc(it.uid) + '\')">다시 판정</button></div>' +
    '</div>';
}
function itemCard(c, it){
  var st = itemStatus(it);
  var sub = (st.tone === 'neu');                       /* 제출됨 · 확인 전 — 회색 (2026-09-11 A안) */
  var cls = sub ? 'st-sub' : {done:'st-done', miss:'st-miss', unc:'st-unc', res:'st-res'}[st.code];
  /* ★ 왼쪽 띠는 AI 축이다 — 판정이 있으면 그 색, 없으면 수취 상태 색 그대로 */
  var aiV = it.r && it.r.aiJudge && it.r.aiJudge.verdict;
  cls += ({'이상 없음':' ai-ok', '확인 권장':' ai-warn', '판단 보류':' ai-hold'}[aiV] || '');
  var chk = sub ? '<span class="chk sub">·</span>'
    : {done:'<span class="chk on">✓</span>', miss:'<span class="chk miss">✕</span>',
       unc:'<span class="chk unc">!</span>', res:'<span class="chk res">✎</span>'}[st.code];
  var pill = st.tone || {done:'ok', miss:'dg', unc:'warn', res:'info'}[st.code];
  var layer = layerBadge(it.kind, true);
  var h = '<div class="item-card ' + cls + '"><div class="item-head">' + chk +
    '<b>' + esc(it.n) + '</b>' + layer + '<span class="pill ' + pill + '"><span class="pd"></span>' + st.status + '</span>' +
    '</div>';
  /* F 는 규칙 기반 코드 검증(AI 아님) — 층 배지 '자동 확인' 이 말하므로 메타에는 note 만 남긴다(문구 규칙 9/5) */
  if (it.kind === 'F') h += (it.note ? '<div class="item-meta">' + esc(it.note) + '</div>' : '');
  else if (it.kind === 'S'){
    h += '<div class="item-meta">폼 제출로 충족됩니다' + (it.note ? ' · ' + esc(it.note) : '') + '</div>';
    /* 신청서 PDF(이름·주민번호·서명이 든 유일한 서류) — 상태와 무관하게 늘 여기서 연다 */
    var fpb = formPdfButtonsHtml(c);
    if (fpb) h += '<div class="row mt8" style="gap:8px;align-items:center;flex-wrap:wrap">' + fpb + '</div>';
  }
  else if (it.note) h += '<div class="item-meta">' + esc(it.note) + '</div>';
  if (st.reason) h += '<div class="item-meta">' + esc(st.reason) + '</div>';
  if (st.meta) h += '<div class="item-meta">' + esc(st.meta) + '</div>';
  if (it.r.fileIds && it.r.fileIds.length){
    h += '<div class="mt8">' + it.r.fileIds.map(function(fid, i){
      var m = fileMeta(fid);
      return '<span class="file-chip' + (m.demo ? ' demo' : '') + '" onclick="openViewer(' +
        esc(JSON.stringify(it.r.fileIds)) + ',' + i + ',\'' + c.id + '\',\'' + esc(it.uid) + '\')">' +
        (fileKind(fid) === 'image' ? '🖼' : '📄') + ' ' + esc(m.name) + ' <span style="opacity:.6"></span></span>';
    }).join('') + '</div>' +
    (it.r.date ? '<div class="item-meta">' + esc(it.r.date) + ' ' + esc(it.r.by || '') + '</div>' : '');
  } else if (it.r.file){
    h += '<div class="item-meta">' + esc(it.r.file) + (it.r.date ? ' · ' + esc(it.r.date) + ' ' + esc(it.r.by || '') : '') + '</div>';
  }
  /* 기관이 폼으로 작성한 인수증 — 원문은 후원자 서류와 같은 패턴으로 팝업에서 보고 수취 처리한다.
     카드에는 규칙 대조 결과만 남긴다 (내용을 미리 다 펼쳐두면 '원문 확인' 단계가 무의미해진다) */
  var rc = it.r.orgUpload && it.r.orgUpload.receipt;
  if (rc){
    /* 수량 대조 — 폼 값끼리의 규칙 대조(AI 아님). 금액 대조 카드와 같은 자리·같은 문법으로 보여준다 */
    if (it.r.qtyFlag){
      /* 기준 라벨 — 배분처 배분 수량(다기관 기본) / 신고 수량(옛 구조) 을 사실대로 (2026-09-07) */
      var qtyBasisDist = it.r.qtyFlag.basis === 'dist';
      h += '<div class="amount-card"><div class="amount-title">수량 대조 · 인수증 ↔ ' + (qtyBasisDist ? '배분' : '신청서') + '</div>' +
        '<div class="amount-grid">' +
        '<div class="amount-box"><div class="amount-label">인수증 · 인수 수량</div><div class="amount-val">' + esc(String(it.r.qtyFlag.recv)) + '</div></div>' +
        '<div class="amount-vs">↔</div>' +
        '<div class="amount-box"><div class="amount-label">' + (qtyBasisDist ? '배분결정 · 이 기관 배분 수량' : '물품기부신청서 · 기재 수량') + '</div><div class="amount-val">' + esc(String(it.r.qtyFlag.expected)) + '</div></div>' +
        '</div>' +
        /* 분할 배분·파손 등 정당한 사유가 있을 수 있다 — 사유 해소 경로가 그것 */
        '<div class="amount-calc">불일치. 아래에 사유를 남겨 해소하세요.' +
        (c.distMemo ? ' · 배분결정 메모: “' + esc(c.distMemo) + '”' : '') + '</div>' +
        '</div>';
    } else if (rc.qty){
      h += '<div class="item-meta">인수증 수량이 일치합니다 · ' + esc(String(rc.qty)) +
        (c.distMemo ? ' · 배분결정 메모: “' + esc(c.distMemo) + '”' : '') + '</div>';
    }
  }

  /* ── [2026-08-31] 실제 AI 판정 (E1) ──
     it.r.ai(미리 써둔 데모 문장)와 it.r.aiJudge(진짜 판정)는 같은 자리를 쓴다.
     진짜 판정이 있으면 데모 문장은 물러난다 — 둘을 같이 띄우면 어느 쪽이 실제인지 알 수 없다. */
  if (it.r.extracting && !it.r.aiJudging){
    h += '<div class="mt8"><span class="ai-chip"><span class="spin"></span> 서류 값 읽는 중…</span></div>';
  }
  if (it.r.aiJudging){
    h += '<div class="mt8"><span class="ai-chip"><span class="spin"></span> AI 판독 중…</span>' +
      '<div class="item-meta mt8">보통 3~11초 걸립니다</div></div>';
  } else if (it.r.aiJudge){
    h += aiJudgeBlock(c, it, it.r.aiJudge);
  } else if ((st.code === 'unc' || st.code === 'miss') && it.r.ai){
    h += '<div class="mt8"><span class="ai-chip">AI 의견 · 시뮬레이션</span>' +
      '<div class="item-meta mt8">"' + esc(it.r.ai) + '"</div></div>';
  }
  /* 금액 대조 카드 (데모 데이터 it.r.calc 기반)
     ★ 진짜 AI 판정이 있으면 그리지 않는다 — 이 카드의 숫자는 db.js 에 박아둔 데모값이라
       실제 판정이 읽은 금액과 어긋난다. 둘을 나란히 띄우면 담당자가 어느 쪽이 실제
       서류 금액인지 알 수 없다(2026-08-31 화면 확인에서 발견). */
  if (st.code === 'unc' && it.r.calc && !it.r.aiJudge){
    var b = it.r.calc.book, f = it.r.calc.fair;
    var ratio = (f ? (b / f) : 0).toFixed(1);
    h += '<div class="amount-card"><div class="amount-title">금액 대조 · 신고 ↔ 증빙</div>' +
      '<div class="amount-grid">' +
      '<div class="amount-box"><div class="amount-label">폼 · 신고 장부가액</div><div class="amount-val">' + won(b) + '</div></div>' +
      '<div class="amount-vs">↔</div>' +
      '<div class="amount-box"><div class="amount-label">첨부 · 증빙 금액</div><div class="amount-val">' + won(f) + '</div></div>' +
      '</div>' +
      '<div class="amount-calc">신고 ' + won(b) + ' ÷ 증빙 ' + won(f) + ' ≈ <b>' + ratio + '배</b> ▲ 불일치 — 접수 내용과 첨부 내용 불일치는 감사 지적 사항 (기관 업무지침)</div>' +
      '</div>';
  }
  /* 해소 딱지 / 해소 액션 */
  if (it.r.resolution && it.r.resolution.reason){
    h += '<div class="res-line">사유해소 · ' + esc(it.r.resolution.date) + ' · ' + esc(it.r.resolution.by) +
      ' · "' + esc(it.r.resolution.reason) + '" <span class="res-keep">감사 이력에 남습니다</span></div>';
  } else if (st.code === 'unc' && !it.r.ai && !it.r.broken && !it.r.qtyFlag &&
             ((it.r.donorUpload && it.r.donorUpload.status === 'uploaded') ||
              (it.r.orgUpload && it.r.orgUpload.status === 'uploaded') ||
              (it.r.fileIds && it.r.fileIds.length))){   /* 담당자가 올린 파일만 있는 항목도(수취 취소 뒤 · 2026-09-12) */
    /* 제출은 됐고 AI가 지적한 것도 없는 항목 — 담당자가 내용만 확인하면 된다.

       ★ 원본 확인을 **기본 경로로** (2026-09-07 · 설계서 §4 D)
         전에는 길이 둘이었다 — [✓ 확인 후 수취 처리] 1클릭 vs [원본 보고 처리]→모달→승인 2클릭.
         **성실한 쪽이 손해였다.** 감사 대응이 이 제품의 목적인데 확인을 건너뛰는 경로가 더 짧았다.
         이제 볼 원본이 있으면 그 길 하나만 남긴다. 승인은 모달 안에서 한다(common.js — 이미 있던 자리).
       ⚠️ **버튼을 지우는 게 아니라 옮기는 것이다.** 볼 원본이 없는 항목(파일 없이 제출된 것)에서는
         그대로 남긴다 — 없애면 그런 항목을 영영 처리할 수 없다. */
    var hasOriginal = !!(it.r.fileIds && it.r.fileIds.length) || !!rc;
    /* AI 가 '확인 권장' 인 항목 — 원본 보기 창에서 사유(선택)를 남길 수 있다는 것을 미리 말한다 (2026-09-12 선미 · #309) */
    if (aiFlagged(it)) h += '<div class="item-meta mt8">AI가 지적한 항목입니다 — 원본을 보고 처리하면서 확인한 사유를 남길 수 있습니다(선택).</div>';
    h += '<div class="row mt12" style="gap:8px;align-items:center">' +
      (it.r.fileIds && it.r.fileIds.length
        ? '<button class="btn pri sm" onclick="openViewer(' + esc(JSON.stringify(it.r.fileIds)) + ',0,\'' +
          c.id + '\',\'' + esc(it.uid) + '\')">원본 보고 처리</button>' : '') +
      (rc ? '<button class="btn ' + (it.r.fileIds && it.r.fileIds.length ? 'soft' : 'pri') + ' sm" onclick="openReceipt(\'' + c.id + '\',\'' + it.uid + '\')">원문 보고 처리</button>' : '') +
      (hasOriginal ? ''
        : '<button class="btn pri sm" onclick="confirmUpload(\'' + c.id + '\',\'' + it.uid + '\')">✓ 확인 후 수취 처리</button>') +
      /* ★ 잘못 낸 서류를 새로 받아 담당자가 대신 올리는 길 (2026-09-12 선미) — 9/11 단계 개편 뒤 제출된 항목에서는
           [수취 등록] 이 사라져 있었다(실행 전 행에만 있었다). uid 를 실어 그 항목으로 간다. */
      '<button class="btn ghost sm" onclick="go(\'receive\',\'' + c.id + '\',\'' + esc(it.uid) + '\')">다른 서류로 수취 등록</button>' +
      '</div>';
  } else if (st.code === 'unc' && it.kind === 'S'){
    h += '<div class="row mt12" style="gap:8px;align-items:center">' +
      '<button class="btn ghost sm" onclick="openIntake(\'' + c.id + '\')">신청서 원문 보기</button>' +
      '<button class="btn pri sm" onclick="confirmFormDoc(\'' + c.id + '\',\'' + it.uid + '\')">✓ 내용 확인 완료</button>' +
      '</div>';
  } else if (st.code === 'unc'){
    h += '<div class="row mt12" style="gap:8px">' +
      (rc ? '<button class="btn ghost sm" onclick="openReceipt(\'' + c.id + '\',\'' + it.uid + '\')">인수증 원문 보기</button>' : '') +
      '<button class="btn ghost sm" onclick="go(\'receive\',\'' + c.id + '\',\'' + esc(it.uid) + '\')">다른 서류로 수취 등록</button></div>' +   /* (2026-09-12) */
      '<div class="row mt12" style="gap:8px;align-items:center">' +
      '<input type="text" id="res-' + esc(it.uid) + '" placeholder="해소 사유 · 예: 후원처 통화로 가액 산정 경위 확인" style="flex:1;min-width:220px;padding:8px 10px;border:1.5px solid var(--line);border-radius:9px;font-size:15px">' +
      '<button class="btn ghost sm" onclick="resolveItem(\'' + c.id + '\',\'' + it.uid + '\')">사유로 해소</button></div>';
  } else if (st.code === 'miss'){
    h += '<div class="row mt12" style="gap:8px"><button class="btn ghost sm" onclick="go(\'receive\',\'' + c.id + '\',\'' + it.uid + '\')">수취 등록으로</button></div>';
  }
  if (it.kind === 'S' && st.code === 'done'){
    h += '<div class="row mt12" style="gap:8px"><button class="btn ghost sm" onclick="openIntake(\'' + c.id + '\')">신청서 원문 보기</button></div>';
  }
  if (rc && (st.code === 'done' || st.code === 'res')){
    h += '<div class="row mt12" style="gap:8px"><button class="btn ghost sm" onclick="openReceipt(\'' + c.id + '\',\'' + it.uid + '\')">인수증 원문 보기</button></div>';
  }
  /* ★ 수취 취소 (2026-09-12 선미) — [원본 보고 처리] 를 잘못 눌러도 되돌릴 길이 없었다. 완결 전 첨부 항목만.
       되돌리면 파일은 그대로 두고 상태만 '제출됨 · 확인 전'(또는 미수취) 로 간다 — 배분처 잠금(distLocked)도 같이 풀린다. */
  if (it.kind === 'A' && (st.code === 'done' || st.code === 'res') && c.state !== '완결'){   /* 사유해소도 되돌린다 (선미 9/12) */
    h += '<div class="row mt12" style="gap:8px"><button class="btn ghost sm" onclick="undoReceived(\'' + c.id + '\',\'' + esc(it.uid) + '\')">수취 취소</button></div>';
  }
  /* 인수증 PDF(수령자명·서명이 든 유일한 서류 · 2026-09-05) — 이 배분처 것만. 새로고침 뒤에는 rc(orgUpload.receipt)가 없으므로
     PDF 목록으로 판단한다. rc 가 있는데 PDF 가 없으면 경고(기관 재제출 요청), 둘 다 없으면 조용히 */
  if (it.key === 'inss'){
    var rpb = formPdfButtonsHtml(c, 'receipt', it.distId, !rc);
    if (rpb) h += '<div class="row mt8" style="gap:8px;align-items:center;flex-wrap:wrap">' + rpb + '</div>';
  }
  return h + '</div>';
}
/* ── 진행 단계 · 6칸 (2026-09-11 선미 · 시안 C · 설계 10-planning/case-detail-steps-design-20260911.md) ──
   ★ 새 기준이 아니다 — caseStateKey() 여섯 상태를 칸에 대응시킬 뿐이다. 목록 구간(caseStage)·판정 배지(casePill)와
     같은 함수를 보므로 갈릴 수 없다("배분검수 탭인데 후원접수중" 이 날 수 없다 · 9/5 규칙).
     ④/⑤ 의 갈림은 stageDetail() 이 쓰는 판단(기관 제출이 올라왔나) 그대로다.
   ★ DB.tab 이 단계 id 면 그 단계, 아니면 'auto' = 지금 단계.
     옛 값('receipts'·'checklist')도 자동으로 읽힌다 — go() 기본값·세션 복원·수취 등록 뒤 go('case', id) 가
     한 줄도 안 바뀌는 이유다. 다른 건을 열면 go() 가 'auto' 로 되돌린다.
   ★ 취소 건은 null — 흐름 밖의 건이라 단계가 없다. 진행바를 안 그리고 전부 그린다.
   ★ [수취 현황] 탭(viewCaseReceipts)은 없어졌다 — 행 그리기는 receiptRow, 집계는 recvSummary 로 갈라져
     각 단계 안에 들어갔다. 기능은 하나도 안 줄었다: 검수 실행 전에도 서류가 보이고 항목 옆 [수취 등록] 이 uid 를 싣는다. */
var CASE_STEPS = [
  {id:'donorRecv',  t:'후원자 서류 수취'},
  {id:'donorCheck', t:'후원자 서류 검수'},
  {id:'distDecide', t:'배분기관 지정'},
  {id:'distRecv',   t:'배분처 서류 수취'},
  {id:'distCheck',  t:'배분처 서류 검수'},
  {id:'done',       t:'완결'}
];
function stepIndex(id){ for (var i = 0; i < CASE_STEPS.length; i++) if (CASE_STEPS[i].id === id) return i; return -1; }
function caseStepOf(c, res){
  if (!c || c.state === '취소') return null;
  var k = caseStateKey(c, res);
  if (k === '완결확정') return 'done';
  if (k === '완결가능') return 'distCheck';
  if (k === '배분진행'){
    var up = distPendingItems(c).some(function(it){ return it.r.orgUpload && it.r.orgUpload.status === 'uploaded'; });
    return up ? 'distCheck' : 'distRecv';
  }
  if (k === '후원자서류완비') return 'distDecide';
  if (k === '미완결') return 'donorCheck';
  return 'donorRecv';                                   /* 검수대기 — 제출 대기 · 필수정보 미입력 */
}
function caseStepSel(c, res){
  var now = caseStepOf(c, res);
  if (!now) return null;
  return stepIndex(DB.tab) >= 0 ? DB.tab : now;
}
/* 빵부스러기용 — common.js currentTitle 이 부른다 */
function caseStepLabel(){
  var c = getCase(DB.caseId);
  if (!c) return '';
  var i = stepIndex(caseStepSel(c, inspectView(c, TODAY)));
  return i >= 0 ? (i + 1) + ' ' + CASE_STEPS[i].t : '';
}
function donorItems(c){ return ((c && c.checklist) || []).filter(function(it){ return it.included && it.stage !== '배분'; }); }
function doneCount(its){ return its.filter(function(it){ var k = itemStatus(it).code; return k === 'done' || k === 'res'; }).length; }

function stepBar(c, res){
  var now = caseStepOf(c, res);
  if (!now) return '';
  var sel = caseStepSel(c, res), ni = stepIndex(now);
  var donor = donorItems(c), dist = distItems(c), orgs = liveDists(c).length;
  /* 칸 밑 한 줄 — 전부 지금 체크리스트에서 센다. 따로 저장하는 값이 없다 */
  var caps = {
    donorRecv:  c.awaitingSubmit ? '제출 대기' : donor.length ? donor.length + '장' : '—',
    donorCheck: donor.length ? doneCount(donor) + '/' + donor.length + ' 확정' : '—',
    distDecide: orgs ? orgs + '곳' : '미지정',
    distRecv:   dist.length ? doneCount(dist) + '/' + dist.length + ' 수취' : '—',
    distCheck:  dist.length ? doneCount(dist) + '/' + dist.length + ' 확정' : '—',
    done:       c.state === '완결' ? '완결' : '대기'
  };
  return '<div class="stepbar" role="tablist">' + CASE_STEPS.map(function(s, i){
    var cls = i < ni ? 'done' : i === ni ? 'now' : 'todo';
    return '<button class="sb ' + cls + '" role="tab" aria-selected="' + (s.id === sel ? 'true' : 'false') + '"' +
      ' onclick="switchTab(\'' + s.id + '\')">' +
      '<span class="sb-t">' + secN(i + 1) + esc(s.t) + '</span>' +
      '<span class="sb-c">' + esc(caps[s.id]) + '</span></button>';
  }).join('') + '</div>';
}

/* 수취 현황 행 — 검수 실행 **전**의 항목 한 줄 (전에는 [수취 현황] 탭이 그렸다 · 2026-09-11 자리만 옮김)
   담당자 수취 기록이 항목을 확정하는 유일한 경로다 — 기관 업로드는 알림일 뿐. 화면에는 안 쓴다(문구 규칙 9/5) */
function receiptRow(c, it){
  var st = itemStatus(it);
  var up = it.r.orgUpload || {};
  var pill = st.tone || {done:'ok', miss:'dg', unc:'warn', res:'info'}[st.code];   /* 제출됨·확인 전은 회색 (9/11 A안) */
  return '<div class="doc-row"><div class="di">' + (it.kind === 'F' ? '🧮' : '📄') + '</div>' +
    '<div style="flex:1"><b>' + esc(it.n) + ' ' + layerBadge(it.kind, false) + '</b>' +
    '<small>' + (it.r.file ? esc(it.r.file) : '첨부 없음') + '</small>' +
    (up.status === 'uploaded' ? '<small>배분기관 업로드 ' + esc(up.date) + '</small>' : '') +
    '</div><div class="st"><span class="pill ' + pill + '"><span class="pd"></span>' + st.status + '</span>' +
    /* ★ 진입점은 **그 항목 옆에** (설계서 §4 F · 2026-09-06) — 뭉뚱그린 [수취 등록] 은 uid 없이 가서
         viewReceive 가 첫 대기 항목을 고른다(2026-09-05 오처리). 항목 옆에 두면 그 경로 자체가 없다. */
    (st.code === 'miss' || st.code === 'unc'
      ? '<button class="btn ghost sm mt8" onclick="go(\'receive\',\'' + c.id + '\',\'' + it.uid + '\')">수취 등록</button>'
      : '') +
    '</div></div>';
}
/* 수취 요약표 — [수취 현황] 탭이 하던 집계. 단계 머리에 한 번
   ★ 세 수만 센다 (2026-09-12 선미 · #308 실주행) — 받을 서류 · 들어온 서류 · 확정.
     전에는 "수취필요 · 수취완료 · 확인 전 · 미수취" 였는데 '수취완료' 가 **담당자 확정 수**(F2 규칙)라
     후원자가 다 냈는데도 2 로 떠서 "왜 수취가 2냐" 로 읽혔다. '들어온 서류' 는 파일이 와 있는 수(미수취가 아닌 것),
     '확정' 은 담당자가 원본을 보고 수취 처리한 수(사유해소 포함) — 진행바의 "2/5 확정" 과 같은 수다.
     미수취 = 받을 서류 − 들어온 서류라 열을 따로 두지 않는다. 덜 들어왔으면 들어온 수를 빨갛게. */
function recvSummary(rows){
  return '<div class="card mb16"><div class="card-h"><h3>수취 요약</h3></div><div class="card-b" style="padding:4px 10px">' +
    '<table class="tbl recv-sum"><thead><tr><th>구분</th><th class="num">받을 서류</th><th class="num">들어온 서류</th><th class="num">담당자 확정</th></tr></thead><tbody>' +
    rows.map(function(r){
      var got = r.its.filter(function(it){ return itemStatus(it).code !== 'miss'; }).length;
      var done = doneCount(r.its), need = r.its.length;
      /* ★ 부족분이 **선택 항목뿐이면** 빨갛게 하지 않는다 (2026-09-15 선미 · 후보 ① 자리 ②)
           전에는 got < need 하나로 판단해서, 결과보고서(선택 항목) 하나 때문에 **완결한 건도**
           들어온 서류 수가 빨갛게 섰다. 인수증·물품사진이 안 왔으면 그대로 빨갛다 — 완화가 번지지 않는다.
         ⚠️ 수는 줄이지 않는다(3 을 2 로 만들지 않는다) — 안 온 것을 왔다고 하는 셈이다. 색만 내린다. */
      var missBlk = r.its.filter(function(it){ return itemStatus(it).code === 'miss' && blocksComplete(it); }).length;
      return '<tr><td>' + esc(r.k) + '</td><td class="num">' + need + '</td>' +
        '<td class="num">' + (missBlk ? '<b style="color:var(--danger)">' + got + '</b>' : got) + '</td>' +
        '<td class="num">' + (done < need ? done : '<b style="color:var(--g-primary-d)">' + done + '</b>') + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
}
/* 기관별 묶음 — **이름**으로 묶는다. decideDist 가 만든 항목(distId) 과 옛 원장의 항목(g 에 기관명) 이 한 기관일 수 있다 */
function orgGroups(c){
  var K = COL.distribution, names = {}, order = [], groups = {};
  (c.dists || []).forEach(function(d){ names[String(d.id)] = d[K.orgName] || d.orgName || ''; });
  distItems(c).forEach(function(it){
    var nm = (it.distId != null && names[String(it.distId)]) || String(it.g || '').replace(/^배분처 수취\s*[—-]\s*/, '') || '배분처';
    if (!groups[nm]){ groups[nm] = {name:nm, its:[]}; order.push(nm); }
    groups[nm].its.push(it);
  });
  return order.map(function(n){ return groups[n]; });
}
/* 기관 하나 = 아코디언 하나. 한 곳뿐이면 펼침(접을 것이 없다) · 여럿이면 미처리 있는 곳만 펼침 · 완결 건은 전부 접음 */
function orgAccordion(g, rowOf, single, forceClosed){
  var pend = g.its.filter(function(it){ var k = itemStatus(it).code; return k === 'miss' || k === 'unc'; }).length;
  var open = forceClosed ? false : (single || pend > 0);
  /* ★ 선택 항목(결과보고서)만 안 왔으면 빨간 '미수취' 를 붙이지 않는다 (2026-09-15 선미 · 후보 ① 자리 ③)
       전에는 완결한 건을 열어도 기관 이름 옆에 빨간 '미수취 1' 이 붙어 있었다.
     ⚠️ '다 받음' 으로 바꾸지 않는다 — 결과보고서는 정말 안 왔다. 낱말과 색만 내린다.
     ⚠️ 순서가 중요하다 — pend 는 miss 와 unc 를 함께 세므로, 선택 항목 하나만 남은 건에
        먼저 걸리면 '확인 전 1' 이라고 거짓을 말한다. 그래서 unc 를 따로 센다. */
  var missBlk = g.its.filter(function(it){ return itemStatus(it).code === 'miss' && blocksComplete(it); }).length;
  var missOpt = g.its.filter(function(it){ return itemStatus(it).code === 'miss' && !blocksComplete(it); }).length;
  var uncN    = g.its.filter(function(it){ return itemStatus(it).code === 'unc'; }).length;
  var pill = missBlk ? '<span class="pill dg"><span class="pd"></span>미수취 ' + missBlk + '</span>'
           : uncN    ? '<span class="pill neu"><span class="pd"></span>확인 전 ' + uncN + '</span>'
           : missOpt ? '<span class="pill neu"><span class="pd"></span>선택 항목 ' + missOpt + '</span>'
                     : '<span class="pill ok"><span class="pd"></span>다 받음</span>';
  return '<details class="org-acc"' + (open ? ' open' : '') + '><summary>' +
    '<span class="oa-n">' + doneCount(g.its) + '/' + g.its.length + '</span>' +
    /* 누르면 펼쳐진다는 표식 — 글자(펼치기/접기)는 CSS 가 상태에 맞춰 붙인다 (2026-09-12 선미) */
    '<span>' + esc(g.name) + '</span>' + pill + '<span class="oa-tog"><span class="oa-tog-t"></span><span class="oa-chev">›</span></span></summary>' +
    '<div class="oa-b">' + g.its.map(rowOf).join('') + '</div></details>';
}
function excludedCard(c){
  var ex = (c.checklist || []).filter(function(it){ return !it.included; });
  if (!ex.length) return '';
  return '<div class="card mt16 mb16"><div class="card-h"><h3>제외된 항목</h3></div><div class="card-b">' +
    ex.map(function(it){
      return '<div class="doc-row"><div class="di">—</div><div><b>' + esc(it.n) + '</b><small>' + esc(it.excludeReason || '') + '</small></div></div>';
    }).join('') + '</div></div>';
}
function stepEmptyCard(){ return '<div class="card mb16"><div class="card-b muted small">아직 이 단계의 서류가 없습니다.</div></div>'; }

/* 단계 본문 — sItems 의 ③ 자리에 무엇을 넣나 (골격 §4 F 의 자리는 그대로다) */
function stepItemsBlock(c, res, step, inspected){
  var rowOf = inspected ? function(it){ return itemCard(c, it); } : function(it){ return receiptRow(c, it); };
  /* 실행 전 행(doc-row)은 카드 안에 · 실행 후 항목 카드(item-card)는 그 자체가 카드다 */
  var wrap = inspected ? function(s){ return s; } : function(s){ return s ? '<div class="card mb16"><div class="card-b">' + s + '</div></div>' : ''; };
  var donor = donorItems(c);
  var donorBlock = function(){
    return recvSummary([{k:'후원자 서류', its:donor}]) + wrap(donor.map(rowOf).join('')) + (inspected ? excludedCard(c) : '');
  };
  var distBlock = function(forceClosed){
    var groups = orgGroups(c);
    if (!groups.length) return '<div class="card mb16"><div class="card-b muted small">배분기관이 아직 없습니다 — ③ 배분기관 지정에서 정합니다.</div></div>';
    /* [배분기관 제출 화면 미리보기] 는 증빙 제출 링크 카드(orgLinkBlock) 머리로 옮겼다 (2026-09-12 선미) —
         링크를 만드는 자리에서 그 링크가 여는 화면을 본다. 완결에는 뜰 이유가 없었다. */
    return recvSummary(groups.map(function(g){ return {k:g.name, its:g.its}; })) +
      groups.map(function(g){ return orgAccordion(g, rowOf, groups.length === 1, forceClosed); }).join('');
  };
  if (step === null) return donorBlock() + (distItems(c).length ? distBlock(false) : '');   /* 취소 건 — 전부 */
  if (step === 'donorRecv' || step === 'donorCheck') return donorBlock();
  if (step === 'distDecide'){
    /* ★ [배분기관] 카드는 뺐다 (2026-09-12 선미) — 아래 [배분 현황](sDist · distStatusCard) 이 어디에 몇 개인지를
         수량 수정·배분 취소와 함께 이미 말한다. 같은 것을 두 번 그렸다. 지정 전에만 한 줄 남긴다. */
    if (liveDists(c).length) return '';
    return '<div class="card mb16"><div class="card-b muted small">' +
      (res.canDecideDist ? '아직 지정 전입니다 — 아래 [배분결정] 에서 정합니다.' : '후원자 서류 검수가 끝나면 지정할 수 있습니다.') +
      '</div></div>';
  }
  if (step === 'done'){
    /* ⑥ 완결 — 후원자 서류도 기관과 같은 아코디언으로, 전부 접어서 (2026-09-12 선미) */
    return recvSummary([{k:'후원자 서류', its:donor}]) +
      orgAccordion({name:'후원자 서류', its:donor}, rowOf, false, true) +
      (inspected ? excludedCard(c) : '') +
      (distItems(c).length ? distBlock(true) : '');
  }
  return distBlock(false);                                                         /* distRecv · distCheck */
}
/* [v6] 배분기관 증빙 제출 링크 발급 카드 — 접수 링크와 같은 3중 방어(본인확인·제출 시 폐기·재열람 불가) */
/* ★ 기관이 둘 이상인 건인가 — 링크 제출 동선을 쓸 수 없는 건이다 (2026-09-01 판단 · 2026-09-02 문구 반영)
     링크는 건당 1개고 주소·제출 폼에 기관이 들어 있지 않아, 다기관에서 발급하면
     어느 기관이 낸 것인지 가릴 수 없다. orgLinkBlock 이 발급 자체를 막는다.
   ⚠️ 화면 안내 문구도 이 함수로 함께 갈라야 한다 —
     버튼만 막고 안내가 "링크를 발급하세요" 로 남으면 담당자는 없는 버튼을 찾는다.
     (실제로 9/2 브라우저 확인에서 안내 3곳이 그대로 남아 있었다) */
function isMultiOrg(c){ return ((c && c.dists || []).length > 1); }

/* ── 배분 증빙 링크 — 기관마다 한 장 (2026-09-03 · 선미 대리님 요청서 ②) ──────────
   ★ 전에는 c.orgLink 가 **건당 1장**이라 세 기관에 각각 보낼 수 없었다.
     그래서 다기관이면 발급 자체를 막고 [수취 등록]으로 돌렸다(791062e·875d38f).
     이제 access_link 가 배분처마다 한 장을 만든다 — 그 차단을 걷고 기관마다 발급한다.
   ★ 자기 몫만 보이는 것은 화면이 아니라 링크가 보장한다 —
     orgSlots 가 DB.linkEntry.distId 로 좁힌다(선미 b6b861d). 그래서 켤 수 있다.

   ⚠️ 토큰은 발급 때 한 번만 돌려받는다. 새로고침하면 사라지는 것이 정상이고 재발급이 정답이다.
     그래서 **주소는 방금 발급한 것만** 보여준다. 상태(발급됨·제출됨·무효)는 DB 에서 읽는다. */
function orgLinksOf(c){
  /* 한 번만 읽고 건에 붙여 둔다. 없으면 읽어와 다시 그린다. */
  if (c.orgLinks) return c.orgLinks;
  /* ★ DB 에 없는 건(데모)은 '읽는 중' 이 아니라 '아직 없음' 이다 — 빈 배열을 준다.
       null 을 주면 발급 UI 가 영영 안 뜬다. 시연이 데모 모드로 돌기 때문에
       이걸 null 로 두면 **화면에서 링크 기능이 통째로 사라진다.** */
  if (!c.dbId) return [];
  if (c.orgLinksLoading) return null;
  c.orgLinksLoading = true;
  loadAccessLinks(c).then(function(rows){
    c.orgLinks = (rows || []).filter(function(r){ return r[COL.accessLink.purpose] === 'dist_proof'; });
    c.orgLinksLoading = false; render();
  }).catch(function(err){
    c.orgLinks = []; c.orgLinksLoading = false;
    console.error('[링크] 발급 상태를 읽지 못했습니다:', (err && err.message) || err);
    render();
  });
  return null;
}
function orgLinkFor(c, distId){
  var rows = c.orgLinks || [];
  return rows.filter(function(r){
    return String(r[COL.accessLink.distributionId]) === String(distId);
  }).slice(-1)[0] || null;      /* 재발급하면 여러 장 — 마지막 것이 현재 링크다 */
}
function distOf(c, distId){
  return ((c && c.dists) || []).filter(function(d){ return String(d.id) === String(distId); })[0] || null;
}
function setOrgVerify(caseId, distId, v){
  var d = distOf(getCase(caseId), distId);
  if (d){ d.verifyDraft = v; render(); }
}
/* 발급 — 이미 살아 있는 링크가 있으면 먼저 무효화한다.
   ⚠️ 안 그러면 옛 링크가 계속 열린다. 재발급의 뜻이 '앞의 것을 못 쓰게' 이므로 그 순서가 맞다. */
function issueOrgLinkFor(caseId, distId){
  if (writeBlocked()) return;
  var c = getCase(caseId), d = distOf(c, distId);
  if (!c || !d) return;
  if (/^sd\d+$/.test(String(distId))){
    /* 저장 전에 발급하면 어느 기관 것인지 모르는 링크가 생긴다 — 화면에는 안 쓴다 */
    DB.toast = {msg:'배분처가 아직 저장되지 않았습니다. 잠시 뒤 다시 누르세요.'};
    render(); return;
  }
  var v = String(d.verifyDraft || '').trim();
  if (!/^\d{4}$/.test(v)){
    /* 링크 유출에 대비한 접근통제 — 화면에는 안 쓴다 */
    DB.toast = {msg:'본인확인 값을 넣어야 발급됩니다'};
    render(); return;
  }
  var old = orgLinkFor(c, distId);
  var before = (old && accessLinkState(old) === 'ok')
    ? revokeAccessLink(old[COL.accessLink.id]) : Promise.resolve();
  before.then(function(){
    return issueAccessLink(c, {purpose:'dist_proof', distId:distId, verifyLast4:v});
  }).then(function(r){
    d.linkToken = r.token;
    c.orgLinks = null;                    /* 상태를 다시 읽는다 */
    DB.toast = {msg:esc0(d[COL.distribution.orgName] || d.orgName) + ' 링크를 발급했습니다',
                cap:'주소는 지금 한 번만 보입니다'};
    render();
  }).catch(function(err){
    DB.toast = {msg:'링크를 발급하지 못했습니다', cap:(err && err.message) || String(err)};
    render();
  });
}
function copyOrgLinkFor(caseId, distId){
  var d = distOf(getCase(caseId), distId);
  var url = (d && d.linkToken) ? accessUrl(d.linkToken) : '';
  if (!url){ DB.toast = {msg:LINK_LOST_MSG}; render(); return; }
  var ok = copyToClipboard(url);
  DB.toast = ok ? {msg:esc0(d[COL.distribution.orgName] || d.orgName) + ' 링크를 복사했습니다', cap:url}
                : {msg:'자동 복사가 막혔습니다. 링크 칸의 주소를 직접 복사하세요.', cap:url};
  render();
}
/* 토스트는 esc 를 거치지 않는 자리라 문자열만 안전하게 꺼낸다 */
function esc0(v){ return String(v == null ? '' : v); }

function orgLinkBlock(c){
  /* 받을 증빙이 남아 있을 때만 보여준다 — 전부 수취된 건(완결 등)에는 뜨지 않는다.
     ★ 배분처마다 카드 하나. 단일 기관이면 카드도 하나라 예전 모양과 같다. */
  var dists = liveDists(c);                       /* 취소된 배분처에는 링크 자리를 주지 않는다 (2026-09-11 선미 실측 · 이름 없는 카드) */
  if (!distPendingItems(c).length || !dists.length) return '';
  var links = orgLinksOf(c);        /* null 이면 아직 읽는 중 */

  var body = dists.map(function(d){
    var pend = distItems(c).filter(function(it){
      return it.kind === 'A' && String(it.distId) === String(d.id) && itemStatus(it).code !== 'done';
    });
    var L  = links ? orgLinkFor(c, d.id) : null;
    var st = L ? accessLinkState(L) : 'none';
    var unsaved = /^sd\d+$/.test(String(d.id));

    var orgNm = d[COL.distribution.orgName] || d.orgName || '기관';   /* DB 에서 읽은 배분처는 org_name 열이다 — d.orgName 만 보면 빈칸 (2026-09-12 선미 실주행) */
    return '<div class="item-card' + (st === 'used' ? ' st-done' : '') + '">' +
      '<div class="item-head"><b>' + esc(orgNm) + '</b>' +
      '<span class="pill ' + (st === 'used' ? 'ok' : st === 'ok' ? 'info' : 'neu') + '">' +
        '<span class="pd"></span>' +
        (st === 'used' ? '제출 완료' : st === 'ok' ? '링크 발급됨' :
         st === 'revoked' ? '무효화됨' : st === 'expired' ? '기간 지남' : '미발급') + '</span>' +
      (pend.length ? '<span class="tag">받을 증빙 ' + pend.length + '건</span>' : '') +
      '</div>' +
      (links === null
        ? '<div class="item-meta">발급 상태를 읽는 중…</div>'
        /* 제출과 동시에 링크가 폐기된다 · 기관은 본인확인 뒤 자기 몫만 연다 · 재발급하면 앞 링크는 무효 —
           화면에는 다음 클릭만(문구 규칙 9/5). 새 탭에 붙여넣는 길은 심사위원·첫 담당자의 유일한 동선이라 남긴다(0-A). */
        : unsaved
        ? '<div class="item-meta">배분처 저장 뒤에 발급할 수 있습니다</div>'
        : st === 'used'
        ? '<div class="item-meta">기관이 제출했습니다. 위 항목에서 확인 후 수취 처리하세요.</div>'
        : st === 'ok'
        ? (d.linkToken
            ? '<div class="row mt8" style="gap:8px;align-items:center">' +
              '<input type="text" readonly value="' + esc(accessUrl(d.linkToken)) + '" style="flex:1;min-width:200px">' +
              '<button class="btn pri sm" onclick="copyOrgLinkFor(\'' + c.id + '\',\'' + d.id + '\')">링크 복사</button></div>' +
              '<div class="hint">복사한 링크를 기관 담당자에게 보냅니다. 새 탭에 붙여넣으면 기관 화면이 열립니다.</div>'
            : '<div class="item-meta">' + esc(LINK_LOST_MSG) + '</div>') +
          orgIssueRow(c, d, '재발급')
        : (st === 'none' ? '' : '<div class="item-meta">' + esc(LINK_STATE_TEXT[st]) + '</div>') +
          orgIssueRow(c, d, '증빙 제출 링크 발급')) +
      '</div>';
  }).join('');

  return '<div class="card mt16"><div class="card-h"><h3>배분기관 증빙 제출 링크</h3>' +
    '<span class="tag">기관마다 한 장</span></div><div class="card-b">' +
    body +
    /* 미리보기는 링크 아래에 (2026-09-12 선미) — 링크가 여는 화면이 무엇인지 보는 버튼 */
    '<div class="row mt12"><button class="btn ghost sm" onclick="openPreview(\'orgSubmit\',\'' + c.id + '\')">배분기관 제출 화면 미리보기</button></div>' +
    /* ★ "링크를 쓰기 어려운 기관은 담당자가 대신 등록합니다 [수취 등록으로]" 줄을 뺐다
         (설계서 §4 F · 선미 2026-09-06 결정). uid 없이 가는 마지막 진입점이었다 —
         눌러도 담당자가 생각한 인수증이 아니라 **첫 대기 항목**이 열린다.
       ⚠️ 길이 없어진 것은 아니다. 종이 인수증을 대신 올리는 것은
         [수취 현황] 탭에서 그 인수증 항목 옆 [수취 등록] 으로 한다 — 어느 항목인지 실려 간다. */
    '</div></div>';
}
/* 발급 줄 — 본인확인 4자리 + 버튼. 발급과 재발급이 같은 모양이라 한 곳에서 만든다. */
function orgIssueRow(c, d, label){
  return '<div class="row mt8" style="gap:8px;align-items:center;flex-wrap:wrap">' +
    '<input type="text" inputmode="numeric" maxlength="4" placeholder="기관 담당자 연락처 뒷 4자리"' +
    ' style="max-width:220px" value="' + esc(d.verifyDraft || '') + '"' +
    ' onchange="setOrgVerify(\'' + c.id + '\',\'' + d.id + '\',this.value)">' +
    '<button class="btn pri sm" onclick="issueOrgLinkFor(\'' + c.id + '\',\'' + d.id + '\')">' + esc(label) + '</button>' +
    '</div>';
}
function runInspect(){
  /* ①② 대조 자체는 순수 함수라 즉시 끝난다 — 이 두 단계 표시는 무엇과 무엇을 맞춰보는지
     보여주기 위한 진행 연출이고, 외부 통신이 없다.
     ③ [2026-08-31] AI 판정만은 연출이 아니라 진짜 호출이다. 다만 3~11초 걸리므로
        화면 전체를 붙잡지 않는다 — 규칙 대조 결과를 먼저 그려주고, 해당 항목 카드에서만
        '판독 중'으로 돌린다. 실패해도 규칙 대조 결과는 그대로 남는다. */
  var c0 = getCase(DB.caseId);
  var stageNote = judgeableItems(c0 || {}).length ? '' : ' (진행 표시는 데모 연출입니다)';
  DB.inspecting = true; DB.inspectStage = '① 기준 체크리스트를 불러옵니다' + stageNote;
  render();
  setTimeout(function(){ DB.inspectStage = '② 확정 체크리스트·수취 기록과 대조합니다' + stageNote; render(); }, 300);
  setTimeout(function(){
    DB.inspecting = false;
    DB.inspectResult = inspect(getCase(DB.caseId), TODAY);
    DB.inspectCaseId = DB.caseId;
    /* 실행 이력을 건에 남긴다 — 화면을 떠났다 돌아와도 "검수 실행" 게이트로 되돌아가지 않게 */
    var cc = getCase(DB.caseId);
    if (cc) cc.inspectedAt = TODAY;
    render();
    if (cc){
      /* 대조 판정(E2·E3·E7)은 코드로 즉시 나오므로 여기서 바로 저장한다.
         AI 판정(E1)은 응답이 온 뒤 각자 저장된다 — 실행 시각이 다르니 별개의 run 이 맞다. */
      saveCompareFindings(cc);
      startAiJudge(cc);
      startExtract(cc);
    }
  }, 750);
}
/* ── ③ AI 판정 (E1 금액 대조) ────────────────────────────────
   판정 대상 항목을 '한 번에 하나씩' 돌린다. 동시에 쏘면 재시도가 섞였을 때
   분당 한도를 넘기기 쉽고, 화면에도 어느 항목을 읽는 중인지가 안 보인다. */
function startAiJudge(c){
  /* ★ 이미 판정이 있는 항목은 건너뛴다 — '다시 검수'를 눌러도 API를 다시 부르지 않는다.
     시연 중 재호출·429를 막는 핵심 지점이다(결정 #8).
     단, '건너뛰면 안 되는' 두 경우가 있다 (needsJudge 참조) — 지키기만 하다 틀린 걸
     보여주면 재호출을 아낀 의미가 없다. */
  var list = judgeableItems(c).filter(needsJudge);
  if (!list.length) return;
  list.forEach(function(it){ it.r.aiJudging = true; });
  render();
  (function next(i){
    if (i >= list.length) return;
    judgeItemNow(c, list[i]).then(function(){ next(i + 1); });
  })(0);
}
/* 항목 하나를 실제로 판정한다. 결과는 it.r.aiJudge 에 남는다.
   ⚠️ it.r.st(수취 상태)는 절대 건드리지 않는다 — AI는 의견만 낸다(DB설계안 §2-③). */
function judgeItemNow(c, it){
  var fid = judgeableFileId(it);
  var m = fid && FILES[fid];
  if (!m){ it.r.aiJudging = false; render(); return Promise.resolve(); }
  it.r.aiJudging = true; render();
  var d = c.donation || {};
  /* 루브릭 E1의 '시스템 등록 금액'.
     지금은 장부가액을 쓰지만, 8/28 결정 #9(법인=장부가액 / 법인외=시가)에 따라
     선미가 db.js 에 registeredAmount(donation) 헬퍼를 만들면 그쪽으로 넘어간다.
     ★ 여기서 donorType 을 보고 직접 고르지 않는다 — 분기 판단은 db.js 한 곳에서만 한다.
       헬퍼가 생기면 이 화면·api.js·judge.js 는 그대로 두고 자동으로 그 값을 쓴다. */
  var regAmt = (typeof registeredAmount === 'function') ? registeredAmount(d) : d.book;
  /* ★ 바이트를 여기서 받는다 (2026-09-05) — 새로고침 뒤에는 blob 이 없다.
       못 받으면 **판정 실패로 세운다.** 전에는 조용히 돌아갔고, 담당자는
       "AI가 보고 아무 말 없다" 로 읽었다 — 사실은 보지도 않았다. */
  return ensureBlob(fid).then(function(blob){
    if (!blob){
      it.r.aiJudging = false;
      it.r.aiJudge = {state:'error', verdict:null, reason:'', amount:null,
        error:'첨부 파일을 저장소에서 내려받지 못해 AI가 보지 못했습니다 — [다시 판정] 을 눌러 주세요',
        file:m.name, fileId:fid, at:TODAY};
      render();
      return;
    }
    return judgeAttachment({
    docType:      it.n,
    file:         blob,
    formValue:    regAmt ? won(regAmt) : '',
    vatDeduction: (typeof c.vatDeduction === 'boolean') ? c.vatDeduction : null
  }).then(function(r){
    it.r.aiJudging = false;
    it.r.aiJudge = {state:r.state, verdict:r.verdict, reason:r.reason, amount:r.amount,
                    error:r.error, file:m.name, fileId:fid, at:TODAY,
                    model:r.model, promptHash:r.promptHash, status:r.status};
    render();
    /* 매 호출마다 저장한다 (팀 결정 #8 · 선미 확정 8/31) — 성공만이 아니라 실패도 남긴다.
       담당자가 무시한 판정이야말로 남아야 오탐 규칙을 고칠 수 있고, "AI가 무엇을 보고
       무엇을 말했나"가 실행 시점에 박혀야 감사 방어가 된다.
       ★ 화면은 저장을 기다리지 않는다 — 저장이 실패해도 판정은 그대로 보인다. */
    saveInspection(c, it.r.aiJudge, regAmt ? won(regAmt) : null);
    });
  });
}
/* 이 항목을 (다시) 판정해야 하는가 — '검수 실행'이 자동으로 부를지 정한다.
   ① 판정이 없으면 당연히 부른다
   ② ★ 실패는 판정이 아니다 — 429·통신 오류로 못 본 것을 '판정 완료'로 두면
      담당자가 [다시 판정]을 누르기 전까지 영영 안 본다
   ③ ★ 판정한 파일과 지금 붙어 있는 파일이 다르면 다시 본다 —
      금액이 틀려 후원자가 영수증을 다시 제출하는 것은 E1에서 가장 흔한 후속 동작이다.
      옛 파일 기준 판정을 새 파일 옆에 붙여두면 담당자가 잘못된 근거로 판단한다. */
function needsJudge(it){
  var j = it.r.aiJudge;
  if (!j) return true;
  if (j.state === 'error') return true;
  var cur = judgeableFileId(it);
  if (!cur) return false;                       /* 볼 파일이 없다 — 부를 것도 없다 */
  if (j.fileId) return j.fileId !== cur;
  /* DB에서 되살린 판정에는 fileId 가 없다(저장하는 것은 파일'명'뿐).
     그래서 이름으로 비교한다 — 되살린 뒤 새 파일을 올린 경우를 놓치지 않기 위해서다. */
  return (fileMeta(cur).name || '') !== (j.file || '');
}
/* ── 서류 값 뽑기 (E4·E5·E6) ─────────────────────────────────
   판정(E1)과 별개로 돈다. 실패해도 규칙 대조·E1·완결 게이트는 그대로다.
   ★ 이미 뽑아둔 항목은 다시 부르지 않는다 — E1과 같은 규칙(파일이 바뀌면 다시). */
/* ★ 새로고침 뒤에는 facts(뽑은 값)가 없다 — 메모리에만 있었다 (2026-09-10 승희).
     그래서 기관 증빙이 들어와 [검수 실행] 을 다시 누르면 **후원자 서류까지 전부** 다시 AI 를 불렀다
     (E1 판정은 restoreSavedJudgments 가 되살려 건너뛰는데, 값 뽑기는 되살리는 자리가 없었다).
     이제 저장된 판정(inspection_finding · source_file) 에 **지금 붙은 파일 이름으로 남은 E2·E4·E5·E6·E8** 이 있으면
     '이미 읽은 파일' 로 본다 → 새로 온 파일만 부른다. 지적이 하나도 없던 파일은 저장할 행이 없어
     흔적이 안 남았으므로, extractItemNow 가 '판독 완료' 한 줄(E5/E8 이상 없음)을 남기게 했다. */
var RESTORABLE_EXTRACT_RULES = ['E2', 'E4', 'E5', 'E6', 'E8'];
function restoredExtractFindings(c, it){
  if (!c || !it || (it.r && it.r.facts)) return [];          /* 이번 세션 값이 있으면 그것이 정본 */
  var cur = judgeableFileId(it);
  if (!cur) return [];
  var name = fileMeta(cur).name || '';
  if (!name) return [];
  var seen = {}, out = [];
  ((c.savedFindings) || []).forEach(function(f){             /* 최신 실행이 앞 — 규칙마다 첫 것만 */
    if (f.file !== name || RESTORABLE_EXTRACT_RULES.indexOf(f.ruleCode) < 0) return;
    if (seen[f.ruleCode]) return;
    seen[f.ruleCode] = true;
    out.push({rule:f.ruleCode, axis:(f.ruleCode === 'E2') ? '구매→기부' : undefined,
              verdict:f.verdict, reason:f.reason, restored:true,
              isError:(f.verdict === '확인 권장'), blocksComplete:false});   /* 값 뽑기 판정은 원래 전부 비차단 */
  });
  return out;
}
function needsExtract(c, it){
  var f = it.r.facts;
  var cur = judgeableFileId(it);
  if (!f) return !(cur && restoredExtractFindings(c, it).length);
  if (!cur) return false;
  return f.fileId !== cur;
}
function startExtract(c){
  var list = extractableItems(c).filter(function(it){ return needsExtract(c, it); });
  if (!list.length) return;
  list.forEach(function(it){ it.r.extracting = true; });
  render();
  (function next(i){
    if (i >= list.length) return;
    extractItemNow(c, list[i]).then(function(){ next(i + 1); });
  })(0);
}
function extractItemNow(c, it){
  var fid = judgeableFileId(it);
  var m = fid && FILES[fid];
  if (!m){ it.r.extracting = false; render(); return Promise.resolve(); }
  it.r.extracting = true; render();
  /* 값 뽑기도 바이트가 있어야 한다 — 판정과 같은 이유로 여기서 받는다 (2026-09-05) */
  return ensureBlob(fid).then(function(blob){
    if (!blob){
      it.r.extracting = false;
      it.r.factsError = '첨부 파일을 저장소에서 내려받지 못해 값을 읽지 못했습니다';
      render();
      return;
    }
    return extractAttachment({docType: it.n, file: blob}).then(function(r){
    it.r.extracting = false;
    if (r.state === 'error'){
      it.r.factsError = r.error;
    } else {
      it.r.factsError = null;
      it.r.facts = Object.assign({fileId: fid, file: m.name}, r.facts);
      /* 뽑은 값으로 나온 판정을 기록에 남긴다 — E1과 같은 이유(오탐 기록·감사 방어) */
      var found = extractedFindings(c, it, it.r.facts);
      /* ★ 지적이 없어도 '읽었다' 는 한 줄을 남긴다 (2026-09-10 승희) — 없으면 새로고침 뒤 이 파일을
           다시 읽어야 하는지 알 길이 없어 매번 AI 를 다시 불렀다(needsExtract 주석).
           사진 자리는 E8(사진으로 읽힘), 나머지는 E5(서류 종류 · 취득경로와 어긋남 없음) 로 적는다 —
           saveCompareFindings 가 '이상 없음' 도 남기는 것과 같은 이유(무엇을 보고 통과시켰는지). */
      if (!found.length){
        var kind = (it.r.facts && it.r.facts.docKind) || '미상';
        found = [(PHOTO_SLOTS.indexOf(it.key) >= 0)
          ? {rule:'E8', verdict:'이상 없음', isError:false, blocksComplete:false,
             reason:'판독 완료 — 사진으로 읽혔습니다'}
          : {rule:'E5', verdict:'이상 없음', isError:false, blocksComplete:false,
             reason:'판독 완료 — 서류 종류 ' + kind + ' · 지적 사항 없음'}];
      }
      saveInspectionRun(c, {model: r.facts && r.facts.model,
        promptHash: r.facts && r.facts.promptHash, status: 'success'},
        found.map(function(f){
          return {ruleCode:f.rule, verdict:f.verdict, reason:f.reason,
                  amount:it.r.facts.total || it.r.facts.supply, file:m.name,
                  facts:it.r.facts};   /* ★ 뽑은 값 자체를 남긴다 — 새로고침 뒤 되살리기(restoreSavedFacts) 재료 (2026-09-11) */
        }));
    }
    render();
    });
  });
}
/* 항목 카드의 [다시 판정] — 실패했거나 파일을 바꿔 올렸을 때 그 항목만 다시 부른다 */
/* 항목을 못 찾았을 때 담당자에게 알린다 — 조용히 return 하면 "버튼이 안 먹네"로 끝난다.
   db.js 의 itemLookupError() 가 사람이 읽을 수 있는 이유를 준다 (유진 2026-09-01).
   다기관 건에서 uid 없이 부르면 여기로 온다 — 엉뚱한 기관 것을 처리하는 대신 멈추고 알린다. */
function itemMissToast(caseId, ref){
  var msg = itemLookupError(caseId, ref);
  if (msg){ DB.toast = {msg:msg}; render(); }
}
function judgeItem(caseId, key){
  var c = getCase(caseId), it = getItem(caseId, key);
  if (!c) return;
  if (!it){ itemMissToast(caseId, key); return; }
  judgeItemNow(c, it);
}
function resolveItem(caseId, key){
  if (writeBlocked()) return;
  var it = getItem(caseId, key);
  if (!it){ itemMissToast(caseId, key); return; }
  /* ⭐F-1 — '확인필요' 항목만 사유 해소 가능. 미수취(miss)·수취완료(done)·기해소(res)는
     UI 우회 강제 호출로도 해소되지 않는다 (과완결 세탁 경로 차단 · 이중 방어) */
  if (itemStatus(it).code !== 'unc') return;
  var input = el('res-' + key);
  var reason = input ? String(input.value || '').trim() : '';
  if (!reason){ DB.toast = {msg:'해소 사유를 입력해야 합니다'}; render(); return; }
  resolveItemWith(caseId, key, reason);
}
/* 사유가 손에 있을 때 — resolveItem(칸에서 읽음)과 원본 보기 창(viewerConfirm · 선택 사유)이 같이 쓴다 (2026-09-12) */
function resolveItemWith(caseId, key, reason){
  if (writeBlocked()) return;
  var it = getItem(caseId, key);
  if (!it){ itemMissToast(caseId, key); return; }
  if (itemStatus(it).code !== 'unc') return;
  reason = String(reason || '').trim();
  if (!reason) return;
  /* ★ 대조 판정 해소(resolveFinding)와 같은 규칙이다 — 저장돼야 해소된다.
       해소는 완결 게이트를 여는 열쇠라, 저장 안 된 채 화면만 열리면
       담당자는 완결시키는데 DB 에는 근거가 없다.
     ⚠️ 여기서는 '먼저 세워보고 실패하면 되돌린다' 로 간다 —
       resolveFinding 과 달리 이 값은 항목 안(it.r)에 있어 되돌리기가 안전하다. */
  var c = getCase(caseId);
  it.r.resolution = {reason:reason, by:'담당자', date:TODAY};
  DB.toast = {msg:'“' + it.n + '” 사유를 남기고 처리했습니다', auto:true};
  render();
  saveItemStatus(c, it).catch(function(err){
    it.r.resolution = null;                     /* 되돌린다 — 게이트가 열린 채로 두지 않는다 */
    DB.itemSaveErr = DB.itemSaveErr || {};
    DB.itemSaveErr[caseId] = {name:it.n, msg:(err && err.message) || String(err)};
    DB.toast = {msg:'해소 사유를 저장하지 못했습니다. 해소되지 않았습니다.',
                cap:(err && err.message) || String(err)};
    render();
  });
}
/* 대조 판정 사유 해소 — 체크리스트의 resolveItem() 과 같은 규칙을 따른다.
   대조 판정은 어느 서류 슬롯에도 속하지 않아(checklist_item_id = NULL)
   항목의 it.r 을 쓸 수 없다. 그래서 건(c)에 규칙코드로 건다. */
function resolveFinding(caseId, key){
  if (writeBlocked()) return;
  var c = getCase(caseId);
  if (!c) return;
  /* ⭐F-1 과 같은 방어 — 지금 완결을 막고 있는 '판단이 필요한 지적'만 해소된다.
     E7 미달 같은 상태 표시(isError=false)와 이미 해소된 건은 UI 를 우회해
     강제 호출해도 통과하지 않는다 (과완결 세탁 경로 차단 · 이중 방어). */
  var hits = compareBlocking(c).filter(function(x){ return findingKey(x) === key; });
  /* ★ 키 하나에 판정이 둘 이상 걸리면 해소하지 않는다 — 어느 것을 넘긴 것인지
     기록에 남지 않으면 감사 방어가 성립하지 않는다. 키를 더 좁혀야 한다는 신호다. */
  if (hits.length !== 1) return;
  if (!findingResolvable(hits[0])) return;
  if (findingRes(c, key)) return;
  var input = el('resf-' + key);
  var reason = input ? String(input.value || '').trim() : '';
  if (!reason){ DB.toast = {msg:'해소 사유를 입력해야 합니다'}; render(); return; }

  /* ★ 순서가 핵심이다 — 저장이 성공한 뒤에 화면을 해소한다.
       전에는 c.findingRes 에 먼저 쓰고 끝냈다. 그래서 새로고침하면 사라졌는데
       토스트는 "감사 이력에 사유가 그대로 남습니다" 라고 말하고 있었다 —
       담당자는 남았다고 믿고 완결시키는데 DB 에는 근거가 없는 상태다.
       해소는 완결 게이트를 여는 열쇠다(unresolvedBlocking). 저장이 곧 성립 조건이다. */
  DB.resolving = DB.resolving || {}; DB.resolveErr = DB.resolveErr || {};
  DB.resolveDraft = DB.resolveDraft || {};
  DB.resolveDraft[key] = reason;          /* 실패해도 담당자가 다시 타이핑하지 않게 */
  DB.resolving[key] = true; delete DB.resolveErr[key];
  render();

  saveFindingResolution(c, hits[0].rule, reason).then(function(r){
    delete DB.resolving[key]; delete DB.resolveDraft[key];
    c.findingRes = c.findingRes || {};
    c.findingRes[key] = {reason:reason, by:'담당자', date:TODAY};
    DB.toast = {msg:hits[0].rule + ' 판정을 해소했습니다',
      cap:(r && r.demo ? 'DB 미연결 · 저장되지 않았습니다' : '감사 이력에 남습니다')};
    render();
  }).catch(function(err){
    /* 해소하지 않는다. 완결 게이트도 그대로 막혀 있어야 한다 */
    delete DB.resolving[key];
    DB.resolveErr[key] = (err && err.message) || String(err);
    DB.toast = {msg:'해소 사유를 저장하지 못했습니다. 해소되지 않았습니다.',
                cap:DB.resolveErr[key]};
    render();
  });
}
/* [S] 신청서 항목 확정 — 받을 파일이 없으므로 수취 등록이 아니라 '원문 확인'으로 처리한다.
   확인 없이는 확인필요로 남아 완결 게이트를 통과하지 못한다(HITL). */
function confirmFormDoc(caseId, key){
  if (writeBlocked()) return;
  var it = getItem(caseId, key);
  if (!it){ itemMissToast(caseId, key); return; }
  if (it.kind !== 'S') return;
  if (!(it.r.formSubmit && it.r.formSubmit.status === 'submitted')) return;   /* 미제출 건 확정 차단 */
  it.r.st = 'done'; it.r.date = TODAY; it.r.by = '담당자 원문 확인';
  it.r.formSubmit.status = 'confirmed';
  saveItemStatus(getCase(caseId), it).catch(function(err){
    DB.itemSaveErr = DB.itemSaveErr || {};
    DB.itemSaveErr[caseId] = {name:it.n, msg:(err && err.message) || String(err)};
    render();
  });
  DB.toast = {msg:'신청서를 확인 처리했습니다', auto:true};
  render();
}
/* 후원자·배분기관이 올린 첨부의 원클릭 수취 처리 —
   파일은 이미 항목에 붙어 있으므로 수취 등록에서 다시 첨부할 이유가 없다.
   단, AI가 이상을 지적한 항목(r.ai)은 이 경로로 통과시키지 않는다 — 사유 기재로만 해소한다. */
function confirmUpload(caseId, key){
  if (writeBlocked()) return;
  var it = getItem(caseId, key);
  if (!it){ itemMissToast(caseId, key); return; }
  var r = it.r || {};
  var uploaded = (r.donorUpload && r.donorUpload.status === 'uploaded') ||
                 (r.orgUpload && r.orgUpload.status === 'uploaded') ||
                 !!(r.fileIds && r.fileIds.length);   /* 담당자가 올린 파일만 있는 항목(수취 취소 뒤)도 원본을 보고 다시 확정한다 (2026-09-12) */
  if (!uploaded) return;                       /* 제출되지 않은 항목 확정 차단 */
  if (r.ai || r.broken) return;                /* AI 지적 항목은 사유 기재 경로로만 해소 */
  if (r.qtyFlag) return;                       /* 수량 불일치(규칙 대조)도 사유 기재 경로로만 해소 */
  if (itemStatus(it).code !== 'unc') return;
  it.r.st = 'done'; it.r.date = TODAY; it.r.by = '담당자 확인';
  /* ★ DB 에 남긴다 (2026-09-03 · 실주행에서 드러남).
       st='done' 을 세우는 자리가 넷인데 이 하나만 저장을 안 하고 있었다
       (confirmFormDoc·markReceived 는 부른다). 화면은 수취완료인데 새로고침하면
       미수취로 돌아간다 — markReceived 주석이 스스로 경고한
       "담당자가 같은 서류를 두 번 처리한다" 가 이 자리였다.
     화면은 되돌리지 않는다(담당자 판단은 이미 내려졌다). 대신 시끄럽게 알린다. */
  saveItemStatus(getCase(caseId), it).catch(function(err){
    DB.itemSaveErr = DB.itemSaveErr || {};
    DB.itemSaveErr[caseId] = {name:it.n, msg:(err && err.message) || String(err)};
    DB.toast = {msg:'“' + it.n + '” 수취가 저장되지 않았습니다',
                cap:'새로고침하면 미수취로 돌아갑니다'};
    render();
  });
  DB.toast = {msg:'“' + it.n + '” 수취 처리했습니다', auto:true};
  render();
}
/* 수취 취소 — 담당자가 확정한 첨부 항목을 확정 전으로 되돌린다 (2026-09-12 선미).
   ★ 파일·제출 기록은 지우지 않는다. r.st 만 'miss' 로 — 후원자·기관 업로드가 있으면 itemStatus 가
     '제출됨 · 확인 전' 으로 그린다(F2 규칙 그대로). DB 도 같은 값으로 맞춘다(saveItemStatus).
   ⚠️ 완결 건은 못 되돌린다 — 완결은 게이트를 통과한 결과라 항목만 되돌리면 완결이 근거 없이 남는다. */
function undoReceived(caseId, key){
  if (writeBlocked()) return;
  var c = getCase(caseId), it = getItem(caseId, key);
  if (!c || !it){ itemMissToast(caseId, key); return; }
  var code = itemStatus(it).code;
  if (c.state === '완결' || it.kind !== 'A' || (code !== 'done' && code !== 'res')) return;
  if (code === 'res') it.r.resolution = null;   /* 사유해소 취소 — 사유도 지운다(DB resolution_* null · saveItemStatus) */
  /* 후원자·기관이 올린 것이면 'miss' 로 두어도 itemStatus 가 '제출됨 · 확인 전' 으로 그린다.
     담당자가 [수취 등록] 으로 올린 파일뿐이면 'miss' 는 '미수취' 가 돼 그 파일로 다시 [원본 보고 처리] 할 길이 없다 —
     그래서 '확인필요'(unc) 로 되돌린다. 항목 카드·confirmUpload 가 fileIds 만 있는 항목도 받는다(같은 날 고침). */
  var up = (it.r.donorUpload && it.r.donorUpload.status === 'uploaded') || (it.r.orgUpload && it.r.orgUpload.status === 'uploaded');
  var hasFiles = !!(it.r.fileIds && it.r.fileIds.length);
  it.r.st = (!up && hasFiles) ? 'unc' : 'miss'; it.r.date = ''; it.r.by = '';
  if (!up && hasFiles) it.r.memo = '수취를 취소했습니다 — 원본을 다시 보고 처리해 주세요';
  saveItemStatus(c, it).catch(function(err){
    DB.itemSaveErr = DB.itemSaveErr || {};
    DB.itemSaveErr[caseId] = {name:it.n, msg:(err && err.message) || String(err)};
    DB.toast = {msg:'“' + it.n + '” 수취 취소가 저장되지 않았습니다', cap:'새로고침하면 수취완료로 돌아갑니다'};
    render();
  });
  DB.toast = {msg:'“' + it.n + '” 수취를 취소했습니다', auto:true};
  render();
}
/* ── 접수 링크 카드 · 재발급 (2026-09-12 선미) ─────────────────────────────
   후원자가 링크를 잃으면 담당자는 신규 접수 화면의 [발송 이력] 에서만 다시 복사할 수 있었고, 그것도
   같은 브라우저 세션 안에서만이다(토큰은 발급 때 한 번만 돌아온다 · linkUrl 주석). 건 상세 ① 단계에
   링크 자리를 두고, 잃었으면 **같은 건에** 다시 발급한다 — 배분처 링크(issueOrgLinkFor)와 같은 순서:
   살아 있는 접수 링크를 먼저 무효화하고 새로 만든다. 새 접수를 만들지 않으므로 접수번호가 안 바뀐다. */
function intakeLinkCard(c){
  var url = linkUrl(c.id);
  var busy = !!c.intakeIssuing;
  return '<div class="card mb16"><div class="card-h"><h3>접수 링크</h3><span class="tag">후원자에게 보낸 링크</span></div><div class="card-b">' +
    (url
      ? '<div class="row" style="gap:8px;align-items:center">' +
        '<input type="text" readonly value="' + esc(url) + '" style="flex:1;min-width:200px">' +
        '<button class="btn pri sm" onclick="copyHistLink(\'' + c.id + '\')">링크 복사</button></div>'
      : '<div class="item-meta">' + esc(LINK_LOST_MSG) + '</div>') +
    '<div class="row mt8" style="gap:8px;align-items:center;flex-wrap:wrap">' +
    '<input type="text" inputmode="numeric" maxlength="4" placeholder="후원자 연락처 뒷 4자리" style="max-width:220px"' +
    ' value="' + esc(c.intakeVerifyDraft != null ? c.intakeVerifyDraft : (c.verifyLast4 || '')) + '"' +
    ' onchange="setIntakeVerify(\'' + c.id + '\',this.value)">' +
    '<button class="btn ghost sm"' + (busy ? ' disabled' : '') + ' onclick="reissueIntakeLink(\'' + c.id + '\')">' +
    (busy ? '발급 중…' : '접수 링크 재발급') + '</button></div>' +
    '<div class="hint">재발급하면 앞서 보낸 링크는 열리지 않습니다.</div>' +
    '</div></div>';
}
function setIntakeVerify(caseId, v){
  var c = getCase(caseId);
  if (c){ c.intakeVerifyDraft = v; render(); }
}
function reissueIntakeLink(caseId){
  if (writeBlocked()) return;
  var c = getCase(caseId);
  if (!c || c.intakeIssuing) return;
  var v = String(c.intakeVerifyDraft != null ? c.intakeVerifyDraft : (c.verifyLast4 || '')).trim();
  if (!/^\d{4}$/.test(v)){
    DB.toast = {msg:'본인확인 값을 넣어야 발급됩니다'};
    render(); return;
  }
  c.intakeIssuing = true; render();
  var K = COL.accessLink;
  loadAccessLinks(c).then(function(rows){
    var alive = (rows || []).filter(function(r){ return r[K.purpose] === 'intake' && accessLinkState(r) === 'ok'; });
    return Promise.all(alive.map(function(r){ return revokeAccessLink(r[K.id]); }));
  }).then(function(){
    return issueAccessLink(c, {purpose:'intake', verifyLast4:v});
  }).then(function(r){
    c.intakeIssuing = false;
    if (r && r.token) c.linkToken = r.token;
    c.verifyLast4 = v; c.intakeVerifyDraft = null;
    DB.toast = {msg:'#' + c.id + ' 접수 링크를 재발급했습니다', cap:'주소는 지금 한 번만 보입니다'};
    render();
  }).catch(function(err){
    c.intakeIssuing = false;
    DB.toast = {msg:'링크를 재발급하지 못했습니다', cap:(err && err.message) || String(err)};
    render();
  });
}
/* 저장 못 한 접수를 다시 만든다 — dbId 가 없는 건만 보낸다(두 번 눌러도 안 겹친다) */
function retrySaveCase(caseId){
  var c = getCase(caseId);
  if (!c) return;
  var e = (DB.caseSaveErr || {})[caseId] || {};
  /* ★ parts 를 읽어 **남은 것만** 다시 보낸다 (2026-09-03 · 연수와 뜻을 맞춘 값).
       true = 아직 안 들어갔다 = 다시 보내야 할 것.  screen-donor.js 가 같은 뜻으로 채운다.
     ⚠️ 뜻이 뒤집히면 들어간 것만 다시 보내고 빠진 것은 건너뛴다 — 조용히 어긋나는 자리라
       두 파일이 이 주석을 같이 본다.
     parts 가 없는 경우도 있다 — 링크 발급 때의 실패는 접수 자체가 없는 것이라 parts 가 없다. */
  var p = e.parts || null;
  var itemsLeft = (c.checklist || []).filter(function(it){ return !it.dbId; }).length
                  + ((c.retiredItemIds || []).length);
  var needFields    = p ? !!p.fields    : !!e.fields;
  var needChecklist = p ? !!p.checklist : (itemsLeft > 0);
  /* ★ 담당자가 다시 보낼 수 없는 것 — 후원자 폼 값과 파일은 브라우저에서 이미 사라졌다.
       그래서 '재시도' 가 아니라 '남았다' 로 남긴다. 조용히 지우면 안 들어간 채로 잊힌다
       (연수 §2 — 후원자는 이미 떠났고 담당자가 다시 요청하는 것 말고 길이 없다). */
  var cannot = [];
  if (p && p.form)  cannot.push('제출본');
  if (p && p.files) cannot.push('첨부 서류');
  if (p && p.pdf)   cannot.push('신청서 PDF(개인정보·서명)');   /* 값이 후원자 브라우저에만 있었다 — 재제출 말고 길이 없다 */

  if (c.dbId && !needFields && !needChecklist && !cannot.length){
    DB.toast = {msg:'#' + caseId + ' 는 다시 보낼 것이 없습니다',
                cap:'후원자에게 재제출을 요청하세요. 접수 링크를 다시 발급하면 됩니다.'};
    render(); return;
  }

  var again = (c.dbId ? Promise.resolve({ok:true, already:true}) : createDonation(c))
    .then(function(){
      if (!needFields) return null;
      if (!e.fields) throw new Error('다시 보낼 값이 없습니다. 후원자에게 재제출을 요청하세요.');
      return saveDonationFields(c, e.fields);
    })
    .then(function(){ return saveChecklist(c); });   /* 남은 것만 나간다 — 없으면 skipped */

  DB.toast = {msg:'#' + caseId + ' 를 다시 저장합니다…'}; render();
  again.then(function(){
    if (p){ p.fields = false; p.checklist = false; }
    if (cannot.length){
      /* 보낼 수 있는 것은 보냈다. 못 보내는 것은 남긴다 — 지우면 잊힌다. */
      DB.caseSaveErr = DB.caseSaveErr || {};
      DB.caseSaveErr[caseId] = {msg:cannot.join(' · ') + ' 은 다시 보낼 수 없습니다. 후원자 재제출이 필요합니다.',
                                fields:e.fields || null, parts:p};
      DB.toast = {msg:'#' + caseId + ' · 보낼 수 있는 것은 저장했습니다',
                  cap:cannot.join(' · ') + ' 은 없습니다. 후원자에게 재제출을 요청하세요.'};
    } else {
      if (DB.caseSaveErr) delete DB.caseSaveErr[caseId];
      DB.toast = {msg:'#' + caseId + ' 를 저장했습니다', auto:true};
    }
    render();
  }).catch(function(err){
    DB.caseSaveErr = DB.caseSaveErr || {};
    DB.caseSaveErr[caseId] = {msg:(err && err.message) || String(err), fields:e.fields || null, parts:p};
    DB.toast = {msg:'아직 저장하지 못했습니다', cap:DB.caseSaveErr[caseId].msg};
    render();
  });
}

/* 저장 못 한 배분처를 다시 저장한다 — DB 에 아직 없는 것만 골라 보낸다.
   ★ '아직 없는 것' 의 기준 = 화면 임시 id(sd1 …). 저장에 성공하면 DB PK 로 바뀌므로
     두 번 눌러도 같은 기관이 두 줄로 들어가지 않는다. */
function retrySaveDist(caseId){
  var c = getCase(caseId);
  if (!c) return;
  var pending = (c.dists || []).filter(function(d){ return /^sd\d+$/.test(String(d.id || '')); });
  if (!pending.length){
    /* 토스트를 두지 않는다 (2026-09-08 선미) — 저장할 것이 없었다는 알림이다.
       위 오류 배너가 사라지는 것으로 이미 보인다. */
    if (DB.distSaveErr) delete DB.distSaveErr[c.id];
    render(); return;
  }
  DB.toast = {msg:'배분처 ' + pending.length + '건을 저장합니다…'};
  render();
  var done = 0, failed = null;
  (function next(i){
    if (i >= pending.length){
      if (failed){
        DB.distSaveErr[c.id] = {org:failed.org, msg:failed.msg};
        DB.toast = {msg:'아직 저장하지 못했습니다 · ' + done + '/' + pending.length + '건 성공',
                    cap:failed.msg};
      } else {
        if (DB.distSaveErr) delete DB.distSaveErr[c.id];
        DB.toast = {msg:'배분처 ' + done + '건을 저장했습니다', auto:true};
      }
      /* ★ 배분처만 저장하면 절반이다 (2026-09-13 · #323) — 그 기관의 체크리스트 항목은
           배분처가 숫자 id 를 받을 때까지 미뤄져 있다(saveChecklist 의 deferred).
           여기서 이어 넣지 않으면 항목이 DB 에 없는 채로 남아 기관 링크가 자기 몫을 못 본다. */
      if (done) saveChecklist(c).then(function(){ render(); }, function(err){
        DB.distSaveErr = DB.distSaveErr || {};
        DB.distSaveErr[c.id] = {org:'체크리스트', msg:(err && err.message) || String(err)};
        render();
      });
      render(); return;
    }
    saveDistribution(c, pending[i]).then(function(){ done++; })
      .catch(function(err){ failed = {org:pending[i].orgName, msg:(err && err.message) || String(err)}; })
      .then(function(){ next(i + 1); });
  })(0);
}

function completeCase(caseId){
  var c = getCase(caseId);
  var r = inspect(c, TODAY);
  if (!r.canComplete) return;   /* 게이트 — UI 우회 대비 이중 방어 */
  c.state = '완결';
  /* ★ 완결한 시각을 이름 붙은 칸에 남긴다 (2026-09-08 연수)
       전에는 state 만 저장해 completed_at 이 늘 비었다. updated_at 에 시각이 남긴 하지만
       그건 **이 줄이 마지막으로 바뀐 때**라, 나중에 수량 정정이나 [다시 검수] 한 번이면
       덮인다 — 언제 완결했는지가 영영 사라진다. 재단 시스템 이관·심사 때 물어보는 값이다.
     ⚠️ **최초 한 번만 찍는다**(선미 요청). [다시 검수] 로 되돌렸다가 다시 완결하면
       두 번째 시각으로 덮이는데, 화면에 보이는 것은 '언제 끝난 건인가' 라 최초가 맞다.
       이미 찍힌 값은 rowToCase 가 DB 에서 실어 온다. */
  if (!c.completedAt) c.completedAt = new Date().toISOString();
  /* 토스트를 두지 않는다 (2026-09-08 선미) — 바로 아래 완결 요약 카드가 같은 말을 한다.
     실패했을 때만 아래에서 시끄럽게 알린다. */
  render();
  /* ★ 완결은 업무의 끝이다 — 이것이 DB 에 안 남으면 다음 사람이 다시 검수한다.
       실패해도 화면을 되돌리지 않는다(담당자 판단은 이미 내려졌다). 대신 시끄럽게 알린다. */
  saveDonationFields(c, {state:'완결', completedAt:c.completedAt}).catch(function(err){
    DB.toast = {msg:'#' + caseId + ' 완결을 저장하지 못했습니다',
                cap:(err && err.message) || String(err)};
    render();
  });
}
/* 완결 처리 취소 — 잘못 누른 완결을 되돌린다 (2026-09-12 선미).
   ★ 상태는 '검수 대기' 로 돌린다 — DB 가 받는 값이 다섯뿐이고('제출 대기'·'접수 검토'·'검수 대기'·'완결'·'취소'),
     화면 단계는 c.state 가 '완결' 이 아니면 판정(verdict)이 정하므로 ⑤ 배분처 서류 검수로 돌아간다.
   ★ 완결 시각도 지운다 — 완결이 아닌 건에 완결 시각이 남으면 목록·통계가 어긋난다.
     (completeCase 의 "최초 한 번만" 규칙은 [다시 검수] 뒤 **재완결**을 위한 것이고, 이건 완결 자체를 물리는 것이다.)
   ⚠️ 취소된 건은 손대지 않는다. 저장이 실패하면 화면을 되돌리지 않고 시끄럽게 알린다(completeCase 와 같은 규칙). */
function uncompleteCase(caseId){
  if (writeBlocked()) return;
  var c = getCase(caseId);
  if (!c || c.state !== '완결') return;
  c.state = '검수 대기';
  c.completedAt = null;
  DB.toast = {msg:'#' + caseId + ' 완결을 취소했습니다', auto:true};
  render();
  saveDonationFields(c, {state:'검수 대기', completedAt:null}).catch(function(err){
    DB.toast = {msg:'#' + caseId + ' 완결 취소를 저장하지 못했습니다',
                cap:(err && err.message) || String(err)};
    render();
  });
}
/* [2026-07-27] 배분결정 — 후원자서류완비 → 배분진행 전이.
   기관 지정과 동시에 기관 증빙 3종(distDocs)이 "배분처 수취" 그룹으로 체크리스트에 추가되고,
   목록에서는 '배분 확정' 카드로 이동한다(orgId 기준). 다기관은 본선 범위. */
/* 아직 배분처가 정해지지 않은 수량 — 접수 수량에서 이미 나눈 몫을 뺀다.
   수량을 모르는 건(접수 수량 0)은 0을 돌려준다 — 카드를 억지로 열지 않는다. */
function distRemainingQty(c){
  var total = Number((c && c.donation && c.donation.qty) || 0);
  if (!total) return 0;
  /* ★ 취소된 배분은 쓴 것이 아니다 — 뺀 만큼 남은 수량이 되살아나고
       배분결정 카드가 다시 열린다 (2026-09-11). */
  var used = liveDists(c).reduce(function(s, d){
    return s + Number(d[COL.distribution.qty] || d.qty || 0);
  }, 0);
  return Math.max(0, total - used);
}

/* 이 배분처가 잠겼는가 — 증빙을 **담당자가 수취 확정**한 뒤에는 수정도 취소도 못 한다.
   ★ '제출' 이 아니라 '수취 확정' 이다 (2026-09-11 선미 결정).
     배분처가 엉뚱한 인수증을 잘못 올린 경우를 담당자가 바로잡을 길을 남긴다.
     itemStatus 의 'done' 하나만 본다 — 그것이 담당자 확정값이다(common.js F2 주석). */
function distLocked(c, d){
  var id = String((d && d.id) || '');
  if (!id) return false;
  return ((c && c.checklist) || []).some(function(it){
    return String(it.distId || '') === id && itemStatus(it).code === 'done';
  });
}

/* 배분 현황 카드 — 기관마다 한 줄. 수취 확정 전이면 [수량 수정]·[배분 취소]가 열린다. */
function distStatusCard(c){
  var K = COL.distribution;
  var total = Number((c.donation && c.donation.qty) || 0);
  var live  = liveDists(c);
  var sum   = live.reduce(function(s, d){ return s + Number(d[K.qty] || d.qty || 0); }, 0);
  var rows = (c.dists || []).map(function(d){
    var name = esc(d[K.orgName] || d.orgName || '기관');
    var qty  = Number(d[K.qty] || d.qty || 0);
    var did  = esc(String(d.id));
    if (!distLive(d)){
      /* 취소된 줄도 지우지 않고 그대로 둔다 — 감사 때 왜 물렸는지 설명할 수 있어야 한다 */
      return '<div class="doc-row"><div class="di">✕</div><div style="flex:1">' +
        '<b style="text-decoration:line-through">' + name + ' · ' + qty + '개</b> ' +
        '<span class="pill neu"><span class="pd"></span>배분 취소</span>' +
        '<small>' + esc(d[K.cancelReason] || d.cancelReason || '') + '</small>' +
        '</div></div>';
    }
    var locked = distLocked(c, d);
    var h = '<div class="doc-row"><div class="di">' + (locked ? '🔒' : '📦') + '</div><div style="flex:1">' +
      '<b>' + name + ' · ' + qty + '개</b>' +
      (locked ? ' <span class="pill ok"><span class="pd"></span>증빙 수취 확정</span>' : '') +
      '<small>' + (locked
        ? '증빙을 수취 확정했습니다 — 물품이 이미 간 것이라 수정·취소할 수 없습니다'
        : '증빙 수취 확정 전입니다 — 지금은 수량을 고치거나 취소할 수 있습니다') + '</small>';
    if (!locked){
      var ed = (DB.distEdit && DB.distEdit.id === String(d.id)) ? DB.distEdit : null;
      var cx = (DB.distCancel && DB.distCancel.id === String(d.id)) ? DB.distCancel : null;
      if (ed){
        h += '<div class="row mt12" style="gap:8px;align-items:center">' +
          '<input type="number" min="1" id="dq-' + did + '" value="' + esc(String(ed.qty)) + '"' +
          ' onchange="DB.distEdit.qty=this.value" style="width:120px">' +
          '<button class="btn pri sm" onclick="saveDistQty(\'' + c.id + '\',\'' + did + '\')">저장</button>' +
          '<button class="btn ghost sm" onclick="DB.distEdit=null;render()">그만두기</button>' +
          '<span class="small muted">다른 기관까지 합쳐 접수 수량 ' + total + '개를 넘을 수 없습니다</span>' +
          '</div>';
      } else if (cx){
        h += '<div class="row mt12" style="gap:8px;align-items:center">' +
          '<input type="text" id="dc-' + did + '" value="' + esc(cx.reason) + '"' +
          ' placeholder="취소 사유 · 예: 기관 사정으로 배분 취소 · 재배분 예정"' +
          ' onchange="DB.distCancel.reason=this.value" style="flex:1;min-width:200px">' +
          '<button class="btn pri sm" onclick="confirmCancelDist(\'' + c.id + '\',\'' + did + '\')">배분 취소</button>' +
          '<button class="btn ghost sm" onclick="DB.distCancel=null;render()">그만두기</button>' +
          '</div>' +
          '<div class="hint" style="margin-top:6px">취소해도 기록은 지워지지 않습니다 — 사유와 함께 남고, 그만큼 남은 수량이 되살아납니다.</div>';
      } else {
        h += '<div class="row mt12" style="gap:8px">' +
          '<button class="btn soft sm" onclick="DB.distEdit={id:\'' + did + '\',qty:' + qty + '};DB.distCancel=null;render()">수량 수정</button>' +
          '<button class="btn ghost sm" onclick="DB.distCancel={id:\'' + did + '\',reason:\'\'};DB.distEdit=null;render()">배분 취소</button>' +
          '</div>';
      }
    }
    var err = (DB.distEditErr || {})[String(d.id)];
    if (err) h += '<div class="gate-block mt8">' + esc(err) + '</div>';
    return h + '</div></div>';
  }).join('');
  return '<div class="card mb16"><div class="card-h"><h3>배분 현황</h3>' +
    '<span class="tag">배분 합계 ' + sum + ' / 접수 ' + total + '</span></div>' +
    '<div class="card-b">' + rows + '</div></div>';
}

/* 배분 수량 수정 — 수취 확정 전에만. UI 우회 이중 방어로 여기서도 잠금을 다시 본다. */
function saveDistQty(caseId, distId){
  var c = getCase(caseId); if (!c) return;
  var d = (c.dists || []).filter(function(x){ return String(x.id) === String(distId); })[0];
  if (!d || !distLive(d)) return;
  DB.distEditErr = DB.distEditErr || {};
  if (distLocked(c, d)){
    DB.distEditErr[String(distId)] = '증빙을 수취 확정한 배분입니다 — 수정할 수 없습니다';
    DB.distEdit = null; render(); return;
  }
  var K = COL.distribution;
  var qty = Math.floor(Number((DB.distEdit && DB.distEdit.qty) || 0) || 0);
  if (qty <= 0){ DB.distEditErr[String(distId)] = '배분 수량을 입력하세요'; render(); return; }
  var total = Number((c.donation && c.donation.qty) || 0);
  var others = liveDists(c).reduce(function(s, x){
    return s + (String(x.id) === String(distId) ? 0 : Number(x[K.qty] || x.qty || 0)); }, 0);
  if (total && others + qty > total){
    DB.distEditErr[String(distId)] =
      '접수 수량을 넘습니다 — 다른 기관 ' + others + '개 + ' + qty + '개 > 접수 ' + total + '개';
    render(); return;
  }
  var before = Number(d[K.qty] || d.qty || 0);
  d[K.qty] = qty; d.qty = qty;                       /* 화면 먼저 — 저장 실패는 아래에서 시끄럽게 알린다 */
  DB.distEdit = null; delete DB.distEditErr[String(distId)];
  updateDistributionQty(c, d, qty).then(function(r){
    if (r && r.demo) return;
    DB.toast = {msg:'배분 수량 수정 · ' + (d[K.orgName] || d.orgName) + ' ' + before + ' → ' + qty + '개'};
    render();
  }).catch(function(err){
    d[K.qty] = before; d.qty = before;               /* 되돌린다 — 저장 안 된 값을 화면에 남기지 않는다 */
    DB.distEditErr[String(distId)] = (err && err.message) || String(err);
    DB.toast = {msg:'배분 수량을 저장하지 못했습니다', cap:'화면 값은 되돌렸습니다.'};
    render();
  });
  render();
}

/* 배분 취소 — 행을 지우지 않는다. 사유·시각·담당자를 남기고 E7 합계에서만 뺀다. */
function confirmCancelDist(caseId, distId){
  var c = getCase(caseId); if (!c) return;
  var d = (c.dists || []).filter(function(x){ return String(x.id) === String(distId); })[0];
  if (!d || !distLive(d)) return;
  DB.distEditErr = DB.distEditErr || {};
  if (distLocked(c, d)){
    DB.distEditErr[String(distId)] = '증빙을 수취 확정한 배분입니다 — 취소할 수 없습니다';
    DB.distCancel = null; render(); return;
  }
  var reason = String((DB.distCancel && DB.distCancel.reason) || '').trim();
  if (!reason){ DB.distEditErr[String(distId)] = '취소 사유를 적어 주세요'; render(); return; }
  var K = COL.distribution;
  cancelDistribution(c, d, reason).then(function(r){
    /* ★ 이 기관의 증빙 항목도 체크리스트에서 뺀다 — 취소된 배분의 인수증을
         계속 기다리면 완결 게이트가 영문 모를 이유로 막힌다.
       ⚠️ 이미 받은 파일이 있는 항목은 남긴다(수취 확정 전이라 대개 비어 있다). */
    /* ★ DB 행도 같이 내린다 (2026-09-12 선미 · #306 실측) — 전에는 화면에서만 빼고 retiredItemIds 에 안 실어
         saveChecklist 가 아무것도 안 했다. 새로고침하면 취소한 기관의 인수증이 '미수취' 로 되살아났다. */
    c.retiredItemIds = c.retiredItemIds || [];
    c.checklist = (c.checklist || []).filter(function(it){
      if (String(it.distId || '') !== String(distId)) return true;
      var keep = !!(it.r && ((it.r.fileIds && it.r.fileIds.length) ||
                             (it.r.orgUpload && it.r.orgUpload.status === 'uploaded')));
      if (!keep && it.dbId) c.retiredItemIds.push(it.dbId);
      return keep;
    });
    if (!liveDists(c).length){ c.orgId = null; c.orgName = ''; }
    else c.orgName = orgLabel(c);
    DB.distCancel = null; delete DB.distEditErr[String(distId)];
    DB.toast = {msg:'배분 취소 · ' + (d[K.orgName] || d.orgName),
                cap:'남은 수량 ' + distRemainingQty(c) + '개. 기록은 사유와 함께 남습니다.'};
    if (r && r.demo){ render(); return; }
    return saveChecklist(c).then(function(){ render(); });
  }).catch(function(err){
    DB.distEditErr[String(distId)] = (err && err.message) || String(err);
    DB.toast = {msg:'배분을 취소하지 못했습니다'};
    render();
  });
}
/* 배분처 표기 — 다기관이면 한 곳만 보여주고 나머지는 수로 줄인다.
   full=true 면 전부 나열한다(배분결정 카드처럼 목록이 필요한 자리).
   ★ c.orgName 하나만 읽으면 두 번째 기관부터는 화면에서 사라진다. */
function orgLabel(c, full){
  /* ★ 취소된 배분처는 이름에서 뺀다 (2026-09-11) — 합계에서 빠진 기관이
       배분처 표기에는 남아 있으면 "누구에게 갔는지" 가 어긋난다. */
  var ds = liveDists(c);
  var names = ds.map(function(d){
    return d[COL.distribution.orgName] || d.orgName || '';
  }).filter(Boolean);
  if (!names.length) return c && c.orgName ? c.orgName : '';
  if (full) return names.join(' · ');
  return names.length === 1 ? names[0] : names[0] + ' 외 ' + (names.length - 1) + '곳';
}
function decideDist(caseId){
  if (writeBlocked()) return;
  var c = getCase(caseId);
  if (!c) return;
  var res = inspect(c, TODAY);
  var left = distRemainingQty(c);
  /* 첫 배분은 '후원자 서류 완비' 가 전제고, 기관 추가는 '남은 수량이 있을 때' 가 전제다.
     UI 우회 이중 방어 — 카드가 안 보여도 함수가 불릴 수 있다. */
  if (!res.canDecideDist && !(c.orgId && left > 0 && c.state !== '완결' && c.state !== '취소')) return;

  var name = String(DB.distForm.orgName || '').trim();
  if (!name){ DB.toast = {msg:'배분기관명을 입력하세요'}; render(); return; }
  /* 취소된 기관은 다시 넣을 수 있어야 한다 — 취소 뒤 재배분이 정상 경로다 (2026-09-11) */
  if (liveDists(c).some(function(d){
        return (d[COL.distribution.orgName] || d.orgName) === name; })){
    /* 같은 기관을 두 번 넣으면 증빙 세트가 겹쳐 어느 쪽 것인지 가릴 수 없다 — 화면에는 안 쓴다 */
    DB.toast = {msg:'이미 지정된 기관입니다 · ' + name};
    render(); return;
  }
  var qty = Math.floor(Number(DB.distForm.qty || left) || 0);
  if (qty <= 0){ DB.toast = {msg:'배분 수량을 입력하세요'}; render(); return; }
  if (left && qty > left){
    /* 받은 것보다 많이 나눠준 것으로 등록되면 완결 게이트(E7)에서 막힌다 — 화면에는 안 쓴다 */
    DB.toast = {msg:'남은 수량보다 많습니다 · 남은 ' + left + '개'};
    render(); return;
  }

  /* ★ 배분처 고유 id — 순번이 아니라 한 번 쓰면 다시 안 쓰는 번호를 쓴다.
       순번을 쓰면 기관을 하나 지우는 순간 저장해 둔 uid 가 다른 기관을 가리킨다(유진·연수 합의). */
  c.distSeq = (c.distSeq || 0) + 1;
  var distId = 'sd' + c.distSeq;          /* sd = screen distribution — DB의 숫자 id 와 겹치지 않는다 */

  c.dists = (c.dists || []).concat([{
    id: distId, orgName: name, qty: qty,
    distDate: TODAY, memo: String(DB.distForm.memo || '').trim()
  }]);
  /* orgId 는 '배분처가 정해졌나'의 표시로만 쓰인다(목록 분류·판정 사다리) — 첫 기관에서만 세운다.
     orgName 은 옛 화면 호환용으로 남기되, 표시는 orgLabel(c) 이 맡는다. */
  if (!c.orgId) c.orgId = 'org-' + c.id;
  c.orgName = orgLabel(c);
  /* ★ 기관이 추가돼도 링크를 죽이지 않는다 (2026-09-03 · 기관별 링크로 바뀌면서 걷어냄).
       예전에는 링크가 **건당 1장**이라, 기관이 둘이 되는 순간 그 한 장이
       "누가 낸 것인지 못 가리는 링크" 가 됐다. 그래서 무효화했다(2026-09-02 선미·연수).
       이제 access_link 가 배분처마다 한 장이고 orgSlots 가 distId 로 좁히므로
       기관이 늘어도 앞 기관 링크는 계속 자기 몫만 연다 — 죽일 이유가 없다.
     ⚠️ 되살리지 말 것 — 되살리면 기관을 추가할 때마다 앞 기관이 다시 링크를 받아야 한다. */
  c.distMemo = String(DB.distForm.memo || '').trim();
  c.distDecidedAt = TODAY;

  var docs = getProfile(DB.promptProfile).distDocs || DIST_DOCS;
  docs.forEach(function(d){
    /* distId 를 넘겨야 uid 가 'inss#sd1' 처럼 기관까지 붙는다 —
       안 넘기면 기관이 둘일 때 같은 'inss' 가 되어 엉뚱한 기관 것이 처리된다 */
    c.checklist.push(mkItem({key:d.key, n:d.name + ' · ' + name, kind:d.kind || 'A', stage:'배분',
      distId:distId, g:'배분처 수취 — ' + name, basis:'기관 업무지침 · 인수증 양식', note:d.note}));
  });

  /* ★ DB 에 남긴다 (2026-09-02) — 전에는 브라우저 메모리에만 있었다.
       담당자가 세 기관을 등록하고 화면을 새로 고치면 전부 사라졌다.
       실패는 시끄럽게 알린다 — "등록했다" 고 믿는데 DB 에 없는 것이 제일 나쁘다.
     ⚠️ 화면 반영은 막지 않는다. 여기서 되돌리면 이미 추가된 체크리스트 항목까지
        걷어내야 하는데, 그 되감기가 더 위험하다. 대신 실패를 감추지 않고
        '다시 저장' 을 담당자가 누를 수 있게 한다. */
  var savedDist = c.dists[c.dists.length - 1];
  saveDistribution(c, savedDist).then(function(r){
    if (r && r.demo) return;
    delete (DB.distSaveErr || {})[c.id];
    /* ★ 순서가 있다 — 배분처가 숫자 id 를 받은 뒤에 항목을 저장해야
         distribution_id 가 채워진다. 먼저 저장하면 NULL 이 되어
         '어느 기관 인수증인지' 를 DB 가 모른다. */
    return saveChecklist(c).then(function(){ render(); });
  }).catch(function(err){
    DB.distSaveErr = DB.distSaveErr || {};
    DB.distSaveErr[c.id] = {org:name, msg:(err && err.message) || String(err)};
    DB.toast = {msg:name + ' 배분처를 저장하지 못했습니다',
                cap:'새로고침하면 사라집니다. [배분처 다시 저장]을 누르세요.'};
    render();
  });

  var nLeft = distRemainingQty(c);
  DB.demo.subs[c.id] = '배분결정 · ' + orgLabel(c) + ' · 기관 증빙 수취 중';
  DB.distForm = {caseId:null, orgName:'', qty:'', memo:''};
  DB.toast = {msg:'#' + c.id + ' 배분결정 · ' + name + ' ' + qty + '개',
              cap:(nLeft > 0
                ? '남은 수량 ' + nLeft + '개. 기관을 더 지정할 수 있습니다.'
                : '기관마다 증빙 제출 링크를 발급하세요.')};
  render();
}

/* ── 9. 접수 원본 보기 ── */
function viewIntakeSrc(){
  var c = getCase(DB.caseId);
  if (!c) return '<div class="empty">건을 찾을 수 없습니다</div>';
  var d = c.donation;
  return '<div class="page-head"><h2>접수 원본 · #' + esc(c.id) + '</h2><p>후원자가 제출한 원문</p></div>' +
    '<div class="split"><div class="col"><h3 style="font-size:15px;font-weight:800;margin-bottom:10px">제출 원문</h3>' +
    '<div class="mono">' + esc([
      '제출 경로: ' + c.submittedVia, '후원자: ' + c.donor + ' (' + c.donorType + ')',
      '품목: ' + d.itemName, '수량(낱개): ' + d.qty + (d.pkg ? ' · 포장 ' + d.pkg + ' (참고용)' : ''), '단가: ' + d.unitPrice,
      '장부가액: ' + d.book, '공정가액: ' + d.fair, '기부일자: ' + c.inDate
    ].join('\n')) + '</div></div>' +
    /* 포장 단위는 참고용 — 대조(E7)는 낱개로만 한다. 화면에는 값만 */
    '<div class="col"><h3 style="font-size:15px;font-weight:800;margin-bottom:10px">등록값</h3>' +
    [['후원자', c.donor],['후원자 유형', c.donorType],['품목', d.itemName],
     ['수량(낱개)', d.qty + (d.pkg ? ' · 포장 ' + d.pkg : '')],
     ['장부가액', won(d.book)],['공정가액', won(d.fair)],['배분처', orgLabel(c) || '미정']].map(function(kv){
      return '<div class="kv"><span class="muted">' + kv[0] + '</span><b>' + esc(kv[1]) + '</b></div>'; }).join('') +
    '</div></div>' +
    '<div class="row mt16"><button class="btn ghost" onclick="go(\'case\',\'' + c.id + '\')">← 검수 화면으로</button></div>';
}

/* ── 10. 수취 등록 (⭐파일 첨부 필수) ── */
/* 대상 항목을 미리 고르는 것은 go('receive', caseId, uid) 가 한다 (common.js).
   ★ 여기서 인자로 받지 않는다 — renderStaff 는 화면 함수를 인자 없이 부르고,
     매 렌더마다 읽으면 담당자가 select 로 바꾼 항목을 되돌려 버린다 (2026-09-05). */
function viewReceive(){
  var c = getCase(DB.caseId);
  if (!c) return '<div class="empty">건을 찾을 수 없습니다</div>';
  var F = DB.recvForm;
  if (F.caseId !== c.id){ F.caseId = c.id; F.itemKey = ''; F.file = ''; }
  var pending = c.checklist.filter(function(it){
    if (it.kind === 'S') return false;   /* 신청서는 폼 제출로 충족 — 파일 수취 대상 아님 */
    return it.included && itemStatus(it).code !== 'done' && itemStatus(it).code !== 'res';
  });
  /* 선택된 항목이 수취 대기 목록에 없으면(이미 처리됐거나 초기값) 첫 대기 항목으로 맞춘다 —
     화면에 보이는 항목과 실제 처리되는 항목이 어긋나는 것을 방지 */
  /* F.itemKey 는 이제 uid 를 담는다 (다기관에서 key 는 겹친다 · 이름은 그대로 둔다) */
  if (!pending.some(function(it){ return it.uid === F.itemKey; })) F.itemKey = pending.length ? pending[0].uid : '';
  var canSave = !!(F.itemKey && F.file);
  /* 담당자 수취 처리가 항목 상태를 확정하는 유일한 경로다. 파일 없이는 처리하지 않는다 —
     기록만 남고 서류가 없는 상태를 만들지 않기 위한 차단. 그 설명(부제·📎 배너)은 뺐다(문구 규칙 9/5) —
     증빙 파일 라벨의 * 와 버튼 아래 잠금 문구가 같은 말을 한다. */
  return '<div class="page-head"><h2>수취 등록 · #' + esc(c.id) + '</h2></div>' +
    '<div class="card"><div class="card-h"><h3>수취 처리</h3></div><div class="card-b">' +
      '<div class="field"><label>대상 항목 <span class="req">*</span></label><select onchange="DB.recvForm.itemKey=this.value;render()">' +
        (pending.length ? pending.map(function(it){
          return '<option value="' + esc(it.uid) + '"' + (it.uid === F.itemKey ? ' selected' : '') + '>' + esc(it.n) + ' (' + itemStatus(it).status + ')</option>';
        }).join('') : '<option value="">수취 대기 항목 없음</option>') + '</select></div>' +
      '<div class="field"><label>수취일</label><input type="text" value="' + esc(F.date) + '" onchange="DB.recvForm.date=this.value"></div>' +
      '<div class="field"><label>증빙 파일 <span class="req">*</span></label>' +
        '<div class="row" style="gap:8px;align-items:center">' +
        /* ★ 실제 파일 (2026-09-07 밤 선미) — 전에는 "파일 선택 (데모)" 뿐이라 실 DB 에서도 이름만 적혔다.
             #226 에 "증빙_226_….pdf (312KB)" 가 사실인 것처럼 남았는데 그 파일은 없다. 이제 저장소에 올라간 뒤에만 수취가 확정된다. */
        '<label class="btn ghost sm" style="cursor:pointer;margin:0">파일 선택<input type="file" accept="' + UPLOAD_ACCEPT + '" style="display:none" onchange="pickRecvRealFile(this.files)"></label>' +
        demoOnly('<button class="btn ghost sm" onclick="pickRecvFile()">파일 선택 (데모)</button>') +
        '<span class="small ' + (F.file ? '' : 'muted') + '">' + (F.file ? '' + esc(F.file) : '선택된 파일 없음 · PDF·PNG·JPG·JPEG·WEBP') + '</span>' +
        (F.file ? '<button class="btn ghost sm" onclick="DB.recvForm.file=\'\';DB.recvForm.fileId=null;render()">지우기</button>' : '') + '</div></div>' +
      '<div class="field"><label>메모</label><input type="text" value="' + esc(F.memo) + '" onchange="DB.recvForm.memo=this.value"></div>' +
      '<button class="btn pri" ' + (canSave && !DB.recvBusy ? '' : 'disabled') + ' onclick="markReceived()">' + (DB.recvBusy ? '올리는 중…' : '수취 처리') + '</button>' +
      (canSave ? '' : '<div class="gate-block mt8">' + (F.itemKey ? '증빙 파일을 첨부해야 수취 처리할 수 있습니다' : '수취 대기 항목이 없습니다') + '</div>') +
    '</div></div>' +
    '<div class="row mt16"><button class="btn ghost" onclick="go(\'case\',\'' + c.id + '\')">← 검수 화면으로</button></div>';
}
/* 데모 전용 — 이름만 적는다. 실 DB 에서는 버튼이 안 그려진다(demoOnly) */
function pickRecvFile(){
  DB.recvForm.file = '증빙_' + DB.recvForm.caseId + '_' + DB.recvForm.itemKey + '.pdf (312KB)';
  DB.recvForm.fileId = null;
  render();
}
/* 실제 파일 — 레지스트리에 넣고(id) 이름을 폼에 보인다. 버킷이 거절할 형식은 여기서 걸러 이유를 말한다 */
function pickRecvRealFile(fileList){
  if (writeBlocked()) return;
  var got = registerPickedFiles(fileList);
  toastRejected(got.rejected);
  if (got.ids.length){
    DB.recvForm.fileId = got.ids[0];
    DB.recvForm.file   = FILES[got.ids[0]].name;
  }
  render();
}
/* 항목을 수취완료로 확정하고 화면·DB 에 남긴다 (markReceived 의 뒷부분 — 업로드 뒤 또는 데모에서 바로) */
function markReceived(){
  if (writeBlocked()) return;
  var F = DB.recvForm;
  if (!F.itemKey || !F.file) return;   /* 파일 없이 수취 표시 경로 차단 (이중 방어) */
  var it = getItem(F.caseId, F.itemKey);
  if (!it){ itemMissToast(F.caseId, F.itemKey); return; }
  var c = getCase(F.caseId), m = F.fileId && FILES[F.fileId];
  /* ★ 실제 파일이면 **저장소에 올라간 뒤에만** 확정한다 — 파일 없는 "수취완료" 를 다시 만들지 않는다.
       실패하면 항목은 그대로 두고 이유를 시끄럽게 말한다(파일 없이 처리하는 길은 없다). */
  if (m && m.blob && typeof saveAttachment === 'function' && sbReady()){
    if (DB.recvBusy) return;
    DB.recvBusy = true; render();
    var fid = F.fileId;
    return saveAttachment(c, it, m, 'staff').then(function(r){
      DB.recvBusy = false;
      if (!r || !r.ok){
        DB.toast = {msg:'증빙 파일이 저장되지 않아 수취 처리하지 않았습니다', cap:String((r && r.reason) || '')};
        render(); return;
      }
      it.r.fileIds = (it.r.fileIds || []).concat([fid]);
      if (typeof signFile === 'function') signFile(fid);   /* 검수 화면에서 바로 열리게 주소를 미리 받는다 */
      finishReceived(it);
    });
  }
  finishReceived(it);
}
function finishReceived(it){
  var F = DB.recvForm;
  it.r.st = 'done'; it.r.date = F.date; it.r.by = '담당자'; it.r.file = F.file;
  it.r.broken = null; it.r.memo = F.memo || '';
  var caseId = F.caseId;
  F.file = ''; F.fileId = null; F.memo = ''; F.itemKey = '';
  /* 처리 직후 빈 폼의 잠금 문구가 "실패"로 읽히지 않도록 검수 화면으로 복귀해 반영 결과를 바로 보여준다 */
  DB.toast = {msg:'“' + it.n + '” 수취 처리했습니다', auto:true};
  go('case', caseId);
  /* ★ 수취 처리는 항목 상태를 확정하는 유일한 경로다 — DB 에 안 남으면
       새로고침 때 '미수취' 로 돌아가고 담당자는 같은 서류를 두 번 처리한다.
     화면은 되돌리지 않는다(담당자 판단은 이미 내려졌다). 대신 시끄럽게 알린다. */
  saveItemStatus(getCase(caseId), it).catch(function(err){
    DB.itemSaveErr = DB.itemSaveErr || {};
    DB.itemSaveErr[caseId] = {name:it.n, msg:(err && err.message) || String(err)};
    DB.toast = {msg:'“' + it.n + '” 수취가 저장되지 않았습니다',
                cap:'새로고침하면 미수취로 돌아갑니다'};
    render();
  });
}
