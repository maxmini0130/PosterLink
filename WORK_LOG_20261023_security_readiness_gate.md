# 보안 패치 운영 적용 준비 완료 점검

2026-10-23 / 보안 코드 `09852271a20ed334656dddbec5e697467038fd28`, 운영 기준 `b3519d2fa5bec73be9f9f13d56c44c4bf1cba9f2`. 이번 작업은 읽기 전용 확인과 적용 순서·승인 항목 정리다. 운영 DB 수정·배포·Git push는 수행하지 않았다.

## 현재 판정

**운영 적용 보류.** 운영 Data API 메타데이터에서 role enum 구조가 확인되어, text/varchar 기본값만 허용하는 현재 보안 SQL의 사전 검사와 불일치를 발견했다. 같은 enum 구조의 격리 PostgreSQL에서도 현재 SQL이 중단됨을 재현했다. 기존 로컬 통과 결과는 운영 스키마 호환성을 보장하지 않는다.

## 읽기 전용 확인 결과

| 항목                        | 결과                                                                                                                    | 한계                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Git                         | fetch 후 clean, release/security-profile-role-20261023, HEAD c16c39d                                                    | 이 문서만 후속 갱신                                                                         |
| 운영 배포                   | 기존 production READY, SHA b3519d2fa5bec73be9f9f13d56c44c4bf1cba9f2                                                     | 배포 API 메타데이터 GET                                                                     |
| Preview                     | dpl_CUFTXUwZ9voGmSvnKBKsPos5Ahq9 READY, 코드 SHA 09852271a20ed334656dddbec5e697467038fd28                               | 배포 API 메타데이터 GET                                                                     |
| role 구조                   | 운영 Data API OpenAPI GET 200: type string, format public.user_role, default user, enum user/operator/admin/super_admin | PostgREST가 제공하는 스키마 메타데이터. 실제 pg_catalog 정의·기본값 표현식은 별도 확인 필요 |
| 프로필 칼럼                 | id, nickname, primary_region_id, age_band, gender, onboarding_completed, expo_push_token 존재                           | OpenAPI 구조만 확인, 회원 행은 조회하지 않음                                                |
| RLS·role ACL·트리거·DEFINER | 관리 화면 로그인 대기                                                                                                   | Data API의 schema 메타데이터에는 정책/권한/함수 본문이 포함되지 않음                        |
| 백업·복원                   | 관리 화면 로그인 대기                                                                                                   | 실제 백업 성공 시각·PITR·복원 권한/가능 여부 미확인                                         |
| 관리자 5개 정당성           | 운영자가 별도로 확인 예정                                                                                               | 이메일·명부는 이 문서/Git/도구 출력에 보존하지 않음                                         |

Supabase 관리 연결 도구 및 로컬 DB 연결/관리 토큰은 확보되지 않았다. 대시보드는 로그인 화면이었으며 사용자가 직접 로그인 후 알려주겠다고 답했다. 로그인 완료 후 읽기 전용 사전 SQL·실제 백업 화면 확인을 이어간다. SQL 실행/복원 버튼으로 운영 변경을 수행하지 않는다.

## 새로 확인된 SQL 호환성 차단 조건

현재 migration `supabase/migrations/20261023010000_protect_profile_role_writes.sql`은 pg_get_expr 기본값을 다음 세 표현 중 하나로 제한한다.

- `'user'::text`
- `'user'::character varying`
- `'user'`

운영 OpenAPI가 제공하는 public.user_role enum과 user 기본값을 격리 PGlite에 구성하면 pg_get_expr은 `'user'::user_role`을 반환한다. 현재 migration은 `Expected the existing constant user role default` 검사에서 실패하고 transaction을 되돌린다. 이는 **격리 재현**이며 운영에서 migration을 실행해 오류를 낸 것이 아니다.

운영 카탈로그에서 실제 칼럼 타입·기본값·enum 라벨·기존 guard 정의를 확인한 뒤, 해당 구조를 정확히 지원하도록 SQL을 최소 보정하고 text/enum 양쪽 회귀 및 실제 격리 Supabase Auth/PostgREST 검증이 필요하다. 기본값 검사를 삭제하거나 아무 기본값이나 허용하는 방식으로 완화하지 않는다. 이번 단계에서는 SQL/앱 코드를 수정하지 않았다. 수정 후에는 새 SQL 내용·해시·검증 기록을 승인해야 하며 기존 SQL 그대로의 적용 승인을 요청하지 않는다.

## 미승인 기능 제외 재확인

- 운영 기준과 보안 코드의 runtime diff는 signup, 공통 OAuth, 네이버 callback, mypage/edit, onboarding/complete 5곳만 존재한다.
- HEAD와 Preview 코드 사이 앱·lib·middleware·migration diff 없음.
- 보안 테스트 **26/26 재통과**. 미승인 GA4·UTM·가입 통계 코드 부재 및 기존 운영 파일 동일성 검사 포함.
- 단, 기존 격리 SQL 회귀는 저장소의 text role 정의를 사용한다. 새로 발견한 운영 enum 구조는 별도 격리 실험에서 현재 SQL의 예상 거부를 확인했다. 이 두 결과를 혼동하지 않는다.

## 최종 실행 순서 및 사후 검증 계획

1. 운영자 관리자 5개 확인 결과 확보. RLS 전체 정책·role 직접/상속 권한·함수/트리거·노출 경로를 읽기 전용 확인. 최근 실제 DB 백업·복원 권한/절차 확인, 관련 ACL/정책/함수/트리거 정의를 보호된 위치에 보존.
2. enum 호환 SQL 최소 보정 및 text/enum 양쪽 재실행·역할 차단·정상 저장·서비스 역할 부여/해제 검증. 운영과 같은 격리 Supabase Auth/PostgREST 추가 검증. 승인할 SQL 버전 확정.
3. 별도 승인 후 보안 웹 코드만 운영 배포. 일반 upsert에 role이 없고 이메일 가입·OAuth 보완·프로필·온보딩 저장이 정상인지 승인된 검수 범위에서 확인. 정상인 role 없는 웹 배포 ID/SHA를 안전 복구 지점으로 보존.
4. 옛 탭/앱의 role 포함 요청 실패 가능성에 대비해 새로고침/버전 전환. 별도 DB 승인 후 지정 SQL 하나만 transaction 전체로 적용. 무관한 migration 전체 push 금지.
5. 카탈로그로 anon/authenticated role INSERT/UPDATE false, guard 활성, 기존 RLS 유지, 서비스 관리 권한 유지 확인. 정상 프로필/알림·모바일 푸시·관리자 페이지/API 및 역할 부여/해제·감사 기록 검수. 회원/관리자 세션 검사는 운영자가 승인한 계정/행위만 사용. 승인되지 않은 테스트 가입·회원 역할 변경·찜/댓글 쓰기는 하지 않음.
6. API의 익명 401·일반 회원 403, 관리자 경로 성공과 42501/403/5xx 로그를 구분해 확인. 실제 로그인·저장을 못 했으면 미검증으로 보고. 기존 가입 통계 등 다른 기능은 이 릴리스에서 배포하지 않음.

웹 배포 실패 시 DB 적용 전에는 기존 배포로 복구할 수 있으나 취약점이 해결된 것은 아니다. DB 적용 후에는 guard·role 차단을 유지하고 role 없는 정상 앱으로 복구한다. 필요한 non-role 칼럼 권한만 별도 최소 보정한다. guard 제거·기존 ACL 복원은 취약점을 재노출할 수 있어 별도 비상 승인 사항이며 자동 롤백하지 않는다. DB/환경 설정은 Vercel 배포 롤백으로 복원되지 않는다.

## 운영 적용에 필요한 최종 승인 항목

1. 운영자의 관리자 5개 정당성 확인 완료.
2. 운영 카탈로그·실제 백업/복구 상태 및 **보정된 enum 호환 SQL의 검증 완료** 확인. 현재는 승인 가능한 준비 완료 상태가 아님.
3. 웹 배포 대상 코드 SHA/Preview와 별도 DB 적용 SQL 버전·범위 승인.
4. 적용 시간·실행자·잠금/실행 제한·구버전 대응·사후 검수 계정/허용 쓰기 범위·안전 복구 담당자 승인.

회원 식별정보·키·토큰을 기록하지 않았다. 관련 상세 절차는 [보안 릴리스 안내](docs/profile_role_security_release.md)를 따른다.
