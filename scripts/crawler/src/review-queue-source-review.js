#!/usr/bin/env node
// AI source review of the review queue, started by the admin "AI 검토 승인"
// button (AI Review Queue workflow, thorough mode).
// For each review row: re-fetch the sources, ask the model for a full
// correction proposal, check it with rule-based validation, and apply it only
// when no rule is violated. Applied rows with risk signals are listed for a
// person (/admin/ai-review-checks); rows that fail a rule stay in review with
// the reasons in field_verification.sourceReviewHold.
//
// Usage:
//   node src/review-queue-source-review.js                       (dry-run: no writes)
//   node src/review-queue-source-review.js --apply --confirm=AI_SOURCE_REVIEW_APPLY
//   node src/review-queue-source-review.js --ids=<uuid,uuid>     (dry-run on given rows, any status)
//   node src/review-queue-source-review.js --rows-file=<backup.json>  (dry-run on saved pre-review rows)
import "./load-env.js";

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { hasActiveQualityGateHold } from "./quality-gate-hold.js";
import {
  fetchSourcesForPoster,
  readableSourceCount,
  sourceCorpus,
} from "./source-review-fetch.js";
import {
  SOURCE_REVIEW_VERSION,
  buildProposalInput,
  modelImages,
  requestProposal,
} from "./source-review-proposal.js";
import { validateProposal } from "./source-review-validate.js";
import {
  POSTER_SELECT,
  applyProposal,
  recordHeld,
} from "./source-review-apply.js";

const CONFIRM_TOKEN = "AI_SOURCE_REVIEW_APPLY";

function parseArgs() {
  return Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.join("=") || "1"];
    }),
  );
}

function todayInKst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
}

async function check(query) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

async function duplicateCandidatesFor(db, row) {
  const ids = { posters: [], poster_notice_candidates: [] };
  for (const issue of row.field_verification?.duplicateIssues ?? []) {
    const match = String(issue?.evidence ?? "").match(
      /existing (poster|notice_candidate) ([0-9a-f-]{36})/,
    );
    if (match)
      ids[match[1] === "poster" ? "posters" : "poster_notice_candidates"].push(
        match[2],
      );
  }
  const out = [];
  if (ids.posters.length) {
    const rows = await check(
      db
        .from("posters")
        .select(
          "id,title,poster_status,organizer_name,application_end_at,event_start_at,event_end_at,source_key,summary_short",
        )
        .in("id", ids.posters),
    );
    out.push(...rows.map((r) => ({ table: "posters", ...r })));
  }
  if (ids.poster_notice_candidates.length) {
    const rows = await check(
      db
        .from("poster_notice_candidates")
        .select("id,title,candidate_status,source_key,summary_short")
        .in("id", ids.poster_notice_candidates),
    );
    out.push(...rows.map((r) => ({ table: "poster_notice_candidates", ...r })));
  }
  return out;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = parseArgs();
  const apply = args.apply === "1" || args.apply === "true";
  if (apply && args.confirm !== CONFIRM_TOKEN)
    throw new Error(`Applying requires --confirm=${CONFIRM_TOKEN}`);
  const ids = String(args.ids ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const rowsFile = args["rows-file"] ? path.resolve(args["rows-file"]) : null;
  if (apply && (ids.length || rowsFile))
    throw new Error("--ids and --rows-file are for dry-run evaluation only");
  const evaluation = Boolean(ids.length || rowsFile);
  const limit = Math.max(1, Math.min(200, Number(args.limit ?? 50)));
  const concurrency = Math.max(1, Math.min(4, Number(args.concurrency ?? 3)));
  const todayKst = process.env.REVIEW_TODAY_KST?.trim() || todayInKst();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayKst))
    throw new Error("REVIEW_TODAY_KST must be YYYY-MM-DD");
  // An evaluation replays a past review day, so deadlines are judged as of
  // that day (noon KST). Real runs always use the clock.
  const evaluationNowMs =
    evaluation && process.env.REVIEW_TODAY_KST
      ? Date.parse(`${todayKst}T12:00:00+09:00`)
      : null;
  const model = process.env.OPENAI_SOURCE_REVIEW_MODEL?.trim() || "gpt-5";
  const runId = process.env.GITHUB_RUN_ID
    ? `gh-${process.env.GITHUB_RUN_ID}`
    : `local-${Date.now()}`;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key)
    throw new Error("Supabase URL and service key are required");
  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { "X-Client-Info": "posterlink-ai-source-review" },
      fetch: (input, init) => {
        // Dry-run never writes.
        if (!apply && (init?.method ?? "GET") !== "GET")
          throw new Error("write blocked in dry-run");
        return fetch(input, { ...init, signal: AbortSignal.timeout(30000) });
      },
    },
  });

  const [categories, audiences] = await Promise.all([
    check(db.from("categories").select("id,name,code").eq("is_active", true)),
    check(db.from("audience_groups").select("id,name")),
  ]);
  const categoryIds = new Set(categories.map((c) => c.id));
  const audienceIds = new Set(audiences.map((a) => a.id));

  let rows;
  if (rowsFile) {
    rows = JSON.parse(await fs.readFile(rowsFile, "utf8")).slice(0, limit);
  } else {
    let query = db.from("posters").select(POSTER_SELECT);
    query = ids.length
      ? query.in("id", ids)
      : query.eq("poster_status", "review").order("created_at").limit(limit);
    rows = await check(query);
  }
  console.error(
    `[source-review] ${rows.length} rows, model ${model}, ${apply ? "apply" : "dry-run"}`,
  );

  const results = await mapLimit(rows, concurrency, async (row, index) => {
    // Evaluation rows may be published already; judge them as if still in review.
    const subject = evaluation ? { ...row, poster_status: "review" } : row;
    const base = { n: index, id: row.id, title: row.title };
    let fetched;
    let proposal;
    let validation;
    let sources = [];
    try {
      fetched = await fetchSourcesForPoster(subject);
      sources = [...fetched.pages, ...fetched.followed].map((p) => ({
        url: p.url,
        finalUrl: p.finalUrl,
        status: p.status,
        via: p.via ?? null,
        error: p.error ?? null,
      }));
      const duplicateCandidates = await duplicateCandidatesFor(db, subject);
      const input = buildProposalInput({
        row: subject,
        fetched,
        todayKst,
        categories,
        audiences,
        duplicateCandidates,
      });
      proposal = await requestProposal(input, modelImages(fetched), {
        model,
        apiKey: process.env.OPENAI_API_KEY?.trim(),
      });
      validation = validateProposal({
        row: evaluation
          ? {
              ...subject,
              field_verification: {
                ...subject.field_verification,
                sourceReviewAuto: undefined,
              },
            }
          : subject,
        proposal,
        corpus: sourceCorpus(fetched),
        readableSources: readableSourceCount(fetched),
        nowMs: evaluationNowMs ?? Date.now(),
        categoryIds,
        audienceIds,
        qualityGateHold: hasActiveQualityGateHold(subject),
        hadDuplicateCandidates: duplicateCandidates.length > 0,
      });
    } catch (error) {
      console.error(`[source-review] ${row.id} failed: ${error.message}`);
      const meta = {
        version: SOURCE_REVIEW_VERSION,
        model,
        runId,
        todayKst,
        sources,
      };
      if (apply)
        await recordHeld(db, row, {
          proposal,
          validation,
          meta,
          error: error.message,
        }).catch(() => false);
      return {
        ...base,
        outcome: "error",
        error: String(error.message).slice(0, 300),
      };
    }

    const meta = {
      version: SOURCE_REVIEW_VERSION,
      model,
      runId,
      todayKst,
      sources,
    };
    const summary = {
      ...base,
      decision: proposal.decision,
      confidence: proposal.confidence,
      violations: validation.violations,
      risks: validation.risks,
      proposal,
    };
    if (validation.violations.length) {
      if (apply) await recordHeld(db, row, { proposal, validation, meta });
      return { ...summary, outcome: "held" };
    }
    if (!apply) return { ...summary, outcome: "would-apply" };
    try {
      const result = await applyProposal(db, row, proposal, validation, meta);
      if (!result.applied)
        return { ...summary, outcome: "skipped", skipReason: result.reason };
      console.error(
        `[source-review] ${row.id} -> ${result.status}${result.needsPostCheck ? " (check)" : ""}`,
      );
      return {
        ...summary,
        outcome: "applied",
        status: result.status,
        needsPostCheck: result.needsPostCheck,
      };
    } catch (error) {
      // Left claimed; the next run skips it (previous-write) and a person reviews it.
      console.error(`[source-review] ${row.id} apply failed: ${error.message}`);
      return {
        ...summary,
        outcome: "apply-error",
        error: String(error.message).slice(0, 300),
      };
    }
  });

  const count = (fn) => results.filter(fn).length;
  const report = {
    generated_at: new Date().toISOString(),
    version: SOURCE_REVIEW_VERSION,
    mode: apply ? "apply" : "dry-run",
    model,
    today_kst: todayKst,
    run_id: runId,
    review_count: rows.length,
    applied: count((r) => r.outcome === "applied"),
    applied_needs_check: count(
      (r) => r.outcome === "applied" && r.needsPostCheck,
    ),
    would_apply: count((r) => r.outcome === "would-apply"),
    held: count((r) => r.outcome === "held"),
    errors: count((r) => ["error", "apply-error"].includes(r.outcome)),
    skipped: count((r) => r.outcome === "skipped"),
    by_decision: results.reduce((acc, r) => {
      if (r.decision) acc[r.decision] = (acc[r.decision] ?? 0) + 1;
      return acc;
    }, {}),
    items: results,
  };

  if (apply && report.applied > 0) {
    await check(
      db.from("admin_actions").insert({
        actor_user_id: null,
        target_type: "poster",
        target_id: null,
        action_type: "approve",
        action_reason: "ai_source_review",
        metadata_json: {
          version: SOURCE_REVIEW_VERSION,
          model,
          run_id: runId,
          today_kst: todayKst,
          reviewed: rows.length,
          applied: results
            .filter((r) => r.outcome === "applied")
            .map((r) => ({
              id: r.id,
              status: r.status,
              needsPostCheck: r.needsPostCheck,
            })),
          held: results.filter((r) => r.outcome === "held").map((r) => r.id),
        },
      }),
    );
  }

  const output = path.resolve(
    args.output ??
      `data/results/ai-source-review-${todayKst.replaceAll("-", "")}-${runId}.json`,
  );
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2), "utf8");
  const { items, ...totals } = report;
  console.log(
    JSON.stringify(
      { output: path.relative(process.cwd(), output), ...totals },
      null,
      2,
    ),
  );
  if (report.errors > 0 && report.errors === rows.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
