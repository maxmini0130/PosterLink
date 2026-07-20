import { evaluatePosterDateQuality } from "./poster-date-quality.js";
import {
  normalizeDateKey,
  normalizeImageIdentity,
  normalizePosterOrg,
  normalizePosterTitle,
} from "./poster-duplicate-detector.js";

const BAD_IMAGE_PATTERNS = [
  /(?:^|[/$_.-])wa[_-]?mark(?:[/$_.-]|$)/i,
  /web[_-]?accessibility|accessibility[_-]?mark|wa[_-]?cert|wa[_-]?logo/i,
  /favicon|sprite|(?:^|[/$_.-])logo(?:[/$_.-]|$)|(?:^|[/$_.-])icon(?:[/$_.-]|$)/i,
  /(?:^|[/$_.-])btn(?:[/$_.-]|$)|(?:^|[/$_.-])button(?:[/$_.-]|$)|sns|facebook|twitter|instagram|youtube|kakao/i,
  /calendar|schedule|timetable/i,
];

const TEXT_RULES = [
  {
    code: "system-error",
    severity: "high",
    decision: "reject",
    pattern: /\uC2DC\uC2A4\uD15C\s*\uC624\uB958|\uC2DC\uC2A4\uD15C\uC624\uB958/i,
    reason: "system error text was captured instead of poster content",
  },
  {
    code: "web-accessibility",
    severity: "high",
    decision: "reject",
    pattern: /\uC6F9\s*\uC811\uADFC\uC131|\uC6F9\uC811\uADFC\uC131|\uC811\uADFC\uC131\s*\uC778\uC99D|\uD488\uC9C8\s*\uC778\uC99D\s*\uB9C8\uD06C|\uB300\uCCB4\s*\uD14D\uC2A4\uD2B8|\bWA\s*\uB9C8\uD06C/i,
    reason: "web accessibility/certification mark content is not a poster",
  },
  {
    code: "facility-use",
    severity: "medium",
    decision: "reject",
    pattern: /(?:\uBC30\uB4DC\uBBFC\uD134|\uBCFC\uB9C1\uC7A5|\uC885\uD569\uCCB4\uC721\uAD00|\uCCB4\uC721\uAD00|\uC218\uC601\uC7A5|\uD5EC\uC2A4\uC7A5|\uB300\uAD00).*(?:\uBD80\uBD84\s*\uC6B4\uC601\uC77C|\uBC95\uC815\s*\uACF5\uD734\uC77C|\uC6B4\uC601\s*\uC548\uB0B4|\uC774\uC6A9\s*\uC2DC\uAC04|\uC774\uC6A9\s*\uC548\uB0B4|\uC2DC\uAC04\uD45C|\uC77C\uC815\uD45C|\uB300\uAD00)|(?:\uBD80\uBD84\s*\uC6B4\uC601\uC77C|\uBC95\uC815\s*\uACF5\uD734\uC77C|\uC6B4\uC601\s*\uC548\uB0B4|\uC774\uC6A9\s*\uC2DC\uAC04|\uC774\uC6A9\s*\uC548\uB0B4|\uC2DC\uAC04\uD45C|\uC77C\uC815\uD45C|\uB300\uAD00).*(?:\uBC30\uB4DC\uBBFC\uD134|\uBCFC\uB9C1\uC7A5|\uC885\uD569\uCCB4\uC721\uAD00|\uCCB4\uC721\uAD00|\uC218\uC601\uC7A5|\uD5EC\uC2A4\uC7A5|\uB300\uAD00)|(?:\uBD80\uBD84\s*\uC6B4\uC601\uC77C|\uBC95\uC815\s*\uACF5\uD734\uC77C).*(?:\uC774\uC6A9\s*\uC548\uB0B4|\uC6B4\uC601\s*\uC548\uB0B4|\uC774\uC6A9\s*\uC2DC\uAC04)|\uD68C\uC6D0\s*\uC811\uC218.*\uC774\uC6A9\s*\uC548\uB0B4/i,
    reason: "facility operation/use notice is not a poster",
  },
  {
    code: "parking-or-homepage",
    severity: "medium",
    decision: "reject",
    pattern: /\uD648\uD398\uC774\uC9C0.*(?:\uC8FC\uCC28\s*\uD1B5\uC81C|\uC8FC\uCC28\uC7A5|\uC774\uC6A9\s*\uC548\uB0B4)|(?:\uC8FC\uCC28\s*\uD1B5\uC81C|\uC8FC\uCC28\uC7A5|\uC8FC\uCC28\s*\uC774\uC6A9\s*\uC81C\uD55C).*(?:\uD648\uD398\uC774\uC9C0|\uC774\uC6A9\s*\uC548\uB0B4|\uC2DC\uC124|\uC13C\uD130)/i,
    reason: "homepage or parking-control notice is not a poster",
  },
  {
    code: "election-facility",
    severity: "medium",
    decision: "reject",
    pattern: /\uC804\uAD6D\s*\uB3D9\uC2DC\s*\uC9C0\uBC29\uC120\uAC70|\uC804\uAD6D\uB3D9\uC2DC\uC9C0\uBC29\uC120\uAC70|\uC9C0\uBC29\uC120\uAC70.*(?:\uC2DC\uC124|\uC8FC\uCC28|\uD658\uBD88|\uC774\uC6A9\s*\uC81C\uD55C|\uC548\uB0B4)/i,
    reason: "election/facility administrative notice is not a poster",
  },
  {
    code: "monthly-schedule",
    severity: "medium",
    decision: "reject",
    scope: "title",
    pattern: /(?:\d{1,2}\s*\uC6D4|[0-9]{2}\s*\uC6D4).*(?:\uC2DC\uAC04\uD45C|\uC77C\uC815\uD45C|\uB300\uAD00\s*\uC77C\uC815|\uAD00\uB0B4\s*\uB300\uAD00|\uBD80\uBD84\s*\uC6B4\uC601\uC77C|\uBC95\uC815\s*\uACF5\uD734\uC77C)|(?:\uC2DC\uAC04\uD45C|\uC77C\uC815\uD45C|\uB300\uAD00\s*\uC77C\uC815|\uAD00\uB0B4\s*\uB300\uAD00|\uBD80\uBD84\s*\uC6B4\uC601\uC77C|\uBC95\uC815\s*\uACF5\uD734\uC77C).*(?:\d{1,2}\s*\uC6D4|[0-9]{2}\s*\uC6D4)/i,
    reason: "monthly schedule/table is not an individual poster",
  },
  {
    code: "public-workfare-doc",
    severity: "medium",
    decision: "reject",
    pattern: /\uC9C0\uC5ED\s*\uACF5\uB3D9\uCCB4\s*\uC77C\uC790\uB9AC\s*\uC0AC\uC5C5.*\uCC38\uC5EC\uC790\s*\uBAA8\uC9D1|\uACF5\uACF5\uADFC\uB85C.*\uCC38\uC5EC\uC790\s*\uBAA8\uC9D1/i,
    reason: "administrative recruitment document is not a poster",
  },
  {
    code: "known-source-title-risk",
    severity: "medium",
    decision: "review",
    pattern: /\uB3D9\uC544\uC77C\uBCF4|\uC5D0\uB4C0\uC70C|\uC5D0\uC774\uBE14\uB7F0/i,
    reason: "known source/provider names need title/content confirmation",
  },
];

const GENERIC_TITLE_PATTERNS = [
  /^\s*$/i,
  /^\uACF5\uC9C0\uC0AC\uD56D$/i,
  /^\uCC44\uC6A9\uACF5\uACE0$/i,
  /^\uC790\uC138\uD788\s*\uBCF4\uAE30$/i,
  /^\uC791\uC131\uC790$/i,
  /^\uAD00\uB9AC\uC790$/i,
  /^\uBC88\uD638$/i,
  /^\uC81C\uBAA9$/i,
  /^\uCCA8\uBD80\uD30C\uC77C$/i,
  /^maposc$/i,
  /^@\uCCAD\uB144\uBABD\uB545\uC815\uBCF4\uD1B5$/i,
  /^\uB3D9\uC544\uC77C\uBCF4$/i,
  /^\(\uC8FC\)\uC5D0\uB4C0\uC70C$/i,
  /^\uC5D0\uC774\uBE14\uB7F0(?:\s*\uC548\uB0B4)?$/i,
  /^\uC11C\uC6B8\uD2B9\uBCC4\uC2DC\s+\S+\uAD6C$/i,
];

const REJECT_CODES = new Set([
  "missing-title",
  "generic-title",
  "breadcrumb-title",
  "mojibake",
  "system-error",
  "web-accessibility",
  "bad-image-url",
  "missing-image",
  "facility-use",
  "parking-or-homepage",
  "election-facility",
  "monthly-schedule",
  "public-workfare-doc",
  "image-not-poster",
  "image-content-mismatch",
]);

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeUrl(value) {
  return String(value ?? "").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getImageUrl(image) {
  if (!image) return "";
  if (typeof image === "string") return image;
  return image.storage_path ?? image.url ?? image.image_url ?? "";
}

function getLinkUrl(link) {
  if (!link) return "";
  if (typeof link === "string") return link;
  return link.url ?? "";
}

function addIssue(issues, code, severity, reason, evidence = "", decision = "review") {
  issues.push({
    code,
    severity,
    decision,
    reason,
    evidence: compact(evidence).slice(0, 240),
  });
}

function hostOf(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hasMojibake(value) {
  const text = String(value ?? "");
  return /[\uFFFD]|\u5360|\uFFFD/.test(text);
}

function getVerification(input = {}) {
  return {
    imageClassification: input.imageClassification ?? input.posterImageCheck?.model ?? null,
    contentVerification: input.posterContentVerification ?? input.posterImageCheck?.content ?? null,
  };
}

function getTextBundle(input, images, links) {
  return compact([
    input.title,
    input.source_org_name,
    input.org,
    input.site,
    input.board,
    input.category,
    input.summary_short,
    input.summary_long,
    input.content,
    input.source_key,
    input.sourceUrl,
    input.url,
    input.thumbnail_url,
    ...images,
    ...links,
  ].filter(Boolean).join(" ")).slice(0, 4000);
}

export function buildPosterDuplicateMaps(rows = []) {
  const source = new Map();
  const titleOrg = new Map();
  const titleOrgDeadline = new Map();
  const image = new Map();

  for (const row of rows) {
    const sourceKey = normalizeUrl(row.source_key ?? row.sourceUrl ?? row.url);
    if (sourceKey) source.set(sourceKey, (source.get(sourceKey) ?? 0) + 1);

    const org = normalizePosterOrg(row.source_org_name ?? row.org ?? row.site);
    const title = normalizePosterTitle(row.title, org);
    const deadline = normalizeDateKey(row.application_end_at ?? row.deadline);
    const titleOrgKey = `${title} / ${org}`;
    if (title && org) titleOrg.set(titleOrgKey, (titleOrg.get(titleOrgKey) ?? 0) + 1);

    const titleOrgDeadlineKey = `${titleOrgKey} / ${deadline}`;
    if (title && org && deadline) {
      titleOrgDeadline.set(titleOrgDeadlineKey, (titleOrgDeadline.get(titleOrgDeadlineKey) ?? 0) + 1);
    }

    const imageUrls = [
      row.thumbnail_url,
      ...(Array.isArray(row.images) ? row.images : []),
      ...(Array.isArray(row.poster_images) ? row.poster_images.map(getImageUrl) : []),
    ].map(normalizeImageIdentity).filter(Boolean);
    for (const imageUrl of new Set(imageUrls)) {
      image.set(imageUrl, (image.get(imageUrl) ?? 0) + 1);
    }
  }

  return { source, titleOrg, titleOrgDeadline, image };
}

export function evaluatePosterQuality(input = {}, options = {}) {
  const issues = [];
  const title = compact(input.title);
  const org = compact(input.source_org_name ?? input.org ?? input.site);
  const summary = compact(input.summary_short ?? input.summary_long ?? input.content);
  const sourceKey = normalizeUrl(options.sourceKey ?? input.source_key ?? input.sourceUrl ?? input.url);
  const thumbnail = normalizeUrl(input.thumbnail_url);
  const images = unique([
    thumbnail,
    ...(options.images ?? []),
    ...(Array.isArray(input.images) ? input.images : []),
    ...(Array.isArray(input.poster_images) ? input.poster_images.map(getImageUrl) : []),
  ].map(normalizeUrl));
  const links = unique([
    ...(options.links ?? []),
    ...(Array.isArray(input.poster_links) ? input.poster_links.map(getLinkUrl) : []),
  ].map(normalizeUrl));
  const allText = getTextBundle(input, images, links);
  const dateQuality = evaluatePosterDateQuality(input, {
    extractedDeadline: options.extractedDeadline ?? input.deadline ?? input.application_end_at ?? null,
  });

  if (!title) addIssue(issues, "missing-title", "high", "missing title", "", "reject");
  if (!org) addIssue(issues, "missing-org", "medium", "missing organization/source name");
  if (!summary || summary.length < 25) addIssue(issues, "weak-summary", "medium", "summary is missing or too short", summary);
  if (!sourceKey && links.length === 0) addIssue(issues, "missing-source", "high", "missing official source URL");
  if (images.length === 0) addIssue(issues, "missing-image", "high", "missing poster image", "", "reject");

  if (title.length <= 4 || GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(title))) {
    addIssue(issues, "generic-title", "high", "title looks like board metadata or a provider name", title, "reject");
  }

  if (title.length < 180 && /^[^/]+(?:\s*\/\s*[^/]+){2,}$/i.test(title)) {
    addIssue(issues, "breadcrumb-title", "high", "breadcrumb/navigation path was captured as title", title, "reject");
  }

  if (hasMojibake(allText)) {
    addIssue(issues, "mojibake", "high", "broken encoding text detected", allText, "reject");
  }

  for (const rule of TEXT_RULES) {
    const isMatch = rule.scope === "title"
      ? rule.pattern.test(title)
      : rule.pattern.test(title) || rule.pattern.test(allText);
    if (isMatch) {
      addIssue(issues, rule.code, rule.severity, rule.reason, title || allText, rule.decision);
    }
  }

  const badImage = images.find((imageUrl) => BAD_IMAGE_PATTERNS.some((pattern) => pattern.test(imageUrl)));
  if (badImage) {
    addIssue(issues, "bad-image-url", "high", "image URL looks like logo/icon/accessibility/non-poster asset", badImage, "reject");
  }

  const { imageClassification, contentVerification } = getVerification(input);
  if (imageClassification?.isPoster === false) {
    addIssue(issues, "image-not-poster", "high", "AI classifier says image is not a poster", imageClassification.reason, "reject");
  }
  if (contentVerification?.isSameNotice === false) {
    addIssue(issues, "image-content-mismatch", "high", "poster image does not match the notice content", contentVerification.reason, "reject");
  }
  if (typeof imageClassification?.confidence === "number" && imageClassification.confidence < 0.55) {
    addIssue(issues, "low-image-confidence", "medium", "AI poster confidence is low", String(imageClassification.confidence));
  }
  if (typeof contentVerification?.confidence === "number" && contentVerification.confidence < 0.55) {
    addIssue(issues, "low-content-match-confidence", "medium", "AI notice-match confidence is low", String(contentVerification.confidence));
  }

  for (const issue of dateQuality.issues) {
    addIssue(issues, issue.code, issue.severity, issue.reason, issue.evidence, issue.decision);
  }

  const duplicateMaps = options.duplicateMaps;
  if (sourceKey && duplicateMaps?.source?.get(sourceKey) > 1) {
    addIssue(issues, "duplicate-source", "medium", "same source URL appears multiple times", sourceKey);
  }

  const duplicateTitle = normalizePosterTitle(title, org);
  const duplicateOrg = normalizePosterOrg(org);
  const deadlineKey = normalizeDateKey(options.extractedDeadline ?? input.deadline ?? input.application_end_at ?? null);
  const titleOrgKey = `${duplicateTitle} / ${duplicateOrg}`;
  if (duplicateTitle && duplicateOrg && duplicateMaps?.titleOrg?.get(titleOrgKey) > 1) {
    addIssue(issues, "duplicate-title-org", "medium", "same title/organization appears multiple times", titleOrgKey);
  }

  const titleOrgDeadlineKey = `${titleOrgKey} / ${deadlineKey}`;
  if (duplicateTitle && duplicateOrg && deadlineKey && duplicateMaps?.titleOrgDeadline?.get(titleOrgDeadlineKey) > 1) {
    addIssue(issues, "duplicate-title-org-deadline", "high", "same title/organization/deadline appears multiple times", titleOrgDeadlineKey);
  }

  const duplicateImage = images
    .map(normalizeImageIdentity)
    .find((imageUrl) => imageUrl && duplicateMaps?.image?.get(imageUrl) > 1);
  if (duplicateImage) {
    addIssue(issues, "duplicate-image", "high", "same poster image appears multiple times", duplicateImage);
  }

  const issueScore = issues.reduce((sum, issue) => {
    if (issue.severity === "high") return sum + 5;
    if (issue.severity === "medium") return sum + 3;
    return sum + 1;
  }, 0);
  const decision = issues.some((issue) => issue.decision === "reject" || REJECT_CODES.has(issue.code))
    ? "reject"
    : issues.length > 0
      ? "review"
      : "pass";

  return {
    decision,
    issue_score: issueScore,
    issues,
    title,
    org,
    source_key: sourceKey,
    thumbnail_url: thumbnail,
    date_quality: dateQuality,
  };
}

export function summarizeQualityIssues(quality, maxItems = 4) {
  const issues = quality?.issues ?? [];
  if (issues.length === 0) return "";
  const text = issues
    .slice(0, maxItems)
    .map((issue) => `${issue.code}: ${issue.reason}`)
    .join("; ");
  return issues.length > maxItems ? `${text}; +${issues.length - maxItems} more` : text;
}
