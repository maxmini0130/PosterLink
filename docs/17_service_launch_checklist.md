# 17. 서비스 론칭 체크리스트

> 기준일: 2026-05-02
> 목적: PosterLink 사전 오픈 전 반드시 확인할 항목을 기능, 데이터, 운영, 배포 관점에서 정리한다.

## 1. 현재 완료 상태

- [x] 웹 앱 빌드 통과 (`pnpm.cmd --filter web build`)
- [x] 워크스페이스 빌드 통과 (`pnpm.cmd -r build`)
- [x] 웹 린트 통과 (`pnpm.cmd --filter web lint`)
- [x] 웹 타입 체크 통과 (`pnpm.cmd --filter web exec tsc --noEmit --pretty false`)
- [x] E2E 테스트 통과 (`pnpm.cmd --filter web test:e2e`, 42 passed, 2 skipped)
- [x] 운영/관리 보호 라우트 비로그인 접근 제어 E2E 추가
- [x] 비밀번호 재설정 화면 구현
- [x] 마이페이지 알림 설정 토글 구현
- [x] 관리자 포스터 반려 사유 모달 구현
- [x] `posters.rejection_reason` DB 컬럼 반영
- [x] 만료 Expo push token 자동 정리 구현
- [x] OCR 모델 `gpt-4o` 적용
- [x] 모바일 카메라 API `CameraView` 사용 확인
- [x] 검색 로그에 실제 검색 결과 수 기록
- [x] 공식 링크 이동 행동 로그 구현
- [x] 관리자 작업 로그 기록 구현
- [x] 관리자 대시보드 검색/링크/작업 로그 지표 UI 구현
- [x] 댓글 중복 신고 방지 구현

## 2. 오픈 전 필수 확인

### 인증

- [ ] 이메일 회원가입 후 온보딩 진입 확인
- [ ] 이메일 로그인 후 홈/마이페이지 접근 확인
- [ ] 비밀번호 재설정 메일 수신 확인
- [ ] 재설정 링크 클릭 후 새 비밀번호 저장 확인
- [ ] Google OAuth 웹 로그인 확인
- [ ] Kakao OAuth 웹 로그인 확인
- [ ] Naver OAuth 웹 로그인 확인
- [ ] 모바일 WebView OAuth 세션 유지 확인

### 사용자 플로우

- [ ] 홈 추천 피드 노출 확인
- [ ] 탐색 페이지 검색/필터/정렬 확인
- [ ] 포스터 상세 페이지 공식 링크 이동 확인
- [ ] 찜 추가/해제 및 찜 목록 반영 확인
- [ ] 댓글 작성/삭제 확인
- [ ] 댓글 신고 접수 확인
- [ ] 알림 센터 읽음 처리 확인

### 운영자 플로우

- [ ] 운영자 계정으로 `/operator` 접근 확인
- [ ] 포스터 이미지 업로드 확인
- [ ] 이미지 크롭/회전/보정 후 미리보기 확인
- [ ] OCR 분석 결과 자동 입력 확인
- [ ] 카테고리/지역/마감일/공식 링크 저장 확인
- [ ] 검수 요청 상태(`review`) 전환 확인
- [ ] 기존 포스터 수정 후 저장 확인

### 관리자 플로우

- [ ] 관리자 계정으로 `/admin` 접근 확인
- [ ] 포스터 검수 목록 상태별 필터 확인
- [ ] 승인 시 `published` 전환 및 공개 상세 노출 확인
- [ ] 반려 시 `rejection_reason` 저장 확인
- [ ] 신고 목록 조회 확인
- [ ] 댓글 숨김 처리 확인
- [ ] 신고 기각 처리 확인
- [ ] 시스템 공지 발송 및 사용자 알림 노출 확인
- [ ] 카테고리/지역 기준정보 추가, 수정, 삭제 확인
- [ ] 사용자 역할 변경 확인

## 3. 데이터 및 보안

- [ ] Supabase Auth provider redirect URL 운영 도메인 반영
- [x] `poster_link_click_logs` DB 마이그레이션 운영 반영
- [x] `admin_actions` 타입 확장 DB 마이그레이션 운영 반영
- [x] 댓글 중복 신고 방지 DB 마이그레이션 운영 반영
- [ ] Supabase RLS 정책 운영 DB에서 재확인
- [ ] `poster-originals` Storage 업로드/공개 URL 정책 확인
- [ ] 서비스 role key가 클라이언트 번들에 포함되지 않는지 확인
- [ ] `.env.local` 값과 Vercel 환경변수 동기화 확인
- [ ] Edge Function 환경변수 확인 (`OPENAI_API_KEY`, `TAVILY_API_KEY`, Supabase keys)
- [ ] 개인정보처리방침/이용약관 링크와 내용 최종 확인
- [ ] 계정 삭제 API가 사용자 데이터 범위를 의도대로 처리하는지 확인

## 4. 알림 및 자동화

- [ ] Expo push token 저장 확인
- [ ] 사용자 `is_notified=false`일 때 신규 매칭 알림 제외 확인
- [ ] 승인 시 `notify-new-match` 호출 및 푸시 발송 확인
- [ ] `DeviceNotRegistered` 응답 후 push token null 처리 확인
- [ ] `check-deadlines` Edge Function 수동 호출 확인
- [ ] pg_cron 마감 처리 스케줄 운영 DB 적용 확인

## 5. 관측 및 장애 대응

- [ ] Sentry 프로젝트/조직 설정 확인
- [ ] 클라이언트 오류가 Sentry에 수집되는지 확인
- [ ] Source map 업로드 실패가 빌드를 막지 않는지 확인
- [ ] Supabase Edge Function 로그 조회 절차 확인
- [ ] 장애 시 임시 공지 발송 절차 확인
- [ ] 관리자/운영자 비상 계정 확보

## 6. 배포

- [ ] Vercel production build 성공 확인
- [ ] 운영 도메인 `posterlink.kr` / `posterlink.co.kr` 연결 확인
- [ ] `robots.txt`와 `sitemap.xml` 접근 확인
- [ ] Open Graph 이미지/메타데이터 확인
- [ ] 모바일 앱 EAS 빌드 프로필 확인
- [ ] Android 실기기 설치 및 카메라 권한 확인
- [ ] iOS 실기기 설치 및 카메라 권한 확인

## 7. 오픈 후 24시간 모니터링

- [ ] 회원가입/로그인 실패율 확인
- [ ] 포스터 상세 404/권한 오류 확인
- [ ] OCR 실패 로그 확인
- [ ] 푸시 발송 실패 로그 확인
- [ ] 신고/댓글 악용 여부 확인
- [ ] 관리자 반려 사유가 운영자에게 필요한 방식으로 노출되는지 확인
- [ ] 사용자 검색어 중 결과 없음 케이스 수집

## 8. 다음 개선 후보

- [x] 관리자 작업 로그(`admin_actions`) 실제 기록 구현
- [x] 검색어 행동 로그 구현
- [x] 공식 링크 이동 행동 로그 구현
- [ ] 동의어 사전 초기 데이터 보강
- [x] 포스터 반려 사유 운영자 화면 노출 개선
- [x] 댓글 신고 중복 접수 방지 UX
- [ ] E2E에 관리자/운영자 핵심 플로우 추가
- [ ] 모바일 OAuth 실기기 자동화 테스트 기준 정리
