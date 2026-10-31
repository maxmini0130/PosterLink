# 운영 테스트 관리자 계정 정리 조사

2026-10-23 / 시작 `9644fad`, release/security-profile-role-20261023, clean. 작업 전 git fetch/status, AGENTS·CLAUDE·README·최신 적용 준비 기록을 읽었다. 사용자 지정 두 테스트 계정만 정리 계획 대상으로 삼으며 실제 운영 관리자 3개는 변경하지 않는다.

## 읽기 전용 조사

- 운영 웹 공개 JS와 Supabase 설정 주소 일치 확인. 로그인된 관리 대시보드도 같은 프로젝트 ref임을 확인했다. 프로젝트 이름에 dev가 있어도 실제 운영 연결이다.
- Auth 관리자 GET으로 대상 존재·현재 super_admin·생성/마지막 성공 로그인·차단 상태를 확인했다. last_sign_in_at 상세는 KST로 현재 Windows 사용자 전용 로컬 HTML/JSON에만 저장했다. Auth 로그인·토큰 갱신을 실행하지 않았다.
- public OpenAPI의 FK·사용자 의미 칼럼 27개를 대상으로 Data API HEAD exact count 수행. 실패를 0으로 처리하지 않았으며 모든 대상 칼럼에서 응답을 확인했다. API 메타데이터/건수 GET/HEAD 합계 65회. 회원 행/이메일/UUID/토큰을 도구 출력 또는 Git에 저장하지 않았다.
- 실제 DB에서 SELECT만 실행해 FK 정의, auth.users/profiles 트리거 메타데이터, Storage 소유권·잔존 세션·최근 Auth audit action 집계, 댓글의 후속 참조를 확인했다. 기존 사용자 SQL 초안은 수정하지 않고 새 임시 초안에서 실행했으며 종료 시 직접 만든 초안만 폐기했다. Save/Restore/마이그레이션 실행 없음.
- 연결된 댓글·감사 이력·방문/알림/관심 데이터 존재. admin_actions.actor_user_id의 실제 NO ACTION 참조는 계정 삭제 차단 요인. 소유 공고·공개 공고 작성/승인 및 Storage 객체는 발견하지 못했다. 댓글 후속 공개 공고/답글/신고 연결은 현재 발견하지 못했지만 삭제 가능 데이터로 자동 분류하지 않았다.
- 최근 30일 auth.audit_log_entries actor_id 일치 집계는 결과 없음. 로그 수집/보존 미확인이므로 사용 없음으로 해석하지 않는다. 잔존 세션도 현재 사용/유효 여부와 구분했다.

## 자동화 구성 조사

- 로컬 root/web E2E 관리자 환경변수와 저장된 admin storageState가 지정된 E2E 대상과 연결됨을 메모리에서 확인. 비밀번호 유효성/세션 유효성을 실제 로그인으로 시험하지 않았다.
- globalSetup은 환경 자격으로 로그인만 하고 계정 생성/역할 부여는 하지 않는다. 프로젝트 허용 목록이 없고 자격 미설정 시 기존 세션 파일이 남는 경로를 확인했다. 기존 환경변수/캐시를 변경하지 않았다.
- tracked source 및 과거 작업 문서 참조 조사. 현재 명시적 대상 관리자 자동 생성 경로는 발견하지 못했으며 과거/외부/개인 자동화 전체 부재를 주장하지 않는다. 현재 설정 비밀번호 문자열과 tracked text 일치는 발견하지 못했으며 값은 출력하지 않았다.
- GitHub workflow 목록·최근 실행 메타데이터, repo/Preview/Production secret 이름 확인. 등록된 CI는 Playwright를 실행하지 않고 조사한 secret 목록에도 E2E 자격 없음. Vercel 환경변수 키/대상에도 E2E 자격 없음. secret 값은 출력하지 않았다.
- 보안 전용 PGlite/합성 HTTP 검사와 기존 일반 실계정 E2E를 구분했다. 일반 E2E는 실행하지 않았다.

## 산출물과 결론

[정리 계획](docs/test_admin_retirement_plan.md)에 테스트 의존 분리→역할 상승 패치와 순서 조율→두 계정 user로 역할 회수→로그인/세션 차단→감사·댓글 보존과 검수 순서를 제시했다. 계정 삭제는 별도 보존/참조 검토 후 승인 대상으로 남긴다. 실제 관리자를 건드리거나 감사 이력/참조를 지워 삭제를 강제하지 않는다.

별도 Supabase 테스트 프로젝트/환경 묶음과 URL/ref 허용 목록, 캐시 갱신, 서버 bootstrap의 운영 거부를 제안했다. 구현/프로젝트 생성은 하지 않았다. ban/세션/JWT/삭제·soft delete 한계는 Supabase 공식 문서를 확인하고 링크했다.

## 검증·미실행

- 문서 UTF-8·Prettier·링크·git diff --check. 계정 상세 파일은 저장소 밖 현재 Windows SID에만 Allow된 보호 ACL 폴더로 만들고 검증했다. 파일에는 UUID나 access/refresh 토큰을 넣지 않았다. Git 제외 data/의 임시 조사 helper도 커밋하지 않는다.
- 코드 변경 없는 분석·문서 작업이므로 빌드·자동 테스트를 반복하지 않았다. 계정별 최근 로그인 시각과 건수는 비공개 결과를 제공하며 공개 문서에는 남기지 않는다.
- 역할 변경·ban·세션 폐기·테스트 자격/캐시 변경·계정/데이터 삭제·운영 DB 쓰기·운영 배포·Git push 없음.
