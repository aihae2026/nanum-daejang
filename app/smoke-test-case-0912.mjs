/* 건 상세 손질 9/12 (선미 브라우저 실주행 지적 12건 중 화면·저장에 걸리는 것)
   ★ 무엇을 지키나
     ① 수취 요약 머리글 — 수취필요 · 수취완료 · 담당자 확인 필요 · 미수취
     ② 배분결정·배분 현황은 ③ 단계에서만 · 대조 판정은 ③④ 에 없다 · [배분기관] 카드는 없다
     ③ 대조 판정이 단계로 갈린다 — ② 후원자 쪽(E4…) · ⑤ 배분처 쪽(E7 · E2 기부→배분)
     ④ [배분기관 제출 화면 미리보기] 는 증빙 링크 카드 머리에만 · 완결 탭에는 없다
     ⑤ 수취완료 첨부 항목에 [수취 취소] · 되돌리면 상태가 풀린다(완결 건은 안 된다)
     ⑥ 제출된 항목에도 [다른 서류로 수취 등록] 이 uid 를 싣고 있다
     ⑦ 배분 취소 — 걷어 낸 항목의 dbId 가 retiredItemIds 에 실린다 · DB 에서 되읽을 때도 빠진다 (#306)
     ⑧ 제출 대기 건에 접수 링크 카드 · 재발급 버튼
     ⑨ 사업자등록번호 마스크 000-00-00000
     ⑩ 신청서 PDF 가 여러 장이면 최신 한 장만 펴 두고 나머지는 접는다 · 시각은 한국 시간 (#315)
     ⑪ 인수증 수량 불일치가 새로고침·다른 브라우저에서도 살아남는다 (#317)
     ⑫ 그 불일치가 ⑤ 검수의 대조 판정에 한 줄로 뜬다 (#317-2)
   jsdom 으로 앱을 싣는다(데모 원장). */
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
  {runScripts:'dangerously', pretendToBeVisual:true, url:'http://localhost:8788/'});
const {window} = dom;
window.HTMLCanvasElement.prototype.getContext = function(){const n=()=>{};return{lineWidth:0,lineCap:'',strokeStyle:'',clearRect:n,beginPath:n,moveTo:n,lineTo:n,stroke:n,drawImage:n,bezierCurveTo:n,quadraticCurveTo:n,fill:n,arc:n};};
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,S';
for (const f of appScripts()) window.eval(readFileSync(APP + f, 'utf8'));
window.eval('render = function(){};');
const W = window, DB = W.DB;
let fail = 0, pass = 0;
const check = (n, ok, got) => { console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got))); ok ? pass++ : fail++; };
const view = (id, tab) => { W.go('case', id); DB.role = 'staff'; if (tab) W.switchTab(tab); return W.viewCase(); };
const tick = () => new Promise(r => setTimeout(r, 20));
DB.role = 'staff';

console.log('\n[① 수취 요약 머리글]');
{
  const h = W.recvSummary([{k:'후원자 서류', its:[]}]);
  check('★ 받을 서류 · 들어온 서류 · 담당자 확정 세 열', /받을 서류[\s\S]*들어온 서류[\s\S]*담당자 확정/.test(h) && !/수취완료|미수취|받아야 함|>확인 전</.test(h));
  /* #308 모양 — 자동 2 + 제출됨 3 → 받을 5 · 들어온 5 · 확정 2 */
  const its = [{kind:'F', r:{st:'done'}}, {kind:'S', r:{st:'done'}},
               {kind:'A', r:{donorUpload:{status:'uploaded'}}}, {kind:'A', r:{donorUpload:{status:'uploaded'}}}, {kind:'A', r:{donorUpload:{status:'uploaded'}}}];
  const cells = [...W.recvSummary([{k:'후원자 서류', its}]).matchAll(/<td class="num">(?:<b[^>]*>)?(\d+)/g)].map(m => m[1]);
  check('★ 다 냈는데 확정만 안 한 건: 5 · 5 · 2', cells.join('/') === '5/5/2', cells);
  its[2].r = {};
  const cells2 = [...W.recvSummary([{k:'후원자 서류', its}]).matchAll(/<td class="num">(?:<b[^>]*>)?(\d+)/g)].map(m => m[1]);
  check('   하나 안 왔으면 들어온 서류가 4', cells2.join('/') === '5/4/2', cells2);
}

console.log('\n[② 배분결정·배분 현황은 ③ 에서만 · 대조 판정은 ③④ 에 없다]');
{
  const c = W.getCase('103');
  c.checklist.forEach(it => { if (it.stage !== '배분'){ it.r.st = 'done'; } });
  c.inspectedAt = W.TODAY;
  DB.distForm = {caseId:'103', orgName:'늘봄지역아동센터', qty:'100', memo:''};
  W.decideDist('103');                              /* 남은 수량이 있어 배분결정 카드가 계속 열린다 */
  const h2 = view('103', 'donorCheck'), h3 = view('103', 'distDecide'), h4 = view('103', 'distRecv'), h5 = view('103', 'distCheck'), h6 = view('103', 'done');
  check('★ ② 에는 배분결정·배분 현황이 없다', !/<h3>배분결정|<h3>배분 현황/.test(h2));
  check('★ ③ 에는 배분결정·배분 현황이 있다', /<h3>배분결정/.test(h3) && /<h3>배분 현황/.test(h3));
  check('   ③ 에 [배분기관] 카드는 없다(배분 현황이 말한다)', !/<h3>배분기관<\/h3>/.test(h3));
  check('   ④⑤ 에도 배분결정은 없다', !/<h3>배분결정/.test(h4) && !/<h3>배분결정/.test(h5));
  check('★ ③④ 에 대조 판정이 없다', !/<h3>대조 판정/.test(h3) && !/<h3>대조 판정/.test(h4));
  check('   AI 고지 한 줄은 검수 단계(②⑤⑥)에만', [h2, h5, h6].every(h => /AI는 <b>금액/.test(h)) && ![h3, h4].some(h => /AI는 <b>금액/.test(h)));
  check('★ ③ 에는 검수 결과 요약·완결 처리가 없다', !/검수 결과 요약|completeCase\(/.test(h3));
  /* 단계마다 그리는 것이 고정 — 검수를 마쳤어도 ① 은 수취 행, ② 는 항목 카드 · ④ 는 수취 행, ⑤ 는 항목 카드 */
  const h1 = view('103', 'donorRecv');
  check('★ 검수를 마쳐도 ① 은 수취 행(doc-row)이고 항목 카드가 아니다', /class="doc-row"/.test(h1) && !/class="item-card/.test(h1) && !/검수 결과 요약/.test(h1));
  check('★ ② 는 항목 카드', /class="item-card/.test(view('103', 'donorCheck')));
  /* 항목 카드의 표지 = 층 배지 긴 꼴('AI가 내용 확인') — 증빙 링크 카드도 .item-card 를 쓰므로 그걸로 가르면 안 된다 */
  const CARD = /파일 올리기 · AI가 내용 확인/;
  check('★ ④ 는 수취 행 · ⑤ 는 항목 카드', !CARD.test(h4) && /class="doc-row"/.test(h4) && CARD.test(h5), {h4:CARD.test(h4), h5:CARD.test(h5)});
}

console.log('\n[③ 대조 판정이 단계로 갈린다]');
{
  check('E7 은 배분처 쪽', W.findingSide({rule:'E7'}) === 'dist');
  check('E2 기부→배분 은 배분처 쪽', W.findingSide({rule:'E2', axis:'기부→배분'}) === 'dist');
  check('E2 구매→기부 · E4 · E3 은 후원자 쪽', ['E4', 'E3', 'E5', 'E6', 'E8'].every(r => W.findingSide({rule:r}) === 'donor') && W.findingSide({rule:'E2', axis:'구매→기부'}) === 'donor');
  const c = W.getCase('103');
  const donorH = W.compareBlock(c, 'donor'), distH = W.compareBlock(c, 'dist'), allH = W.compareBlock(c);
  check('★ 배분처 쪽 카드에는 배분 합계(E7) 가 있고 후원자 쪽에는 없다', /배분 합계|배분 진행 중/.test(distH) && !/배분 합계|배분 진행 중/.test(donorH), {dist:distH.slice(0, 120), donor:donorH.slice(0, 120)});
  check('   전부(⑥) 는 둘을 합친 것 이상', allH.length >= Math.max(donorH.length, distH.length));
}

console.log('\n[④ 미리보기 버튼은 증빙 링크 카드에만]');
{
  const h3 = view('103', 'distDecide'), h6 = view('103', 'done');
  const i = h3.indexOf("openPreview('orgSubmit'"), j = h3.indexOf('<h3>배분기관 증빙 제출 링크</h3>');
  check('★ ③ 링크 카드 머리에 있다', i > 0 && j > 0 && i - j < 400, {i, j});
  check('★ 완결 탭에는 없다', h6.indexOf("openPreview('orgSubmit'") < 0);
  check('   수취 요약 아래에는 더 없다', (view('103', 'distRecv').match(/openPreview\('orgSubmit'/g) || []).length === 1);
}

console.log('\n[⑤ 수취 취소]');
{
  const c = W.getCase('103');
  const it = W.donorItems(c).find(x => x.kind === 'A');
  it.r.st = 'done'; it.r.date = W.TODAY; it.r.by = '담당자 확인';
  const h = view('103', 'donorCheck');
  check('★ 수취완료 첨부 항목에 [수취 취소] 가 있다', new RegExp("undoReceived\\('103','" + it.uid + "'\\)").test(h));
  W.undoReceived('103', it.uid);
  check('★ 되돌리면 수취완료가 아니다', W.itemStatus(it).code !== 'done', W.itemStatus(it));
  check('   파일은 그대로다', it.r.fileIds === undefined || Array.isArray(it.r.fileIds));
  /* 담당자가 [수취 등록] 으로 올린 파일뿐인 항목 — 취소하면 '확인필요' 가 되고 그 파일로 다시 [원본 보고 처리] 할 수 있다 */
  const keepUp = it.r.donorUpload; delete it.r.donorUpload; it.r.fileIds = ['f-staff-1']; W.FILES['f-staff-1'] = {id:'f-staff-1', name:'담당자등록.jpg', type:'image/jpeg', size:1, blob:null, demo:false};
  it.r.st = 'done'; it.r.by = '담당자'; const keepAi = it.r.ai; it.r.ai = '';   /* 데모 원장의 AI 의견 문장은 실 DB 항목엔 없다 */
  W.undoReceived('103', it.uid);
  check('★ 담당자 파일뿐이면 취소 뒤 확인필요(unc)', W.itemStatus(it).code === 'unc', W.itemStatus(it));
  check('   그 항목 카드에 [원본 보고 처리] 가 있다', /원본 보고 처리/.test(view('103', 'donorCheck')));
  W.confirmUpload('103', it.uid);
  check('   원본 보고 처리로 다시 수취완료가 된다', W.itemStatus(it).code === 'done', W.itemStatus(it));
  it.r.donorUpload = keepUp; it.r.ai = keepAi; delete it.r.memo;
  it.r.st = 'done'; c.state = '완결';
  check('   완결 건에는 [수취 취소] 가 없다', !/undoReceived\(/.test(view('103', 'done')));
  W.undoReceived('103', it.uid);
  check('   완결 건은 되돌리지도 않는다', W.itemStatus(it).code === 'done');
  c.state = '미완결';
}

console.log('\n[⑥ 제출된 항목에도 [다른 서류로 수취 등록]]');
{
  const c = W.getCase('103');
  const it = W.donorItems(c).find(x => x.kind === 'A');
  it.r.st = 'miss'; it.r.donorUpload = {status:'uploaded', date:W.TODAY}; it.r.fileIds = it.r.fileIds || [];
  const h = view('103', 'donorCheck');
  check('전제: 제출됨 · 확인 전', W.itemStatus(it).code === 'unc');
  check('★ [다른 서류로 수취 등록] 이 uid 를 싣는다', new RegExp("go\\('receive','103','" + it.uid + "'\\)[^>]*>다른 서류로 수취 등록").test(h));
}

console.log('\n[⑦ 배분 취소 — DB 행도 내린다 · 되읽을 때도 빠진다 (#306)]');
await (async () => {
  const c = W.getCase('103');
  c.checklist.forEach(it => { if (it.stage !== '배분') it.r.st = 'done'; });
  c.inspectedAt = W.TODAY; c.dists = c.dists || [];
  DB.distForm = {caseId:'103', orgName:'햇살지역아동센터', qty:'10', memo:''};
  W.decideDist('103');
  const d = W.liveDists(c).find(x => /햇살/.test(x.orgName));
  check('전제: 햇살 항목이 생겼다', W.distItems(c).some(it => String(it.distId) === String(d.id)));
  W.distItems(c).filter(it => String(it.distId) === String(d.id)).forEach((it, i) => { it.dbId = 9000 + i; });
  DB.distCancel = {id:String(d.id), reason:'기관 사정'};
  W.confirmCancelDist('103', String(d.id));
  await tick(); await tick();
  check('★ 걷어 낸 항목의 dbId 가 retiredItemIds 에 실린다', (c.retiredItemIds || []).includes(9000), c.retiredItemIds);
  check('   화면 체크리스트에서도 빠졌다', !W.distItems(c).some(it => String(it.distId) === String(d.id)));
  /* 되읽기 — 취소된 배분처의 checklist_item 행이 남아 있어도 included=false */
  const K = W.COL, row = {};
  row[K.donation.caseNo] = '9306'; row[K.donation.id] = 9306; row[K.donation.state] = '배분진행'; row[K.donation.donorType] = '법인';
  row.distribution = [{[K.distribution.id]:77, [K.distribution.orgName]:'햇살지역아동센터', [K.distribution.qty]:10, [K.distribution.cancelledAt]:'2026-09-12T00:00:00Z'},
                      {[K.distribution.id]:78, [K.distribution.orgName]:'한빛지역아동센터', [K.distribution.qty]:10}];
  const mk = (id, dist) => ({[K.checklistItem.id]:id, [K.checklistItem.distributionId]:dist, [K.checklistItem.docKey]:'inss', [K.checklistItem.docName]:'인수증',
                              [K.checklistItem.kind]:'첨부파일', [K.checklistItem.stage]:'배분', [K.checklistItem.owner]:'배분처 수취', [K.checklistItem.included]:true, [K.checklistItem.status]:'미수취'});
  row.checklist_item = [mk(1, 77), mk(2, 78)];
  const c2 = W.rowToCase(row);
  check('★ 취소된 배분처(햇살)의 항목은 included=false 로 되읽힌다', c2.checklist.find(it => it.dbId === 1).included === false);
  check('   살아 있는 배분처(한빛)의 항목은 그대로', c2.checklist.find(it => it.dbId === 2).included === true);
  check('   그래서 배분처 서류 목록에 햇살이 안 뜬다', !W.orgGroups(c2).some(g => /햇살/.test(g.name)), W.orgGroups(c2).map(g => g.name));
})();

console.log('\n[⑩ 검수 게이트 — ③ 이후에는 안 세운다 · 담당자 업로드는 새 증빙이 아니다 (#308)]');
{
  const c = W.getCase('117');
  const keep = {i:c.inspectedAt, s:c.state, d:c.dists, o:c.orgId, inc:c.checklist.map(it => it.included)};
  /* 후원자 서류만 다 확정되고 배분처는 아직인 건으로 만든다 (#117 은 원래 전량 배분된 건) */
  c.checklist.forEach(it => { if (it.stage !== '배분') it.r.st = 'done'; else it.included = false; });
  c.dists = []; c.orgId = null;
  delete c.inspectedAt; c.state = '검수 대기'; DB.inspectCaseId = null;
  check('전제: 후원자 서류가 다 확정돼 ③ 이후다', W.stepIndex(W.caseStepOf(c, W.inspectView(c, W.TODAY))) >= W.stepIndex('distDecide'));
  const h3 = view('117', 'distDecide');
  check('★ 검수 실행 게이트가 없다', !/runInspect\(\)">검수 실행/.test(h3));
  check('★ 배분 현황(또는 배분결정)이 보인다', /<h3>배분 현황|<h3>배분결정/.test(h3));
  c.inspectedAt = keep.i; c.state = keep.s; c.dists = keep.d; c.orgId = keep.o; c.checklist.forEach((it, i) => { it.included = keep.inc[i]; });
  const src = readFileSync(APP + 'db.js', 'utf8');
  check('★ 되살릴 때 staff 업로드는 lastEvidenceAt 을 안 올린다', /uploadedByRole\] !== 'staff' &&\s*\n?\s*\(isAfter\(r\[A\.uploadedAt\], c\.lastEvidenceAt\)/.test(src));
}

console.log('\n[⑪ 완결 — 후원자 서류도 아코디언 · 펼치기 표식 · ⑤ 는 검수 실행을 거친다]');
{
  const h6 = view('103', 'done');
  const el = (() => { const d = W.document.createElement('div'); d.innerHTML = h6; return d; })();
  const accs = [...el.querySelectorAll('.org-acc')];
  check('★ 완결에는 후원자 서류 아코디언이 있고 접혀 있다', accs.some(a => /후원자 서류/.test(a.querySelector('summary').textContent) && !a.hasAttribute('open')), accs.map(a => a.querySelector('summary').textContent.trim().slice(0, 20)));
  check('   아코디언 머리에 펼치기 표식 자리가 있다', accs.every(a => a.querySelector('.oa-tog-t')));
  const c = W.getCase('103');
  const keep = c.inspectedAt; delete c.inspectedAt; DB.inspectCaseId = null;
  W.distItems(c).forEach(it => { it.r.orgUpload = {status:'uploaded', date:W.TODAY}; });
  const h5 = view('103', 'distCheck');
  check('★ 기관이 제출한 뒤 검수 표시가 없으면 ⑤ 에 [검수 실행] 이 선다', /runInspect\(\)">검수 실행/.test(h5));
  c.inspectedAt = keep;
}

console.log('\n[⑫ ③ 배분 현황은 검수 게이트와 무관 · 링크 카드 기관명은 DB 열로도 · 미리보기는 링크 아래]');
{
  const c = W.getCase('103');
  const keep = c.inspectedAt; delete c.inspectedAt; DB.inspectCaseId = null;   /* ⑤ 재검수 필요 상태 */
  const h3 = view('103', 'distDecide');
  check('★ 검수 표시가 지워져도 ③ 에 배분 현황이 있다', /<h3>배분 현황/.test(h3));
  c.inspectedAt = keep;   /* 링크 카드는 검수한 건(또는 기관 제출 대기 건)에만 뜬다 — 여기서는 검수 표시를 되돌리고 본다 */
  const K = W.COL.distribution;
  const d = W.liveDists(c)[0]; const nm = d.orgName; delete d.orgName; d[K.orgName] = '늘봄지역아동센터';
  const h4 = view('103', 'distRecv');
  check('★ DB 열(org_name)만 있는 배분처도 링크 카드에 이름이 나온다', /<div class="item-head"><b>늘봄지역아동센터<\/b>/.test(h4));
  const i = h4.indexOf("openPreview('orgSubmit'"), j = h4.indexOf('<h3>배분기관 증빙 제출 링크</h3>'), k = h4.indexOf('<div class="item-head"><b>늘봄지역아동센터');
  check('   미리보기 버튼은 링크 목록 아래에 있다', i > k && k > j, {i, j, k});
  d.orgName = nm; delete d[K.orgName];
}

console.log('\n[⑬ ZIP 은 [완결 처리] 옆 · 완결 전 잠금+툴팁 · 주민/사업자 번호 종류 선택 · E8 기타 문구]');
{
  const c = W.getCase('103'); const keepS = c.state; c.state = '미완결';
  const h2 = view('103', 'donorCheck');
  check('★ 완결 전에는 ZIP 이 잠겨 있고 툴팁이 이유를 말한다', /data-tip="완결 처리 후에 서류를 다운로드 받을 수 있습니다"[\s\S]{0,120}<button class="btn ghost" disabled>서류 일괄 받기 \(ZIP\)/.test(h2));
  check('   완결 처리 버튼 바로 옆이다', h2.indexOf('완결 처리</button>') > 0 && h2.indexOf('서류 일괄 받기 (ZIP)') - h2.indexOf('완결 처리</button>') < 400);
  check('   제목 줄에는 ZIP 이 없다', h2.indexOf('downloadCaseZip') < 0 || h2.indexOf('downloadCaseZip') > h2.indexOf('gate-row'));
  c.state = '완결';
  const h6 = view('103', 'done');
  check('★ 완결이면 ZIP 이 열린다', /onclick="downloadCaseZip\('103'\)"/.test(h6) && !/data-tip="완결 처리 후에/.test(h6));
  check('   ⑥ 완결에는 [다시 검수] 가 없다 · ② 에는 있다', !/runInspect\(\)">다시 검수/.test(h6) && /runInspect\(\)">다시 검수/.test(view('103', 'donorCheck')));
  /* 완결 뒤에는 같은 자리가 [완결 처리 취소] */
  check('★ 완결이면 버튼이 [완결 처리 취소]', /uncompleteCase\('103'\)[^>]*>완결 처리 취소/.test(h6) && !/>완결 처리<\/button>/.test(h6), {취소:h6.indexOf('완결 처리 취소'), 완결:h6.indexOf('>완결 처리</button>')});
  W.uncompleteCase('103');
  check('★ 취소하면 완결이 아니고 완결 시각도 지워진다', c.state !== '완결' && !c.completedAt, {state:c.state, at:c.completedAt});
  const h5b = view('103', 'distCheck');
  check('   ZIP 이 다시 잠기고 [완결 처리] 가 돌아온다', /data-tip="완결 처리 후에/.test(h5b) && /completeCase\('103'\)/.test(h5b));
  c.state = keepS;
  check('★ 주민등록번호 마스크 9001011234567 → 900101-1234567', W.maskRrn('9001011234567') === '900101-1234567');
  check('   E8 기타 문구는 "서류로 읽힙니다" 가 아니다', /사진으로 알아보지 못했습니다/.test(W.checkE8(c, {key:'photo'}, {docKind:'기타'}).reason) && !/서류로 읽힙니다/.test(W.checkE8(c, {key:'photo'}, {docKind:'기타'}).reason));
  check('   E8 다른 종류는 그대로 종류를 댄다', /구매영수증이\(가\) 올라왔습니다/.test(W.checkE8(c, {key:'photo'}, {docKind:'구매영수증'}).reason));
}

console.log('\n[⑭ AI 확인 권장 항목 — 원본 보기 창에 사유 칸(선택) · 적으면 사유해소 · 비우면 수취완료 (#309)]');
{
  const c = W.getCase('103'); const it = W.donorItems(c).find(x => x.kind === 'A');
  const keep = {st:it.r.st, ai:it.r.ai, j:it.r.aiJudge, up:it.r.donorUpload, f:it.r.fileIds, res:it.r.resolution};
  it.r.st = 'miss'; it.r.ai = ''; it.r.resolution = null; it.r.donorUpload = {status:'uploaded', date:W.TODAY}; it.r.fileIds = ['f-309'];
  W.FILES['f-309'] = {id:'f-309', name:'영수증.png', type:'image/png', size:1, blob:null, demo:false};
  it.r.aiJudge = {state:'done', verdict:'확인 권장', reason:'어느 쪽과도 다름', file:'영수증.png', fileId:'f-309'};
  check('전제: AI 확인 권장 · 제출됨', W.aiFlagged(it) && W.itemStatus(it).code === 'unc');
  const hc = view('103', 'donorCheck');
  check('   카드가 사유를 남길 수 있다고 말한다', /확인한 사유를 남길 수 있습니다\(선택\)/.test(hc));
  DB.viewer = {ids:['f-309'], i:0, caseId:'103', key:it.uid}; W.renderViewer();
  const vw = W.document.getElementById('viewerWrap').innerHTML;
  check('★ 원본 보기 창에 사유 칸(선택)과 수취 처리 버튼이 같이 있다', /id="vw-res"/.test(vw) && /viewerConfirm\(\)/.test(vw));
  W.setResDraft(it.uid, '후원처 통화로 금액 경위 확인'); W.viewerConfirm();
  check('★ 사유를 적고 처리하면 사유해소', W.itemStatus(it).code === 'res' && /통화로/.test(it.r.resolution.reason), W.itemStatus(it));
  it.r.resolution = null; it.r.st = 'miss';
  DB.viewer = {ids:['f-309'], i:0, caseId:'103', key:it.uid}; W.viewerConfirm();
  check('★ 사유 없이 처리하면 수취완료', W.itemStatus(it).code === 'done', W.itemStatus(it));
  /* 사유해소도 [수취 취소] 로 되돌린다 */
  it.r.st = 'miss'; it.r.resolution = {reason:'통화 확인', by:'담당자', date:W.TODAY};
  check('   사유해소 항목에도 [수취 취소] 가 있다', new RegExp("undoReceived\\('103','" + it.uid + "'\\)").test(view('103', 'donorCheck')));
  W.undoReceived('103', it.uid);
  check('★ 사유해소를 취소하면 사유가 지워지고 확인 전으로', !it.r.resolution && W.itemStatus(it).code === 'unc', W.itemStatus(it));
  /* 처리된 지적은 주황이 아니라 회색 '담당자 확인함' */
  it.r.st = 'miss';
  check('   처리 전에는 주황 "AI 지적 1건"', /class="gate-ai mt8">AI 지적 1건/.test(W.aiCountLine(c)), W.aiCountLine(c));
  it.r.st = 'done';
  check('★ 처리한 뒤에는 회색 "담당자 확인함"', /gate-ai done[^>]*>AI 지적 1건 · 담당자 확인함/.test(W.aiCountLine(c)), W.aiCountLine(c));
  it.r.st = keep.st; it.r.ai = keep.ai; it.r.aiJudge = keep.j; it.r.donorUpload = keep.up; it.r.fileIds = keep.f; it.r.resolution = keep.res;
}

console.log('\n[⑮ 가액 산정(E3) — 통과도 한 줄 적는다 (U02 실주행)]');
{
  const mk = (o) => Object.assign({donorType:'법인', donorBizNo:'220-81-45012', donation:{book:0, fair:1000000}}, o);
  const cBook = mk({donation:{book:900000, fair:1000000}});
  const rBook = W.checkE3(cBook);
  check('★ 장부가액이 있으면 이상 없음 한 줄', rBook && rBook.verdict === '이상 없음' && /장부가액/.test(rBook.reason), rBook);
  check('   완결을 막지 않는다', rBook && rBook.blocksComplete === false && rBook.isError === false);
  const rNone = W.checkE3(mk({}));
  check('   장부가액 없이 시가면 전처럼 확인 권장', rNone && rNone.verdict === '확인 권장' && rNone.blocksComplete === true, rNone);
  const rNp = W.checkE3(mk({donorBizNo:'220-80-45012'}));   /* 80 = 비영리 (CORP_BIZ_MIDS 밖) */
  check('   비영리법인은 이상 없음', rNp && rNp.verdict === '이상 없음' && /비영리법인/.test(rNp.reason), rNp);
  check('   법인 외는 아무 줄도 없다', W.checkE3({donorType:'법인외', donation:{book:0, fair:1000000}}) === null);
}

console.log('\n[⑯ 매입세액공제 여부 — 법인·개인사업자에게만 (U02 실주행)]');
{
  const corp = DB.cases.find(x => x.donorType === '법인');
  const indiv = DB.cases.find(x => x.donorType !== '법인');
  const form = (c, patch) => {
    DB.caseId = c.id; DB.donorForm.linkCaseId = c.id;
    Object.assign(DB.donorForm, {wantsReceipt:true, idKind:'rrn', vatDeduction:null}, patch || {});
    DB.donorForm.donorType = c.donorType;
    return W.viewDonorForm(false);
  };
  const HAS = /<h3>매입세액공제 여부<\/h3>/;
  check('★ 법인 폼에는 있다', HAS.test(form(corp)));
  check('★ 법인 외 + 주민등록번호면 없다', !HAS.test(form(indiv, {idKind:'rrn'})));
  check('★ 법인 외 + 사업자등록번호면 있다', HAS.test(form(indiv, {idKind:'biz'})));
  check('   영수증을 안 받는 법인 외에는 없다', !HAS.test(form(indiv, {idKind:'biz', wantsReceipt:false})));
  check('   기본값은 [모름] 이 눌려 있다', /class="on"[^>]*>□ 모름/.test(form(corp)));
  W.setVat(true);  check('★ [예] 를 고르면 true', DB.donorForm.vatDeduction === true);
  W.setVat(false); check('   [아니오] 는 false', DB.donorForm.vatDeduction === false);
  W.setVat(null);  check('   [모름] 은 null', DB.donorForm.vatDeduction === null);
  DB.donorForm.donorType = '법인외'; DB.donorForm.vatDeduction = true; W.setIdKind('rrn');
  check('★ 사업자 → 주민으로 바꾸면 답을 비운다', DB.donorForm.vatDeduction === null);
  /* ★ 2026-09-16 — 안 물어본 건을 '모름'으로 저장하던 것을 '아니오'로 바꿨다.
       모름은 자동 통과가 없는 값이라(judge.js) 서류가 완벽한 개인 건도 늘 '확인 권장'이 떴다. */
  const SRC = readFileSync(APP + 'screen-donor.js', 'utf8');
  check('★ 묻는 건인지 판단 — 법인이면 묻는다', W.vatAsked({wantsReceipt:true, idKind:'rrn'}, true) === true);
  check('★ 일반 개인(주민등록번호)에게는 안 묻는다', W.vatAsked({wantsReceipt:true, idKind:'rrn'}, false) === false);
  check('   개인사업자(사업자등록번호)에게는 묻는다', W.vatAsked({wantsReceipt:true, idKind:'biz'}, false) === true);
  check('   영수증을 안 받으면 안 묻는다', W.vatAsked({wantsReceipt:false, idKind:'biz'}, false) === false);
  check('★ 화면과 제출이 같은 함수로 판단한다 (조건이 갈리지 않게)', /if \(vatAsked\(f, corp\)\)/.test(SRC));
  check('★ 안 물어본 건은 제출값이 false — 모름(null)이 아니다', /vatDeduction: !vatAsked\(f, corp\) \? false/.test(SRC));
  check('   물어본 건에서 고른 답은 그대로 실린다', /: \(f\.vatDeduction === true \|\| f\.vatDeduction === false\) \? f\.vatDeduction : null/.test(SRC));
  DB.donorForm.idKind = 'rrn'; DB.donorForm.vatDeduction = null;
  /* ★ DB 는 텍스트 '예'|'아니오'|'모름' — 참/거짓을 그대로 보내면 23514 로 막힌다 (U03 실주행) */
  check('★ DB 로 보낼 땐 예/아니오/null', W.vatToDb(true) === '예' && W.vatToDb(false) === '아니오' && W.vatToDb(null) === null);
  check('★ 되읽을 땐 true/false/null', W.vatFromDb('예') === true && W.vatFromDb('아니오') === false && W.vatFromDb('모름') === null && W.vatFromDb(null) === null);
  check('   옛 불리언 데이터도 그대로 읽는다', W.vatFromDb(true) === true && W.vatFromDb(false) === false);
  const K = W.COL, row = {};
  row[K.donation.caseNo] = '9313'; row[K.donation.id] = 9313; row[K.donation.state] = '검수 대기'; row[K.donation.donorType] = '법인';
  row[K.donation.vatDeduction] = '예'; row.distribution = []; row.checklist_item = [];
  check('   되읽은 건의 vatDeduction 이 true', W.rowToCase(row).vatDeduction === true);
}

console.log('\n[⑧ 제출 대기 건 — 접수 링크 카드]');
{
  const c = W.getCase('117');
  const keep = {a:c.awaitingSubmit, s:c.state, i:c.inspectedAt};
  c.awaitingSubmit = true; c.state = '검수대기'; c.inspectedAt = null;
  const h = view('117');
  check('★ [접수 링크] 카드와 [접수 링크 재발급] 이 있다', /<h3>접수 링크<\/h3>/.test(h) && /reissueIntakeLink\('117'\)/.test(h));
  check('   주소를 모르면 재발급을 안내한다', /주소는 발급할 때 한 번만 보입니다/.test(h));
  c.awaitingSubmit = keep.a; c.state = keep.s; c.inspectedAt = keep.i;
  /* ★ DB 에서 되읽은 건도 — 전에는 awaitingSubmit 이 안 세워져 새로고침하면 카드가 사라졌다 */
  const K = W.COL, row = {};
  row[K.donation.caseNo] = '9308'; row[K.donation.id] = 9308; row[K.donation.state] = '제출 대기'; row[K.donation.donorType] = '법인';
  row.distribution = []; row.checklist_item = [];
  const c2 = W.rowToCase(row);
  check('★ DB 에서 되읽은 제출 대기 건은 awaitingSubmit', c2.awaitingSubmit === true, c2.awaitingSubmit);
  row[K.donation.state] = '검수 대기';
  check('   제출된 건은 아니다', W.rowToCase(row).awaitingSubmit === false);
  DB.cases.push(c2);
  const h2 = view('9308');
  check('★ 되읽은 건의 상세에도 [접수 링크] 카드가 있다', /<h3>접수 링크<\/h3>/.test(h2) && /reissueIntakeLink\('9308'\)/.test(h2));
  check('   목록 설명이 "후원자 제출 대기"', W.stageDetail(c2, W.inspectView(c2, W.TODAY)) === '후원자 제출 대기', W.stageDetail(c2, W.inspectView(c2, W.TODAY)));
  DB.cases.pop();
}

console.log('\n[⑨ 사업자등록번호 마스크]');
{
  check('2208145012 → 220-81-45012', W.maskBizNo('2208145012') === '220-81-45012', W.maskBizNo('2208145012'));
  check('치는 중: 22081 → 220-81', W.maskBizNo('22081') === '220-81');
  check('11자리째는 잘린다', W.maskBizNo('22081450129') === '220-81-45012');
  check('법인 폼의 사업자번호 칸이 maskBizNo 를 부른다', /'maskBizNo'\)/.test(readFileSync(APP + 'screen-donor.js', 'utf8')));
}

console.log('\n[⑩ 신청서 PDF 여러 장 · 한국 시간 (#315)]');
{
  /* #315 는 매입세액공제 400 으로 제출 저장이 부분 실패해 후원자가 6번 냈고, 그때마다
     form_submission 한 줄 + PDF 한 장이 붙었다. 지우지 않는다 — 화면에서만 접는다. */
  check('★ fmtKst 가 UTC 를 한국 시간으로', W.fmtKst('2026-09-12T04:07:00Z') === '2026-09-12 13:07', W.fmtKst('2026-09-12T04:07:00Z'));
  check('   자정을 넘겨도 24시가 아니라 00시', W.fmtKst('2026-09-11T15:00:00Z') === '2026-09-12 00:00', W.fmtKst('2026-09-11T15:00:00Z'));
  check('   빈 값은 빈 문자열 — 없는 시각을 지어내지 않는다', W.fmtKst('') === '' && W.fmtKst(null) === '');

  const wasReady = W.sbReady;
  W.sbReady = () => true;                            /* 여기서부터 라이브 경로 */
  const c = W.getCase('103');
  const at = ['2026-09-12T04:07:00Z','2026-09-12T04:09:00Z','2026-09-12T04:11:00Z','2026-09-12T04:18:00Z'];
  c.formPdfIds = at.map((t, i) => {
    const fid = 'fp900' + i;
    W.FILES[fid] = {id:fid, name:'신청서.pdf', formPdf:true, formType:'법인용', submittedAt:t, role:'donor', distId:null};
    return fid;
  });
  const h = W.formPdfButtonsHtml(c, 'application');
  check('★ 펴 둔 것은 한 장뿐 — 나머지는 <details> 안', (h.split('<details').length - 1) === 1 && /신청서 PDF 열기 · 2026-09-12 13:18/.test(h), h.slice(0, 200));
  check('★ 편 것이 가장 최근 제출이다(13:18)', h.indexOf('13:18') < h.indexOf('<details'), h.indexOf('13:18'));
  check('   접힌 머리에 "이전 제출 3건"', /이전 제출 3건/.test(h));
  check('   접힌 것도 열 수 있다 — 세 장 다 버튼이다', (h.match(/openFormPdf\(/g) || []).length === 4, (h.match(/openFormPdf\(/g) || []).length);
  check('   접힌 번호는 옛것이 1 · 최신 쪽이 3', h.indexOf('신청서 PDF 3 · 2026-09-12 13:11') < h.indexOf('신청서 PDF 1 · 2026-09-12 13:07'));
  check('★ UTC 시각(04:07)은 어디에도 안 뜬다', !/04:07|04:18/.test(h));

  c.formPdfIds = ['fp9000'];
  const one = W.formPdfButtonsHtml(c, 'application');
  check('★ 한 장뿐이면 접는 칸이 아예 없다', !/<details/.test(one) && /신청서 PDF 열기/.test(one), one.slice(0, 160));

  c.formPdfIds = [];
  check('   한 장도 없으면 경고는 그대로', /신청서 PDF가 없습니다/.test(W.formPdfButtonsHtml(c, 'application')));
  delete c.formPdfIds;
  W.sbReady = wasReady;
}

console.log('\n[⑪ 인수증 수량 불일치가 되읽어도 살아남는다 (#317)]');
{
  /* 기관이 100 개 배분에 50 개 인수증을 냈다. submitOrg 가 세우는 qtyFlag 는 **기관 브라우저 메모리**라
     담당자(다른 탭·다른 사람)에게는 없었다 — ⑤ 검수가 아무것도 안 걸렸다.
     이제 되읽을 때 payload['수량'] 과 배분처 qty 로 **다시 센다**. */
  const src = readFileSync(APP + 'db.js', 'utf8');
  check('★ 제출본을 읽을 때 payload 도 함께 읽는다', /K\.pdfKey, K\.payload/.test(src) && /K\.formType, K\.payload/.test(src));

  const c = {id:'9317', dists:[{id:'sd9', orgName:'한빛지역아동센터', qty:100}],
             donation:{qty:200}, checklist:[]};
  const mk = () => ({key:'inss', included:true, distId:'sd9', kind:'A', n:'인수증', r:{}});
  const sub = (qty, distId) => ({formType:'인수증', distId:distId === undefined ? 'sd9' : distId,
                                 payload:qty === null ? null : {'품목':'생수', '수량':qty}, submittedAt:'2026-09-12T04:00:00Z'});

  let it = mk(); W.restoreReceiptQtyFlag(c, it, sub(50));
  check('★ 배분 100 · 인수 50 → 불일치로 선다', !!it.r.qtyFlag && it.r.qtyFlag.recv === 50 && it.r.qtyFlag.expected === 100, it.r.qtyFlag);
  check('   기준은 이 배분처의 배분 수량(신고 200 이 아니다)', it.r.qtyFlag.basis === 'dist', it.r.qtyFlag.basis);
  check('   담당자가 확정할 수 없다 — 사유 경로로만 (itemStatus)', W.itemStatus(it).code !== 'done' && !!it.r.qtyFlag);

  it = mk(); W.restoreReceiptQtyFlag(c, it, sub(100));
  check('★ 수량이 맞으면 아무 말도 하지 않는다', !it.r.qtyFlag);

  it = mk(); it.r.qtyFlag = {recv:1, expected:2, basis:'dist'};
  W.restoreReceiptQtyFlag(c, it, sub(100));
  check('   맞는 값으로 다시 내면 옛 불일치가 걷힌다', !it.r.qtyFlag);

  it = mk(); it.r.resolution = {reason:'파손 50개 — 기관 확인'};
  W.restoreReceiptQtyFlag(c, it, sub(50));
  check('★ 사유로 해소한 것은 되읽어도 다시 안 선다', !it.r.qtyFlag, it.r.qtyFlag);
  it = mk(); it.r.st = 'done';
  W.restoreReceiptQtyFlag(c, it, sub(50));
  check('   담당자가 확정한 것도 그대로 둔다', !it.r.qtyFlag);

  it = mk(); W.restoreReceiptQtyFlag(c, it, sub(null));
  check('★ 수량을 모르는 옛 제출분은 단정하지 않는다', !it.r.qtyFlag);
  it = mk(); W.restoreReceiptQtyFlag(c, it, sub(50, null));
  check('   배분처 행이 없으면 건 신고 수량(200)으로 갈린다', it.r.qtyFlag && it.r.qtyFlag.expected === 200 && it.r.qtyFlag.basis === 'donation', it.r.qtyFlag);

  /* 다기관 — 한 기관 인수증이 다른 기관 항목에 붙으면 안 된다 (restoreFormPdfs 의 distId 대조와 짝) */
  const c2 = {id:'9318', dists:[{id:'sd1', qty:100}, {id:'sd2', qty:80}], donation:{qty:180}, checklist:[]};
  const it2 = {key:'inss', included:true, distId:'sd2', kind:'A', n:'인수증', r:{}};
  W.restoreReceiptQtyFlag(c2, it2, {formType:'인수증', distId:'sd2', payload:{'수량':80}});
  check('★ 다기관 — 자기 배분처 수량(80)과 맞춘다', !it2.r.qtyFlag);
  W.restoreReceiptQtyFlag(c2, it2, {formType:'인수증', distId:'sd2', payload:{'수량':100}});
  check('   옆 기관 수량(100)을 내면 불일치다', !!it2.r.qtyFlag && it2.r.qtyFlag.expected === 80, it2.r.qtyFlag);
}

console.log('\n[⑫ 인수증 수량이 대조 판정에 뜬다 (#317-2)]');
{
  /* 항목 카드의 상자만으로는 부족하다 — 담당자는 "검수 결과(대조 판정)" 를 보고 판단한다.
     AI 를 부르지 않는다: 두 값이 다 등록값이라 비교일 뿐이다(E7 과 같은 이유 · 루브릭 §2 '코드 단독'). */
  const mkCase = (q, extra) => ({id:'9319', donorType:'법인외',
    dists:[{id:'sd9', orgName:'한빛지역아동센터', qty:100}],
    donation:{qty:100}, checklist:[Object.assign({key:'inss', included:true, distId:'sd9', kind:'A', n:'인수증 · 한빛지역아동센터',
      r:Object.assign({orgUpload:{status:'uploaded'}}, q ? {qtyFlag:q} : {})}, extra || {})]});

  const bad = W.compareFindings(mkCase({recv:50, expected:100, basis:'dist'}));
  const rc = bad.filter(f => f.axis === '인수증 ↔ 배분');
  check('★ 불일치가 대조 판정 한 줄로 나온다', rc.length === 1 && rc[0].verdict === '확인 권장', rc);
  check('   양쪽 값과 차이를 나란히 적는다', /인수증 50 \/ 이 기관 배분 수량 100 · 차이 50/.test(rc[0].reason), rc[0].reason);
  check('   어느 기관인지 적는다', /한빛지역아동센터/.test(rc[0].reason));
  check('★ 완결을 막는다', rc[0].blocksComplete === true && W.compareBlocking(mkCase({recv:50, expected:100, basis:'dist'})).some(f => f.axis === '인수증 ↔ 배분'));
  check('★ ⑤ 배분처 쪽에 붙는다 (② 후원자 쪽이 아니다)', W.findingSide(rc[0]) === 'dist', W.findingSide(rc[0]));

  const ok = W.compareFindings(mkCase(null)).filter(f => f.axis === '인수증 ↔ 배분');
  check('★ 맞으면 "이상 없음" 도 한 줄 적는다 — 안 본 것과 구분돼야 한다', ok.length === 1 && ok[0].verdict === '이상 없음' && !ok[0].blocksComplete, ok);

  const notYet = mkCase(null); notYet.checklist[0].r = {};
  check('   아직 안 낸 인수증은 아무 말도 안 한다', !W.compareFindings(notYet).some(f => f.axis === '인수증 ↔ 배분'));

  const solved = mkCase({recv:50, expected:100, basis:'dist'}, null);
  solved.checklist[0].r.resolution = {reason:'50개 파손 — 기관 확인함', by:'담당자'};
  const sf = W.compareFindings(solved).filter(f => f.axis === '인수증 ↔ 배분');
  check('★ 사유로 해소하면 완결을 안 막는다', sf.length === 1 && sf[0].blocksComplete === false && sf[0].verdict === '이상 없음', sf);
  check('   다만 줄은 남는다 — 무엇을 사유로 넘겼는지 (사유 문구 포함)', /사유로 해소[\s\S]*50개 파손/.test(sf[0].reason), sf[0].reason);

  check('   화면 이름은 "수량 대조 · 인수증 ↔ 배분"', W.findingLabel(rc[0]) === '수량 대조 · 인수증 ↔ 배분', W.findingLabel(rc[0]));
}

console.log(`\n${fail ? '❌ ' + fail + '건 실패' : '✅ 전부 통과 — 9/12 건 상세 손질'} (${pass}/${pass + fail})`);
process.exit(fail ? 1 : 0);
