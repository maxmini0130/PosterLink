-- Mapo Labor Center uses javascript:Page.goView(seq) links on the list page.
-- Switch it to a dedicated adapter that converts those links into stable
-- /community/news/post?seq=... detail URLs.

UPDATE collection_sources
SET
  list_url = 'https://mapolabor.org/community/news',
  config_json = jsonb_build_object(
    'site_ids', jsonb_build_array('mapo-labor'),
    'adapter', 'mapo-labor',
    'maxPages', 2,
    'boards', jsonb_build_array(
      jsonb_build_object(
        'name', U&'\ACF5\C9C0\C0AC\D56D',
        'url', 'https://mapolabor.org/community/news',
        'category', U&'\B178\B3D9',
        'maxPages', 2
      )
    )
  ),
  last_run_status = null,
  consecutive_error_count = 0,
  last_error_message = null,
  notes = concat_ws(E'\n', NULLIF(notes, ''), '2026-07-23: Switched mapo-labor to dedicated adapter for javascript Page.goView list links.'),
  updated_at = now()
WHERE source_slug = 'mapo-labor';
