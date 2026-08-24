#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { evaluateGoldenSet } from "./extraction-eval.js";

const DEFAULT_SET = "eval/golden";
const DEFAULT_OUT = `data/eval/reports/extraction-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
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
  node src/eval-extraction.js [--set=eval/golden] [--extractor=current] [--out=data/eval/reports/<timestamp>.json]

Reads git-managed JSON labels from eval/golden/*.json, fetches current
poster_field_evidence rows, and reports field accuracy, precision@threshold,
coverage@threshold, hallucination rate, and recommended thresholds.

Golden JSON shape:
  {
    "poster_id": "uuid",
    "labeled_by": "max",
    "labeled_at": "2026-08-25",
    "truth": {
      "deadline_date": "2026-08-31",
      "host_org": "서울청년센터 동대문",
      "official_url": "https://..."
    }
  }`);
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

async function listJsonFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function normalizeGolden(raw, file) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const items = Array.isArray(raw.items) ? raw.items : [raw];
  return items
    .filter((item) => item?.poster_id || item?.posterId)
    .map((item) => ({
      ...item,
      poster_id: item.poster_id ?? item.posterId,
      source_file: path.relative(REPO_ROOT, file).replace(/\\/g, "/"),
      truth: item.truth ?? {},
    }))
    .filter((item) => Object.keys(item.truth).length > 0);
}

async function readGoldenSet(setPath) {
  const absoluteSet = path.resolve(REPO_ROOT, setPath);
  const files = await listJsonFiles(absoluteSet).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const goldens = [];
  for (const file of files) {
    const raw = JSON.parse(await fs.readFile(file, "utf8"));
    goldens.push(...normalizeGolden(raw, file));
  }
  return { files, goldens };
}

async function fetchEvidence(supabase, posterIds, extractorMode) {
  if (posterIds.length === 0) return [];
  const rows = [];
  for (let index = 0; index < posterIds.length; index += 200) {
    const chunk = posterIds.slice(index, index + 200);
    for (let offset = 0; ; offset += 1000) {
      let query = supabase
        .from("poster_field_evidence")
        .select("poster_id,field_key,value_text,value_json,confidence,evidence_text,evidence_src,extractor,extracted_at")
        .in("poster_id", chunk)
        .range(offset, offset + 999);
      if (extractorMode && extractorMode !== "current") {
        query = query.eq("extractor", extractorMode);
      }
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
  }
  return rows;
}

async function main() {
  const setPath = args.set || DEFAULT_SET;
  const output = path.resolve(REPO_ROOT, args.out || DEFAULT_OUT);
  const extractor = args.extractor || "current";
  const { files, goldens } = await readGoldenSet(setPath);

  if (goldens.length === 0) {
    const report = {
      generated_at: new Date().toISOString(),
      set: path.resolve(REPO_ROOT, setPath),
      extractor,
      golden_files: files.length,
      labeled_posters: 0,
      labeled_field_count: 0,
      note: "No labeled golden JSON files found. Add labels under eval/golden/*.json.",
    };
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const supabase = createSupabase();
  const posterIds = [...new Set(goldens.map((item) => item.poster_id))];
  const evidenceRows = await fetchEvidence(supabase, posterIds, extractor);
  const evaluation = evaluateGoldenSet(goldens, evidenceRows);
  const report = {
    generated_at: new Date().toISOString(),
    set: path.resolve(REPO_ROOT, setPath),
    extractor,
    golden_files: files.length,
    evidence_rows: evidenceRows.length,
    ...evaluation,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    output,
    extractor,
    golden_files: files.length,
    evidence_rows: evidenceRows.length,
    labeled_posters: report.labeled_posters,
    labeled_field_count: report.labeled_field_count,
    macro_accuracy: report.macro_accuracy,
    recommended_thresholds: Object.fromEntries(
      Object.entries(report.field_metrics ?? {}).map(([fieldKey, metric]) => [
        fieldKey,
        metric.recommended_threshold,
      ]),
    ),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
