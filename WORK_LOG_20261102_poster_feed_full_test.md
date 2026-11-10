# 포스터 피드 전수 테스트 (2026-11-02)

상태: 검토 대기 — Codex 검증. 기준 `0a0a9f5` / `feat/poster-feed-20261102`. 제품 코드 수정 없이 현행 자동 검사와 화면 검증을 확대했다. 동일 구현자의 검증이며 독립 교차 검토 승인이나 운영 반영 승인이 아니다.

사용자 요청: “너무 좋아요 전수 테스트 해줘요.” 이전의 운영 DB 쓰기·운영 마이그레이션·배포·push 금지를 유지한다.

## 범위와 실행 환경

- Node 20.20.2, pnpm 10.33.0, Windows. `git fetch origin`, 상태·worktree·AGENTS/CLAUDE/README·지시서·직전 기록을 확인했다.
- `package.json` 기본 목록에만 한정하지 않고 웹·보안·SQL의 모든 현행 `*.test.ts` 46개 파일, 운영 크롤러 `*.test.js` 41개 파일을 실행했다. 추가 개인정보·Sentry·분석·탈퇴 검사도 포함된다.
- 화면: 공개 페이지, 개편 전용 fixture, 역할/가입 통계의 로컬 가짜 Auth 서버, 분석 이벤트의 가짜 응답, iPhone SE/13 WebKit 및 Pixel 7 Chromium.
- 공개 읽기 화면은 `localhost:4000`의 읽기 전용 빌드에서 실행했다. 브라우저의 추적·미승인 쓰기는 추가 네트워크 가드로 차단했다. 실제 계정 로그인·신청·신고·찜 DB 저장을 실행하지 않았다. fixture의 쓰기 성공은 가짜 응답/프로세스 메모리뿐이다.
- 기존 4002 포트가 사용 중이라 권한/통계 원본 검사와 fixture를 Git 제외 폴더에 복사하고 **포트만** 4002→4014, 4010→4015로 바꿨다. 분석 동작 검사도 4001→4016만 바꿨다. 원본 검사의 기대값은 바꾸지 않았다. 기존 포트의 다른 서버는 종료하지 않았다.
- 빌드는 `NEXT_BUILD_DIR=playwright-report/.next-build-check`로 분리해 사용자가 보는 4000 빌드를 덮어쓰지 않았다. 검사 종료 후 테스트 서버와 Next가 임시로 추가한 tsconfig include를 정리했다.

## 결과

| 검사                                 | 결과                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| 웹·보안·SQL·개인정보 전체 단위 검사  | 337건: **334 통과 / 3 실패**                                                           |
| 운영 크롤러 전체                     | **328/328 통과**                                                                       |
| 웹 lint                              | 통과, 경고 없음                                                                        |
| 웹 TypeScript                        | 통과. 새 모바일 검사 추가 후 재실행도 통과                                             |
| Expo 모바일 TypeScript               | 통과                                                                                   |
| Node 20 웹 build                     | 통과                                                                                   |
| 개편 전용 화면 fixture               | 최종 **31개 사례 확인**. 최초 30 통과/콜드 컴파일 timeout 1; 해당 1건 단독 재실행 통과 |
| 공개 화면·분류·SEO·분석 기본         | 121건: **106 통과 / 15 실패**                                                          |
| 격리 역할 보안 화면/API              | 9건: **7 통과 / 1 실패 / 1 조건부 건너뜀**                                             |
| 격리 가입 통계 화면/API              | 5건: **4 통과 / 1 실패**                                                               |
| 실제 분석 동작 + 가짜 Auth/DB 응답   | 7건: **6 통과 / 1 실패**                                                               |
| 새 모바일 현재 기획 검사             | 3건: **2 통과 / 1 실패**                                                               |
| 기존 모바일 하단 바 검사             | 6건: **0 통과 / 6 실패** — 옛 역할 이름/전역 메뉴 전제                                 |
| 읽기 전용 AI healthcheck `--enforce` | 실패(exit 2): 신뢰도 값 없는 이미지 기록 2건, 검수 대기 공고의 날짜 정정 후보 1건      |

단위+크롤러는 총 665건 중 662건 통과, 3건 실패다. 최종 화면 사례는 182건 중 156건 통과, 25건 실패, 1건 조건부 건너뜀이다. 중복 재실행을 더해 성공 건수를 부풀리지 않았다. **전체 통과 판정은 아니다.**

## 제품에서 재현된 문제 / 확인 필요한 기존 계약 변경

### P2: 320px WebKit에서 root 글자 크기 200%일 때 상세 가로 넘침

- 위치: `apps/web/app/posters/[id]/PosterDetailClient.tsx:545`의 `5.5rem` 라벨 열과 우측 flex 값/신고 버튼, `FieldReportButton.tsx:43`의 `shrink-0` 버튼.
- 재현: iPhone SE 프리셋(WebKit, CSS viewport 320×568), 공개 접수 중 상세 → `document.documentElement.style.fontSize='200%'`.
- 실제: `innerWidth=320`, `scrollWidth=371`. 신고 버튼 오른쪽이 약 370.77px에 있어 화면 밖으로 51px 나간다. 신청 버튼 문구도 크게 줄바꿈돼 고정 바가 본문 영역을 많이 차지한다.
- 100%에서는 320/320으로 정상. iPhone 13(390px)·Pixel 7(393px)의 동일 찜→내 공고→상세 및 200% 검사는 통과했다. 기기 실물이 아니라 브라우저 엔진의 모바일 프리셋 검사다.
- 새 회귀 검사: `apps/web/e2e/poster-feed-mobile.spec.ts`. 실패를 `test.fail`/skip으로 숨기지 않았다.
- 수정 방향: 좁은 화면/확대에서도 라벨 열이 값·신고 버튼의 최소 공간을 다 차지하지 않도록 조정하고, 값의 줄바꿈과 신청 버튼 패딩/문구 공간을 함께 확인한다. 원래 상세 구현부의 문제로 기록하며 이번 테스트 요청에서 제품 코드를 고치지 않았다.
- 증거: Git 제외 `data/results/poster-feed/full-test-20261102/iphone-overflow.json`, `apps/web/playwright-report/full-test-20261102/small-iphone-font-200.png`. 정상 100% 캡처도 같은 폴더에 있다.

### P2: 홈의 기존 SSR SEO 계약 유지 누락

- 위치: `apps/web/app/HomeClient.tsx:474`, `apps/web/app/page.tsx`.
- `/` 초기 HTML의 지역·분야 탐색 링크가 기존 테스트 계약 20개에서 **12개**로 줄었다. 서버는 여전히 조합 20개를 조회하지만 새 클라이언트가 `.slice(0, 12)`로 자른다. 링크는 SSR에 존재하므로 크롤링 자체가 전부 사라진 것은 아니다.
- `/api/home/summary`가 돌려주는 집계(실행 시 접수 중 256건)가 새 홈 초기 HTML에는 없다. `seo.spec.ts`의 서버 요약 계약도 실패한다.
- 새 C항에서 큰 제목/안내 상자를 없애는 것과, 기존 SEO 정보를 유지하는 방식은 구분해 결정해야 한다. 유지할 경우 시각적으로 큰 상자를 되살리지 않고 서버에서 의미 있는 요약·탐색 링크를 보존한다. 요약 개수는 새 종료 판정과도 일치시켜야 한다.
- 이 2건은 옛 버튼 이름 실패와 별개로 피드 변경 후 실제 HTML 차이가 확인된 사례다. 변경 의도가 확정되기 전 테스트 기대값만 12로 낮추지 않았다.

### 기존 미달/미해결 항목

- 느린 4G LCP 2.5초 목표는 직전 동일 제품 소스 검사에서 중앙값 8.236초로 미달했다. 이번 테스트 중 여러 엔진/빌드를 동시에 실행한 값을 새 성능 수치로 쓰지 않았다. 상세 조건과 3회 값은 구현 기록 및 `mobile-4g.json` 참조.
- 이전 `c5be223` 검토의 다중 분류 전체 건수 상한·상세 재진입 뒤로 가기 문제는 이번 테스트로 해결됐다고 간주하지 않는다.

## 실패 분류: 기대값을 바꿔 통과 처리하지 않음

| 묶음                              | 실제 원인과 판단                                                                                                                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 단위 3건                          | 기존 profile-role-release 2건·withdrawal-release 1건. 과거 단일 릴리스 스냅샷과 현재 누적 브랜치 차이. 보호 기준을 낮추지 않음                                                                                  |
| 공개 analytics 1건                | 테스트가 전역 fetch를 가로채는 동안 홈의 비동기 taxonomy/Next 선행 읽기까지 `calls`에 섞임. 동의/전송 4건만 있다는 정확 배열 전제와 충돌. 제품의 개인정보 유출로 단정할 근거는 없음                             |
| Naver 공개/역할/통계 각 1건       | 중단 안내와 disabled 버튼이 함께 있어 텍스트 선택자가 중복되거나, 옛 활성 버튼 이름 `네이버로 시작하기`를 기대함. 현재 중단 기능을 켜거나 안내를 지워 통과시키지 않음                                           |
| 분류 4건                          | welfare 34→33(종료 판정), education 4→48, culture 17→46, other 2→8(연결 분류 포함). 단일 분류 count RPC와 새 분류/종료 기준의 비교가 다름. 특히 운영 검색 마이그레이션은 미적용 상태 그대로                     |
| 비공개 공고 404 검사 1건          | 테스트가 고정한 UUID 2개가 현재는 익명 공개 읽기에서 published/closed, exposure_tier null로 반환됨. 이 데이터가 200인 사실을 비공개 유출로 오인하지 않음. 보안 확인에는 가짜 private 레코드/안정된 fixture 필요 |
| 종료 CTA 문구/배치 2건            | 옛 `이 공고는 마감됐어요`/하위 링크가 CTA 아래라는 구조를 기대함. 현재 공식 링크가 CTA 컨테이너 안에 있어 부모와 자식 bbox를 비교한 실패를 시각적 겹침으로 단정하지 않음                                        |
| 알림 이벤트 1건                   | 공개 미리보기는 수집을 끄는 LOCAL_READ_ONLY 모드. 이벤트 POST가 나간다는 검사는 이 환경에서 성립하지 않음. 운영 수집을 켜서 재실행하지 않음                                                                     |
| 홈/비회원 찜 2건                  | 삭제한 큰 홈 안내와 찜 시 강제 로그인 요구를 여전히 기대함. 새 기획은 피드 우선·기기 찜 허용. 새 fixture/모바일 흐름에서 확인                                                                                   |
| 상세 조회수 1건                   | 넓은 `a[href^='/posters/']` 선택자가 `/posters/request` 제보 링크를 먼저 눌러 로그인으로 감. UUID 상세 선택자로 구분해야 함                                                                                     |
| 기존 모바일 6건·분석 favorite 1건 | 옛 group 이름 `공고 상세 동작`을 기다림. 현재 `공고 행동`, 상세에서는 전역 하단 메뉴 숨김이 기획. 새 현재 기획 모바일 검사와 구분                                                                               |
| SEO 2건·새 모바일 1건             | 위의 재현된 HTML/접근성 문제. 이 3개 실패는 실제 차이를 기록하고 유지                                                                                                                                           |

공개 검사 첫 탐색은 basename이 같은 `authenticated/user/closed-poster-alert.spec.ts`도 포함해 122건이 됐다. 로그인 전제 1건을 공개 실패로 잘못 섞은 harness 문제를 확인하고 `testIgnore=**/authenticated/**`로 고친 뒤 **121건 전체를 다시 실행**했다. 표의 수치는 후자의 결과다. 원본 두 보고서를 모두 보존했다.

## AI 품질 게이트의 근거

- 임베딩·필드 검증·이미지 AI 검사 기록 coverage는 각각 100%, 비포스터 공개 이미지/신청 폼을 원문으로 쓰는 사례/거절 후보는 검사 기준에서 0이었다. 이는 원문 의미 정확도를 사람에게 전수 확인받았다는 뜻이 아니다.
- `image_ai_low_confidence_count=2`의 실제 두 공개 레코드는 `source=codex-visual-inspection`, `isPoster=true`, **confidence 필드 없음**이었다. 낮은 수치가 확인된 포스터 2개나 비포스터 2개로 보고하지 않는다. 근거: `public-low-confidence.json`, `low-confidence-provenance.json`.
- 날짜 정정 후보 `8708ca07-d8b3-4d65-8c97-5d25607e5f47`은 **review 상태**이며 application_end_at 2026-11-01→2026-11-11 제안이었다. 이미 공개된 잘못된 마감 1건으로 해석하지 않는다. 원본 확인과 승인 전 변경하지 않았다.
- healthcheck가 실행한 정정/정리 자식 스크립트도 `--apply` 없는 dry-run이다. 게이트 기준을 완화하거나 보고서만 통과로 바꾸지 않았다.

## 미실행 경계

- 실제 Google/카카오/네이버 인증 왕복, 운영 계정·운영 DB의 생성/수정/삭제, 실제 알림 전송, Expo 실기기 카메라/업로드는 실행하지 않았다. 격리 가짜 Auth 성공을 실제 OAuth 성공으로 보고하지 않는다.
- `ocr.spec.ts`의 운영 `check-deadlines` 호출과 실계정이 필요한 authenticated/admin/operator/user 변이 검사는 제외했다. `withdrawal-safety`의 Vercel 합성 세션 조건도 이 로컬 환경에서 충족하지 않아 실행하지 않았다.
- 역할 검사 중 Preview 컴파일 가입 1건은 로컬 전용 모드의 의도된 skip으로 남았다. 나머지 로컬 역할 위조/철회·온보딩·가입·콜백 검사는 가짜 서버로 실행했다.
- 테스트 실패를 통과로 만들기 위한 운영 데이터 변경·기능 스위치 변경·릴리스 보호 약화 없음. 운영 마이그레이션·백필·배포·push 없음.

## 재실행과 산출물

모든 로그/JSON/실패 분류/AI dry-run은 Git 제외 `data/results/poster-feed/full-test-20261102/`에 있다. 브라우저 캡처·격리 harness는 `apps/web/playwright-report/full-test-20261102/`에 있다. 비밀값은 기록/커밋하지 않았다.

주요 파일: `node-tests.log`, `crawler-tests.log`, `web-build.log`, `web-lint-final.log`, `web-types-final.log`, `mobile-types.log`, `ai-healthcheck.json`, `browser-*-summary.json`.

Node 20 Windows에서 `pnpm --filter posterlink-crawler test`의 `src/*.test.js`가 펼쳐지지 않아 명령 자체는 실패했다. 같은 41개 파일을 PowerShell에서 확장한 뒤 Node 20 `--test`에 넘겨 328/328을 확인했다. 명령 실패와 실제 테스트 결과를 따로 보존했다.

```powershell
# 웹/보안/SQL 전체. Node 20 실행 파일을 PATH 앞에 둔 환경에서 실행한다.
$tests = @(rg --files -g '*.test.ts' -g '*.test.tsx' apps/web scripts/security scripts/retention scripts/discovery)
pnpm exec tsx --test --test-concurrency=2 @tests

# Windows Node 20 크롤러의 동일 전체 파일 목록
$tests = @(Get-ChildItem scripts/crawler/src -Filter '*.test.js' | ForEach-Object FullName)
node --test @tests

# 새 모바일 재현: 공개·접수 중 ID를 지정하고 읽기 전용 로컬 서버에서 실행
$env:E2E_DETAIL_POSTER_ID = '<공개 접수 중 공고 UUID>'
$env:E2E_BASE_URL = 'http://localhost:4000'
pnpm --dir apps/web exec playwright test -c playwright.poster-feed-mobile.config.ts
```

이번 커밋 범위는 이 기록과 현재 모바일 기획의 재현 검사/설정뿐이다. 제품 소스를 수정하지 않았으며 실패 1건을 보존한다. 4000 읽기 전용 미리보기는 유지했다.
