#!/usr/bin/env node
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_OUTPUT = "data/eval/reports/public-counts-audit.json";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }),
);

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_KEY are required");
  }
  return createClient(url, key, {
    global: { headers: { "X-Client-Info": "posterlink-public-counts-audit" } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows ?? []) {
    const value = row?.[key] ?? "null";
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

async function exactCount(query) {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

function isAccepting(row) {
  const now = Date.now();
  const start = row.application_start_at ? Date.parse(row.application_start_at) : null;
  const end = row.application_end_at ? Date.parse(row.application_end_at) : null;
  const deadlineType = String(row.deadline_type ?? "");
  if (start !== null && Number.isFinite(start) && start > now) return false;
  if (end !== null && Number.isFinite(end)) return end >= now;
  return deadlineType === "ongoing" || deadlineType === "until_exhausted";
}

async function main() {
  const supabase = createSupabase();
  const output = String(args.output || DEFAULT_OUTPUT);
  const publicExposureFilter = "exposure_tier.is.null,exposure_tier.in.(A,B)";

  const [
    countRes,
    searchRes,
    publishedCount,
    reviewCount,
    rejectedCount,
    closedCount,
    draftCount,
    hiddenCount,
    archivedCount,
    institutionsRes,
    institutionPosterLinksRes,
    sitemapFeedRes,
    archiveEvidenceRes,
  ] = await Promise.all([
    supabase.rpc("count_public_posters", {
      p_query: null,
      p_category_id: null,
      p_region_ids: null,
      p_include_closed: false,
    }),
    supabase
      .rpc("search_public_posters", {
        p_query: null,
        p_category_id: null,
        p_region_ids: null,
        p_include_closed: false,
        p_sort: "latest",
        p_limit: 500,
      })
      .select("id,application_start_at,application_end_at,deadline_type,exposure_tier"),
    exactCount(supabase.from("posters").select("id", { count: "exact", head: true }).eq("poster_status", "published")),
    exactCount(supabase.from("posters").select("id", { count: "exact", head: true }).eq("poster_status", "review")),
    exactCount(supabase.from("posters").select("id", { count: "exact", head: true }).eq("poster_status", "rejected")),
    exactCount(supabase.from("posters").select("id", { count: "exact", head: true }).eq("poster_status", "closed")),
    exactCount(supabase.from("posters").select("id", { count: "exact", head: true }).eq("poster_status", "draft")),
    exactCount(supabase.from("posters").select("id", { count: "exact", head: true }).eq("poster_status", "hidden")),
    exactCount(supabase.from("posters").select("id", { count: "exact", head: true }).eq("poster_status", "archived")),
    supabase
      .from("institutions")
      .select("id,slug,name")
      .eq("is_public", true)
      .not("slug", "is", null)
      .neq("slug", "")
      .limit(1000),
    supabase
      .from("posters")
      .select("id,organizer_id,source_institution_id,application_start_at,application_end_at,deadline_type,exposure_tier")
      .eq("poster_status", "published")
      .or(publicExposureFilter)
      .limit(5000),
    supabase
      .rpc("search_public_posters", {
        p_query: null,
        p_category_id: null,
        p_region_ids: null,
        p_include_closed: false,
        p_sort: "latest",
        p_limit: 500,
      })
      .select("id,application_start_at,application_end_at,deadline_type,exposure_tier"),
    supabase
      .from("poster_field_evidence")
      .select("poster_id")
      .eq("field_key", "content_type")
      .in("value_text", ["news", "admin"])
      .gte("confidence", 0.8)
      .order("extracted_at", { ascending: false })
      .limit(1000),
  ]);

  const errors = [
    countRes.error,
    searchRes.error,
    institutionsRes.error,
    institutionPosterLinksRes.error,
    sitemapFeedRes.error,
    archiveEvidenceRes.error,
  ].filter(Boolean);
  if (errors.length > 0) throw errors[0];

  const institutionIds = new Set((institutionsRes.data ?? []).map((row) => row.id));
  const institutionPosterLinks = institutionPosterLinksRes.data ?? [];
  const institutionsWithActivePosters = new Set();
  for (const poster of institutionPosterLinks) {
    if (!isAccepting(poster)) continue;
    if (poster.organizer_id && institutionIds.has(poster.organizer_id)) {
      institutionsWithActivePosters.add(poster.organizer_id);
    }
    if (poster.source_institution_id && institutionIds.has(poster.source_institution_id)) {
      institutionsWithActivePosters.add(poster.source_institution_id);
    }
  }

  const archivePosterIds = [...new Set((archiveEvidenceRes.data ?? []).map((row) => row.poster_id).filter(Boolean))];
  const archiveRowsRes = archivePosterIds.length
    ? await supabase
        .from("posters")
        .select("id,application_start_at,application_end_at,deadline_type")
        .eq("poster_status", "published")
        .in("id", archivePosterIds)
        .limit(1000)
    : { data: [], error: null };
  if (archiveRowsRes.error) throw archiveRowsRes.error;
  const sitemapPosterIds = new Set((sitemapFeedRes.data ?? []).map((row) => row.id));
  for (const row of archiveRowsRes.data ?? []) {
    if (row.id && isAccepting(row)) sitemapPosterIds.add(row.id);
  }

  const report = {
    generated_at: new Date().toISOString(),
    public_posters: {
      count_public_posters: countRes.data,
      search_public_posters_returned: searchRes.data?.length ?? 0,
      search_matches_count: countRes.data === (searchRes.data?.length ?? 0),
    },
    institutions: {
      public_with_slug: institutionsRes.data?.length ?? 0,
      with_active_public_posters: institutionsWithActivePosters.size,
    },
    sitemap: {
      poster_url_candidates: sitemapPosterIds.size,
      feed_rows: sitemapFeedRes.data?.length ?? 0,
      archive_evidence_rows: archiveEvidenceRes.data?.length ?? 0,
      active_archive_rows: archiveRowsRes.data?.filter(isAccepting).length ?? 0,
    },
    posters: {
      by_status: {
        published: publishedCount,
        review: reviewCount,
        rejected: rejectedCount,
        closed: closedCount,
        draft: draftCount,
        hidden: hiddenCount,
        archived: archivedCount,
      },
      public_search_by_exposure_tier: countBy(searchRes.data, "exposure_tier"),
      public_search_by_deadline_type: countBy(searchRes.data, "deadline_type"),
    },
  };

  const outputPath = path.resolve(REPO_ROOT, output);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ output, ...report }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
