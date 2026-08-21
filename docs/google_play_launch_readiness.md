# Google Play 출시 준비 체크리스트

기준일: 2026-08-21

PosterLink Android 앱을 Google Play 내부 테스트 또는 프로덕션 심사로 올리기
전에 확인할 항목이다. Google Play Console의 최신 정책 입력은 최종 제출 직전
다시 확인한다.

## 현재 앱 설정

- 패키지명: `com.maxmini.posterlink`
- Expo 앱 버전: `1.0.0`
- Android `versionCode`: `3`
- EAS production 빌드: Android App Bundle(`app-bundle`)
- EAS submit 트랙: `internal`
- 권한:
  - `CAMERA`
  - `READ_EXTERNAL_STORAGE`
  - `WRITE_EXTERNAL_STORAGE`
  - `USE_BIOMETRIC`
  - `USE_FINGERPRINT`
  - `RECEIVE_BOOT_COMPLETED`
  - `VIBRATE`
- 공개 정책 URL:
  - 개인정보처리방침: `https://www.posterlink.kr/privacy`
  - 이용약관: `https://www.posterlink.kr/terms`

## 차단 항목

- Android 네이티브 설정이 현재 `targetSdkVersion 34`다.
  Google Play는 2026-08-31부터 신규 앱과 앱 업데이트에 Android 16
  API 36 이상을 요구한다. 출시 제출 전 Expo SDK와 Android target SDK
  업그레이드가 필요하다.
- Google Play 계정 삭제 요구사항에 맞는 웹 삭제 요청 URL과 앱 내 삭제 경로를
  최종 확인해야 한다.
- Play Console의 Data safety 답변은 앱 코드, SDK, 개인정보처리방침과
  일치해야 한다.

## Play Console 입력

- 앱 생성:
  - 앱 이름: `PosterLink`
  - 기본 언어: 한국어
  - 앱/게임: 앱
  - 무료/유료: 무료
- 스토어 등록정보:
  - 간단한 설명
  - 자세한 설명
  - 앱 아이콘
  - 피처 그래픽
  - 휴대전화 스크린샷
  - 태블릿을 지원하지 않으므로 태블릿 스크린샷은 제외 또는 미지원으로 정리
- 앱 콘텐츠:
  - 개인정보처리방침 URL
  - 광고 포함 여부: 광고 SDK가 없으면 `아니요`
  - 앱 액세스: 로그인이 필요한 기능과 테스트 계정 안내
  - 대상 연령 및 콘텐츠 등급
  - 데이터 보안
  - 계정 삭제
  - 정부/뉴스/건강/금융 등 특수 카테고리 해당 여부
- 테스트:
  - 내부 테스트 트랙 생성
  - 테스터 이메일 목록 등록
  - 피드백 이메일 또는 URL 등록
  - EAS submit 결과가 Play Console 내부 테스트 릴리스에 연결되는지 확인

## Data Safety 초안

정확한 답변은 Play Console에서 최종 확인한다. 현재 코드 기준으로 예상되는
수집·처리 항목은 다음과 같다.

- 계정 정보: 이메일, 사용자 ID
- 앱 활동: 찜, 댓글, 신고, 알림 읽음, 검색·링크 클릭 로그
- 앱 정보 및 성능: Sentry가 활성화된 경우 오류/진단 정보
- 사진/동영상: 운영자 모바일 앱에서 포스터 촬영 또는 이미지 선택 시 업로드
- 알림 토큰: Expo push token
- 생체 인증: 기기 로컬 인증 사용. 서버로 생체정보를 전송하지 않는다.

## 실기기 검증

- 신규 설치 후 이메일 로그인과 OAuth 로그인 확인
- 카메라 권한 요청 문구 확인
- 갤러리 이미지 선택 확인
- 포스터 촬영, 미리보기, 업로드 확인
- Expo push token 저장과 알림 수신 확인
- 알림 클릭 시 링크 이동 확인
- 생체 인증 설정과 실패 시 fallback 확인
- 네트워크 오류, 권한 거부, 빈 데이터 화면 확인
- 로그아웃과 계정 삭제 경로 확인

## 제출 명령

```bash
pnpm --dir apps/mobile typecheck
pnpm --filter @posterlink/mobile build:android:production
pnpm --filter @posterlink/mobile submit:android
```

`apps/mobile/private/google-service-account.json`은 커밋하지 않는다.

## 공식 참고 링크

- Google Play 앱 생성:
  https://support.google.com/googleplay/android-developer/answer/9859152
- 심사 준비와 앱 콘텐츠 입력:
  https://support.google.com/googleplay/android-developer/answer/9859455
- Data safety:
  https://support.google.com/googleplay/android-developer/answer/10787469
- 계정 삭제 요구사항:
  https://support.google.com/googleplay/android-developer/answer/13327111
- 내부 테스트:
  https://support.google.com/googleplay/android-developer/answer/9845334
- Target API level 요구사항:
  https://developer.android.com/google/play/requirements/target-sdk
