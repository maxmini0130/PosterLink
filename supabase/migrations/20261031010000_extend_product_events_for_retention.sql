-- Retention stage 0: reuse product_events for the missing first-party events,
-- link anonymous visitor keys to accounts, and record poster-view sources.
-- Writes go through SECURITY DEFINER RPCs that derive user_id from auth.uid();
-- no request path needs the service role key.

-- 1. product_events: generic columns. Alert CTA rows keep their required fields.
ALTER TABLE product_events
  ALTER COLUMN poster_status DROP NOT NULL,
  ALTER COLUMN region DROP NOT NULL,
  ALTER COLUMN category DROP NOT NULL,
  ALTER COLUMN cta_variant DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visitor_key TEXT,
  ADD COLUMN IF NOT EXISTS session_key TEXT,
  ADD COLUMN IF NOT EXISTS client TEXT,
  ADD COLUMN IF NOT EXISTS institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL;

ALTER TABLE product_events DROP CONSTRAINT IF EXISTS product_events_event_name_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_event_name_check CHECK (event_name IN (
  -- existing closed-poster alert funnel
  'alert_cta_view',
  'alert_cta_click',
  'auth_modal_view',
  'login_complete',
  'alert_saved',
  'notification_sent',
  'notification_open',
  -- retention plan (page_view, poster_view and outbound_apply_click use existing logs)
  'favorite_add',
  'favorite_remove',
  'institution_follow',
  'institution_unfollow',
  'interest_save',
  'apply_status_set',
  'share_click',
  'signup_prompt_shown',
  'signup_start',
  'signup_complete',
  'guest_merge'
));

ALTER TABLE product_events ADD CONSTRAINT product_events_alert_fields_check CHECK (
  event_name NOT IN (
    'alert_cta_view', 'alert_cta_click', 'auth_modal_view', 'login_complete',
    'alert_saved', 'notification_sent', 'notification_open'
  )
  OR (poster_status IS NOT NULL AND region IS NOT NULL AND category IS NOT NULL AND cta_variant IS NOT NULL)
);

ALTER TABLE product_events ADD CONSTRAINT product_events_client_check
  CHECK (client IS NULL OR client IN ('web', 'app'));

CREATE INDEX IF NOT EXISTS product_events_visitor_created_at
  ON product_events (visitor_key, created_at DESC)
  WHERE visitor_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS product_events_user_created_at
  ON product_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- At most one signup_complete per account, even under concurrent web/app sessions.
CREATE UNIQUE INDEX IF NOT EXISTS product_events_signup_complete_once
  ON product_events (user_id)
  WHERE event_name = 'signup_complete';

-- 2. anonymous visitor key -> account. One row per (visitor, account) pair.
CREATE TABLE IF NOT EXISTS visitor_identity_links (
  visitor_key TEXT NOT NULL CHECK (char_length(visitor_key) BETWEEN 8 AND 120),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client TEXT NOT NULL CHECK (client IN ('web', 'app')),
  first_linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (visitor_key, user_id)
);

CREATE INDEX IF NOT EXISTS visitor_identity_links_user
  ON visitor_identity_links (user_id, first_linked_at);

ALTER TABLE visitor_identity_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE visitor_identity_links FROM anon, authenticated;

-- 3. poster_view_logs: where the detail view came from.
ALTER TABLE poster_view_logs
  ADD COLUMN IF NOT EXISTS source TEXT;

ALTER TABLE poster_view_logs DROP CONSTRAINT IF EXISTS poster_view_logs_source_check;
ALTER TABLE poster_view_logs ADD CONSTRAINT poster_view_logs_source_check CHECK (
  source IS NULL OR source IN (
    'search', 'home', 'related', 'institution', 'favorites', 'list',
    'notification', 'share', 'external', 'direct', 'other'
  )
);

-- 4. Event RPC. Callable by anon and authenticated; user_id is never taken from input.
CREATE OR REPLACE FUNCTION record_product_event(
  p_event_name TEXT,
  p_visitor_key TEXT,
  p_session_key TEXT DEFAULT NULL,
  p_client TEXT DEFAULT 'web',
  p_poster_id UUID DEFAULT NULL,
  p_institution_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT;
  v_value JSONB;
BEGIN
  -- signup_complete is only written by link_visitor_identity; alert events keep their API.
  IF p_event_name NOT IN (
    'favorite_add', 'favorite_remove', 'institution_follow', 'institution_unfollow',
    'interest_save', 'apply_status_set', 'share_click', 'signup_prompt_shown',
    'signup_start', 'guest_merge'
  ) THEN
    RAISE EXCEPTION 'unsupported event' USING ERRCODE = '22023';
  END IF;
  IF p_visitor_key IS NULL OR char_length(p_visitor_key) NOT BETWEEN 8 AND 120 THEN
    RAISE EXCEPTION 'invalid visitor key' USING ERRCODE = '22023';
  END IF;
  IF p_client NOT IN ('web', 'app') THEN
    RAISE EXCEPTION 'invalid client' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object'
     OR pg_column_size(COALESCE(p_metadata, '{}'::jsonb)) > 1024 THEN
    RAISE EXCEPTION 'invalid metadata' USING ERRCODE = '22023';
  END IF;
  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(COALESCE(p_metadata, '{}'::jsonb)) LOOP
    IF v_key NOT IN (
      'screen', 'feature', 'method', 'logged_in', 'channel', 'status', 'region_id',
      'category_count', 'previous_count', 'duplicate_count', 'success'
    ) OR jsonb_typeof(v_value) NOT IN ('string', 'boolean', 'number')
       OR (jsonb_typeof(v_value) = 'string' AND char_length(v_value #>> '{}') > 64) THEN
      RAISE EXCEPTION 'invalid metadata' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  INSERT INTO product_events (
    event_name, poster_id, institution_id, user_id, visitor_key, session_key, client, metadata_json
  ) VALUES (
    p_event_name,
    CASE WHEN EXISTS (SELECT 1 FROM posters WHERE id = p_poster_id) THEN p_poster_id END,
    CASE WHEN EXISTS (SELECT 1 FROM institutions WHERE id = p_institution_id) THEN p_institution_id END,
    auth.uid(),
    p_visitor_key,
    left(p_session_key, 120),
    p_client,
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION record_product_event(TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_product_event(TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB) TO anon, authenticated;

-- 5. Identity RPC. Called once per (browser storage, account). Records
-- signup_complete only for an account created within the last 24 hours that has
-- none yet, so existing members logging in after release are not counted.
-- Returns 'pending' (profile not created yet; caller retries), 'linked' or 'signup'.
CREATE OR REPLACE FUNCTION link_visitor_identity(
  p_visitor_key TEXT,
  p_session_key TEXT DEFAULT NULL,
  p_client TEXT DEFAULT 'web',
  p_screen TEXT DEFAULT NULL,
  p_feature TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_created_at TIMESTAMPTZ;
  v_inserted INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_visitor_key IS NULL OR char_length(p_visitor_key) NOT BETWEEN 8 AND 120 THEN
    RAISE EXCEPTION 'invalid visitor key' USING ERRCODE = '22023';
  END IF;
  IF p_client NOT IN ('web', 'app') THEN
    RAISE EXCEPTION 'invalid client' USING ERRCODE = '22023';
  END IF;
  -- profiles row may be created right after OAuth; skip until it exists.
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id) THEN
    RETURN 'pending';
  END IF;

  INSERT INTO visitor_identity_links (visitor_key, user_id, client)
  VALUES (p_visitor_key, v_user_id, p_client)
  ON CONFLICT (visitor_key, user_id) DO UPDATE SET last_linked_at = now();

  SELECT created_at INTO v_created_at FROM auth.users WHERE id = v_user_id;
  IF v_created_at IS NOT NULL AND v_created_at > now() - interval '24 hours' THEN
    INSERT INTO product_events (
      event_name, user_id, visitor_key, session_key, client, metadata_json
    ) VALUES (
      'signup_complete',
      v_user_id,
      p_visitor_key,
      left(p_session_key, 120),
      p_client,
      jsonb_strip_nulls(jsonb_build_object(
        'screen', CASE WHEN p_screen ~ '^[a-z_]{1,32}$' THEN p_screen END,
        'feature', CASE WHEN p_feature ~ '^[a-z_]{1,32}$' THEN p_feature END
      ))
    )
    ON CONFLICT (user_id) WHERE event_name = 'signup_complete' DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  RETURN CASE WHEN v_inserted > 0 THEN 'signup' ELSE 'linked' END;
END;
$$;

REVOKE ALL ON FUNCTION link_visitor_identity(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION link_visitor_identity(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Rollback (manual, after approval):
--   DROP FUNCTION IF EXISTS link_visitor_identity(TEXT, TEXT, TEXT, TEXT, TEXT);
--   DROP FUNCTION IF EXISTS record_product_event(TEXT, TEXT, TEXT, TEXT, UUID, UUID, JSONB);
--   DROP TABLE IF EXISTS visitor_identity_links;
--   ALTER TABLE poster_view_logs DROP CONSTRAINT IF EXISTS poster_view_logs_source_check, DROP COLUMN IF EXISTS source;
--   DROP INDEX IF EXISTS product_events_signup_complete_once, product_events_user_created_at, product_events_visitor_created_at;
--   ALTER TABLE product_events DROP CONSTRAINT IF EXISTS product_events_client_check,
--     DROP CONSTRAINT IF EXISTS product_events_alert_fields_check;
--   DELETE FROM product_events WHERE event_name NOT IN (<original 7>);  -- only after exporting the rows
--   restore the original event_name CHECK and NOT NULL columns, then drop the added columns.
