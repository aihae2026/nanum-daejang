# app/ — 나눔대장 솔루션 코드

후원물품 접수·검수·배분 증빙을 한 곳에서 처리하는 화면과 규칙이 이 폴더에 있습니다.
**빌드 도구가 없습니다.** `index.html` 을 브라우저로 열면 그대로 뜹니다(외부 요청 0인 상태로 시작).

설치·운영·인수인계 절차는 **[관리자 가이드](../docs/나눔대장_관리자가이드.md)** 에 있습니다.
화면 사용법은 **[이용자 가이드](../docs/나눔대장_이용자가이드.md)** 를 보십시오.

## 어디에 무엇이 있나

| 파일·폴더 | 내용 |
|---|---|
| `index.html` | 껍데기 + 스크립트 로드 순서 (**순서를 바꾸면 깨집니다**) |
| `common.js` | 검수 규칙(순수 로직) · 화면 이동 · 렌더 코어 · 공통 모달 |
| `db.js` | 데이터 계층 — Supabase 읽기·쓰기. 테이블·컬럼 이름의 정본입니다 |
| `api.js` | 서버함수 호출 · AI 판정 결과 저장과 복원 |
| `rules-compare.js` | 금액·수량·일자 대조 규칙 |
| `pdf-form.js` | 브라우저에서 신청서·인수증 PDF 생성 |
| `screen-donor.js` | 후원자·배분기관 제출 화면(폰 기준) · 서명 · 미리보기 |
| `screen-staff.js` | 담당자 홈·접수·목록·건 상세·검수·수취 + 관리자 화면 |
| `styles.css` | 화면 스타일 전체 |
| `functions/` | 서버함수 — 키를 숨겨야 하는 것만 둡니다 ([README](functions/README.md)) |
| `schema.sql` | 테이블 정의 — 구조의 **설계 의도**. 새 환경 설치의 첫 파일 |
| `stage2-inspection.sql` | AI 검수 결과를 담는 표 추가 — `schema.sql` 다음에 실행 |
| `patch-*.sql` | 구조 변경 이력. 어떤 결정이 왜 있었는지 각 파일 머리말에 적혀 있습니다. 새 환경에서는 **파일명 순서대로 전부** 실행 |
| `seed-*.sql` | 검사용 더미 데이터 — **실서비스에서는 실행하지 마십시오** |
| `assets/` | 글꼴 · PDF 라이브러리 · 로고 · 시연용 샘플 서류 (각 폴더 README 참조) |
| `smoke-test-*.mjs` · `run-all-tests.mjs` | 자동 검사 (아래 「검증」 참조) |

**로드 순서** — `common.js`(규칙·상수) → `db.js`(데이터가 common 의 상수를 씁니다) → 화면 2개 → 초기 렌더.

## 주석 읽는 법

코드 곳곳의 주석에 **날짜와 사람 이름**이 붙어 있습니다. 약 13,000줄 중 400줄쯤 됩니다.
장식이 아니라 **왜 그렇게 정했는지**를 남긴 기록입니다. 값만 있고 이유가 없으면
인수받은 쪽이 "이건 왜 있지" 하며 지우고, 같은 함정을 다시 밟습니다.

주석 속 이름은 개발팀 구성원 이름이며, 본인 공개 동의를 받아 결정 근거로 기록했습니다. 동료 테스트 참여자 실명은 비식별 처리했습니다.

예를 들어 `_headers` 의 `Cache-Control: no-cache` 한 줄에는, 코드를 고쳐 배포했는데
브라우저가 옛 파일을 계속 써서 "고쳤는데 화면이 그대로"였던 사고가 함께 적혀 있습니다.
그 설명이 없으면 속도를 이유로 지우기 쉬운 설정입니다.

읽다가 **우리 팀 안에서만 통하는 사건 이름**(화면에서 이미 없어진 버튼 이름, 특정 날짜의 논의,
내부 문서 이름)이 나오면 그 줄은 배경 설명이니 넘어가도 됩니다. 그 앞뒤의 **"왜"** 만 읽으면
필요한 것은 다 얻습니다.

> **코드 주석 속 참조에 대해** — 주석의 「루브릭」(§번호·E1~E8·G번호)은 팀 내부 판정 기준 문서를, 「(미공개 내부 기록)」은 팀 작업 기록을 가리킵니다.
> 둘 다 **미공개 내부 문서라 이 저장소에 없습니다.** 공개된 판정 규칙은 [관리자 가이드 부록 A](../docs/나눔대장_관리자가이드.md#부록-a-검수-판정-규칙)에 있습니다.

`==LOGIC_START==` ~ `==LOGIC_END==` 처럼 대문자로 감싼 표시는 주석이 아니라
**검사가 규칙만 떼어 읽는 자리**입니다. 지우지 마십시오.

## 새 환경에 세울 때

관리자 가이드 **5장 「설치 및 환경 설정」** 을 그대로 따르십시오. 요약하면 이렇습니다.

1. Supabase 프로젝트를 만듭니다.
2. SQL Editor 에서 아래 파일을 **이 순서대로 한 번씩** 실행합니다. 순서를 바꾸거나 빠뜨리면
   관리자 권한 강제·배분 취소·판독값 저장 같은 기능이 빠진 채로 만들어집니다.
   1. `schema.sql`
   2. `stage2-inspection.sql`
   3. `patch-*.sql` 전부 — **파일명(날짜) 순서대로**
      ```
      patch-20260828-contact.sql
      patch-20260828-unit.sql
      patch-20260828-vat.sql
      patch-20260831-dockey.sql
      patch-20260831-donation-date.sql
      patch-20260831-verdict-enum.sql
      patch-20260901-finding-resolution.sql
      patch-20260901-rls-minimal.sql
      patch-20260902-checklist-resolution.sql
      patch-20260902-donation-state.sql
      patch-20260902-inspection-status-error.sql
      patch-20260904-purge.sql
      patch-20260906-donor-name-mask.sql
      patch-20260907-finding-rule-e8.sql
      patch-20260907-rls-close-anon-delete.sql
      patch-20260907-rls-stage2.sql
      patch-20260907-sent-channel-mail.sql
      patch-20260908-rls-link-scope.sql
      patch-20260910-admin-accounts.sql
      patch-20260910-admin-rls.sql
      patch-20260911-caseno-guard.sql
      patch-20260911-dist-cancel.sql
      patch-20260911-dist-lock.sql
      patch-20260911-finding-facts.sql
      ```
3. **파일 저장소(버킷)를 만듭니다** — SQL 이 아니라 Supabase 대시보드의 **Storage → New bucket** 에서 만듭니다.
   이름 `nanumdaejang-docs` · **비공개(Public 끔)** · 파일 크기 한도 **10MB** ·
   허용 형식 **PDF · PNG · JPG · WEBP** (`application/pdf`, `image/png`, `image/jpeg`, `image/webp`).
   이름이 다르면 코드(`db.js` 의 `STORAGE_BUCKET`)와 접근 정책이 맞지 않아 서류 저장이 실패합니다.
4. **신규 가입을 차단합니다** — Authentication 설정에서 셀프 가입을 끕니다.
   > ⚠️ **신규 가입 차단 필수**(Supabase → Authentication 설정에서 새 사용자 가입 허용을 끔). 켜 두면 공개 키를 아는 누구나 가입해 **전체 원장과 신청서 PDF(주민등록번호 포함)를 볼 수 있습니다** — 담당자 접근 정책은 로그인 여부만 확인하기 때문입니다.
5. **최초 관리자 계정을 만들고** `staff` 행에 같은 식별자로 연결합니다.
6. `config.example.js` 를 복사해 같은 폴더에 `config.local.js` 로 저장하고 프로젝트 주소와 공개 키를 넣습니다.
   **이 파일은 저장소에 올리지 않습니다.**
7. Cloudflare Pages 로 이 폴더를 배포합니다. 루트 디렉터리는 `app`, 빌드 명령은 **`npm install && bash prepublish.sh`** 입니다.
   AI 검수 키는 코드가 아니라 **환경변수**로 넣습니다(환경변수 표는 관리자 가이드 5.3).
   > ⚠️ 빌드 명령을 빠뜨리면 `schema.sql`·`patch-*.sql`·검사 스크립트(`*.mjs`)가 **사이트 주소로 그대로 공개**됩니다.
   > 이 설정은 Cloudflare 대시보드에만 있고 저장소를 따라오지 않으니, 프로젝트를 새로 만들 때마다 다시 넣으십시오.

> ⚠️ `seed-*.sql` 은 **검사용 더미 데이터**입니다. 실서비스 환경에서는 실행하지 마십시오.

> ⚠️ 데이터가 이미 들어 있는 환경에 `schema.sql` 을 실행하지 마십시오. 첫머리에서 표를 지우고 다시 만듭니다.
> 위 순서는 **빈 프로젝트 신규 구축 전용**이고, 기존 환경의 구조 변경은 새 `patch-*.sql` 로 합니다.

## 검증

### 먼저 — jsdom 을 깔아 둔다
검사 대부분이 jsdom 으로 브라우저 화면을 흉내 내 돕니다. **없으면 화면 검사가 한꺼번에 실패합니다.**

```bash
npm i jsdom@29.1.1 --prefix /tmp/fast
```

`run-all-tests.mjs` 가 `/tmp/fast` 를 알아서 찾습니다. 검사를 하나만 따로 돌릴 때는
`JSDOM_FROM=/tmp/fast/ node smoke-test-….mjs` 처럼 앞에 붙입니다.

### 전체 검사
```bash
node run-all-tests.mjs
```
서버·DB 없이 도는 59종을 돌리고, **실패뿐 아니라 "안 돈 검사"도 잡습니다**(찍은 항목이 0개이거나 기준선보다 줄어든 경우).
이와 별도로 서버·키·실 DB 가 있어야 도는 검사가 11종 더 있습니다(목록은 `run-all-tests.mjs` 의 `NEEDS_LIVE`).

> 이 저장소만으로는 3종(`smoke-test-uid` · `smoke-test-zip` · `check-silent-list`)이 돌지 않고 **⏭ 건너뜀**으로 표시됩니다(실패로 세지 않음).
> 실제 접속 설정(`config.local.js`)·담당자 자격과 미공개 내부 문서를 읽는데, 자격·개인정보가 들어 있어
> 공개 저장소에 담지 않았습니다. 나머지 56종은 위 jsdom 한 줄이면 그대로 돕니다.
> 건너뛴 검사가 있으면 `--update`(기준선 저장)는 막힙니다 — 기준선은 저장소에 든 `test-baseline.json` 을 그대로 쓰십시오.

> ⚠️ 검사는 **작업 폴더에서** 돌리십시오. `smoke-test-pdf-form` 이 `_pdf-sample-*.pdf` 를 그 자리에 만듭니다.

### 개별 검사
- 신청서 PDF 열람: `smoke-test-pdf-view.mjs` — 열람 기록에 실패하면 파일이 열리지 않는지
- 신청서 제출 → PDF 사슬: `smoke-test-pdf-submit.mjs` — 개인정보가 DB 값에 남지 않는지
- 신청서 PDF 레이아웃: `smoke-test-pdf-form.mjs` → 만들어진 `_pdf-sample-donor.pdf` 를 서식과 대조
- 신청서 PDF 폰트: `smoke-test-pdf-font.mjs` — 임베드 후 글리프가 비지 않는지

> `common.js` 의 `==LOGIC_START==` ~ `==LOGIC_END==` 마커는 검사가 규칙만 떼어 읽는 자리입니다. 지우지 마십시오.
