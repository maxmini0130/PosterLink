-- 서울특별시 기관에 분야별 새소식 게시판을 추가한다.
-- 별도 기관을 만들지 않고 기존 서울특별시 수집 채널과 기관 정본을 재사용한다.

WITH source_update AS (
  SELECT
    id,
    COALESCE(
      (
        SELECT JSONB_AGG(board)
        FROM JSONB_ARRAY_ELEMENTS(COALESCE(config_json -> 'boards', '[]'::jsonb)) AS board
        WHERE board ->> 'url' NOT IN (
          'https://www.seoul.go.kr/news/news_notice.do',
          'https://www.seoul.go.kr/news/news_notice.do?bbsNo=277',
          'https://www.seoul.go.kr/realmnews/in/list.do'
        )
      ),
      '[]'::jsonb
    ) AS existing_boards
  FROM collection_sources
  WHERE source_slug = 'seoul-city'
)
UPDATE collection_sources AS source
SET
  monthly_expected_posts = GREATEST(source.monthly_expected_posts, 30),
  config_json = JSONB_SET(
    COALESCE(source.config_json, '{}'::jsonb),
    '{boards}',
    source_update.existing_boards || JSONB_BUILD_ARRAY(
      JSONB_BUILD_OBJECT(
        'name', '공고/고시',
        'url', 'https://www.seoul.go.kr/news/news_notice.do?bbsNo=277',
        'category', '공고',
        'maxPages', 2,
        'forceHttps', true,
        'includeUrlPatterns', JSONB_BUILD_ARRAY(
          '^https://www\.seoul\.go\.kr/news/news_notice\.do\?.*nttNo=\d+'
        ),
        'pagination', JSONB_BUILD_OBJECT('param', 'curPage'),
        'linkTransform', JSONB_BUILD_OBJECT(
          'pattern', 'fnTbbsView\(''(?<id>\d+)''\)',
          'template', 'https://www.seoul.go.kr/news/news_notice.do?bbsNo=277&nttNo={id}'
        ),
        'selectors', JSONB_BUILD_OBJECT(
          'listItem', '.sib-lst-type-basic tbody tr',
          'listLink', '.sib-lst-type-basic-subject a',
          'listTitle', '.sib-lst-type-basic-subject a',
          'listDate', 'td:nth-child(4)',
          'listImage', '.sib-lst-type-basic-subject img',
          'detailRoot', '#seoul-integrated-board',
          'detailTitle', '#viewTable h3',
          'detailDate', '#viewTable .view-column',
          'detailContent', '.sib-viw-type-basic-content',
          'detailImages', '.sib-viw-type-basic-content img',
          'detailAttachments', '.sib-viw-type-basic-file a[href*=''getFile'']'
        )
      ),
      JSONB_BUILD_OBJECT(
        'name', '분야별 새소식',
        'url', 'https://www.seoul.go.kr/realmnews/in/list.do',
        'category', '새소식',
        'maxPages', 2,
        'forceHttps', true,
        'includeUrlPatterns', JSONB_BUILD_ARRAY(
          '^https?://news\.seoul\.go\.kr/[^/]+/archives/\d+'
        ),
        'pagination', JSONB_BUILD_OBJECT('param', 'fetchStart'),
        'selectors', JSONB_BUILD_OBJECT(
          'listItem', '.news-lst .item',
          'listLink', 'a[href*=''news.seoul.go.kr'']',
          'listTitle', '.subject',
          'listDate', '.date',
          'listImage', '.thum img',
          'detailRoot', '#viewWrap',
          'detailTitle', '#view_top h3',
          'detailDate', '#view_top',
          'detailContent', '#post_content',
          'detailImages', JSONB_BUILD_ARRAY(
            '#post_content > p img',
            '#post_content > figure img',
            '#post_content > ul img',
            '#post_content > ol img',
            '#post_content > table img'
          ),
          'detailAttachments', JSONB_BUILD_ARRAY(
            '#post_content > p a[href]',
            '#post_content > ul a[href]',
            '#post_content > ol a[href]',
            '#post_content > table a[href]'
          ),
          'removeBeforeText', JSONB_BUILD_ARRAY(
            'script',
            'style',
            'noscript',
            'iframe',
            '.tagDiv',
            '#sns_elem',
            '#content_manager_info',
            '#ratingWrapper',
            '.btn-group',
            '.comment_eungdapso',
            '#ad_area_912_100'
          )
        )
      )
    ),
    true
  ),
  notes = CASE
    WHEN COALESCE(source.notes, '') LIKE '%분야별 새소식%'
      THEN source.notes
    ELSE CONCAT_WS(' | ', NULLIF(source.notes, ''), '서울시 분야별 새소식 게시판과 분야별 상세 포스터·첨부 수집 추가')
  END,
  updated_at = NOW()
FROM source_update
WHERE source.id = source_update.id;
