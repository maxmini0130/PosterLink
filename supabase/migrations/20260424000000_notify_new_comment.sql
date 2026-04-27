-- 댓글 작성 시 포스터 created_by 사용자에게 알림 생성
CREATE OR REPLACE FUNCTION notify_poster_owner_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id uuid;
  v_poster_title text;
BEGIN
  -- 포스터 소유자 및 제목 조회
  SELECT created_by, title
    INTO v_owner_id, v_poster_title
    FROM posters
   WHERE id = NEW.poster_id;

  -- 소유자가 없거나 댓글 작성자 본인이면 알림 생략
  IF v_owner_id IS NULL OR v_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, type, title, body, link_url)
  VALUES (
    v_owner_id,
    'new_comment',
    '새 댓글이 달렸습니다',
    v_poster_title || ' 에 새 댓글이 작성되었습니다.',
    '/posters/' || NEW.poster_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_comment ON comments;
CREATE TRIGGER trg_notify_comment
  AFTER INSERT ON comments
  FOR EACH ROW
  WHEN (NEW.status = 'normal')
  EXECUTE FUNCTION notify_poster_owner_on_comment();
