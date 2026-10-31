# 재방문·가입 전환 지표 정의와 조회 쿼리 (2026-10-31)

[RETENTION_PLAN_2026-10-31.md](RETENTION_PLAN_2026-10-31.md) 0-5·0-6 산출물. 데이터 원천은 [0-1 측정 현황](retention_stage0_measurement_audit_20261031.md)과 마이그레이션 `20261031010000_extend_product_events_for_retention.sql`(**미적용**)이다. 아래 쿼리는 모두 읽기 전용 SELECT이며, 마이그레이션 적용 전에는 `visitor_identity_links`·신규 이벤트를 쓰는 쿼리가 실패하거나 빈 결과를 낸다.

## 데이터 원천

| 지표 재료           | 테이블                                                                                                 | 비고                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 방문                | `site_visit_logs`                                                                                      | `visitor_key`, `session_key`, 로그인 시 `user_id`. 2026-07-18 수집 시작                                 |
| 익명 → 계정 연결    | `visitor_identity_links` (신규)                                                                        | 브라우저 저장소(웹·앱 WebView 각각)별 `visitor_key` ↔ `user_id`. 로그인 세션이 확인될 때마다 1회 upsert |
| 가입 완료·시작 기능 | `product_events.signup_complete` (신규)                                                                | 계정 생성 24시간 이내 첫 세션에서 1회. `metadata_json.screen`/`feature`                                 |
| 가입 시작           | `product_events.signup_start` (신규)                                                                   | 로그인·가입 버튼/폼 제출 시점. 기존 회원 로그인도 포함되므로 완료와 함께 해석                           |
| 가입 안내 노출      | `product_events.signup_prompt_shown` (신규) + 기존 `auth_modal_view`                                   | 종료 공고 알림 CTA는 기존 이벤트를 그대로 사용                                                          |
| 찜·구독·관심 조건   | `favorites`, `institution_follows`, `product_events.favorite_add`·`institution_follow`·`interest_save` | 찜·구독 테이블은 해제 시 행이 사라지므로 이벤트와 합쳐 "첫 행동"을 계산                                 |
| 공고 조회 출처      | `poster_view_logs.source` (신규 컬럼)                                                                  | search/home/related/institution/favorites/list/notification/share/external/direct/other                 |
| 신청 이동           | `poster_link_click_logs`                                                                               | 기존                                                                                                    |

시간 경계는 모두 `Asia/Seoul` 날짜로 계산한다. 운영자·관리자·봇·자동화 방문은 `actor_type IN ('visitor', 'member') AND NOT is_automated`로 제외한다.

## 지표 정의

### 사람 단위

- 회원: `user_id`. 비회원: `visitor_key`. 비회원 키가 나중에 계정과 연결되면 그 키의 과거 방문도 해당 계정으로 합친다(가장 먼저 연결된 계정 기준).
- **한계**: 비회원은 기기·브라우저·앱 WebView가 바뀌거나 브라우저 저장소를 지우면 다른 사람으로 집계된다. 같은 사람이 웹과 앱을 함께 써도 로그인 전에는 2명이다. 시크릿 모드·저장소 차단 브라우저는 방문마다 새 키가 생겨 신규 방문자가 과다 집계될 수 있다. 한 브라우저에서 여러 계정으로 로그인하면 그 키의 비회원 기록은 첫 연결 계정에 귀속된다.

### 7일/30일 재방문율

- 첫 방문: 사람별 최초 `site_visit_logs.created_at`.
- 재방문: 첫 방문 시각부터 7일(30일) 이내, **첫 방문과 다른 KST 날짜**의 방문이 1회 이상.
- 분모: 첫 방문 후 7일(30일)이 **이미 지난** 사람만. 관찰 기간이 끝나지 않은 사람은 제외한다.
- 수집 시작일(2026-07-18) 직후의 "첫 방문"은 실제로는 기존 방문자일 수 있으므로, 비교 구간은 수집 시작 30일 이후 코호트부터 쓴다.

### 활성 가입자

- 가입 후 **찜·기관 구독·관심 조건 저장 중 하나 이상**을 완료한 회원.
- 가입 시각은 `auth.users.created_at`. 시작 화면·기능은 `signup_complete` 이벤트(마이그레이션 적용 이후 가입자만 존재).
- 온보딩에서 관심 지역·분야를 저장하면 관심 조건 저장으로 본다(`interest_save` screen=`onboarding`). 온보딩이 사실상 필수인 현 구조에서는 이 기준만으로 대부분이 활성으로 잡힐 수 있으므로, **온보딩 제외 활성 가입자**도 함께 본다.

### 변경 전후 비교

- [release-markers.md](release-markers.md)의 운영 반영 시각 이전/이후 첫 방문 코호트를 비교한다. 같은 요일 구성의 주 단위 코호트로 비교하고, 관찰 기간이 끝난 코호트만 쓴다.

## 조회 쿼리

### Q1. 주별 첫 방문 코호트의 7일·30일 재방문율

```sql
WITH visits AS (
  SELECT
    v.created_at,
    (v.created_at AT TIME ZONE 'Asia/Seoul')::date AS kst_day,
    COALESCE(v.user_id::text, link.user_id::text, 'v:' || v.visitor_key) AS person
  FROM site_visit_logs v
  LEFT JOIN LATERAL (
    SELECT l.user_id
    FROM visitor_identity_links l
    WHERE l.visitor_key = v.visitor_key
    ORDER BY l.first_linked_at
    LIMIT 1
  ) link ON true
  WHERE v.actor_type IN ('visitor', 'member') AND NOT v.is_automated
),
firsts AS (
  SELECT person, min(created_at) AS first_at
  FROM visits
  GROUP BY person
),
flags AS (
  SELECT
    f.person,
    f.first_at,
    (f.first_at AT TIME ZONE 'Asia/Seoul')::date AS first_day,
    bool_or(v.kst_day > (f.first_at AT TIME ZONE 'Asia/Seoul')::date
            AND v.created_at < f.first_at + interval '7 days') AS r7,
    bool_or(v.kst_day > (f.first_at AT TIME ZONE 'Asia/Seoul')::date
            AND v.created_at < f.first_at + interval '30 days') AS r30
  FROM firsts f
  JOIN visits v USING (person)
  GROUP BY f.person, f.first_at
)
SELECT
  date_trunc('week', first_day)::date AS cohort_week,
  count(*) AS new_people,
  count(*) FILTER (WHERE first_at <= now() - interval '7 days') AS eligible_7d,
  round(100.0 * count(*) FILTER (WHERE r7 AND first_at <= now() - interval '7 days')
    / NULLIF(count(*) FILTER (WHERE first_at <= now() - interval '7 days'), 0), 1) AS revisit_7d_pct,
  count(*) FILTER (WHERE first_at <= now() - interval '30 days') AS eligible_30d,
  round(100.0 * count(*) FILTER (WHERE r30 AND first_at <= now() - interval '30 days')
    / NULLIF(count(*) FILTER (WHERE first_at <= now() - interval '30 days'), 0), 1) AS revisit_30d_pct
FROM flags
GROUP BY 1
ORDER BY 1;
```

### Q2. 가입자, 활성 가입자, 그들의 7일·30일 재방문율

`:since`는 비교 시작 시각(예: `'2026-11-01 00:00+09'`).

```sql
WITH signups AS (
  SELECT
    u.id AS user_id,
    u.created_at,
    sc.metadata_json ->> 'screen' AS start_screen,
    sc.metadata_json ->> 'feature' AS start_feature
  FROM auth.users u
  JOIN profiles p ON p.id = u.id AND p.role::text = 'user'
  LEFT JOIN product_events sc
    ON sc.event_name = 'signup_complete' AND sc.user_id = u.id
  WHERE u.created_at >= :since
),
actions AS (
  SELECT user_id, created_at AS at, 'favorite' AS kind FROM favorites
  UNION ALL
  SELECT user_id, created_at, 'favorite' FROM product_events WHERE event_name = 'favorite_add'
  UNION ALL
  SELECT user_id, created_at, 'follow' FROM institution_follows
  UNION ALL
  SELECT user_id, created_at, 'follow' FROM product_events WHERE event_name = 'institution_follow'
  UNION ALL
  SELECT user_id, created_at,
    CASE WHEN metadata_json ->> 'screen' = 'onboarding' THEN 'interest_onboarding' ELSE 'interest' END
  FROM product_events WHERE event_name = 'interest_save'
),
activation AS (
  SELECT
    s.user_id,
    min(a.at) AS first_action_at,
    min(a.at) FILTER (WHERE a.kind <> 'interest_onboarding') AS first_non_onboarding_action_at
  FROM signups s
  JOIN actions a ON a.user_id = s.user_id AND a.at >= s.created_at
  GROUP BY s.user_id
),
member_visits AS (
  SELECT COALESCE(v.user_id, l.user_id) AS user_id, v.created_at
  FROM site_visit_logs v
  LEFT JOIN visitor_identity_links l ON l.visitor_key = v.visitor_key AND v.user_id IS NULL
  WHERE v.actor_type IN ('visitor', 'member') AND NOT v.is_automated
),
returns AS (
  SELECT
    s.user_id,
    bool_or(mv.created_at < s.created_at + interval '7 days'
      AND (mv.created_at AT TIME ZONE 'Asia/Seoul')::date > (s.created_at AT TIME ZONE 'Asia/Seoul')::date) AS r7,
    bool_or(mv.created_at < s.created_at + interval '30 days'
      AND (mv.created_at AT TIME ZONE 'Asia/Seoul')::date > (s.created_at AT TIME ZONE 'Asia/Seoul')::date) AS r30
  FROM signups s
  LEFT JOIN member_visits mv ON mv.user_id = s.user_id
  GROUP BY s.user_id
)
SELECT
  count(*) AS signups,
  count(a.user_id) AS active_signups,
  count(a.first_non_onboarding_action_at) AS active_signups_excluding_onboarding,
  count(*) FILTER (WHERE a.user_id IS NOT NULL AND s.created_at <= now() - interval '7 days') AS active_eligible_7d,
  round(100.0 * count(*) FILTER (WHERE a.user_id IS NOT NULL AND r.r7 AND s.created_at <= now() - interval '7 days')
    / NULLIF(count(*) FILTER (WHERE a.user_id IS NOT NULL AND s.created_at <= now() - interval '7 days'), 0), 1) AS active_revisit_7d_pct,
  count(*) FILTER (WHERE a.user_id IS NOT NULL AND s.created_at <= now() - interval '30 days') AS active_eligible_30d,
  round(100.0 * count(*) FILTER (WHERE a.user_id IS NOT NULL AND r.r30 AND s.created_at <= now() - interval '30 days')
    / NULLIF(count(*) FILTER (WHERE a.user_id IS NOT NULL AND s.created_at <= now() - interval '30 days'), 0), 1) AS active_revisit_30d_pct
FROM signups s
LEFT JOIN activation a USING (user_id)
LEFT JOIN returns r USING (user_id);
```

`profiles.role`이 enum이므로 `::text`로 비교한다. 운영자·관리자 계정은 제외된다.

### Q3. 가입 시작 화면·기능별 전환

```sql
SELECT
  metadata_json ->> 'screen' AS screen,
  metadata_json ->> 'feature' AS feature,
  count(*) FILTER (WHERE event_name = 'signup_prompt_shown') AS prompts,
  count(*) FILTER (WHERE event_name = 'signup_start') AS starts,
  count(*) FILTER (WHERE event_name = 'signup_complete') AS completes
FROM product_events
WHERE event_name IN ('signup_prompt_shown', 'signup_start', 'signup_complete')
  AND created_at >= :since
GROUP BY 1, 2
ORDER BY completes DESC, starts DESC;
-- 종료 공고 알림 CTA 노출은 기존 auth_modal_view(익명, 시작 기능 = alert)로 별도 집계한다.
```

### Q4. 가입 전 비회원 행동이 가입으로 이어졌는지

```sql
WITH first_link AS (
  SELECT DISTINCT ON (user_id) user_id, visitor_key, client, first_linked_at
  FROM visitor_identity_links
  ORDER BY user_id, first_linked_at
)
SELECT
  fl.client,
  count(*) AS linked_accounts,
  count(*) FILTER (WHERE pre.visits > 0) AS with_anonymous_visits_before,
  round(avg(pre.visits), 1) AS avg_anonymous_visits_before,
  count(*) FILTER (WHERE pre.prompts > 0) AS saw_signup_prompt_before
FROM first_link fl
JOIN product_events sc ON sc.event_name = 'signup_complete' AND sc.user_id = fl.user_id
CROSS JOIN LATERAL (
  SELECT
    (SELECT count(*) FROM site_visit_logs v
      WHERE v.visitor_key = fl.visitor_key AND v.user_id IS NULL AND v.created_at < fl.first_linked_at) AS visits,
    (SELECT count(*) FROM product_events e
      WHERE e.visitor_key = fl.visitor_key AND e.event_name = 'signup_prompt_shown' AND e.created_at < fl.first_linked_at) AS prompts
) pre
GROUP BY fl.client;
```

### Q5. 공고 조회 출처와 신청 이동

```sql
SELECT
  COALESCE(v.source, 'unknown') AS source,
  count(*) AS poster_views,
  count(DISTINCT v.visitor_key) AS viewers
FROM poster_view_logs v
WHERE v.created_at >= :since
GROUP BY 1
ORDER BY 2 DESC;
-- source가 NULL인 행은 마이그레이션 적용 전 기록 또는 구버전 클라이언트다.
```

### 검증 쿼리 (마이그레이션 적용 직후, 읽기 전용)

```sql
SELECT conname FROM pg_constraint
WHERE conrelid IN ('product_events'::regclass, 'poster_view_logs'::regclass)
ORDER BY conname;
SELECT has_table_privilege('anon', 'visitor_identity_links', 'SELECT') AS anon_can_read_links,
       has_table_privilege('authenticated', 'product_events', 'SELECT') AS auth_can_read_events,
       has_function_privilege('anon', 'link_visitor_identity(text,text,text,text,text)', 'EXECUTE') AS anon_can_link;
-- 기대값: 세 값 모두 false
SELECT event_name, count(*) FROM product_events
WHERE created_at > now() - interval '1 day' GROUP BY 1 ORDER BY 1;
```

## 0-6 개인정보처리방침 반영 문안 제안 (적용하지 않음)

현재 공개 방침(A)의 "자동 수집: 서비스 이용 기록, 검색 기록, 접속 로그"는 범위가 넓지만, 브라우저 식별자와 계정 연결은 명시돼 있지 않다. GA4용 B 초안([privacy_policy_ga4_b_draft.md](privacy_policy_ga4_b_draft.md))과 별개로 아래 문구 추가를 제안한다. 법률 검토와 게시 승인 전에는 적용하지 않는다.

1. 수집 항목 — 자동 수집
   > 서비스 이용 기록(방문 화면, 공고 조회와 조회 경로, 찜·기관 팔로우·관심 조건 저장·공유·로그인 시작 등 이용 행태), 검색 기록, 접속 로그, 이용 기기의 브라우저 저장소에 생성되는 무작위 방문자 식별자, 로그인 시 해당 식별자와 회원 계정의 연결 기록
2. 이용 목적
   > 서비스 개선을 위한 통계 분석(재방문, 가입 전후 이용 흐름, 기능별 이용 현황 분석)
3. 쿠키·자동 수집 장치
   > 서비스는 방문 통계와 이용 흐름 분석을 위해 브라우저 저장소(localStorage·sessionStorage)에 무작위 식별자와 직전 화면 정보를 저장합니다. 이 값에는 이름·연락처 등 직접 식별 정보가 들어 있지 않으며, 브라우저 설정에서 사이트 데이터를 삭제하면 지워집니다. 앱과 웹 브라우저는 저장소가 분리되어 각각 생성됩니다.
4. 보유 기간 — **결정 필요**

   > 이용 행태 기록과 식별자 연결 기록은 수집일로부터 ○개월 보관 후 파기합니다. 회원 탈퇴 시 계정과의 연결 기록은 삭제되고, 이용 행태 기록의 계정 연결은 해제됩니다.

   현재 `site_visit_logs` 등 기존 로그도 자동 파기 작업이 없다. 기간(예: 13개월)과 파기 배치 구현을 함께 결정해야 한다. 탈퇴 시 `visitor_identity_links`는 `ON DELETE CASCADE`, `product_events.user_id`는 `SET NULL`로 마이그레이션에 반영돼 있다.
