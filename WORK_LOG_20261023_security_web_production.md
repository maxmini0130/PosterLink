# 관리자 권한 보안 웹 릴리스 운영 적용 결과

## 승인 및 적용 범위

사용자가 1단계 사전 확인과 2단계 보안 웹 배포를 승인했다. DB SQL과 테스트 계정 역할 변경은 별도 승인이 필요하므로 실행하지 않았다. 추가 계획서나 기능 코드는 작성하지 않았다. 실제 관리자 3개 및 테스트 관리자 2개의 계정·권한·세션·연결 데이터는 변경하지 않았다. Git push도 수행하지 않았다.

## 사전 확인

- git fetch origin 및 git status --short --branch 실행. 브랜치 release/security-profile-role-20261023, 시작 HEAD b7c6ba0, 작업 트리 깨끗함.
- 운영 www/apex 두 도메인이 기존 배포 dpl_Ld6ySHTzzb6YQUAQUstTcd7LdfRT / SHA b3519d2fa5bec73be9f9f13d56c44c4bf1cba9f2를 가리킴을 API로 확인하고 복구 메타데이터 보존.
- 검증된 Preview dpl_CUFTXUwZ9voGmSvnKBKsPos5Ahq9의 READY 상태와 SHA 09852271a20ed334656dddbec5e697467038fd28 재확인. 운영 대비 앱 변경은 기존 5개 프로필 쓰기 경로에서 role 제거 및 불필요한 role 사전 조회 제거뿐. GA4·UTM·신규 가입 통계 미포함.
- 운영 Supabase의 자동 Physical 백업 7개, 최신 2026-10-23 02:45:23 KST와 Restore 표시 재확인. PITR 비활성. 복원 실행/성공은 미검증이며 Storage 파일은 DB 백업에 포함되지 않음.
- 운영 SQL Editor에서 SELECT만 실행해 RLS·정책 6개·테이블/칼럼 ACL·기존 updated_at 트리거 및 함수 정의를 보존. RLS 활성, role enum/default 및 일반 역할의 role UPDATE 허용, role guard 부재 확인. 추가로 admin_can_update_profiles 정책 존재를 직접 확인했다. 이 정책까지 반영한 전체 DB 호환성을 재검증하기 전에는 SQL 적용 완료/준비 완료로 간주하지 않는다.
- Auth ID·이메일·역할을 메모리에서 대조해 유지 3개/정리 2개를 구분하고 비공개 로컬 증빙에 저장. 식별정보는 Git/공개 로그에 넣지 않음.
- 실행 중인 로컬 E2E 프로세스 없음 확인. 일반 globalSetup 및 운영 자격을 쓰는 E2E는 실행하지 않음. 외부 수동 자동화 전체 중지 여부까지 보장하지 않음. 이번 검사는 별도 보안 설정의 격리 또는 네트워크 mock만 사용.

## 실제 웹 적용

검증된 Preview에 대해 vercel promote 실행. Vercel이 해당 SHA로 Production 배포를 새로 빌드했다. 빌드 성공 및 READY 확인 후 두 도메인의 실제 alias 전환을 API로 재확인했다.

- 운영 SHA: **09852271a20ed334656dddbec5e697467038fd28**
- 운영 deployment: **dpl_G4T3qmMMJH8gBwW5FfpSVwE49S5v**
- 배포 URL: https://poster-link-ggjb950mh-maxmini0130s-projects.vercel.app
- 운영 도메인: https://www.posterlink.kr 및 https://posterlink.kr
- 이전 정상 deployment: dpl_Ld6ySHTzzb6YQUAQUstTcd7LdfRT, https://poster-link-exv14exns-maxmini0130s-projects.vercel.app

환경변수/Auth/RLS/DB 마이그레이션 변경 명령은 실행하지 않았다. 웹만으로 DB 권한 상승 취약점 해결이 완료된 것은 아니다.

## 검증 결과

- 운영 GET: 홈·로그인·회원가입·입찰 카테고리·robots.txt·sitemap.xml·sitemap-index.xml·공고 하위 sitemap·공개 상세 모두 HTTP 200. 비인증 mypage/edit 및 admin은 로그인으로 이동.
- 공개 상세 HTML의 canonical·Open Graph·JSON-LD 확인. HTTP 점검 스크립트의 최초 상세 URL 탐색은 sitemap.xml을 공고 sitemap으로 잘못 가정해 실패했다. 실제 robots에 지정된 sitemap-index.xml과 공고 하위 sitemap을 따라 수정한 점검은 통과했다. 서비스 코드는 수정하지 않았다.
- 격리 보안 테스트 92/92 통과. 로컬 격리 브라우저의 staff profile save 요청 role 미포함 검사 1/1 통과.
- 실제 운영 도메인 보안 브라우저 검사 3 통과/5 skip. 비인증 API 401 및 보호 페이지 redirect, 데스크톱/390px 모바일 로그인·회원가입 UI, 실제 운영 compiled signup의 mock Auth/프로필 요청 role 미포함 확인. 실제 가입/프로필 쓰기는 mock으로 차단했다.
- 운영 배포 요청 로그 50건: 200 41건, 307 6건, 예상된 비인증 401 2건, status 0 1건. 모두 info이며 5xx/error/fatal 및 인증 관련 error 레벨 없음. 짧은 표본이므로 무장애 보장은 아님.
- 배포 후 읽기 전용 재조회에서 기존 5개 Auth ID별 프로필 역할이 사전 기록과 동일함을 확인. 실제 관리자 3개 보존, 테스트 2개도 아직 super_admin 유지.

## 미검증 및 다음 승인 경계

실제 OAuth/이메일 로그인, 실제 정상 프로필 저장, 실제 관리자 세션의 화면/API 기능, 찜·댓글 저장은 이번에 수행하지 않았다. 운영자가 본인 계정으로 로그인과 허용된 정상 저장·관리자 기능을 확인해야 한다. 실계정 미검증을 성공으로 표시하지 않는다. 관찰된 장애나 복구 필요 사항은 없으며, DB 단계는 진행하지 않는다.

DB 적용 대상은 기존 9510f96 기준 보호 마이그레이션이지만 이번에는 미적용이다. 전체 운영 정책 확인 결과와 정상 저장 검증을 반영하고 적용 범위/복구 절차를 보여준 뒤 명시적 SQL 승인을 받아야 한다. 테스트 계정 user 강등·차단·세션 폐기도 정확한 대상 ID와 전후 상태를 보호된 경로에서 제시하고 별도 승인받아야 한다. 계정 삭제는 대상이 아니다.

현재는 DB 보호를 적용하지 않았으므로 웹 문제 시 이전 운영 deployment로 복구 가능하다. DB 보호 적용 후에는 role을 전송하지 않는 이번 정상 웹을 복구 기준으로 삼고 guard나 role 차단을 제거하지 않는다.

문서 검증: UTF-8, 링크, Prettier, git diff --check 확인. 앱 소스 변경 없음.
