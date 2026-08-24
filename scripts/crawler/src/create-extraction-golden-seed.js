#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { bestEvidenceByField } from "./extraction-eval.js";

const DEFAULT_OUTPUT = "data/eval/extraction-golden-seed.json";
const DEFAULT_LIMIT = 120;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }),
);

if (args.help || args.h) {
  console.log(`Usage:
  node src/create-extraction-golden-seed.js [--limit=120] [--output=data/eval/extraction-golden-seed.json]

Creates a reviewer seed file with poster context and current best
poster_field_evidence values. Fill truth fields after checking original sources,
then place reviewed JSON files under eval/golden/.`);
  process.exit(0);
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function compact(value, limit = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

async function fetchPosters(supabase, limit) {
  const { data, error } = await supabase
    .from("posters")
    .select("id,title,poster_status,source_org_name,source_key,thumbnail_url,summary_short,summary_long,application_end_at,created_at")
    .in("poster_status", ["published", "review", "rejected"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

async function fetchEvidence(supabase, posterIds) {
  const rows = [];
  for (let index = 0; index < posterIds.length; index += 200) {
    const chunk = posterIds.slice(index, index + 200);
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("poster_field_evidence")
        .select("poster_id,field_key,value_text,value_json,confidence,evidence_text,evidence_src,extractor")
        .in("poster_id", chunk)
        .range(offset, offset + 999);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
  }
  return rows;
}

function evidenceSummary(rows) {
  const best = bestEvidenceByField(rows);
  return Object.fromEntries([...best.entries()].map(([fieldKey, row]) => [
    fieldKey,
    {
      value_text: row.value_text,
      value_json: row.value_json,
      confidence: row.confidence,
      evidence_text: row.evidence_text,
      evidence_src: row.evidence_src,
      extractor: row.extractor,
    },
  ]));
}

async function main() {
  const output = path.resolve(REPO_ROOT, args.output || DEFAULT_OUTPUT);
  const limit = Math.max(1, Number(args.limit || DEFAULT_LIMIT));
  const supabase = createSupabase();
  const posters = await fetchPosters(supabase, limit);
  const evidenceRows = await fetchEvidence(supabase, posters.map((poster) => poster.id));
  const evidenceByPoster = new Map();

  for (const row of evidenceRows) {
    const list = evidenceByPoster.get(row.poster_id) ?? [];
    list.push(row);
    evidenceByPoster.set(row.poster_id, list);
  }

  const items = posters.map((poster) => ({
    poster_id: poster.id,
    labeled_by: "",
    labeled_at: "",
    context: {
      title: poster.title,
      poster_status: poster.poster_status,
      source_org_name: poster.source_org_name,
      source_key: poster.source_key,
      thumbnail_url: poster.thumbnail_url,
      application_end_at: poster.application_end_at,
      source_excerpt: compact(`${poster.summary_short ?? ""}\n${poster.summary_long ?? ""}`, 1500),
    },
    current_evidence: evidenceSummary(evidenceByPoster.get(poster.id) ?? []),
    truth: {},
  }));

  const report = {
    generated_at: new Date().toISOString(),
    instructions: "Check the original source, fill truth only for reviewed fields, and move reviewed items under eval/golden/*.json.",
    items,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    output,
    sampled: items.length,
    evidence_rows: evidenceRows.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
