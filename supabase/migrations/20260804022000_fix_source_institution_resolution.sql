-- 게시 화면의 담당기관명과 실제 수집 출처가 다른 경우에도
-- source_key의 공식 URL을 collection_sources와 대조해 출처 기관을 연결한다.

CREATE OR REPLACE FUNCTION posterlink_url_host(input_url TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN NULLIF(BTRIM(input_url), '') ~* '^https?://'
    THEN LOWER(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          SPLIT_PART(REGEXP_REPLACE(BTRIM(input_url), '^https?://', '', 'i'), '/', 1),
          '^www\.',
          '',
          'i'
        ),
        ':\d+$',
        ''
      )
    )
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION posterlink_url_directory(input_url TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN NULLIF(BTRIM(input_url), '') ~* '^https?://'
    THEN REGEXP_REPLACE(
      REGEXP_REPLACE(LOWER(BTRIM(input_url)), '[?#].*$', ''),
      '/[^/]*$',
      '/'
    )
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION resolve_poster_source_institution(
  poster_source_org_name TEXT,
  poster_source_key TEXT
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH source_input AS (
    SELECT
      LOWER(NULLIF(BTRIM(poster_source_org_name), '')) AS normalized_name,
      LOWER(NULLIF(BTRIM(poster_source_key), '')) AS normalized_key,
      posterlink_url_host(poster_source_key) AS source_host
  ),
  ranked_sources AS (
    SELECT
      source.institution_id,
      source.source_slug,
      source.status,
      source_input.normalized_name = LOWER(BTRIM(source.name)) AS exact_name_match,
      COALESCE(
        source_input.normalized_key LIKE posterlink_url_directory(source.list_url) || '%',
        false
      ) AS directory_match,
      GREATEST(
        COALESCE(LENGTH(posterlink_url_directory(source.list_url)), 0),
        COALESCE(LENGTH(posterlink_url_directory(source.homepage_url)), 0)
      ) AS directory_length,
      source_input.source_host IS NOT NULL
        AND source_input.source_host IN (
          posterlink_url_host(source.list_url),
          posterlink_url_host(source.homepage_url)
        ) AS host_match,
      SUM(
        CASE
          WHEN source_input.source_host IS NOT NULL
            AND source_input.source_host IN (
              posterlink_url_host(source.list_url),
              posterlink_url_host(source.homepage_url)
            )
          THEN 1
          ELSE 0
        END
      ) OVER () AS host_match_count
    FROM collection_sources AS source
    CROSS JOIN source_input
    WHERE source.institution_id IS NOT NULL
      AND source.status <> 'retired'
  )
  SELECT institution_id
  FROM ranked_sources
  WHERE exact_name_match
    OR directory_match
    OR (host_match AND host_match_count = 1)
  ORDER BY
    exact_name_match DESC,
    directory_match DESC,
    directory_length DESC,
    (status = 'active') DESC,
    source_slug
  LIMIT 1;
$$;

COMMENT ON FUNCTION resolve_poster_source_institution(TEXT, TEXT) IS
  '담당기관명, 출처 URL 경로, 단일 호스트 순으로 실제 게시 출처 기관을 결정한다.';

CREATE OR REPLACE FUNCTION sync_poster_source_institution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.source_institution_id := resolve_poster_source_institution(
    NEW.source_org_name,
    NEW.source_key
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_poster_source_institution ON posters;
CREATE TRIGGER trg_sync_poster_source_institution
  BEFORE INSERT OR UPDATE OF source_org_name, source_key ON posters
  FOR EACH ROW
  EXECUTE FUNCTION sync_poster_source_institution();

CREATE OR REPLACE FUNCTION sync_verified_poster_institutions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_organizer_id UUID;
  resolved_application_id UUID;
  resolved_source_id UUID;
BEGIN
  IF NEW.verification_status <> 'verified' THEN
    RETURN NEW;
  END IF;

  resolved_organizer_id := ensure_verified_institution(NEW.organizer_name);
  resolved_application_id := ensure_verified_institution(NEW.application_organization_name);
  resolved_source_id := resolve_poster_source_institution(
    NEW.source_org_name,
    NEW.source_key
  );

  UPDATE posters
  SET
    organizer_id = resolved_organizer_id,
    source_institution_id = resolved_source_id,
    application_institution_id = resolved_application_id
  WHERE id = NEW.id
    AND (
      organizer_id IS DISTINCT FROM resolved_organizer_id
      OR source_institution_id IS DISTINCT FROM resolved_source_id
      OR application_institution_id IS DISTINCT FROM resolved_application_id
    );

  RETURN NEW;
END;
$$;

UPDATE posters
SET source_institution_id = resolve_poster_source_institution(
  source_org_name,
  source_key
)
WHERE verification_status <> 'verified'
  AND source_institution_id IS DISTINCT FROM resolve_poster_source_institution(
    source_org_name,
    source_key
  );

