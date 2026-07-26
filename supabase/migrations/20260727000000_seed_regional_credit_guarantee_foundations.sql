-- SNS_INGESTION.md Phase 4 — beachhead 기관: 17개 시도 지역신용보증재단.
--
-- 신용보증재단중앙회(koreg.or.kr)의 "지역신용보증재단 찾기" 공식 페이지에서
-- 17개 전체의 이름·주소·전화번호·홈페이지 링크를 확인했고(2026-07-27),
-- 이름과 링크를 DOM 근접 매칭으로 정확히 짝지었으며, curl로 17개 전부
-- 실제로 응답하는 살아있는 사이트임을 확인했다(200 또는 301/302 정상 리다이렉트).
--
-- 각 재단의 실제 "공고" 게시판 하위 URL과 SNS 계정은 아직 개별 확인 못 했다
-- (17곳을 전부 방문하기엔 시간이 많이 걸려서) — 일단 홈페이지 URL을 list_url
-- 자리에도 넣어뒀고, 이후 각 재단 사이트를 방문해 실제 공고 게시판 경로로
-- 교체하고 naver_blog_id 등을 채우는 후속 작업이 필요하다.

INSERT INTO collection_sources (
  source_slug, name, source_type, region_scope, region_name,
  homepage_url, list_url, collection_method, priority, status, reliability, notes
) VALUES
  ('sinbo-gangwon', '강원신용보증재단', 'other', 'sido', '강원특별자치도',
   'https://www.gwsinbo.or.kr/', 'https://www.gwsinbo.or.kr/', 'html', 55, 'planned', 'medium',
   '2026-07-27 koreg.or.kr 공식 목록에서 확인, 사이트 생존 확인(302). 공고 게시판 경로·SNS 미확인.'),
  ('sinbo-gyeonggi', '경기신용보증재단', 'other', 'sido', '경기도',
   'https://www.gcgf.or.kr/', 'https://www.gcgf.or.kr/', 'html', 55, 'planned', 'medium',
   '2026-07-27 koreg.or.kr 공식 목록에서 확인, 사이트 생존 확인(200). 공고 게시판 경로·SNS 미확인.'),
  ('sinbo-gyeongnam', '경남신용보증재단', 'other', 'sido', '경상남도',
   'https://www.gnsinbo.or.kr/', 'https://www.gnsinbo.or.kr/', 'html', 55, 'planned', 'medium',
   '2026-07-27 koreg.or.kr 공식 목록에서 확인, 사이트 생존 확인(200). 공고 게시판 경로·SNS 미확인.'),
  ('sinbo-gyeongbuk', '경북신용보증재단', 'other', 'sido', '경상북도',
   'https://gbsinbo.co.kr/', 'https://gbsinbo.co.kr/', 'html', 55, 'planned', 'medium',
   '2026-07-27 koreg.or.kr 공식 목록에서 확인, 사이트 생존 확인(200). 공고 게시판 경로·SNS 미확인.'),
  ('sinbo-gwangju', '광주신용보증재단', 'other', 'sido', '광주광역시',
   'https://www.gjsinbo.or.kr/', 'https://www.gjsinbo.or.kr/', 'html', 55, 'planned', 'medium',
   '2026-07-27 koreg.or.kr 공식 목록에서 확인, 사이트 생존 확인(200). 공고 게시판 경로·SNS 미확인.'),
  ('sinbo-daegu', '대구신용보증재단', 'other', 'sido', '대구광역시',
   'https://www.ttg.co.kr/', 'https://www.ttg.co.kr/', 'html', 55, 'planned', 'medium',
   '2026-07-27 koreg.or.kr 공식 목록에서 확인, 사이트 생존 확인(301). 공고 게시판 경로·SNS 미확인.'),
  ('sinbo-daejeon', '대전신용보증재단', 'other', 'sido', '대전광역시',
   'https://www.sinbo.or.kr/', 'https://www.sinbo.or.kr/', 'html', 55, 'planned', 'medium',
   '2026-07-27 koreg.or.kr 공식 목록에서 확인, 사이트 생존 확인(200). 공고 게시판 경로·SNS 미확인.'),
  ('sinbo-busan', '부산신용보증재단', 'other', 'sido', '부산광역시',
   'https://www.busansinbo.or.kr/', 'https://www.busansinbo.or.kr/', 'html', 55, 'planned', 'medium',
   '2026-07-27 koreg.or.kr 공식 목록에서 확인, 사이트 생존 확인(302). 공고 게시판 경로·SNS 미확인.'),
  ('sinbo-seoul', '서울신용보증재단', 'other', 'sido', '서울특별시',
   'https://www.seoulshinbo.co.kr/', 'https://www.seoulshinbo.co.kr/', 'html', 60, 'planned', 'medium',
   '2026-07-27 koreg.or.kr 공식 목록에서 확인, 사이트 생존 확인(200). 공고 게시판 경로·SNS 미확인.'),
  ('sinbo-sejong', '세종신용보증재단', 'other', 'sido', '세종특별자치시',
   'https://sjsinbo.or.kr/', 'https://sjsinbo.or.kr/', 'html', 55, 'planned', 'medium',
   '2026-07-27 koreg.or.kr 공식 목록에서 확인, 사이트 생존 확인(200). 공고 게시판 경로·SNS 미확인.'),
  ('sinbo-ulsan', '울산신용보증재단', 'other', 'sido', '울산광역시',
   'https://www.ulsanshinbo.co.kr/', 'https://www.ulsanshinbo.co.kr/', 'html', 55, 'planned', 'medium',
   '2026-07-27 koreg.or.kr 공식 목록에서 확인, 사이트 생존 확인(200). 공고 게시판 경로·SNS 미확인.'),
  ('sinbo-incheon', '인천신용보증재단', 'other', 'sido', '인천광역시',
   'https://www.icsinbo.or.kr/', 'https://www.icsinbo.or.kr/', 'html', 55, 'planned', 'medium',
   '2026-07-27 koreg.or.kr 공식 목록에서 확인, 사이트 생존 확인(200). 공고 게시판 경로·SNS 미확인.'),
  ('sinbo-jeonnam', '전남신용보증재단', 'other', 'sido', '전라남도',
   'https://www.jnsinbo.or.kr/', 'https://www.jnsinbo.or.kr/', 'html', 55, 'planned', 'medium',
   '2026-07-27 koreg.or.kr 공식 목록에서 확인, 사이트 생존 확인(301). 공고 게시판 경로·SNS 미확인.'),
  ('sinbo-jeonbuk', '전북신용보증재단', 'other', 'sido', '전북특별자치도',
   'https://www.jbcredit.or.kr/', 'https://www.jbcredit.or.kr/', 'html', 55, 'planned', 'medium',
   '2026-07-27 koreg.or.kr 공식 목록에서 확인, 사이트 생존 확인(200). 공고 게시판 경로·SNS 미확인.'),
  ('sinbo-jeju', '제주신용보증재단', 'other', 'sido', '제주특별자치도',
   'https://jcgf.or.kr/', 'https://jcgf.or.kr/', 'html', 55, 'planned', 'medium',
   '2026-07-27 koreg.or.kr 공식 목록에서 확인, 사이트 생존 확인(302). 공고 게시판 경로·SNS 미확인.'),
  ('sinbo-chungnam', '충남신용보증재단', 'other', 'sido', '충청남도',
   'https://www.cnsinbo.co.kr/', 'https://www.cnsinbo.co.kr/', 'html', 55, 'planned', 'medium',
   '2026-07-27 koreg.or.kr 공식 목록에서 확인, 사이트 생존 확인(200). 공고 게시판 경로·SNS 미확인.'),
  ('sinbo-chungbuk', '충북신용보증재단', 'other', 'sido', '충청북도',
   'https://www.cbsinbo.or.kr/', 'https://www.cbsinbo.or.kr/', 'html', 55, 'planned', 'medium',
   '2026-07-27 koreg.or.kr 공식 목록에서 확인, 사이트 생존 확인(200). 공고 게시판 경로·SNS 미확인.')
ON CONFLICT (source_slug) DO UPDATE SET
  homepage_url = EXCLUDED.homepage_url,
  list_url = EXCLUDED.list_url,
  notes = EXCLUDED.notes,
  updated_at = now();
