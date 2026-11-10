-- v6.1 stage 2 (docs/design/v6.1/SPEC.md 4.1): how much of a deadline is
-- confirmed, kept apart from the deadline value itself.
--
-- Additive only. Every new column is nullable or has a default, so the code
-- running in production today keeps reading and writing posters unchanged:
--   - deadline_status 'unverified', deadline_time_verified false and
--     reception_verified false claim nothing until a person or a source sets
--     them; screens that do not read them are unaffected.
--   - deadline_type gains 'per_session'. No row uses it until the data step
--     moves the per-session posters at the v6.1 release (current code reads an
--     unknown type as "일정 확인 필요", so that move waits for the new screens).
-- application_end_at stays the single deadline value. A date-only deadline is
-- stored at 23:59:59 Asia/Seoul; deadline_time_verified says whether the time
-- part was confirmed from the notice, poster or application page.
--
-- No policy change: the columns follow the existing posters RLS, and
-- search_public_posters returns SETOF posters, so readers get them as they are.

ALTER TABLE public.posters
  ADD COLUMN IF NOT EXISTS deadline_status TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS deadline_time_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deadline_source TEXT,
  ADD COLUMN IF NOT EXISTS deadline_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reception_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS session_rule_text TEXT,
  ADD COLUMN IF NOT EXISTS session_rule_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_session_deadline_date DATE,
  ADD COLUMN IF NOT EXISTS deadline_label TEXT,
  ADD COLUMN IF NOT EXISTS deadline_note TEXT,
  ADD COLUMN IF NOT EXISTS selection_notice_at TIMESTAMPTZ;

ALTER TABLE public.posters DROP CONSTRAINT IF EXISTS posters_deadline_status_check;
ALTER TABLE public.posters ADD CONSTRAINT posters_deadline_status_check
  CHECK (deadline_status IN ('verified', 'unverified', 'conflict'));

-- portal: the official portal's application-period field (date only).
-- notice / poster / apply_page: read by a person from that source.
-- legacy: a date kept from before 2026-11-10 (A-1); the date is shown, never a time.
ALTER TABLE public.posters DROP CONSTRAINT IF EXISTS posters_deadline_source_check;
ALTER TABLE public.posters ADD CONSTRAINT posters_deadline_source_check
  CHECK (deadline_source IS NULL OR deadline_source IN
    ('portal', 'notice', 'poster', 'apply_page', 'operator', 'legacy'));

-- A verified time needs a verified date and somewhere it was read from.
ALTER TABLE public.posters DROP CONSTRAINT IF EXISTS posters_deadline_time_verified_check;
ALTER TABLE public.posters ADD CONSTRAINT posters_deadline_time_verified_check
  CHECK (NOT deadline_time_verified OR (
    deadline_status = 'verified'
    AND application_end_at IS NOT NULL
    AND deadline_source IN ('notice', 'poster', 'apply_page', 'operator')
  ));

ALTER TABLE public.posters DROP CONSTRAINT IF EXISTS posters_deadline_text_length_check;
ALTER TABLE public.posters ADD CONSTRAINT posters_deadline_text_length_check
  CHECK (
    (session_rule_text IS NULL OR char_length(session_rule_text) BETWEEN 1 AND 60)
    AND (deadline_label IS NULL OR char_length(deadline_label) BETWEEN 1 AND 40)
    AND (deadline_note IS NULL OR char_length(deadline_note) BETWEEN 1 AND 80)
  );

-- Widen the existing type list; existing values stay valid.
ALTER TABLE public.posters DROP CONSTRAINT IF EXISTS posters_deadline_type_check;
ALTER TABLE public.posters ADD CONSTRAINT posters_deadline_type_check
  CHECK (deadline_type IN
    ('fixed', 'per_session', 'ongoing', 'until_exhausted', 'scheduled', 'unknown'));

-- Operator queue: published posters closing soon whose deadline is not confirmed.
CREATE INDEX IF NOT EXISTS posters_deadline_review_queue_idx
  ON public.posters (application_end_at)
  WHERE poster_status = 'published'
    AND (deadline_status <> 'verified' OR NOT deadline_time_verified);

COMMENT ON COLUMN public.posters.deadline_status IS
  'verified / unverified / conflict: whether the deadline date is confirmed (SPEC 4.1).';
COMMENT ON COLUMN public.posters.deadline_time_verified IS
  'True only when the time of application_end_at was read from the notice, poster or application page. A stored 23:59:59 alone means date only.';
COMMENT ON COLUMN public.posters.deadline_source IS
  'Where the deadline date (and time, if verified) was read: portal, notice, poster, apply_page, operator, legacy.';
COMMENT ON COLUMN public.posters.reception_verified IS
  'Whether open reception is confirmed. False shows 접수 여부 확인.';
COMMENT ON COLUMN public.posters.last_session_deadline_date IS
  'per_session: the last session''s application deadline. Never shown as the poster''s deadline.';

NOTIFY pgrst, 'reload schema';

-- Verification (read-only):
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'posters'
--      AND column_name IN ('deadline_status', 'deadline_time_verified', 'deadline_source',
--        'deadline_checked_at', 'reception_verified', 'session_rule_text',
--        'session_rule_verified', 'last_session_deadline_date', 'deadline_label',
--        'deadline_note', 'selection_notice_at');
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.posters'::regclass AND conname LIKE 'posters_deadline%';
--   SELECT deadline_status, deadline_time_verified, reception_verified, count(*)
--     FROM public.posters GROUP BY 1, 2, 3;   -- all 'unverified', false, false right after
--
-- Rollback (manual, after approval; drops only what this file added; run
-- only while no row uses deadline_type 'per_session'):
--   DROP INDEX IF EXISTS public.posters_deadline_review_queue_idx;
--   ALTER TABLE public.posters DROP CONSTRAINT IF EXISTS posters_deadline_type_check;
--   ALTER TABLE public.posters ADD CONSTRAINT posters_deadline_type_check
--     CHECK (deadline_type IN ('fixed', 'ongoing', 'until_exhausted', 'scheduled', 'unknown'));
--   ALTER TABLE public.posters
--     DROP CONSTRAINT IF EXISTS posters_deadline_text_length_check,
--     DROP CONSTRAINT IF EXISTS posters_deadline_time_verified_check,
--     DROP CONSTRAINT IF EXISTS posters_deadline_source_check,
--     DROP CONSTRAINT IF EXISTS posters_deadline_status_check,
--     DROP COLUMN IF EXISTS selection_notice_at, DROP COLUMN IF EXISTS deadline_note,
--     DROP COLUMN IF EXISTS deadline_label, DROP COLUMN IF EXISTS last_session_deadline_date,
--     DROP COLUMN IF EXISTS session_rule_verified, DROP COLUMN IF EXISTS session_rule_text,
--     DROP COLUMN IF EXISTS reception_verified, DROP COLUMN IF EXISTS deadline_checked_at,
--     DROP COLUMN IF EXISTS deadline_source, DROP COLUMN IF EXISTS deadline_time_verified,
--     DROP COLUMN IF EXISTS deadline_status;
