CREATE OR REPLACE FUNCTION increment_points(
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE profiles
  SET
    points = COALESCE(points, 0) + p_amount,
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_points(UUID, INTEGER) TO authenticated;
