-- SNS_INGESTION.md Phase 4 후속 — 17개 시도 지역신용보증재단(20260727000000 시드)의
-- 실제 "공고" 게시판 하위 URL과 SNS 계정을 개별 방문 확인해서 채운다.
-- (시드 당시엔 시간 관계상 homepage_url을 list_url 자리에 임시로 넣어뒀었음.)
--
-- 확인 방법: 브라우저 자동화로 각 사이트를 직접 방문해 실제 공지사항/사업공고
-- 게시판 목록 URL을 찾고, 페이지 DOM에서 naver/facebook/instagram/youtube/kakao
-- 링크를 추출(document.querySelectorAll('a[href]'))해서 확인함. 카카오채널 ID는
-- 전용 컬럼이 없어 notes에만 남김.
--
-- 예외 2건:
--  - sinbo-daegu: 시드 당시 homepage_url이 ttg.co.kr였는데, 실제로는 dgsinbo.or.kr로
--    리다이렉트됨을 확인 — homepage_url/list_url 모두 dgsinbo.or.kr로 교체.
--  - sinbo-gwangju: 사이트가 "인트로 페이지 → 홈페이지 바로가기" 링크가 자기 자신을
--    가리키며 새 콘텐츠를 로드하지 않는 구조(쿠키 기반으로 추정)라 자동화로는
--    게시판 URL을 확인 못 함. SNS 계정도 검색으로 찾지 못함 — homepage_url만 유지,
--    개별 방문 필요 항목으로 남김.
--  - sinbo-jeonnam: SNS 계정은 확인했으나 공지사항 게시판이 JS 탭 전환 방식이라
--    안정적인 목록 URL을 못 찾음 — list_url은 홈페이지 유지.

UPDATE collection_sources SET
  list_url = 'https://www.seoulshinbo.co.kr/wbase/contents/bbs/list.do?mng_cd=STRY0006',
  instagram_id = 'seoulshinbo',
  notes = '2026-07-27 실제 방문 확인: 알림광장>새소식>사업공고 게시판. 인스타그램 확인(팔로워 4천+). 네이버블로그/페이스북 없음.'
WHERE source_slug = 'sinbo-seoul';

UPDATE collection_sources SET
  list_url = 'https://www.gcgf.or.kr/gcgf/pt/pst/selectPstList.do?mi=1024&bbsId=1002',
  naver_blog_id = 'gcgf1',
  facebook_id = 'gcgf1',
  instagram_id = 'gcgf_official',
  notes = '2026-07-27 실제 방문 확인: 메인페이지 공지사항 탭(실제 지원사업 공고 포함, 예: 재도전 사례 공모전). 네이버블로그/페이스북/인스타그램 전부 DOM에서 확인. 카카오채널 _UxnYWj.'
WHERE source_slug = 'sinbo-gyeonggi';

UPDATE collection_sources SET
  list_url = 'https://dream.gnsinbo.or.kr/bbs/board.php?bo_table=04_01',
  naver_blog_id = 'knam0605',
  instagram_id = 'knamsinbo',
  notes = '2026-07-27 실제 방문 확인: 소상공인종합지원(dream.gnsinbo.or.kr) 사이트의 공지사항 게시판 — "(공고/기업 제2026-XX호)" 형식으로 실제 지원사업 공고 다수. 본 사이트(gnsinbo.or.kr/gcgf.gnsinbo.or.kr)엔 별도 공고 게시판 없음.'
WHERE source_slug = 'sinbo-gyeongnam';

UPDATE collection_sources SET
  list_url = 'https://gbsinbo.co.kr/page/10052/10005.tc',
  naver_blog_id = 'gbsinbo1',
  facebook_id = 'gbsinbo.official',
  instagram_id = 'gbsinbo_official',
  notes = '2026-07-27 실제 방문 확인: 공지사항 게시판. 네이버블로그/페이스북/인스타그램/유튜브 전부 DOM에서 확인. 카카오채널 _UQnTxb.'
WHERE source_slug = 'sinbo-gyeongbuk';

UPDATE collection_sources SET
  notes = '2026-07-27 확인 시도: 인트로 페이지의 "홈페이지 바로가기" 링크가 계속 자기 자신(?intro_enter=1)으로만 돌아가는 구조라 자동화 브라우저로는 실제 콘텐츠에 진입 못 함(쿠키 기반 인트로 스킵으로 추정). 검색으로도 SNS 계정 못 찾음. list_url은 홈페이지 유지 — 사람이 직접 방문해서 채워야 함.'
WHERE source_slug = 'sinbo-gwangju';

UPDATE collection_sources SET
  homepage_url = 'https://www.dgsinbo.or.kr/',
  list_url = 'https://www.dgsinbo.or.kr/page/10065/10006.tc',
  naver_blog_id = 'dgsinbo',
  instagram_id = 'dgsinbo_official',
  notes = '2026-07-27 실제 방문 확인: 시드 당시 등록한 ttg.co.kr는 dgsinbo.or.kr로 리다이렉트되는 구도메인이었음 — 정식 도메인으로 교체. 재단 공지사항 게시판(임원 공개모집 공고 등 실제 공고 포함). 네이버블로그/인스타그램/유튜브 확인. 카카오채널 _xnXBTxb.'
WHERE source_slug = 'sinbo-daegu';

UPDATE collection_sources SET
  list_url = 'https://www.sinbo.or.kr/sub04_01_01',
  notes = '2026-07-27 실제 방문 확인: 공지사항 게시판(소상공인 경영지도 종합지원 패키지 등 실제 지원사업 공고 포함). 사이트에 네이버블로그/페이스북/인스타그램 링크 없음(미보유로 추정).'
WHERE source_slug = 'sinbo-daejeon';

UPDATE collection_sources SET
  list_url = 'https://www.busansinbo.or.kr/portal/board/post/list.do?bcIdx=565&mid=0301010000',
  naver_blog_id = 'busansinbo_official',
  instagram_id = 'bcgf_official',
  notes = '2026-07-27 실제 방문 확인: 새소식>공지사항 게시판. 네이버블로그/인스타그램/유튜브(@busansinbo) 확인. 카카오채널 _IdhvT.'
WHERE source_slug = 'sinbo-busan';

UPDATE collection_sources SET
  list_url = 'https://sjsinbo.or.kr/sub0501',
  notes = '2026-07-27 실제 방문 확인: 공지사항 게시판(실제 지원사업 공고 다수 확인). 사이트에 네이버블로그/페이스북/인스타그램 링크 없음(미보유로 추정).'
WHERE source_slug = 'sinbo-sejong';

UPDATE collection_sources SET
  list_url = 'https://www.ulsanshinbo.co.kr/04_notice/?mcode=0404010000',
  notes = '2026-07-27 실제 방문 확인: 알림마당>공지사항 게시판. "중소기업지원자금공고"(mcode=0402060000) 별도 게시판도 있음(지원자금 공고 전용, 더 좁은 스코프). 사이트 전체에 네이버블로그/페이스북/인스타그램 링크 없음(미보유로 추정) — 검색으로도 못 찾음.'
WHERE source_slug = 'sinbo-ulsan';

UPDATE collection_sources SET
  list_url = 'https://www.icsinbo.or.kr/home/board/brdList.do?menu_cd=000096',
  naver_blog_id = 'sbsc19',
  facebook_id = 'incheonsinbo',
  instagram_id = 'incheonsinbo',
  notes = '2026-07-27 실제 방문 확인 + 검색: 공지사항 게시판(422건 확인). 네이버블로그/페이스북/인스타그램/유튜브(@icsinbo) 전부 확인.'
WHERE source_slug = 'sinbo-incheon';

UPDATE collection_sources SET
  facebook_id = 'jeonnamsinbo',
  instagram_id = 'jnsinbo_official',
  notes = '2026-07-27 실제 방문 확인: SNS 계정(페이스북/인스타그램/유튜브/카카오 _XQAxbxb)은 확인했으나, 공지사항 게시판이 JS 탭 전환 방식(href="javascript:;")이라 안정적인 목록 URL을 못 찾음(개별 게시글 URL 패턴은 /jnsinbo/Board/{id}/detailView.do). list_url은 홈페이지 유지 — 크롤러 연동 시 실제 목록 API 엔드포인트를 별도로 확인해야 함.'
WHERE source_slug = 'sinbo-jeonnam';

UPDATE collection_sources SET
  list_url = 'https://www.jbcredit.or.kr/site/menu/MENU_000000000000090',
  facebook_id = 'jbcredit3',
  instagram_id = 'jeonbuksinbo',
  notes = '2026-07-27 실제 방문 확인: 공지사항(NOTICE) 게시판. 페이스북/인스타그램 확인. 카카오채널 _yJHvT. 네이버블로그는 못 찾음(미보유로 추정, 사이트에 파파고 번역 링크만 있었음).'
WHERE source_slug = 'sinbo-jeonbuk';

UPDATE collection_sources SET
  list_url = 'https://www.jcgf.or.kr/bbs/board.php?bo_table=5_1_1_1',
  facebook_id = '제주신용보증재단-270579309776775',
  instagram_id = 'jcgf_official',
  notes = '2026-07-27 실제 방문 확인: 알림마당>공지사항 게시판. 페이스북(페이지ID 270579309776775)/인스타그램 확인. 네이버블로그는 못 찾음.'
WHERE source_slug = 'sinbo-jeju';

UPDATE collection_sources SET
  list_url = 'https://www.cnsinbo.co.kr/boardCnts/list.do?boardID=134&m=030101&s=cnsinbo',
  naver_blog_id = 'cnsinbo_official',
  instagram_id = 'cnsinbo_official',
  notes = '2026-07-27 실제 방문 확인: 공지사항 게시판. 네이버블로그/인스타그램/유튜브 확인. 카카오채널 _bmxaKxb.'
WHERE source_slug = 'sinbo-chungnam';

UPDATE collection_sources SET
  list_url = 'https://www.cbsinbo.or.kr/sub.php?code=123',
  naver_blog_id = 'cb_sinbo',
  instagram_id = 'cbsinbo_official',
  notes = '2026-07-27 실제 방문 확인: 알림마당>공지사항 게시판(2026년 충북 새출발 재기지원사업 공고 등 실제 공고 포함). 네이버블로그/인스타그램/유튜브 확인. 카카오채널 _jVxdsxb.'
WHERE source_slug = 'sinbo-chungbuk';

UPDATE collection_sources SET
  list_url = 'https://www.gwsinbo.or.kr/board/board_list.php?board_name=notice',
  naver_blog_id = 'gwsinbo',
  instagram_id = 'gwsinbo_official',
  notes = '2026-07-27 실제 방문 확인: 소상공인종합지원(dream.gnsinbo.or.kr 유사 구조) 사이트 경유해 공지사항 게시판 확인. 네이버블로그/인스타그램 확인. 카카오채널 _yxmEsxb.'
WHERE source_slug = 'sinbo-gangwon';
