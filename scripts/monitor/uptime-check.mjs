// Uptime check for posterlink.kr, run by .github/workflows/uptime-monitor.yml.
// It checks the public pages and the Supabase REST API (which reaches Postgres),
// retries a failed check once, and prints a JSON summary on stdout.
// On 2026-11-25 Supabase stopped answering while the home page still returned 200
// after about 20 s, so a check passes only when it is both successful and fast.
// The summary names checks, status codes and timings only: it is posted to a
// public GitHub issue, so it must never contain URLs, keys or response bodies.
import { pathToFileURL } from "node:url";

export const SLOW_MS = 10_000;
const TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 30_000;

export function buildChecks(env) {
  const site = (env.SITE_URL || "https://www.posterlink.kr").replace(
    /\/+$/,
    "",
  );
  const checks = [
    { name: "홈페이지", url: `${site}/` },
    { name: "공고 목록", url: `${site}/posters` },
  ];
  if (env.SUPABASE_URL && env.SUPABASE_KEY) {
    checks.push({
      name: "Supabase DB(API)",
      url: `${env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/posters?select=id&limit=1`,
      headers: {
        apikey: env.SUPABASE_KEY,
        Authorization: `Bearer ${env.SUPABASE_KEY}`,
      },
    });
  }
  return checks;
}

// Turn one HTTP attempt into a public-safe result.
export function judge({ status, ms, error }) {
  if (error) return { ok: false, status: null, ms, reason: error };
  if (status !== 200)
    return { ok: false, status, ms, reason: `HTTP ${status}` };
  if (ms > SLOW_MS)
    return {
      ok: false,
      status,
      ms,
      reason: `응답 지연 ${(ms / 1000).toFixed(1)}초`,
    };
  return { ok: true, status, ms, reason: null };
}

function errorLabel(e) {
  if (e?.name === "TimeoutError" || e?.name === "AbortError")
    return `시간 초과 ${TIMEOUT_MS / 1000}초`;
  const code = e?.cause?.code;
  return code && /^[A-Z_]+$/.test(code) ? `연결 실패 ${code}` : "연결 실패";
}

async function attempt(check, fetchImpl) {
  const started = Date.now();
  try {
    const res = await fetchImpl(check.url, {
      method: "GET",
      headers: {
        "user-agent": "posterlink-uptime-monitor",
        ...(check.headers ?? {}),
      },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await res.arrayBuffer().catch(() => undefined);
    return judge({ status: res.status, ms: Date.now() - started });
  } catch (e) {
    return judge({ ms: Date.now() - started, error: errorLabel(e) });
  }
}

export async function runChecks(
  checks,
  { fetchImpl = fetch, sleep, retryDelayMs = RETRY_DELAY_MS } = {},
) {
  const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const results = [];
  for (const check of checks) {
    let result = await attempt(check, fetchImpl);
    let attempts = 1;
    if (!result.ok) {
      await wait(retryDelayMs);
      result = await attempt(check, fetchImpl);
      attempts = 2;
    }
    results.push({ name: check.name, attempts, ...result });
  }
  return {
    ok: results.every((r) => r.ok),
    checkedAt: new Date().toISOString(),
    results,
  };
}

export function formatMarkdown(summary) {
  const kst = new Date(summary.checkedAt).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
  });
  const rows = summary.results.map(
    (r) =>
      `| ${r.name} | ${r.ok ? "정상" : "**실패**"} | ${r.status ?? "-"} | ${(r.ms / 1000).toFixed(1)}초 | ${r.reason ?? ""} |`,
  );
  return [
    `확인 시각: ${kst} (KST)`,
    "",
    "| 항목 | 결과 | 상태 코드 | 응답 시간 | 사유 |",
    "|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runChecks(buildChecks(process.env)).then((summary) =>
    console.log(
      JSON.stringify({ ...summary, markdown: formatMarkdown(summary) }),
    ),
  );
}
