import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const SOURCE_SELECT = [
  "id",
  "source_slug",
  "name",
  "source_type",
  "homepage_url",
  "list_url",
  "status",
  "priority",
  "collection_method",
  "collection_interval_minutes",
  "consecutive_error_count",
  "config_json",
].join(",");

const PROTECTED_STATUSES = new Set(["paused", "retired"]);

function getCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  if (key.includes("*") || key.startsWith("sb_publishable_")) return null;
  return { url, key };
}

export function createOptionalCollectionSourceClient(logger = console) {
  const credentials = getCredentials();
  if (!credentials) return null;

  try {
    return createClient(credentials.url, credentials.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      realtime: {
        transport: WebSocket,
      },
    });
  } catch (error) {
    logger.warn?.(`[collection-sources] Supabase client disabled: ${error.message}`);
    return null;
  }
}

function isMissingTableError(error) {
  return error?.code === "42P01" || String(error?.message ?? "").includes("collection_sources");
}

export async function loadCollectionSources(supabase, logger = console) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("collection_sources")
    .select(SOURCE_SELECT);

  if (isMissingTableError(error)) {
    logger.warn?.("[collection-sources] collection_sources table is not available yet.");
    return [];
  }

  if (error) {
    logger.warn?.(`[collection-sources] Failed to load sources: ${error.message}`);
    return [];
  }

  return data ?? [];
}

function normalizeUrl(value) {
  if (!value) return null;

  try {
    return new URL(String(value).trim());
  } catch {
    return null;
  }
}

function getHost(value) {
  return normalizeUrl(value)?.hostname.replace(/^www\./, "").toLowerCase() ?? null;
}

function getPath(value) {
  const url = normalizeUrl(value);
  if (!url) return "";
  return url.pathname.replace(/\/+$/, "");
}

function getConfiguredSiteIds(source) {
  const raw = source?.config_json?.site_ids;
  if (!Array.isArray(raw)) return [];
  return raw.map((value) => String(value).trim()).filter(Boolean);
}

function getSiteUrls(site) {
  return [
    site?.domain,
    ...(site?.boards ?? []).map((board) => board?.url),
  ].filter(Boolean);
}

function sameHost(urlA, urlB) {
  const hostA = getHost(urlA);
  const hostB = getHost(urlB);
  return Boolean(hostA && hostB && hostA === hostB);
}

function pathOverlaps(urlA, urlB) {
  const pathA = getPath(urlA);
  const pathB = getPath(urlB);
  if (!pathA || !pathB) return false;
  return pathA.startsWith(pathB) || pathB.startsWith(pathA);
}

export function sourceMatchesSite(source, site) {
  if (!source || !site) return false;

  const configuredSiteIds = getConfiguredSiteIds(source);
  if (source.source_slug === site.id || configuredSiteIds.includes(site.id)) return true;
  if (source.name && source.name === site.name) return true;

  const sourceUrls = [source.list_url, source.homepage_url].filter(Boolean);
  const siteUrls = getSiteUrls(site);

  for (const sourceUrl of sourceUrls) {
    for (const siteUrl of siteUrls) {
      if (!sameHost(sourceUrl, siteUrl)) continue;
      if (pathOverlaps(sourceUrl, siteUrl)) return true;
    }
  }

  return false;
}

export function resolveSitesForCollectionSource(source, sites = []) {
  if (!source) return [];
  return sites.filter((site) => sourceMatchesSite(source, site));
}

function scoreSource(source, context) {
  const siteId = context.siteId || context.site?.id || context.post?.siteId || null;
  const sourceUrl = context.sourceUrl || context.post?.sourceUrl || context.post?.url || context.site?.boards?.[0]?.url || null;
  const sourceHost = getHost(sourceUrl);
  const siteName = context.siteName || context.site?.name || context.post?.site || null;

  if (siteId && source.source_slug === siteId) return 1000;
  if (siteId && getConfiguredSiteIds(source).includes(siteId)) return 950;
  if (siteName && source.name === siteName) return 900;

  if (!sourceHost) return 0;

  const listHost = getHost(source.list_url);
  const homepageHost = getHost(source.homepage_url);
  if (listHost === sourceHost) {
    const sourcePath = getPath(sourceUrl);
    const listPath = getPath(source.list_url);
    const pathScore = listPath && sourcePath.startsWith(listPath) ? Math.min(listPath.length, 200) : 0;
    return 700 + pathScore;
  }

  if (homepageHost === sourceHost) return 600;
  return 0;
}

export function findCollectionSource(sources, context = {}) {
  let bestSource = null;
  let bestScore = 0;

  for (const source of sources ?? []) {
    const score = scoreSource(source, context);
    if (score > bestScore) {
      bestScore = score;
      bestSource = source;
    }
  }

  return bestSource;
}

function createEmptyStats(source) {
  return {
    source,
    checked: 0,
    created: 0,
    valid: 0,
    duplicate: 0,
    rejected: 0,
    failed: 0,
    missingRequired: 0,
    latestPostFoundAt: null,
    errors: [],
  };
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function latestDate(...values) {
  let latest = null;
  for (const value of values) {
    const date = parseDate(value);
    if (date && (!latest || date > latest)) latest = date;
  }
  return latest?.toISOString() ?? null;
}

function hasRequiredFields(post) {
  const sourceUrl = post?.sourceUrl || post?.url;
  return Boolean(post?.title && sourceUrl);
}

export function createCollectionSourceStats(sources = []) {
  const statsBySourceId = new Map();
  const unmatched = new Map();

  function getStats(context) {
    const source = findCollectionSource(sources, context);
    if (!source) {
      const key = context.siteId || context.post?.siteId || context.sourceUrl || context.post?.sourceUrl || context.post?.url || "unknown";
      unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
      return null;
    }

    let stats = statsBySourceId.get(source.id);
    if (!stats) {
      stats = createEmptyStats(source);
      statsBySourceId.set(source.id, stats);
    }
    return stats;
  }

  function recordChecked(post) {
    const stats = getStats({ post });
    if (!stats) return;

    stats.checked += 1;
    if (!hasRequiredFields(post)) stats.missingRequired += 1;

    const latest = latestDate(post.date, post.deadline, post.crawledAt);
    if (latest && (!stats.latestPostFoundAt || latest > stats.latestPostFoundAt)) {
      stats.latestPostFoundAt = latest;
    }
  }

  function recordSiteRun(site, values = {}) {
    const stats = getStats({ site, siteId: site?.id, siteName: site?.name });
    if (!stats) return;

    stats.checked += Number(values.checked ?? 0);
    stats.valid += Number(values.valid ?? 0);
    stats.rejected += Number(values.rejected ?? 0);
    stats.failed += Number(values.failed ?? 0);
    if (values.error) stats.errors.push(String(values.error));

    const latest = latestDate(values.latestPostFoundAt);
    if (latest && (!stats.latestPostFoundAt || latest > stats.latestPostFoundAt)) {
      stats.latestPostFoundAt = latest;
    }
  }

  function recordCreated(post) {
    const stats = getStats({ post });
    if (!stats) return;
    stats.created += 1;
    stats.valid += 1;
  }

  function recordDuplicate(post) {
    const stats = getStats({ post });
    if (!stats) return;
    stats.duplicate += 1;
    stats.valid += 1;
  }

  function recordRejected(post, reason) {
    const stats = getStats({ post });
    if (!stats) return;
    stats.rejected += 1;
  }

  function recordFailed(post, reason) {
    const stats = getStats({ post });
    if (!stats) return;
    stats.failed += 1;
    if (reason) stats.errors.push(String(reason));
  }

  function values() {
    return [...statsBySourceId.values()];
  }

  return {
    recordChecked,
    recordSiteRun,
    recordCreated,
    recordDuplicate,
    recordRejected,
    recordFailed,
    values,
    unmatched,
  };
}

function percentage(part, total) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

function getRunStatus(stats) {
  if (stats.failed > 0 && stats.valid === 0) return "error";
  if (stats.failed > 0) return "partial";
  if (stats.checked === 0) return "empty";
  return "success";
}

function shouldPromoteToActive(source) {
  return !PROTECTED_STATUSES.has(source.status);
}

export async function flushCollectionSourceStats(supabase, tracker, options = {}) {
  const logger = options.logger ?? console;
  if (!supabase || !tracker) return { updated: 0, failed: 0 };

  const now = new Date().toISOString();
  let updated = 0;
  let failed = 0;

  for (const stats of tracker.values()) {
    const runStatus = getRunStatus(stats);
    const hasTechnicalError = runStatus === "error" || runStatus === "partial";
    const firstError = stats.errors.find(Boolean);
    const source = stats.source;

    const patch = {
      last_collected_at: now,
      last_run_status: runStatus,
      last_run_checked_count: stats.checked,
      last_run_new_count: stats.created,
      last_run_valid_count: stats.valid,
      last_run_duplicate_count: stats.duplicate,
      last_run_rejected_count: stats.rejected,
      valid_post_rate: percentage(stats.valid, stats.checked),
      required_field_missing_rate: percentage(stats.missingRequired, stats.checked),
    };

    if (stats.latestPostFoundAt) patch.latest_post_found_at = stats.latestPostFoundAt;

    if (hasTechnicalError) {
      patch.last_error_at = now;
      patch.last_error_message = firstError?.slice(0, 500) ?? "Collection finished with errors.";
      patch.consecutive_error_count = Number(source.consecutive_error_count ?? 0) + 1;
      if (shouldPromoteToActive(source)) patch.status = "error";
    } else {
      patch.last_success_at = now;
      patch.last_error_message = null;
      patch.consecutive_error_count = 0;
      if (shouldPromoteToActive(source)) patch.status = "active";
    }

    const { error } = await supabase
      .from("collection_sources")
      .update(patch)
      .eq("id", source.id);

    if (error) {
      failed += 1;
      logger.warn?.(`[collection-sources] Failed to update ${source.source_slug}: ${error.message}`);
    } else {
      updated += 1;
    }
  }

  if (updated > 0 || failed > 0) {
    const message = `[collection-sources] Updated ${updated} source run summaries${failed ? `, ${failed} failed` : ""}.`;
    if (logger.info) logger.info(message);
    else logger.log?.(message);
  }

  return { updated, failed };
}
