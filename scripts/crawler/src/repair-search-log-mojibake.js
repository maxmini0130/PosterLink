#!/usr/bin/env node
import "./load-env.js";

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const REPORT_PATH = path.join(REPO_ROOT, "data", "results", "search-log-mojibake-repair.json");

function parseArgs() {
  return Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.join("=") || "1"];
    }),
  );
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "posterlink-search-log-mojibake-repair" } },
  });
}

function repairUtf8Mojibake(value) {
  if (/[\uac00-\ud7a3]/.test(value)) return value;
  if (!/[ÃÂÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßà-ÿ\u0080-\u009f]/.test(value)) return value;

  try {
    const bytes = Uint8Array.from(Array.from(value), (char) => char.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return /[\uac00-\ud7a3]/.test(decoded) ? decoded : value;
  } catch {
    return value;
  }
}

async function fetchRows(supabase) {
  const { data, error } = await supabase
    .from("search_logs")
    .select("id,query,created_at,result_count")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data ?? [];
}

async function applyRepairs(supabase, repairs) {
  let updated = 0;
  for (const repair of repairs) {
    const { error } = await supabase
      .from("search_logs")
      .update({ query: repair.next_query })
      .eq("id", repair.id);
    if (error) throw error;
    updated += 1;
  }
  return { updated };
}

async function main() {
  const args = parseArgs();
  const apply = args.apply === "1" || args.apply === "true";
  const supabase = createSupabase();
  const rows = await fetchRows(supabase);
  const repairs = rows
    .map((row) => ({
      id: row.id,
      old_query: row.query,
      next_query: repairUtf8Mojibake(String(row.query ?? "")),
      created_at: row.created_at,
      result_count: row.result_count,
    }))
    .filter((row) => row.old_query && row.next_query !== row.old_query);

  const result = apply ? await applyRepairs(supabase, repairs) : { updated: 0 };
  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    scanned_count: rows.length,
    repair_count: repairs.length,
    result,
    repairs,
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");

  console.log(`mode=${report.mode}`);
  console.log(`scanned=${report.scanned_count}`);
  console.log(`repair_count=${report.repair_count}`);
  console.log(`updated=${report.result.updated}`);
  console.log(`report=${REPORT_PATH}`);
  for (const repair of repairs) {
    console.log(`- ${repair.old_query} => ${repair.next_query}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
