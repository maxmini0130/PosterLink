-- SNS_INGESTION.md Phase 4 — beachhead 기관 목록: 창조경제혁신센터.
--
-- 실제로 확인해보니 문서가 말한 17개가 아니라 19개(17개 시도 + 포항·빛가람 특화센터)다.
-- 통합 포털(ccei.creativekorea.or.kr, 주관: 중소벤처기업부/운영: 창업진흥원)의
-- 실제 지역 선택 드롭다운에서 19개 전체와 정확한 URL을 확인했고(2026-07-26),
-- 게시판 URL 패턴(/{region}/custom/notice_list.do)은 서울센터를 직접 방문해 검증했다.
--
-- 각 센터의 실제 SNS(네이버블로그/인스타/페이스북) 계정은 지역마다 달라서 하나씩
-- 확인해야 한다 — 서울만 직접 확인했다(naver_blog_id='ccei_forever'). 나머지 18개는
-- coverage_grade/sns_enabled 판단에 필요한 blog id가 없으므로 이후 별도로 채워야 한다.

INSERT INTO collection_sources (
  source_slug, name, source_type, region_scope, region_name,
  homepage_url, list_url, collection_method, priority, status, reliability,
  naver_blog_id, notes
) VALUES
  ('ccei-seoul', '서울창조경제혁신센터', 'startup', 'sido', '서울특별시',
   'https://ccei.creativekorea.or.kr/seoul/', 'https://ccei.creativekorea.or.kr/seoul/custom/notice_list.do',
   'html', 70, 'planned', 'high', 'ccei_forever', '2026-07-26 실사이트 방문 검증(홈페이지·게시판·SNS 전부 확인)'),
  ('ccei-busan', '부산창조경제혁신센터', 'startup', 'sido', '부산광역시',
   'https://ccei.creativekorea.or.kr/busan/', 'https://ccei.creativekorea.or.kr/busan/custom/notice_list.do',
   'html', 65, 'planned', 'medium', NULL, '2026-07-26 통합포털 드롭다운에서 URL 확인(SNS 계정 미확인)'),
  ('ccei-daegu', '대구창조경제혁신센터', 'startup', 'sido', '대구광역시',
   'https://ccei.creativekorea.or.kr/daegu/', 'https://ccei.creativekorea.or.kr/daegu/custom/notice_list.do',
   'html', 65, 'planned', 'medium', NULL, '2026-07-26 통합포털 드롭다운에서 URL 확인(SNS 계정 미확인)'),
  ('ccei-gwangju', '광주창조경제혁신센터', 'startup', 'sido', '광주광역시',
   'https://ccei.creativekorea.or.kr/gwangju/', 'https://ccei.creativekorea.or.kr/gwangju/custom/notice_list.do',
   'html', 65, 'planned', 'medium', NULL, '2026-07-26 통합포털 드롭다운에서 URL 확인(SNS 계정 미확인)'),
  ('ccei-daejeon', '대전창조경제혁신센터', 'startup', 'sido', '대전광역시',
   'https://ccei.creativekorea.or.kr/daejeon/', 'https://ccei.creativekorea.or.kr/daejeon/custom/notice_list.do',
   'html', 65, 'planned', 'medium', NULL, '2026-07-26 통합포털 드롭다운에서 URL 확인(SNS 계정 미확인)'),
  ('ccei-incheon', '인천창조경제혁신센터', 'startup', 'sido', '인천광역시',
   'https://ccei.creativekorea.or.kr/incheon/', 'https://ccei.creativekorea.or.kr/incheon/custom/notice_list.do',
   'html', 65, 'planned', 'medium', NULL, '2026-07-26 통합포털 드롭다운에서 URL 확인(SNS 계정 미확인)'),
  ('ccei-ulsan', '울산창조경제혁신센터', 'startup', 'sido', '울산광역시',
   'https://ccei.creativekorea.or.kr/ulsan/', 'https://ccei.creativekorea.or.kr/ulsan/custom/notice_list.do',
   'html', 65, 'planned', 'medium', NULL, '2026-07-26 통합포털 드롭다운에서 URL 확인(SNS 계정 미확인)'),
  ('ccei-sejong', '세종창조경제혁신센터', 'startup', 'sido', '세종특별자치시',
   'https://ccei.creativekorea.or.kr/sejong/', 'https://ccei.creativekorea.or.kr/sejong/custom/notice_list.do',
   'html', 65, 'planned', 'medium', NULL, '2026-07-26 통합포털 드롭다운에서 URL 확인(SNS 계정 미확인)'),
  ('ccei-gyeonggi', '경기창조경제혁신센터', 'startup', 'sido', '경기도',
   'https://ccei.creativekorea.or.kr/gyeonggi/', 'https://ccei.creativekorea.or.kr/gyeonggi/custom/notice_list.do',
   'html', 65, 'planned', 'medium', NULL, '2026-07-26 통합포털 드롭다운에서 URL 확인(SNS 계정 미확인)'),
  ('ccei-gangwon', '강원창조경제혁신센터', 'startup', 'sido', '강원특별자치도',
   'https://ccei.creativekorea.or.kr/gangwon/', 'https://ccei.creativekorea.or.kr/gangwon/custom/notice_list.do',
   'html', 65, 'planned', 'medium', NULL, '2026-07-26 통합포털 드롭다운에서 URL 확인(SNS 계정 미확인)'),
  ('ccei-chungnam', '충남창조경제혁신센터', 'startup', 'sido', '충청남도',
   'https://ccei.creativekorea.or.kr/chungnam/', 'https://ccei.creativekorea.or.kr/chungnam/custom/notice_list.do',
   'html', 65, 'planned', 'medium', NULL, '2026-07-26 통합포털 드롭다운에서 URL 확인(SNS 계정 미확인)'),
  ('ccei-chungbuk', '충북창조경제혁신센터', 'startup', 'sido', '충청북도',
   'https://ccei.creativekorea.or.kr/chungbuk/', 'https://ccei.creativekorea.or.kr/chungbuk/custom/notice_list.do',
   'html', 65, 'planned', 'medium', NULL, '2026-07-26 통합포털 드롭다운에서 URL 확인(SNS 계정 미확인)'),
  ('ccei-gyeongnam', '경남창조경제혁신센터', 'startup', 'sido', '경상남도',
   'https://ccei.creativekorea.or.kr/gyeongnam/', 'https://ccei.creativekorea.or.kr/gyeongnam/custom/notice_list.do',
   'html', 65, 'planned', 'medium', NULL, '2026-07-26 통합포털 드롭다운에서 URL 확인(SNS 계정 미확인)'),
  ('ccei-gyeongbuk', '경북창조경제혁신센터', 'startup', 'sido', '경상북도',
   'https://ccei.creativekorea.or.kr/gyeongbuk/', 'https://ccei.creativekorea.or.kr/gyeongbuk/custom/notice_list.do',
   'html', 65, 'planned', 'medium', NULL, '2026-07-26 통합포털 드롭다운에서 URL 확인(SNS 계정 미확인)'),
  ('ccei-jeonnam', '전남창조경제혁신센터', 'startup', 'sido', '전라남도',
   'https://ccei.creativekorea.or.kr/jeonnam/', 'https://ccei.creativekorea.or.kr/jeonnam/custom/notice_list.do',
   'html', 65, 'planned', 'medium', NULL, '2026-07-26 통합포털 드롭다운에서 URL 확인(SNS 계정 미확인)'),
  ('ccei-jeonbuk', '전북창조경제혁신센터', 'startup', 'sido', '전북특별자치도',
   'https://ccei.creativekorea.or.kr/jeonbuk/', 'https://ccei.creativekorea.or.kr/jeonbuk/custom/notice_list.do',
   'html', 65, 'planned', 'medium', NULL, '2026-07-26 통합포털 드롭다운에서 URL 확인(SNS 계정 미확인)'),
  ('ccei-jeju', '제주창조경제혁신센터', 'startup', 'sido', '제주특별자치도',
   'https://ccei.creativekorea.or.kr/jeju/', 'https://ccei.creativekorea.or.kr/jeju/custom/notice_list.do',
   'html', 65, 'planned', 'medium', NULL, '2026-07-26 통합포털 드롭다운에서 URL 확인(SNS 계정 미확인)'),
  ('ccei-pohang', '포항창조경제혁신센터', 'startup', 'sigungu', '경상북도 포항시',
   'https://ccei.creativekorea.or.kr/pohang/', 'https://ccei.creativekorea.or.kr/pohang/custom/notice_list.do',
   'html', 60, 'planned', 'medium', NULL, '2026-07-26 통합포털 드롭다운에서 URL 확인(SNS 계정 미확인, 17개 시도 외 특화센터)'),
  ('ccei-bitgaram', '빛가람창조경제혁신센터', 'startup', 'sigungu', '전라남도 나주시',
   'https://ccei.creativekorea.or.kr/bitgaram/', 'https://ccei.creativekorea.or.kr/bitgaram/custom/notice_list.do',
   'html', 60, 'planned', 'medium', NULL, '2026-07-26 통합포털 드롭다운에서 URL 확인(SNS 계정 미확인, 17개 시도 외 특화센터)')
ON CONFLICT (source_slug) DO UPDATE SET
  name = EXCLUDED.name,
  homepage_url = EXCLUDED.homepage_url,
  list_url = EXCLUDED.list_url,
  naver_blog_id = COALESCE(collection_sources.naver_blog_id, EXCLUDED.naver_blog_id),
  notes = EXCLUDED.notes,
  updated_at = now();
