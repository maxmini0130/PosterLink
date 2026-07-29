import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import "./load-env.js";
import youthSeoul from "./adapters/youth-seoul.js";
import { selectBestPosterImage } from "./poster-image-rules.js";
import { isLikelyApplicationLink, sanitizeKnownShortUrl } from "./source-link-rules.js";
import { buildReadableNoticeInfo } from "./upload-to-supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apply = process.argv.includes("--apply");
const skipImages = process.argv.includes("--skip-images");
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1])) : Number.POSITIVE_INFINITY;

const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
const supabaseKey = (process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase credentials");

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const FORM_NOISE_PATTERN =
  /(?:표시는\s*필수\s*질문|Google Forms를\s*통해|다음\s*양식\s*지우기|이메일\s*\*\s*응답과\s*함께)/i;
const APPLICATION_SOURCE_PATTERN =
  /(?:^|\/\/)(?:forms\.gle|docs\.google\.com\/forms|form\.naver\.com|forms\.office\.com)(?:\/|$)/i;
const YOUTH_NOTICE_PATTERN = /youth\.seoul\.go\.kr\/infoData\/sprtInfo\/view\.do/i;
const STRUCTURED_SECTION_MARKER_PATTERN =
  /(?:📌\s*(?:대상|인원|장소|참여\s*비용|참여\s*선정\s*안내|신청\s*기간|신청\s*방법|운영\s*기간|교육\s*일시|교육\s*장소|문의(?:처)?)|❤️\s*문의(?:처)?|🚨|※)/gu;

function normalizeUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    url.hash = "";
    return url.href;
  } catch {
    return String(value ?? "").trim();
  }
}

function sameUrl(left, right) {
  return normalizeUrl(left) === normalizeUrl(right);
}

function removeInvalidSurrogates(value) {
  return String(value ?? "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1");
}

function sanitizeForPostgrest(value) {
  if (typeof value === "string") return removeInvalidSurrogates(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(sanitizeForPostgrest);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, sanitizeForPostgrest(item)]),
    );
  }
  return value ?? null;
}

function isCollapsedStructuredSummary(row) {
  const summary = String(row.summary_long ?? "");
  const markerCount = (summary.match(STRUCTURED_SECTION_MARKER_PATTERN) ?? []).length;
  return Boolean(summary) && !/[\r\n]/.test(summary) && (
    markerCount >= 2 || FORM_NOISE_PATTERN.test(summary)
  );
}

function isApplicationSource(row) {
  return APPLICATION_SOURCE_PATTERN.test(String(row.source_key ?? ""));
}

function imageUrl(image) {
  return String(image?.storage_path ?? "").trim();
}

function findNoticeSource(row) {
  const viaUrl = row.field_verification?.externalOriginal?.viaUrl;
  if (viaUrl && !isLikelyApplicationLink(viaUrl)) return normalizeUrl(viaUrl);

  const noticeLinks = (row.poster_links ?? [])
    .map((link) => link.url)
    .filter((url) => YOUTH_NOTICE_PATTERN.test(String(url ?? "")));
  return noticeLinks.length === 1 ? normalizeUrl(noticeLinks[0]) : null;
}

async function fetchRows() {
  const rows = [];
  for (let from = 0; rows.length < limit; from += 1000) {
    const to = Math.min(from + 999, from + (limit - rows.length) - 1);
    const { data, error } = await supabase
      .from("posters")
      .select(`
        id,title,source_org_name,poster_status,source_key,summary_short,summary_long,
        thumbnail_url,field_verification,updated_at,
        poster_images(id,storage_path,image_type,width,height,created_at),
        poster_links(id,url,title,link_type,is_primary)
      `)
      .neq("poster_status", "rejected")
      .range(from, to);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000 || rows.length >= limit) break;
  }
  return rows.slice(0, limit);
}

function buildLinkPlan(row, sourceRepair) {
  if (!sourceRepair) return { updates: [], inserts: [], deletes: [] };

  const oldApplicationUrl = sanitizeKnownShortUrl(row.source_key);
  const noticeSource = sourceRepair.sourceKey;
  const links = row.poster_links ?? [];
  const updates = [];
  const inserts = [];
  const deletes = [];
  let hasApplication = false;
  let hasNotice = false;

  for (const link of links) {
    const sanitizedUrl = sanitizeKnownShortUrl(link.url);

    if (sameUrl(link.url, row.source_key)) {
      hasApplication = true;
      updates.push({
        id: link.id,
        patch: {
          url: oldApplicationUrl,
          link_type: "official_apply",
          title: "공식 신청 링크",
          is_primary: true,
        },
      });
      continue;
    }

    if (sameUrl(link.url, noticeSource)) {
      hasNotice = true;
      updates.push({
        id: link.id,
        patch: {
          url: noticeSource,
          link_type: "official_notice",
          title: "공식 공고 원문",
          is_primary: false,
        },
      });
      continue;
    }

    if (YOUTH_NOTICE_PATTERN.test(link.url)) {
      deletes.push(link.id);
      continue;
    }

    const sanitizedChanged = sanitizedUrl !== link.url;
    const nextType = isLikelyApplicationLink(sanitizedUrl, link.title)
      ? "official_apply"
      : link.link_type === "official_apply"
        ? "other"
        : link.link_type;
    const nextTitle = nextType === "other" && link.link_type === "official_apply"
      ? "문의 또는 참고 링크"
      : link.title;

    if (sanitizedChanged || link.is_primary || nextType !== link.link_type || nextTitle !== link.title) {
      updates.push({
        id: link.id,
        patch: {
          url: sanitizedUrl,
          link_type: nextType,
          title: nextTitle,
          is_primary: false,
        },
      });
    }
  }

  if (!hasApplication) {
    inserts.push({
      poster_id: row.id,
      url: oldApplicationUrl,
      link_type: "official_apply",
      title: "공식 신청 링크",
      is_primary: true,
    });
  }
  if (!hasNotice) {
    inserts.push({
      poster_id: row.id,
      url: noticeSource,
      link_type: "official_notice",
      title: "공식 공고 원문",
      is_primary: false,
    });
  }

  return { updates, inserts, deletes };
}

async function buildRepair(row) {
  const collapsedSummary = isCollapsedStructuredSummary(row);
  const applicationSource = isApplicationSource(row);
  if (!collapsedSummary && !applicationSource) return null;

  let sourceRepair = null;
  let sourceContent = row.summary_long;
  let nextTitle = row.title;

  if (applicationSource) {
    const sourceKey = findNoticeSource(row);
    if (sourceKey) {
      try {
        const detail = await youthSeoul.parseDetail(sourceKey);
        sourceRepair = {
          sourceKey,
          previousSourceKey: row.source_key,
          removedSupplementalNoticeUrls: (row.poster_links ?? [])
            .map((link) => link.url)
            .filter((url) => YOUTH_NOTICE_PATTERN.test(url) && !sameUrl(url, sourceKey)),
        };
        sourceContent = detail.content || sourceContent;
        nextTitle = detail.title || nextTitle;
      } catch (error) {
        console.warn(`Source detail refresh failed for ${row.id}: ${error.message}`);
      }
    }
  }

  const readable = buildReadableNoticeInfo({
    title: nextTitle,
    content: sourceContent,
  });
  const posterPatch = {};
  if (readable.title && readable.title !== row.title) posterPatch.title = readable.title;
  const readableFactCount = Object.keys(readable.facts ?? {}).length;
  const shouldReplaceSummaryShort = (
    !row.summary_short ||
    FORM_NOISE_PATTERN.test(String(sourceContent ?? "")) ||
    readableFactCount >= 2
  );
  if (
    shouldReplaceSummaryShort &&
    readable.summaryShort &&
    readable.summaryShort !== row.summary_short
  ) {
    posterPatch.summary_short = readable.summaryShort;
  }
  if (readable.summaryLong && readable.summaryLong !== row.summary_long) {
    posterPatch.summary_long = readable.summaryLong;
  }
  if (sourceRepair?.sourceKey && !sameUrl(sourceRepair.sourceKey, row.source_key)) {
    posterPatch.source_key = sourceRepair.sourceKey;
  }

  const images = [...new Set([
    ...(row.poster_images ?? []).map(imageUrl),
    row.thumbnail_url,
  ].filter(Boolean))];
  let imageRepair = null;
  if (!skipImages && images.length > 1) {
    const selection = await selectBestPosterImage(images, {
      title: readable.title || row.title,
      content: readable.summaryLong || sourceContent,
      site: row.source_org_name,
      sourceUrl: sourceRepair?.sourceKey || row.source_key,
    });
    const selected = selection.candidates.find((candidate) => (
      sameUrl(candidate.imageUrl, selection.selectedImageUrl)
    ));
    const current = selection.candidates.find((candidate) => (
      sameUrl(candidate.imageUrl, row.thumbnail_url)
    ));
    const selectedScore = selected?.rule?.score ?? 0;
    const currentScore = current?.rule?.score ?? 0;

    if (
      selection.selectedImageUrl &&
      !sameUrl(selection.selectedImageUrl, row.thumbnail_url) &&
      selectedScore >= 70 &&
      selectedScore - currentScore >= 15
    ) {
      posterPatch.thumbnail_url = selection.selectedImageUrl;
      imageRepair = {
        previousThumbnail: row.thumbnail_url,
        selectedThumbnail: selection.selectedImageUrl,
        currentScore,
        selectedScore,
        selectedRule: selected?.rule ?? null,
      };
    }
  }

  if (Object.keys(posterPatch).length > 0) {
    const organization = row.field_verification?.organization;
    posterPatch.field_verification = {
      ...(row.field_verification ?? {}),
      ...(sourceRepair && organization && typeof organization === "object"
        ? {
            organization: {
              ...organization,
              sourceUrl: sourceRepair.sourceKey,
            },
          }
        : {}),
      readableNotice: {
        ...(row.field_verification?.readableNotice ?? {}),
        title: readable.title,
        summaryShort: readable.summaryShort,
        facts: readable.facts,
        source: "structure-repair",
      },
      structureRepair: {
        repairedAt: new Date().toISOString(),
        collapsedSummary,
        applicationSource,
        sourceRepaired: Boolean(sourceRepair),
        imageRepaired: Boolean(imageRepair),
      },
    };
  }

  return {
    id: row.id,
    title: row.title,
    status: row.poster_status,
    posterPatch,
    imageRepair,
    sourceRepair,
    linkPlan: buildLinkPlan(row, sourceRepair),
    before: row,
  };
}

async function applyRepair(repair) {
  const { error: posterError } = await supabase
    .from("posters")
    .update(sanitizeForPostgrest(repair.posterPatch))
    .eq("id", repair.id);
  if (posterError) throw posterError;

  if (repair.imageRepair) {
    const selectedRow = (repair.before.poster_images ?? []).find((image) => (
      sameUrl(image.storage_path, repair.imageRepair.selectedThumbnail)
    ));
    const previousThumbnailRows = (repair.before.poster_images ?? []).filter((image) => (
      image.image_type === "thumbnail" && image.id !== selectedRow?.id
    ));

    if (selectedRow) {
      const { error } = await supabase
        .from("poster_images")
        .update({ image_type: "thumbnail" })
        .eq("id", selectedRow.id);
      if (error) throw error;
    }
    for (const image of previousThumbnailRows) {
      const { error } = await supabase
        .from("poster_images")
        .update({ image_type: "original" })
        .eq("id", image.id);
      if (error) throw error;
    }
  }

  for (const update of repair.linkPlan.updates) {
    const { error } = await supabase
      .from("poster_links")
      .update(sanitizeForPostgrest(update.patch))
      .eq("id", update.id);
    if (error) throw error;
  }
  if (repair.linkPlan.inserts.length > 0) {
    const { error } = await supabase
      .from("poster_links")
      .insert(sanitizeForPostgrest(repair.linkPlan.inserts));
    if (error) throw error;
  }
  if (repair.linkPlan.deletes.length > 0) {
    const { error } = await supabase
      .from("poster_links")
      .delete()
      .in("id", repair.linkPlan.deletes);
    if (error) throw error;
  }
}

async function main() {
  const rows = await fetchRows();
  const candidates = rows.filter((row) => (
    isCollapsedStructuredSummary(row) || isApplicationSource(row)
  ));
  const repairs = [];
  const failures = [];

  console.log(`Structure repair candidates: ${candidates.length}/${rows.length}${apply ? "" : " (dry-run)"}`);
  for (const [index, row] of candidates.entries()) {
    try {
      const repair = await buildRepair(row);
      if (repair && Object.keys(repair.posterPatch).length > 0) repairs.push(repair);
      if ((index + 1) % 25 === 0 || index === candidates.length - 1) {
        console.log(`  inspected ${index + 1}/${candidates.length}`);
      }
    } catch (error) {
      failures.push({ id: row.id, error: error.message });
    }
  }

  const summary = {
    scanned: rows.length,
    candidates: candidates.length,
    repairs: repairs.length,
    summaryRepairs: repairs.filter((repair) => (
      "summary_short" in repair.posterPatch || "summary_long" in repair.posterPatch
    )).length,
    imageRepairs: repairs.filter((repair) => repair.imageRepair).length,
    sourceRepairs: repairs.filter((repair) => repair.sourceRepair).length,
    orphanedMergedSourceLinks: repairs.reduce(
      (count, repair) => count + (repair.sourceRepair?.removedSupplementalNoticeUrls.length ?? 0),
      0,
    ),
    failures: failures.length,
    apply,
  };
  console.log(JSON.stringify(summary, null, 2));
  for (const repair of repairs.slice(0, 12)) {
    console.log(JSON.stringify({
      id: repair.id,
      title: repair.title,
      fields: Object.keys(repair.posterPatch),
      image: repair.imageRepair
        ? `${repair.imageRepair.currentScore} -> ${repair.imageRepair.selectedScore}`
        : null,
      source: repair.sourceRepair?.sourceKey ?? null,
    }));
  }

  if (!apply) return;
  const backupPath = path.resolve(
    __dirname,
    `../poster-structure-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(repairs.map((repair) => repair.before), null, 2));
  console.log(`Backup written: ${backupPath}`);

  let applied = 0;
  for (const repair of repairs) {
    try {
      await applyRepair(repair);
      applied += 1;
    } catch (error) {
      failures.push({ id: repair.id, error: error.message });
    }
  }

  console.log(JSON.stringify({
    ...summary,
    applied,
    failures: failures.length,
    failureSamples: failures.slice(0, 10),
  }, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
