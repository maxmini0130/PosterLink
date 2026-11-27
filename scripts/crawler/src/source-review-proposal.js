// Asks the model for a full correction proposal for one review-queue notice,
// from the re-fetched source pages and poster images. Output follows the
// manual source-review proposals (data/results/source-review-*/proposals).
import {
  DEADLINE_SOURCES,
  DEADLINE_TYPES,
  DECISIONS,
  LINK_TYPES,
  PATCH_KEYS,
} from "./source-review-validate.js";

export const SOURCE_REVIEW_VERSION = "source-review-v1";
const MAX_CORPUS_CHARS = 40000;
const MAX_MODEL_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_MODEL_IMAGES = 4;

const nullable = (schema) => ({ ...schema, type: [schema.type, "null"] });
const str = { type: "string" };

const PATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...Object.fromEntries(PATCH_KEYS.map((key) => [key, nullable(str)])),
    target_age_min: { type: ["integer", "null"] },
    target_age_max: { type: ["integer", "null"] },
    deadline_type: { type: "string", enum: DEADLINE_TYPES },
    thumbnail_url: nullable(str),
  },
  required: [...PATCH_KEYS, "thumbnail_url"],
};

export const PROPOSAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: str,
    decision: { type: "string", enum: DECISIONS },
    confidence: { type: "number" },
    reason: str,
    resolution: str,
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          field: str,
          quote: str,
          source_url: str,
          from: { type: "string", enum: ["text", "image"] },
        },
        required: ["field", "quote", "source_url", "from"],
      },
    },
    imageReview: {
      type: "object",
      additionalProperties: false,
      properties: { isPoster: { type: "boolean" }, note: str },
      required: ["isPoster", "note"],
    },
    patch: PATCH_SCHEMA,
    deadline: {
      type: "object",
      additionalProperties: false,
      properties: {
        deadline_status: { type: "string", enum: ["verified", "unverified"] },
        deadline_source: {
          type: ["string", "null"],
          enum: [...DEADLINE_SOURCES, null],
        },
        deadline_time_verified: { type: "boolean" },
        deadline_note: nullable(str),
      },
      required: [
        "deadline_status",
        "deadline_source",
        "deadline_time_verified",
        "deadline_note",
      ],
    },
    removeLinks: { type: "array", items: str },
    linkPatches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: str,
          title: nullable(str),
          link_type: { type: ["string", "null"], enum: [...LINK_TYPES, null] },
          url: nullable(str),
          is_primary: { type: ["boolean", "null"] },
        },
        required: ["id", "title", "link_type", "url", "is_primary"],
      },
    },
    addLinks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: str,
          link_type: { type: "string", enum: LINK_TYPES },
          url: str,
          is_primary: { type: "boolean" },
        },
        required: ["title", "link_type", "url", "is_primary"],
      },
    },
    removeImages: { type: "array", items: str },
    removeAudiences: { type: "array", items: str },
    addAudiences: { type: "array", items: str },
    closedReason: nullable(str),
    rejection_reason: nullable(str),
    heldReason: nullable(str),
    duplicateJudgement: nullable(str),
    uncertainties: { type: "array", items: str },
  },
  required: [
    "id",
    "decision",
    "confidence",
    "reason",
    "resolution",
    "evidence",
    "imageReview",
    "patch",
    "deadline",
    "removeLinks",
    "linkPatches",
    "addLinks",
    "removeImages",
    "removeAudiences",
    "addAudiences",
    "closedReason",
    "rejection_reason",
    "heldReason",
    "duplicateJudgement",
    "uncertainties",
  ],
};

export const RULES = `You review one Korean public-opportunity notice for PosterLink against its official sources and return a correction proposal.
PosterLink helps people find public opportunities they can actually apply to. Accuracy beats completeness: never invent a fact; leave a field null and add an uncertainty instead.

Decide one of:
- published: a real opportunity people can still apply to or attend (모집/신청/참여/무료 공개 행사), fields verified from the sources.
- closed: a real opportunity whose deadline has passed or which the source marks 마감/정원 마감. Give closedReason.
- rejected: not an opportunity (운영 공지, 결과 발표, 유료 티켓 판매·예매 안내, 홍보 기사) or the same program and session as an existing published poster. Give rejection_reason (short Korean).
- held: key facts cannot be verified (sources unreadable, conflicting deadlines, no usable poster). Give heldReason.

Fields (all user-facing text in Korean):
- title: the real program name; keep the "기관 <프로그램>" form; drop trailing deadline suffixes like "(~12/8)" or "(선착순)".
- organizer_name: the real host institution. Never the portal (청년몽땅정보통) and never "기타 (...)".
- summary_short: 1-2 sentences: who runs what, for whom, until when.
- summary_long: starts with summary_short, then blank-line separated blocks like "대상: …", "신청: …", "일시: …", "장소: …", "내용: …", "문의: …"; lists use "- ". No menus, footers, attachment lists, emoji clutter or promotional filler.
- category_id: one id from the given categories (교육강좌 for classes/lectures, 행사모집 for events/festivals/performance recruitment, 문화/행사 for open cultural events, 채용, 지원사업, 공모전, ...).

Dates (Asia/Seoul):
- Write ISO timestamps with +09:00, e.g. 2026-12-04T15:59:00+09:00.
- A deadline with only a date is YYYY-MM-DDT23:59:59+09:00 and deadline_time_verified=false.
- Use a time only when the source states it for that deadline (then deadline_time_verified=true). The youth portal header "00 : 00" means no time: never use it as a time or in summaries.
- The notice body, poster or application page wins over portal header fields; list conflicts in uncertainties.
- deadline_type: fixed (clear end date), until_exhausted (선착순/모집 시까지/조기 마감 가능; may still have an end date), ongoing (source truly says 상시; end null), unknown (no end stated; end null). Never turn unknown into 상시.
- An event with no application procedure (just show up) uses the event end as application_end_at with deadline_status unverified.
- deadline_status verified only when the end date is read from a source (deadline_source notice|poster|portal|apply_page); otherwise unverified with deadline_source null. deadline_note: optional user-facing note of at most 80 characters.
- Weekdays must match the dates.

Evidence: for every field you set or change, quote the source text exactly as written (copy, do not paraphrase) with its source_url. Use from="text" for page text and from="image" for text read from a poster image. Quotes from page text are checked automatically against the fetched pages; a quote that is not found blocks the proposal.

Links: remove links that belong to a different program or session; exactly one link must end with is_primary=true (normally the official notice detail page); a real application form or page is official_apply. Do not add a link that already exists. Never use list pages or homepages as the notice. Resolve short links when the destination is known from the sources. In linkPatches set only the changed attributes; use null for attributes you do not change.
Images: imageReview judges the thumbnail you keep (isPoster true only for a real poster, 모집 안내문 or 카드뉴스 of this program). To replace it, set patch.thumbnail_url to another attached image url; otherwise null. removeImages lists attached images that are not this program's poster (logos, site-common images, exact duplicates); never the thumbnail you keep.
Audiences: change only with explicit evidence (e.g. remove 청년 when the program is for all ages; add 아동/청소년/어르신 when explicitly targeted).
Duplicates: compare with the listed duplicate candidates. A different month, date, time slot or program is not a duplicate; say why in duplicateJudgement.
confidence: your probability (0-1) that every field and the decision are right.`;

function trimPages(fetched) {
  const pages = [...fetched.pages, ...fetched.followed];
  let budget = MAX_CORPUS_CHARS;
  return pages.map((page) => {
    const text = page.text
      ? page.text.slice(0, Math.max(0, Math.min(page.text.length, budget)))
      : "";
    budget -= text.length;
    return {
      url: page.url,
      final_url: page.finalUrl,
      status: page.status,
      via: page.via ?? null,
      title: page.title,
      error: page.error ?? null,
      text,
    };
  });
}

export function buildProposalInput({
  row,
  fetched,
  todayKst,
  categories,
  audiences,
  duplicateCandidates,
}) {
  return {
    today_kst: todayKst,
    notice: {
      id: row.id,
      source_key: row.source_key,
      created_at: row.created_at,
      current: Object.fromEntries(
        [
          ...PATCH_KEYS,
          "thumbnail_url",
          "deadline_status",
          "deadline_source",
          "deadline_time_verified",
          "deadline_note",
        ].map((key) => [key, row[key] ?? null]),
      ),
      categories: (row.poster_categories ?? []).map((c) => c.category_id),
      audiences: (row.poster_audiences ?? []).map((a) => a.audience_id),
      links: (row.poster_links ?? []).map((l) => ({
        id: l.id,
        title: l.title,
        link_type: l.link_type,
        url: l.url,
        is_primary: l.is_primary,
      })),
      images: (row.poster_images ?? []).map((i) => ({
        id: i.id,
        url: i.storage_path,
      })),
      crawler_notes: {
        decision: row.field_verification?.decision ?? null,
        reason: row.field_verification?.reason ?? null,
        dateIssues: row.field_verification?.dateIssues ?? [],
      },
    },
    duplicate_candidates: duplicateCandidates,
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    audiences: audiences.map((a) => ({ id: a.id, name: a.name })),
    sources: trimPages(fetched),
  };
}

export function modelImages(fetched) {
  return fetched.images
    .filter(
      (image) =>
        image.status === 200 &&
        image.dataUrl &&
        image.bytes <= MAX_MODEL_IMAGE_BYTES,
    )
    .slice(0, MAX_MODEL_IMAGES);
}

// Strict schemas need every attribute; null in a link patch means "unchanged".
export function normalizeProposal(raw) {
  const patch = { ...raw.patch };
  if (patch.thumbnail_url == null) delete patch.thumbnail_url;
  return {
    ...raw,
    patch,
    linkPatches: (raw.linkPatches ?? []).map(({ id, ...rest }) => ({
      id,
      patch: Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== null),
      ),
    })),
    closedReason: raw.closedReason ?? null,
  };
}

export async function requestProposal(
  input,
  images,
  { model, apiKey, timeoutMs = 240000 },
) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for source review");
  // A placeholder or a pasted value with spaces/Korean text cannot go into a header.
  if (!/^[!-~]+$/.test(apiKey)) {
    throw new Error(
      "OPENAI_API_KEY is not a valid key (only ASCII without spaces; replace the placeholder with the real key)",
    );
  }
  const content = [
    { type: "input_text", text: RULES },
    { type: "input_text", text: JSON.stringify(input) },
  ];
  for (const image of images) {
    content.push({
      type: "input_text",
      text: `Attached image ${image.id} (${image.url})`,
    });
    content.push({
      type: "input_image",
      image_url: image.dataUrl,
      detail: "high",
    });
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: "posterlink_source_review",
          strict: true,
          schema: PROPOSAL_SCHEMA,
        },
      },
    }),
  });
  if (!response.ok)
    throw new Error(
      `OpenAI API ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  const payload = await response.json();
  const outputText =
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((part) => part.text ?? "")
      .join("\n") ??
    "";
  return normalizeProposal(JSON.parse(outputText));
}
