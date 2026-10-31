-- Retention plan 3-1: the person's own record on a favorite ("신청했어요"),
-- kept apart from the poster's reception status. A poster closing never
-- changes it. Existing rows become 'interested'.
--
-- No policy change: favorites_all (FOR ALL USING auth.uid() = user_id) already
-- limits reads and updates to the owner.

ALTER TABLE favorites
  ADD COLUMN IF NOT EXISTS user_status TEXT NOT NULL DEFAULT 'interested',
  ADD COLUMN IF NOT EXISTS user_status_updated_at TIMESTAMPTZ;

ALTER TABLE favorites DROP CONSTRAINT IF EXISTS favorites_user_status_check;
ALTER TABLE favorites ADD CONSTRAINT favorites_user_status_check
  CHECK (user_status IN ('interested', 'applied'));

COMMENT ON COLUMN favorites.user_status IS
  'Set by the user, not derived from the poster: interested (찜) or applied (신청했어요).';

NOTIFY pgrst, 'reload schema';

-- Rollback (manual, after approval; marks are lost):
--   ALTER TABLE favorites DROP CONSTRAINT IF EXISTS favorites_user_status_check,
--     DROP COLUMN IF EXISTS user_status_updated_at, DROP COLUMN IF EXISTS user_status;
