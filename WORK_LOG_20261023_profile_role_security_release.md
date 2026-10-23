# 관리자 역할 보안 전용 릴리스 준비

2026-10-23. 운영 기준 `b3519d2fa5bec73be9f9f13d56c44c4bf1cba9f2`, 보안 패치 출처 `0e964e8`, 적용 계획 출처 `c478c74`.

## 기준과 분리

- 작업 전 git fetch origin·상태 확인. 기존 기능 브랜치 clean, ahead24. 운영 SHA에서 `release/security-profile-role-20261023` 생성. 기존 기능 브랜치·커밋은 보존했다.
- Vercel inspect와 배포 메타데이터 읽기에서 운영 `dpl_Ld6ySHTzzb6YQUAQUstTcd7LdfRT`, production READY, SHA `b3519d2fa5bec73be9f9f13d56c44c4bf1cba9f2` 확인. 복구 URL `https://poster-link-exv14exns-maxmini0130s-projects.vercel.app`.
- 앱 diff는 signup, 공통 OAuth, 네이버 callback, 프로필 수정의 role:user 제거와 onboarding의 role 조회/재저장 제거 5곳뿐이다. GA4·UTM·동의 UI·개인정보 페이지 개정·가입 통계 구현은 포함하지 않는다.
- 보호 SQL과 읽기 전용 preflight/ACL backup은 원본 그대로 가져왔다. 보안 테스트·전용 합성 Auth/프로필 브라우저 검증·릴리스 범위 검사를 포함한다. PGlite 개발 의존성 하나와 lockfile 8줄만 추가, 기존 의존성 업그레이드 없음.
- 직접 관련 문서: `docs/profile_role_security_release.md`, README. 전체 포함 파일은 git diff --name-only b3519d2로 확인 가능하다.

## 로컬 검증

- Node20 루트 테스트 **96/96 통과**, 그중 보안 전용 **26/26**(격리 SQL 24개 + 릴리스 범위 2개). 서비스 역할의 admin/super_admin 부여 후 user로 해제 및 기존 관리자 역할 보존을 추가 확인했다.
- 보안 전용 Playwright **7/7 통과**: 익명 접근 차단, 데스크톱/모바일 로그인·가입 UI, 회원/admin·변조 JWT 거부, onboarding role/id 주입 무시, 이메일 가입 성공/실패 payload, 관리자 프로필 저장, 공통 callback의 role 없는 저장.
- web lint·build·별도 tsc 통과. 기존 Browserslist 노후/edge 정적 생성 안내만 있음. 처음 별도 tsc를 Next dev 준비와 동시에 실행했을 때 .next/types 임시 파일 경합으로 실패했으며, dev 종료·빌드 생성 후 순차 재실행하여 통과했다. 소스 오류로 우회하거나 설정을 바꾸지 않았다.
- PGlite 및 로컬 HTTP 대역은 실제 운영 Supabase/PostgREST·실계정 OAuth 검증이 아니다. 테스트는 합성 계정/메모리 DB만 사용했다.

## 운영 검증 제한

- 승인 관리자 명부/담당자 대조 결과는 미제공. 용어를 사용자에게 설명했으며 계정 식별정보를 요구하거나 공개하지 않았다. 이전의 역할 분포만으로 정당성을 판단하지 않는다.
- 운영 DB 카탈로그 결과·인증된 DB 연결이 확보되지 않아 실제 RLS/role ACL/트리거/DEFINER 정의는 미확인. 실제 Supabase 백업/PITR·복원 가능성도 미확인. 담당자가 읽기 전용 SQL과 보호된 관리 환경에서 확인해야 한다.
- 웹 우선 배포→정상 저장 확인/옛 클라이언트 전환→별도 DB 승인→지정 SQL 적용→권한/기능 재검증 순서. DB 보호를 유지하는 안전 복구와 취약 권한 복원을 구분했다.
- 운영 DB·관리자 역할·회원 데이터 변경, 운영 배포, Git push 없음. Preview 검증 결과는 후속 기록으로 추가한다.
