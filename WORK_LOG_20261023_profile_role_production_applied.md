# 운영 profiles 역할 보호 마이그레이션 적용 완료

## 승인과 실행 대상

사용자가 검증된 관리자 권한 보호 SQL의 운영 적용을 명시적으로 승인했다. 승인은 이 SQL에만 한정되며 테스트 계정 역할 회수·차단·삭제·기타 DB 변경은 승인하지 않았다. 해당 제한을 지켰다. 작업 시작 git fetch origin 및 git status --short --branch 확인, 기준 HEAD 479cf42, clean 상태.

- 프로젝트: posterlink-dev / main / PRODUCTION, project ref zxndgzsfrgwahwsdbjdj. 로그인된 Supabase SQL Editor 화면에서 확인.
- 운영 웹: 09852271, 이번 작업에서 재배포하지 않음.
- 적용 파일: [20261023010000_protect_profile_role_writes.sql](supabase/migrations/20261023010000_protect_profile_role_writes.sql).
- 승인 기준: 9510f96. 작업 파일과 Git blob의 UTF-8/LF 내용 및 SHA-256 597fc708cab7bd656af6a42a55ee5d0f798c5f4901470af46b8b511281196c01 일치.
- 실행 직전 SELECT 시각: 2026-10-23 14:44:51.464248 KST. 적용 직후 종합 SELECT 시각: 14:46:17.230288 KST. 적용은 이 사이에 완료됐으며 정확한 COMMIT 시각을 별도로 추측하지 않는다.

## 사전 자료와 원자적 적용

기존 정책·테이블/칼럼 ACL·트리거 정의와 실제 관리자/테스트 계정 ID 대조 자료는 저장소 밖 사용자 전용 ACL의 비공개 로컬 디렉터리에 보존돼 있음을 확인했다. 계정 이메일·UUID·토큰은 Git과 공개 로그에 기록하지 않았다. 백업 존재와 안전 복구 한계는 기존 [최종 검토](docs/profile_role_db_approval.md)를 따른다.

실행 직전 RLS 활성, 정책 6개, 기존 broad table ACL, 별도 칼럼 ACL 없음, anon/authenticated role UPDATE=true, updated_at 트리거만 존재하는 상태와 함수 해시 f8e60420464fcae4aadb3052672979ef 일치를 확인했다.

실행할 SQL 문자열 6,378자의 SHA-256도 승인 해시와 대조한 후 SQL Editor에 입력했다. 전체 BEGIN~COMMIT을 한 번에 Run했다. UI의 destructive operations 확인은 승인된 DROP TRIGGER IF EXISTS를 포함한 동일 SQL에 대한 것이므로 같은 승인 범위로 확인했다. 결과는 **Success. No rows returned**. 오류·부분 실행·재시도·보호 해제 롤백은 없었다. SQL Editor 실행이며 추가 migration history INSERT 같은 별도 SQL은 하지 않았다.

## 즉시 읽기 전용 검증

[postflight](scripts/security/profile-role-postflight.sql) 전체를 실행하고 종합 SELECT로 결과를 다시 확인했다.

| 항목                                                | 결과                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| RLS                                                 | true 유지                                                                       |
| authenticated role INSERT/UPDATE                    | 둘 다 false                                                                     |
| anon role INSERT/UPDATE                             | 둘 다 false                                                                     |
| service_role role UPDATE 및 전체 칼럼 INSERT/UPDATE | true 유지                                                                       |
| authenticated의 모든 non-role 칼럼 INSERT/UPDATE    | true 유지                                                                       |
| 정책                                                | 6개 이름·roles·cmd·qual·with_check 사전 정의와 동일                             |
| guard_profile_role_writes                           | 1개, tgenabled=O, tgtype=21(AFTER ROW INSERT/전체 UPDATE)                       |
| guard 함수                                          | SECURITY INVOKER, search_path=pg_catalog, anon/authenticated 직접 EXECUTE=false |
| 기존 updated_at 트리거                              | 활성 및 정의/함수 해시 유지                                                     |
| role 타입/기본값                                    | 기존 user_role / 'user'::user_role 유지                                         |

설치된 guard prosrc MD5는 70df87095055b5afb58ba20a645f0d71이다. 최초 로컬 LF 본문 해시 대조는 불일치했다. SQL Editor가 CRLF로 저장한 본문 해시는 위 값과 정확히 일치함을 확인했다. 본문 의미/내용 변경이 아니라 줄바꿈 차이이며, 승인 파일은 변경하지 않았다.

기존 비공개 명부와 읽기 전용 Data API 조회 결과를 ID별 대조해 실제 관리자 3개와 테스트 관리자 2개 역할이 모두 그대로임을 확인했다. 기존 운영 관리자 기능을 위한 service_role 경로와 관리자 non-role 수정 권한도 카탈로그상 보존됐다. 실제 회원의 role 변경을 공격 테스트로 시도하지 않았다.

## 기능 및 오류 확인

적용 후 홈·로그인·회원가입·입찰 목록·공개 상세·robots.txt·sitemap.xml·sitemap-index.xml·공고 하위 sitemap은 HTTP 200. 비인증 mypage/edit 및 admin은 로그인으로 이동. 공개 상세 canonical·Open Graph·JSON-LD 유지. 적용 이후 운영 배포 로그 표본 14건에서 200 12건/307 2건, 5xx 및 error/fatal 없음.

정상 프로필 저장의 권한·guard 조건은 검증됐지만 **실제 운영 저장은 미검증**이다. 이번 승인은 보호 SQL만이므로 회원 행·관심 항목·updated_at을 쓰는 프로필 저장을 임의 실행하지 않았다. 실제 OAuth/이메일 로그인, 로그인 후 관리자 화면/역할 API, 찜·댓글 저장도 미검증이다. 격리 보안 93/93·전체 163/163 및 role 미포함 브라우저 검사는 이전 검증 기록이며 이번 운영 실제 저장 성공으로 바꾸어 보고하지 않는다.

## 잔여 사항과 복구

운영자가 본인 계정에서 정상 로그인·프로필 저장·관리자 기능을 확인하는 후속 검증이 남는다. 이전 웹/모바일의 role 포함 저장 payload는 42501로 거부될 수 있어 최신 클라이언트 사용이 필요하다. 테스트 관리자 2개는 여전히 super_admin이며 정리는 별도 승인 대상이다. 역할 상승 보호가 적용됐다고 기존 관리자 정당성이나 실계정 동작까지 자동 검증된 것은 아니다.

보호 해제는 자동 실행하지 않았다. 정상 기능 문제가 생기면 guard·role 제한·RLS와 role-free 웹을 유지하고 사전 ACL 근거로 필요한 non-role 권한만 별도 승인 후 최소 복구한다. 전체 DB 복원은 데이터 손실 및 과거 취약 상태 복귀 위험 때문에 별도 승인 절차다.

마이그레이션 원문·앱 코드·GA4/UTM/신규 가입 통계·회원/공고/댓글 데이터·계정 역할/세션은 변경하지 않았다. 이번 변경은 승인된 함수·트리거·ACL 및 PostgREST reload 통지뿐이다. 작업 기록 문서의 UTF-8/링크·Prettier·git diff --check를 확인했다. Git push 없음.
