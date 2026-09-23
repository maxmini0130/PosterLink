-- Closed-poster alert CTA foundation.
-- Stores explicit region/category alert conditions, supports D-7 and D-1
-- deadline occurrences, and records every Expo delivery attempt.

CREATE TABLE alert_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  region_id UUID REFERENCES regions(id) ON DELETE RESTRICT,
  category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
  institution_id UUID REFERENCES public_institutions(id) ON DELETE CASCADE,
  source_poster_id UUID REFERENCES posters(id) ON DELETE SET NULL,
  cta_variant TEXT NOT NULL DEFAULT 'closed_poster_v1',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT alert_subscriptions_has_condition CHECK (
    (
      institution_id IS NOT NULL
      AND region_id IS NULL
      AND category_id IS NULL
    )
    OR
    (
      institution_id IS NULL
      AND (region_id IS NOT NULL OR category_id IS NOT NULL)
    )
  )
);

CREATE UNIQUE INDEX alert_subscriptions_unique_condition
  ON alert_subscriptions (user_id, region_id, category_id, institution_id)
  NULLS NOT DISTINCT;

CREATE INDEX alert_subscriptions_active_user
  ON alert_subscriptions (user_id, is_active, created_at DESC);

CREATE INDEX alert_subscriptions_active_region_category
  ON alert_subscriptions (region_id, category_id)
  WHERE is_active = true;

CREATE TRIGGER set_alert_subscriptions_updated_at
  BEFORE UPDATE ON alert_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE alert_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alert_subscriptions_own_select"
  ON alert_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "alert_subscriptions_own_insert"
  ON alert_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "alert_subscriptions_own_update"
  ON alert_subscriptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "alert_subscriptions_own_delete"
  ON alert_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

ALTER TABLE notifications
  ADD COLUMN deadline_offset_days SMALLINT,
  ADD COLUMN push_discarded_at TIMESTAMPTZ,
  ADD COLUMN push_discard_reason TEXT,
  ADD CONSTRAINT notifications_deadline_offset_days_check
    CHECK (deadline_offset_days IS NULL OR deadline_offset_days IN (1, 7));

CREATE UNIQUE INDEX notifications_unique_deadline_occurrence
  ON notifications (user_id, target_id, deadline_offset_days)
  WHERE type = 'favorite_deadline' AND deadline_offset_days IS NOT NULL;

CREATE UNIQUE INDEX notifications_unique_new_match
  ON notifications (user_id, target_id)
  WHERE type = 'new_match';

CREATE TABLE notification_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('expo_push')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  provider_ticket_id TEXT,
  error_code TEXT,
  error_message TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX notification_delivery_logs_notification_attempted
  ON notification_delivery_logs (notification_id, attempted_at DESC);

CREATE INDEX notification_delivery_logs_failed_attempted
  ON notification_delivery_logs (attempted_at DESC)
  WHERE status = 'failed';

ALTER TABLE notification_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_delivery_logs_own_select"
  ON notification_delivery_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM notifications n
      WHERE n.id = notification_delivery_logs.notification_id
        AND n.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION enqueue_new_match_notifications(p_poster_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_poster posters%ROWTYPE;
BEGIN
  SELECT * INTO v_poster
  FROM posters
  WHERE id = p_poster_id
    AND poster_status = 'published';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  WITH RECURSIVE
    poster_region_ancestors(id) AS (
      SELECT pr.region_id
      FROM poster_regions pr
      WHERE pr.poster_id = v_poster.id
      UNION
      SELECT r.parent_id
      FROM regions r
      JOIN poster_region_ancestors pra ON pra.id = r.id
      WHERE r.parent_id IS NOT NULL
    ),
    poster_category_ancestors(id) AS (
      SELECT pc.category_id
      FROM poster_categories pc
      WHERE pc.poster_id = v_poster.id
      UNION
      SELECT c.parent_id
      FROM categories c
      JOIN poster_category_ancestors pca ON pca.id = c.id
      WHERE c.parent_id IS NOT NULL
    ),
    subscription_matches AS (
      SELECT DISTINCT subscription.user_id
      FROM alert_subscriptions subscription
      JOIN profiles profile ON profile.id = subscription.user_id
      LEFT JOIN regions subscription_region ON subscription_region.id = subscription.region_id
      WHERE subscription.is_active = true
        AND profile.is_notified = true
        AND subscription.user_id IS DISTINCT FROM v_poster.created_by
        AND subscription.institution_id IS NULL
        AND (
          subscription.region_id IS NULL
          OR subscription_region.level = 'nation'
          OR subscription.region_id IN (SELECT id FROM poster_region_ancestors)
        )
        AND (
          subscription.category_id IS NULL
          OR subscription.category_id IN (SELECT id FROM poster_category_ancestors)
        )
    ),
    legacy_interest_matches AS (
      SELECT DISTINCT profile.id AS user_id
      FROM profiles profile
      WHERE profile.is_notified = true
        AND profile.id IS DISTINCT FROM v_poster.created_by
        AND profile.primary_region_id IS NOT NULL
        AND profile.primary_region_id IN (SELECT id FROM poster_region_ancestors)
        AND EXISTS (
          SELECT 1
          FROM user_interest_categories interest
          WHERE interest.user_id = profile.id
            AND interest.category_id IN (SELECT id FROM poster_category_ancestors)
        )
    ),
    institution_matches AS (
      SELECT DISTINCT follow.user_id
      FROM institution_follows follow
      JOIN profiles profile ON profile.id = follow.user_id
      WHERE profile.is_notified = true
        AND follow.user_id IS DISTINCT FROM v_poster.created_by
        AND follow.institution_id IN (
          v_poster.source_institution_id,
          v_poster.organizer_id,
          v_poster.application_institution_id
        )
      UNION
      SELECT DISTINCT subscription.user_id
      FROM alert_subscriptions subscription
      JOIN profiles profile ON profile.id = subscription.user_id
      WHERE subscription.is_active = true
        AND profile.is_notified = true
        AND subscription.user_id IS DISTINCT FROM v_poster.created_by
        AND subscription.institution_id IN (
          v_poster.source_institution_id,
          v_poster.organizer_id,
          v_poster.application_institution_id
        )
    ),
    matched_users AS (
      SELECT user_id, false AS institution_match FROM subscription_matches
      UNION
      SELECT user_id, false AS institution_match FROM legacy_interest_matches
      UNION
      SELECT user_id, true AS institution_match FROM institution_matches
    ),
    rolled_up_matches AS (
      SELECT user_id, bool_or(institution_match) AS institution_match
      FROM matched_users
      GROUP BY user_id
    )
    INSERT INTO notifications (user_id, type, title, body, target_type, target_id)
    SELECT
      match.user_id,
      'new_match',
      CASE WHEN match.institution_match THEN '팔로우 기관 새 공고' ELSE '새 포스터 알림' END,
      CASE
        WHEN match.institution_match THEN '팔로우한 기관에서 새 공고가 등록됐어요: ' || v_poster.title
        ELSE '알림 조건과 맞는 새 공고가 등록됐어요: ' || v_poster.title
      END,
      'poster',
      v_poster.id
    FROM rolled_up_matches match
    WHERE NOT EXISTS (
      SELECT 1
      FROM notifications notification
      WHERE notification.user_id = match.user_id
        AND notification.type = 'new_match'
        AND notification.target_id = v_poster.id
    )
    ON CONFLICT (user_id, target_id) WHERE type = 'new_match' DO NOTHING;

  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION notify_new_match_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.poster_status IS DISTINCT FROM 'published' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM enqueue_new_match_notifications(NEW.id);
  ELSIF OLD.poster_status IS DISTINCT FROM 'published'
     OR OLD.source_institution_id IS DISTINCT FROM NEW.source_institution_id
     OR OLD.organizer_id IS DISTINCT FROM NEW.organizer_id
     OR OLD.application_institution_id IS DISTINCT FROM NEW.application_institution_id THEN
    PERFORM enqueue_new_match_notifications(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notify_new_match_on_relation_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM enqueue_new_match_notifications(NEW.poster_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_match ON posters;
CREATE TRIGGER trg_notify_new_match
  AFTER INSERT OR UPDATE ON posters
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_match_on_publish();

DROP TRIGGER IF EXISTS trg_notify_new_match_on_poster_category ON poster_categories;
CREATE TRIGGER trg_notify_new_match_on_poster_category
  AFTER INSERT ON poster_categories
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_match_on_relation_insert();

DROP TRIGGER IF EXISTS trg_notify_new_match_on_poster_region ON poster_regions;
CREATE TRIGGER trg_notify_new_match_on_poster_region
  AFTER INSERT ON poster_regions
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_match_on_relation_insert();

REVOKE EXECUTE ON FUNCTION public.enqueue_new_match_notifications(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_new_match_on_publish() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_new_match_on_relation_insert() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
