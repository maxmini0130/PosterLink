# profiles.role enum 호환 보안 SQL 수정 기록

2026-10-23 / 시작 `fa27ff1`, `release/security-profile-role-20261023`, clean. 작업 전 fetch/status, AGENTS·CLAUDE·README·기존 보안 SQL/테스트·최신 준비 점검을 읽었다.

## 수정

- 운영 미적용 `20261023010000_protect_profile_role_writes.sql`의 text/varchar 전용 기본값 검사를 실제 타입 OID·enum 라벨·상수 기본값 검사로 보완했다. public.user_role과 기존 text/varchar만 지원하고 잘못된 타입/기본값/라벨은 계속 중단한다. 기본값 함수는 실행하지 않는다.
- guard를 AFTER INSERT/모든 UPDATE로 바꿔 다른 BEFORE 트리거가 role 아닌 칼럼 수정 중 NEW.role을 바꾸는 우회도 막는다. 일반 요청자의 DEFINER 직접 쓰기와 간접 BEFORE 트리거 변경은 42501/문장 롤백을 확인했다.
- 기존 RLS·칼럼 타입·enum 라벨·기본값·회원 행·관리자 역할은 변경하지 않는다. 기존 non-role·service_role 유효 권한을 보존하는 ACL 로직 유지. 웹/관리자 API는 변경하지 않음.
- preflight에 실제 타입/enum·전체 유효 칼럼 쓰기 권한·역할 멤버십·관련 DEFINER 소유자/실행 권한·Auth 트리거 메타데이터 추가. 회원 행·함수 본문은 출력하지 않는다.
- postflight 읽기 전용 SQL 추가. RLS/칼럼 권한·AFTER ROW INSERT/UPDATE guard·INVOKER·직접 EXECUTE 회수·정책/타입/기본값 대조.
- `docs/profile_role_enum_patch.md`에 적용 전후 점검과 안전 복구/비상 보안 롤백 구분. 기존 릴리스 안내는 최신 SQL 수정본과 과거 Preview를 구분하도록 갱신.

## 검증

- Node20 root **162/162 통과**. 보안 검증 92개(릴리스 범위 2, 안전하지 않은 스키마/기본값 군 9, text/varchar/enum 각 27; 상위 테스트 포함).
- 3개 저장 타입 모두: 자기 role 승격/높은 role INSERT/타인 수정/위조 claims/DEFINER 직접·BEFORE 트리거 간접 승격 차단. 정상 기본 role 신규 프로필·admin/super_admin upsert·프로필/푸시/알림·service_role 권한 부여/해제·기존 포인트 RPC 유지.
- 기존 회원 역할·타입·기본값 불변, RLS/유효 ACL 재실행 일치, 실패 원자성, 사전/사후 SQL 실행, 비상 ACL 복원 시 역할 불변 검증.
- 추가/누락 enum 라벨, 다른 enum, 숫자 타입, admin 기본값·기본값 없음·함수 기본값은 적용 거부. 함수 기본값의 sequence 호출이 없음을 확인.
- `09852271` 대비 앱·lib·middleware·모바일·공유 패키지 diff 없음. SQL/테스트/문서 변경이므로 Next build/브라우저·새 Preview 배포는 반복하지 않았다. 이전 Preview는 수정 SQL의 운영 통합 검증 결과가 아니다.
- TypeScript 테스트 Prettier, 문서 UTF-8/링크/Prettier, diff check를 수행한다. SQL 문법/행위는 격리 PostgreSQL로 검증했다.

## 남은 운영 조건

연결된 Supabase 관리 탭은 여전히 sign-in URL이다. 실제 운영 RLS·트리거·ACL·DEFINER 정의와 실제 DB 백업/복원 상태는 미확인이다. 사용자도 이 정보가 없으면 검증 완료로 판단하지 말라고 명시했다. **로컬 enum 호환 수정·격리 검증 완료, 운영 검증/적용 보류**로 구분한다.

운영자의 관리자 5개 확인, 실제 카탈로그·백업 및 격리 Supabase Auth/PostgREST 검증, 수정 SQL 버전 승인 후 웹 우선→정상 저장/옛 클라이언트 전환→지정 SQL 별도 승인 적용→사후 확인 순서다. DB guard 유지 앱 복구를 우선하며, 보호 제거와 옛 ACL 복원은 별도 비상 승인 사항이다.

운영 DB/관리자 역할/회원 데이터 변경·운영 배포·Git push 없음. 운영 회원정보·토큰·키 출력/커밋 없음. 이미 운영 적용된 migration을 변경한 것이 아니며, 다른 환경에서 이미 기록된 버전이면 후속 migration 절차를 재검토해야 한다.
