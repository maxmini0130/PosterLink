-- Enable the Ontong Youth policy API source with the dedicated adapter.

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
  'youthcenter',
  '온통청년',
  'central_portal',
  'national',
  '전국',
  'https://www.youthcenter.go.kr',
  'https://www.youthcenter.go.kr/youthPolicy/ythPlcyTotalSearch',
  'api',
  360,
  90,
  'active',
  'high',
  80,
  jsonb_build_object(
    'site_ids', jsonb_build_array('youthcenter'),
    'adapter', 'youthcenter',
    'maxPages', 2,
    'pageSize', 9,
    'apiParams', jsonb_build_object(
      'sortFields', 'DATE/DESC',
      'searchFields', 'all'
    ),
    'boards', jsonb_build_array(
      jsonb_build_object(
        'name', '청년정책 통합검색',
        'url', 'https://www.youthcenter.go.kr/youthPolicy/ythPlcyTotalSearch',
        'category', '청년정책',
        'pageSize', 9,
        'apiParams', jsonb_build_object(
          'sortFields', 'DATE/DESC',
          'searchFields', 'all'
        )
      )
    )
  ),
  '온통청년 정책 통합검색 API 기반 수집원. 이미지가 없는 정책형 공고는 텍스트 공고로 검수 대기에 적재한다.'
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
