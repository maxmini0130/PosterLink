# main 자동 배포로 운영 보호 코드가 빠진 사고

상태: 승인 대기 (구현 Claude, 검토 Codex) — `893d571` 코드 정렬 검토 통과. 사용자 PR CI·배포 URL 확인·Promote 대기

## 경위 (KST)

- 10/25: 운영 웹은 `main`이 아닌 릴리스 브랜치 `release/ga4-production-20261025`의 `0aa3524`를 Vercel CLI로 배포한 `dpl_K26HCSXnYc5ycQD86N5S1huG1a1g`였다. 이 소스에는 네이버 로그인 긴급 차단, 회원 탈퇴 안전 중단, Sentry 개인정보 패치, 가입 통계, GA4(수집 OFF) 코드가 있다.
- 10/31 13:03: 크롤러 수정 PR #13을 `main`에 squash merge했다. Vercel Git 연동의 Production 브랜치가 `main`이라 `786acc6`이 **Production으로 자동 배포**되어 운영 도메인에 연결됐다(GitHub deployments API에서 environment=Production 확인). `main`에는 위 보호 코드가 없다. 당시 작업 기록은 Vercel status success만 확인하고 운영 웹 코드가 바뀐 사실은 확인하지 않았다.
- 10/31 약 19:40: retention 0단계 운영 반영 절차를 준비하던 중 발견했다. 운영 `GET /api/auth/naver`가 `nid.naver.com` OAuth로 307 이동했다. 차단 이전의 취약한 흐름은 같은 이메일의 기존 계정을 찾아 비밀번호·메타데이터를 덮어쓰고 로그인시킨다.
- 10/31 약 19:50: 사용자가 Vercel 대시보드에서 `K26HCSXnY`로 Instant Rollback했다.

## 확인

- 롤백 후 읽기 전용 GET: `/api/auth/naver` 503과 일시 중단 안내, `posterlink.kr` → `www` 307 유지, `/login`에 중단 안내, `/`·`/posters`·`/privacy` 200.
- 노출 기간(13:03~20:00) 영향: 사용자가 Supabase SQL Editor에서 개인정보 없는 집계 SELECT를 실행했다. 전체 12, 네이버 메타데이터 계정(과거 누적) 4, 기간 내 생성 0, 기간 내 로그인 0, **기간 내 네이버 흐름으로 바뀐 기존 계정 0**. 계정 피해 없음. Claude의 운영 읽기 시도는 자동 권한 판정에서 차단돼 실행하지 않았다.
- 크롤러는 GitHub Actions가 `main`을 직접 실행하므로 웹 롤백과 무관하게 10/31 크롤러 수정이 유지된다.
- DB 역할 보호 마이그레이션은 DB에 적용돼 있어 웹 배포와 무관하게 유지됐다.

## 원인

1. 운영 웹 소스(릴리스 브랜치)와 Vercel Production 브랜치(`main`)가 달랐다.
2. `main` 병합을 "크롤러만의 변경"으로 보고 웹 배포 영향을 점검하지 않았다.

## 현재 상태와 재발 방지

- Instant Rollback 이후 Vercel은 Git push로 생긴 Production 배포를 운영 도메인에 자동 연결하지 않는다. 이는 임시 보호이며, 다음 정식 배포 때 수동 Promote가 필요하다.
- **`main` 정렬 전에는 `main` push를 보류한다.** 협업 규칙 브랜치 `docs/agent-collaboration-20261031`과 이 브랜치도 포함한다.
- 추천: 릴리스 브랜치의 보호 코드를 `main`에 병합해 `main` = 운영 웹 기준으로 만든다. 병합 PR을 이 브랜치에서 준비해 교차 검토 후 사용자가 push·Promote한다. 대안은 Vercel Production 브랜치 변경이나 Git 자동 배포 해제다.
- `main`을 건드리는 모든 작업은 웹 운영 배포 영향 확인을 완료 조건에 넣는다.

## main 정렬 (이 브랜치)

- `c07b103`: `release/ga4-production-20261025`(`2c6744a`)를 `--no-ff`로 병합했다. 충돌 없음. 공통 조상은 `3560365`, `main` 전용 커밋은 크롤러 수정 `786acc6` 1개, 릴리스 전용 커밋은 36개.
- `8a426db`: `scripts/crawler`를 병합 전 `main` 상태로 되돌렸다. 릴리스 브랜치의 지역 분류 변경(`3026020`, `e66bb6b`의 `region-context`, `region-rules`, `poster-classifier`, `upload-to-supabase`)은 일일 크롤러에서 한 번도 실행된 적이 없고, 1단계(B 지역 정리) 검증 대상이기 때문이다. 이미 실행된 일회성 검토 스크립트 5개도 제외했다. 1단계에서 검증한 뒤 이 커밋을 revert해 반영한다.
- 결과: `apps/web`, `packages`, `supabase`는 운영 소스 `0aa3524`와 **동일**(diff 없음). 크롤러는 현재 `main`과 동일. 릴리스 브랜치 대비 차이는 크롤러와 이 사고 기록뿐이다.
- 알려진 차이: 관리자 수동 크롤링·공지 후보 변환은 웹 번들의 크롤러 업로드 모듈을 쓴다. 지금 운영 웹은 릴리스의 새 지역 분류를 쓰고 있었고, 정렬 후에는 일일 크롤러와 같은 기존 분류와 `786acc6` 일정 수정을 쓴다. 두 경로가 일치하게 되는 방향이다.
- 환경 의존성: 네이버 차단 라우트는 환경변수와 무관하게 503이다. GA는 `NEXT_PUBLIC_GA_ENABLED=true` 등이 있어야 동작하는데 Vercel 프로젝트에는 GA 환경변수가 없으므로 `main` 빌드에서도 수집 OFF다.
- 검증(로컬 Node 24.15.0): 크롤러 `npm test` 323/323, 웹 lint PASS, build PASS, `naver-emergency-stop` 고정 검사 5/5, `pnpm test` 170/172(기존 `profile-role-release` 스냅샷 2건, 릴리스 기준과 동일), `git diff --check` PASS. Node 20 빌드는 로컬에 Node 20이 없어 PR CI에 맡긴다.

## 반영 절차 (사용자 실행)

1. Codex 교차 검토 통과 후 이 브랜치를 push하고 `main`으로 PR을 만든다. CI(크롤러 테스트, 웹 lint·build, Node 20)를 확인한다. **병합 방식은 "Create a merge commit"을 쓴다.** squash·rebase로 병합하면 릴리스 계열 이력이 끊겨, 이후 0단계·B 지역 브랜치를 `main`에 합칠 때 같은 변경이 다시 충돌한다.
2. PR을 병합하면 Vercel이 Production 배포를 만든다. Instant Rollback 상태라 운영 도메인에 자동 연결되지 않는다. 그 배포 URL에서 `/api/auth/naver` 503, `/login` 중단 안내, 홈·목록·상세 200을 확인한다.
3. 확인 후 그 배포를 Promote한다. 이때부터 다시 `main` push가 운영 배포가 된다(이번 정렬 이후에는 의도된 동작).
4. 롤백: 문제가 있으면 `K26HCSXnY`로 Instant Rollback한다.

## Codex 교차 검토 (`893d571`)

- [검토 기록](WORK_LOG_20261031_main_production_alignment_review.md): 웹·packages·supabase tree는 `0aa3524`, 크롤러 tree는 fetch 시점 `origin/main`(`786acc6`)과 동일. 루트 빌드 의존성·보호 코드도 대조했고 새 누락을 발견하지 못했다.
- 직접 검증: 크롤러 323/323, 웹 lint/build PASS. 네이버 차단 5/5·탈퇴 중단 1/1·Sentry 5/5·GA 보호 3/3 PASS. 루트 최종 재실행 170/172(기존 스냅샷 실패 2건). 추가 과거 탈퇴 전용 스냅샷 실패 1건도 운영 기준에서 동일하게 재현했다.
- Node 24 첫 루트 검사는 V8 fatal 오류로 중단됐으나 별도 재실행에서 172개 완주했다. Node 20은 PR CI에서 확인한다. 실제 Production 환경 설정·배포 URL·운영 DB 검증은 이번 코드 검토 범위에서 실행하지 않았다.
- 반영 직전에 rollback/자동 도메인 연결 중지 상태·Production 환경변수·실제 배포 SHA를 사용자가 확인해야 한다. 관리자 수동 수집 번들의 main 크롤러 사용 차이는 의도된 범위로 유지한다.
- 검토자는 구현 코드를 수정하지 않고 같은 브랜치에 기록만 로컬 커밋했다. push·PR 생성/병합·배포·Promote·운영 DB 쓰기는 하지 않았다.
