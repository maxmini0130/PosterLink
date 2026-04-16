-- Add role enum and column to profiles
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('user', 'operator', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role user_role DEFAULT 'user';

-- Update RLS for operator access
CREATE POLICY "Operators can manage their own uploads" ON operator_uploads
    FOR ALL USING (auth.uid() = operator_id);

CREATE POLICY "Operators can manage all posters" ON posters
    FOR ALL USING (EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('operator', 'admin')
    ));
