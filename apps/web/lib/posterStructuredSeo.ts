import {
  hasVerifiedPosterStructuredData,
  type PosterStructuredTrustInput,
} from "./posterStructuredTrust";

export type PosterStructuredSeoInput = PosterStructuredTrustInput & {
  title: string;
  source_org_name?: string | null;
  summary_short?: string | null;
  summary_long?: string | null;
  application_start_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  categoryName?: string | null;
  regionName?: string | null;
};

type PosterStructuredSeoOptions = {
  pageUrl: string;
  imageUrls?: string[];
  primaryLinkUrl?: string | null;
};

function plainText(value?: string | null) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validDate(value?: string | null) {
  return value && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function buildPosterStructuredSeoData(
  poster: PosterStructuredSeoInput,
  options: PosterStructuredSeoOptions,
) {
  const imageUrls = options.imageUrls ?? [];
  const description = plainText(poster.summary_short || poster.summary_long).slice(0, 300);
  const verified = hasVerifiedPosterStructuredData(poster);
  const organizationName = verified
    ? plainText(poster.organizer_name) || plainText(poster.source_org_name)
    : plainText(poster.source_org_name);
  const applicationStartAt = verified ? validDate(poster.application_start_at) : null;
  const applicationEndAt = verified && poster.deadline_type === "fixed"
    ? validDate(poster.application_end_at)
    : null;
  const eventStartAt = verified ? validDate(poster.event_start_at) : null;
  const eventEndAt = verified ? validDate(poster.event_end_at) : null;
  const eligibilitySummary = verified ? plainText(poster.eligibility_summary) : "";
  const eventLocation = verified ? plainText(poster.event_location) : "";
  const articleId = `${options.pageUrl}#article`;

  const article = {
    "@type": "Article",
    "@id": articleId,
    headline: poster.title,
    description,
    url: options.pageUrl,
    mainEntityOfPage: options.pageUrl,
    inLanguage: "ko-KR",
    ...(organizationName
      ? { publisher: { "@type": "Organization", name: organizationName } }
      : {}),
    ...(poster.created_at ? { datePublished: poster.created_at } : {}),
    ...(poster.updated_at ? { dateModified: poster.updated_at } : {}),
    ...(applicationEndAt ? { expires: applicationEndAt } : {}),
    ...(applicationStartAt || applicationEndAt
      ? { temporalCoverage: `${applicationStartAt ?? ""}/${applicationEndAt ?? ""}` }
      : {}),
    ...(eligibilitySummary
      ? { audience: { "@type": "Audience", audienceType: eligibilitySummary } }
      : {}),
    ...(eventLocation
      ? { contentLocation: { "@type": "Place", name: eventLocation } }
      : {}),
    ...(imageUrls.length > 0 ? { image: imageUrls } : {}),
    ...(options.primaryLinkUrl ? { sameAs: [options.primaryLinkUrl] } : {}),
    about: [poster.categoryName, poster.regionName].filter(Boolean),
  };

  if (!eventStartAt) {
    return { "@context": "https://schema.org", ...article };
  }

  const eventId = `${options.pageUrl}#event`;
  const event = {
    "@type": "Event",
    "@id": eventId,
    name: poster.title,
    description,
    url: options.pageUrl,
    startDate: eventStartAt,
    ...(eventEndAt ? { endDate: eventEndAt } : {}),
    ...(organizationName
      ? { organizer: { "@type": "Organization", name: organizationName } }
      : {}),
    ...(eventLocation ? { location: { "@type": "Place", name: eventLocation } } : {}),
    ...(eligibilitySummary
      ? { audience: { "@type": "Audience", audienceType: eligibilitySummary } }
      : {}),
    ...(imageUrls.length > 0 ? { image: imageUrls } : {}),
  };

  return {
    "@context": "https://schema.org",
    "@graph": [
      { ...article, mainEntity: { "@id": eventId } },
      event,
    ],
  };
}
