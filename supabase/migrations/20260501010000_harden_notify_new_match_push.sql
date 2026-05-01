ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_new_match_push_pending
  ON notifications (type, target_id, push_sent_at)
  WHERE type = 'new_match';

NOTIFY pgrst, 'reload schema';
