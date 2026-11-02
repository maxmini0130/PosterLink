-- Screen plan v1.0 (2026-11-01) section 09 "운영 종료": public open search
-- and its count leave out posters whose event already ended, matching
-- getPosterApplicationState in apps/web/lib/posterApplication.ts.
--
-- Only the open branch (p_include_closed = false) changes. Signatures, owners
-- and grants stay as they are (CREATE OR REPLACE keeps the ACL).
-- Base definitions: production pg_get_functiondef, read 2026-11-01.
--
-- Rollback: run both CREATE OR REPLACE statements again without the added
-- "AND NOT (poster.event_end_at ...)" block.

CREATE OR REPLACE FUNCTION public.search_public_posters(p_query text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_region_ids uuid[] DEFAULT NULL::uuid[], p_include_closed boolean DEFAULT false, p_sort text DEFAULT 'latest'::text, p_limit integer DEFAULT 240)
 RETURNS SETOF posters
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT poster.*
  FROM public.posters AS poster
  WHERE (
      poster.poster_status = 'published'
      OR (p_include_closed AND poster.poster_status = 'closed')
    )
    AND (poster.exposure_tier IS NULL OR poster.exposure_tier IN ('A', 'B'))
    AND (
      p_include_closed
      OR (
        (poster.application_start_at IS NULL OR poster.application_start_at <= now())
        AND (
          poster.application_end_at >= now()
          OR (poster.application_end_at IS NULL AND poster.deadline_type IN ('ongoing', 'until_exhausted'))
        )
        -- Screen plan v1.0 section 09: an event or course whose last day has
        -- passed (Asia/Seoul) is not open, unless a fixed application
        -- deadline is still ahead (a verified later session).
        AND NOT (
          poster.event_end_at IS NOT NULL
          AND (poster.event_end_at AT TIME ZONE 'Asia/Seoul')::date
            < (now() AT TIME ZONE 'Asia/Seoul')::date
          AND NOT (
            poster.deadline_type = 'fixed'
            AND poster.application_end_at IS NOT NULL
          )
        )
      )
    )
    AND (
      NULLIF(BTRIM(p_query), '') IS NULL
      OR poster.title ILIKE '%' || BTRIM(p_query) || '%'
      OR poster.source_org_name ILIKE '%' || BTRIM(p_query) || '%'
      OR poster.summary_short ILIKE '%' || BTRIM(p_query) || '%'
    )
    AND (
      p_category_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.poster_categories AS category_link
        WHERE category_link.poster_id = poster.id
          AND category_link.category_id = p_category_id
      )
    )
    AND (
      p_region_ids IS NULL
      OR cardinality(p_region_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM public.poster_regions AS region_link
        WHERE region_link.poster_id = poster.id
          AND region_link.region_id = ANY(p_region_ids)
      )
    )
  ORDER BY
    CASE WHEN p_sort = 'deadline' THEN poster.application_end_at END ASC NULLS LAST,
    CASE WHEN p_sort <> 'deadline' THEN poster.created_at END DESC NULLS LAST,
    poster.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 240), 1), 500);
$function$;

CREATE OR REPLACE FUNCTION public.count_public_posters(p_query text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_region_ids uuid[] DEFAULT NULL::uuid[], p_include_closed boolean DEFAULT false)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::INTEGER
  FROM public.posters AS poster
  WHERE (
      poster.poster_status = 'published'
      OR (p_include_closed AND poster.poster_status = 'closed')
    )
    AND (poster.exposure_tier IS NULL OR poster.exposure_tier IN ('A', 'B'))
    AND (
      p_include_closed
      OR (
        (poster.application_start_at IS NULL OR poster.application_start_at <= now())
        AND (
          poster.application_end_at >= now()
          OR (poster.application_end_at IS NULL AND poster.deadline_type IN ('ongoing', 'until_exhausted'))
        )
        -- Screen plan v1.0 section 09: an event or course whose last day has
        -- passed (Asia/Seoul) is not open, unless a fixed application
        -- deadline is still ahead (a verified later session).
        AND NOT (
          poster.event_end_at IS NOT NULL
          AND (poster.event_end_at AT TIME ZONE 'Asia/Seoul')::date
            < (now() AT TIME ZONE 'Asia/Seoul')::date
          AND NOT (
            poster.deadline_type = 'fixed'
            AND poster.application_end_at IS NOT NULL
          )
        )
      )
    )
    AND (
      NULLIF(BTRIM(p_query), '') IS NULL
      OR poster.title ILIKE '%' || BTRIM(p_query) || '%'
      OR poster.source_org_name ILIKE '%' || BTRIM(p_query) || '%'
      OR poster.summary_short ILIKE '%' || BTRIM(p_query) || '%'
    )
    AND (
      p_category_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.poster_categories AS category_link
        WHERE category_link.poster_id = poster.id
          AND category_link.category_id = p_category_id
      )
    )
    AND (
      p_region_ids IS NULL
      OR cardinality(p_region_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM public.poster_regions AS region_link
        WHERE region_link.poster_id = poster.id
          AND region_link.region_id = ANY(p_region_ids)
      )
    );
$function$;
