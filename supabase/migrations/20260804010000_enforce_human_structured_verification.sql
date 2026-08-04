-- 사람 검증 완료는 관리자 승인 증거가 있는 경우에만 허용한다.
-- 검증 이후 신뢰 대상 필드나 관계가 바뀌면 자동으로 재검토 상태로 되돌린다.

CREATE OR REPLACE FUNCTION enforce_poster_human_structured_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := auth.uid();
  actor_role TEXT;
  trusted_fields_changed BOOLEAN := false;
  review_changed BOOLEAN := false;
  approval_required BOOLEAN := false;
  review JSONB;
  checks JSONB;
BEGIN
  IF actor_id IS NOT NULL THEN
    SELECT role INTO actor_role
    FROM profiles
    WHERE id = actor_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    trusted_fields_changed := true;
    review_changed := true;
  ELSE
    trusted_fields_changed :=
      OLD.title IS DISTINCT FROM NEW.title
      OR OLD.source_org_name IS DISTINCT FROM NEW.source_org_name
      OR OLD.summary_short IS DISTINCT FROM NEW.summary_short
      OR OLD.summary_long IS DISTINCT FROM NEW.summary_long
      OR OLD.application_start_at IS DISTINCT FROM NEW.application_start_at
      OR OLD.application_end_at IS DISTINCT FROM NEW.application_end_at
      OR OLD.thumbnail_url IS DISTINCT FROM NEW.thumbnail_url
      OR OLD.source_key IS DISTINCT FROM NEW.source_key
      OR OLD.organizer_name IS DISTINCT FROM NEW.organizer_name
      OR OLD.application_organization_name IS DISTINCT FROM NEW.application_organization_name
      OR OLD.deadline_type IS DISTINCT FROM NEW.deadline_type
      OR OLD.event_start_at IS DISTINCT FROM NEW.event_start_at
      OR OLD.event_end_at IS DISTINCT FROM NEW.event_end_at
      OR OLD.eligibility_summary IS DISTINCT FROM NEW.eligibility_summary
      OR OLD.target_age_min IS DISTINCT FROM NEW.target_age_min
      OR OLD.target_age_max IS DISTINCT FROM NEW.target_age_max
      OR OLD.participation_fee IS DISTINCT FROM NEW.participation_fee
      OR OLD.benefits_summary IS DISTINCT FROM NEW.benefits_summary
      OR OLD.recruitment_count IS DISTINCT FROM NEW.recruitment_count
      OR OLD.application_method IS DISTINCT FROM NEW.application_method
      OR OLD.required_documents IS DISTINCT FROM NEW.required_documents
      OR OLD.contact_info IS DISTINCT FROM NEW.contact_info
      OR OLD.event_location IS DISTINCT FROM NEW.event_location;
    review_changed :=
      (OLD.field_verification -> 'humanStructuredVerification')
      IS DISTINCT FROM
      (NEW.field_verification -> 'humanStructuredVerification');
  END IF;

  -- 운영자나 자동 수집이 검증된 사실을 수정하면 저장은 허용하되 신뢰 상태를 해제한다.
  IF TG_OP = 'UPDATE'
    AND OLD.verification_status = 'verified'
    AND NEW.verification_status <> 'verified'
    AND trusted_fields_changed
  THEN
    NEW.field_verification := jsonb_set(
      COALESCE(NEW.field_verification, '{}'::jsonb),
      '{structuredVerificationInvalidation}',
      jsonb_build_object(
        'invalidatedAt', NOW(),
        'invalidatedBy', COALESCE(actor_id::text, 'service_role'),
        'reason', 'trusted_fields_changed'
      ),
      true
    );
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.verification_status = 'verified'
    AND NEW.verification_status = 'verified'
    AND trusted_fields_changed
    AND COALESCE(actor_role, '') NOT IN ('admin', 'super_admin')
  THEN
    NEW.verification_status := 'needs_review';
    NEW.verified_at := NULL;
    NEW.field_verification := jsonb_set(
      COALESCE(NEW.field_verification, '{}'::jsonb),
      '{structuredVerificationInvalidation}',
      jsonb_build_object(
        'invalidatedAt', NOW(),
        'invalidatedBy', COALESCE(actor_id::text, 'service_role'),
        'reason', 'trusted_fields_changed_without_admin_reapproval'
      ),
      true
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    approval_required := NEW.verification_status = 'verified';
  ELSE
    approval_required := NEW.verification_status = 'verified' AND (
      OLD.verification_status IS DISTINCT FROM 'verified'
      OR trusted_fields_changed
      OR review_changed
      OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
    );
  END IF;

  IF approval_required THEN
    IF COALESCE(actor_role, '') NOT IN ('admin', 'super_admin') THEN
      RAISE EXCEPTION 'human structured verification requires an administrator';
    END IF;

    review := COALESCE(NEW.field_verification, '{}'::jsonb) -> 'humanStructuredVerification';
    checks := review -> 'checks';

    IF NEW.verified_at IS NULL
      OR jsonb_typeof(review) IS DISTINCT FROM 'object'
      OR jsonb_typeof(checks) IS DISTINCT FROM 'object'
      OR NULLIF(BTRIM(review ->> 'note'), '') IS NULL
      OR NULLIF(BTRIM(review ->> 'reviewedAt'), '') IS NULL
      OR review ->> 'reviewedBy' IS DISTINCT FROM actor_id::text
      OR COALESCE((checks ->> 'imageMatchesNotice')::boolean, false) IS NOT TRUE
      OR COALESCE((checks ->> 'titleAndOrganizations')::boolean, false) IS NOT TRUE
      OR COALESCE((checks ->> 'applicationSchedule')::boolean, false) IS NOT TRUE
      OR COALESCE((checks ->> 'eligibilityAndBenefits')::boolean, false) IS NOT TRUE
      OR COALESCE((checks ->> 'applicationAndContact')::boolean, false) IS NOT TRUE
      OR COALESCE((checks ->> 'officialLinks')::boolean, false) IS NOT TRUE
      OR COALESCE(review ->> 'officialNoticeUrl', '') !~* '^https?://'
    THEN
      RAISE EXCEPTION 'complete human structured verification evidence is required';
    END IF;
  END IF;

  IF NEW.verification_status <> 'verified' THEN
    NEW.verified_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_poster_human_structured_verification ON posters;
CREATE TRIGGER trg_enforce_poster_human_structured_verification
BEFORE INSERT OR UPDATE ON posters
FOR EACH ROW
EXECUTE FUNCTION enforce_poster_human_structured_verification();

CREATE OR REPLACE FUNCTION invalidate_poster_human_structured_verification_from_relation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_poster_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_poster_id := OLD.poster_id;
  ELSE
    target_poster_id := NEW.poster_id;
  END IF;

  UPDATE posters
  SET
    verification_status = 'needs_review',
    verified_at = NULL,
    field_verification = jsonb_set(
      COALESCE(field_verification, '{}'::jsonb),
      '{structuredVerificationInvalidation}',
      jsonb_build_object(
        'invalidatedAt', NOW(),
        'invalidatedBy', COALESCE(auth.uid()::text, 'service_role'),
        'reason', TG_TABLE_NAME || '_changed'
      ),
      true
    )
  WHERE id = target_poster_id
    AND verification_status = 'verified';

  IF TG_OP = 'UPDATE' AND OLD.poster_id IS DISTINCT FROM NEW.poster_id THEN
    UPDATE posters
    SET
      verification_status = 'needs_review',
      verified_at = NULL,
      field_verification = jsonb_set(
        COALESCE(field_verification, '{}'::jsonb),
        '{structuredVerificationInvalidation}',
        jsonb_build_object(
          'invalidatedAt', NOW(),
          'invalidatedBy', COALESCE(auth.uid()::text, 'service_role'),
          'reason', TG_TABLE_NAME || '_changed'
        ),
        true
      )
    WHERE id = OLD.poster_id
      AND verification_status = 'verified';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidate_verified_poster_links ON poster_links;
CREATE TRIGGER trg_invalidate_verified_poster_links
AFTER INSERT OR UPDATE OR DELETE ON poster_links
FOR EACH ROW EXECUTE FUNCTION invalidate_poster_human_structured_verification_from_relation();

DROP TRIGGER IF EXISTS trg_invalidate_verified_poster_categories ON poster_categories;
CREATE TRIGGER trg_invalidate_verified_poster_categories
AFTER INSERT OR UPDATE OR DELETE ON poster_categories
FOR EACH ROW EXECUTE FUNCTION invalidate_poster_human_structured_verification_from_relation();

DROP TRIGGER IF EXISTS trg_invalidate_verified_poster_regions ON poster_regions;
CREATE TRIGGER trg_invalidate_verified_poster_regions
AFTER INSERT OR UPDATE OR DELETE ON poster_regions
FOR EACH ROW EXECUTE FUNCTION invalidate_poster_human_structured_verification_from_relation();

DROP TRIGGER IF EXISTS trg_invalidate_verified_poster_images ON poster_images;
CREATE TRIGGER trg_invalidate_verified_poster_images
AFTER INSERT OR UPDATE OR DELETE ON poster_images
FOR EACH ROW EXECUTE FUNCTION invalidate_poster_human_structured_verification_from_relation();

COMMENT ON FUNCTION enforce_poster_human_structured_verification() IS
  '관리자 체크리스트 증거가 있는 사람 검증만 허용하고 검증 이후 사실 변경 시 재검토를 강제한다.';
