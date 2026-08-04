-- 서울시 두 게시판은 상세 HTML에 모집 내용과 포스터가 이미 있으므로
-- PDF/HWP 본문을 매 수집마다 다시 내려받지 않는다. 이미지 첨부 승격은 유지된다.

UPDATE collection_sources
SET
  config_json = JSONB_SET(
    config_json,
    '{boards}',
    (
      SELECT JSONB_AGG(
        CASE
          WHEN board ->> 'url' IN (
            'https://www.seoul.go.kr/news/news_notice.do?bbsNo=277',
            'https://www.seoul.go.kr/realmnews/in/list.do'
          )
          THEN JSONB_SET(board, '{analyzeAttachments}', 'false'::jsonb, true)
          ELSE board
        END
      )
      FROM JSONB_ARRAY_ELEMENTS(COALESCE(config_json -> 'boards', '[]'::jsonb)) AS board
    ),
    true
  ),
  notes = CASE
    WHEN COALESCE(notes, '') LIKE '%첨부 본문 재추출 생략%'
      THEN notes
    ELSE CONCAT_WS(' | ', NULLIF(notes, ''), '상세 HTML 우선 사용, PDF/HWP 첨부 본문 재추출 생략')
  END,
  updated_at = NOW()
WHERE source_slug = 'seoul-city';
