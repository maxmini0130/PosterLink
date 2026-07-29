#!/usr/bin/env node
import "./load-env.js";
import crypto from "node:crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import {
  HUMAN_REVIEW_TARGET_IDS,
  IMAGE_CORRECTIONS,
  REJECTION_CORRECTIONS,
  REVIEWED_NO_CHANGE,
  SOURCE_LINK_CORRECTIONS,
  TITLE_CORRECTIONS,
} from "./human-review-corrections.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const BUCKET = process.env.POSTER_IMAGE_BUCKET?.trim() || "poster-originals";
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }),
);
const apply = Boolean(args.apply);
const output = path.resolve(
  REPO_ROOT,
  args.output || "data/results/human-review-corrections-20260729.json",
);

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error("Missing Supabase credentials");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return String(value ?? "")
      .trim()
      .replace(/\/$/, "");
  }
}

function sameUrl(left, right) {
  return normalizeUrl(left) === normalizeUrl(right);
}

function isStoredImage(value) {
  return String(value).includes(`/storage/v1/object/public/${BUCKET}/`);
}

function imageExtension(imageUrl, contentType) {
  const byType = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  }[String(contentType).split(";")[0].toLowerCase()];
  if (byType) return byType;
  return (
    new URL(imageUrl).pathname
      .match(/\.([a-z0-9]{2,5})$/i)?.[1]
      ?.toLowerCase() || "jpg"
  );
}

async function importImage(supabase, correction) {
  if (isStoredImage(correction.imageUrl)) return correction.imageUrl;

  const response = await fetch(correction.imageUrl, {
    headers: {
      "User-Agent": "PosterLink-Crawler/1.0 human review correction",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.3",
      Referer: new URL(correction.imageUrl).origin,
    },
  });
  if (!response.ok)
    throw new Error(
      `Image download failed (${response.status}): ${correction.imageUrl}`,
    );

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`Not an image content type: ${contentType}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const hash = crypto
    .createHash("sha256")
    .update(`human-review:${correction.id}:${correction.imageUrl}`)
    .digest("hex")
    .slice(0, 24);
  const storagePath = `crawler/human-review/${hash}.${imageExtension(correction.imageUrl, contentType)}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

function mergeReviewAudit(value, fields) {
  const current =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    ...current,
    humanReviewCorrection: {
      ...(current.humanReviewCorrection ?? {}),
      correctedAt: new Date().toISOString(),
      source: "human_golden_set_seed_20260728_수정.csv",
      fields: [
        ...new Set([
          ...(current.humanReviewCorrection?.fields ?? []),
          ...fields,
        ]),
      ],
    },
  };
}

function correctionFieldsFor(id) {
  const fields = [];
  if (SOURCE_LINK_CORRECTIONS.some((item) => item.id === id)) {
    fields.push("source_key", "title", "source_org_name");
  }
  if (TITLE_CORRECTIONS.some((item) => item.id === id)) {
    fields.push("title", "source_org_name");
  }
  if (IMAGE_CORRECTIONS.some((item) => item.id === id)) {
    fields.push("thumbnail_url", "poster_images");
  }
  if (REJECTION_CORRECTIONS.some((item) => item.id === id)) {
    fields.push("poster_status");
  }
  return [...new Set(fields)];
}

async function fetchRows(supabase) {
  const { data, error } = await supabase
    .from("posters")
    .select(
      `
      id,title,source_org_name,poster_status,rejection_reason,thumbnail_url,source_key,field_verification,
      poster_images(id,storage_path,image_type,width,height),
      poster_links(id,url,title,link_type,is_primary)
    `,
    )
    .in("id", HUMAN_REVIEW_TARGET_IDS);
  if (error) throw error;
  return data ?? [];
}

function buildDryRun(rows) {
  const rowMap = new Map(rows.map((row) => [row.id, row]));
  const missingIds = HUMAN_REVIEW_TARGET_IDS.filter((id) => !rowMap.has(id));
  if (missingIds.length)
    throw new Error(`Missing reviewed posters: ${missingIds.join(", ")}`);

  return {
    source_links: SOURCE_LINK_CORRECTIONS.map((item) => {
      const row = rowMap.get(item.id);
      const sourceLinkFound = row.poster_links.some((link) =>
        sameUrl(link.url, item.sourceUrl),
      );
      const applicationLinkFound = row.poster_links.some((link) =>
        sameUrl(link.url, item.applicationUrl),
      );
      if (!sourceLinkFound || !applicationLinkFound) {
        throw new Error(
          `Expected source/application links missing for ${item.id}`,
        );
      }
      return {
        id: item.id,
        source_key: { before: row.source_key, after: item.sourceUrl },
        title: { before: row.title, after: item.title },
        org: { before: row.source_org_name, after: item.org },
      };
    }),
    images: IMAGE_CORRECTIONS.map((item) => {
      const row = rowMap.get(item.id);
      if (
        isStoredImage(item.imageUrl) &&
        !row.poster_images.some((image) =>
          sameUrl(image.storage_path, item.imageUrl),
        )
      ) {
        throw new Error(`Expected stored image missing for ${item.id}`);
      }
      return {
        id: item.id,
        thumbnail_url: { before: row.thumbnail_url, candidate: item.imageUrl },
        remove_previous_thumbnail: item.removePreviousThumbnail,
      };
    }),
    titles: TITLE_CORRECTIONS.map((item) => {
      const row = rowMap.get(item.id);
      return {
        id: item.id,
        title: { before: row.title, after: item.title },
        org: { before: row.source_org_name, after: item.org },
      };
    }),
    rejections: REJECTION_CORRECTIONS.map((item) => {
      const row = rowMap.get(item.id);
      if (
        row.poster_status !== item.expectedStatus &&
        row.poster_status !== "rejected"
      ) {
        throw new Error(
          `Unexpected status for ${item.id}: ${row.poster_status}`,
        );
      }
      return {
        id: item.id,
        status: { before: row.poster_status, after: "rejected" },
        reason: item.reason,
      };
    }),
    reviewed_no_change: REVIEWED_NO_CHANGE,
  };
}

function verifyAppliedCorrections(rows) {
  const rowMap = new Map(rows.map((row) => [row.id, row]));
  const issues = [];

  for (const item of SOURCE_LINK_CORRECTIONS) {
    const row = rowMap.get(item.id);
    const sourceLink = row.poster_links.find((link) =>
      sameUrl(link.url, item.sourceUrl),
    );
    const applicationLink = row.poster_links.find((link) =>
      sameUrl(link.url, item.applicationUrl),
    );
    if (!sameUrl(row.source_key, item.sourceUrl))
      issues.push(`${item.id}: source_key`);
    if (row.title !== item.title) issues.push(`${item.id}: title`);
    if (row.source_org_name !== item.org)
      issues.push(`${item.id}: source_org_name`);
    if (sourceLink?.link_type !== "official_notice")
      issues.push(`${item.id}: source link type`);
    if (
      applicationLink?.link_type !== "official_apply" ||
      !applicationLink.is_primary
    ) {
      issues.push(`${item.id}: application link`);
    }
  }

  for (const item of IMAGE_CORRECTIONS) {
    const row = rowMap.get(item.id);
    const thumbnailImage = row.poster_images.find(
      (image) =>
        image.image_type === "thumbnail" &&
        sameUrl(image.storage_path, row.thumbnail_url),
    );
    if (!isStoredImage(row.thumbnail_url))
      issues.push(`${item.id}: thumbnail not imported`);
    if (
      isStoredImage(item.imageUrl) &&
      !sameUrl(row.thumbnail_url, item.imageUrl)
    ) {
      issues.push(`${item.id}: thumbnail URL`);
    }
    if (!thumbnailImage) issues.push(`${item.id}: thumbnail image row`);
    if (
      thumbnailImage &&
      (thumbnailImage.width !== item.width ||
        thumbnailImage.height !== item.height)
    ) {
      issues.push(`${item.id}: thumbnail dimensions`);
    }
  }

  for (const item of TITLE_CORRECTIONS) {
    const row = rowMap.get(item.id);
    if (row.title !== item.title) issues.push(`${item.id}: corrected title`);
    if (row.source_org_name !== item.org)
      issues.push(`${item.id}: corrected org`);
  }

  for (const item of REJECTION_CORRECTIONS) {
    const row = rowMap.get(item.id);
    if (row.poster_status !== "rejected")
      issues.push(`${item.id}: rejected status`);
    if (row.rejection_reason !== item.reason)
      issues.push(`${item.id}: rejection reason`);
  }

  const allImagesRow = rowMap.get("a4ae17cc-99be-407b-8730-88dc244fe60b");
  if ((allImagesRow.poster_images ?? []).length < 3) {
    issues.push(`${allImagesRow.id}: expected three source images`);
  }

  return {
    passed: issues.length === 0,
    checked_posters: HUMAN_REVIEW_TARGET_IDS.length,
    issues,
  };
}

async function applySourceLinkCorrections(supabase, rowMap) {
  for (const item of SOURCE_LINK_CORRECTIONS) {
    const row = rowMap.get(item.id);
    const { error: posterError } = await supabase
      .from("posters")
      .update({
        source_key: item.sourceUrl,
        title: item.title,
        source_org_name: item.org,
        field_verification: mergeReviewAudit(
          row.field_verification,
          correctionFieldsFor(item.id),
        ),
      })
      .eq("id", item.id);
    if (posterError) throw posterError;

    const { error: resetError } = await supabase
      .from("poster_links")
      .update({ is_primary: false })
      .eq("poster_id", item.id);
    if (resetError) throw resetError;

    const sourceLink = row.poster_links.find((link) =>
      sameUrl(link.url, item.sourceUrl),
    );
    const applicationLink = row.poster_links.find((link) =>
      sameUrl(link.url, item.applicationUrl),
    );
    const { error: sourceError } = await supabase
      .from("poster_links")
      .update({
        link_type: "official_notice",
        title: "청년몽땅정보통 원문",
        is_primary: false,
      })
      .eq("id", sourceLink.id);
    if (sourceError) throw sourceError;

    const { error: applicationError } = await supabase
      .from("poster_links")
      .update({
        link_type: "official_apply",
        title: "공식 신청 링크",
        is_primary: true,
      })
      .eq("id", applicationLink.id);
    if (applicationError) throw applicationError;
  }
}

async function applyTitleCorrections(supabase, rowMap) {
  for (const item of TITLE_CORRECTIONS) {
    const row = rowMap.get(item.id);
    const { error } = await supabase
      .from("posters")
      .update({
        title: item.title,
        source_org_name: item.org,
        field_verification: mergeReviewAudit(
          row.field_verification,
          correctionFieldsFor(item.id),
        ),
      })
      .eq("id", item.id);
    if (error) throw error;
  }
}

async function applyImageCorrections(supabase, rowMap) {
  for (const item of IMAGE_CORRECTIONS) {
    const row = rowMap.get(item.id);
    const previousThumbnail = row.thumbnail_url;
    const publicUrl = await importImage(supabase, item);

    const { error: demoteError } = await supabase
      .from("poster_images")
      .update({ image_type: "original" })
      .eq("poster_id", item.id);
    if (demoteError) throw demoteError;

    const existing = row.poster_images.find((image) =>
      sameUrl(image.storage_path, publicUrl),
    );
    if (existing) {
      const { error } = await supabase
        .from("poster_images")
        .update({
          image_type: "thumbnail",
          width: item.width,
          height: item.height,
        })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("poster_images").insert({
        poster_id: item.id,
        storage_path: publicUrl,
        image_type: "thumbnail",
        width: item.width,
        height: item.height,
      });
      if (error) throw error;
    }

    const { error: posterError } = await supabase
      .from("posters")
      .update({
        thumbnail_url: publicUrl,
        field_verification: mergeReviewAudit(
          row.field_verification,
          correctionFieldsFor(item.id),
        ),
      })
      .eq("id", item.id);
    if (posterError) throw posterError;

    if (
      item.removePreviousThumbnail &&
      !sameUrl(previousThumbnail, publicUrl)
    ) {
      const { error: removeError } = await supabase
        .from("poster_images")
        .delete()
        .eq("poster_id", item.id)
        .eq("storage_path", previousThumbnail);
      if (removeError) throw removeError;
    }
  }
}

async function applyRejections(supabase, rowMap) {
  for (const item of REJECTION_CORRECTIONS) {
    const row = rowMap.get(item.id);
    const { error } = await supabase
      .from("posters")
      .update({
        poster_status: "rejected",
        rejection_reason: item.reason,
        field_verification: mergeReviewAudit(
          row.field_verification,
          correctionFieldsFor(item.id),
        ),
      })
      .eq("id", item.id)
      .in("poster_status", [item.expectedStatus, "rejected"]);
    if (error) throw error;
  }
}

async function main() {
  const supabase = createSupabase();
  const rows = await fetchRows(supabase);
  const rowMap = new Map(rows.map((row) => [row.id, row]));
  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    input: "data/baseline/human_golden_set_seed_20260728_수정.csv",
    ...buildDryRun(rows),
  };

  if (apply) {
    await applySourceLinkCorrections(supabase, rowMap);
    await applyTitleCorrections(supabase, rowMap);
    await applyImageCorrections(supabase, rowMap);
    await applyRejections(supabase, rowMap);
    report.verification = verifyAppliedCorrections(await fetchRows(supabase));
  }

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf-8");
  console.log(
    JSON.stringify(
      {
        output,
        mode: report.mode,
        source_link_corrections: report.source_links.length,
        image_corrections: report.images.length,
        title_corrections: report.titles.length,
        rejections: report.rejections.length,
        reviewed_no_change: report.reviewed_no_change.length,
        verification: report.verification ?? null,
      },
      null,
      2,
    ),
  );

  if (report.verification && !report.verification.passed) {
    throw new Error(
      `Correction verification failed: ${report.verification.issues.join(", ")}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
