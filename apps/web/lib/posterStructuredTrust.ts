export type PosterStructuredTrustInput = {
  verification_status?: string | null;
  verified_at?: string | null;
  deadline_type?: string | null;
  application_end_at?: string | null;
  event_start_at?: string | null;
  event_end_at?: string | null;
  organizer_name?: string | null;
  application_organization_name?: string | null;
  eligibility_summary?: string | null;
  benefits_summary?: string | null;
  application_method?: string | null;
  required_documents?: string | null;
  contact_info?: string | null;
  event_location?: string | null;
};

export type VerifiedPosterCalendarSource = {
  kind: "event" | "deadline";
  startAt: string;
  endAt: string | null;
};

function isValidDate(value?: string | null) {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}

function hasText(value?: string | null) {
  return Boolean(value?.trim());
}

export function hasVerifiedPosterStructuredData(poster: PosterStructuredTrustInput) {
  return poster.verification_status === "verified" && isValidDate(poster.verified_at);
}

export function getVerifiedPosterCalendarSource(
  poster: PosterStructuredTrustInput,
): VerifiedPosterCalendarSource | null {
  if (!hasVerifiedPosterStructuredData(poster)) return null;

  if (isValidDate(poster.event_start_at)) {
    return {
      kind: "event",
      startAt: poster.event_start_at!,
      endAt: isValidDate(poster.event_end_at) ? poster.event_end_at! : null,
    };
  }

  if (poster.deadline_type === "fixed" && isValidDate(poster.application_end_at)) {
    return {
      kind: "deadline",
      startAt: poster.application_end_at!,
      endAt: null,
    };
  }

  return null;
}

export function isVerifiedPosterDeadlineNotificationReady(
  poster: PosterStructuredTrustInput,
) {
  return (
    hasVerifiedPosterStructuredData(poster) &&
    poster.deadline_type === "fixed" &&
    isValidDate(poster.application_end_at)
  );
}

export function isVerifiedPosterSeoReady(poster: PosterStructuredTrustInput) {
  if (!hasVerifiedPosterStructuredData(poster)) return false;

  return (
    isValidDate(poster.application_end_at) ||
    isValidDate(poster.event_start_at) ||
    [
      poster.organizer_name,
      poster.application_organization_name,
      poster.eligibility_summary,
      poster.benefits_summary,
      poster.application_method,
      poster.required_documents,
      poster.contact_info,
      poster.event_location,
    ].some(hasText)
  );
}

export function getPosterStructuredReadiness(poster: PosterStructuredTrustInput) {
  const verified = hasVerifiedPosterStructuredData(poster);
  return {
    verified,
    seoReady: isVerifiedPosterSeoReady(poster),
    calendarReady: getVerifiedPosterCalendarSource(poster) !== null,
    deadlineNotificationReady: isVerifiedPosterDeadlineNotificationReady(poster),
  };
}
