# main·운영 웹 정렬 교차 검토

상태: 승인 대기 (구현 Claude, 검토 Codex) — 대상 `893d571`, 코드 정렬 검토 통과. 사용자 PR·CI·배포 URL 확인·Promote 대기

## 대상과 결론

- worktree: `C:/Maxmini_Project/PosterLink-main-alignment`
- 브랜치: `fix/main-production-alignment-20261031`
- 검토 대상: `893d571fc805f41e9bb8695db4c6e492c5e32dd6`
- 운영 웹 기준: `0aa35240f4ab6829d1a0a1dd6f4dac9aa2e9697c`
- fetch 후 main 기준: `786acc6e1b147b4bc9435085e5f407545d6bcbfb`
- 근거: [사고·정렬·반영 절차](WORK_LOG_20261031_main_autodeploy_incident.md), 운영 배포 기록, AGENTS·CLAUDE 지침, 실제 배포/빌드/CI 구성.

**결론: 요청한 정렬 기준을 만족하며, 이번 변경으로 누락된 보호 코드는 발견하지 못했다.** 이 판정은 소스·로컬 검증 결과다. 사용자가 실행할 PR CI, 배포 URL 검사와 Promote는 아직 하지 않았다. 검토 과정에서 구현 코드나 마이그레이션을 수정하지 않았다.

## 파일·이력 비교

`git diff --exit-code`와 Git tree 객체를 함께 비교했다. 다음 비교는 모두 차이가 없다.

| 범위              | 기준                     | 동일한 tree 객체                           |
| ----------------- | ------------------------ | ------------------------------------------ |
| `apps/web`        | `0aa3524`                | `3a905e6254b65b13dd51451b61082aa682cb2f37` |
| `packages`        | `0aa3524`                | `a1b6b04416d6c65ac4cd810bdc58d6fdb5027bd6` |
| `supabase`        | `0aa3524`                | `f858b129dfea525fe5ec37f13b68f4a6de7e22bc` |
| `scripts/crawler` | fetch 시점 `origin/main` | `d23dfef9df4f7c68ff94f5e55ca4b6e14a067570` |

추가로 루트 `package.json`, `pnpm-lock.yaml`, `.github`, `apps/mobile`, 보안 검증 스크립트도 `0aa3524`와 동일함을 확인했다. 웹 폴더만 같고 다른 빌드 의존성이 바뀌는 경우를 별도로 점검했다. `0aa3524` 대비 전체 차이는 의도된 크롤러와 사고/배포 문서에 한정된다.

- `origin/main..893d571`은 **first-parent 기준 5개**, 병합된 릴리스 계열 이력까지 포함하면 **41개**다. 사용자 설명의 5커밋과 git status의 ahead 41은 서로 다른 집계 방식이며 정렬 오류가 아니다.
- `c07b103`은 `97165bc`와 릴리스 브랜치 `2c6744a`를 부모로 갖는 실제 merge commit이다. 운영 기준 `0aa3524` 및 릴리스 `2c6744a`, main `786acc6`이 모두 검토 브랜치의 조상임을 확인했다.
- GitHub 저장소는 default branch `main`, `allow_merge_commit=true`다. 문서의 Create a merge commit 방식 사용이 가능하다. 이번 검토에서 PR 생성·병합은 하지 않았다.
- 이미 별도 검토한 retention 0단계 신규 계측을 이번 정렬에 섞지 않았다. 이 브랜치의 목적은 기존 운영 기준 복구이며 신규 측정 DB 마이그레이션 적용이 아니다.

## 보호 코드 확인

1. **네이버 로그인 중단**: 시작·callback 라우트가 환경변수 없이 503/no-store를 반환한다. provider 요청, 기존 사용자 검색, 비밀번호 변경, 로그인 세션 발급이 없다. 공통 callback의 `naver_at`/`naver_rt` 진입도 Auth 클라이언트를 만들기 전에 차단한다. Google/Kakao 기존 PKCE 경로는 보존한다.
2. **자동 탈퇴 중단**: DELETE는 인증 후 안전 중단 안내를 반환하고 Auth 삭제·OAuth unlink·데이터 삭제를 호출하지 않는다. 인증 확인 실패도 503으로 닫힌다. 요청 연락처의 별도 설정·확인 조건을 보존한다.
3. **Sentry 개인정보 보호**: 서버·클라이언트 instrumentation이 같은 privacy 옵션을 사용한다. 사용자·쿠키·헤더·본문·검색어·첨부·임의 breadcrumb/span 데이터 제거 및 Replay 비활성화가 유지된다.
4. **가입 통계와 권한**: 관리자 API는 세션 사용자·역할 확인 후 super_admin 권한 경로에서 통계를 읽는다. 사용자 목록·이메일·upstream 오류를 응답하지 않는 기존 구현을 보존한다. 역할 보호 마이그레이션 파일·미들웨어·관리자 경로도 운영 기준과 동일하다. 운영 DB의 실제 적용 상태를 이번에 조회한 것은 아니다.
5. **GA 보호**: 기존 엔진·consent 및 전송 시점 guard, 기본 비활성 설정, 개인정보 필터를 보존한다. 실제 Production 빌드의 수집 OFF는 환경변수에도 의존하므로 소스 일치만으로 현재 프로젝트 설정까지 검증했다고 보고하지 않는다.

## 의도된 크롤러 차이와 웹 번들

`scripts/crawler` 전체가 main과 동일하며, `786acc6`의 동적 일정 누락 수정도 포함한다. 아직 검증하지 않은 릴리스의 지역 분류 코드와 일회성 정정 스크립트는 들어오지 않는다.

웹 build는 `scripts/build-crawler-bundles.mjs`로 크롤러를 `.generated`에 다시 묶는다. 따라서 **웹 소스는 운영 기준과 동일해도 관리자 수동 수집의 크롤러 번들까지 기존 운영 배포와 바이트 단위로 같다는 의미는 아니다**. main의 크롤러 분류를 사용하게 되는 차이는 사고 기록에 이미 명시된 의도된 범위로 판단했다. 빌드·크롤러 테스트는 통과했지만 관리자 수집을 실제 실행하거나 결과를 DB에 올리지는 않았다.

## 검토자가 직접 실행한 검증

| 검증                                   | 결과                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| tree·파일·조상 비교                    | 위 지정 기준 모두 일치                                                                                                   |
| 크롤러 테스트                          | 323/323 PASS                                                                                                             |
| 웹 lint                                | PASS                                                                                                                     |
| 웹 production build                    | PASS. 타입검사와 크롤러 번들 생성 포함. 로컬 Node 24.15.0                                                                |
| 네이버 긴급 중단 검사                  | 5/5 PASS. 실제 라우트를 메모리의 모의 Auth·차단된 network로 실행                                                         |
| 탈퇴 안전 중단 검사                    | 1/1 PASS. 모의 인증이며 삭제·unlink 호출 없음 확인                                                                       |
| Sentry privacy 검사                    | 5/5 PASS. 합성 이벤트와 모의 transport만 사용                                                                            |
| GA/네이버 보호 통합 검사               | 3/3 PASS                                                                                                                 |
| 추가 과거 탈퇴 전용 릴리스 스냅샷 검사 | 0/1. 네이버 중단 이전 로그인 화면과의 고정 비교로 실패. 기존 운영 웹 기준 worktree `2c6744a`에서도 같은 실패를 직접 재현 |
| 루트 `pnpm test` 최종 재실행           | 170/172. 기존 `profile-role-release` 스냅샷 2건만 실패                                                                   |
| 문서 Prettier·diff 검사                | PASS                                                                                                                     |

첫 루트 실행은 다른 로컬 검사와 병행할 때 Node 24/V8의 `jit_page_->allocations_.erase(addr)` fatal 오류로 profile-role 테스트 프로세스가 중단돼 86개만 집계됐다. 이를 정상 결과로 처리하지 않았고 빌드 완료 후 별도로 재실행해 172개 완주를 확인했다. 원인까지 확정하거나 CI에서도 같은 문제가 난다고 주장하지 않는다. Node 20 검증은 이번 로컬에서 하지 않았으며 PR CI가 별도 필요하다.

테스트 출력은 Git 제외 `data/results/main-alignment-review/`에 보관한다. 실제 로그인·가입·탈퇴·관리자 수집 실행, 운영 DB 접근·쓰기, 웹 Preview/Production 화면 조작, 환경변수 수정, push·배포·Promote는 하지 않았다.

## 반영 절차 검토와 남은 확인

사고 기록의 **사용자 push → PR CI → Create a merge commit → 생성된 Production 배포 URL 검사 → 사용자 Promote** 순서를 유지한다. Vercel 공식 문서도 Instant Rollback 후 자동 Production 도메인 연결이 중지되고 Promote하면 다시 활성화됨을 설명한다: [Instant Rollback](https://vercel.com/docs/instant-rollback), [staged Production 배포 Promote](https://vercel.com/docs/deployments/promoting-a-deployment).

이 절차가 안전하려면 반영 직전에 사용자가 다음을 확인해야 한다.

- 현재 Vercel 프로젝트가 여전히 rollback/자동 도메인 연결 중지 상태인지 확인한다. 과거 기록만으로 현재 설정을 보장하지 않는다.
- PR CI에서 Node 20의 웹 lint/build·크롤러 검사를 확인하고, 병합은 merge commit으로 한다. 기존 릴리스 계열 조상을 끊는 squash/rebase를 쓰지 않는다.
- 새 배포의 Git SHA가 실제 merge commit이고 환경이 Production인지 확인한다. Preview의 성공 상태만 보고 운영 복구로 판단하지 않는다.
- Production 환경에서 GA 수집 OFF 조건과 기존 보호 설정이 유지되는지 확인한다. 기존 CLI 배포의 build flag가 새 Git 빌드에 자동 승계된다고 가정하지 않는다.
- 별도 배포 URL에서 네이버 start/callback·legacy callback 503과 중단 안내, 공개 홈·목록·상세 정상 응답을 확인한 뒤 Promote한다. 운영 로그를 남기는 브라우저 검사는 기존 승인·격리/자동화 표시 원칙에 따라 수행한다.
- Promote 뒤에는 자동 도메인 연결이 재개되므로 이후 main 변경도 웹 Production 배포 영향을 점검한다. 문제 발생 시 검증된 `K26HCSXnY`로 사용자 Instant Rollback 절차를 따른다.

이번에 운영 반영을 실행한 것이 아니므로 배포 완료·환경 검증 완료·사고 피해 여부를 새로 판정하지 않는다. 사고 기록의 계정 집계·롤백 결과는 사용자가 제공한 기존 확인 내용으로 구분한다.
