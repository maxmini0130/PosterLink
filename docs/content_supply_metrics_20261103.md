# 주간 콘텐츠 공급 지표 쿼리 (2026-11-03)

재방문 지시서(`docs/RETENTION_PLAN_2026-10-31.md`) 0-5의 **콘텐츠 공급 지표 4종**과 팔로우 제안 효과를 주 1회 읽기 전용으로 조회하는 쿼리입니다. 수집 출처 추가와 직접 확보의 우선순위를 정하는 데 씁니다.

## 공통 정의

- **공개 공고**: `poster_status IN ('published','closed')`이고 `exposure_tier`가 비었거나 A·B인 공고. 공개 화면과 같은 기준입니다.
- **새 공고 시각**: `COALESCE(published_at, created_at)`. 날짜는 `Asia/Seoul` 기준입니다.
- **분야**: `field_verification.classification.primaryCategory`를 7+1 주 분야로 접습니다(`apps/web/lib/categoryTaxonomy.ts`의 `CONTENT_TYPE_INTEREST`와 같은 규칙).
- **서울**: `REG_SEOUL`과 그 아래 자치구. **마포**: `REG_SEOUL_MAPO`.
- **직접 확보**: `created_by`가 있는 공고(운영자 업로드·제보 반영). 크롤러 수집 공고는 `created_by`가 비어 있습니다.
- **청년 대상**: 저장된 대상 연령이 만 19~39세와 겹치거나, 연령 조건이 저장되지 않은 공고입니다. "연령 조건 없음"과 "연령 미확인"이 같은 값으로 저장돼 있어 C1은 실제보다 넓게 잡힐 수 있습니다.

모든 쿼리는 `SET default_transaction_read_only = on;` 후 `BEGIN TRANSACTION READ ONLY … ROLLBACK` 안에서 실행합니다.

## C1. 서울 청년 기준 최근 7일 새 공고 (분야별)

```sql
WITH seoul AS (
  SELECT r.id FROM regions r WHERE r.code = 'REG_SEOUL'
  UNION
  SELECT child.id FROM regions child JOIN regions parent ON parent.id = child.parent_id
  WHERE parent.code = 'REG_SEOUL'
), fresh AS (
  SELECT
    p.id,
    p.event_start_at,
    CASE p.field_verification->'classification'->>'primaryCategory'
      WHEN 'CAT_COURSE' THEN '교육·취업' WHEN 'CAT_RECRUITMENT' THEN '교육·취업' WHEN 'CAT_EDUCATION' THEN '교육·취업'
      WHEN 'CAT_EVENT_RECRUIT' THEN '문화·행사' WHEN 'CAT_CONTEST' THEN '문화·행사' WHEN 'CAT_CULTURE' THEN '문화·행사'
      WHEN 'CAT_SUPPORT_PROGRAM' THEN '지원금·복지' WHEN 'CAT_WELFARE' THEN '지원금·복지'
      WHEN 'CAT_HOUSING' THEN '주거·금융' WHEN 'CAT_BUSINESS' THEN '소상공인'
      WHEN 'CAT_FAMILY' THEN '육아·가족' WHEN 'CAT_HEALTH' THEN '건강·의료'
      ELSE '기타'
    END AS category
  FROM posters p
  WHERE p.poster_status IN ('published', 'closed')
    AND (p.exposure_tier IS NULL OR p.exposure_tier IN ('A', 'B'))
    AND COALESCE(p.published_at, p.created_at) >= now() - interval '7 days'
    AND (p.target_age_min IS NULL OR p.target_age_min <= 39)
    AND (p.target_age_max IS NULL OR p.target_age_max >= 19)
    AND EXISTS (
      SELECT 1 FROM poster_regions pr WHERE pr.poster_id = p.id AND pr.region_id IN (SELECT id FROM seoul)
    )
)
SELECT
  category AS 분야,
  count(*) AS 새_공고,
  count(*) FILTER (WHERE event_start_at IS NOT NULL) AS 진행일_있음
FROM fresh
GROUP BY category
ORDER BY count(*) DESC;
```

## C2. 마포구 관련 최근 7일 새 공고와 직접 확보 비율

```sql
SELECT
  count(*) AS 마포_새_공고,
  count(*) FILTER (WHERE p.created_by IS NOT NULL) AS 직접_확보,
  round(100.0 * count(*) FILTER (WHERE p.created_by IS NOT NULL) / NULLIF(count(*), 0), 1) AS 직접_확보_비율
FROM posters p
WHERE p.poster_status IN ('published', 'closed')
  AND (p.exposure_tier IS NULL OR p.exposure_tier IN ('A', 'B'))
  AND COALESCE(p.published_at, p.created_at) >= now() - interval '7 days'
  AND EXISTS (
    SELECT 1 FROM poster_regions pr JOIN regions r ON r.id = pr.region_id
    WHERE pr.poster_id = p.id AND r.code = 'REG_SEOUL_MAPO'
  );
```

## C3. 마지막 새 공고 이후 경과일 (30일 이상 빈 기관·분야)

기관은 실제 주관기관(`organizer_id`)과 게시 출처(`source_institution_id`) 중 어느 쪽으로든 연결된 공개 기관입니다. 결과의 `연결` 열로 구분합니다.

```sql
WITH public_posters AS (
  SELECT p.*, COALESCE(p.published_at, p.created_at) AS public_at
  FROM posters p
  WHERE p.poster_status IN ('published', 'closed')
    AND (p.exposure_tier IS NULL OR p.exposure_tier IN ('A', 'B'))
), by_institution AS (
  SELECT
    i.name,
    i.slug,
    CASE WHEN bool_or(pp.organizer_id = i.id) THEN '주관' WHEN bool_or(pp.source_institution_id = i.id) THEN '출처' ELSE '-' END AS link,
    max(pp.public_at) AS last_at
  FROM institutions i
  LEFT JOIN public_posters pp ON pp.organizer_id = i.id OR pp.source_institution_id = i.id
  WHERE i.is_public
  GROUP BY i.id, i.name, i.slug
)
SELECT
  '기관' AS 구분,
  name AS 이름,
  link AS 연결,
  (last_at AT TIME ZONE 'Asia/Seoul')::date AS 마지막_새_공고,
  CASE WHEN last_at IS NULL THEN NULL
       ELSE (now() AT TIME ZONE 'Asia/Seoul')::date - (last_at AT TIME ZONE 'Asia/Seoul')::date END AS 경과일
FROM by_institution
WHERE last_at IS NULL OR last_at < now() - interval '30 days'
UNION ALL
SELECT
  '분야',
  category,
  '-',
  (max(public_at) AT TIME ZONE 'Asia/Seoul')::date,
  (now() AT TIME ZONE 'Asia/Seoul')::date - (max(public_at) AT TIME ZONE 'Asia/Seoul')::date
FROM (
  SELECT
    public_at,
    CASE field_verification->'classification'->>'primaryCategory'
      WHEN 'CAT_COURSE' THEN '교육·취업' WHEN 'CAT_RECRUITMENT' THEN '교육·취업' WHEN 'CAT_EDUCATION' THEN '교육·취업'
      WHEN 'CAT_EVENT_RECRUIT' THEN '문화·행사' WHEN 'CAT_CONTEST' THEN '문화·행사' WHEN 'CAT_CULTURE' THEN '문화·행사'
      WHEN 'CAT_SUPPORT_PROGRAM' THEN '지원금·복지' WHEN 'CAT_WELFARE' THEN '지원금·복지'
      WHEN 'CAT_HOUSING' THEN '주거·금융' WHEN 'CAT_BUSINESS' THEN '소상공인'
      WHEN 'CAT_FAMILY' THEN '육아·가족' WHEN 'CAT_HEALTH' THEN '건강·의료'
      ELSE '기타'
    END AS category
  FROM public_posters
) c
GROUP BY category
HAVING max(public_at) < now() - interval '30 days'
ORDER BY 1, 5 DESC NULLS FIRST;
```

## C4. 홈 피드 카드 중 기본 이미지 비율

홈에 나올 수 있는 공고(지금 접수 중인 공개 공고)에서 기본 이미지로 그려지는 비율입니다. 홈과 같은 규칙입니다. 이미지가 없거나, 우리 Storage 사본이 아니거나(외부 원본은 사본 승인 전까지 기본 이미지), 저장된 가로·세로가 400px 미만이거나, 가로/세로 비가 1.9를 넘으면 기본 이미지로 셉니다. 치수 미확인은 원본으로 셉니다(홈과 동일). `poster_images.image_status`(마이그레이션 20261102020000)가 적용되면 `unsuitable`·`broken`·`missing`도 기본 이미지로 더합니다.

```sql
WITH open_posters AS (
  SELECT p.id, p.thumbnail_url
  FROM posters p
  WHERE p.poster_status = 'published'
    AND (p.exposure_tier IS NULL OR p.exposure_tier IN ('A', 'B'))
    AND (p.application_start_at IS NULL OR p.application_start_at <= now())
    AND (
      p.application_end_at >= now()
      OR (p.application_end_at IS NULL AND p.deadline_type IN ('ongoing', 'until_exhausted'))
    )
), judged AS (
  SELECT
    o.id,
    CASE
      WHEN o.thumbnail_url IS NULL OR btrim(o.thumbnail_url) = '' THEN 'missing'
      WHEN o.thumbnail_url !~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/' THEN 'external'
      WHEN i.width IS NOT NULL AND i.height IS NOT NULL
        AND (i.width < 400 OR i.height < 400 OR i.width::numeric / i.height > 1.9) THEN 'unsuitable'
      ELSE 'original'
    END AS kind
  FROM open_posters o
  LEFT JOIN LATERAL (
    SELECT pi.width, pi.height FROM poster_images pi
    WHERE pi.poster_id = o.id AND pi.storage_path = o.thumbnail_url
    ORDER BY pi.created_at LIMIT 1
  ) i ON true
)
SELECT
  count(*) AS 접수_중_공고,
  count(*) FILTER (WHERE kind <> 'original') AS 기본_이미지,
  round(100.0 * count(*) FILTER (WHERE kind <> 'original') / NULLIF(count(*), 0), 1) AS 기본_이미지_비율,
  count(*) FILTER (WHERE kind = 'missing') AS 이미지_없음,
  count(*) FILTER (WHERE kind = 'external') AS 외부_원본,
  count(*) FILTER (WHERE kind = 'unsuitable') AS 부적합
FROM judged;
```

## F1. 팔로우 제안 효과 (0-5, 마이그레이션 20261103010000 적용 후)

```sql
WITH shown AS (
  SELECT metadata_json->>'prompt_id' AS prompt_id, metadata_json->>'trigger' AS trigger,
         (metadata_json->>'logged_in')::boolean AS logged_in
  FROM product_events
  WHERE event_name = 'follow_prompt_shown' AND created_at >= now() - interval '7 days'
), outcome AS (
  SELECT metadata_json->>'prompt_id' AS prompt_id,
         bool_or(event_name = 'follow_prompt_click') AS clicked,
         bool_or(event_name = 'follow_prompt_dismiss') AS dismissed,
         bool_or(event_name = 'signup_start') AS signup_started,
         bool_or(event_name = 'institution_follow') AS followed
  FROM product_events
  WHERE metadata_json ? 'prompt_id' AND created_at >= now() - interval '8 days'
  GROUP BY 1
)
SELECT
  s.trigger AS 트리거,
  s.logged_in AS 회원,
  count(*) AS 노출,
  count(*) FILTER (WHERE o.clicked) AS 클릭,
  count(*) FILTER (WHERE o.dismissed) AS 거절,
  count(*) FILTER (WHERE o.signup_started) AS 가입_시작,
  count(*) FILTER (WHERE o.followed) AS 팔로우_완료,
  round(100.0 * count(*) FILTER (WHERE o.clicked) / NULLIF(count(*), 0), 1) AS 클릭률
FROM shown s LEFT JOIN outcome o USING (prompt_id)
GROUP BY 1, 2
ORDER BY 3 DESC;
```

팔로우한 사람의 7일 재방문율 비교는 `docs/retention_metrics_20261031.md` Q2의 사람 단위 재방문 정의에 `institution_follow` 여부를 나눔 조건으로 붙여 계산합니다.
