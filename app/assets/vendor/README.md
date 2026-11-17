# assets/vendor — 브라우저에서 쓰는 외부 라이브러리 (빌드 없음 · 그대로 `<script>` 로 로드)

| 파일 | 패키지 | 버전 | 라이선스 | 전역 변수 |
|---|---|---|---|---|
| `pdf-lib.min.js` | pdf-lib | 1.17.1 | MIT | `PDFLib` |
| `fontkit.umd.min.js` | @pdf-lib/fontkit | 1.1.1 | MIT | `fontkit` |

용도: 신청서·인수증 PDF 를 **브라우저에서** 만든다(개인정보가 서버를 거치지 않게 — privacy-design §2).
`fontkit` 은 한글 TTF 임베드(`doc.registerFontkit(fontkit)`)에 필요하다. 폰트는 `../fonts/`.

출처: cdnjs (pdf-lib) · jsdelivr (@pdf-lib/fontkit). CDN 을 런타임에 부르지 않고 파일을 두는 이유 —
앱이 외부 요청 0 으로 시작하는 원칙(README '열어보는 법')과, 제출 순간에 CDN 이 막히면 신청서가 안 만들어지기 때문.
버전을 올릴 때는 `smoke-test-pdf-font.mjs` 를 다시 돌린다.

## 라이선스·저작권 고지 (MIT)

두 파일 모두 MIT 라이선스입니다. MIT 는 **아래 저작권 문구와 허락 문구를 함께 두는 것**이 조건이라 원문을 그대로 옮겨 둡니다.
저장소 전체의 제3자 구성요소 목록은 루트의 `NOTICE` 를 보세요.

- `pdf-lib.min.js` — Copyright (c) 2019 Andrew Dillon (pdf-lib@1.17.1 의 LICENSE.md).
  이 파일 안에는 pdf-lib 이 쓰는 tslib(Microsoft, Apache-2.0 — 파일 머리 주석에 고지 있음)·pako((MIT AND Zlib), Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn)·@pdf-lib/standard-fonts(MIT)·@pdf-lib/upng(MIT, Copyright (c) 2017 Photopea)가 함께 묶여 있습니다.
- `fontkit.umd.min.js` — @pdf-lib/fontkit@1.1.1. npm 패키지에 LICENSE 파일이 없고 package.json 에 `"license": "MIT"`, 저자 Andrew Dillon, 기여자 Devon Govett 로 적혀 있습니다. 원본 foliojs/fontkit 의 LICENSE 는 "Copyright (c) 2014-present Devon Govett" 입니다. 이 파일에도 pako 가 묶여 있습니다.

```
MIT License

Copyright (c) 2019 Andrew Dillon

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

fontkit 의 고지는 위 원문에서 저작권 줄만 "Copyright (c) 2014-present Devon Govett" 로 바꾼 것과 같습니다(조건 문구는 같은 MIT).
