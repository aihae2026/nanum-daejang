# assets/demo — 시연용 샘플 서류 6장

**지우지 마세요.** 화면의 시연 버튼이 이 파일들을 실제로 올립니다.

## 무엇인가

담당자 화면에서 관리자 세션으로 로그인하면 신청서 폼에 **[정상 건 채우기]** · **[단가 불일치 건 채우기]** 두 버튼이 뜹니다. 누르면 폼 값과 함께 아래 서류가 **진짜 파일로** 첨부되어 AI 검수까지 그대로 돌아갑니다.

| 파일 | 붙는 칸 | 비고 |
|---|---|---|
| `G15_구매영수증.jpg` | 가액 증빙 | 위생용품 세트 250 × 8,400 = 2,100,000 |
| `A2_물품사진.jpg` | 물품 사진 | |
| `A0_법인인감.png` | 법인 인감 | AI 로 보내지 않는 칸 — 신청서 PDF 의 (인) 자리에 찍힌다 |
| `B1_원가명세서.jpg` | 원가 명세 | 법인 제조·유통 경로에서만 |
| `B2_시가확인증빙_자사몰캡처.png` | 시가 확인 | |
| `A4_배분물품사진.jpg` | 배분 사진 | 배분기관 폼 |

## 왜 파일이어야 하나

전에는 빈 첨부를 만들어 붙였는데, 화면에는 파일이 붙은 것처럼 보이지만 **저장소에 아무것도 안 올라가 AI 가 볼 게 없었습니다.** 그래서 이 폴더의 파일을 실제로 받아 첨부합니다.

버튼이 두 개인 이유도 같습니다. 정상 건만 보면 "AI 가 통과시켰다" 만 보입니다. 단가 불일치 건은 **같은 영수증에 단가만** 다르게 넣어 AI 가 확인 권장을 내고 담당자가 원본을 보고 푸는 장면까지 이어집니다.

## 실제 서류가 아닙니다

여섯 장 모두 **가상으로 만든 샘플**입니다. 실제 후원 건·실제 기관·실제 거래가 아닙니다. 영수증 하단에도 그렇게 적혀 있습니다. 실제 후원 서류는 저장소에 올리지 않습니다.

## 사진 출처 (CC BY-SA)

`A2_물품사진.jpg`·`A4_배분물품사진.jpg` 는 Wikimedia Commons 사진을 잘라 내고 손질한 뒤 하단에 출처 줄을 넣은 것입니다. **이 두 장은 원본과 같은 CC BY-SA 라이선스를 따르며**, 저장소의 Apache-2.0·CC BY 4.0 적용 대상이 아닙니다.

| 파일 | 원본 | 저작자 | 라이선스 |
|---|---|---|---|
| `A2_물품사진.jpg` | [Boxes of Nissin Cup Noodles on pallets at Costco, SSF ECR](https://commons.wikimedia.org/wiki/File:Boxes_of_Nissin_Cup_Noodles_on_pallets_at_Costco,_SSF_ECR.JPG) | BrokenSphere | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| `A4_배분물품사진.jpg` | [ダンボール 2007 (838636654)](https://commons.wikimedia.org/wiki/File:%E3%83%80%E3%83%B3%E3%83%9C%E3%83%BC%E3%83%AB_2007_(838636654).jpg) | Satomi Abe ([Flickr](https://www.flickr.com/photos/abex/838636654/)) | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |

나머지 네 장(영수증·인감·원가명세서·자사몰 캡처)은 팀이 가상으로 만든 것입니다. 자사몰 캡처의 도메인은 실재하지 않습니다(2026-11-10 조회).

## 관련

- 코드: `screen-donor.js` 의 `PRESENTER_ASSET` · `presenterFillDonor()`
- 노출 조건: `common.js` 의 `presenterOnly()` — 관리자 세션에서만 보입니다
- 검사: `smoke-test-presenter-fill.mjs`
