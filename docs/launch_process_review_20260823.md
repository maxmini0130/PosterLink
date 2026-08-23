# 출시/운영 프로세스 종합 점검

기준일: 2026-08-23

PosterLink의 웹 운영, DB/보안, 관리자 검수, 알림, 모바일 앱 출시 준비를 현재 저장소와 운영 점검 문서 기준으로 다시 정리한 결과다.

## 결론

출시 전 자동 검증과 핵심 웹 운영 기반은 대부분 준비되어 있다. 현재 병목은 코드보다 수동 검수와 외부 콘솔 승인이다.

- 웹 빌드, lint, 타입 체크, 핵심 E2E는 통과 이력이 있다.
- Supabase 운영 DB lint, RLS, Storage, Edge Function 배포 상태는 확인되어 있다.
- `www.posterlink.kr` 운영 도메인은 Vercel production에 연결되어 있다.
- Edge Function 로그 조회와 장애 공지 발송 runbook은 문서화되어 있다.
- Android production AAB는 API 36 기준으로 준비되어 있다.
- Google Play Console은 개발자 신원 확인 심사 중이라 앱 생성/제출을 진행할 수 없다.

## 바로 고친 코드 리스크

이번 점검 중 운영 검수에서 터질 수 있는 작은 불일치를 발견해 수정했다.

- 관리자 신고 관리 화면의 댓글 복구 작업 로그가 `admin_actions.action_type = restore`를 쓰고 있었다.
  - DB 제약에는 `restore`가 없고 `update`가 허용되어 있어, 댓글 복구 시 작업 로그 삽입이 실패할 수 있었다.
  - 복구 기록은 `action_type = update`, `metadata_json.status = normal`로 남기도록 수정했다.
- 슈퍼관리자 사용자 권한 변경 API(`/api/admin/users/[id]`)가 실제 역할 변경은 수행하지만 `admin_actions` 로그를 남기지 않았다.
  - 이전 역할과 새 역할을 `metadata_json.previousRole`, `metadata_json.newRole`로 기록하도록 수정했다.

## 출시 전 필수 ToDo

### 1. 인증 수동 검수

실제 브라우저와 실계정 기준으로 확인한다.

- 이메일 회원가입 후 온보딩 진입
- 이메일 로그인 후 홈/마이페이지 접근
- 비밀번호 재설정 메일 수신과 새 비밀번호 저장
- Google OAuth 웹 로그인
- Kakao OAuth 웹 로그인
- Naver OAuth 웹 로그인
- 모바일 WebView OAuth 세션 유지

### 2. 사용자 핵심 플로우 수동 검수

- 홈 추천 피드 노출
- 탐색 페이지 검색/필터/정렬
- 포스터 상세 공식 링크 이동
- 찜 추가/해제와 찜 목록 반영
- 댓글 작성/삭제
- 댓글 신고 접수
- 알림 센터 읽음 처리

### 3. 운영자/관리자 수동 검수

운영 데이터 변경을 수반하므로 테스트 대상과 원복 범위를 먼저 정하고 진행한다.

- 운영자 포스터 이미지 업로드
- 이미지 크롭/회전/보정 후 미리보기
- OCR 분석 결과 자동 입력
- 카테고리/지역/마감일/공식 링크 저장
- 검수 요청 상태 전환
- 관리자 승인/반려와 공개 상세 노출
- 반려 사유가 운영자에게 의도대로 보이는지 확인
- 신고 댓글 숨김/기각
- 시스템 공지 발송과 사용자 알림 노출
- 슈퍼관리자 사용자 역할 변경과 작업 로그 기록
- 카테고리/지역 기준정보 추가, 수정, 삭제

### 4. 알림/자동화 검수

실제 push와 운영 알림 레코드가 생길 수 있으므로 별도 승인 후 진행한다.

- Expo push token 저장 확인
- 사용자 `is_notified=false`일 때 신규 매칭 알림 제외 확인
- 승인 시 `notify-new-match` 호출과 푸시 발송 확인
- `DeviceNotRegistered` 응답 후 push token null 처리 확인
- pg_cron 마감 처리 스케줄 운영 DB 적용 확인

### 5. 관측/장애 대응 검수

- 클라이언트 오류가 Sentry에 실제 수집되는지 확인
- 관리자/운영자 비상 계정 확보
- 장애 공지 발송은 runbook 기준으로 실제 발송 전 문구와 영향 범위를 확인
- Edge Function 장애는 `docs/edge_function_logs_runbook_20260823.md` 절차로 조회

### 6. 모바일/스토어 검수

Google Play Console 신원 확인이 끝난 뒤 이어서 진행한다.

- Play Console Data safety, 계정 삭제, 앱 액세스, 콘텐츠 등급, 대상 연령 답변 최종 입력
- Android 실기기 설치
- 로그인, OAuth, 카메라 권한, 갤러리 선택, 촬영/업로드
- push token 저장, 알림 수신, 알림 클릭 딥링크
- iOS 실기기 설치와 동일 플로우 확인

## 보류 또는 결정 필요

- `posterlink.co.kr` / `www.posterlink.co.kr` DNS 및 Vercel domain 연결
  - `posterlink.kr` 운영에는 직접 영향이 없으나 브랜드 도메인 확보용으로 남아 있다.
- `KAKAO_ADMIN_KEY` 등록 여부
  - Kakao 계정 unlink까지 탈퇴 UX를 완성하려면 필요하다.
  - 현재는 PosterLink 계정 삭제 자체는 계속 동작하므로 출시 블로커는 아니다.
- Vercel Preview `OPENAI_API_KEY`
  - Production은 등록 및 smoke test 완료.
  - Preview는 CLI가 preview branch 선택을 요구해 보류 중이다.
- Supabase Auth leaked password protection
  - 대시보드 설정 항목이다. 보안 강화로 권장하지만 코드 migration으로 처리하지 않는다.

## 구조적으로 부족한 부분

출시를 막는 수준은 아니지만 운영 품질을 높이려면 보강이 필요하다.

- 시스템 공지는 로그인 사용자 알림 센터에만 보인다.
  - 비로그인 사용자용 홈 배너, 점검 페이지, 모바일 push broadcast는 별도 기능이 필요하다.
- 관리자 운영 변경 작업 일부는 E2E보다 수동 검수에 의존한다.
  - 공지 발송, 신고 처리, 역할 변경, 기준정보 변경의 Playwright 커버리지를 보강하는 편이 좋다.
- 관리자 기준정보 관리(`/admin/settings`)와 슈퍼관리자 권한 관리(`/admin/users`)가 역할 변경 기능을 일부 중복 제공한다.
  - 실제 권한 변경은 슈퍼관리자 전용 API로 통일하는 편이 안전하다.
- 공개 검색/추천 RPC는 브라우저 직접 호출 구조가 일부 남아 있다.
  - 보안 advisor 경고를 완전히 줄이려면 API route 경유 또는 `SECURITY INVOKER` 전환 설계가 필요하다.
- `pg_net`, `vector` extension public schema 경고는 아직 남아 있다.
  - 의존 SQL 영향이 있어 별도 migration으로 다뤄야 한다.
- 모바일 실기기 검증은 아직 문서상 미완료다.
  - Android AAB는 준비됐지만 실제 기기 설치, 카메라/OAuth/push/deeplink 검증이 남아 있다.

## 권장 진행 순서

1. 관리자/운영자 비상 계정 확보
2. Sentry 클라이언트 오류 수집 smoke test
3. 웹 인증/OAuth 수동 검수
4. 사용자 핵심 플로우 수동 검수
5. 운영자 등록 -> 관리자 승인/반려 end-to-end 수동 검수
6. 신고 처리, 공지 발송, 역할 변경 등 운영 변경 작업을 테스트 대상 기준으로 검수
7. Android 실기기 설치와 카메라/OAuth/push/deeplink 검수
8. Google Play 개발자 신원 확인 완료 후 Play Console 앱 생성과 정책 입력
9. `posterlink.co.kr` DNS 연결 여부 결정
10. 보안 advisor 남은 항목을 별도 설계 작업으로 분리
