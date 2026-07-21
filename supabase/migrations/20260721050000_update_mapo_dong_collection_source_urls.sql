-- Update Mapo-dong community center boards after the 2025 Mapo site split.

WITH dong_sources(source_slug, dong_slug) AS (
  VALUES
    ('mapo-dong-gongdeok', 'gongdeok'),
    ('mapo-dong-ahyeon', 'ahyeon'),
    ('mapo-dong-dohwa', 'dohwa'),
    ('mapo-dong-yonggang', 'yonggang'),
    ('mapo-dong-daeheung', 'daeheung'),
    ('mapo-dong-yeomni', 'yeomni'),
    ('mapo-dong-sinsu', 'sinsu'),
    ('mapo-dong-seogang', 'seogang'),
    ('mapo-dong-seogyo', 'seogyo'),
    ('mapo-dong-hapjeong', 'hapjeong'),
    ('mapo-dong-mangwon1', 'mangwon1'),
    ('mapo-dong-mangwon2', 'mangwon2'),
    ('mapo-dong-yeonnam', 'yeonnam'),
    ('mapo-dong-seongsan1', 'seongsan1'),
    ('mapo-dong-seongsan2', 'seongsan2'),
    ('mapo-dong-sangam', 'sangam')
)
UPDATE collection_sources AS source
SET
  homepage_url = 'https://culture.mapo.go.kr/site/' || dong_sources.dong_slug || '/home',
  list_url = 'https://culture.mapo.go.kr/site/' || dong_sources.dong_slug || '/board/townnews/list',
  config_json = jsonb_set(
    jsonb_set(
      COALESCE(source.config_json, '{}'::jsonb),
      '{boards}',
      jsonb_build_array(
        jsonb_build_object(
          'name', '주민센터 소식',
          'url', 'https://culture.mapo.go.kr/site/' || dong_sources.dong_slug || '/board/townnews/list',
          'category', '동주민센터'
        )
      )
    ),
    '{site_ids}',
    jsonb_build_array(source.source_slug)
  ) || jsonb_build_object('adapter', 'mapo-dong', 'maxPages', 2),
  notes = COALESCE(source.notes, '') || E'\n2026-07-21: culture.mapo.go.kr 동주민센터 우리동네소식 URL로 갱신.',
  updated_at = now()
FROM dong_sources
WHERE source.source_slug = dong_sources.source_slug;
