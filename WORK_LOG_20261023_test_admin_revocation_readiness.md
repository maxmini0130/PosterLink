# 테스트 관리자 역할 회수 준비 읽기 전용 점검

시작 git fetch origin 및 git status --short --branch 확인. 기준 HEAD d546e1f, clean 상태. CLAUDE/README, 기존 정리 계획, 역할 API·middleware·관리자 페이지·E2E 설정과 설치된 Auth SDK를 검토했다.

이전 비공개 명부와 Auth ID·이메일을 대조해 대상 2개 일치, 실제 관리자 3개 및 대상 2개 역할 유지, 대상 활성 ban 없음 확인. 최근 성공 로그인 시각과 댓글/감사 참조 건수를 새 사용자 전용 ACL 비공개 보고서에 보존했다. ID·이메일·개별 로그인 정보는 Git에 넣지 않았다. 운영 읽기 SELECT로 댓글 CASCADE/감사 NO ACTION FK, 대상 세션 합계 39행/refresh 141행, guard 활성 1개 확인. 토큰 값 조회/사용 없음, 쿼리 저장 없이 폐기.

[실행 방법과 예상 영향](docs/test_admin_role_revocation_readiness.md)에 기존 최고 관리자 서버 API로 두 ID만 user로 변경하는 절차와 실제 관리자/참조 보존·접근 거부 검증을 정리했다. 공식 admin.signOut은 유효 대상 JWT를 요구한다. 로컬 캐시의 access exp가 지난 상태이고 두 대상 모두의 유효 JWT 경로는 확보되지 않아 전역 세션 폐기 즉시 실행 준비 완료로 판정하지 않았다. ID 기반 미확인 메서드나 Auth 내부 DELETE를 임의 제시/실행하지 않았다.

로컬 E2E 자격·캐시가 대상 하나를 참조함을 메모리 비교했고 실행 중 E2E는 없다. 테스트 생성/승격 가드 및 별도 프로젝트 분리는 여전히 후속 작업이다. 설정/캐시 변경 없음.

이번 변경은 문서뿐이며 운영 권한·계정·세션·데이터 변경·로그인·토큰 갱신·배포·Git push 없음. UTF-8/링크·Prettier·git diff --check 확인. 앱/SQL 변경이 없어 build/테스트는 재실행하지 않았다. 실제 권한 회수/세션 폐기 후 동작은 미검증이다.
