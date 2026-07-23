-- Fix collection sources that were returning empty results because their
-- board URLs or detail selectors changed.

UPDATE collection_sources
SET
  homepage_url = 'https://dietary4u.mfds.go.kr/mapo/',
  list_url = 'https://dietary4u.mfds.go.kr/board.es?mid=at0501000000&bid=AT07',
  config_json = jsonb_build_object(
    'site_ids', jsonb_build_array('mapo-kids-meal'),
    'adapter', 'ccfsm',
    'maxPages', 2,
    'boards', jsonb_build_array(
      jsonb_build_object(
        'name', '공지사항',
        'url', 'https://dietary4u.mfds.go.kr/board.es?mid=at0501000000&bid=AT07',
        'category', '급식',
        'maxPages', 2
      )
    )
  ),
  last_run_status = null,
  consecutive_error_count = 0,
  last_error_message = null,
  notes = COALESCE(notes, '') || E'\n2026-07-23: dietary4u.mfds.go.kr 신규 센터 사이트 공지사항 URL 및 ccfsm 전용 어댑터로 갱신.',
  updated_at = now()
WHERE source_slug = 'mapo-kids-meal';

UPDATE collection_sources
SET
  homepage_url = 'http://www.dhyouth.or.kr',
  list_url = 'http://www.dhyouth.or.kr/bbs/board.php?bo_table=notice',
  config_json = jsonb_build_object(
    'site_ids', jsonb_build_array('dohwa-youth'),
    'adapter', 'generic-board',
    'maxPages', 1,
    'selectors', jsonb_build_object(
      'detailTitle', jsonb_build_array('.notice_list .tit'),
      'detailContent', jsonb_build_array('#bo_v_con'),
      'detailDate', jsonb_build_array('.notice_list .date'),
      'detailImages', jsonb_build_array('#bo_v_con img'),
      'detailAttachments', jsonb_build_array(
        '.notice_view_cont a[href*="download"]',
        '.notice_view_cont a[href*="file"]'
      )
    ),
    'boards', jsonb_build_array(
      jsonb_build_object(
        'name', '공지사항',
        'url', 'http://www.dhyouth.or.kr/bbs/board.php?bo_table=notice',
        'category', '청소년',
        'maxPages', 1
      )
    )
  ),
  last_run_status = null,
  consecutive_error_count = 0,
  last_error_message = null,
  notes = COALESCE(notes, '') || E'\n2026-07-23: HTTPS 406 회피를 위해 HTTP 그누보드 공지사항 URL로 갱신하고 상세 selector 보정.',
  updated_at = now()
WHERE source_slug = 'dohwa-youth';

UPDATE collection_sources
SET
  homepage_url = 'http://www.mwyouth.org',
  list_url = 'http://www.mwyouth.org/board_facility',
  config_json = jsonb_build_object(
    'site_ids', jsonb_build_array('mangwon-youth'),
    'adapter', 'generic-board',
    'maxPages', 1,
    'selectors', jsonb_build_object(
      'detailTitle', jsonb_build_array('.top_area h1'),
      'detailContent', jsonb_build_array('.rd_body .xe_content'),
      'detailDate', jsonb_build_array('.top_area .date'),
      'detailImages', jsonb_build_array('.rd_body .xe_content img'),
      'detailAttachments', jsonb_build_array(
        '.rd_file a[href*="procFileDownload"]',
        'a[href*="download"]'
      )
    ),
    'boards', jsonb_build_array(
      jsonb_build_object(
        'name', '공지사항',
        'url', 'http://www.mwyouth.org/board_facility',
        'category', '청소년',
        'maxPages', 1
      )
    )
  ),
  last_run_status = null,
  consecutive_error_count = 0,
  last_error_message = null,
  notes = COALESCE(notes, '') || E'\n2026-07-23: HTTPS 406 회피를 위해 HTTP 시설공지사항 URL로 갱신하고 상세 selector 보정.',
  updated_at = now()
WHERE source_slug = 'mangwon-youth';
