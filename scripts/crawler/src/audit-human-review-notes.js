#!/usr/bin/env node
import "./load-env.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { scorePosterImageCandidate } from "./poster-image-rules.js";
import youthSeoul from "./adapters/youth-seoul.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }),
);
const input = path.resolve(
  REPO_ROOT,
  args.input || "data/baseline/human_golden_set_seed_20260728.csv",
);
const output = path.resolve(
  REPO_ROOT,
  args.output || "data/results/human-review-note-audit.json",
);

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error("Missing Supabase credentials");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  row.push(field);
  rows.push(row);

  const [header, ...body] = rows.filter((items) => items.some(Boolean));
  return body.map((items) =>
    Object.fromEntries(
      header.map((key, index) => [
        key.replace(/^\uFEFF/, ""),
        items[index] ?? "",
      ]),
    ),
  );
}

async function fetchPosters(supabase, ids) {
  const rows = [];
  for (let index = 0; index < ids.length; index += 100) {
    const { data, error } = await supabase
      .from("posters")
      .select(
        `
        id,title,source_org_name,poster_status,rejection_reason,thumbnail_url,source_key,
        poster_images(id,storage_path,image_type,width,height,created_at),
        poster_links(id,url,title,link_type,is_primary,created_at)
      `,
      )
      .in("id", ids.slice(index, index + 100));
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

function youthSeoulSourceUrl(poster) {
  const candidates = [
    poster?.source_key,
    ...(poster?.poster_links ?? []).map((link) => link.url),
  ];
  return (
    candidates.find((url) =>
      String(url).includes("youth.seoul.go.kr/infoData/sprtInfo/view.do"),
    ) ?? null
  );
}

async function main() {
  const reviewRows = parseCsv(await fs.readFile(input, "utf-8"))
    .filter((row) => String(row.gold_notes ?? "").trim())
    .filter((row) => String(row.gold_notes).trim() !== "\uC88B\uC544\uC694");
  const posterIds = reviewRows
    .map((row) => String(row.sample_id).match(/^poster:(.+)$/)?.[1])
    .filter(Boolean);
  const posters = await fetchPosters(createSupabase(), posterIds);
  const posterMap = new Map(posters.map((poster) => [poster.id, poster]));

  const rows = reviewRows.map((review) => {
    const posterId = String(review.sample_id).replace(/^poster:/, "");
    return {
      poster_id: posterId,
      gold_notes: review.gold_notes,
      review_source_key: review.source_key,
      review_thumbnail_url: review.thumbnail_url,
      poster: posterMap.get(posterId) ?? null,
    };
  });
  if (args["probe-images"]) {
    for (const row of rows) {
      if (
        !/thumbnail_url|\uC378\uB124\uC77C|\uC774\uBBF8\uC9C0/.test(
          String(row.gold_notes),
        )
      ) {
        continue;
      }
      row.image_audit = await Promise.all(
        (row.poster?.poster_images ?? []).map(async (image) => ({
          ...image,
          rule: await scorePosterImageCandidate(image.storage_path, {
            title: row.poster.title,
            sourceUrl: row.poster.source_key,
          }),
        })),
      );
    }
  }
  if (args["fetch-source-images"]) {
    for (const row of rows) {
      const sourceUrl = youthSeoulSourceUrl(row.poster);
      if (!sourceUrl) continue;

      try {
        const detail = await youthSeoul.parseDetail(sourceUrl);
        row.source_audit = {
          requested_url: sourceUrl,
          title: detail.title ?? null,
          source_url: detail.sourceUrl ?? sourceUrl,
          content: detail.content ?? null,
          images: detail.images ?? [],
          poster_image_rule: detail.posterImageRule ?? null,
          poster_image_candidates: detail.posterImageCandidates ?? [],
          links: detail.links ?? [],
        };
      } catch (error) {
        row.source_audit = {
          requested_url: sourceUrl,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }
  const report = {
    generated_at: new Date().toISOString(),
    input,
    reviewed_issue_count: rows.length,
    missing_poster_count: rows.filter((row) => !row.poster).length,
    source_link_issue_count: rows.filter((row) =>
      String(row.gold_notes).includes("source_key"),
    ).length,
    image_issue_count: rows.filter((row) =>
      /thumbnail_url|\uC378\uB124\uC77C|\uC774\uBBF8\uC9C0/.test(
        String(row.gold_notes),
      ),
    ).length,
    nonposter_count: rows.filter(
      (row) =>
        String(row.gold_notes).trim() === "\uD3EC\uC2A4\uD130 \uC544\uB2D8",
    ).length,
    rows,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf-8");
  console.log(
    JSON.stringify(
      {
        output,
        reviewed_issue_count: report.reviewed_issue_count,
        missing_poster_count: report.missing_poster_count,
        source_link_issue_count: report.source_link_issue_count,
        image_issue_count: report.image_issue_count,
        nonposter_count: report.nonposter_count,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
