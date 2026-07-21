-- Normalize central collection sources and enable the first config-driven
-- national source that can be crawled without a custom adapter.

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
) VALUES
  (
    'bizinfo',
    '기업마당',
    'central_portal',
    'national',
    '전국',
    'https://www.bizinfo.go.kr',
    'https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/list.do',
    'html',
    360,
    95,
    'active',
    'high',
    120,
    jsonb_build_object(
      'site_ids', jsonb_build_array('bizinfo'),
      'adapter', 'generic-board',
      'maxPages', 2,
      'boards', jsonb_build_array(
        jsonb_build_object(
          'name', '지원사업 공고',
          'url', 'https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/list.do',
          'category', '지원사업',
          'pagination', jsonb_build_object(
            'pattern', 'https://www.bizinfo.go.kr/sii/siia/selectSIIA200View.do?null=&rows=15&cpage={page}'
          ),
          'selectors', jsonb_build_object(
            'listItem', 'table tbody tr',
            'listLink', 'a[href*=selectSIIA200Detail]',
            'listDate', 'td:nth-child(7)',
            'detailTitle', '.support_project_detail .title, .view_cont_wrap .title, .cont_tit, h4, h3, h2',
            'detailContent', '.support_project_detail, .view_cont_wrap, .view_cont, #contents, #content',
            'detailDate', '.support_project_detail, .view_cont_wrap, table',
            'detailImages', '.support_project_detail img, .view_cont_wrap img, #content img',
            'detailAttachments', '.attached_file_list a, a[href*=file], a[href*=download]'
          ),
          'urlFilters', jsonb_build_object(
            'sameHostOnly', true,
            'include', jsonb_build_array('selectSIIA200Detail'),
            'exclude', jsonb_build_array()
          )
        )
      )
    ),
    '중소기업·소상공인 지원사업 공고. HTML 목록과 상세가 안정적으로 수집되어 우선 활성화.'
  ),
  (
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
    'planned',
    'medium',
    80,
    jsonb_build_object(
      'adapter', 'generic-board',
      'maxPages', 1,
      'needsAdapter', true,
      'adapterNotes', '모집공고 목록이 초기 HTML에 충분히 노출되지 않아 API/스크립트 기반 어댑터 분석 필요'
    ),
    '창업지원사업 모집공고. 목록 API 확인 후 별도 어댑터 또는 API 수집으로 활성화 예정.'
  ),
  (
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
    'planned',
    'medium',
    80,
    jsonb_build_object(
      'adapter', 'generic-board',
      'maxPages', 1,
      'needsAdapter', true,
      'apiHints', jsonb_build_array(
        '/wrk/yrm/plcyMng/plcyMngFront',
        '/wrk/yrm/plcyInfo/comparisonPlcy/{plcyNo}?user=true&ajax=true',
        '/youthPolicy/ythPlcyTotalSearch/ythPlcyDetail/{plcyNo}?ajax=true'
      ),
      'adapterNotes', '정책 목록은 YTHIPcomm.ajax 기반으로 로드되어 HTML 파서가 아닌 API 어댑터가 적합'
    ),
    '청년 일자리·주거·교육·복지 정책 통합 정보. API 어댑터 구현 후 활성화 예정.'
  ),
  (
    'youth-seoul',
    '청년몽땅정보통',
    'central_portal',
    'sido',
    '서울특별시',
    'https://youth.seoul.go.kr',
    'https://youth.seoul.go.kr/infoData/sprtInfo/list.do?key=2309130006',
    'html',
    360,
    88,
    'active',
    'medium',
    100,
    jsonb_build_object(
      'site_ids', jsonb_build_array('youth-seoul'),
      'adapter', 'youth-seoul',
      'maxPages', 2,
      'boards', jsonb_build_array(
        jsonb_build_object(
          'name', '청년지원정보',
          'url', 'https://youth.seoul.go.kr/infoData/sprtInfo/list.do?key=2309130006',
          'category', '복지'
        )
      )
    ),
    '서울 청년지원정보. 기존 전용 어댑터를 사용하며 웹접근성/로고 이미지 제외 규칙 적용.'
  ),
  (
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
    'planned',
    'medium',
    60,
    jsonb_build_object(
      'adapter', 'generic-board',
      'maxPages', 1,
      'needsAdapter', true,
      'adapterNotes', '공공기관 채용은 PosterLink 게시 대상 여부를 별도 기준으로 검토한 뒤 활성화'
    ),
    '공공기관 채용공고. 채용 전체를 넣을지, 청년·교육·인턴 중심으로 제한할지 검토 필요.'
  ),
  (
    'data-portal',
    '공공데이터포털',
    'open_data',
    'national',
    '전국',
    'https://www.data.go.kr',
    'https://www.data.go.kr',
    'api',
    1440,
    65,
    'planned',
    'medium',
    0,
    jsonb_build_object(
      'adapter', 'manual',
      'needsAdapter', true,
      'adapterNotes', '기관별 OpenAPI 탐색/연결 후보 관리용 소스'
    ),
    '직접 공고 수집원이 아니라 기관별 API 탐색과 연결 후보 관리용.'
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
