-- SNS_INGESTION.md Phase 4 후속 — 17개 광역시도 경제진흥원(20260727030000, 웹검색 기반
-- 1차 등록)을 실제로 하나씩 방문해서 검증한다. 이번엔 신용보증재단과 같은 수준으로
-- 브라우저 방문 확인함(이전 웹검색 추정보다 신뢰도 높임).
--
-- 발견한 오류 2건:
--  - econ-gangwon: 웹검색으로 등록했던 technopark.kr는 강원 전용이 아니라
--    "한국테크노파크진흥회"(전국 테크노파크 연합회) 사이트였다. 실제 강원테크노파크는
--    gwtp.or.kr.
--  - econ-ulsan: uepa.or.kr가 실제로는 ubpi.or.kr(울산경제일자리진흥원)로 리다이렉트됨 —
--    기관명이 UEPA에서 UBPI로 개편된 것으로 보임. 도메인을 정식 목적지로 교체.
--
-- econ-gwangju(광주경제고용진흥원, gepa.or.kr)는 SSL 인증서가 jni.re.kr 앞으로 발급돼
-- 있어(Host/cert mismatch) 브라우저가 접속을 거부함 — 도메인 자체가 더 이상 유효하지
-- 않거나 다른 기관에 재할당된 것으로 의심됨. 이번엔 검증 못 함, 다음에 실제 최신
-- 도메인을 다시 찾아야 함(homepage_url 그대로 둠).

UPDATE collection_sources SET
  list_url = 'https://www.sba.seoul.kr/Pages/BusinessApply/Posting.aspx',
  facebook_id = 'newSBA.Seoul',
  naver_blog_id = 'seoulsba',
  instagram_id = 'sbaseoul',
  reliability = 'high',
  notes = '2026-07-27 실제 방문 확인: 사업신청>전체 사업(실제 지원사업 공고 다수, 별도 공지사항 게시판도 있음). 네이버블로그/페이스북/인스타그램/유튜브 확인.'
WHERE source_slug = 'econ-seoul';

UPDATE collection_sources SET
  list_url = 'https://www.gbsa.or.kr/board/notice.do',
  facebook_id = 'smartgbsa',
  naver_blog_id = 'smartgbc',
  instagram_id = 'smartgbsa',
  reliability = 'high',
  notes = '2026-07-27 실제 방문 확인: 공지사항 게시판(실제 지원사업 공고 다수). 네이버블로그/페이스북/인스타그램/유튜브/카카오채널(_nDnwT) 확인.'
WHERE source_slug = 'econ-gyeonggi';

UPDATE collection_sources SET
  list_url = 'https://www.bepa.kr/kor/view.do?no=1508',
  facebook_id = 'bepasns',
  naver_blog_id = 'bepa_sns',
  instagram_id = 'bepa_official',
  reliability = 'high',
  notes = '2026-07-27 실제 방문으로 재확인(웹검색 추정과 동일하게 정확했음): 공고/공지사항 게시판. 네이버블로그/페이스북/인스타그램 확인.'
WHERE source_slug = 'econ-busan';

UPDATE collection_sources SET
  list_url = 'https://dgtp.or.kr/bbs/BoardControll.do?bbsId=BBSMSTR_000000000003',
  facebook_id = 'daegutp',
  instagram_id = 'daegutp_',
  reliability = 'high',
  notes = '2026-07-27 실제 방문으로 재확인(웹검색 추정과 동일하게 정확했음): 사업공고 게시판. 페이스북/인스타그램/유튜브/카카오채널(_umxlxjb) 확인. 네이버블로그는 못 찾음.'
WHERE source_slug = 'econ-daegu';

UPDATE collection_sources SET
  list_url = 'https://www.itp.or.kr/intro.asp?tmid=13',
  facebook_id = 'itp.incheon',
  reliability = 'high',
  notes = '2026-07-27 실제 방문으로 재확인(웹검색 추정과 동일하게 정확했음): 지원사업 게시판(실제 공고 다수, 별도 "기관공고"(tmid=14) 게시판도 있음). 페이스북/유튜브(@itp02466) 확인. 네이버블로그/인스타그램은 못 찾음.'
WHERE source_slug = 'econ-incheon';

UPDATE collection_sources SET
  notes = '2026-07-27 확인 시도: gepa.or.kr의 SSL 인증서가 jni.re.kr 앞으로 발급돼 있어(호스트명 불일치) 브라우저가 접속을 거부함 — 도메인이 더 이상 유효하지 않거나 다른 기관에 재할당됐을 가능성. 다음에 실제 최신 도메인을 웹검색으로 다시 찾아야 함. homepage_url/list_url은 이전 값(광주광역시 기업지원시스템 gjbizinfo.or.kr) 그대로 유지.'
WHERE source_slug = 'econ-gwangju';

UPDATE collection_sources SET
  list_url = 'https://www.djtp.or.kr/menu.es?mid=a20102000000',
  instagram_id = 'daejeon_technopark',
  reliability = 'high',
  notes = '2026-07-27 실제 방문으로 재확인(웹검색 추정과 동일하게 정확했음): 일반사업공고 게시판. 인스타그램/유튜브/카카오채널(_xdxnhQxb) 확인. 네이버블로그/페이스북은 못 찾음.'
WHERE source_slug = 'econ-daejeon';

UPDATE collection_sources SET
  homepage_url = 'https://www.ubpi.or.kr/',
  list_url = 'https://www.ubpi.or.kr/sub/?mcode=0403010000',
  naver_blog_id = 'uepa7171',
  instagram_id = 'ubpi_.official',
  reliability = 'high',
  notes = '2026-07-27 실제 방문 확인: uepa.or.kr가 ubpi.or.kr(울산경제일자리진흥원, UEPA에서 UBPI로 개편된 것으로 보임)로 리다이렉트됨 — 정식 도메인으로 교체. 공지사항 게시판(실제 마감일 D-day 표시된 공고 다수). 네이버블로그/인스타그램 확인.'
WHERE source_slug = 'econ-ulsan';

UPDATE collection_sources SET
  list_url = 'https://sjtp.or.kr/bbs/board.php?bo_table=business01',
  reliability = 'high',
  notes = '2026-07-27 실제 방문 확인: 사업공고 게시판(실제 지원사업 공고 다수, 이전엔 정확한 URL 미확인 상태였음). 유튜브만 확인, 다른 SNS는 못 찾음.'
WHERE source_slug = 'econ-sejong';

UPDATE collection_sources SET
  homepage_url = 'https://www.gwtp.or.kr/',
  list_url = 'https://www.gwtp.or.kr/gwtp/bbsNew_list.php?code=sub01b&keyvalue=sub01',
  reliability = 'high',
  notes = '2026-07-27 실제 방문해보니 이전에 등록한 technopark.kr는 강원 전용 사이트가 아니라 "한국테크노파크진흥회"(전국 테크노파크 연합회) 사이트였음 — 잘못된 기관을 등록했던 것. 실제 강원테크노파크(gwtp.or.kr)로 교체하고, 모집공고 게시판(사업공고 성격) 확인. 유튜브(@gangwonTP)만 확인.'
WHERE source_slug = 'econ-gangwon';

UPDATE collection_sources SET
  naver_blog_id = 'cbtp2004',
  facebook_id = 'cbtp2004',
  instagram_id = 'cbtp2004',
  reliability = 'high',
  notes = '2026-07-27 실제 방문으로 재확인(웹검색 추정과 동일하게 정확했음): 사업공고 게시판(별도 공지사항 게시판도 있음). 네이버블로그/페이스북/인스타그램 전부 같은 계정명으로 확인.'
WHERE source_slug = 'econ-chungbuk';

UPDATE collection_sources SET
  list_url = 'https://www.cepa.or.kr/notice/notice.do?pm=6&ms=32',
  reliability = 'high',
  notes = '2026-07-27 실제 방문 확인: 공지사항 게시판(이전엔 산하 소상공인지원센터 sbiz.cepa.or.kr로 대체 등록했었는데, 본원 자체 공지사항 게시판이 있었음). 카카오채널 3개(부서별로 다른 듯: _Asxbtb, _MuLxcxj, _xgZJhn) 확인. 네이버블로그/페이스북/인스타그램은 못 찾음.'
WHERE source_slug = 'econ-chungnam';

UPDATE collection_sources SET
  list_url = 'https://www.jbba.kr/bbs/board.php?bo_table=sub01_09',
  naver_blog_id = 'jbba2000',
  facebook_id = 'jbbakr',
  instagram_id = 'jbba.kr_for_u',
  reliability = 'high',
  notes = '2026-07-27 실제 방문 확인(이전엔 정확한 게시판 URL 미확인 상태였음): 실제 지원사업 공고 게시판. 네이버블로그/페이스북/인스타그램/유튜브/카카오채널(_WxkxhxfT) 확인.'
WHERE source_slug = 'econ-jeonbuk';

UPDATE collection_sources SET
  list_url = 'https://www.jepa.kr/bbs/?b_id=notice&site=new_jepa&mn=426',
  instagram_id = 'jeonnam_biz',
  reliability = 'high',
  notes = '2026-07-27 실제 방문 확인(이전엔 정확한 게시판 URL 미확인 상태였음): 카테고리별 공고 게시판(자금지원/판로지원/일자리지원/교육컨설팅 등으로 세분화돼 있음, mn=426이 통합 목록). 인스타그램/유튜브/카카오채널(_aQhxeK) 확인. 페이스북은 숫자 ID뿐이라 안정적인 계정명 없음. 네이버블로그는 못 찾음.'
WHERE source_slug = 'econ-jeonnam';

UPDATE collection_sources SET
  list_url = 'https://www.gepa.kr/?page_id=51',
  facebook_id = 'official.gepa',
  naver_blog_id = 'gepanews',
  instagram_id = 'gepa.official',
  reliability = 'high',
  notes = '2026-07-27 실제 방문 확인(이전엔 정확한 게시판 URL 미확인 상태였음): 공지사항 게시판. 네이버블로그/페이스북/인스타그램/유튜브/카카오채널(_pHNwxb) 확인.'
WHERE source_slug = 'econ-gyeongbuk';

UPDATE collection_sources SET
  list_url = 'https://www.gntp.or.kr/board/list',
  reliability = 'high',
  notes = '2026-07-27 실제 방문 확인: 알림마당 통합 게시판(공지사항/입주공고/타기관소식 등 전부 한 목록에 섞여 있음, 7000건 이상 누적). SNS 계정은 못 찾음(이전 biz/apply 추정은 실제로는 지원사업 신청 페이지였고 공고 목록이 아니었음).'
WHERE source_slug = 'econ-gyeongnam';

UPDATE collection_sources SET
  list_url = 'https://www.jba.or.kr/bbs/board.php?bo_table=2_1_1_1',
  naver_blog_id = 'jba3337',
  instagram_id = 'e__jeju',
  reliability = 'high',
  notes = '2026-07-27 실제 방문 확인(이전엔 소상공인 경영지원 페이지로 대체 등록했었음): 공지사항 게시판. 네이버블로그/인스타그램/카카오채널(_CABjj) 확인.'
WHERE source_slug = 'econ-jeju';
