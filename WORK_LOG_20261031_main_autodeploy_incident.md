# main 자동 배포로 운영 보호 코드가 빠진 사고

상태: 조치 완료(롤백), 재발 방지 진행 중 (Claude) — 기준 `origin/main` `786acc6`

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
