# 신규 가입 통계 보안 릴리스 병합 및 Preview 검증

2026-10-23. 운영 기준 09852271, 가입 통계 출처 74fe413, 회귀 테스트 출처 13f5bce.

## 변경 범위

- release/auth-signup-stats-20261023에서 기존 보안 릴리스를 보존하고 가입 통계 API·집계 함수·관리자 패널·관리자 페이지 4개 실행 파일만 추출했다. 원본과 내용 일치를 자동 검사한다.
- Auth ID와 created_at 기준 일간·월요일 시작 주간·최근 31일 집계. KST 표시, 서버 UTC 가입 시각 사용. super_admin만 현재 DB 역할 확인 후 서버 Auth 목록 조회 가능하다. admin 및 일반 회원은 403이다.
- Auth 목록은 페이지당 1,000건, 최대 50,000건·20초 제한. 응답은 집계만 반환하며 실패를 0명으로 바꾸지 않는다. 가입 삭제 시 과거 수치도 사라지는 잔존 계정 통계이며 실명 고유 인원·가입 완료 인증 통계가 아니다.
- GA4·UTM·새 동의 UI·신규 SQL·RLS·회원 데이터 변경은 없다. DB 보호 SQL은 재실행하지 않는다. 기존 프로필 role 전송 제거와 관리자 DB 역할 검사는 그대로다.

## 로컬 검증

- pnpm test: 172/172 통과. enum 격리 보안 테스트와 신규 가입 단위 테스트 포함.
- web lint: 오류·경고 없음. 가입 통계 전용 Playwright 5/5 통과: 비로그인401, 일반 회원/admin403, super_admin 집계·다중 페이지·실패 폐쇄, PC/모바일 패널, 가입 실패·재시도 중복 방지.
- 첫 build와 Next dev가 같은 .next를 동시에 사용해 ENOENT가 발생했다. 개발 서버 종료 후 순차 재빌드·타입 검사를 수행한다. 코드 수정으로 숨기지 않는다.
- Node 24.15.0 / pnpm 10.33.0 / 설치된 Next 14.2.0·React 18.2.0 환경. Node20 및 Next16 검증으로 표기하지 않는다.

## 운영 읽기 전용 사전 확인

- 운영 alias는 dpl_G4T3qmMMJH8gBwW5FfpSVwE49S5v / 09852271, READY 유지. Preview만 생성하고 운영 promote·Git push는 하지 않는다.
- 비공개 기준 Auth ID와 대조: 실제 관리자 3명 역할 유지, 테스트 2명 user 유지, 기존 연결 데이터 보존. 조회만 수행했고 계정 식별정보는 저장소에 기록하지 않았다.
- 운영 Vercel 환경변수 메타데이터 및 로컬 루트/web .env.local에 GA 측정/활성화 키 없음. 기존 환경변수는 변경하지 않았다.

## GA4 측정 ID 재확인

| 원본 | 정확한 값 |
|---|---|
| 사용자 요청 | G-17ZX91CJCS |
| 로그인된 Google Analytics PosterLink Web 스트림 16182912963 DOM | G-1Z7X91CJCS |

두 값 모두 대문자이며 공백이 없는 12자다. 4·5번째 문자의 7/Z 순서가 다르므로 대소문자·공백 정규화로 같아지지 않는다. 해당 스트림 URL은 https://www.posterlink.kr, 향상된 측정 스위치는 false로 재확인했다. 어느 ID도 임의 설정하지 않았다.

추적된 참조 위치는 WORK_LOG_20261023_security_analytics_wrapup.md와 docs/security_to_analytics_release_readiness.md다. 보류된 f2ddcbf의 .env.example 및 apps/web/lib/analytics.ts는 NEXT_PUBLIC_GA_MEASUREMENT_ID를 참조하며 실제 ID 하드코딩은 없다. 현재 운영·이번 릴리스에는 GA 실행 코드 자체가 없다. 이후 GA 도입은 소유자의 스트림/ID 확정과 개인정보 정책 승인 후 별도 진행해야 한다.

## 후속 검증 기록

코드 커밋을 고정한 뒤 Preview 배포 SHA·원격 검증·최종 판정을 아래에 추가한다. 운영 실계정 로그인/저장 성공은 모의 테스트와 구분한다.
