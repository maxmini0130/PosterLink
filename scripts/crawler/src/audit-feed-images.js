#!/usr/bin/env node
// Local/staging exports only. This command has no database client or write mode.
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { assessPosterImage } from "../../../packages/lib/posterImagePolicy.cjs";
export function auditFeedImages(rows) {
  const counts = {
    ok: 0,
    missing: 0,
    unsuitable: 0,
    broken: 0,
    uninspected: 0,
  };
  const items = rows.map((row) => {
    const dimensions = row.dimensions ?? row;
    const status = assessPosterImage({
      url: row.url ?? row.primary ?? row.thumbnail_url,
      width: dimensions.image_width ?? dimensions.width,
      height: dimensions.image_height ?? dimensions.height,
      isPoster: row.isPoster,
      broken: row.broken === true,
    });
    counts[status ?? "uninspected"]++;
    return {
      id: row.id,
      status,
      width: dimensions.width ?? null,
      height: dimensions.height ?? null,
    };
  });
  return { mode: "dry-run", counts, items };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  const input = args.find((a) => a.startsWith("--input="))?.slice(8),
    output = args.find((a) => a.startsWith("--output="))?.slice(9);
  if (args.includes("--apply") || !input) {
    console.error(
      "Usage: audit-feed-images.js --input=LOCAL_EXPORT.json [--output=REPORT.json]. No apply mode.",
    );
    process.exitCode = 1;
  } else {
    try {
      const json = JSON.parse(await fs.readFile(input, "utf8"));
      const report = auditFeedImages(
        Array.isArray(json) ? json : (json.rows ?? []),
      );
      if (output)
        await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n");
      console.log(JSON.stringify({ mode: report.mode, counts: report.counts }));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
