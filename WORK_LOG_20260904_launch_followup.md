# 2026-09-04 launch follow-up verification

## Scope

원격 `origin/main` 현행화 후 출시 전 남은 작업 중 Codex가 자동으로 확인 가능한 항목을 재검증했다. 운영 데이터 변경, 외부 콘솔 승인, 실기기 확인이 필요한 항목은 수행하지 않고 차단 사유를 분리했다.

## Completed Checks

- `git fetch origin` 후 `main...origin/main` 차이 없음 확인.
- `pnpm.cmd test` 통과: 57 passed.
- `pnpm.cmd --filter web lint` 통과.
- `pnpm.cmd --filter web exec tsc --noEmit --pretty false` 통과.
- `pnpm.cmd --filter web build` 통과.
- `pnpm.cmd --dir apps/mobile typecheck` 통과.
- `pnpm.cmd --dir apps/mobile check:play-readiness` 통과.
- `pnpm.cmd --filter posterlink-crawler test` 통과: 142 passed.
- `pnpm.cmd dlx supabase db lint --linked` 통과: `No schema errors found`.
- `pnpm.cmd dlx supabase functions list` 확인:
  - `process-ocr` ACTIVE v13
  - `check-deadlines` ACTIVE v7
  - `notify-new-match` ACTIVE v5
- `pnpm.cmd --dir apps/mobile exec expo install --check` 통과.
- `pnpm.cmd --dir apps/mobile dlx expo-doctor` 통과: 18/18.
- `pnpm.cmd --dir apps/mobile exec expo config --type public` 정상 출력 확인.
- 운영 URL curl 확인:
  - `https://www.posterlink.kr/privacy` 200
  - `https://www.posterlink.kr/terms` 200
  - `https://www.posterlink.kr/robots.txt` 200
  - `https://www.posterlink.kr/sitemap.xml` 200
  - `https://www.posterlink.kr/opengraph-image` 200
  - `https://posterlink.kr` 200
- Vercel production inspect 확인:
  - deployment `dpl_4BdNYWRQhnwUzPgSdhPKbkAJUEDB`
  - status `Ready`
  - aliases: `https://www.posterlink.kr`, `https://posterlink.kr`, `https://poster-link-web.vercel.app`, `https://poster-link-web-maxmini0130s-projects.vercel.app`

## Audit Notes

- `pnpm.cmd audit:phase1` 전체 실행은 로컬 Supabase reset 단계에서 기존과 같은 `LegacyLocalDbRunningError: failed to inspect service`로 실패했다.
- 현재 PATH에서 `docker` 명령을 찾을 수 없어 이 세션에서 로컬 Supabase container/service 정리는 진행하지 못했다.
- `pnpm.cmd audit:phase1 -- --skip-db-reset`은 공개 테스트 50개와 관리자 테스트 14개가 통과하는 데까지 확인했다.
  - `E2E_USER_EMAIL`과 `E2E_OPERATOR_EMAIL`이 없어 사용자 11개, 운영자 4개 테스트는 스킵됐다.
  - 테스트 항목은 모두 출력됐으나 Playwright 프로세스가 종료 처리에서 멈춰 수동으로 중단했다.
- 처음 skip-db-reset audit 실행에서는 Next dev server가 `SUPABASE_SERVICE_ROLE_KEY`를 읽지 못해 `supabaseKey is required` 로그가 반복됐다.
  - 원인: 루트 `.env.local`에는 서버 키가 있지만 `apps/web/.env.local`에는 공개 Supabase 키만 있다.
  - 비밀값을 파일에 복사하지 않고, 검증 프로세스에 루트 env를 주입해 재실행했을 때 해당 오류는 사라졌다.
- `pnpm.cmd install --frozen-lockfile`로 pull 이후 누락된 모바일 의존성 트리를 lockfile 기준으로 재동기화했다.

## Google Play Console Progress

- 개발자 계정 신원 확인이 완료되어 첫 앱 생성을 진행할 수 있게 됐다.
- Play Console에서 `PosterLink` 앱을 생성했다.
  - 앱 이름: `PosterLink`
  - 패키지명: `com.maxmini.posterlink`
  - 기본 언어: 한국어(`ko-KR`)
  - 앱/게임: 앱
  - 무료/유료: 무료
- 스토어 등록정보 초안 저장 후 게시 개요에 변경사항이 표시되는 것을 확인했다.
- 앱 설정 완료 체크리스트의 개인정보처리방침 항목에 사용할 URL을 확정했다.
  - `https://www.posterlink.kr/privacy`
- 로그인 세부정보는 앱에 제한된 기능이 있으므로 `예`로 입력해야 한다.
  - Google Play 검토용 일반 사용자 테스트 계정이 필요하다.
  - 테스트 계정은 관리자/운영자 권한이 아닌 일반 사용자 권한으로 유지한다.
  - Play Console에는 실제 PosterLink 로그인이 가능한 이메일과 앱 로그인용 비밀번호를 제공한다.

## Still Blocked Or Manual

- Google Play Console 연락처 전화번호 인증 최종 상태 확인.
- Play Console Data safety, 계정 삭제, 앱 액세스, 콘텐츠 등급, 대상 연령 답변 최종 입력 및 제출.
- Google Play 검토용 일반 사용자 테스트 계정 생성 및 로그인 성공 확인.
- Android/iOS 실제 기기 설치, OAuth callback, 카메라/갤러리, push token 저장, 알림 딥링크 확인.
- `posterlink.co.kr` / `www.posterlink.co.kr` DNS 및 Vercel domain 연결. 현재 curl 기준 HTTP code `000`.
- Sentry 클라이언트 오류 실제 수집 여부는 Sentry 프로젝트 접근 또는 의도적 테스트 이벤트 확인이 필요하다.
- 관리자/운영자 비상 계정 확보.
- 운영 데이터 변경을 수반하는 공지 발송, 댓글 숨김/신고 기각, 사용자 역할 변경, 기준정보 변경 수동 검수.
- Supabase Advisor의 Auth leaked password protection, extension schema, 공개 RPC 권한 관련 후속 보안 점검.

## 2026-09-05 Follow-up

- Merged `origin/main` into `feat/ai-verification-phase-1` so the Google Play launch-progress docs are now present on the active AI verification branch.
- Pushed the merge to `origin/feat/ai-verification-phase-1` as `8a9911a`.
- Re-opened the Play Console app dashboard for `PosterLink`.
- Confirmed current Play Console state:
  - App name: `PosterLink`
  - Package: `com.maxmini.posterlink`
  - App status: draft
  - App setup progress: 3 of 11 completed
  - Completed setup items: app content information, privacy policy, login details, ads
  - Remaining setup items: content rating, target audience, data safety, government app, financial features, health, app category/contact details, store listing
  - Production access is still disabled until closed testing requirements are satisfied.
- Confirmed the production access gate shown in Play Console:
  - Publish a closed testing release.
  - At least 12 testers must opt in.
  - Run closed testing for at least 14 days with those testers.
- Rechecked local code signals for Play Console answers:
  - Mobile uses camera and photo library access for poster capture/upload.
  - Mobile uses Expo push notifications and stores Expo push tokens in user profiles.
  - Mobile uses local biometric authentication only on device.
  - Web/mobile account features use Supabase auth, profiles, favorites, notifications, reports, comments, search logs, and link-click logs.
  - Sentry is configured on the web app for error/diagnostic collection.

Next action:

- Prepare and confirm Play Console policy answers before saving them in the external console.
- Create/confirm a normal non-admin reviewer test account before entering login details in Play Console.
- Upload the existing Android AAB to a closed/internal testing track only after confirming the Google service account and target track.

## 2026-09-05 Play Console policy updates

- Saved the following Play Console app-content declarations after operator confirmation:
  - Government app: No
  - Financial features: App does not provide financial features
  - Health app: App has no health features
- Verified the App content overview now shows 4 declarations requiring attention:
  - Content rating
  - Target audience and content
  - Data safety
  - Advertising ID

## 2026-09-05 Advertising ID declaration

- Operator clarified that ads are not planned for the current release, though they may be added later.
- Saved the Play Console Advertising ID declaration as `No` for the current app version because the app currently has no ads SDK and no AD_ID permission usage.
- Noted that the declaration must be updated before any future release that adds ads, Google Mobile Ads SDK, or another SDK that uses advertising ID.
- Verified the App content overview now shows 3 declarations requiring attention:
  - Content rating
  - Target audience and content
  - Data safety

## 2026-09-05 Content rating declaration

- Completed and saved the Google Play IARC content rating questionnaire after operator confirmation.
- Used the developer Google account contact email in the questionnaire without recording it in this log.
- Submitted the app as `All other app types`.
- Key questionnaire signals:
  - User interaction/content exchange: Yes
  - User-generated shared content as primary source: No
  - User/UGC reporting: Yes
  - Online content recommendation or promotion: Yes
  - Age-restricted goods, digital goods purchases, rewards/crypto/NFTs, precise user location sharing, web browser/search engine, and news/education primary category: No
- Verified the submitted rating summary:
  - Korea: 3+
  - IARC generic: 3+
  - PEGI: 3
  - ESRB/ClassInd/USK: Everyone or equivalent
  - Interaction element: user interaction
- Verified the App content overview now shows 2 declarations requiring attention:
  - Target audience and content
  - Data safety

## 2026-09-05 Target audience declaration

- Saved the target audience declaration after operator confirmation.
- Selected only the `16-17` age range for the current Google Play release.
- Noted the Play Console warning that some countries or regions may still treat this age range as children, so family-policy requirements must be rechecked before review submission.
- Verified the App content overview then showed 1 declaration requiring attention:
  - Data safety

## 2026-09-05 Data safety declaration

- Completed and saved the Google Play Data safety declaration after operator confirmation.
- Declared that PosterLink collects user data but does not share user data with third parties.
- Declared all collected data is encrypted in transit.
- Declared account creation through username/password and OAuth.
- Used `https://www.posterlink.kr/privacy` for the account deletion and privacy policy URLs.
- Declared the collected data classes shown in the Play Console preview:
  - Personal info: name, email address, user ID
  - Photos and videos: photos
  - App activity: app interactions, in-app search history, other user-generated content
  - Device or other IDs: device or other IDs
- Verified the App content overview shows no declarations requiring attention and displays the message that all app-content declarations have been checked.
- Play Console now instructs that the saved changes are ready to be sent for review from Publishing overview.

## 2026-09-05 Store settings and listing draft

- Saved Play Console Store settings:
  - App/game type: App
  - Category: Events
  - Store listing email: `privacy@posterlink.kr`
  - Store listing website: `https://www.posterlink.kr`
  - Phone number left blank because it is optional and no public support phone number was confirmed.
- Created Google Play upload-ready visual assets in `apps/mobile/store-assets/google-play/`:
  - `app-icon-512.png` (`512x512`, under 1 MB)
  - `feature-graphic-1024x500.png` (`1024x500`)
  - `phone-01-home.png` (`1080x1920`)
  - `phone-02-posters.png` (`1080x1920`)
  - `phone-03-deadline.png` (`1080x1920`)
  - `phone-04-request.png` (`1080x1920`)
- Entered and draft-saved the default Korean store listing text:
  - App name: `PosterLink`
  - Short description: public notices, support programs, education, and events in one place with official application paths.
  - Full description includes the non-government-app disclaimer and tells users to confirm final details on the source institution's official notice.
- Attempted automated Play Console asset upload, but browser file injection was blocked by the remote browser security boundary.
- Remaining manual Play Console action: upload the generated icon, feature graphic, and at least 2 phone screenshots through each `Asset add > Upload` control, then save/review the default store listing.

## 2026-09-05 Launch gate recheck

- Rechecked the Play Console dashboard after the store settings and listing draft work.
- Dashboard still shows app setup as `9/11 complete`.
- The remaining setup blockers are:
  - Store listing images must be manually uploaded in Play Console.
  - The default store listing must then be reviewed and saved.
- Rechecked EAS Android submit prerequisites:
  - `apps/mobile/eas.json` is configured to submit Android to the `internal` track.
  - `apps/mobile/private/google-service-account.json` is not present locally, so automated Google Play submission cannot run from this workspace yet.
- Corrected the remaining-account wording: the Google Play reviewer account had already been prepared and app access/login details were already marked complete in Play Console; the remaining task is to recheck that the existing normal-user account can still log in successfully.
- Production access remains gated by closed testing:
  - Publish a closed testing release.
  - 12 or more testers must opt in.
  - The opted-in testers must remain opted in for at least 14 consecutive days.

## 2026-09-05 Store listing saved

- Operator manually uploaded the Play Console store listing assets:
  - app icon
  - feature graphic
  - 4 phone screenshots
- Verified the default store listing review page showed:
  - App icon: `app-icon-512.png`
  - Feature graphic: `feature-graphic-1024x500.png`
  - Phone screenshots: `phone-04-request.png`, `phone-03-deadline.png`, `phone-01-home.png`, `phone-02-posters.png`
  - Status: ready to send for review
- Verified the Play Console dashboard now shows the app identity card and no longer shows the app setup checklist as an active blocker.
- Remaining Play Console launch gate is closed testing:
  - Publish a closed testing release.
  - 12 or more testers must opt in.
  - Run closed testing for at least 14 consecutive days before applying for production access.

## 2026-09-05 Closed testing release draft saved

- Uploaded Android App Bundle version `4 (1.0.0)` was present in the Play Console closed testing release review page.
- Fixed the release blocking error by adding `Republic of Korea / South Korea` as the Alpha closed testing track country/region.
- Saved the Alpha closed testing release draft after the country error disappeared.
- Saved the tester feedback contact as `privacy@posterlink.kr`.
- Verified Publishing overview now contains unsubmitted changes for the Alpha release, store listing, app content, and store settings.
- Did not submit changes to Google review yet.
- Remaining Play Console actions:
  - Create or select a closed testing email list.
  - Add tester Google account emails to that list.
  - Submit the pending Play Console changes for review after the operator confirms the tester list.
  - Collect 12 or more opted-in closed testers and run the test for at least 14 consecutive days before requesting production access.

## 2026-09-06 Category correction follow-up

- Strengthened crawler category rules so safety/traffic 생활정보 notices do not fall back to `CAT_OTHER` or `CAT_WELFARE`.
- Added `CAT_LIFE_INFO` scoring for source category `안전` and keywords such as `자동차`, `차량`, `안전점검`, `무상점검`, `귀성길`, and `추석 귀성`.
- Added a mental-health counseling override so psychology/counseling notices from welfare-flavored sources are categorized as `CAT_HEALTH` instead of `CAT_WELFARE`.
- Added regression tests for:
  - `구로구청<추석귀성길 전 확인! 자동차 무상안전점검 실시(9/6)>` -> `CAT_LIFE_INFO`
  - `서울청년센터 은평 <9월 은평 바로(BARO) 심리상담데이> 참여자 모집` -> `CAT_HEALTH`
- Applied operator-confirmed production category corrections:
  - `c4dc36d8-ab7f-4abf-8870-33cda131c53e` -> `CAT_LIFE_INFO` (`생활정보`)
  - `38f97ba1-3eac-43c0-a918-9ba5c798f21a` -> `CAT_HEALTH` (`건강/의료`)
- Verification:
  - `pnpm --filter posterlink-crawler test` passed, 308 tests.

## 2026-09-06 Home feed tab visibility follow-up

- Reproduced that switching the home feed tabs such as `새로 등록` and `많이 본 공고` could look blank even though poster links were present in the page.
- Added a dedicated home feed results anchor and scroll behavior after feed tab clicks so the rendered cards or empty state are brought into view immediately.
- Added stable feed tab/result test IDs and strengthened the home feed Playwright regression test to click `마감 임박`, `새로 등록`, and `많이 본 공고` via those IDs.
- Verification:
  - `pnpm --filter web lint` passed.
  - `pnpm --dir apps/web test:e2e e2e/home.spec.ts -g "home feed tabs"` passed.
  - `pnpm --filter web build` passed.

## 2026-09-06 Welfare-center education category follow-up

- Strengthened category classification so welfare-center notices are classified by program content rather than host organization alone.
- Added an override that sends coaching/course notices such as `신길종합사회복지관 <일상생활 인테리어 코칭>` to `CAT_EDUCATION`.
- Added a direct-housing-support guard so `주거환경 개선`, `집수리 지원`, `주거비`, `임대주택`, and similar notices remain `CAT_HOUSING` even if the text contains education/course terms.
- Expanded education category keywords used by upload support definitions with `수업`, `클래스`, `워크숍`, `세미나`, and `코칭`.
- Verification:
  - `pnpm --filter posterlink-crawler exec node --test src/poster-classifier-category-regression.test.js` passed, 4 tests.
  - `pnpm --filter posterlink-crawler test` passed, 310 tests.
  - `pnpm --filter web build` passed.
- Deployed the updated crawler/web bundle to Vercel Production:
  - id: `dpl_4hMShgU32BW2zTKZFcqMF1aYnP9H`
  - alias: `https://www.posterlink.kr`
  - status: `Ready`

## 2026-09-06 Semantic category reclassification

- Upgraded the crawler category path from keyword-first classification to semantic category classification for the 10-category system:
  - `지원사업`, `채용`, `공모전`, `교육강좌`, `행사모집`, `입찰`, `정책안내`, `보도자료`, `생활정보`, `기타`.
- Updated the OpenAI category classifier prompt to judge the whole title, summary, body, source organization, and current categories by the notice's primary user outcome/action rather than single keyword hits.
- Added confidence output and retry-safe caching; failed/time-out classifications are no longer stored as durable cache hits.
- Added batched full reclassification script:
  - `pnpm --filter posterlink-crawler apply:semantic-category-reclassification`
  - actual apply requires `--apply --confirm=RECLASSIFY_ALL_CATEGORIES`.
- Connected new crawler uploads to semantic category classification when OpenAI classification is available with confidence >= `0.7`; otherwise the existing rule classifier remains the fallback.
- Corrected education-course fallback rules so course/coaching notices map to `CAT_COURSE` (`교육강좌`) rather than old `CAT_EDUCATION`.
- Full production dry-run result:
  - checked: 2,415 posters (`published`, `closed`, `review`)
  - applicable: 2,402
  - changed: 2,153
  - unchanged: 249
  - skipped low confidence: 13
  - report: `scripts/crawler/data/results/poster-category-reclassification-dryrun-20260906.json`
- Verification:
  - `node --check scripts/crawler/src/poster-category-classifier.js` passed.
  - `node --check scripts/crawler/src/reclassify-poster-categories.js` passed.
  - `pnpm --filter posterlink-crawler exec node --test src/poster-category-classifier.test.js src/poster-classifier-category-regression.test.js` passed, 5 tests.
  - `pnpm --filter posterlink-crawler test` passed, 311 tests.
  - `pnpm --filter web build` passed.
- Deployed the stationary tab-click correction to Vercel Production:
  - id: `dpl_4HxS7wHqWzdQVhdxX2Et53UUSKq2`
  - alias: `https://www.posterlink.kr`
  - status: `Ready`
- Production verification:
  - `E2E_BASE_URL=https://www.posterlink.kr pnpm --dir apps/web test:e2e e2e/home.spec.ts -g "home feed tabs"` passed.

## 2026-09-06 Semantic category v2 reclassification

- Expanded semantic category classification beyond the initial 10-category set to include active specific categories that should not be collapsed into generic participation buckets:
  - `주거/금융`, `소상공인`, `육아/가족`, `건강/의료`.
- Added explicit semantic guidance that mental-health/counseling notices such as `심리상담`, `마음건강`, `정신건강`, `TCI/기질검사`, and `마음치유` should prefer `건강/의료` even when the title uses `참여자 모집`.
- Changed full reclassification and future crawler uploads to keep up to two semantic category links per poster, while storing the first result as `primaryCategory`.
- Updated public/home/detail poster enrichment to use `field_verification.classification.primaryCategory` as the visible representative category when it matches one of the linked categories, preventing unordered `poster_categories` joins from showing a secondary category as the visible field.
- Bumped the semantic category cache key version so v2 does not reuse v1 10-category-only cached classifications.
- Applied production reclassification:
  - v2 dry-run checked 2,415 posters (`published`, `closed`, `review`).
  - 2,412 records were high-confidence/applicable; 3 low-confidence records already matched their current representative category.
  - v2 apply replaced category links/evidence for 2,412 records; 209 records changed from the already-applied v1 result.
- Reapplied v2 with multi-category storage enabled:
  - 2,292 target posters now have one category link.
  - 123 target posters now have two category links.
  - v2 multi apply replaced category links/evidence for 2,412 records; 260 records changed from the previous state.
- Manually reviewed and normalized the 13 v1 low-confidence leftovers before v2:
  - all 2,415 production target posters now have at least one category link.
  - zero-category target posters: 0.
- Verified representative samples:
  - `서울청년센터 은평 <9월 은평 바로(BARO) 심리상담데이> 참여자 모집` -> `CAT_HEALTH` (`건강/의료`)
  - `은평구 심리지원센터 다독임 <청년 진로탐색을 위한 마음치유> 참여자 모집` -> `CAT_HEALTH` (`건강/의료`)
  - `신길종합사회복지관 <일상생활 인테리어 코칭>` -> `CAT_COURSE` (`교육강좌`)
  - `구로구청<추석귀성길 전 확인! 자동차 무상안전점검 실시(9/6)>` -> `CAT_LIFE_INFO` (`생활정보`)
- Deployed the v2 semantic category crawler/web bundle to Vercel Production:
  - id: `dpl_CQxUuBBdMKUvLjaoqdV6QrQu9wMx`
  - alias: `https://www.posterlink.kr`
  - status: `Ready`
- Deployed the multi-category representative-display correction to Vercel Production:
  - id: `dpl_BRs2kZnNo9GmVZHirLLijhnF6WaC`
  - alias: `https://www.posterlink.kr`
  - status: `Ready`

## 2026-09-06 Home feed tab production deployment

- Deployed commit `e768ff7` to Vercel Production.
- Vercel deployment:
  - id: `dpl_CRheqZvYHZbyposUq4fKVFygSy53`
  - alias: `https://www.posterlink.kr`
  - status: `Ready`
- Production verification:
  - `E2E_BASE_URL=https://www.posterlink.kr pnpm --dir apps/web test:e2e e2e/home.spec.ts -g "home feed tabs"` passed.

## 2026-09-06 Home feed tab scroll correction

- Removed the automatic scroll/focus movement added to home feed tab clicks because tab switching should keep the user's viewport stable.
- Kept stable home feed tab/result test IDs and the regression coverage that verifies `마감 임박`, `새로 등록`, and `많이 본 공고` render cards directly below the controls.
- Verification:
  - `pnpm --filter web lint` passed.
  - `pnpm --dir apps/web test:e2e e2e/home.spec.ts -g "home feed tabs"` passed.
  - `pnpm --filter web build` passed.

## 2026-09-06 Date-only review approval

- Reviewed the poster moderation queue for records whose only blocking issue was date verification.
- Added a guarded bulk approval script:
  - `pnpm --filter posterlink-crawler exec node src/approve-date-only-review-posters.js`
  - production writes require `--apply --confirm=APPROVE_DATE_ONLY_REVIEW_POSTERS`.
- Applied the production approval after a dry run:
  - candidates: 59 review posters
  - approved as `published`: 57
  - approved as `closed`: 2, so past notices remain available in search/history flows
  - date issues remaining on applied records: 0
  - deadlines corrected during approval: 19
- Manually checked deadline-mismatch examples where event dates had been mistaken for application deadlines:
  - `서초2동 <2026 서초2동 가왕전 참가자 모집> 안내`: `2026-10-17` -> `2026-09-27`
  - `서울시립대학교 <서울시립대학교 청년취업사관학교 대학+ (도시문제해결사) AI에이전트 과정>`: `2027-02-12` -> `2026-09-13`
  - `광진구1인가구지원센터 <교육 및 여가문화 - 생활체육 프로그램(~9/20)`: `2026-10-28` -> `2026-09-20`
  - `서울청년센터영등포 <2026 추석맞이 상경청년 전 만들기>`: `2026-09-16` -> `2026-09-15`
  - `서울청년센터 양천<2026 청년의 날 행사 - 청년정책패키지, CHECK IN : 양천>` stayed at `2026-09-16`.
- Closed approvals:
  - `서대문구청 <신촌글로벌대학문화축제 참여자 모집(신촌SWYFT운동회, 외국인 유학생 가요제)>`: `2026-08-30`
  - `가락종합사회복지관 <청년이음프로젝트 - 슬기로운 경제생활> 참여자 모집`: `2026-09-03`

## 2026-09-06 Single poster review approval

- Reviewed and approved `서울청년기지개센터 <마포서대문권역센터 9월 테마 관계형성프로그램>`.
- Official source confirmed:
  - source: `사랑의전화마포종합사회복지관` participation notice
  - recruitment period: `2026-08-21` to `2026-09-02`
  - status on source page: closed
  - capacity: `0/15`
- Applied production correction:
  - `poster_status`: `closed`
  - `application_start_at`: `2026-08-21`
  - `application_end_at`: `2026-09-02`
  - `organizer_name` / `application_organization_name`: `사랑의전화마포종합사회복지관`
  - cleared date and region review issues after operator confirmation.
