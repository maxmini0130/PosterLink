# 재방문·가입 전환 0-1 기존 측정 현황 (2026-10-31)

기준: [RETENTION_PLAN_2026-10-31.md](RETENTION_PLAN_2026-10-31.md) 0-1. 읽기 전용 코드·마이그레이션 조사이며 운영 DB 조회·쓰기, 환경변수 변경, 배포는 하지 않았다.

## 조사 기준 소스

| 구분             | 브랜치/커밋                                        | 비고                                                                        |
| ---------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| 운영 웹          | `release/ga4-production-20261025` (코드 `0aa3524`) | `WORK_LOG_20261025_ga4_production_rollout.md` 기준. GA4 코드 포함, 수집 OFF |
| `origin/main`    | `786acc6`                                          | 정기 크롤러 기준. **GA4 코드(`lib/analytics.ts`) 없음**                     |
| 현재 작업 브랜치 | `fix/public-ac-web-20261025` (`b843da6`)           | main 대비 47커밋 앞섬. 운영 웹과도 다름                                     |

아래 항목 중 `SiteVisitTracker`, `posterMetrics`, `alert-events`는 세 소스 모두에 있고, GA4 엔진은 운영 릴리스와 현재 브랜치에만 있다.

## 현재 분석 도구

| 도구                                         | 위치                                                                   | 운영 상태                                                               | 성격                                                                                                                                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 자체 방문 기록 `site_visit_logs`             | `app/components/SiteVisitTracker.tsx` → `POST /api/site-visits`        | **수집 중** (전 방문자, 동의 불필요 구조)                               | 공개 경로 page view. `visitor_key`(localStorage `posterlink.visitor_key`), `session_key`(sessionStorage), 로그인 시 서버가 `user_id` 기록, `ip_hash`, 정제 referrer·UTM, UA, `actor_type`/`is_automated` |
| 자체 공고 조회 `poster_view_logs`            | `lib/posterMetrics.ts` `logPosterView` → `POST /api/poster-views`      | 수집 중                                                                 | poster_id, `visitor_key`(**별도 키** `posterlink_visitor_key`), `referrer_path`(실제로는 현재 경로), user_id. 같은 공고 30분 중복 제거                                                                   |
| 자체 신청 링크 클릭 `poster_link_click_logs` | `POST /api/poster-link-clicks`                                         | 수집 중                                                                 | poster_id, link_id, link_type, link_url, user_id                                                                                                                                                         |
| 자체 검색 `search_logs`                      | `POST /api/search-logs`                                                | 수집 중                                                                 | 검색어, 결과 수, user_id                                                                                                                                                                                 |
| 자체 제품 이벤트 `product_events`            | `lib/alertAnalytics.ts` → `POST /api/alert-events`                     | 수집 중                                                                 | **7개 이벤트로 CHECK 제한**: alert_cta_view/click, auth_modal_view, login_complete, alert_saved, notification_sent/open. 종료 공고 알림 CTA 전용. 익명(식별자 없음)                                      |
| Vercel Analytics                             | `ExistingWebAnalytics.tsx`(page view), `alertAnalytics.ts`의 `track()` | 수집 중                                                                 | 경로 정제 후 page view, 위 7개 알림 이벤트만 custom event. SQL 조인 불가                                                                                                                                 |
| GA4                                          | `lib/analytics.ts` 외 3파일                                            | **코드 배포, 수집 OFF** (`NEXT_PUBLIC_GA_ENABLED=false`, 방침 B 미승인) | 12개 이벤트, 동의 기반, 서비스 user_id 미전송                                                                                                                                                            |

DB에 이미 있는 상태 테이블: `favorites`(UNIQUE `(user_id, poster_id)`, created_at), `institution_follows`(PK `(user_id, institution_id)`), `user_interest_categories`, `profiles.primary_region_id`, `alert_subscriptions`. 가입 시각은 Auth `created_at`(관리자 가입 통계가 사용).

앱(Expo WebView)은 같은 웹을 열며 `applicationNameForUserAgent`로 UA 접미사를 붙인다(`apps/mobile/App.tsx:756`). WebView 저장소가 별도이므로 `visitor_key`도 웹과 따로 생긴다(지시서 0-3의 전제와 일치).

## 지시서 이벤트 대조

"있음"은 운영에서 실제 수집되는 자체 기록 기준이다. GA4는 수집 OFF라 현재 지표 산출에 쓸 수 없으므로 별도 열로 표시했다.

| 지시서 이벤트                      | 판정      | 현재 대응 (자체 기록)                                                                                                  | GA4(OFF)                             | 부족한 점                                                                                                              |
| ---------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `page_view`                        | **있음**  | `site_visit_logs`                                                                                                      | `page_view`                          | 페이지 유형은 저장 안 함 → 경로에서 SQL로 파생 가능. 추가 설치 불필요                                                  |
| `poster_view`                      | 이름 다름 | `poster_view_logs`                                                                                                     | `view_poster`                        | **출처(검색/관련 카드/홈 섹션/공유 링크) 없음**. `referrer_path`가 이전 화면이 아님. visitor_key가 방문 기록과 다른 키 |
| `favorite_add` / `favorite_remove` | 이름 다름 | `favorites` 행 생성만 (해제는 행 삭제로 흔적 없음)                                                                     | `save_poster` / `unsave_poster`      | 해제 기록, 화면, 회원 여부 없음. 비회원 찜은 기능 자체 없음(2단계)                                                     |
| `institution_follow`               | 이름 다름 | `institution_follows.created_at`                                                                                       | `follow_institution`                 | 화면 없음, 해제 흔적 없음                                                                                              |
| `interest_save`                    | **없음**  | 온보딩·마이페이지가 `user_interest_categories`·`primary_region_id`를 덮어씀. 알림용 `alert_saved`는 종료 공고 CTA 한정 | `enable_notification`(알림 CTA 한정) | 저장 시점·회원 여부 기록 없음                                                                                          |
| `apply_status_set`                 | **없음**  | 기능 없음(3단계)                                                                                                       | —                                    | 3단계에서 추가                                                                                                         |
| `share_click`                      | **없음**  | 상세 공유 버튼 있음(`PosterDetailClient.tsx:1120`, `navigator.share` → 클립보드 폴백). 카카오 공유 없음                | —                                    | 이벤트 추가. 채널은 `native_share`/`link_copy`                                                                         |
| `signup_prompt_shown`              | 부분      | `product_events.auth_modal_view`, `alert_cta_view` (종료 공고 CTA만)                                                   | —                                    | 다른 위치 없음                                                                                                         |
| `signup_start`                     | **없음**  | —                                                                                                                      | —                                    | 시작 화면·기능 기록 없음                                                                                               |
| `signup_complete`                  | 이름 다름 | Auth `created_at`, `product_events.login_complete`(CTA 한정)                                                           | `sign_up`(동의 시 auth receipt로만)  | 시작 화면·기능 없음. 가입/로그인 구분은 callback receipt에 있음                                                        |
| `guest_merge`                      | **없음**  | —                                                                                                                      | —                                    | 2단계                                                                                                                  |
| `outbound_apply_click`             | 이름 다름 | `poster_link_click_logs`                                                                                               | `click_application`                  | 충분. 추가 설치 불필요                                                                                                 |

## 중복·정리 대상

1. **익명 식별자 2개**: `posterlink.visitor_key`(방문)와 `posterlink_visitor_key`(공고 조회)가 서로 다른 UUID다. 지시서의 `anonymous_id`는 새로 만들지 않고 `posterlink.visitor_key`로 일원화하는 것을 제안한다.
2. **같은 행동이 세 곳에 기록**: 예) 종료 공고 알림 이벤트는 Vercel custom event + `product_events`, 찜은 GA4 + `favorites`. 신규 이벤트를 GA4·Vercel에 또 넣지 않는다.
3. `anonymous_id → user_id` 연결은 이미 **암묵적으로** 존재한다: 같은 `visitor_key`로 user_id가 NULL인 방문 뒤 user_id가 있는 방문이 기록된다. 단 로그인 후 첫 공개 경로 방문이 있어야 잡히고, 가입 시점과 시작 기능은 알 수 없다.

## 0-2 보완 방향 제안

- 지표는 SQL로 `visitor_key`·`user_id`를 조인해야 하므로 **자체 테이블**에 기록한다. GA4는 수집 OFF·서비스 user_id 미전송 정책이라 부적합하고, Vercel custom event는 SQL 조인이 불가하다.
- 방안: 기존 `product_events`를 재사용·확장한다(새 이벤트 테이블을 따로 만들지 않음). 필요한 변경은 새 마이그레이션 1개:
  - `event_name` CHECK에 부족 이벤트만 추가
  - `visitor_key`, `user_id`, `session_key`, `client`(web/app) 컬럼 추가, 기존 알림 이벤트 컬럼(`poster_status`, `region`, `category`, `cta_variant`)은 NOT NULL 해제 또는 기본값
  - 가입·로그인 시 `visitor_key → user_id` 연결 기록(`identity_link` 이벤트 또는 별도 `visitor_identity_links` 테이블)
- 클라이언트는 기존 `/api/alert-events` 패턴을 일반화한 단일 수집 API(서버가 세션에서 user_id 결정, 속성 allowlist)를 사용한다.
- `poster_view`는 기존 `poster_view_logs`에 `source` 컬럼만 추가하고 visitor_key를 통일한다.
- 마이그레이션은 작성만 하고 적용하지 않는다(승인 필요). 적용 전까지 API는 기존 `site-visits`처럼 컬럼/테이블 부재 시 조용히 실패하도록 둔다.

## 0-2·0-3 구현 결과 (브랜치 `feat/retention-stage0-measurement-20261031`)

| 지시서 이벤트                     | 구현                                                                                                                                          | 기록 위치                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `page_view`                       | 추가 없음 (기존 `site_visit_logs`)                                                                                                            | —                                          |
| `poster_view`                     | 기존 `poster_view_logs`에 `source` 추가. 카드 클릭(`data-poster-source`) → 공유 링크(`utm_campaign=pl_share`) → 직전 앱 내 경로 → referrer 순 | `poster_view_logs.source`                  |
| `favorite_add/remove`             | 상세 찜 토글 성공 시                                                                                                                          | `product_events`                           |
| `institution_follow`              | 팔로우/취소 성공 시 (`institution_unfollow` 별도)                                                                                             | `product_events.institution_id`            |
| `interest_save`                   | 온보딩 완료, 마이페이지 프로필 저장 (지역 id, 분야 개수)                                                                                      | `product_events`                           |
| `share_click`                     | 공유 성공 시 `native_share`/`link_copy`. 공유 시트 닫기는 실패로 보지 않음                                                                    | `product_events`                           |
| `signup_prompt_shown`             | 비회원 찜 시도, 비회원 기관 팔로우. 알림 CTA는 기존 `auth_modal_view` 유지                                                                    | `product_events`                           |
| `signup_start`                    | 로그인·가입 폼 제출, 카카오/Google 버튼, 알림 CTA 카카오 버튼. 시작 화면·기능은 직전 안내(1시간 유효) 또는 referrer                           | `product_events`                           |
| `signup_complete`                 | 로그인 세션 확인 시 서버 RPC가 계정 생성 24시간 이내·최초 1회만 기록                                                                          | `product_events` (계정당 1건 unique index) |
| `guest_merge`, `apply_status_set` | 이름만 허용 목록에 추가. 발생 지점은 2·3단계                                                                                                  | —                                          |
| `outbound_apply_click`            | 추가 없음 (기존 `poster_link_click_logs`)                                                                                                     | —                                          |

- 익명 식별자는 `posterlink.visitor_key` 하나로 통일했다. 공고 조회 기록도 같은 키를 쓴다(기존 `posterlink_visitor_key`는 방문 키가 없을 때만 승계).
- `visitor_key → user_id` 연결은 `visitor_identity_links`에 브라우저 저장소(웹/앱 WebView)마다 기록된다.
- 모든 쓰기는 `auth.uid()`로 user_id를 정하는 SECURITY DEFINER RPC를 쓴다. 클라이언트는 테이블을 직접 읽거나 쓸 수 없고, 새 사용자 요청 경로에 서비스 역할 키를 추가하지 않았다.
- GA4·Vercel Analytics에는 이벤트를 추가하지 않았다.
