# 관리자 역할 보호 최종 적용 대상과 실행 순서

2026-10-23. **웹·SQL 적용 대상과 순서를 확정한 문서이며 실행 승인이 아니다. 이번 작업에서 운영 DB 변경·운영 배포·Git push는 하지 않았다.**

## 1. 확정한 대상

| 구분                | 적용 대상                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 웹 릴리스 SHA       | `09852271a20ed334656dddbec5e697467038fd28`                                                                                                         |
| 검증된 웹 Preview   | `dpl_CUFTXUwZ9voGmSvnKBKsPos5Ahq9`, https://poster-link-3z19cdgbw-maxmini0130s-projects.vercel.app                                                 |
| DB SQL 기준 커밋    | `9510f96770c335b9b5261832f9ae6eac42063f6c`                                                                                                         |
| DB 적용 파일        | [20261023010000_protect_profile_role_writes.sql](../supabase/migrations/20261023010000_protect_profile_role_writes.sql)                            |
| SQL SHA-256         | `597fc708cab7bd656af6a42a55ee5d0f798c5f4901470af46b8b511281196c01` (해당 Git blob의 LF 내용 기준)                                                  |
| 기존 운영 복구 정보 | SHA `b3519d2fa5bec73be9f9f13d56c44c4bf1cba9f2`, `dpl_Ld6ySHTzzb6YQUAQUstTcd7LdfRT`, https://poster-link-exv14exns-maxmini0130s-projects.vercel.app |

이번에 웹 Preview/기존 운영 배포는 각각 위 SHA의 READY 상태임을 배포 메타데이터 GET으로 재확인했다. 웹 보안 코드와 enum SQL 커밋 사이 앱·lib·middleware·모바일·공유 패키지 diff는 없다. 문서/테스트 후속 커밋은 이 웹 SHA 또는 SQL 내용을 대체하지 않는다.

웹은 이메일 가입·공통 OAuth·네이버 callback·프로필 수정·온보딩의 role 전송 제거 5곳만 운영과 다르다. GA4·UTM·가입 통계·개인정보 페이지 개정 및 새 기능은 포함하지 않는다. 웹 배포는 DB migration을 자동 실행하지 않는다. **Preview에 포함된 옛 SQL 대신 위 SQL 커밋의 파일을 별도로 적용해야 한다.** 브랜치 HEAD나 원래 기능 브랜치를 임의 배포 대상으로 선택하지 않는다.

SQL 파일을 준비할 때 `git show 9510f96770c335b9b5261832f9ae6eac42063f6c:supabase/migrations/20261023010000_protect_profile_role_writes.sql`의 내용과 대조한다. PowerShell의 기본 출력 인코딩/줄바꿈에 의한 해시 차이를 피하고, UTF-8/LF 내용 기준으로 확인한다. DB 실행에 쌓인 migration 전체 push를 사용하지 않는다.

## 2. 운영자가 제공한 읽기 전용 검증 결과

다음은 2026-10-23 사용자가 운영 Supabase에서 확인해 제공한 사실이다. 에이전트가 운영 카탈로그를 직접 재조회한 결과로 바꾸어 기록하지 않는다.

| 항목                         | 제공된 결과           | 최종 SQL과의 관계                                        |
| ---------------------------- | --------------------- | -------------------------------------------------------- |
| profiles RLS                 | 활성                  | SQL 전제와 일치, 비활성화하지 않음                       |
| profiles_update              | auth.uid() = id       | 기존 정책 유지                                           |
| Users can update own profile | auth.uid() = id       | 기존 정책 유지, 중복 정책 정리 안 함                     |
| anon role UPDATE             | true                  | 테이블/칼럼 쓰기 회수 후 false여야 함                    |
| authenticated role UPDATE    | true                  | non-role 칼럼만 기존 유효 권한 복원, role은 false여야 함 |
| 역할 변경 방지 트리거        | 없음                  | 새 guard 설치 대상                                       |
| role 타입                    | public.user_role enum | 보완한 타입/기본값 검사와 일치                           |

자기 행 정책은 수정 가능한 역할 값을 제한하지 않는다. 같은 조건의 UPDATE 정책이 둘 있어도 이 문제는 해결되지 않는다. 유효한 일반 회원 세션의 자기 role 승격이 가능한 조합이며 격리 PostgreSQL에서 재현했다. **anon UPDATE 권한 true만으로 비로그인 사용자가 행을 바꿀 수 있다고 단정하지 않는다.** auth.uid()가 없는 요청의 실제 행 접근은 RLS에 의해 별도로 제한된다.

위 요약에는 role INSERT 권한, 정확한 기본값/enum 라벨, 모든 정책의 명령/역할/WITH CHECK, 전체 상속 ACL, 기존 기타 트리거·DEFINER·역할 전환 경로가 모두 들어 있지는 않다. 적용 직전 preflight 결과로 이 차이를 보완한다. 예상 밖 정의를 발견하면 확정 SQL을 즉석 완화해 실행하지 않고 중단한다. 실제 DB 백업/PITR와 관리자 5개 정당성도 별도 확인 대상으로 유지한다.

## 3. 컬럼 권한과 트리거의 이중 보호

최종 SQL은 PUBLIC/anon/authenticated의 profiles INSERT/UPDATE 테이블 권한과 칼럼 권한을 회수한다. 테이블 권한은 칼럼 REVOKE만으로 무효화되지 않으므로 함께 처리한다. authenticated에는 기존에 유효했던 **role 제외 칼럼만** 복원하고, service_role의 기존 유효 칼럼 권한은 보존한다. 이후 모든 일반 역할의 role INSERT/UPDATE 유효 권한이 false인지 검사한다. 상속 권한 때문에 true가 남으면 transaction 전체가 실패한다.

AFTER INSERT OR UPDATE guard는 실제 SET ROLE 기준으로 일반 요청의 관리자 role INSERT와 기존 role 변경을 42501로 거부한다. 다른 BEFORE 트리거가 nickname 수정 중 NEW.role을 바꾸는 경우도 최종 행에서 거부한다. SECURITY INVOKER와 고정 search_path를 사용하고, editable JWT metadata 및 DEFINER 안의 current_user로 관리 권한을 인정하지 않는다. PUBLIC/anon/authenticated 직접 EXECUTE도 회수한다.

따라서 우발적으로 클라이언트 칼럼 쓰기가 재부여되더라도 guard가 역할 변경을 막는 격리 검증을 통과했다. 다만 재부여 자체를 정상으로 간주하지 않는다. 이후 권한/스키마 변경 때도 postflight를 실행하여 role 쓰기 권한 false를 유지해야 한다. GRANT ALL이나 테이블 전체 UPDATE/INSERT 재부여를 복구 방법으로 쓰지 않는다. DB owner·service_role의 악용 또는 guard를 끄는 위험한 DEFINER까지 자동 보호한다고 주장하지 않는다.

## 4. 호환성 확인

공유된 두 자기 행 정책과 anon/authenticated 쓰기 권한·guard 부재·enum을 합성 DB에 구성해 기존 enum 검증을 다시 실행했다. 보호 전 본인 admin/super_admin 승격 성공, 보호 후 직접/간접 역할 변경 차단, 타인 행 수정 차단, 정상 프로필/관리자 upsert를 확인했다. 기존 정책 정의·칼럼 타입/기본값·관리자 역할 값은 그대로 보존된다.

기존 최고 관리자 역할 API는 getUser 및 DB super_admin 확인 후 서버 service_role로 변경하므로 유지된다. 자기 역할 변경 금지·허용 역할 검증도 변경하지 않는다. 일반 admin이 역할 부여 API를 쓸 수 있게 확장하지 않는다. 감사 INSERT는 기존처럼 별도 확인이 필요하다.

검증된 기능: 역할 없는 신규 프로필 생성, 일반 nickname/지역/연령/성별/온보딩·푸시/알림 수정, admin/super_admin 역할 보존 upsert, service_role의 부여/해제, 관리자 포인트 RPC, 재실행 시 유효 ACL/정책 동일성 및 실패 시 원자적 복구. root **162/162** 통과. 기존 웹 Preview는 로컬 브라우저 7/7·원격 3통과/5skip 기록이 있다. 실제 운영 OAuth·프로필 저장·수정 SQL의 실제 PostgREST 통합 성공을 이번에 검증한 것은 아니다.

## 5. 승인 후 최종 실행 순서

| 순서 | 수행할 작업                                                                                                                                                                                                                      | 중단 기준                                                                                                             |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 0    | [preflight](../scripts/security/profile-role-preflight.sql), [ACL backup](../scripts/security/profile-role-acl-backup.sql)을 읽기 전용 실행. 실제 DB 백업·복구 권한/절차, 관리자 확인 결과, SQL 해시 및 현재 운영 배포 기준 보존 | 기본값·enum 라벨·서비스 권한·상속/DEFINER/기존 트리거 불일치, 백업·복구 불명확 시 중단                                |
| 1    | 별도 운영 웹 승인 후 위 웹 SHA의 검증된 Preview를 운영에 반영. 환경변수·OAuth 설정·DB 변경 없음                                                                                                                                  | 배포 실패면 DB 적용 전 중단, 기존 운영 배포로 복구 가능하나 보안 문제는 아직 남음                                     |
| 2    | 승인된 계정/행위로 역할 없는 프로필·가입/OAuth 보완·온보딩 저장 확인. 옛 탭/앱 전환. 정상 role 없는 웹 배포를 새 안전 복구 지점으로 보존                                                                                         | role 포함 payload·저장 실패·관리자 역할 초기화 발견 시 DB 적용 전 중단                                                |
| 3    | 별도 운영 DB 승인 후 확정 SQL 한 파일 전체를 transaction으로 실행. 승인된 lock/statement timeout 적용, 실행 이력 보존                                                                                                            | timeout/오류 시 ROLLBACK 후 실제 상태 확인. 부분 실행/검사 삭제/권한 확대 재시도 금지                                 |
| 4    | [postflight](../scripts/security/profile-role-postflight.sql)를 읽기 전용 실행하고 아래 기준 대조                                                                                                                                | 결과 행 누락, client role 권한 true, guard 비활성/불일치, 기존 정책 또는 non-role/service 권한 손상 시 종료 승인 금지 |
| 5    | 정상 프로필 및 관리자 기능 검수, 42501/403/5xx 로그 확인. 완료/미검증을 구분하여 보고                                                                                                                                            | 장애는 아래 안전 복구 우선. 미검증을 성공으로 표기하지 않음                                                           |

## 6. 적용 후 판정과 정상/차단 검수

postflight는 회원 행을 읽지 않고 카탈로그만 조회한다. 다음을 모두 확인한다.

- RLS=true. anon/authenticated의 role INSERT/UPDATE 차단 4항목=true.
- guard 결과 **정확히 1행**, tgenabled=O, after_row_insert_and_all_updates=true, security_definer=false, search_path=pg_catalog, 두 직접 EXECUTE 차단=true. 함수 본문도 승인 SQL 정의와 대조한다.
- service_role의 필요한 INSERT/UPDATE와 role UPDATE가 유지됨. non-role 권한·타입/기본값·기존 정책이 사전 결과와 같음. 서비스 권한이 원래 부족했다면 자동 확대하지 않고 중단.
- 별도 승인된 프로필 수정에서 role을 보내지 않고 정상 저장되는지 확인. 관리자 프로필 수정 후 역할 유지, 관리자 페이지/API 접근, 승인된 역할 부여/해제와 감사 기록 확인. 마지막 최고 관리자 제거·자기 역할 변경은 허용하지 않음.

실제 role 승격 공격·타인 수정·변조 세션·실패 INSERT 검수는 **격리 Supabase 테스트 계정**으로 수행한다. 일반 회원 직접 REST/SDK role 변경은 42501/403, 타인 행 수정은 차단/0행이어야 한다. 운영 실회원으로 승격을 시도하지 않는다. 운영 차단 확인은 postflight와 API의 익명 401/일반 회원 403을 우선하며, 정상 저장 등 운영 쓰기 검수도 승인된 계정/범위에서만 수행한다. 실계정 OAuth 또는 실제 저장을 수행하지 못하면 미검증으로 남긴다.

## 7. 실패 시 안전한 복구

DB 적용 전 웹 장애는 기존 운영 배포로 복구하고 DB 단계는 실행하지 않는다. 이 상태를 보안 패치 완료로 보고하지 않는다.

DB 적용 transaction이 실패하면 ROLLBACK하고 이전 ACL/트리거 상태를 확인한다. 성공한 DB 보호 적용 후에는 guard·role 칼럼 차단·RLS를 유지하면서 단계 2에서 보존한 role 없는 정상 웹으로 복구한다. non-role 권한 누락은 사전 ACL에 근거해 필요한 칼럼만 별도 승인된 최소 보정으로 복원한다.

옛 `b3519d2` 앱은 role을 보내는 경로가 있으므로 DB 보호 후 무조건 복구 대상으로 사용하지 않는다. guard 제거와 옛 ACL 복원은 취약점을 다시 여는 비상 보안 롤백이므로 별도 책임자 승인·접근 통제 계획이 필요하다. 자동 롤백하지 않으며 GRANT ALL·RLS 비활성화·회원 역할 임의 정정으로 우회하지 않는다. Vercel 배포 롤백은 DB/환경 설정을 복원하지 않는다.

## 8. 최종 승인 범위

확정한 웹 SHA와 DB SQL은 호환되며 수정 없이 적용 대상으로 지정한다. 실행 승인은 **웹 반영과 지정 SQL 적용을 각각 명시**해야 한다. 실행 시간·담당자, 실제 백업/복구 및 관리자 확인, 구버전 대응과 검수 계정/허용 쓰기 범위·안전 복구 지점도 확정해야 한다. 이 문서 자체로 실행하지 않는다.
