#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 배포본에서 "저장소 전용 파일"을 지운다 — Cloudflare Pages 빌드 명령이 부른다.
#
# ★ 왜 — Access 를 떼면 이 폴더가 통째로 공개된다. 화면이 쓰는 파일만 있으면 되는데
#   DB 설계도(schema.sql · patch-*.sql)와 검사 스크립트까지 같이 올라가 있다.
#   RLS 가 막고 있으니 데이터가 새는 건 아니지만, 어떤 규칙으로 막았는지를
#   그대로 읽히게 둘 이유가 없다. (미공개 내부 정리 SQL 처럼 공개하지 않을 파일도 배포물에서 빠진다.)
#
# ★ 지우는 것은 빌드 작업본뿐이다 — git 저장소와 내 PC 파일은 그대로다.
#
# ★ 설정 위치 (2026-09-09) — Cloudflare Pages → 프로젝트 → Settings →
#   Builds & deployments → Root directory `app` · Build command `npm install && bash prepublish.sh`
#   (관리자 가이드 5.2 7단계 · 5.3 에도 적어 두었다).
#   ⚠️ 이 설정은 대시보드에만 있고 git 을 따라가지 않는다.
#      본 주소(nanumdaejang.org) 프로젝트로 갈아탈 때 다시 넣어야 한다.
#      → 본 주소 전환 체크리스트에 넣어 뒀다 (미공개 내부 기록).
# ─────────────────────────────────────────────────────────────────────────────
set -eu
cd "$(dirname "$0")"

echo "[prepublish] 지우기 전 파일 수: $(ls -1 | wc -l)"
rm -fv -- *.sql *.mjs *.md config.example.js test-baseline.json 2>/dev/null || true
echo "[prepublish] 지운 뒤 파일 수: $(ls -1 | wc -l)"

# 화면이 반드시 필요로 하는 파일이 살아 있는지 — 하나라도 없으면 배포를 세운다
for f in index.html styles.css api.js common.js db.js pdf-form.js rules-compare.js screen-donor.js screen-staff.js 404.html _headers; do
  [ -e "$f" ] || { echo "[prepublish] ❌ 화면 파일이 사라졌다: $f — 배포를 멈춘다"; exit 1; }
done
echo "[prepublish] ✅ 화면 파일 11개 모두 살아 있음"

# ─────────────────────────────────────────────────────────────────────────────
# 캐시 깨기 — index.html 의 스크립트·스타일 주소에 배포 버전을 붙인다 (2026-09-10 연수)
#
# ★ 왜 — `_headers` 의 no-cache 가 **.js 에는 안 먹는다.** 실측(9/10):
#     your-project-dev.pages.dev/common.js → no-cache, must-revalidate   ← _headers 대로
#     nanumdaejang.org/common.js           → max-age=14400 (4시간)
#     nanumdaejang.org/index.html          → no-cache, must-revalidate   ← HTML 은 먹는다
#   존(zone)의 Browser Cache TTL 이 정적 확장자만 덮기 때문이다. 9/9 밤 본 주소를
#   커스텀 도메인으로 붙이면서 생긴 일이고, 아무도 몰랐다.
#   그 결과 **고친 사람은 고쳤다고 믿고 보는 사람은 안 고쳐졌다고 보는** 상태가 됐다 —
#   `_headers` 주석이 막으려던 바로 그 모양이다.
#
# ★ 왜 이 방법인가 — HTML 은 늘 신선하다. 그러니 HTML 안의 주소만 바꾸면
#   브라우저는 **다른 주소**로 보고 새로 받는다. 대시보드 설정 없이 코드로 닫힌다.
#   (`_headers` 주석의 "그때 파일명에 해시를 붙이는 방식으로 바꾼다" 가 이것이다)
#
# ⚠️ 이걸로 존 설정이 고쳐진 것은 아니다. Browser Cache TTL 을
#   `Respect Existing Headers` 로 바꾸면 이 줄은 없어도 된다 — 그때 지운다.
# ⚠️ 빌드 작업본만 고친다. 저장소의 index.html 은 그대로다.
# ─────────────────────────────────────────────────────────────────────────────
VER="$(date -u +%Y%m%d%H%M%S)"
# src="common.js" → src="common.js?v=…"  ·  이미 ?v= 가 있으면 건드리지 않는다
sed -i -E 's#(src|href)="([A-Za-z0-9_.-]+\.(js|css))"#\1="\2?v='"$VER"'"#g' index.html
echo "[prepublish] 캐시 버전 $VER — 주소를 바꾼 태그: $(grep -c "?v=$VER" index.html)개"

# 하나도 안 바뀌었으면 세운다 — 조용히 지나가면 캐시 문제가 그대로 남는다
if [ "$(grep -c "?v=$VER" index.html)" -eq 0 ]; then
  echo "[prepublish] ❌ 스크립트 주소에 버전을 못 붙였다 — index.html 의 태그 모양이 바뀐 것 같다"
  exit 1
fi
