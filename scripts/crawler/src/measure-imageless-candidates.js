#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DEFAULT_OUT = `data/eval/reports/imageless-candidates-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    args[key] = rest.join("=") || "1";
  }
  return args;
}

function hasImage(candidate = {}) {
  return Array.isArray(candidate.images) && candidate.images.some((image) => String(image ?? "").trim());
}

function normalizeItems(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.posts)) return raw.posts;
  if (Array.isArray(raw?.candidates)) return raw.candidates;
  return [];
}

function summarizeImagelessCandidates(items = []) {
  const summary = {
    total: items.length,
    with_images: 0,
    imageless: 0,
    text_notice: 0,
    attachment_image_candidate: 0,
    preferred_attachment_image: 0,
    imageless_by_site: {},
  };

  for (const item of items) {
    if (hasImage(item)) {
      summary.with_images += 1;
    } else {
      summary.imageless += 1;
      const site = String(item.siteId ?? item.site ?? item.collectionSourceSlug ?? "unknown");
      summary.imageless_by_site[site] = (summary.imageless_by_site[site] ?? 0) + 1;
    }

    if (item.noticeOnly === true || item.contentMode === "text_notice") summary.text_notice += 1;
    if (Array.isArray(item.attachmentImageCandidates) && item.attachmentImageCandidates.length > 0) {
      summary.attachment_image_candidate += 1;
    }
    if (Array.isArray(item.preferredImageUrls) && item.preferredImageUrls.length > 0) {
      summary.preferred_attachment_image += 1;
    }
  }

  summary.with_images_rate = summary.total > 0 ? summary.with_images / summary.total : null;
  summary.imageless_rate = summary.total > 0 ? summary.imageless / summary.total : null;
  summary.imageless_by_site = Object.fromEntries(
    Object.entries(summary.imageless_by_site).sort((a, b) => b[1] - a[1]),
  );
  return summary;
}

export function compareImagelessCandidates(beforeItems = [], afterItems = []) {
  const before = summarizeImagelessCandidates(beforeItems);
  const after = summarizeImagelessCandidates(afterItems);
  return {
    before,
    after,
    delta: {
      total: after.total - before.total,
      with_images: after.with_images - before.with_images,
      imageless: after.imageless - before.imageless,
      text_notice: after.text_notice - before.text_notice,
      imageless_rate: before.imageless_rate === null || after.imageless_rate === null
        ? null
        : after.imageless_rate - before.imageless_rate,
    },
  };
}

async function readJsonItems(filePath) {
  const absolute = path.resolve(REPO_ROOT, filePath);
  const raw = JSON.parse(await fs.readFile(absolute, "utf8"));
  return normalizeItems(raw);
}

async function main() {
  const args = parseArgs();
  if (args.help || args.h || !args.before || !args.after) {
    console.log(`Usage:
  node src/measure-imageless-candidates.js --before=data/results/before.json --after=data/results/after.json [--out=data/eval/reports/imageless.json]

Compares crawler result files and reports whether image-less candidates decreased.`);
    process.exit(args.before && args.after ? 0 : 1);
  }

  const report = {
    generated_at: new Date().toISOString(),
    before_file: path.resolve(REPO_ROOT, args.before),
    after_file: path.resolve(REPO_ROOT, args.after),
    ...compareImagelessCandidates(
      await readJsonItems(args.before),
      await readJsonItems(args.after),
    ),
  };
  const output = path.resolve(REPO_ROOT, args.out || DEFAULT_OUT);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    output,
    before_imageless: report.before.imageless,
    after_imageless: report.after.imageless,
    delta_imageless: report.delta.imageless,
    before_imageless_rate: report.before.imageless_rate,
    after_imageless_rate: report.after.imageless_rate,
    delta_imageless_rate: report.delta.imageless_rate,
  }, null, 2));
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
