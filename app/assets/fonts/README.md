# assets/fonts — 신청서 PDF용 한글 폰트

| 파일 | 내용 |
|---|---|
| `NDJSans-Regular.ttf` | 나눔고딕 3.021 서브셋 (1.4MB · 전송 시 약 340KB). PDF 임베드 전용 |
| `OFL.txt` | 라이선스 원문 (SIL Open Font License 1.1) |

## 왜 이 폰트인가 (2026-09-04 확정)
- **나눔고딕**: 재단이 쓰는 서식과 이질감이 없고, OFL 이라 산출물 오픈 라이선스 공개에 걸리지 않는다.
- **한글 음절 11,172자 전부**: KS 2,350자만 남기면 이름의 확장 음절(뷁·똠 등)이 빈 칸으로 찍힌다. 후원자 이름·주소는 자유 입력이라 전부 필요하다.
- **㈜ ① ㎏ ₩ ※ 포함**: 법인명 '㈜OO' 가 흔하다. Google Fonts 배포본(13,297자)에는 ㈜ 가 없어 **네이버 공식 배포본(20,138자)**에서 만들었다.
- **한자 없음**: 양식에 없고 넣으면 2배 커진다. 필요해지면 서브셋 범위에 `U+4E00-9FFF` 를 더해 다시 만든다(아래 「다시 만들 때」).
- **Regular 한 굵기만**: 제목은 크기로 구분한다. Bold 를 더하면 1.4MB 가 또 실린다.
- **WOFF2 안 됨**: 234KB 로 줄지만 `@pdf-lib/fontkit` 이 WOFF2(brotli)를 못 푼다(실측). TTF 를 두고 서버 압축(Cloudflare brotli → 약 340KB)에 맡긴다.

## 이름이 NDJ Sans 인 이유
OFL 은 'Nanum'·'NanumGothic' 을 예약 글꼴명(RFN)으로 두어 **수정본(서브셋 포함)에 그 이름을 못 쓰게** 한다.
그래서 파일명과 폰트 내부 이름(family·PostScript)을 모두 `NDJ Sans`(나눔대장)로 바꿨다. 라이선스는 그대로 OFL.

## ⚠️ 다시 만들 때 — glyf 4바이트 정렬
pdf-lib 은 저장 직전 fontkit 으로 폰트를 한 번 더 서브셋하는데, fontkit 은 각 글리프가 4바이트 경계에 있다고 전제한다.
`pyftsubset` 기본 출력은 그렇지 않아서, **PDF 는 멀쩡히 만들어지는데 글자 대부분이 빈 칸으로 찍힌다**
(2026-09-04 실측 — '물 길동 재단' 만 남고 사라짐. 예외도 없고 파일 크기도 정상이라 눈으로만 보인다).
팀이 쓴 생성 스크립트(`tools/make-pdf-font.py`)는 **미공개 내부 도구라 이 저장소에 없다.**
다시 만들 때는 fontTools 로 서브셋하면서 **`glyf.padding = 4`(글리프 4바이트 정렬)를 반드시 건다** — 이것을 빼면 위 증상이 난다.
그리고 폰트 내부 이름(family·PostScript)을 `NDJ Sans` 로 바꾼다(위 「이름이 NDJ Sans 인 이유」).

```bash
pip install fonttools
# (fontTools 로 서브셋 · glyf.padding = 4 · 이름 변경 → 이 폴더에 NDJSans-Regular.ttf)
node app/smoke-test-pdf-font.mjs                                      # 임베드 후 글리프가 비지 않는지 확인
```

원본 나눔고딕: https://hangeul.naver.com (나눔글꼴 모음 → NanumGothic.ttf, 버전 3.021)
