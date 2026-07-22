UPDATE collection_sources
SET
  config_json = config_json
    || jsonb_build_object(
      'adapter', 'mapo-employ',
      'maxPages', 2
    ),
  notes = '마포구고용복지지원센터 Rhymix 게시판 전용 어댑터 연동',
  updated_at = now()
WHERE source_slug = 'mapo-employ';
