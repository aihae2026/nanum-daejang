/* app-scripts.mjs — index.html 의 <script src> 목록을 읽어 준다 (2026-09-05 선미 · 남은 것 ⑥)

   ★ 왜 — 검사 21개가 앱 스크립트 목록을 **손으로 베껴** 썼다. index.html 에 pdf-form.js 가 추가됐을 때
     두 검사가 그 줄을 못 받아 ReferenceError 로 죽었고(9/4 smoke-test-privacy · 정본 ⑥ 세 번째),
     **죽은 검사는 빨간 줄이 안 난다.** 이 파일 하나가 index.html 을 읽으면 그 모양이 없어진다 —
     화면에 실리는 것과 검사가 싣는 것이 같은 곳에서 나온다.

   ⚠️ 목록이 비거나 핵심 파일이 빠지면 **던진다.** 조용히 빈 배열을 주면 고치려던 것과 같은 모양이다.
   ⚠️ config.local.js 와 /config 는 뺀다 — index.html 에서도 조건부(onerror 허용)다. 실 DB 검사는 opt.config 로 명시한다.

   쓰는 법:
     import { appScripts } from './app-scripts.mjs';
     appScripts()                  → ['common.js','db.js','api.js','rules-compare.js','pdf-form.js','screen-donor.js','screen-staff.js'] (index.html 순서)
     appScripts({ config: true })  → 앞에 'config.local.js' (실 Supabase 로 나가는 검사)
     appScripts({ vendor: true })  → 앞에 pdf-lib·fontkit (브라우저는 지연 로드하지만 jsdom 에는 미리 싣는다) */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP = fileURLToPath(new URL('./', import.meta.url));   /* ⚠️ .pathname 은 한글 폴더를 %ED… 로 깨뜨린다 */
const VENDOR = ['assets/vendor/pdf-lib.min.js', 'assets/vendor/fontkit.umd.min.js'];
const MUST = ['common.js', 'db.js', 'screen-donor.js', 'screen-staff.js'];

export function appScripts(opt = {}) {
  const html = readFileSync(APP + 'index.html', 'utf8');
  /* ★ ?v=… 를 떼고 읽는다 (2026-09-10) — 배포 빌드(prepublish.sh)가 캐시를 깨려고
       주소에 버전을 붙인다. 저장소의 index.html 에는 안 붙지만, 붙은 사본으로 검사를 돌려도
       파일을 못 찾아 죽지 않게 여기서 정규화한다. */
  const list = [...html.matchAll(/<script\s+src="([^"]+)"[^>]*>/g)].map(m => m[1].split('?')[0])
    .filter(s => s !== 'config.local.js' && !s.startsWith('/') && !/^https?:/.test(s));
  const missing = MUST.filter(m => !list.includes(m));
  if (!list.length || missing.length)
    throw new Error('index.html 에서 앱 스크립트 목록을 읽지 못했다 — 빠진 것: ' + (missing.join(', ') || '(전부)') + ' · app-scripts.mjs');
  return [...(opt.vendor ? VENDOR : []), ...(opt.config ? ['config.local.js'] : []), ...list];
}
