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
let didWarnMissingRunHistory = false;
let didWarnCollectionSourceAlerts = false;

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

function isMissingRunHistoryError(error) {
  return error?.code === "42P01" || String(error?.message ?? "").includes("collection_source_runs");
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

function getConfigObject(source) {
  const config = source?.config_json;
  return config && typeof config === "object" && !Array.isArray(config) ? config : {};
}

function getUrlOrigin(value) {
  const url = normalizeUrl(value);
  return url ? url.origin : null;
}

function getSourceCategory(source, config) {
  return config.category
    || config.default_category
    || source?.source_type
    || "other";
}

function buildSourceBoards(source, config) {
  if (Array.isArray(config.boards) && config.boards.length > 0) {
    return config.boards
      .map((board, index) => {
        const url = board?.url || board?.list_url || board?.listUrl;
        if (!url) return null;
        return {
          name: String(board.name || board.title || `${source.name} ${index + 1}`).trim(),
          url: String(url).trim(),
          category: board.category || getSourceCategory(source, config),
          selectors: board.selectors && typeof board.selectors === "object" ? board.selectors : undefined,
          pagination: board.pagination && typeof board.pagination === "object" ? board.pagination : undefined,
          urlFilters: board.urlFilters && typeof board.urlFilters === "object" ? board.urlFilters : undefined,
          externalOriginal: board.externalOriginal ?? board.external_original,
          sameHostOnly: board.sameHostOnly ?? board.same_host_only,
          includeUrlPatterns: board.includeUrlPatterns ?? board.include_url_patterns,
          excludeUrlPatterns: board.excludeUrlPatterns ?? board.exclude_url_patterns,
          excludeTitlePatterns: board.excludeTitlePatterns ?? board.exclude_title_patterns,
          apiParams: board.apiParams ?? board.api_params,
          pageSize: Number(board.pageSize ?? board.page_size) || undefined,
          maxPages: Number(board.maxPages ?? board.max_pages) || undefined,
        };
      })
      .filter(Boolean);
  }

  if (!source?.list_url) return [];
  return [{
    name: config.board_name || config.boardName || source.name,
    url: source.list_url,
    category: getSourceCategory(source, config),
  }];
}

export function buildSiteFromCollectionSource(source) {
  if (!source?.source_slug || !source?.name || !source?.list_url) return null;
  if (source.collection_method === "manual") return null;

  const config = getConfigObject(source);
  const boards = buildSourceBoards(source, config);
  if (boards.length === 0) return null;

  return {
    id: source.source_slug,
    name: source.name,
    domain: source.homepage_url || getUrlOrigin(source.list_url) || source.list_url,
    adapter: config.adapter || "generic-board",
    boards,
    selectors: config.selectors || undefined,
    pagination: config.pagination || undefined,
    urlFilters: config.urlFilters || undefined,
    externalOriginal: config.externalOriginal ?? config.external_original,
    sameHostOnly: config.sameHostOnly ?? config.same_host_only,
    includeUrlPatterns: config.includeUrlPatterns ?? config.include_url_patterns,
    excludeUrlPatterns: config.excludeUrlPatterns ?? config.exclude_url_patterns,
    excludeTitlePatterns: config.excludeTitlePatterns ?? config.exclude_title_patterns,
    apiParams: config.apiParams ?? config.api_params,
    pageSize: Number(config.pageSize ?? config.page_size) || undefined,
    maxPages: Number(config.maxPages ?? config.max_pages) || undefined,
    collectionSourceId: source.id,
    collectionSourceSlug: source.source_slug,
  };
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
  const matchedSites = sites.filter((site) => sourceMatchesSite(source, site));
  if (matchedSites.length > 0) return matchedSites;

  const dynamicSite = buildSiteFromCollectionSource(source);
  return dynamicSite ? [dynamicSite] : [];
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
    startedAt: new Date().toISOString(),
    checked: 0,
    created: 0,
    valid: 0,
    duplicate: 0,
    rejected: 0,
    failed: 0,
    missingRequired: 0,
    latestPostFoundAt: null,
    errors: [],
    metadata: {},
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

function mergeCountObjects(current = {}, next = {}) {
  const merged = { ...current };
  for (const [key, value] of Object.entries(next ?? {})) {
    const count = Number(value ?? 0);
    if (Number.isFinite(count)) merged[key] = Number(merged[key] ?? 0) + count;
  }
  return merged;
}

function mergeMetadata(current = {}, next = {}) {
  if (!next || typeof next !== "object" || Array.isArray(next)) return current;

  const merged = { ...current, ...next };
  if (current.skip_reasons || next.skip_reasons) {
    merged.skip_reasons = mergeCountObjects(current.skip_reasons, next.skip_reasons);
  }
  if (current.sites || next.sites) {
    merged.sites = [
      ...(Array.isArray(current.sites) ? current.sites : []),
      ...(Array.isArray(next.sites) ? next.sites : []),
    ].slice(-30);
  }
  if (current.skip_samples || next.skip_samples) {
    merged.skip_samples = [
      ...(Array.isArray(current.skip_samples) ? current.skip_samples : []),
      ...(Array.isArray(next.skip_samples) ? next.skip_samples : []),
    ].slice(0, 30);
  }
  if (current.attachment_samples || next.attachment_samples) {
    merged.attachment_samples = [
      ...(Array.isArray(current.attachment_samples) ? current.attachment_samples : []),
      ...(Array.isArray(next.attachment_samples) ? next.attachment_samples : []),
    ].slice(0, 30);
  }
  if (current.external_original_samples || next.external_original_samples) {
    merged.external_original_samples = [
      ...(Array.isArray(current.external_original_samples) ? current.external_original_samples : []),
      ...(Array.isArray(next.external_original_samples) ? next.external_original_samples : []),
    ].slice(0, 30);
  }
  return merged;
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
    stats.created += Number(values.created ?? 0);
    stats.valid += Number(values.valid ?? 0);
    stats.duplicate += Number(values.duplicate ?? 0);
    stats.rejected += Number(values.rejected ?? 0);
    stats.failed += Number(values.failed ?? 0);
    if (values.error) stats.errors.push(String(values.error));
    stats.metadata = mergeMetadata(stats.metadata, values.metadata);

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

function alertCooldownHours() {
  const value = Number(process.env.CRAWLER_COLLECTION_ALERT_COOLDOWN_HOURS ?? "24");
  return Number.isFinite(value) && value > 0 ? value : 24;
}

function diagnoseCollectionSourceRun(stats, runStatus, patch) {
  const checked = Number(stats.checked ?? 0);
  const valid = Number(stats.valid ?? 0);
  const failed = Number(stats.failed ?? 0);
  const missingRequired = Number(stats.missingRequired ?? 0);
  const validRate = percentage(valid, checked);
  const missingRate = percentage(missingRequired, checked);
  const errorReason = patch.last_error_message || stats.errors?.find(Boolean) || "";

  if (runStatus === "error") {
    return {
      key: "runtime_error",
      severity: "critical",
      label: "실행 오류",
      reason: errorReason || "수집 실행 중 오류가 발생했고 유효 공고가 저장되지 않았습니다.",
    };
  }
  if (runStatus === "partial") {
    return {
      key: "partial_failure",
      severity: "warning",
      label: "부분 실패",
      reason: errorReason || `일부 항목 수집에 실패했습니다. 실패 ${failed}건`,
    };
  }
  if (runStatus === "empty") {
    return {
      key: "empty_result",
      severity: "warning",
      label: "수집 결과 없음",
      reason: "목록에서 수집 대상이 발견되지 않았습니다. 게시판 구조 변경 또는 신규 공고 없음 여부를 확인하세요.",
    };
  }
  if (checked >= 5 && validRate < 40) {
    return {
      key: "low_valid_rate",
      severity: validRate < 20 ? "critical" : "warning",
      label: "유효 공고 비율 낮음",
      reason: `확인 ${checked}건 중 유효 ${valid}건입니다. 필터 규칙이나 포스터 판정 기준을 점검하세요.`,
    };
  }
  if (checked >= 5 && missingRate >= 30) {
    return {
      key: "missing_required_fields",
      severity: "warning",
      label: "필수 정보 누락 많음",
      reason: `필수 정보 누락률이 ${Math.round(missingRate)}%입니다. 날짜, 기관명, 신청 정보 추출 규칙을 점검하세요.`,
    };
  }

  return null;
}

function buildCollectionSourceAlertMessage(source, stats, diagnosis, patch) {
  const title = `[PosterLink] 수집 점검 필요: ${source.name ?? source.source_slug}`;
  const reason = diagnosis.reason || patch.last_error_message || "수집 결과를 확인해야 합니다.";
  const adminPath = `/admin/collection-sources?source=${encodeURIComponent(source.source_slug)}`;
  const body = [
    `${source.name ?? source.source_slug} 수집원에 점검이 필요합니다.`,
    `진단: ${diagnosis.label} (${diagnosis.key})`,
    `확인 ${stats.checked}, 신규 ${stats.created}, 유효 ${stats.valid}, 중복 ${stats.duplicate}, 제외 ${stats.rejected}, 실패 ${stats.failed}`,
    `사유: ${reason}`,
    `관리 링크: ${adminPath}`,
  ].join("\n");

  return { title, body, reason, adminPath };
}

async function hasRecentCollectionSourceAlert(supabase, sourceId, alertKey) {
  const since = new Date(Date.now() - alertCooldownHours() * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("admin_actions")
    .select("id")
    .eq("target_type", "collection_source")
    .eq("target_id", sourceId)
    .eq("action_type", "update")
    .gte("created_at", since)
    .contains("metadata_json", {
      kind: "collection_source_alert",
      alert_key: alertKey,
    })
    .limit(1);

  if (error) return false;
  return Boolean(data?.length);
}

async function loadAdminUserIds(supabase) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,role")
    .in("role", ["admin", "super_admin"]);
  if (error) throw error;
  return (data ?? []).map((profile) => profile.id).filter(Boolean);
}

async function notifyCollectionSourceAlert(supabase, source, stats, runStatus, patch, options = {}) {
  const diagnosis = diagnoseCollectionSourceRun(stats, runStatus, patch);
  if (!diagnosis) return false;
  if (source.collection_method === "manual" || PROTECTED_STATUSES.has(source.status)) return false;
  if (await hasRecentCollectionSourceAlert(supabase, source.id, diagnosis.key)) return false;

  const logger = options.logger ?? console;
  const { title, body, reason, adminPath } = buildCollectionSourceAlertMessage(source, stats, diagnosis, patch);

  try {
    const userIds = await loadAdminUserIds(supabase);
    if (userIds.length > 0) {
      const { error: notificationError } = await supabase.from("notifications").insert(userIds.map((userId) => ({
        user_id: userId,
        type: "system_notice",
        title,
        body,
        target_type: "system",
      })));
      if (notificationError) throw notificationError;
    }

    await supabase.from("admin_actions").insert({
      target_type: "collection_source",
      target_id: source.id,
      action_type: "update",
      action_reason: reason,
      metadata_json: {
        kind: "collection_source_alert",
        alert_key: diagnosis.key,
        severity: diagnosis.severity,
        label: diagnosis.label,
        run_status: runStatus,
        source_slug: source.source_slug,
        admin_path: adminPath,
        checked: stats.checked,
        valid: stats.valid,
        created: stats.created,
        duplicate: stats.duplicate,
        rejected: stats.rejected,
        failed: stats.failed,
      },
    });

    logger.warn?.(`[collection-sources] Alert created for ${source.source_slug}: ${diagnosis.key}`);
    return true;
  } catch (error) {
    if (!didWarnCollectionSourceAlerts) {
      didWarnCollectionSourceAlerts = true;
      logger.warn?.(`[collection-sources] Failed to create collection source alert: ${error.message}`);
    }
    return false;
  }
}

async function insertCollectionSourceRun(supabase, source, stats, patch, runStatus, options = {}) {
  const finishedAt = options.finishedAt ?? new Date().toISOString();
  const startedAt = stats.startedAt ?? finishedAt;
  const durationMs = Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());
  const runPhase = options.phase ?? "collection";
  const payload = {
    source_id: source.id,
    source_slug: source.source_slug,
    source_name: source.name,
    run_phase: runPhase,
    run_status: runStatus,
    checked_count: stats.checked,
    new_count: stats.created,
    valid_count: stats.valid,
    duplicate_count: stats.duplicate,
    rejected_count: stats.rejected,
    failed_count: stats.failed,
    missing_required_count: stats.missingRequired,
    valid_post_rate: patch.valid_post_rate,
    required_field_missing_rate: patch.required_field_missing_rate,
    latest_post_found_at: patch.latest_post_found_at ?? null,
    error_message: patch.last_error_message ?? null,
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: Number.isFinite(durationMs) ? durationMs : null,
    metadata_json: mergeMetadata(options.metadata ?? {}, stats.metadata),
  };

  if (runStatus !== "running") {
    const { data: runningRuns, error: runningError } = await supabase
      .from("collection_source_runs")
      .select("id")
      .eq("source_id", source.id)
      .eq("run_phase", runPhase)
      .eq("run_status", "running")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!runningError && runningRuns?.[0]?.id) {
      const { error: updateError } = await supabase
        .from("collection_source_runs")
        .update(payload)
        .eq("id", runningRuns[0].id);

      if (!updateError) return true;
      options.logger?.warn?.(`[collection-sources] Failed to update running run for ${source.source_slug}: ${updateError.message}`);
    }
  }

  const { error } = await supabase
    .from("collection_source_runs")
    .insert(payload);

  if (!error) return true;
  if (isMissingRunHistoryError(error)) {
    if (!didWarnMissingRunHistory) {
      didWarnMissingRunHistory = true;
      options.logger?.warn?.("[collection-sources] collection_source_runs table is not available yet.");
    }
    return false;
  }

  options.logger?.warn?.(`[collection-sources] Failed to insert run history for ${source.source_slug}: ${error.message}`);
  return false;
}

export async function flushCollectionSourceStats(supabase, tracker, options = {}) {
  const logger = options.logger ?? console;
  if (!supabase || !tracker) return { updated: 0, failed: 0 };

  const now = new Date().toISOString();
  let updated = 0;
  let failed = 0;
  let historyInserted = 0;

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
      if (await insertCollectionSourceRun(supabase, source, stats, patch, runStatus, {
        ...options,
        logger,
        finishedAt: now,
      })) {
        historyInserted += 1;
      }
      await notifyCollectionSourceAlert(supabase, source, stats, runStatus, patch, { ...options, logger });
    }
  }

  if (updated > 0 || failed > 0) {
    const message = `[collection-sources] Updated ${updated} source run summaries${historyInserted ? `, ${historyInserted} histories` : ""}${failed ? `, ${failed} failed` : ""}.`;
    if (logger.info) logger.info(message);
    else logger.log?.(message);
  }

  return { updated, failed, historyInserted };
}
