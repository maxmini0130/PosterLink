-- Enable JOB-ALIO public institution recruitment notices with a dedicated adapter.

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
  'job-alio',
  'JOB-ALIO',
  'public_employment',
  'national',
  '전국',
  'https://job.alio.go.kr',
  'https://job.alio.go.kr/recruit.do',
  'html',
  720,
  72,
  'active',
  'high',
  60,
  jsonb_build_object(
    'site_ids', jsonb_build_array('job-alio'),
    'adapter', 'job-alio',
    'maxPages', 3,
    'boards', jsonb_build_array(
      jsonb_build_object(
        'name', '공공기관 채용정보',
        'url', 'https://job.alio.go.kr/recruit.do',
        'category', '채용',
        'maxPages', 3
      )
    )
  ),
  'JOB-ALIO 공공기관 채용정보. 목록과 상세 HTML에서 채용조건, 기간, 응시자격, 첨부파일을 수집하며 로고/배너 이미지는 저장하지 않는다.'
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
