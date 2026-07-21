-- Fix Mapo Senior Welfare Center notice board id.

UPDATE collection_sources
SET
  list_url = 'https://mapocare.or.kr/bbs/board.php?bo_table=0401',
  config_json = jsonb_build_object(
    'site_ids', jsonb_build_array('mapo-senior'),
    'adapter', 'generic-board',
    'maxPages', 2,
    'boards', jsonb_build_array(
      jsonb_build_object(
        'name', '공지사항',
        'url', 'https://mapocare.or.kr/bbs/board.php?bo_table=0401',
        'category', '노인복지'
      )
    )
  ),
  notes = COALESCE(notes, '') || E'\n2026-07-21: mapocare.or.kr 공지사항 bo_table=0401 URL로 갱신.',
  updated_at = now()
WHERE source_slug = 'mapo-senior';
