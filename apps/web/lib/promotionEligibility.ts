import { isPosterAcceptingApplications } from "./posterApplication";

type PromotionPoster = {
  application_start_at?: string | null;
  application_end_at?: string | null;
  deadline_type?: string | null;
  event_end_at?: string | null;
  deadline_review?: {
    endAt?: string | null;
    decision?: string;
    promotionEligible?: boolean;
  } | null;
  date_quality_decision?: string | null;
  date_issues?: unknown[] | null;
};

// Promotion is a stronger claim than public archival availability. Keep search
// and archived detail access independent from this extra landing-page gate.
export function isPosterEligibleForPromotion(poster: PromotionPoster) {
  if (poster.deadline_review?.promotionEligible === false) return false;
  const reviewed =
    poster.deadline_review?.decision === "confirmed" &&
    Boolean(poster.deadline_review.endAt) &&
    Date.parse(poster.deadline_review.endAt!) ===
      Date.parse(poster.application_end_at ?? "");
  if (
    !reviewed &&
    (poster.date_quality_decision === "review" ||
      (poster.date_issues?.length ?? 0) > 0)
  )
    return false;
  return isPosterAcceptingApplications({
    applicationStartAt: poster.application_start_at,
    applicationEndAt: poster.application_end_at,
    deadlineType: poster.deadline_type,
    eventEndAt: poster.event_end_at,
  });
}
