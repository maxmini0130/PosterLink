# Google Play 출시 준비 체크리스트

기준일: 2026-08-21

PosterLink Android 앱을 Google Play 내부 테스트 또는 프로덕션 심사로 올리기 전에 확인할 항목이다. Google Play Console의 정책 입력과 최종 심사 제출 직전 상태는 다시 확인한다.

## 현재 앱 설정

- 패키지명: `com.maxmini.posterlink`
- Expo 앱 버전: `1.0.0`
- Android `versionCode`: `4`
- Expo SDK: `~54.0.37`
- React Native: `0.81.5`
- Android `compileSdkVersion`: `36`
- Android `targetSdkVersion`: `36`
- Android `buildToolsVersion`: `36.0.0`
- API 36 설정 위치: `apps/mobile/app.json`의 `expo-build-properties`
- EAS production 빌드: Android App Bundle(`app-bundle`)
- EAS submit 트랙: `internal`
- 공개 정책 URL:
  - 개인정보처리방침: `https://www.posterlink.kr/privacy`
  - 이용약관: `https://www.posterlink.kr/terms`

## 현재 상태

- `pnpm --dir apps/mobile check:play-readiness` 통과
- `pnpm --dir apps/mobile exec expo install --check` 통과
- `pnpm --dir apps/mobile typecheck` 통과
- `pnpm --dir apps/mobile dlx expo-doctor` 18/18 통과
- 로컬 Gradle `:app:assembleDebug`는 코드 문제가 아니라 로컬 `JAVA_HOME`/`java` 미설정 때문에 실행되지 않았다.
- Google Play Console 개발자 계정 신원 확인이 완료됐다.
- Play Console에서 첫 앱 `PosterLink`를 생성했다.
  - 앱 이름: `PosterLink`
  - 패키지명: `com.maxmini.posterlink`
  - 기본 언어: 한국어(`ko-KR`)
  - 앱/게임: 앱
  - 무료/유료: 무료
- 스토어 등록정보 초안 저장 후 게시 개요에 변경사항이 표시되는 것을 확인했다.
- 앱 콘텐츠 선언을 완료했다.
  - 개인정보처리방침 URL: `https://www.posterlink.kr/privacy`
  - 로그인 세부정보: 제한된 기능이 있으므로 `예`; 검토용 일반 사용자 테스트 계정 입력 완료
  - 완료된 선언: 정부 앱, 금융 기능, 건강 앱, 광고 ID, 콘텐츠 등급, 대상 연령 및 콘텐츠, 데이터 보안
  - 앱 콘텐츠 개요는 주의 필요 선언이 없다고 표시한다.
  - 저장된 변경사항은 출시 준비 시 게시 개요에서 검토 전송해야 한다.
- 스토어 설정을 저장했다.
  - 카테고리: `이벤트`
  - 연락처 이메일: `privacy@posterlink.kr`
  - 웹사이트: `https://www.posterlink.kr`
- 기본 스토어 등록정보 텍스트 초안은 Play Console에 임시 저장했다.
- 기본 스토어 등록정보 이미지는 로컬에 준비했으나, Play Console 파일 업로드는 브라우저 보안 제한 때문에 수동 업로드가 필요하다.

## 남은 차단 또는 수동 확인

- Android 실기기에서 설치, 로그인, 카메라 권한, 갤러리 선택, 포스터 촬영/업로드, push token 저장, 알림 클릭 딥링크를 확인한다.
- Play Console 게시 개요에서 저장된 앱 콘텐츠 변경사항을 검토 전송한다.
- Play Console 기본 스토어 등록정보에 로컬 이미지 애셋을 수동 업로드하고 최종 저장한다.
- Google Play 검토용 일반 사용자 테스트 계정의 실제 로그인 성공을 재확인한다.
- 연락처 전화번호 인증 완료 여부를 Play Console에서 재확인한다.

## Play Console 입력

- 앱 생성:
  - 앱 이름: `PosterLink`
  - 기본 언어: 한국어
  - 앱/게임: 앱
  - 무료/유료: 무료
- 스토어 등록정보:
  - 간단한 설명: `공공 공고·지원사업·교육·행사를 한곳에서 찾고 신청 경로를 확인하세요`
  - 자세한 설명: Play Console에 한국어 초안 임시 저장 완료. 정부 또는 공공기관 공식 앱이 아니라는 고지 포함.
  - 앱 아이콘: `apps/mobile/store-assets/google-play/app-icon-512.png`
  - 피처 그래픽: `apps/mobile/store-assets/google-play/feature-graphic-1024x500.png`
  - 스마트폰 스크린샷:
    - `apps/mobile/store-assets/google-play/phone-01-home.png`
    - `apps/mobile/store-assets/google-play/phone-02-posters.png`
    - `apps/mobile/store-assets/google-play/phone-03-deadline.png`
    - `apps/mobile/store-assets/google-play/phone-04-request.png`
  - 태블릿을 지원하지 않으므로 태블릿 스크린샷은 제외 또는 미지원으로 정리
- 앱 콘텐츠:
  - 개인정보처리방침 URL: `https://www.posterlink.kr/privacy`
  - 광고 포함 여부: 광고 SDK가 없으면 `아니요`
  - 앱 액세스: `예`; 로그인이 필요한 기능과 테스트 계정 안내 입력 완료
  - 대상 연령 및 콘텐츠 등급
  - 데이터 보안
  - 계정 삭제
  - 정부/뉴스/건강/금융 등 특수 카테고리 해당 여부
- 테스트:
  - 내부 테스트 트랙 생성
  - 테스트 이메일 목록 등록
  - 피드백 이메일 또는 URL 등록
  - EAS submit 결과가 Play Console 내부 테스트 릴리스에 연결되는지 확인

## Data Safety 초안

정확한 답변은 Play Console에서 최종 확인한다. 현재 코드 기준으로 예상되는 수집 및 처리 항목은 다음과 같다.

- 계정 정보: 이메일, 사용자 ID
- 앱 활동: 찜, 평가, 신고, 알림 읽음, 검색/공식 링크 클릭 로그
- 앱 정보 및 성능: Sentry가 활성화된 경우 오류/진단 정보
- 사진/동영상: 모바일 앱에서 포스터 촬영 또는 이미지 선택 후 업로드
- 알림 토큰: Expo push token
- 생체 인증: 기기 로컬 인증 사용. 서버로 생체정보를 전송하지 않는다.

## 실기기 검증

- 신규 설치 후 이메일 로그인과 OAuth 로그인 확인
- 카메라 권한 요청 문구 확인
- 갤러리 이미지 선택 확인
- 포스터 촬영, 미리보기, 업로드 확인
- Expo push token 저장과 알림 수신 확인
- 알림 클릭 후 딥링크 이동 확인
- 생체 인증 설정과 실패 시 fallback 확인
- 네트워크 오류, 권한 거절, 빈 데이터 화면 확인
- 로그아웃과 계정 삭제 경로 확인

## 제출 명령

```bash
pnpm --dir apps/mobile typecheck
pnpm --dir apps/mobile check:play-readiness
pnpm --filter @posterlink/mobile build:android:production
pnpm --filter @posterlink/mobile submit:android
```

`apps/mobile/private/google-service-account.json`은 커밋하지 않는다.

## 최신 Android production AAB

- Build ID: `027bab3e-503c-498e-9fdd-3e6152d0056f`
- Expo SDK: `54.0.0`
- Version: `1.0.0`
- Version code: `4`
- Profile: `production`
- Distribution: `store`
- Finished at: `2026-08-23 19:13:03 KST`
- AAB: https://expo.dev/artifacts/eas/61GHsfStsT0BeWKt0286UTtcqWQ7JXkXr2ZTsKQtUFc.aab

## 공식 참고 링크

- Google Play 앱 생성:
  https://support.google.com/googleplay/android-developer/answer/9859152
- 심사 준비 및 앱 콘텐츠 입력:
  https://support.google.com/googleplay/android-developer/answer/9859455
- Data safety:
  https://support.google.com/googleplay/android-developer/answer/10787469
- 계정 삭제 요구사항:
  https://support.google.com/googleplay/android-developer/answer/13327111
- 내부 테스트:
  https://support.google.com/googleplay/android-developer/answer/9845334
- Target API level 요구사항:
  https://developer.android.com/google/play/requirements/target-sdk
- Expo SDK 54:
  https://expo.dev/changelog/sdk-54
- Expo Build Properties:
  https://docs.expo.dev/versions/latest/sdk/build-properties/

## 2026-08-24 재검증

- `pnpm --dir apps/mobile typecheck` 통과
- `pnpm --dir apps/mobile check:play-readiness` 통과
- `pnpm --dir apps/mobile exec expo config --type public` 정상 출력 확인
- Android package: `com.maxmini.posterlink`
- Android `versionCode`: `4`
- Android `compileSdkVersion`: `36`
- Android `targetSdkVersion`: `36`
- Android `buildToolsVersion`: `36.0.0`
- iOS `buildNumber`: `11`
- 당시 남은 차단 항목은 Google Play Console 개발자 계정 신원 확인과 연락처 전화번호 인증이었다.

## 2026-09-04 Play Console 진행

- 개발자 계정 신원 확인 완료.
- 첫 앱 `PosterLink` 생성 완료.
- 패키지명은 앱 설정과 같은 `com.maxmini.posterlink`로 입력.
- 개인정보처리방침 URL은 `https://www.posterlink.kr/privacy` 사용.
- 로그인 세부정보는 제한된 기능이 있으므로 `예`로 진행했고 Play Console에서 완료 처리됨.
- 다음 작업:
  - Google Play 검토용 일반 사용자 테스트 계정의 실제 로그인 성공 재확인
  - 기본 스토어 등록정보 이미지 수동 업로드 및 최종 저장
  - 내부 테스트 트랙 생성 및 Android AAB 업로드

## 2026-09-05 Play Console dashboard check

- Active branch docs were merged from `origin/main` into `feat/ai-verification-phase-1`.
- Play Console dashboard state:
  - App: `PosterLink`
  - Package: `com.maxmini.posterlink`
  - Status: draft
  - App setup: 3/11 complete
  - Completed: app content information, privacy policy, login details, ads
  - Remaining: content rating, target audience, data safety, government app, financial features, health, app category/contact details, store listing
- Production access is gated by closed testing:
  - Publish a closed testing release.
  - 12 or more testers must opt in.
  - Closed testing must run for at least 14 days.

## Play Console answer draft

Use this as an operator checklist before saving answers in Play Console. Final entries should be confirmed in the console UI.

- Ads: No, the current app does not include an ads SDK.
- App access: Yes, some features require login. Provide a normal user reviewer account, not an admin or operator account.
- Government app: No, PosterLink is not an official government app.
- Financial features: No, PosterLink does not provide financial products, trading, banking, credit, insurance, or payment services.
- Health: No, PosterLink does not provide health, medical, wellness treatment, diagnosis, or health-data features.
- Advertising ID: No for the current release. Update this declaration before any future release that adds ads, Google Mobile Ads SDK, or another SDK that uses advertising ID.
- App category: likely `Lifestyle` or `Productivity`; choose the category that best matches public opportunity discovery in the current Play Console options.
- Contact details: use the official support contact for PosterLink. Confirm the email/phone before entering it.
- Account deletion:
  - Web URL: `https://www.posterlink.kr`
  - In-app path must remain reachable after login through the account/profile area.
  - Confirm the exact public account deletion instruction URL if Play Console requires a dedicated URL.
- Data safety submitted on 2026-09-05:
  - User data is collected but not shared with third parties.
  - Collected data is encrypted in transit.
  - Account creation methods: username/password and OAuth.
  - Account deletion URL: `https://www.posterlink.kr/privacy`.
  - Privacy policy URL: `https://www.posterlink.kr/privacy`.
  - Personal info: name, email address, user ID.
  - Photos and videos: photos.
  - App activity: app interactions, in-app search history, other user-generated content.
  - Device or other IDs: device or other IDs.
- Content rating submitted on 2026-09-05:
  - Category: All other app types.
  - Korea: 3+.
  - IARC generic: 3+.
  - PEGI: 3.
  - ESRB/ClassInd/USK: Everyone or equivalent.
  - Interaction element: user interaction.
- Target audience submitted on 2026-09-05:
  - Selected age range: `16-17` only.
  - Recheck family-policy requirements before review submission because Play Console warned that some countries or regions may treat this age range as children.

Current App content overview:

- Requires attention: none.
- Completed declarations:
  - Government app
  - Financial features
  - Health app
  - Advertising ID
  - Content rating
  - Target audience and content
  - Data safety

Do not enter passwords, phone numbers, or private support details into Play Console until the operator confirms the exact values.
