# 운영 DB 보호 SQL 최종 검토 결과

현재 상태: 아래 검토 후 별도 명시적 승인을 받아 2026-10-23 운영 SQL 적용을 완료했다. [실제 적용 결과와 미검증 항목](../WORK_LOG_20261023_profile_role_production_applied.md)을 우선 확인한다. 아래 승인 전 검토 내용은 당시 기록으로 보존한다.

2026-10-23. 운영 SQL 미실행, 계정·역할·세션 변경 없음. 웹은 09852271 운영 배포 상태다. 이 문서는 실행 승인 요청에 앞선 검토 결과이며 승인 자체가 아니다.

## 최종 적용 파일과 내용

적용할 SQL 전체 원문은 [20261023010000_protect_profile_role_writes.sql](../supabase/migrations/20261023010000_protect_profile_role_writes.sql)이다. 기준 9510f96770c335b9b5261832f9ae6eac42063f6c와 내용이 동일하며 수정할 필요가 없었다. Git blob UTF-8/LF SHA-256:

```text
597fc708cab7bd656af6a42a55ee5d0f798c5f4901470af46b8b511281196c01
```

전체 파일을 BEGIN부터 COMMIT까지 하나의 트랜잭션으로 적용한다. 일부 구문만 실행하거나 전체 migrations push로 다른 변경을 함께 적용하지 않는다. 운영 실행 전 보호된 ACL/정책/트리거 사전 기록, 백업 시각, SQL 해시를 다시 대조하고 잠금·statement timeout 및 작업 창을 확정한다. 본문은 다음을 수행한다.

1. 기존 RLS 활성, public.user_role enum의 정확한 라벨 및 상수 user 기본값 검증. 불일치 시 트랜잭션 실패. 타입·기본값·회원 행은 변경하지 않는다.
2. SECURITY INVOKER, search_path=pg_catalog인 guard_profile_role_writes 함수와 AFTER INSERT OR UPDATE 행 트리거 생성. 실제 SET ROLE 기준으로 일반 요청의 privileged INSERT/역할 변경을 42501로 거부한다. JWT JSON의 role 및 DEFINER 내부 current_user를 신뢰하지 않는다.
3. PUBLIC/anon/authenticated의 테이블 및 칼럼 INSERT/UPDATE 회수. authenticated에는 기존에 유효했던 role 이외 칼럼 권한만 복원한다. anon의 프로필 INSERT/UPDATE도 제거하므로 비로그인 프로필 쓰기는 허용되지 않는다. 기존 클라이언트는 세션 확보 후 저장하는 구조다.
4. 기존 service_role INSERT/UPDATE 유효 권한 보존. anon/authenticated의 role INSERT/UPDATE가 상속으로라도 남으면 전체 실패한다. SELECT/DELETE 권한과 RLS 정책은 변경하지 않는다.
5. PostgREST schema reload 통지 후 COMMIT. 계정 강등·차단·삭제 또는 댓글·공고·감사 이력 변경은 포함하지 않는다.

## 실제 정책 6개와 호환성

로그인된 운영 SQL Editor에서 SELECT로 아래 6개가 현재 그대로임을 재확인했다. enum 라벨은 user/operator/admin/super_admin이며 guard는 아직 0개다. 앞서 보존한 실제 테이블 ACL·칼럼 ACL·updated_at 트리거 정의와 이번 조회를 근거로 격리 fixture를 보완했다.

| 정책                                     | 현재 의미                                             | SQL 적용 후                                         |
| ---------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| Public profiles are viewable by everyone | SELECT true                                           | 그대로 유지                                         |
| profiles_select                          | SELECT true                                           | 그대로 유지                                         |
| profiles_insert                          | INSERT WITH CHECK auth.uid()=id                       | 그대로 유지, role 미전송/default user 사용          |
| Users can update own profile             | UPDATE USING auth.uid()=id                            | 그대로 유지, non-role 정상 저장                     |
| profiles_update                          | UPDATE USING 및 WITH CHECK auth.uid()=id              | 그대로 유지                                         |
| admin_can_update_profiles                | admin/super_admin이면 UPDATE USING 및 WITH CHECK 허용 | non-role 수정 유지, role은 칼럼 권한과 guard로 차단 |

RLS의 허용은 칼럼 권한을 다시 부여하지 않는다. admin_can_update_profiles가 있어도 authenticated 연결에서 role을 수정할 수 없다. 일반 회원은 타인 프로필 UPDATE 결과가 0행이며, 관리자는 해당 정책에 따라 타인의 non-role 필드를 수정할 수 있다. 따라서 “모든 사용자가 타인 프로필을 수정할 수 없다”고 설명하지 않는다. 기존 공개 SELECT 정책도 유지되며 이 패치가 프로필 공개 범위를 축소하는 것은 아니다.

격리 enum DB에 위 6개 정책과 기존 timestamp 트리거를 함께 구성했다. 최초 적용 및 재실행 뒤 정책 정의 보존, 관리자 non-role 타인 프로필 수정, 기존 timestamp 트리거 유지, 회원 본인 저장·타인 수정 차단, admin/super_admin 본인 upsert의 역할 보존을 확인했다. admin/super_admin도 클라이언트 role 직접 UPDATE는 42501로 차단됐다.

## 관리자 역할 부여·해제와 DEFINER

관리자 화면은 [역할 API](../apps/web/app/api/admin/users/[id]/route.ts)를 호출한다. 서버는 getUser로 실제 사용자를 확인하고 DB에서 caller의 super_admin 역할을 재검증한다. 자기 역할 변경 금지와 허용 역할 검증 뒤 서버 service_role로 UPDATE하고 감사 기록을 남긴다. SQL은 이 서버 경로를 유지한다. 일반 admin의 직접 role UPDATE를 기존 정상 권한 관리 경로로 간주하지 않는다. 감사 기록 저장과 역할 UPDATE가 하나의 원자적 트랜잭션이 아닌 기존 한계는 이번 범위에서 변경하지 않았다.

운영에서 profiles를 참조하는 public SECURITY DEFINER 함수 6개의 이름·ACL·본문 해시를 읽었다. authenticated 실행 권한이 있는 increment_points와 get_recommended_posters_v2, 서비스 전용 나머지 함수의 ACL은 변경하지 않는다. 운영 increment_points 본문은 admin/super_admin 확인 후 points/updated_at만 수정하며 로컬 검증 대상 구현과 일치한다. 격리에서 정상 관리자 포인트 RPC는 성공하고 일반 회원 호출은 거부됐다.

임의 DEFINER 함수의 role 변경과 BEFORE 트리거가 non-role 수정 중 NEW.role을 바꾸는 공격은 AFTER guard에서 42501로 거부·롤백됐다. 정상 포인트/프로필 변경처럼 role이 그대로인 쓰기는 허용된다. 이 보호가 DB 소유자나 실제 service_role의 임의 작업까지 차단하는 것은 아니다.

## 검증과 적용 직전 판정

- 보안 테스트 93/93, 기존 전체 자동 테스트 163/163 통과. 실제 운영 정책 6개·기존 timestamp 트리거 조합을 포함한다.
- 일반 회원 role INSERT/UPDATE 거부, admin/super_admin 직접 role UPDATE 거부, 서버 service_role 역할 부여·해제, 기존 관리자 값 보존, SQL 재실행·실패 원자성·간접 변경 차단 확인.
- 운영 계정·데이터 쓰기는 없었고 테스트 최고 관리자 생성도 없었다. 기존 비공개 Auth ID별 대조에서 실제 관리자 3개와 테스트 2개의 역할 보존을 확인한 상태다. 실행 직전 같은 비공개 명부로 재대조해야 한다.
- PGlite PostgreSQL 및 합성 HTTP 검증이다. 실제 Supabase PostgREST에 패치를 적용한 결과 또는 실제 OAuth/운영 프로필 저장 성공을 의미하지 않는다. 운영자 본인 정상 로그인·저장·관리자 기능 확인은 미검증으로 남아 있다.

**카탈로그 구조 및 격리 검증 기준으로 최종 SQL은 운영 정책 6개와 호환된다.** 기존 정책을 변경하거나 SQL을 완화할 필요가 없다. 다만 운영 실계정 저장/관리자 기능 미검증과 구형 브라우저·모바일의 role 포함 payload 거부 위험은 승인 시 구분해야 한다. 이미 열린 이전 웹은 새로고침이 필요할 수 있다. 운영 실행은 별도 명시적 승인 전까지 대기한다.

## 적용 후 읽기 전용 검증 SQL

전체 검증 원문: [profile-role-postflight.sql](../scripts/security/profile-role-postflight.sql). 사전 대조 원문은 [preflight](../scripts/security/profile-role-preflight.sql)와 [ACL snapshot](../scripts/security/profile-role-acl-backup.sql)이다. postflight는 BEGIN READ ONLY와 COMMIT 사이에서 카탈로그만 조회하며 회원정보를 반환하지 않는다.

기대 결과:

- rls_enabled=true, member/anon role INSERT/UPDATE 차단 4개=true, service_role_update=true.
- guard 정확히 1개, tgenabled=O, after_row_insert_and_all_updates=true, security_definer=false, search_path=pg_catalog, anon/member direct execute 차단=true. 함수 본문 해시·정의도 승인 SQL과 대조한다.
- 기존 role enum/default, non-role/service 권한, 6개 정책의 roles/cmd/qual/with_check가 사전 기록과 같음. 기존 update_profiles_updated_at 트리거는 preflight의 전체 트리거 조회를 다시 실행해 보존 여부 대조.
- 실제 관리자 3개 및 테스트 계정 2개 역할은 비공개 ID별 읽기 전용 대조로 확인. 계정별 개인정보 결과는 Git/공개 로그에 기록하지 않음.

운영 회원 역할을 바꾸는 공격 테스트는 하지 않는다. 승인된 정상 프로필 저장 및 관리자 화면 확인, 비인증/비관리자 API 접근 거부, 새 42501/403/5xx 로그를 함께 확인한다. 검증 실패는 성공으로 처리하지 않는다.

## 보호를 유지하는 복구

SQL 적용 중 오류는 전체 ROLLBACK 상태를 확인하고 중단한다. 이전 취약 상태로 남은 것을 패치 성공으로 보고하지 않는다. COMMIT 뒤 정상 기능 오류가 있으면 role-free 웹 09852271과 guard·role 제한·RLS를 유지한다. 사전 ACL에서 누락된 non-role 권한만 확인 후 별도 승인으로 최소 복구한다. GRANT ALL, 테이블 전체 INSERT/UPDATE 재부여, guard 삭제, RLS 비활성화는 하지 않는다.

DB 전체 복원은 최후의 별도 승인 절차다. 백업 이후 정상 데이터 손실과 과거 취약 ACL/테스트 관리자 복귀 가능성을 고려하고 접근 제한 아래 보호를 재적용·검증한 후 공개한다. 현재 보존된 일일 백업은 존재하지만 실제 복원 성공/PITR은 검증 완료 상태가 아니다. 구형 b3519d2로의 무조건 웹 롤백도 하지 않는다.
