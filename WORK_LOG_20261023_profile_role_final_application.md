# 관리자 역할 보호 최종 적용 준비 확정

2026-10-23 / 시작 `9510f96`, release/security-profile-role-20261023, clean. git fetch origin/status, AGENTS·CLAUDE·README·enum 수정 기록·최종 SQL/점검 SQL을 읽고 검토했다.

## 확정 사항

- 웹 대상 `09852271a20ed334656dddbec5e697467038fd28`: 검증된 Preview `dpl_CUFTXUwZ9voGmSvnKBKsPos5Ahq9`의 코드. 운영과 다른 앱 파일은 역할 전송 제거 5곳뿐이며 GA4/UTM/가입 통계는 제외.
- DB SQL 커밋 `9510f96770c335b9b5261832f9ae6eac42063f6c`, 파일 `supabase/migrations/20261023010000_protect_profile_role_writes.sql`. Git blob UTF-8/LF SHA-256 `597fc708cab7bd656af6a42a55ee5d0f798c5f4901470af46b8b511281196c01`. 이번에는 migration/점검 SQL을 변경하지 않았다.
- 웹 SHA와 현재 코드의 앱/lib/middleware/모바일/공유 패키지 diff 없음. 현재 migration과 postflight도 SQL 커밋 내용과 같다.
- 배포 메타데이터 GET: 기존 운영 `dpl_Ld6ySHTzzb6YQUAQUstTcd7LdfRT`는 b3519d2fa5bec73be9f9f13d56c44c4bf1cba9f2 production READY, Preview는 위 웹 SHA READY. promote/deploy 실행 없음.

## 운영 확인 결과 반영

사용자가 운영에서 읽기 전용 확인하여 제공: profiles RLS 활성, profiles_update 및 Users can update own profile의 auth.uid()=id, anon/authenticated의 role UPDATE true, 역할 보호 트리거 없음, role은 public.user_role enum.

이는 사용자 제공 운영 확인이며 에이전트 직접 재조회로 표기하지 않는다. 추가된 두 번째 자기 행 UPDATE 정책을 enum 격리 fixture에 반영하고 두 정책/기존 role 권한 true/guard 부재를 확인한 뒤 기존 전체 회귀를 재실행했다. 자기 행 정책 중복은 역할 값 제한을 제공하지 않는다. 일반 회원의 자기 승격 차단은 칼럼 grant 회수와 최종 행 guard의 조합으로 해결한다. anon 권한 true만으로 익명 행 수정 성공을 단정하지 않는다.

SQL은 두 기존 정책을 그대로 보존한다. 테이블/칼럼 INSERT·UPDATE 회수 후 non-role 기존 유효 칼럼만 복원하고, 일반 역할의 role 권한이 상속으로 남으면 전체 transaction을 실패시킨다. service_role 권한·기존 관리자 role 값은 유지하며 AFTER guard는 우발적인 role grant 재부여 상황에서도 변경을 차단한다.

## 검증

- Node20 root **162/162 통과**, 보안 92개 포함. enum에서 운영자가 제공한 중복 자기 행 정책 조합을 추가 반영. 보호 전 승격 재현, 보호 후 role 직접/간접 쓰기 차단, 정상 프로필·관리자 upsert/역할 API의 SQL 경로·포인트 RPC·권한 보존·재실행/원자성 검증.
- 앱/SQL 변경 없음. 이번 변경은 fixture와 적용 문서이므로 Next build·웹 Preview·브라우저를 반복하지 않았다. 기존 로컬 브라우저 7/7 및 원격 3통과/5skip은 과거 웹 검증으로 구분한다.
- 문서·테스트 Prettier, UTF-8/로컬 링크, git diff --check 확인. 실제 운영 Auth/PostgREST·회원 저장·역할 변경을 실행한 것으로 보고하지 않는다.

## 최종 실행·복구

[최종 적용 문서](docs/profile_role_final_application.md)에 웹 SHA와 SQL 커밋/해시, preflight/백업→웹 반영→정상 저장·옛 클라이언트 전환→지정 DB SQL→postflight/기능 검수 순서를 확정했다. postflight는 일반 역할 INSERT/UPDATE 차단, guard 정확히 1행·AFTER/INVOKER/활성·직접 EXECUTE 차단, 기존 정책/서비스/non-role 권한·타입/기본값 보존을 기준으로 판정한다.

DB 전 웹 장애는 이전 배포 복구 후 중단한다. DB 후에는 guard/role 차단을 유지하고 role 없는 정상 앱을 복구하며, non-role 누락만 최소 보정한다. 보호 제거/옛 ACL 복원은 별도 비상 승인으로 구분한다.

실행 직전 아직 필요한 확인: 완전한 정책·기본값/enum 라벨·INSERT/상속/서비스 권한·기타 트리거/DEFINER 경로, 실제 DB 백업/복구, 운영자의 관리자 5개 확인, 적용 시간·실행자 및 검수 계정/허용 쓰기 범위. 확정 SQL이나 검사를 즉석 완화하지 않는다.

운영 DB 변경·운영 배포·계정/관리자 역할 변경·Git push 없음. 개인정보·키·토큰 출력/커밋 없음. **적용 대상 및 순서 확정, 실행 승인·적용·사후 검증은 아직 수행하지 않음.**
