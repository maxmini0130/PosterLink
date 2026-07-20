-- ============================================================
-- 임베딩 기반 의미 유사도 추천을 위한 pgvector 인프라
-- text-embedding-3-small (1536차원)로 title+summary를 임베딩해 저장
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE posters ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_posters_embedding
  ON posters USING hnsw (embedding vector_cosine_ops);
