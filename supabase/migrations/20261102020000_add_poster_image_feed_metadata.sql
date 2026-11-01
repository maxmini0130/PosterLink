-- Poster feed metadata, unapplied to production. Existing width/height are
-- retained for old readers. NULL status means not inspected, never "ok".
ALTER TABLE public.poster_images
  ADD COLUMN IF NOT EXISTS image_width integer,
  ADD COLUMN IF NOT EXISTS image_height integer,
  ADD COLUMN IF NOT EXISTS image_status text;
ALTER TABLE public.poster_images
  ADD CONSTRAINT poster_images_feed_width_check CHECK (image_width IS NULL OR image_width > 0),
  ADD CONSTRAINT poster_images_feed_height_check CHECK (image_height IS NULL OR image_height > 0),
  ADD CONSTRAINT poster_images_feed_status_check CHECK (image_status IS NULL OR image_status IN ('ok','missing','unsuitable','broken'));
COMMENT ON COLUMN public.poster_images.image_status IS 'Feed suitability; NULL is uninspected. Does not override human poster verification.';
-- No backfill, grants or RLS changes. No deletion or original image copying.
-- Rollback after approval: drop the three constraints then the three new columns.
