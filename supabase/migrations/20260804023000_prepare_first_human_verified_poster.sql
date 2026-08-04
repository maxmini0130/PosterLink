-- 첫 사람 검증 후보를 공식 공고와 실제 포스터 기준으로 정리한다.
-- 사람 검증 상태와 증거는 관리자가 화면에서 직접 승인하기 전까지 만들지 않는다.

UPDATE posters
SET
  source_org_name = '청년몽땅정보통',
  organizer_name = '을지유니크팩토리',
  application_organization_name = '을지유니크팩토리',
  application_start_at = TIMESTAMPTZ '2026-07-20 00:00:00+09',
  application_end_at = TIMESTAMPTZ '2026-08-10 23:59:59+09',
  deadline_type = 'fixed',
  event_start_at = TIMESTAMPTZ '2026-08-18 14:00:00+09',
  event_end_at = TIMESTAMPTZ '2026-08-25 16:30:00+09',
  eligibility_summary = '죽음을 상상하며 살고 싶은 삶을 기획할 만 15~39세 청년',
  target_age_min = 15,
  target_age_max = 39,
  participation_fee = '전액 무료',
  benefits_summary = '창의적 글쓰기 방법론을 활용한 엔딩라이팅 워크숍 2회 참여',
  recruitment_count = '15명(미취업 청년 우선 선발)',
  application_method = 'Google Forms 온라인 신청',
  required_documents = NULL,
  contact_info = '카카오톡 채널 https://pf.kakao.com/_ytIPn/',
  event_location = '을지유니크팩토리(서울 중구 을지로 170, 을지로4가역 10번 출구 B2층)',
  summary_short = '만 15~39세 청년을 위한 엔딩라이팅 워크숍입니다. 8월 18일과 25일 14:00~16:30에 2회 진행하며, 15명을 모집합니다.',
  summary_long = E'죽음을 상상하며 인생을 기획하는 엔딩라이팅 워크숍입니다.\n대상: 만 15~39세 청년\n인원: 15명(미취업 청년 우선 선발)\n일정: 2026년 8월 18일·25일 14:00~16:30, 총 2회\n장소: 을지유니크팩토리(서울 중구 을지로 170 B2층)\n신청: 2026년 8월 10일까지 Google Forms 온라인 신청\n비용: 전액 무료\n선정 안내: 프로그램 시작 5일 전\n문의: https://pf.kakao.com/_ytIPn/',
  verification_status = 'needs_review',
  verified_at = NULL,
  data_confidence = 0.950,
  source_institution_id = resolve_poster_source_institution(
    '청년몽땅정보통',
    source_key
  ),
  organizer_id = NULL,
  application_institution_id = NULL,
  field_verification = JSONB_SET(
    COALESCE(field_verification, '{}'::jsonb),
    '{aiStructuredPreparation}',
    JSONB_BUILD_OBJECT(
      'preparedAt', NOW(),
      'source', 'official_notice_and_poster_comparison',
      'officialNoticeUrl', 'https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=72280',
      'status', 'awaiting_human_verification',
      'changedFields', JSONB_BUILD_ARRAY(
        'source_org_name',
        'organizer_name',
        'application_organization_name',
        'application_start_at',
        'application_end_at',
        'event_start_at',
        'event_end_at',
        'eligibility_summary',
        'target_age_min',
        'target_age_max',
        'participation_fee',
        'benefits_summary',
        'recruitment_count',
        'application_method',
        'contact_info',
        'event_location',
        'summary_short',
        'summary_long'
      ),
      'removedNonPosterImage', 'https://zxndgzsfrgwahwsdbjdj.supabase.co/storage/v1/object/public/poster-originals/crawler/1f25a0d0602c5182b251b82d.png',
      'removedInternalFormLinks', JSONB_BUILD_ARRAY(
        'https://docs.google.com/forms/d/e/1FAIpQLSdm7ZpnW6RSD12FwrAg-bpl4D7St4xqhcOqik_0FODd9a8F1g/abuse',
        'https://www.google.com/forms/about/?utm_source=product&utm_medium=forms_logo&utm_campaign=forms'
      )
    ),
    true
  )
WHERE id = 'dd64555d-2de7-428a-8fc2-13e4200df562';

DELETE FROM poster_links
WHERE poster_id = 'dd64555d-2de7-428a-8fc2-13e4200df562'
  AND (
    url ~* '/abuse/?$'
    OR url ~* '^https?://(www\.)?google\.com/forms/about/'
  );

DELETE FROM poster_images
WHERE poster_id = 'dd64555d-2de7-428a-8fc2-13e4200df562'
  AND storage_path = 'https://zxndgzsfrgwahwsdbjdj.supabase.co/storage/v1/object/public/poster-originals/crawler/1f25a0d0602c5182b251b82d.png';

