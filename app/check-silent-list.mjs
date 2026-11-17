/* 조용한 실패 정본이 스스로 세게 한다 (2026-09-03 연수)

   ★ 왜 만들었나 — 9/3 에 항목 하나가 표에서 사라졌는데 아무도 못 봤다.
     17번 자리를 새 발견으로 고쳐 쓰면서 원래 항목이 없어졌고,
     **머리글의 개수(5건·19건)는 그대로라 눈으로는 티가 안 났다.**
     유진 님 말대로 "개수를 세는 자리가 실제 줄 수를 안 세고 있었다".
     정본이 막으려던 모양 그대로다 — 숫자가 사실과 어긋나는데 성공처럼 보였다.

   ★ 이 검사는 내용을 보지 않는다. **적어 둔 수와 실제 줄 수가 같은지**만 본다.
     그리고 번호가 빠지거나 겹치지 않았는지 본다(번호 재사용 = 항목 실종).

   규칙 둘을 코드로 옮긴 것이다:
     · 번호는 재사용하지 않는다 (연수)
     · 틀린 항목은 지우지 말고 그 자리에서 고쳐 쓴다 (유진)
   앞의 것은 여기서 잡힌다. 뒤의 것은 사람만 지킬 수 있다.

   돌리는 법:  node check-silent-list.mjs
*/
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
/* ⚠️ URL.pathname 은 한글을 %EC.. 로 남긴다 — fileURLToPath 로 풀어야 열린다 */
const LIST   = fileURLToPath(new URL('../../handoff/조용한실패-목록.md', import.meta.url));
const SILENT = fileURLToPath(new URL('./smoke-test-silent.mjs', import.meta.url));

let fail = 0;
const skipped = [];                 /* ★ 못 본 것을 통과와 섞지 않는다 (2026-09-03 연수) */
const check = (n, ok, got) => {
  console.log((ok ? '  ✅ ' : '  ❌ ') + n + (ok ? '' : '   ← ' + JSON.stringify(got)));
  if (!ok) fail++;
};

/* 목록 정본(handoff/조용한실패-목록.md)은 미공개 내부 문서라 공개 저장소에 없다 — 없으면 실패가 아니라 '건너뜀' 이다 */
if (!existsSync(LIST)) {
  console.log('⏭ 건너뜀 — 미공개 내부 문서(조용한 실패 목록)가 필요합니다 · 공개 저장소에서는 돌지 않습니다 (check-silent-list.mjs)');
  process.exit(0);
}
const md = readFileSync(LIST, 'utf8').split('\n');

/* ── 표의 실제 줄과 머리글의 수를 각각 모은다 ── */
const sections = [];          /* {title, declared, cumulative, rows:[번호…]} */
let cur = null;
for (const line of md) {
  /* 머리글 예: "## 목록 (발견순 · 9건)" · "## 9/3에 새로 만난 것 (6건 · 위와 합쳐 20건)"
     괄호 안 어디에 있든 첫 'N건' 이 그 절의 수, '위와 합쳐 N건' 이 누계다. */
  if (line.startsWith('## ')) {
    const paren = (line.match(/\(([^)]*)\)\s*$/) || [])[1];
    const own   = paren && paren.match(/(\d+)\s*건/);
    const cum   = paren && paren.match(/위와 합쳐\s*(\d+)\s*건/);
    cur = own ? {title:line.replace(/^##\s*/, ''), declared:+own[1],
                 cumulative:cum ? +cum[1] : null, rows:[]} : null;
    if (cur) sections.push(cur);
    continue;
  }
  const r = cur && line.match(/^\|\s*(\d+)\s*\|/);
  if (r) cur.rows.push(+r[1]);
}

console.log('\n[① 머리글의 수가 실제 줄 수와 같은가]');
check('개수를 적은 절을 찾았다', sections.length > 0, sections.length);
for (const s of sections)
  check(`"${s.title.slice(0, 24)}…" — 적힌 ${s.declared}건 = 실제 ${s.rows.length}줄`,
        s.declared === s.rows.length, {declared:s.declared, actual:s.rows.length, rows:s.rows});

console.log('\n[② 누계가 맞는가]');
let running = 0;
for (const s of sections) {
  running += s.rows.length;
  if (s.cumulative === null) continue;
  check(`"${s.title.slice(0, 24)}…" — 위와 합쳐 ${s.cumulative}건 = 누계 ${running}`,
        s.cumulative === running, {written:s.cumulative, actual:running});
}

console.log('\n[③ 번호가 빠지거나 겹치지 않았는가]');
const all = sections.flatMap(s => s.rows);
const dup = all.filter((n, i) => all.indexOf(n) !== i);
check('★ 같은 번호가 두 번 쓰이지 않았다 (번호 재사용 = 앞 항목 실종)',
      dup.length === 0, dup);
const missing = [];
for (let i = 1; i <= Math.max(0, ...all); i++) if (!all.includes(i)) missing.push(i);
check('★ 빠진 번호가 없다 (사라진 항목이 여기서 드러난다)', missing.length === 0, missing);

/* ── 방어 개수도 같은 방식으로 ── */
console.log('\n[④ 방어 N종이 실제 방어 수와 같은가]');
const src = readFileSync(SILENT, 'utf8');
const declared = (src.match(/방어\s*(\d+)\s*종이 전부 살아/) || [])[1];
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const seen = new Set();
for (const m of src.matchAll(/console\.log\('\\n\[([^\]]*)\]/g))
  for (const ch of m[1]) if (CIRCLED.includes(ch)) seen.add(ch);
for (const m of src.matchAll(/^say\('([^']*)/gm))
  for (const ch of m[1]) if (CIRCLED.includes(ch)) seen.add(ch);
check('smoke-test-silent 에 개수 문장이 있다', !!declared, declared);
check(`적힌 ${declared}종 = 실제 ${seen.size}개 (절 머리글의 번호를 센다)`,
      Number(declared) === seen.size, {declared:Number(declared), actual:seen.size,
                                        found:[...seen].join('')});

/* ⑤ 이미 있는 번호의 내용이 조용히 바뀌지 않았는가 (2026-09-03 유진)
   ★ 왜 ①~④ 로 부족한가 — 9/3 사고를 그대로 재현해 보니 **네 검사가 전부 초록**이었다.
     같은 번호에 다른 내용을 얹으면 개수도 누계도 번호도 안 바뀌기 때문이다.
     즉 이 파일이 잡으려던 그 사고를, 이 파일이 못 잡고 있었다.
   ★ 판단은 자동화하지 않는다(연수 지적이 맞다). 대신 **판단을 적게 만든다** —
     내용을 바꿨으면 '고쳐 쓴 항목' 에 한 줄 적어야 통과한다.
     덮어쓴 것과 고쳐 쓴 것의 차이는 '적었는가' 하나다.
   ⚠️ git 이 없거나 새 파일이면 건너뛴다 — 검사가 환경 탓으로 빨개지면 아무도 안 돌린다. */
console.log('\n[⑤ 이미 있는 번호의 내용이 조용히 바뀌지 않았는가]');
const titleOf = (text) => {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\|\s*(\d+)\s*\|\s*(.*)$/);
    if (!m) continue;
    const b = m[2].match(/\*\*(.+?)\*\*/);          /* 그 줄의 첫 굵은 제목 = 지문 */
    out[+m[1]] = b ? b[1].trim() : m[2].slice(0, 40).trim();
  }
  return out;
};
let before = null;
try {
  before = titleOf(execSync('git show HEAD:handoff/조용한실패-목록.md',
    {cwd:fileURLToPath(new URL('../../', import.meta.url)), encoding:'utf8', stdio:['ignore','pipe','ignore']}));
} catch { /* 이력이 없으면 볼 것이 없다 */ }

if (!before || !Object.keys(before).length){
  /* ⚠️ 건너뛴 것을 초록으로 넘기지 않는다 (2026-09-03 연수 · 실측으로 드러남).
       전에는 이 줄만 찍고 마지막 요약이 "✅ 전부 맞습니다" 였다. 배치로 돌리면
       (node check-silent-list.mjs >/dev/null; echo $?) 이 줄은 아예 안 보이고 rc=0 만 남는다.
       9/3 사고를 심어놓고 돌려봐도 초록이었다 — 이 파일이 잡으려던 그 모양 그대로다. */
  console.log('  ⏭ 이전 판을 읽지 못했습니다 (git 이력 없음) — 이 검사는 건너뜁니다');
  skipped.push('⑤ 이전 판 대조 (git 이력을 읽지 못함)');
} else {
  const now = titleOf(readFileSync(LIST, 'utf8'));
  /* 선언한 번호 — "## 고쳐 쓴 항목" 아래의 "- 17 · 날짜 · 왜" */
  /* ★ 선언은 번호가 아니라 **바꾼 제목**과 짝을 맞춘다 (2026-09-03 연수).
       전에는 번호만 봤다 — 한 번 적힌 번호는 그 뒤로 몇 번을 덮어써도 계속 통과했다.
       실제로 20번에 다른 내용을 얹어 봤더니 "↻ 고쳐 쓴 것으로 적혀 있어 통과" 가 떴다.
       선언이 그 번호의 영구 통행증이 되어 있었다.
     형식:  - 20 · 2026-09-03 · 왜 (누가) → **바꾼 뒤 제목** */
  const declSec = (readFileSync(LIST, 'utf8').split('## 고쳐 쓴 항목')[1] || '').split('\n## ')[0];
  const declTitles = {};              /* 번호 → 선언에 적힌 제목들 */
  const declNoTitle = new Set();      /* 제목 없이 번호만 적은 줄 */
  for (const m of declSec.matchAll(/^-\s*(\d+)\s*·(.*)$/gm)){
    const t = m[2].match(/→\s*\*\*(.+?)\*\*/);
    if (t) (declTitles[+m[1]] = declTitles[+m[1]] || []).push(t[1].trim());
    else declNoTitle.add(+m[1]);
  }

  const gone    = Object.keys(before).map(Number).filter(n => !(n in now));
  const changed = Object.keys(before).map(Number)
                    .filter(n => (n in now) && now[n] !== before[n]);
  const undeclared = changed.filter(n => !(declTitles[n] || []).includes(now[n]));
  const staleDecl = undeclared.filter(n => declNoTitle.has(n) || declTitles[n]);

  check('★ 있던 번호가 사라지지 않았다', gone.length === 0, gone);
  check('★ 내용을 바꾼 번호는 "고쳐 쓴 항목" 에 **바꾼 제목까지** 적혀 있다',
        undeclared.length === 0,
        undeclared.map(n => n + ': "' + before[n] + '" → "' + now[n] + '"'
                       + (declNoTitle.has(n) || declTitles[n]
                          ? '  ※ 선언은 있으나 제목이 다릅니다 — 이번에 바꾼 제목으로 한 줄 더 적으세요'
                          : '')));
  if (staleDecl.length)
    console.log('  ↺ 선언은 있는데 또 바뀐 번호: ' + staleDecl.join(', ') + '번 — 선언은 1회용입니다');
  if (changed.length && !undeclared.length)
    console.log('  ↻ 고쳐 쓴 것으로 적혀 있어 통과: ' + changed.join(', ') + '번');
}

console.log('\n' + '─'.repeat(60));
if (fail){
  console.log(`❌ ${fail}건 — 적어 둔 수와 실제가 어긋납니다. 항목이 사라졌을 수 있습니다.`);
} else if (skipped.length){
  /* ★ 통과와 "못 봤다" 를 같은 문장으로 말하지 않는다.
       stderr 에도 남긴다 — >/dev/null 로 stdout 만 버려도 이건 보인다.
     ⚠️ 그래도 rc 는 0 이다(유진 설계) — 환경 탓으로 빨개지면 아무도 안 돌린다. */
  const msg = `⚠️ 본 것은 전부 맞습니다. 다만 ${skipped.length}가지를 못 봤습니다 — ` + skipped.join(' · ');
  console.log(msg); console.error(msg);
} else {
  console.log('✅ 정본의 수가 전부 실제와 맞습니다');
}
process.exit(fail ? 1 : 0);
