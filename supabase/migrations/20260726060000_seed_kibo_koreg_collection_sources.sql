-- SNS_INGESTION.md Phase 4 — beachhead 기관: 기술보증기금(기보), 신용보증재단중앙회.
--
-- 둘 다 실사이트 방문으로 확인(2026-07-26).
-- 기술보증기금: kibo.or.kr은 스플래시 페이지라 실제 사이트는 kibo.or.kr/main/index.do.
--   네이버블로그·인스타·유튜브 전부 실제 방문해서 확인, RSS도 직접 검증.
-- 신용보증재단중앙회(KOREG): 세종시 소재, 17개 시도 지역신용보증재단의 중앙회.
--   중앙회 자체는 직접 공고를 내지 않고 "신용보증재단 찾기"로 지역 재단을
--   안내하는 역할이라 SNS/공고 게시판이 없음 — 지역별 17개 재단은 각각 별도
--   법인/사이트라 이번엔 등록하지 않고 후속 작업으로 남긴다(아래 notes 참고).

INSERT INTO collection_sources (
  source_slug, name, source_type, region_scope, region_name,
  homepage_url, list_url, collection_method, priority, status, reliability,
  naver_blog_id, notes
) VALUES (
  'kibo', '기술보증기금', 'central_portal', 'national', '전국',
  'https://www.kibo.or.kr/main/index.do',
  'https://www.kibo.or.kr/main/board/boardType01.do',
  'html', 80, 'planned', 'high', 'techkibo',
  '2026-07-26 실사이트 방문 검증(kibo.or.kr은 스플래시 페이지, 실제는 kibo.or.kr/main). instagram=techkibo, youtube=UCMF6s380uQOSNRcs231MJ5g(컬럼 없어 notes에만 기록). 공지사항 게시판에 채용/모집 공고와 일반 공지가 섞여있음.'
),
(
  'koreg', '신용보증재단중앙회', 'central_portal', 'national', '전국',
  'https://www.koreg.or.kr/intro/main.do', 'https://www.koreg.or.kr/intro/main.do',
  'manual', 40, 'planned', 'low', NULL,
  '2026-07-26 실사이트 방문 확인. 중앙회 자체는 공고 게시판/SNS 없음(지역 재단 안내 역할만). '
  '17개 시도 지역신용보증재단(서울신보, 경기신보 등)은 각각 별도 법인·별도 사이트라 '
  '이번 라운드에 등록하지 못함 — 개별 확인 필요한 후속 작업(WORK_LOG 참고).'
)
ON CONFLICT (source_slug) DO UPDATE SET
  homepage_url = EXCLUDED.homepage_url,
  list_url = EXCLUDED.list_url,
  naver_blog_id = EXCLUDED.naver_blog_id,
  notes = EXCLUDED.notes,
  updated_at = now();

UPDATE collection_sources
SET instagram_id = 'techkibo'
WHERE source_slug = 'kibo';
