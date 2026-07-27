-- SNS_INGESTION.md Phase 4 — beachhead 기관: 17개 광역시도 경제진흥원/테크노파크
-- (지자체 경제·일자리 부서 산하 공공기관, 소상공인·중소기업 지원사업 공고 주체).
--
-- 이번엔 신용보증재단(20260727000000/020000)과 달리 각 사이트를 브라우저로 직접
-- 방문해 검증하지 않고, 웹검색으로 기관명·홈페이지·사업공고 게시판 후보를 찾아
-- 1차 등록만 한다 — beachhead 우선순위상 신용보증재단보다 낮은 항목이라 더 가벼운
-- 방식으로 먼저 목록만 채우고, 실제 board_url 정확도는 방문 확인 후속작업으로 남김.
--
-- 지역마다 기관 유형이 다르다(경제진흥원 vs 테크노파크 vs 경제통상진흥원 등) —
-- 지역 산업 구조에 따라 자연스러운 차이이며, 전부 "지자체 산하 소상공인/중소기업
-- 지원사업 공고 주체"라는 같은 역할을 한다.

INSERT INTO collection_sources (
  source_slug, name, source_type, region_scope, region_name,
  homepage_url, list_url, collection_method, priority, status, reliability, notes
) VALUES
  ('econ-seoul', '서울경제진흥원(SBA)', 'foundation', 'sido', '서울특별시',
   'https://www.sba.seoul.kr/', 'https://seoul.rnbd.kr/client/c030100/c030100_00.jsp', 'html', 50, 'planned', 'medium',
   '2026-07-27 웹검색으로 확인(방문 미검증). "사업공고" 게시판(seoul.rnbd.kr, R&D지원팀 산하)으로 추정. 실제 방문 확인 및 SNS 계정 확인 필요.'),
  ('econ-gyeonggi', '경기도경제과학진흥원(GBSA)', 'foundation', 'sido', '경기도',
   'https://www.gbsa.or.kr/', 'https://pms.gbsa.or.kr/info/pblanc/pblancList.do', 'html', 50, 'planned', 'medium',
   '2026-07-27 웹검색으로 확인(방문 미검증). G-PMS 사업공고 게시판. 실제 방문 확인 및 SNS 계정 확인 필요.'),
  ('econ-busan', '부산경제진흥원(BEPA)', 'foundation', 'sido', '부산광역시',
   'https://www.bepa.kr/', 'https://www.bepa.kr/kor/view.do?no=1508', 'html', 50, 'planned', 'medium',
   '2026-07-27 웹검색으로 확인(방문 미검증). 새소식>공고/공지사항 게시판. 실제 방문 확인 및 SNS 계정 확인 필요.'),
  ('econ-daegu', '대구테크노파크(DGTP)', 'foundation', 'sido', '대구광역시',
   'https://dgtp.or.kr/', 'https://dgtp.or.kr/bbs/BoardControll.do?bbsId=BBSMSTR_000000000003', 'html', 50, 'planned', 'medium',
   '2026-07-27 웹검색으로 확인(방문 미검증). 게시판 URL 패턴 추정치 — 실제 방문해서 "사업공고" 전용 게시판인지 확인 필요. SNS 계정 미확인.'),
  ('econ-incheon', '인천테크노파크(ITP)', 'foundation', 'sido', '인천광역시',
   'https://www.itp.or.kr/', 'https://www.itp.or.kr/intro.asp?tmid=13', 'html', 50, 'planned', 'low',
   '2026-07-27 웹검색으로 확인(방문 미검증). 정확한 사업공고 게시판 목록 URL 미확인 — 비즈오케이(bizok.incheon.go.kr) 포털과 역할이 겹칠 수 있어 후속 확인 필요. SNS 계정 미확인.'),
  ('econ-gwangju', '광주경제고용진흥원(광주경제진흥상생일자리재단)', 'foundation', 'sido', '광주광역시',
   'http://www.gepa.or.kr/main/', 'https://www.gjbizinfo.or.kr/online.do?pageId=www63', 'html', 50, 'planned', 'low',
   '2026-07-27 웹검색으로 확인(방문 미검증). 광주광역시 기업지원시스템(gjbizinfo.or.kr)의 소상공인 지원사업정보 페이지로 대체 등록 — 기관 자체 게시판 URL 미확인. SNS 계정 미확인.'),
  ('econ-daejeon', '대전테크노파크(DJTP)', 'foundation', 'sido', '대전광역시',
   'https://www.djtp.or.kr/', 'https://www.djtp.or.kr/menu.es?mid=a20102000000', 'html', 50, 'planned', 'medium',
   '2026-07-27 웹검색으로 확인(방문 미검증). 일반사업공고 게시판(사업·공고 메뉴). 실제 방문 확인 및 SNS 계정 확인 필요.'),
  ('econ-ulsan', '울산경제진흥원(UEPA)', 'foundation', 'sido', '울산광역시',
   'https://www.uepa.or.kr/', 'https://www.uepa.or.kr/01_support/?mcode=0401010000', 'html', 50, 'planned', 'low',
   '2026-07-27 웹검색으로 확인(방문 미검증). 지원사업 카탈로그(자금지원) 페이지로 등록 — 별도 "새소식/공지사항" 게시판이 있는지 미확인. 참고: 울산신용보증재단(sinbo-ulsan)과 함께 www.ubpi.or.kr(울산경제일자리진흥원)도 검색에 등장 — 동일/별개 기관 관계 확인 필요.'),
  ('econ-sejong', '세종테크노파크(SJTP)', 'foundation', 'sido', '세종특별자치시',
   'https://sjtp.or.kr/', 'https://sjtp.or.kr/', 'html', 45, 'planned', 'low',
   '2026-07-27 웹검색으로 확인(방문 미검증). "사업지원>사업공고" 메뉴가 있다고 하나 정확한 URL 미확인 — 홈페이지만 등록. SNS 계정 미확인.'),
  ('econ-gangwon', '강원테크노파크(GWTP)', 'foundation', 'sido', '강원특별자치도',
   'http://www.technopark.kr/', 'http://www.technopark.kr/businessboard', 'html', 45, 'planned', 'low',
   '2026-07-27 웹검색으로 확인(방문 미검증). "사업공고" 게시판 URL 패턴 추정(businessboard/{id} 형태 발견) — 목록 URL 정확도 미검증. SNS 계정 미확인.'),
  ('econ-chungbuk', '충북테크노파크(CBTP)', 'foundation', 'sido', '충청북도',
   'https://www.cbtp.or.kr/', 'https://www.cbtp.or.kr/index.php?control=bbs&board_id=saup_notice', 'html', 45, 'planned', 'low',
   '2026-07-27 웹검색으로 확인(방문 미검증). 사업공고 게시판(board_id=saup_notice) 패턴 추정. 실제 방문 확인 및 SNS 계정 확인 필요.'),
  ('econ-chungnam', '충남경제진흥원(CEPA)', 'foundation', 'sido', '충청남도',
   'https://www.cepa.or.kr/', 'https://sbiz.cepa.or.kr/', 'html', 50, 'planned', 'low',
   '2026-07-27 웹검색으로 확인(방문 미검증). 충청남도소상공인지원센터(sbiz.cepa.or.kr, CEPA 산하)로 대체 등록 — 정확한 게시판 URL 미확인. SNS 계정 미확인.'),
  ('econ-jeonbuk', '전북특별자치도경제통상진흥원(JBBA)', 'foundation', 'sido', '전북특별자치도',
   'https://www.jbba.kr/', 'https://www.jbba.kr/', 'html', 45, 'planned', 'low',
   '2026-07-27 웹검색으로 확인(방문 미검증). 카카오톡채널(@_WxkxhxfT) 존재 확인. 정확한 게시판 URL 미확인 — 홈페이지만 등록. 전북 중소기업종합지원시스템(jbok.kr)과 역할 겹칠 수 있음.'),
  ('econ-jeonnam', '전라남도중소기업일자리경제진흥원(JEPA)', 'foundation', 'sido', '전라남도',
   'https://www.jepa.kr/', 'https://www.jepa.kr/', 'html', 45, 'planned', 'low',
   '2026-07-27 웹검색으로 확인(방문 미검증). 정확한 게시판 URL 미확인 — 홈페이지만 등록. SNS 계정 미확인.'),
  ('econ-gyeongbuk', '경상북도경제진흥원(GEPA)', 'foundation', 'sido', '경상북도',
   'https://www.gepa.kr/', 'https://www.gepa.kr/', 'html', 45, 'planned', 'low',
   '2026-07-27 웹검색으로 확인(방문 미검증). 정확한 게시판 URL 미확인 — 홈페이지만 등록. SNS 계정 미확인.'),
  ('econ-gyeongnam', '경남테크노파크(GNTP)', 'foundation', 'sido', '경상남도',
   'https://www.gntp.or.kr/', 'https://www.gntp.or.kr/biz/apply', 'html', 45, 'planned', 'low',
   '2026-07-27 웹검색으로 확인(방문 미검증). 지원사업 신청 페이지(biz/apply)로 등록 — 공고 게시판과 역할이 다를 수 있어 후속 확인 필요. SNS 계정 미확인.'),
  ('econ-jeju', '제주특별자치도경제통상진흥원(JBA)', 'foundation', 'sido', '제주특별자치도',
   'http://www.jba.or.kr/', 'https://www.jba.or.kr/279', 'html', 45, 'planned', 'low',
   '2026-07-27 웹검색으로 확인(방문 미검증). 소상공인 경영지원 페이지로 등록. 제주테크노파크(jejutp.or.kr, 별도 기관, R&D 중심)와 역할 구분 필요. SNS 계정 미확인.')
ON CONFLICT (source_slug) DO UPDATE SET
  homepage_url = EXCLUDED.homepage_url,
  list_url = EXCLUDED.list_url,
  notes = EXCLUDED.notes,
  updated_at = now();
