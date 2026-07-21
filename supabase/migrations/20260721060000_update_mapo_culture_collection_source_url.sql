-- Fix Mapo Culture Center board URL. The HTTPS certificate does not match mapocc.or.kr.

UPDATE collection_sources
SET
  homepage_url = 'http://www.mapocc.or.kr',
  list_url = 'http://www.mapocc.or.kr/bbs/board1',
  config_json = jsonb_build_object(
    'site_ids', jsonb_build_array('mapo-culture'),
    'adapter', 'generic-board',
    'maxPages', 2,
    'boards', jsonb_build_array(
      jsonb_build_object(
        'name', '공지사항',
        'url', 'http://www.mapocc.or.kr/bbs/board1',
        'category', '문화',
        'selectors', jsonb_build_object(
          'listItem', 'table tbody tr, .gallery_list li, .basic_board li, .board_list li, li',
          'listLink', 'a[href]'
        ),
        'urlFilters', jsonb_build_object(
          'sameHostOnly', true,
          'include', jsonb_build_array('/bbs/board1', '/bbs_shop/read.htm', 'board1/')
        )
      )
    )
  ),
  notes = COALESCE(notes, '') || E'\n2026-07-21: mapocc.or.kr 인증서 불일치를 피하기 위해 HTTP 공지사항 URL로 갱신.',
  updated_at = now()
WHERE source_slug = 'mapo-culture';
