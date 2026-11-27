// Writes a validated source-review proposal. Same order and conditional
// updates as the frozen manual review scripts: claim the row with its
// updated_at, change relations, write the poster, then re-read and compare.
// Everything needed to revert is stored in field_verification.sourceReviewAuto.
import { DEADLINE_KEYS } from "./source-review-validate.js";

export const POSTER_SELECT =
  "*,poster_links(*),poster_images(*),poster_categories(*),poster_audiences(*)";

async function check(query) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

function sortedJson(value) {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortedJson(value[key])]),
    );
  }
  return value;
}

function sameValue(a, b) {
  return (
    JSON.stringify(sortedJson(a ?? null)) ===
    JSON.stringify(sortedJson(b ?? null))
  );
}

// The record a person needs to see what changed and to revert it.
export function buildSnapshot(row, proposal) {
  const patchKeys = Object.keys(proposal.patch ?? {});
  return {
    poster: Object.fromEntries(
      [
        ...new Set([
          ...patchKeys,
          ...DEADLINE_KEYS,
          "poster_status",
          "published_at",
          "rejection_reason",
          "deadline_checked_at",
        ]),
      ].map((key) => [key, row[key] ?? null]),
    ),
    removedLinks: (row.poster_links ?? []).filter((link) =>
      (proposal.removeLinks ?? []).includes(link.id),
    ),
    patchedLinks: (row.poster_links ?? [])
      .filter((link) =>
        (proposal.linkPatches ?? []).some((p) => p.id === link.id),
      )
      .map((link) => ({
        id: link.id,
        previous: Object.fromEntries(
          Object.keys(
            proposal.linkPatches.find((p) => p.id === link.id).patch,
          ).map((key) => [key, link[key] ?? null]),
        ),
      })),
    removedImages: (row.poster_images ?? []).filter((image) =>
      (proposal.removeImages ?? []).includes(image.id),
    ),
    categories: (row.poster_categories ?? []).map((c) => c.category_id),
    audiences: (row.poster_audiences ?? []).map((a) => a.audience_id),
  };
}

export function buildReviewRecord({
  row,
  proposal,
  validation,
  meta,
  reviewedAt,
}) {
  const needsPostCheck = validation.risks.some((r) => r.level === "high");
  return {
    version: meta.version,
    model: meta.model,
    runId: meta.runId ?? null,
    reviewedAt,
    todayKst: meta.todayKst,
    decision: proposal.decision,
    confidence: proposal.confidence,
    reason: proposal.reason,
    resolution: proposal.resolution,
    evidence: proposal.evidence,
    imageReview: proposal.imageReview,
    duplicateJudgement: proposal.duplicateJudgement ?? null,
    uncertainties: proposal.uncertainties ?? [],
    closedReason: proposal.closedReason ?? null,
    rejectionReason: proposal.rejection_reason ?? null,
    sources: meta.sources,
    risks: validation.risks,
    needsPostCheck,
    postCheck: needsPostCheck
      ? { status: "pending" }
      : { status: "not_needed" },
    previous: buildSnapshot(row, proposal),
    addedLinkIds: [],
  };
}

// Records why a proposal was not applied; the poster stays in review.
export async function recordHeld(
  db,
  row,
  { proposal, validation, meta, error },
) {
  const record = {
    version: meta.version,
    model: meta.model,
    runId: meta.runId ?? null,
    reviewedAt: new Date().toISOString(),
    todayKst: meta.todayKst,
    applied: false,
    decision: proposal?.decision ?? null,
    confidence: proposal?.confidence ?? null,
    reason: proposal?.reason ?? null,
    heldReason: proposal?.heldReason ?? null,
    violations: validation?.violations ?? [],
    risks: validation?.risks ?? [],
    error: error ? String(error).slice(0, 500) : null,
    sources: meta.sources,
    proposal: proposal ?? null,
  };
  const written = await check(
    db
      .from("posters")
      .update({
        field_verification: {
          ...(row.field_verification ?? {}),
          sourceReviewHold: record,
        },
      })
      .eq("id", row.id)
      .eq("poster_status", "review")
      .eq("updated_at", row.updated_at)
      .select("id"),
  );
  return written.length === 1;
}

export async function applyProposal(db, row, proposal, validation, meta) {
  if (validation.violations.length)
    throw new Error("refusing to apply a proposal with violations");
  const reviewedAt = new Date().toISOString();
  const record = buildReviewRecord({
    row,
    proposal,
    validation,
    meta,
    reviewedAt,
  });
  const fresh = await check(
    db.from("posters").select(POSTER_SELECT).eq("id", row.id).single(),
  );
  if (fresh.updated_at !== row.updated_at || fresh.poster_status !== "review") {
    return { applied: false, reason: "changed-since-read" };
  }

  // Claim: mark the write in progress, only if nobody changed the row.
  const claim = await check(
    db
      .from("posters")
      .update({
        field_verification: {
          ...(row.field_verification ?? {}),
          sourceReviewWriteInProgress: meta.runId ?? reviewedAt,
        },
      })
      .eq("id", row.id)
      .eq("poster_status", "review")
      .eq("updated_at", row.updated_at)
      .select("id,updated_at"),
  );
  if (claim.length !== 1) return { applied: false, reason: "claim-failed" };

  if (proposal.decision === "rejected") {
    const verification = {
      ...(row.field_verification ?? {}),
      sourceReviewAuto: record,
    };
    delete verification.sourceReviewHold;
    const written = await check(
      db
        .from("posters")
        .update({
          poster_status: "rejected",
          rejection_reason: proposal.rejection_reason,
          field_verification: verification,
        })
        .eq("id", row.id)
        .eq("updated_at", claim[0].updated_at)
        .select("id,poster_status"),
    );
    if (written.length !== 1)
      throw new Error(`reject write lost for ${row.id}`);
    return {
      applied: true,
      status: "rejected",
      needsPostCheck: record.needsPostCheck,
    };
  }

  for (const id of proposal.removeAudiences ?? []) {
    await check(
      db
        .from("poster_audiences")
        .delete()
        .eq("poster_id", row.id)
        .eq("audience_id", id),
    );
  }
  for (const id of proposal.addAudiences ?? []) {
    await check(
      db
        .from("poster_audiences")
        .insert({ poster_id: row.id, audience_id: id }),
    );
  }
  for (const id of proposal.removeImages ?? []) {
    await check(
      db.from("poster_images").delete().eq("poster_id", row.id).eq("id", id),
    );
  }
  for (const id of proposal.removeLinks ?? []) {
    await check(
      db.from("poster_links").delete().eq("poster_id", row.id).eq("id", id),
    );
  }
  // Demote first so a unique "one primary link" rule never sees two primaries.
  const patches = [...(proposal.linkPatches ?? [])].sort(
    (a, b) =>
      Number(a.patch.is_primary === true) - Number(b.patch.is_primary === true),
  );
  for (const p of patches) {
    await check(
      db
        .from("poster_links")
        .update(p.patch)
        .eq("poster_id", row.id)
        .eq("id", p.id),
    );
  }
  for (const link of proposal.addLinks ?? []) {
    const added = await check(
      db
        .from("poster_links")
        .insert({ ...link, poster_id: row.id })
        .select("id")
        .single(),
    );
    record.addedLinkIds.push(added.id);
  }
  for (const rel of (row.poster_categories ?? []).filter(
    (r) => r.category_id !== proposal.patch.category_id,
  )) {
    await check(
      db
        .from("poster_categories")
        .delete()
        .eq("poster_id", row.id)
        .eq("category_id", rel.category_id),
    );
  }
  if (
    !(row.poster_categories ?? []).some(
      (r) => r.category_id === proposal.patch.category_id,
    )
  ) {
    await check(
      db
        .from("poster_categories")
        .insert({ poster_id: row.id, category_id: proposal.patch.category_id }),
    );
  }

  const verification = structuredClone(row.field_verification ?? {});
  delete verification.sourceReviewHold;
  verification.sourceReviewAuto = record;
  verification.readableNotice = {
    ...verification.readableNotice,
    summaryShort: proposal.patch.summary_short,
    summaryLong: proposal.patch.summary_long,
    facts: {
      ...verification.readableNotice?.facts,
      target: proposal.patch.eligibility_summary,
      applicationMethod: proposal.patch.application_method,
      location: proposal.patch.event_location,
      participationFee: proposal.patch.participation_fee,
    },
    updatedBy: meta.version,
  };
  const posterPatch = {
    ...proposal.patch,
    ...proposal.deadline,
    deadline_checked_at: reviewedAt,
    field_verification: verification,
    poster_status: proposal.decision,
    published_at: reviewedAt,
    rejection_reason: null,
  };
  const written = await check(
    db
      .from("posters")
      .update(posterPatch)
      .eq("id", row.id)
      .eq("poster_status", "review")
      .eq("updated_at", claim[0].updated_at)
      .select("id"),
  );
  if (written.length !== 1) throw new Error(`poster write lost for ${row.id}`);

  // Re-read and compare what was written.
  const after = await check(
    db.from("posters").select(POSTER_SELECT).eq("id", row.id).single(),
  );
  const mismatches = [];
  for (const [key, value] of Object.entries(posterPatch)) {
    if (key === "field_verification") continue;
    const ok =
      key.endsWith("_at") && value
        ? Date.parse(after[key]) === Date.parse(value)
        : sameValue(after[key], value);
    if (!ok) mismatches.push(key);
  }
  if (
    !sameValue(
      after.field_verification?.sourceReviewAuto?.previous,
      record.previous,
    )
  )
    mismatches.push("snapshot");
  const primary = after.poster_links.filter((l) => l.is_primary).length;
  if (primary !== 1) mismatches.push(`primary-links:${primary}`);
  if (mismatches.length)
    throw new Error(
      `written values differ for ${row.id}: ${mismatches.join(", ")}`,
    );
  return {
    applied: true,
    status: proposal.decision,
    needsPostCheck: record.needsPostCheck,
    after,
  };
}
