UPDATE collection_sources
SET
  config_json = config_json
    || jsonb_build_object(
      'adapter', 'generic-board',
      'maxPages', 2,
      'selectors', COALESCE(config_json -> 'selectors', '{}'::jsonb)
        || '{
          "detailRoot": "#sub-content-body",
          "detailTitle": ["table.AWbbs_view_table.border tr:first-child"],
          "detailContent": [".AWbbs_view_content"],
          "detailDate": ["table.AWbbs_view_table.border tr:nth-child(2)"],
          "detailImages": [".AWbbs_view_content img"],
          "detailAttachments": [
            "table.AWbbs_view_table.border a[href*=\"download\"]",
            "table.AWbbs_view_table.border a[href*=\"file\"]"
          ]
        }'::jsonb
    ),
  notes = '구립마포청소년문화의집 상세 본문 선택자 보정',
  updated_at = now()
WHERE source_slug = 'mapo-youth';
