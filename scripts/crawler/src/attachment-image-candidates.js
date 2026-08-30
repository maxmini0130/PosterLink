import { fileURLToPath } from "node:url";
import path from "node:path";

const RASTER_IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|gif|webp|avif)(?:$|[?#])/i;
const POSTER_NAME_PATTERN = /(?:포스터|홍보물|홍보\s*이미지|전단|flyer|poster)/i;
const RASTER_IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);

function resolveImageUrl(value, baseUrl) {
  const text = String(value ?? "").trim();
  if (!text || /^javascript:/i.test(text)) return null;
  if (path.isAbsolute(text) || path.win32.isAbsolute(text)) return text;

  try {
    const url = new URL(text, baseUrl || undefined);
    if (url.protocol === "file:") return fileURLToPath(url);
    return /^https?:$/i.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function attachmentName(attachment) {
  return String(
    attachment?.name
    ?? attachment?.title
    ?? attachment?.filename
    ?? attachment?.fileName
    ?? attachment?.label
    ?? "",
  ).replace(/\s+/g, " ").trim();
}

export function isRasterImageAttachment(attachment = {}) {
  const name = attachmentName(attachment);
  const url = String(attachment?.url ?? attachment?.href ?? "");
  const contentType = String(attachment?.contentType ?? attachment?.content_type ?? "").toLowerCase();

  return RASTER_IMAGE_CONTENT_TYPES.has(contentType.split(";")[0].trim())
    || RASTER_IMAGE_EXTENSION_PATTERN.test(name)
    || RASTER_IMAGE_EXTENSION_PATTERN.test(url);
}

export function collectAttachmentImageCandidates(attachments = [], baseUrl = null) {
  const candidates = [];
  const seen = new Set();

  for (const attachment of attachments ?? []) {
    if (!isRasterImageAttachment(attachment)) continue;

    const url = resolveImageUrl(attachment?.url ?? attachment?.href, baseUrl);
    if (!url || seen.has(url)) continue;

    seen.add(url);
    const name = attachmentName(attachment);
    candidates.push({
      name: name || "image attachment",
      url,
      explicitlyPosterNamed: POSTER_NAME_PATTERN.test(name),
    });
  }

  return candidates.sort((left, right) => (
    Number(right.explicitlyPosterNamed) - Number(left.explicitlyPosterNamed)
  ));
}

export function mergeAttachmentImageCandidates(images = [], attachments = [], baseUrl = null) {
  const attachmentCandidates = collectAttachmentImageCandidates(attachments, baseUrl);
  const merged = [];
  const seen = new Set();

  for (const imageUrl of [
    ...attachmentCandidates.map((candidate) => candidate.url),
    ...(images ?? []),
  ]) {
    const url = resolveImageUrl(imageUrl, baseUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    merged.push(url);
  }

  return {
    images: merged,
    attachmentCandidates,
    attachmentImageUrls: attachmentCandidates.map((candidate) => candidate.url),
  };
}
