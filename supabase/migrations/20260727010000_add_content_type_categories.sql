-- SNS_INGESTION.md Phase 2/4 후속 — 카테고리 체계 통합.
--
-- 기존 categories 테이블(이용자용 필터, 8개: 지원금/복지·교육/취업·문화/행사·
-- 주거/금융·소상공인·육아/가족·건강/의료·기타)과 SNS_INGESTION.md Phase 2
-- 분류기가 쓰는 카테고리(10개: 지원사업·채용·공모전·교육강좌·행사모집·입찰·
-- 정책안내·보도자료·생활정보·기타)가 서로 다른 두 체계였다 — 만들면서 기존
-- 체계와 안 맞춰본 실수. 사용자 결정: SNS 분류기 쪽 10개 체계로 통합한다.
--
-- 이번 마이그레이션은 "새 카테고리 추가"만 한다. 기존 449건 게시물의
-- poster_categories 연결은 그대로 둔다 — 옛 카테고리 8개 중 실제로는 서로
-- 다른 성격의 글이 섞여 있어서(모집공고/사기주의/상담프로그램 등), 키워드
-- 휴리스틱으로 지금 재배정하면 이미 공개된 라이브 사이트의 카테고리 필터가
-- 부정확해질 위험이 있다. OPENAI_API_KEY가 들어오면 실제 제목/내용을 LLM으로
-- 읽어 정확하게 재분류한다(Phase 2 "소식" 재분류와 같은 후속 작업).
--
-- "기타"는 이미 CAT_OTHER로 존재하므로 새로 안 만들고 그대로 재사용한다.

INSERT INTO categories (name, code, sort_order) VALUES
  ('지원사업', 'CAT_SUPPORT_PROGRAM', 9),
  ('채용', 'CAT_RECRUITMENT', 10),
  ('공모전', 'CAT_CONTEST', 11),
  ('교육강좌', 'CAT_COURSE', 12),
  ('행사모집', 'CAT_EVENT_RECRUIT', 13),
  ('입찰', 'CAT_BID', 14),
  ('정책안내', 'CAT_POLICY_INFO', 15),
  ('보도자료', 'CAT_PRESS_RELEASE', 16),
  ('생활정보', 'CAT_LIFE_INFO', 17)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order;
