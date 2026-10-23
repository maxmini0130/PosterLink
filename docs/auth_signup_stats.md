# Auth 신규 계정 집계 구현

설계 기준: `7cd50ac:docs/signup_attribution_design.md`, 구현 기준 `74fe413`. 현재 운영 보안 릴리스 `09852271` 위에 통계 런타임 4파일만 분리했다. 이번 구현은 **현재 남아 있는 Auth 계정의 생성 시각 집계**에 한정한다. 누적 원장·UTM 결합·GA4 변경·DB migration은 포함하지 않는다.

## 데이터 기준과 화면

- 유일한 기준은 `auth.users.id`와 `created_at`이다. profiles 생성·로그인·OAuth 콜백·GA4 sign_up 횟수로 가입을 추가 기록하지 않는다.
- 동일 Auth id는 1개 계정이다. 다른 provider를 연결해도 같은 id면 증가하지 않는다. 탈퇴 후 새 id 생성은 새 계정이며, 같은 사람의 여러 이메일을 추가 개인정보로 결합하지 않는다.
- 실패한 가입은 Auth 행이 없으면 집계되지 않는다. 이메일 확인 전 생성된 계정도 포함한다. 온보딩 완료나 중복 없는 실제 인원 수가 아니다. 관리자·테스트·익명 계정도 존재하면 포함하며 임의로 제외하지 않는다.
- 저장 기준 시각은 서버 UTC ISO이며, 화면 구간은 Asia/Seoul 오늘·이번 주(월요일 시작)·이번 달(1일 시작)부터 `asOf` 미만이다. 최근 31일 일별 집계도 제공한다. 클라이언트는 시각·역할·필터·user_id를 지정할 수 없다.
- 기존 관리자 대시보드 카드와 레이아웃을 유지하고 별도 집계 섹션을 추가했다. profiles count 라벨은 “현재 프로필 수”로 구체화했다. Auth 전체 목록은 반환하지 않는다.

## API와 권한

`GET /api/admin/signup-stats`:

1. 서버 세션의 `auth.getUser()`로 사용자 확인.
2. 기존 RLS 세션 클라이언트로 본인의 profiles.role 조회. 기존 Auth 회원 관리 API와 같은 **super_admin**만 허용. 일반 admin 화면에는 최고 관리자 전용 안내.
3. 권한 통과 후에만 서버 `SUPABASE_SERVICE_ROLE_KEY`로 Supabase Auth 관리 API의 읽기 전용 `/auth/v1/admin/users`를 호출.
4. 1,000개씩 명시적 page/per_page로 조회. X-Total-Count, 응답 수·중복·다음 페이지·종료 조건과 마지막 total 재확인. 최대 50,000개, 공유된 20초 제한. 실패·상한·불완전 조회는 503이며 부분 결과나 0건으로 대체하지 않는다.
5. 페이지에서 id/created_at만 집계에 전달한다. 원본 metadata·이메일 등은 저장·응답·로그하지 않는다. 계정별 정보는 요청 종료 후 유지하지 않는다.
6. 모든 응답은 `Cache-Control: private, no-store, max-age=0`, `Vary: Cookie`. 401/403/503은 일반화된 메시지만 반환한다.

현재 설치된 auth-js의 listUsers Link parser가 다자리 page를 잘라 읽는 구현이어서 해당 파서에 의존하지 않고 서버에서 직접 page와 전체 수를 검증한다. 10,001개/11페이지 + 종료 확인 요청을 로컬 합성 HTTP 서버로 검증한다. 어떤 외부 Link URL도 따라가지 않는다.

성공 응답은 `asOf`, `observedFrom`, `observedTo`, `timezone`, `totalAccounts`, `today`, `thisWeek`, `thisMonth`, `daily[{date,count}]`뿐이다. 새 secret·환경변수·RLS 변경은 없고, 기존 서버 전용 키를 사용한다. 새 키를 브라우저 설정에 넣지 않는다. 기존 profiles role 할당·변경의 무결성은 기존 권한 체계에 의존하며 이번에 정책을 변경하지 않았다.

## SQL 의미와 스키마 변경 여부

새 SQL 함수·테이블·트리거·migration **없음**. 운영 DB에 SQL을 실행하지 않았다. 아래는 결과 의미를 설명하는 동등 집계 예이며 적용 스크립트가 아니다.

```sql
-- :as_of, :day_start, :week_start, :month_start는 서버 UTC 경계
SELECT
  count(*) AS total_accounts,
  count(*) FILTER (WHERE created_at >= :day_start) AS today,
  count(*) FILTER (WHERE created_at >= :week_start) AS this_week,
  count(*) FILTER (WHERE created_at >= :month_start) AS this_month
FROM auth.users
WHERE created_at < :as_of;
```

실제 구현은 관리자 Auth API 페이지를 수집하여 동일 기준으로 계산한다. 원장 생성용 Auth 트리거를 추가하거나 기존 profiles 생성 로직을 수정하지 않는다. 기존 로그인·연결·탈퇴·재가입 정책 자체도 바꾸지 않는다.

## 정확성·개인정보 한계

- 삭제된 계정은 API에서 사라져 과거 생성 수가 감소한다. 이미 탈퇴한 계정의 과거 가입 총량은 복원하지 못한다. 화면에 이를 명시했다. 탈퇴 처리와 관련 데이터를 보존하는 새 원장을 만들지 않았다.
- 페이지 조회는 단일 트랜잭션 스냅샷이 아니다. 중복·누락·total 변경은 503 처리하지만 생성/삭제가 상쇄되는 등 모든 동시 변경을 검출할 수는 없다. `asOf`는 조회 시작 cutoff이고 관측 시작·종료 시각을 함께 제공한다. 동시 변경이 없는 완전한 목록에서 계정별 정확히 1회 집계하며 **원자적 시점 정확성이나 탈퇴 포함 누적 통계를 보장하지 않는다.** 그런 요구가 있으면 별도 승인된 서버 SQL aggregate/최소 원장 설계가 필요하다.
- 캐시·로컬 영구 저장·DB 저장·UTM 결합·광고 귀속·서버 GA 전송 없음. GA4 동의·철회와 관련 코드도 그대로다. 광고별 CPA·재방문 코호트는 이번 범위가 아니다.
- 서버는 목록을 일시적으로 읽으므로 계정 수에 비례한 비용이 있다. 상한/timeout을 넘기면 실패로 표시하며 제한을 몰래 늘리지 않는다. 운영 규모·관리자 사용 빈도를 승인 전 확인해야 한다.

## 검증 경계와 실행 방법

```bash
pnpm test
pnpm --filter web lint
pnpm --filter web build
pnpm --filter web exec tsc --noEmit
pnpm --filter web exec playwright test --config playwright.signup-stats.config.ts
```

신규 Playwright 구성은 로컬 4010번의 합성 Auth/RLS 역할 HTTP 서버와 4002번 Next 서버를 띄운다. 실제 운영 키·DB를 쓰지 않는다. 권한 검증·집계 API·실제 가입 UI 성공/실패/재시도 및 관리자 UI를 검증한다. 합성 서버는 Supabase 실제 Auth 엔진이나 운영 RLS 자체가 아니다.

`E2E_BASE_URL=<Preview URL>`로 실행할 때는 합성 서버와 Next 서버를 띄우지 않는다. 원격에는 익명 API의 접근 차단, `/admin` 로그인 보호 및 기존 가입·로그인 화면을 확인한다. 로컬 전용 양성 API·가입·관리자 UI 테스트는 skip한다. Preview 미들웨어의 실제 관리자 인증을 합성 자격 증명으로 우회하지 않는다. 실계정 OAuth·실제 Auth 생성·삭제·운영 RLS 성공을 검증했다고 해석하지 않는다.

Vercel 배포 보호가 켜져 있으면 [공식 CLI 접근 방식](https://vercel.com/docs/cli/curl)으로 접근하고 보호 설정은 유지한다. 브라우저 검증에는 승인된 접근 쿠키를 담은 Git 제외 storage state를 `RELEASE_STORAGE_STATE`로 지정할 수 있다. 이 쿠키는 Vercel 배포 접근용이며 PosterLink 관리자 세션이 아니다. 값은 출력·커밋하지 않는다.

기존 analytics-actions 테스트의 로그인·찜 성공/실패·SPA/철회 검증을 재사용하고 기관 팔로우/취소 합성 성공·실패 검증을 추가했다. 그 테스트는 Google SDK와 쓰기 요청을 차단하며 로컬 전용이다. 운영 계정 로그인이나 운영 DB 쓰기로 검증하지 않는다.

## 운영 전 승인 및 롤백

운영 전 확인: (1) 최고 관리자 전용 범위, (2) 잔존 계정/미확인 계정 포함 및 탈퇴 이력 한계, (3) 페이지 스냅샷·상한·부하 한계 수용, (4) 기존 권한 설정·서버 키/환경의 읽기 권한 확인, (5) 실계정 OAuth와 운영 RLS의 미검증 범위. 이 확인은 운영 배포 승인을 대신하지 않는다.

롤백은 이전 웹 배포로 복구하거나 집계 패널·API 추가 커밋을 revert하는 것으로 충분하다. DB 롤백·회원 데이터 수정·키 교체는 필요 없다. 불필요하게 기존 Auth 트리거/RLS를 변경하거나 회원 생성 시각을 덮어쓰지 않는다. 운영 배포와 Git push는 별도 승인 전 하지 않는다.

이번 병합·검증·Preview 결과는 `WORK_LOG_20261023_signup_stats_release_preview.md`에 기록한다. 원래 74fe413 Preview 전체를 승격하지 않고 현재 보안 코드가 보존된 이번 분리 릴리스만 배포 대상으로 검토한다.
