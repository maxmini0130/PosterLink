# 수집기 동적 일정 수정 운영 반영

사용자가 수집 코드가 배포되지 않은 이유를 지적하고 배포를 요청했다. 앞선 작업이 로컬 커밋에서 멈춘 것을 바로잡았다. 작업 전 fetch/status 확인, 지침·README·실제 Daily Crawler 및 CI 워크플로를 읽었다.

- 정기 수집은 GitHub Actions의 기본 브랜치 `main`을 checkout하며 매일 01:00 UTC(10:00 KST)에 실행된다. 별도 서버나 컨테이너 배포는 없다.
- 기존 작업 브랜치는 main 대비 웹·보안·과거 운영 변경이 많이 포함돼 있어 통째로 병합하지 않았다. `origin/main`에서 별도 worktree/브랜치 `fix/youth-schedule-release-20261031`을 만들고 이번 어댑터·일정 모듈·회귀 테스트의 3개 파일만 옮겼다. DB 정정 실행기는 배포에 포함하지 않았다.
- 운영 main 기반 `npm ci`, 크롤러 테스트 **323/323 PASS**, 원문 HTML의 실제 강서 일정 `2026-11-04 19:00 ~ 21:00` 추출 확인, diff 검사 PASS. 이전 385개 테스트 수는 별도 작업 브랜치 기준이며 이번 main 기반 테스트 수와 구분한다.
- [PR #13](https://github.com/maxmini0130/PosterLink/pull/13)의 Crawler Test·Web Lint & Build·Vercel 검사 모두 성공한 뒤 사용자 배포 요청 범위에서 squash merge했다.
- main 병합 커밋: `786acc6e1b147b4bc9435085e5f407545d6bcbfb`, 2026-10-31 13:01:27 KST. 원격 main의 3개 수집 파일이 검증한 수정본과 동일함을 `git diff --exit-code`로 확인했다. Daily Crawler workflow 상태 `active` 확인.
- 병합 후 [main CI](https://github.com/maxmini0130/PosterLink/actions/runs/41166815843)도 전체 success, 같은 커밋의 Vercel status success 확인. 운영 수집 코드 반영 완료이며 다음 정기 수집은 수정본을 사용한다. 수집 전체 작업을 수동 재실행하거나 DB 업로드하지 않았다.
- 이번 배포에서 운영 DB 쓰기·마이그레이션·RLS·환경변수 변경 없음. 앞선 15건 날짜 정정·1건 승인은 이미 반영된 상태를 유지한다. 기존 품질 게이트 경고를 해결한 배포라고 주장하지 않는다.
- 원 작업 브랜치와 사용자 변경은 보존했다. 문제가 생기면 새 main 커밋으로 이번 3파일 변경만 revert하고 검증한다. 강제 푸시나 파괴적 Git 명령은 사용하지 않았다.
