-- Enable K-Startup with a dedicated text-notice crawler adapter.

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
  'k-startup',
  'K-Startup',
  'startup',
  'national',
  '전국',
  'https://www.k-startup.go.kr',
  'https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do',
  'html',
  360,
  92,
  'active',
  'high',
  80,
  jsonb_build_object(
    'site_ids', jsonb_build_array('k-startup'),
    'adapter', 'k-startup',
    'maxPages', 2,
    'boards', jsonb_build_array(
      jsonb_build_object(
        'name', '사업공고 모집중',
        'url', 'https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do',
        'category', '창업',
        'maxPages', 2
      )
    )
  ),
  'K-Startup 창업지원포털 모집중 사업공고. 상세 페이지의 텍스트, 신청 URL, 첨부파일을 수집하며 로고/웹접근성 이미지는 저장하지 않는다.'
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
