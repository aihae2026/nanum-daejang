/* 신청서 PDF 한글 폰트 검사 — 2026-09-04 선미

   ★ 확인하는 것 둘:
     ① assets/fonts/NDJSans-Regular.ttf 가 조건을 만족하는가
        — 한글 음절 11,172자 전부 · ㈜ ① ㎏ ₩ ※ 포함 · glyf 4바이트 정렬
     ② pdf-lib + fontkit 으로 실제로 임베드했을 때 **글자가 비지 않는가**
        — PDF 안에 박힌 폰트를 꺼내 글리프마다 외곽선이 있는지 센다.
          4바이트 정렬이 깨진 폰트는 PDF 가 멀쩡히 만들어지는데 글자만 빈 칸으로 찍힌다
          (2026-09-04 실측). 파일 크기나 예외로는 못 잡아서 이렇게 본다.

   외부 요청 없음 · DB 안 씀 · npm 불필요 (assets/vendor 의 UMD 를 그대로 require)
   돌리는 법:  node smoke-test-pdf-font.mjs [다른 폰트 경로]
*/
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const APP = fileURLToPath(new URL('./', import.meta.url));   /* .pathname 은 한글 경로를 %ED.. 로 바꿔 require 가 못 찾는다 */
/* UMD 를 브라우저처럼 읽는다 — package.json 이 "type":"module" 이라 require 로는 못 읽는다(self 미정의) */
function loadUMD(file){
  const m = { exports: {} };
  new Function('module', 'exports', 'self', 'window', readFileSync(APP + file, 'utf8'))(m, m.exports, globalThis, globalThis);
  return m.exports;
}
const { PDFDocument, PDFDict, PDFName } = loadUMD('assets/vendor/pdf-lib.min.js');
const fontkit = loadUMD('assets/vendor/fontkit.umd.min.js');

const FONT = process.argv[2] || APP + 'assets/fonts/NDJSans-Regular.ttf';
const bytes = readFileSync(FONT);
let fail = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✔ ' : '  ✘ ') + msg); if (!cond) fail++; };

/* ① 폰트 파일 자체 */
console.log('① 폰트 파일 ' + FONT.replace(APP, '') + ' (' + bytes.length.toLocaleString() + ' bytes)');
const font = fontkit.create(bytes);
let syl = 0; for (let c = 0xAC00; c <= 0xD7A3; c++) if (font.hasGlyphForCodePoint(c)) syl++;
ok(syl === 11172, '한글 음절 ' + syl + '/11172');
for (const [ch, cp] of [['㈜',0x321C],['①',0x2460],['㎏',0x338F],['₩',0x20A9],['※',0x203B],['·',0xB7]])
  ok(font.hasGlyphForCodePoint(cp), '기호 ' + ch + ' 있음');
/* loca 정렬 — 테이블을 직접 읽는다 (fontkit 은 offset 을 밖으로 안 준다) */
const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const numTables = dv.getUint16(4); let head, loca, maxp;
for (let i = 0; i < numTables; i++) {
  const o = 12 + i * 16, tag = String.fromCharCode(...bytes.subarray(o, o + 4));
  const t = { off: dv.getUint32(o + 8), len: dv.getUint32(o + 12) };
  if (tag === 'head') head = t; else if (tag === 'loca') loca = t; else if (tag === 'maxp') maxp = t;
}
const longLoca = dv.getInt16(head.off + 50) === 1, n = dv.getUint16(maxp.off + 4) + 1;
let misaligned = 0;
for (let i = 0; i < n; i++) {
  const off = longLoca ? dv.getUint32(loca.off + i * 4) : dv.getUint16(loca.off + i * 2) * 2;
  if (off % 4) misaligned++;
}
ok(misaligned === 0, 'glyf 4바이트 정렬 (어긋난 offset ' + misaligned + '개)');

/* ② 실제 임베드 → PDF 속 폰트를 꺼내 글리프 외곽선 확인 */
console.log('② pdf-lib 임베드 후 글리프 확인');
const TEXT = '물품기부신청서·홍길동·뷁똠쀍·주민등록번호·㈜어린이재단·₩1,234,000·※서명';  /* 공백 없음 — 빈 글리프가 하나도 없어야 한다 */
const doc = await PDFDocument.create(); doc.registerFontkit(fontkit);
const f = await doc.embedFont(bytes, { subset: true });
doc.addPage([595.28, 841.89]).drawText(TEXT, { x: 40, y: 780, size: 11, font: f });
const pdf = await doc.save();
const re = await PDFDocument.load(pdf);
/* FontDescriptor 의 /FontFile2 가 가리키는 스트림이 임베드된 TTF 다 (Flate 압축) */
let embedded = null;
for (const [, obj] of re.context.enumerateIndirectObjects()) {
  if (obj instanceof PDFDict && obj.has(PDFName.of('FontFile2'))) {
    const st = re.context.lookup(obj.get(PDFName.of('FontFile2')));
    embedded = st.dict.has(PDFName.of('Filter')) ? inflateSync(st.contents) : st.contents;
  }
}
ok(!!embedded, 'PDF 에서 임베드 폰트(FontFile2) 추출 ' + (embedded ? embedded.length.toLocaleString() + ' bytes' : ''));
if (embedded) {
  /* 정렬이 깨진 폰트는 여기서 파싱 예외가 나거나(글리프 데이터가 엉뚱한 곳을 가리킴) 빈 외곽선이 나온다 */
  try {
    const sub = fontkit.create(Buffer.from(embedded));
    const uniq = new Set([...TEXT]).size;
    let empty = 0;
    for (let gid = 1; gid < sub.numGlyphs; gid++) if (sub.getGlyph(gid).path.commands.length === 0) empty++;
    ok(sub.numGlyphs - 1 >= uniq, '서브셋 글리프 수 ' + (sub.numGlyphs - 1) + ' ≥ 사용 문자 ' + uniq);
    ok(empty === 0, '외곽선 없는 글리프 ' + empty + '개 (0 이어야 한다 — 있으면 PDF 에 빈 칸으로 찍힌다)');
  } catch (e) {
    ok(false, '임베드된 폰트를 다시 읽지 못함 — 글리프 데이터가 깨졌다: ' + String(e.message || e).slice(0, 80));
  }
}
console.log(fail ? '\n✘ 실패 ' + fail + '건' : '\n✔ 통과 · PDF ' + pdf.length.toLocaleString() + ' bytes');
process.exit(fail ? 1 : 0);
