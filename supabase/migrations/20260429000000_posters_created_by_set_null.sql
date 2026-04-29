-- posters.created_by, approved_by: 사용자 탈퇴 시 NULL 처리
ALTER TABLE posters DROP CONSTRAINT IF EXISTS posters_created_by_fkey;
ALTER TABLE posters ADD CONSTRAINT posters_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE posters DROP CONSTRAINT IF EXISTS posters_approved_by_fkey;
ALTER TABLE posters ADD CONSTRAINT posters_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;
