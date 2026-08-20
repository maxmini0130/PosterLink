-- PDF 개편 5단계: 기관 팔로우를 신규 공고 알림과 개인화 추천 점수에 연결한다.
-- 실제 주최기관과 수집 출처 기관을 구분하되, 팔로우 알림은 확인된 기관 FK 중 하나라도 맞을 때만 생성한다.

CREATE INDEX IF NOT EXISTS idx_posters_public_institution_recent
  ON posters(poster_status, source_institution_id, organizer_id, application_institution_id, created_at DESC);

CREATE OR REPLACE FUNCTION notify_new_match_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_ids UUID[];
  v_region_ids UUID[];
BEGIN
  IF NEW.poster_status = 'published' AND (OLD.poster_status IS DISTINCT FROM 'published') THEN

    SELECT ARRAY_AGG(category_id) INTO v_category_ids
    FROM poster_categories WHERE poster_id = NEW.id;

    SELECT ARRAY_AGG(region_id) INTO v_region_ids
    FROM poster_regions WHERE poster_id = NEW.id;

    WITH matched_users AS (
      SELECT
        p.id AS user_id,
        EXISTS (
          SELECT 1
          FROM institution_follows follow
          WHERE follow.user_id = p.id
            AND follow.institution_id IN (
              NEW.source_institution_id,
              NEW.organizer_id,
              NEW.application_institution_id
            )
        ) AS institution_matches,
        (
          (v_category_ids IS NOT NULL AND EXISTS (
            SELECT 1 FROM user_interest_categories uic
            WHERE uic.user_id = p.id AND uic.category_id = ANY(v_category_ids)
          ))
          OR
          (v_region_ids IS NOT NULL AND p.primary_region_id = ANY(v_region_ids))
        ) AS interest_matches
      FROM profiles p
      WHERE p.id IS DISTINCT FROM NEW.created_by
        AND p.is_notified = true
    )
    INSERT INTO notifications (user_id, type, title, body, target_type, target_id)
    SELECT
      user_id,
      'new_match',
      CASE
        WHEN institution_matches THEN '팔로우 기관 새 공고'
        ELSE '새 포스터 알림'
      END,
      CASE
        WHEN institution_matches THEN '팔로우한 기관에서 새 공고가 등록됐어요: ' || NEW.title
        ELSE '관심 분야·지역에 새 포스터가 등록됐어요: ' || NEW.title
      END,
      'poster',
      NEW.id
    FROM matched_users
    WHERE (institution_matches OR interest_matches)
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.user_id = matched_users.user_id
          AND n.type = 'new_match'
          AND n.target_id = NEW.id
      );

  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_match ON posters;
CREATE TRIGGER trg_notify_new_match
  AFTER UPDATE ON posters
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_match_on_publish();

DROP FUNCTION IF EXISTS get_recommended_posters(uuid, integer);
CREATE OR REPLACE FUNCTION get_recommended_posters(
    p_user_id UUID,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    source_org_name TEXT,
    summary_short TEXT,
    poster_status TEXT,
    application_end_at TIMESTAMPTZ,
    thumbnail_url TEXT,
    created_at TIMESTAMPTZ,
    recom_score FLOAT
) AS $$
BEGIN
    RETURN QUERY
    WITH user_interests AS (
        SELECT category_id FROM user_interest_categories WHERE user_id = p_user_id
    ),
    followed_institutions AS (
        SELECT institution_id FROM institution_follows WHERE user_id = p_user_id
    )
    SELECT
        p.id,
        p.title,
        p.source_org_name,
        p.summary_short,
        p.poster_status::TEXT,
        p.application_end_at,
        p.thumbnail_url,
        p.created_at,
        (
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM followed_institutions fi
                    WHERE fi.institution_id IN (
                        p.source_institution_id,
                        p.organizer_id,
                        p.application_institution_id
                    )
                ) THEN 45.0
                ELSE 0.0
            END
            +
            COALESCE(MAX(
                CASE
                    WHEN pr.region_id = (SELECT primary_region_id FROM profiles WHERE profiles.id = p_user_id) THEN 50.0
                    WHEN r.level = 'nation' THEN 10.0
                    ELSE 0.0
                END
            ), 0.0)
            +
            COALESCE(MAX(
                CASE
                    WHEN pc.category_id IN (SELECT category_id FROM user_interests) THEN 30.0
                    ELSE 0.0
                END
            ), 0.0)
            +
            CASE
                WHEN p.application_end_at IS NOT NULL
                     AND p.application_end_at > now()
                     AND p.application_end_at - now() < interval '7 days' THEN 20.0
                ELSE 0.0
            END
        ) AS recom_score
    FROM posters p
    LEFT JOIN poster_regions pr ON p.id = pr.poster_id
    LEFT JOIN regions r ON pr.region_id = r.id
    LEFT JOIN poster_categories pc ON p.id = pc.poster_id
    WHERE p.poster_status = 'published'
      AND (p.application_end_at IS NULL OR p.application_end_at > now())
    GROUP BY p.id, p.title, p.source_org_name, p.summary_short,
             p.poster_status, p.application_end_at, p.thumbnail_url, p.created_at
    ORDER BY recom_score DESC, p.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
