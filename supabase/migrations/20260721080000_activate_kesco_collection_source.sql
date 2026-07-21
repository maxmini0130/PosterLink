-- Enable KESCO notices with a dedicated form-board adapter.

INSERT INTO collection_sources (
  source_slug,
  name,
  source_type,
  region_scope,
  region_name,
  homepage_url,
  list_url,
  collection_method,
  collection_interval_minutes,
  priority,
  status,
  reliability,
  monthly_expected_posts,
  config_json,
  notes
) VALUES (
  'kesco',
  '한국전기안전공사',
  'other',
  'national',
  '전국',
  'https://www.kesco.or.kr',
  'https://www.kesco.or.kr/bbs/selectPageListBbs.do?bbs_code=MKB00001',
  'html',
  720,
  45,
  'active',
  'medium',
  8,
  jsonb_build_object(
    'site_ids', jsonb_build_array('kesco'),
    'adapter', 'kesco',
    'maxPages', 2,
    'boards', jsonb_build_array(
      jsonb_build_object(
        'name', '공지사항',
        'url', 'https://www.kesco.or.kr/bbs/selectPageListBbs.do?bbs_code=MKB00001',
        'category', '안전',
        'maxPages', 2
      )
    )
  ),
  '한국전기안전공사 KESCO 새소식 공지사항. fnDetail 기반 게시판을 전용 어댑터로 수집한다.'
)
ON CONFLICT (source_slug) DO UPDATE SET
  name = EXCLUDED.name,
  source_type = EXCLUDED.source_type,
  region_scope = EXCLUDED.region_scope,
  region_name = EXCLUDED.region_name,
  homepage_url = EXCLUDED.homepage_url,
  list_url = EXCLUDED.list_url,
  collection_method = EXCLUDED.collection_method,
  collection_interval_minutes = EXCLUDED.collection_interval_minutes,
  priority = EXCLUDED.priority,
  status = CASE
    WHEN collection_sources.status IN ('paused', 'retired') THEN collection_sources.status
    ELSE EXCLUDED.status
  END,
  reliability = EXCLUDED.reliability,
  monthly_expected_posts = EXCLUDED.monthly_expected_posts,
  config_json = EXCLUDED.config_json,
  notes = EXCLUDED.notes,
  updated_at = now();
