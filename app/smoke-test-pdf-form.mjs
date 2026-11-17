/* 신청서 PDF 레이아웃 검사 — 2026-09-04 선미

   pdf-form.js 의 buildDonorFormPdf 를 node 에서 돌려 샘플 PDF 를 만든다.
   ★ 확인하는 것: 만들어지는가 · 페이지 수 · 한글이 비지 않는가(폰트 검사는 smoke-test-pdf-font.mjs 가 한다)
   눈으로 보는 것은 대신 못 한다 — 만들어진 PDF 를 열어 기관 종이 양식과 대조할 것.

   외부 요청 없음 · DB 안 씀 · npm 불필요
   돌리는 법:  node smoke-test-pdf-form.mjs [출력.pdf] [서명 PNG] [proxy|corp|corp-buy]
              세 번째 인자 proxy = 담당자 직접 등록(서명 없음·영수증 미발급·성인) 변형
              corp = 법인 양식(제조·유통 · 두 단가) · corp-buy = 법인(구매 · 판매가액 열 빈칸)
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const APP = fileURLToPath(new URL('./', import.meta.url));
function loadUMD(file){
  const m = { exports: {} };
  new Function('module', 'exports', 'self', 'window', readFileSync(APP + file, 'utf8'))(m, m.exports, globalThis, globalThis);
  return m.exports;
}
globalThis.PDFLib = loadUMD('assets/vendor/pdf-lib.min.js');
globalThis.fontkit = loadUMD('assets/vendor/fontkit.umd.min.js');
/* common.js 의 표시용 helper 하나(fmtKst)만 꺼내 전역에 둔다 (2026-09-12 · #315).
   pdf-form.js 는 브라우저에서 늘 common.js 뒤에 실리므로(index.html) 거기 것을 그냥 쓴다.
   여기서는 DOM 이 없어 common.js 가 통째로는 안 돌아가니, document 를 흉내만 내고 함수만 집는다. */
globalThis.document = globalThis.document || { addEventListener(){}, querySelector(){ return null; } };
globalThis.fmtKst = new Function(
  readFileSync(APP + 'common.js', 'utf8') + '\nreturn fmtKst;')();

/* 브라우저용 스크립트를 그대로 읽는다 — 전역 함수 셋만 꺼낸다 */
const { buildDonorFormPdf, donorFormPdfData, buildOrgReceiptPdf, orgReceiptPdfData } = new Function(
  readFileSync(APP + 'pdf-form.js', 'utf8') + '\nreturn { buildDonorFormPdf, donorFormPdfData, buildOrgReceiptPdf, orgReceiptPdfData };')();

const out = process.argv[2] || APP + '_pdf-sample-donor.pdf';
const signPath = process.argv[3];
const assets = { font: readFileSync(APP + 'assets/fonts/NDJSans-Regular.ttf'),
                 logo: readFileSync(APP + 'assets/brand/logo-color.png') };
const signImg = signPath ? 'data:image/png;base64,' + readFileSync(signPath).toString('base64') : null;

/* 폼 상태 그대로의 모양 (DB.donorForm) — 법인외 · 영수증 발급 · 만 14세 미만 */
const f = { donorType:'법인외', donorName:'김나눔', path:'구매', donDate:'2026-09-04',
  addr:'서울특별시 종로구 창경궁로 000, 000동 000호 (가상 주소 — 검사용)', phone:'010-0000-0000',
  wantsReceipt:true, rrn:'900101-1******', purpose:'지역 아동 생필품 지원',
  itemName:'즉석밥 3종 세트 (210g×12)', qty:'400', pkg:'34박스', unitSale:'13500',
  note:'', agreePurpose:true, agreeDouble:true, privacyTransfer:true, corpAck:true, privacy:true, signed:!!signImg, signImg,
  under14:true, guardian:true, guardianName:'김보호', guardianPhone:'010-1111-2222', guardianRelation:'모' };
const c = { id:'903', donorType:'법인외', acqPath:'구매', submittedVia:'접수 링크 제출(온라인 신청서)' };

/* 2026-09-05 — 세 번째 인자 corp = 법인 양식(사업자번호·장부/판매 단가·전자서명 없음=인감 서면) */
if (process.argv[4] === 'corp'){
  Object.assign(f, { donorType:'법인', donorName:'주식회사 온누리식품', rrn:'', bizNo:'220-81-45012',
    path:'제조·유통', unitBook:'12500', unitSale:'13500', under14:false, guardian:false,
    signed:!!signImg, note:'' });
  Object.assign(c, { donorType:'법인', acqPath:'제조·유통' });
}
if (process.argv[4] === 'corp-buy'){   /* 법인 · 구매 경로 — 판매가액 열이 비어야 한다 */
  Object.assign(f, { donorType:'법인', donorName:'(주)한빛유통', rrn:'', bizNo:'120-86-00001', wantsReceipt:false,
    path:'구매', unitBook:'9800', unitSale:'', under14:false, guardian:false, signed:!!signImg });
  Object.assign(c, { donorType:'법인', acqPath:'구매' });
}
if (process.argv[4] === 'proxy'){
  Object.assign(f, { signed:false, signImg:null, wantsReceipt:false, rrn:'', under14:false, guardian:false,
    note:'판매가액 확인 불가 — 구매 영수증 기준으로 신고', donorName:'박후원' });
  Object.assign(c, { paperIntake:true, submittedVia:'직접 등록(서면 접수)' });
}
const d = donorFormPdfData(f, c, { submittedAt:'2026-09-04T14:22:00' });

/* ★ 수량 칸에는 낱개 수만 (선미 2026-09-06) — '400 (34박스)' 처럼 붙으면
     읽는 사람이 어느 쪽이 수량인지 헷갈린다. #214·#215 가 깨진 뿌리도 같다(§12 K-1).
   ⚠️ PDF 바이트를 뒤지지 않는다 — 그리는 코드가 무엇을 넣는지를 본다.
     pdf-form.js 의 수량 칸 표현식에 pkg 가 다시 붙으면 여기서 빨개진다. */
const src = readFileSync(APP + 'pdf-form.js', 'utf8');
const qtyCells = src.match(/cell\(ix\[1\][^\n]*money\(it\.qty\)[^\n]*/g) || [];
console.log('수량 칸 ' + qtyCells.length + '곳');
if (qtyCells.length !== 2 || qtyCells.some(l => /it\.pkg/.test(l))){
  console.error('❌ 신청서 수량 칸에 포장 단위가 붙어 있습니다 (또는 칸 수가 바뀌었습니다)');
  qtyCells.forEach(l => console.error('   ' + l.trim()));
  process.exit(1);
}
console.log('✅ 신청서 수량 칸은 낱개 수만 그린다 (포장 단위 안 붙음)');
/* 포장 단위는 버려지지 않는다 — 제출본 payload 의 '단위' 자리 (db.js submissionPayload) */
if (!/'단위'/.test(readFileSync(APP + 'db.js', 'utf8'))){
  console.error('❌ 포장 단위가 제출본에도 안 남습니다 — 값이 통째로 사라집니다');
  process.exit(1);
}
console.log('✅ 포장 단위는 제출본에 그대로 남는다');
/* 인수증의 수량 줄도 같다 (선미 2026-09-06) */
const recvQty = (src.match(/text\('■ 수   량[^\n]*/g) || []);
if (recvQty.length !== 1 || /d\.pkg/.test(recvQty[0])){
  console.error('❌ 인수증 수량 줄에 포장 단위가 붙어 있습니다');
  recvQty.forEach(l => console.error('   ' + l.trim()));
  process.exit(1);
}
console.log('✅ 인수증 수량 줄도 낱개 수만 그린다');

/* ★ 동의 칸이 사실대로 찍히는가 (2026-09-12 선미 · #316) ─────────────────
   PDF 가 읽는 동의 값(d.xxx)이 donorFormPdfData 의 화이트리스트에 **하나라도 빠지면**
   그 칸은 undefined 로 읽혀 조용히 「동의하지 않음」 으로 찍힌다. #316 이 그랬다 —
   privacyTransfer 가 안 실려 모든 법인외 신청서가 국외 이전에 「■ 동의하지 않음」 이었다.
   폼은 동의 없이는 제출을 막으므로 사실과 정반대다. 값 하나가 아니라 **빠짐 자체**를 막는다. */
const consentKeys = [...new Set([...src.matchAll(/box\(!?d\.([A-Za-z0-9_]+)\s*,/g)].map(m => m[1]))];
if (!consentKeys.length){ console.error('❌ PDF 에서 동의 칸(box(d.…))을 못 찾았습니다 — 검사가 헛돕니다'); process.exit(1); }
const snap = donorFormPdfData(f, c, {});
const missing = consentKeys.filter(k => snap[k] === undefined);
if (missing.length){
  console.error('❌ PDF 가 읽는데 스냅샷에 없는 동의 값: ' + missing.join(', ') + ' → 「동의하지 않음」 으로 찍힙니다');
  process.exit(1);
}
console.log('✅ PDF 가 읽는 동의 값 ' + consentKeys.length + '개가 전부 스냅샷에 실린다 (' + consentKeys.join(' · ') + ')');
/* 동의한 것은 동의로, 안 한 것은 안 한 것으로 — 값이 그대로 건너간다 */
if (snap.privacyTransfer !== true){
  console.error('❌ 국외 이전에 동의했는데 스냅샷이 ' + JSON.stringify(snap.privacyTransfer) + ' 입니다');
  process.exit(1);
}
const noT = donorFormPdfData({...f, privacyTransfer:false}, c, {});
if (noT.privacyTransfer !== false){
  console.error('❌ 동의하지 않은 것이 그대로 안 넘어갑니다');
  process.exit(1);
}
console.log('✅ 국외 이전 동의가 사실대로 넘어간다 (동의=true · 미동의=false)');
const t0 = Date.now();
const bytes = await buildDonorFormPdf(d, assets);
writeFileSync(out, bytes);
const pages = (await PDFLib.PDFDocument.load(bytes)).getPageCount();
console.log('✔ ' + out.replace(APP, '') + ' · ' + bytes.length.toLocaleString() + ' bytes · ' + pages + '쪽 · ' + (Date.now() - t0) + 'ms');

/* 2026-09-05 — 변형 인자가 없으면 법인 양식도 한 장 더 만든다(run-all-tests 가 인자 없이 부른다).
   법인 갈래가 조용히 깨지면 여기서 빨갛게 난다. 눈으로 대조할 파일: _pdf-sample-corp.pdf */
if (!process.argv[4]){
  const fc = Object.assign({}, f, { donorType:'법인', donorName:'주식회사 온누리식품', rrn:'', bizNo:'220-81-45012',
    path:'제조·유통', unitBook:'12500', unitSale:'13500', under14:false, guardian:false });
  const cc = Object.assign({}, c, { donorType:'법인', acqPath:'제조·유통' });
  const dc = donorFormPdfData(fc, cc, { submittedAt:'2026-09-04T14:22:00' });
  const okData = dc.formType === '법인' && dc.idNo === '220-81-45012' && dc.items[0].amountBook === 5000000 && dc.totalSale === 5400000;
  const outC = /donor\.pdf$/.test(out) ? out.replace(/donor\.pdf$/, 'corp.pdf') : out.replace(/\.pdf$/, '-corp.pdf');
  const bc = await buildDonorFormPdf(dc, assets);
  writeFileSync(outC, bc);
  const pc = (await PDFLib.PDFDocument.load(bc)).getPageCount();
  console.log((okData && pc >= 1 ? '✔ ' : '✘ ') + outC.replace(APP, '') + ' (법인 양식) · ' + bc.length.toLocaleString() + ' bytes · ' + pc + '쪽' +
              (okData ? '' : ' · 데이터가 틀리다 ' + JSON.stringify({formType:dc.formType, idNo:dc.idNo, amountBook:dc.items[0].amountBook, totalSale:dc.totalSale})));
  if (!okData || pc < 1) process.exit(1);

  /* 인수증 (2026-09-05) — 기관 폼 값 그대로의 모양(DB.orgForm) */
  const fo = { receiverName:'박수령', recvQty:'300', recvPkg:'25박스', recvDate:'2026-09-05', signed:!!signImg, signImg };
  const dr = orgReceiptPdfData(fo, { id:'903', item:'생수 2L 300개', donation:{ itemName:'생수 2L' } },
                               { submittedAt:'2026-09-05T10:12:00', distId:'sd1', org:'늘봄지역아동센터' });
  const okR = dr.formType === '인수증' && dr.receiver === '박수령' && dr.qty === 300 && dr.org === '늘봄지역아동센터' && dr.item === '생수 2L';
  const outR = /donor\.pdf$/.test(out) ? out.replace(/donor\.pdf$/, 'receipt.pdf') : out.replace(/\.pdf$/, '-receipt.pdf');
  const br = await buildOrgReceiptPdf(dr, assets);
  writeFileSync(outR, br);
  const pr = (await PDFLib.PDFDocument.load(br)).getPageCount();
  console.log((okR && pr >= 1 ? '✔ ' : '✘ ') + outR.replace(APP, '') + ' (인수증) · ' + br.length.toLocaleString() + ' bytes · ' + pr + '쪽' +
              (okR ? '' : ' · 데이터가 틀리다 ' + JSON.stringify(dr)));
  if (!okR || pr < 1) process.exit(1);
}
