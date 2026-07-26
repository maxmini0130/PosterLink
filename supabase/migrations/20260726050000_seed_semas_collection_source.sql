-- SNS_INGESTION.md Phase 4 — beachhead 기관: 소상공인시장진흥공단.
--
-- semas.or.kr 실사이트 방문으로 확인(2026-07-26): "지역본부"는 물리적 사무소
-- 구분일 뿐 별도 웹사이트/게시판이 아니라 semas.or.kr 하나로 통합 운영되므로
-- (지역본부 12개+본부, 전국 소상공인지원센터 60여개는 전부 같은 사이트 안의
-- "찾아오시는길" 정보), 기관 인벤토리에는 중앙 포털 1건으로 등록한다.
-- 사업공고 게시판·SNS 계정 전부 실제 방문해서 확인.

INSERT INTO collection_sources (
  source_slug, name, source_type, region_scope, region_name,
  homepage_url, list_url, collection_method, priority, status, reliability,
  naver_blog_id, notes
) VALUES (
  'semas', '소상공인시장진흥공단', 'central_portal', 'national', '전국',
  'https://www.semas.or.kr/',
  'https://www.semas.or.kr/web/board/webBoardList.kmdc?bCd=2001&pNm=BOA0101',
  'html', 88, 'planned', 'high', 'marketagency',
  '2026-07-26 실사이트 방문 검증. "지역본부"는 물리적 사무소일 뿐 별도 사이트 없음(semas.or.kr 하나로 통합). facebook=semas.korea, instagram=semas_2014, youtube=semas2014(collection_sources에 컬럼 없어 notes에만 기록).'
)
ON CONFLICT (source_slug) DO UPDATE SET
  homepage_url = EXCLUDED.homepage_url,
  list_url = EXCLUDED.list_url,
  naver_blog_id = EXCLUDED.naver_blog_id,
  notes = EXCLUDED.notes,
  updated_at = now();

UPDATE collection_sources
SET facebook_id = 'semas.korea', instagram_id = 'semas_2014'
WHERE source_slug = 'semas';
