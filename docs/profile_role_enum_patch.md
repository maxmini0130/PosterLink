# profiles.role enum 호환 보안 SQL 수정

2026-10-23. 작업 시작 `fa27ff1`, 웹 보안 코드 기준 `09852271`. **로컬 SQL·격리 검증 완료와 운영 적용 검증은 별개다. 운영 RLS·ACL·트리거/함수 정의가 없으므로 운영 검증 완료 또는 배포 가능으로 판정하지 않는다.**

## 수정 내용

[운영 미적용 migration](../supabase/migrations/20261023010000_protect_profile_role_writes.sql)의 기존 기본값 검사는 text/varchar 표현식 세 가지만 허용했다. 운영 Data API에서 확인한 `public.user_role` enum의 상수 기본값 `'user'::user_role`은 거부됐다.

수정 SQL은 칼럼을 text로 변환하지 않는다. 실제 atttypid·typtype·pg_enum을 확인하여 다음만 허용한다.

- public.user_role enum이며 라벨 집합이 user/operator/admin/super_admin이고 기본값이 정확한 user 상수인 경우. enum 순서는 변경하거나 강제하지 않는다.
- 기존 text/varchar 스키마에서 기존 user 상수 기본값을 사용하는 경우.

세션 search_path를 transaction 내에서 고정한다. 표현식을 실제 실행해서 기본값을 검사하지 않는다. 다른 enum 타입·domain·숫자 타입·추가/누락 라벨·admin 기본값·기본값 없음·함수 기본값은 중단한다. 함수가 user를 반환해도 실행해서 통과시키지 않는다. 기존 enum·칼럼·기본값·회원 행·관리자 역할 값은 변경하지 않는다.

또한 guard를 **AFTER INSERT OR UPDATE**로 연결해 최종 행을 검사한다. 종전 UPDATE OF role은 nickname 수정 중 BEFORE 트리거가 NEW.role을 바꾸는 경우 실행되지 않을 수 있었다. 현재 검사는 이 간접 변경도 42501로 전체 문장을 롤백한다. 정상 nickname/푸시/알림/관리자 포인트 갱신은 role이 같으므로 허용한다. 기존 다른 트리거 자체를 삭제하거나 수정하지 않는다.

컬럼 ACL과 RLS를 함께 유지한다. 일반 회원은 role 칼럼 INSERT/UPDATE 권한이 없고, 직접/간접 변경은 guard로 추가 차단한다. 다른 회원의 행 접근은 기존 자기 행 RLS에 의존한다. SQL이 잘못된 운영 행 정책을 자동 교정하지 않는다. 기존 non-role 유효 권한만 복원하며 다른 민감 칼럼의 권한 전체를 재설계한 것은 아니다. 운영에서 anon 또는 custom DB 역할이 PUBLIC 쓰기에 의존하면 별도 검토해야 한다.

## 관리자·SECURITY DEFINER

기존 admin/super_admin 행을 포함한 전체 합성 프로필의 role·칼럼 타입·기본값이 적용 전후 그대로임을 확인했다. 두 관리자 역할의 role 없는 upsert, service_role의 역할 부여/해제, 초기 관리자 설정과 기존 increment_points RPC를 격리 검증했다. 웹/관리자 API 코드는 이번에 수정하지 않았다.

guard는 SECURITY INVOKER와 고정 search_path를 유지한다. 신뢰 여부는 실제 SET ROLE 및 제한된 관리 session_user로 판단하며 JWT JSON의 role이나 DEFINER 안의 current_user에 의존하지 않는다. 일반 회원이 호출한 DEFINER 함수의 직접 role UPDATE와, DEFINER BEFORE 트리거의 간접 role 변경을 검사했다. 직접 EXECUTE는 anon/authenticated/PUBLIC에서 회수한다. 트리거 실행은 격리 PostgreSQL에서 정상 동작했다.

이 검증은 모든 운영 DEFINER가 안전하다는 뜻이 아니다. 운영에서 실행 가능한 wrapper·동적 SQL·다른 노출 스키마·view/rule·Auth bootstrap·SET ROLE 경로·트리거 비활성화/DDL 권한과 함수 소유자를 별도 검토해야 한다. 서비스 키나 DB owner가 노출된 경우를 해결하는 패치가 아니다. 관리자 역할 변경은 기존 최고 관리자 API와 담당자 승인을 사용하며, 감사 INSERT의 비원자성도 기존대로 별도 확인한다.

## 적용 전 점검 — 운영에서는 아직 실행하지 않음

1. [preflight SQL](../scripts/security/profile-role-preflight.sql)을 관리 연결에서 읽기 전용 실행한다. 실제 RLS/타입/기본값/enum 라벨, 모든 관련 행 정책, 칼럼 유효 권한, 역할 멤버십, 프로필 트리거, public의 관련 DEFINER 및 Auth 트리거 메타데이터를 확보한다. 회원 행/함수 본문/키는 로그에 출력하지 않는다.
2. public 본문 profiles 검색은 완전한 의존성 감사가 아니다. 실제 노출 RPC·함수·간접 경로와 권한은 담당자가 보호된 환경에서 추가 검토한다. 현재 제공 SQL의 SET ROLE이 일반 요청자에게 실제로 관리자 역할로 전환 가능하지 않은지도 확인한다.
3. [ACL 백업 SQL](../scripts/security/profile-role-acl-backup.sql) 출력과 정책·기존 guard 함수/트리거 정의·해시를 보호된 위치에 저장한다. 같은 이름의 다른 보호 함수/트리거가 있으면 덮어쓰지 않고 검토한다. 의존 GRANT 때문에 REVOKE가 실패하면 CASCADE로 우회하지 않는다.
4. 실제 DB 백업/PITR·최근 성공 시각·복원 권한/절차를 확인한다. 이번에는 확인하지 못했다. ACL snapshot은 전체 DB 백업이 아니며 Vercel 배포 복구도 DB 복구가 아니다.
5. 운영자가 관리자 5개 정당성을 별도 확인한다. 패치는 부적절한 기존 역할을 소급 정정하지 않는다. 이름·이메일·UUID를 Git에 넣지 않는다.
6. 운영과 같은 권한의 격리 Supabase Auth/PostgREST에서 실제 SDK 요청을 검증한다. PGlite/로컬 HTTP 대역을 실제 Supabase 통합 검증으로 표시하지 않는다.

## 승인 후 실행 순서와 적용 후 점검

1. 웹 보안 코드의 정확한 SHA/Preview를 승인하고 role 없는 5개 저장 경로를 먼저 배포한다. GA4·UTM·가입 통계는 포함하지 않는다. 정상 role 없는 배포 ID/SHA를 안전 복구 지점으로 보존한다.
2. 정상 프로필·가입·OAuth 보완·온보딩·알림/푸시 경로를 승인된 계정/행위로 확인한다. 구버전 탭/앱의 role:user payload도 DB 보호 후 실패할 수 있어 새로고침/버전 전환을 준비한다. 옛 네이버 서버 콜백은 service_role로 role:user를 쓸 수 있으므로 웹을 먼저 교체해야 한다.
3. **별도 DB 승인** 후 수정한 SQL 한 파일만 transaction 전체로 적용한다. 과거에 이 버전이 이미 적용/기록된 환경이면 파일 덮어쓰기로 처리하지 말고 별도 후속 migration을 검토한다. 현재 수정은 운영 미적용 파일에 한정했다. 무관한 대기 migration 전체 push 금지.
4. 오류/lock timeout이면 ROLLBACK하고 실제 카탈로그 상태를 확인한다. 성공 전제 재시도나 부분 적용은 하지 않는다.
5. [postflight SQL](../scripts/security/profile-role-postflight.sql)을 읽기 전용 실행한다. RLS=true, member/anon role INSERT·UPDATE 차단=true, guard의 AFTER ROW INSERT/모든 UPDATE 확인=true, INVOKER 및 고정 search_path, 직접 EXECUTE 차단을 확인한다. **guard 결과 행이 없으면 실패**다. service_role 권한·non-role 권한·기존 정책·타입/기본값·관련 함수 해시를 사전 결과와 대조한다. 허용돼야 하는 서비스 INSERT/UPDATE가 없다면 적용을 완료로 승인하지 않는다.
6. 실제 관리자/일반 회원 API·프로필 저장·관리자 역할 부여/해제·감사 기록을 승인된 검수 범위로 확인하고 42501/403/5xx 로그를 검토한다. 승인되지 않은 운영 테스트 가입·타인 역할 변경·데이터 쓰기를 하지 않는다. 쓰기 검수가 불가능하면 미검증으로 보고한다.

## 안전한 복구

- migration 실패: transaction 전체 ROLLBACK. 기존 ACL/guard/데이터를 확인한 뒤 원인 해결까지 중단한다.
- 앱 장애: DB 보호를 유지하고 role 없는 정상 앱으로 복구한다. role을 보내는 기존 운영 앱으로의 무조건 롤백은 가입/저장 거부나 서버의 역할 초기화를 일으킬 수 있다.
- non-role 권한 누락: 보호 guard·role 칼럼 차단·RLS를 유지하면서 사전 snapshot의 필요한 non-role 권한만 별도 승인된 최소 보정으로 복원한다. 예전 전체 GRANT나 RLS 비활성화로 우회하지 않는다.
- guard 제거/옛 ACL 복원은 권한 상승을 다시 열 수 있는 **비상 보안 롤백**이다. 별도 책임자 승인 및 접근 통제 계획이 필요하다. 자동 롤백 실행기를 추가하지 않았으며 GRANT ALL로 복원하지 않는다. enum·회원 역할을 변환/재작성하는 복구도 하지 않는다.

## 검증 결과와 남은 조건

Node20 루트 **162/162 통과**. 이 중 보안 **92개**는 기존 릴리스 범위 2개, schema 실패군 9개(상위 포함), text/varchar/enum 각 27개(상위 포함)다. 세 타입 모두 직접 역할 변경·타인 수정·위조 claims·DEFINER·BEFORE 트리거 간접 변경 차단, 정상 가입/관리자 upsert·푸시/알림·서비스 역할 변경·포인트 RPC·재실행·원자적 실패·비상 ACL 복원을 검증했다. 사전/사후 점검 SQL도 격리 DB에서 실행했다.

웹·모바일·SEO 런타임은 `09852271`과 같으며 새 Preview/운영 배포는 하지 않았다. SQL/테스트/문서 범위 변경이므로 Next build·브라우저를 반복하지 않았다. 기존 Preview는 이전 SQL을 담고 있어 수정 SQL을 운영 검증한 배포가 아니다.

**운영 RLS·ACL·트리거/DEFINER 실체, 백업/복원, 관리자 명부 및 실제 Auth/PostgREST 검증이 남아 있어 운영 적용 보류를 유지한다.**
