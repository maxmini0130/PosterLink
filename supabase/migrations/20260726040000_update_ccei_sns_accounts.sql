-- SNS_INGESTION.md Phase 4 — 창조경제혁신센터 SNS 계정 보강.
--
-- 서울/부산/대구 3개 지역을 직접 방문해 확인한 결과, 19개 센터가 통합 네이버
-- 블로그(ccei_forever, 주관 중소벤처기업부/운영 창업진흥원)를 공유하는 것을
-- 확인했다(facebook/instagram만 지역별로 다름). 실제로 RSS까지 조회해 확인:
-- 이 블로그는 존재하며 글이 50건 있으나 가장 최근 글이 2026-02-05로, 최근
-- 3개월 기준 활동이 없는 휴면 블로그 상태다.

UPDATE collection_sources
SET naver_blog_id = 'ccei_forever'
WHERE source_slug LIKE 'ccei-%';

UPDATE collection_sources
SET facebook_id = 'cceibusan', instagram_id = 'bccei'
WHERE source_slug = 'ccei-busan';

UPDATE collection_sources
SET facebook_id = 'daeguccei', instagram_id = 'daegu_ccei'
WHERE source_slug = 'ccei-daegu';
