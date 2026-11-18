-- 서대문50플러스센터 강좌(수강신청) 목록을 수집원으로 등록한다 (2026-11-19).
--
-- 크롤러 사이트 `sdm-50plus`(scripts/crawler/src/sites.js, 어댑터
-- `50plus-education`)와 source_slug가 같아 수집 실행 통계가 이 행에 기록된다.
-- 수집 출처는 서울시50플러스포털이고, 강좌 주관기관(서대문50플러스센터)은
-- 어댑터가 목록의 '기관' 열로 확인해 포스터별로 따로 저장한다.
-- 새 공고는 모두 검수 대기(poster_status = review)로 들어간다.
--
-- 롤백: DELETE FROM collection_sources WHERE source_slug = 'sdm-50plus';
-- (collection_source_runs 의 이 수집원 실행 이력도 ON DELETE CASCADE 로 함께 지워진다.)

INSERT INTO collection_sources (
  source_slug, name, source_type, region_scope, region_name,
  homepage_url, list_url, collection_method, collection_interval_minutes,
  priority, status, reliability, monthly_expected_posts, config_json, notes
) VALUES (
  'sdm-50plus',
  '서대문50플러스센터 강좌(서울시50플러스포털)',
  'foundation',
  'sigungu',
  '서울특별시 서대문구',
  'https://www.50plus.or.kr/sdm/index.do',
  'https://www.50plus.or.kr/sdm/education.do',
  'html',
  1440,
  60,
  'active',
  'medium',
  15,
  jsonb_build_object(
    'site_ids', jsonb_build_array('sdm-50plus'),
    'adapter', '50plus-education',
    'boards', jsonb_build_array(
      jsonb_build_object(
        'name', '서대문50플러스센터 수강신청',
        'url', 'https://www.50plus.or.kr/sdm/education.do',
        'category', '교육'
      )
    )
  ),
  '2026-11-19 목록·상세 실사이트 확인. 모집중(state=JOIN) 목록 전체 + 전체 목록 3쪽. 강좌 id(education-detail.do?id=)가 공고 식별자. 신청마감 강좌는 새로 만들지 않고 기존 게시 포스터만 마감 처리.'
)
ON CONFLICT (source_slug) DO NOTHING;
