-- Home v5 (UI plan 3-4 C-0, poster feed instruction 7, 10, 12, 13, 14).
-- FILE ONLY: apply locally/PGlite. Production apply and any backfill need approval.
--
-- 1. Card facts: one short benefit line, its kind and the event schedule shape.
--    Extracted at collection time; evidence and review state live in
--    field_verification->'cardFacts'. Unverified values stay hidden from cards
--    until card_facts_status is 'verified' or an extraction is confirmed.
-- 2. featured_week: the KST Monday of the week an operator picked the poster
--    for "이번 주 눈여겨볼 공고".
-- 3. poster_regions.basis: why a poster carries a region (venue, eligibility,
--    institution location, or only related). NULL = not classified yet.
-- 4. product_events: follow prompt, feed impression and section attributes.
-- All additions are nullable or defaulted; existing readers are unaffected.

ALTER TABLE posters
  ADD COLUMN IF NOT EXISTS benefit_summary TEXT
    CHECK (benefit_summary IS NULL OR char_length(benefit_summary) BETWEEN 1 AND 20),
  ADD COLUMN IF NOT EXISTS benefit_kind TEXT
    CHECK (benefit_kind IS NULL OR benefit_kind IN (
      'free', 'grant', 'prize', 'service', 'paid', 'experience'
    )),
  ADD COLUMN IF NOT EXISTS event_schedule_kind TEXT
    CHECK (event_schedule_kind IS NULL OR event_schedule_kind IN (
      'single', 'range', 'recurring', 'unknown'
    )),
  ADD COLUMN IF NOT EXISTS card_facts_status TEXT
    CHECK (card_facts_status IS NULL OR card_facts_status IN (
      'needs_review', 'verified', 'rejected'
    )),
  ADD COLUMN IF NOT EXISTS featured_week DATE
    CHECK (featured_week IS NULL OR EXTRACT(ISODOW FROM featured_week) = 1);

COMMENT ON COLUMN posters.benefit_summary IS
  'Card line 2: one confirmed key fact, 20 chars max (무료, 월 최대 20만원, 참가비 1만원). Evidence in field_verification.cardFacts.';
COMMENT ON COLUMN posters.benefit_kind IS
  'free=no cost, grant=money/voucher support, prize=contest award, service=free service or loan, paid=participant pays, experience=program content only.';
COMMENT ON COLUMN posters.event_schedule_kind IS
  'Shape of event_start_at/event_end_at: single day, range (multi-day/period), recurring sessions, unknown.';
COMMENT ON COLUMN posters.card_facts_status IS
  'Review state of benefit_summary/benefit_kind/event_schedule_kind. needs_review values are not shown on cards.';
COMMENT ON COLUMN posters.featured_week IS
  'KST Monday of the week an operator picked this poster for the home pick section.';

CREATE INDEX IF NOT EXISTS idx_posters_featured_week
  ON posters(featured_week)
  WHERE featured_week IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posters_card_facts_review
  ON posters(card_facts_status, created_at DESC)
  WHERE card_facts_status = 'needs_review';

ALTER TABLE poster_regions
  ADD COLUMN IF NOT EXISTS basis TEXT
    CHECK (basis IS NULL OR basis IN ('venue', 'eligibility', 'institution', 'related'));

COMMENT ON COLUMN poster_regions.basis IS
  'venue=event place, eligibility=applicant residence confirmed, institution=organizer location, related=keyword only. NULL=unclassified (shown as 관련).';

-- Pick auto-fill: 7-day favorite/view totals per public poster. Aggregates only
-- (no visitor, user or session values), so anon may read it through the RPC
-- without opening the underlying log tables.
CREATE OR REPLACE FUNCTION public_poster_popularity_7d(p_poster_ids UUID[])
RETURNS TABLE (poster_id UUID, favorites_7d INTEGER, views_7d INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    (SELECT count(*)::int FROM favorites f
      WHERE f.poster_id = p.id AND f.created_at >= now() - interval '7 days'),
    (SELECT count(*)::int FROM poster_view_logs v
      WHERE v.poster_id = p.id AND v.created_at >= now() - interval '7 days')
  FROM posters p
  WHERE p.id = ANY (p_poster_ids[1:500])
    AND p.poster_status = 'published'
    AND (p.exposure_tier IS NULL OR p.exposure_tier IN ('A', 'B'));
$$;

REVOKE ALL ON FUNCTION public_poster_popularity_7d(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_poster_popularity_7d(UUID[]) TO anon, authenticated;

-- 4. Events. Keep the retention set and add the home v5 / follow prompt names.
ALTER TABLE product_events DROP CONSTRAINT IF EXISTS product_events_event_name_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_event_name_check CHECK (event_name IN (
  'alert_cta_view',
  'alert_cta_click',
  'auth_modal_view',
  'login_complete',
  'alert_saved',
  'notification_sent',
  'notification_open',
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
  'guest_merge',
  -- 2026-11-03
  'follow_prompt_shown',
  'follow_prompt_click',
  'follow_prompt_dismiss',
  'feed_card_impression',
  'feed_card_click'
));

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
    'signup_start', 'guest_merge',
    'follow_prompt_shown', 'follow_prompt_click', 'follow_prompt_dismiss',
    'feed_card_impression', 'feed_card_click'
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
      'category_count', 'previous_count', 'duplicate_count', 'success',
      -- 2026-11-03
      'prompt_id', 'trigger', 'section_id', 'position', 'image_kind'
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

NOTIFY pgrst, 'reload schema';

-- Verification (read-only):
--   SELECT count(*) FILTER (WHERE benefit_summary IS NOT NULL), count(*) FILTER (WHERE featured_week IS NOT NULL) FROM posters;
--   SELECT basis, count(*) FROM poster_regions GROUP BY 1;
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'product_events_event_name_check';
-- Rollback (manual, after approval; export the new event rows first):
--   DELETE FROM product_events WHERE event_name IN ('follow_prompt_shown','follow_prompt_click','follow_prompt_dismiss','feed_card_impression','feed_card_click');
--   re-run section 4 of 20261031010000_extend_product_events_for_retention.sql (constraint + record_product_event);
--   DROP FUNCTION IF EXISTS public_poster_popularity_7d(UUID[]);
--   ALTER TABLE poster_regions DROP COLUMN IF EXISTS basis;
--   DROP INDEX IF EXISTS idx_posters_featured_week, idx_posters_card_facts_review;
--   ALTER TABLE posters DROP COLUMN IF EXISTS featured_week, DROP COLUMN IF EXISTS card_facts_status,
--     DROP COLUMN IF EXISTS event_schedule_kind, DROP COLUMN IF EXISTS benefit_kind, DROP COLUMN IF EXISTS benefit_summary;
