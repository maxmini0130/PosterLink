-- profiles에 포인트 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0;

-- 포스터 등록 요청 테이블
CREATE TABLE IF NOT EXISTS poster_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  image_url TEXT,
  location TEXT,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  poster_id UUID REFERENCES posters(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poster_requests_requester
  ON poster_requests(requester_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_poster_requests_status
  ON poster_requests(status, created_at DESC);

-- 포인트 내역 테이블
CREATE TABLE IF NOT EXISTS point_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_point_logs_user
  ON point_logs(user_id, created_at DESC);

-- RLS
ALTER TABLE poster_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_logs ENABLE ROW LEVEL SECURITY;

-- poster_requests: 본인 등록/조회, 관리자 전체
DROP POLICY IF EXISTS "poster_requests_insert" ON poster_requests;
CREATE POLICY "poster_requests_insert"
  ON poster_requests FOR INSERT
  WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS "poster_requests_select_own" ON poster_requests;
CREATE POLICY "poster_requests_select_own"
  ON poster_requests FOR SELECT
  USING (requester_id = auth.uid());

DROP POLICY IF EXISTS "poster_requests_admin_all" ON poster_requests;
CREATE POLICY "poster_requests_admin_all"
  ON poster_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- point_logs: 본인 조회, 관리자 전체
DROP POLICY IF EXISTS "point_logs_select_own" ON point_logs;
CREATE POLICY "point_logs_select_own"
  ON point_logs FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "point_logs_admin_all" ON point_logs;
CREATE POLICY "point_logs_admin_all"
  ON point_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Supabase Storage: poster-requests 버킷 (이미 있으면 무시)
INSERT INTO storage.buckets (id, name, public)
VALUES ('poster-requests', 'poster-requests', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: 로그인 사용자 업로드 허용
DROP POLICY IF EXISTS "poster_requests_upload" ON storage.objects;
CREATE POLICY "poster_requests_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'poster-requests' AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "poster_requests_public_read" ON storage.objects;
CREATE POLICY "poster_requests_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'poster-requests');
