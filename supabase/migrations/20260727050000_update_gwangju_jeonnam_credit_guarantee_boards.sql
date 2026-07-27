-- SNS_INGESTION.md Phase 4 후속 — 지난번(20260727020000) 자동화로 못 뚫었던
-- 광주·전남 신용보증재단의 실제 공고 게시판 URL을 마저 채운다.
--
-- 광주: 인트로 페이지의 "홈페이지 바로가기" 링크가 URL 직접 이동으로는 계속
-- 같은 인트로로 되돌아왔는데, 실제 클릭 이벤트로 진입하니 세션 쿠키가 생기며
-- 정상 진입됨(URL navigate만으로는 안 되고 클릭이 필요한 구조였음).
-- 전남: "재단소개" 메뉴 링크가 실제로는 /jnsinbo/operation/news/notice.do로
-- 연결되는 공지사항 게시판이었음(메뉴 표시 라벨과 실제 목적지가 다름) —
-- 이전엔 JS 탭(href="javascript:;") 쪽만 보고 있어서 놓쳤었다.

UPDATE collection_sources SET
  list_url = 'https://www.gjsinbo.or.kr/?d=notification1',
  notes = '2026-07-27 재확인(실제 클릭으로 인트로 통과): 알림마당>새소식 게시판. SNS 계정은 여전히 못 찾음(네이버 폼 링크만 있음).'
WHERE source_slug = 'sinbo-gwangju';

UPDATE collection_sources SET
  list_url = 'https://www.jnsinbo.or.kr/jnsinbo/operation/news/notice.do',
  notes = '2026-07-27 재확인: "재단소개" 메뉴 라벨의 실제 목적지가 공지사항 게시판이었음. 페이스북(jeonnamsinbo)/인스타그램(jnsinbo_official)은 지난번에 이미 확인됨.'
WHERE source_slug = 'sinbo-jeonnam';
