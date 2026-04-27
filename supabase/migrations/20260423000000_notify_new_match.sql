-- notify_new_match_on_publish
-- 포스터가 review → published 로 승인될 때,
-- 관심 카테고리 또는 관심 지역이 일치하는 사용자에게 new_match 알림을 생성한다.
-- SECURITY DEFINER 로 실행되므로 notifications INSERT RLS 정책 없이 동작한다.

CREATE OR REPLACE FUNCTION notify_new_match_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_ids UUID[];
  v_region_ids   UUID[];
BEGIN
  IF NEW.poster_status = 'published' AND (OLD.poster_status IS DISTINCT FROM 'published') THEN

    SELECT ARRAY_AGG(category_id) INTO v_category_ids
    FROM poster_categories WHERE poster_id = NEW.id;

    SELECT ARRAY_AGG(region_id) INTO v_region_ids
    FROM poster_regions WHERE poster_id = NEW.id;

    INSERT INTO notifications (user_id, type, title, body, target_type, target_id)
    SELECT DISTINCT p.id,
      'new_match',
      '🎯 새 포스터 알림',
      '관심 분야·지역에 새 포스터가 등록됐어요: ' || NEW.title,
      'poster',
      NEW.id
    FROM profiles p
    WHERE
      -- 등록자 본인 제외
      p.id IS DISTINCT FROM NEW.created_by
      -- 알림 수신 동의한 사용자만
      AND p.is_notified = true
      -- 카테고리 또는 지역 매칭
      AND (
        (v_category_ids IS NOT NULL AND EXISTS (
          SELECT 1 FROM user_interest_categories uic
          WHERE uic.user_id = p.id AND uic.category_id = ANY(v_category_ids)
        ))
        OR
        (v_region_ids IS NOT NULL AND p.primary_region_id = ANY(v_region_ids))
      )
      -- 같은 포스터에 대한 중복 알림 방지
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.user_id = p.id AND n.type = 'new_match' AND n.target_id = NEW.id
      );

  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_match ON posters;
CREATE TRIGGER trg_notify_new_match
  AFTER UPDATE ON posters
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_match_on_publish();

NOTIFY pgrst, 'reload schema';
