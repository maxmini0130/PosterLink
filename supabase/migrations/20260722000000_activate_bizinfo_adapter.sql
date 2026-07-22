-- Use the dedicated Bizinfo adapter for current support-project notice pages.

UPDATE collection_sources
SET
  list_url = 'https://www.bizinfo.go.kr/sii/siia/selectSIIA200View.do?null=&rows=15&cpage=1',
  collection_method = 'html',
  status = CASE
    WHEN status IN ('paused', 'retired') THEN status
    ELSE 'active'
  END,
  reliability = 'high',
  monthly_expected_posts = 120,
  config_json = jsonb_build_object(
    'site_ids', jsonb_build_array('bizinfo'),
    'adapter', 'bizinfo',
    'maxPages', 2,
    'boards', jsonb_build_array(
      jsonb_build_object(
        'name', '지원사업 공고',
        'url', 'https://www.bizinfo.go.kr/sii/siia/selectSIIA200View.do?null=&rows=15&cpage=1',
        'category', '지원사업',
        'maxPages', 2
      )
    )
  ),
  notes = '기업마당 지원사업 공고. selectSIIA200View/Detail 구조를 전용 어댑터로 수집한다.',
  updated_at = now()
WHERE source_slug = 'bizinfo';
