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

## Preview 검증 완료

- 보안 전용 코드 SHA: `09852271a20ed334656dddbec5e697467038fd28`.
- Preview URL: https://poster-link-3z19cdgbw-maxmini0130s-projects.vercel.app
- 배포 ID: `dpl_CUFTXUwZ9voGmSvnKBKsPos5Ahq9`. CLI inspect: preview / Ready. 배포 API 메타데이터에서 코드 SHA·운영 기준 SHA·릴리스 ref 일치 확인. CLI 업로드로 배포했으며 Git push는 하지 않았다.
- 원격 Next build 성공. 보호 설정은 기존 all_except_custom_domains 그대로이며 프로젝트에 이미 존재한 자동화 접근 자격으로 임시 접근 쿠키만 사용했다. 애플리케이션의 회원/관리자 인증은 끄지 않았다. [Vercel 공식 자동화 접근 방법](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)을 확인했다.
- 원격 Playwright **3통과/5skip**: 익명 onboarding API와 관리자 역할 API 401·프로필 수정 로그인 리다이렉트, 데스크톱/390px 모바일 로그인/가입 UI, 배포된 가입 JS의 role 없는 profile payload. 마지막 항목은 브라우저에서 Auth/프로필 요청을 합성 응답으로 가로챈 검증이며 실제 가입 성공·DB 저장으로 표시하지 않는다. 브라우저의 기타 API 쓰기·외부 요청은 차단했다.
- skip 5개는 로컬 합성 세션에 의존하는 관리자/회원·onboarding·가입 저장·관리자 프로필·callback 검사다. 로컬에서는 앞서 모두 통과했다. 실계정 카카오/네이버/Google 로그인·실제 회원 저장·실제 Supabase PostgREST/운영 RLS는 미검증이다.
- 읽기 전용 추가 smoke: robots.txt 200, sitemap.xml 200, `/categories/bid` 200·운영 canonical·실제 공고 상세 링크 존재. 미승인 `/api/admin/signup-stats`는 404. 운영 대상 배포 ID와 배포 보호 설정이 바뀌지 않았음을 다시 확인했다.
- 390px 모바일 가입 화면 캡처를 시각 확인했다. 테스트 결과/스크린샷은 Git 제외 `data/results/security-release-20261023/`에 있다. 비밀값·회원 식별정보는 기록하지 않았으며 임시 접근 쿠키는 검증 후 삭제한다.
- 후속 변경은 원격 전용 테스트와 이 검증 기록뿐이며 앱/SQL은 코드 SHA와 동일하다. Lint·tsc 재통과. 최종 기록 커밋은 Preview에 배포한 코드 커밋과 구분한다.

## 최종 판정

**보안 전용 릴리스 분리·로컬·Preview 검증 완료, 운영 적용은 승인 대기.** 운영 카탈로그/관리자 정당성/실제 DB 백업·복구 확인 및 지정 SQL의 별도 적용 승인이 남아 있다. 미확인 사항을 완료로 표시하거나 운영 DB에 공격 요청을 보내지 않았다. 전체 범위·절차·복구는 [보안 릴리스 안내](docs/profile_role_security_release.md)를 따른다.
