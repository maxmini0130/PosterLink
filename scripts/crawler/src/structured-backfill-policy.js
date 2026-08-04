const ORGANIZATION_FIELDS = new Set([
  "organizer_name",
  "application_organization_name",
]);

const USER_FACING_FACT_FIELDS = new Set([
  "eligibility_summary",
  "benefits_summary",
  "application_method",
  "contact_info",
  "event_location",
]);

export function shouldBackfillStructuredField({
  field,
  reviewIssues,
  confidence,
  minConfidence,
  includeUserFacingText,
}) {
  const verifiedTextEligible =
    !reviewIssues && confidence != null && confidence >= minConfidence;

  if (ORGANIZATION_FIELDS.has(field)) return verifiedTextEligible;
  if (USER_FACING_FACT_FIELDS.has(field)) {
    return includeUserFacingText && verifiedTextEligible;
  }
  return true;
}
