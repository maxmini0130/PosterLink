import { createServer } from "node:http";

const id = "11111111-1111-4111-8111-111111111111";
let scenario = "normal";
const row = (index, extra) => ({
  created_at: new Date(Date.now() - index * 1000).toISOString(),
  user_id: null,
  ip_hash: `fixture-ip-${index}`,
  visitor_key: `fixture-visitor-${index}`,
  session_key: `fixture-session-${index}`,
  path: "/",
  query_string: null,
  referrer_url: null,
  referrer_host: null,
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  user_agent: "Mozilla/5.0 Chrome/126",
  actor_type: "visitor",
  is_automated: false,
  automation_source: null,
  ...extra,
});
const rows = [
  row(0, {}),
  row(1, { referrer_host: "posterlink.kr" }),
  row(2, { referrer_host: "google.com" }),
  row(3, { is_automated: true, automation_source: "manual-test" }),
  row(4, { user_agent: "Googlebot/2.1" }),
  row(5, { user_id: id, actor_type: "admin" }),
];
createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:4014");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:4004");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  const json = (value, status = 200) => {
    res.statusCode = status;
    res.end(JSON.stringify(value));
  };
  if (req.method === "OPTIONS") return json({});
  if (url.pathname === "/") return json({ ok: true });
  if (url.pathname === "/control" && req.method === "POST") {
    scenario = url.searchParams.get("scenario") || "normal";
    return json({ ok: true });
  }
  if (url.pathname === "/auth/v1/user")
    return json({
      id,
      aud: "authenticated",
      role: "authenticated",
      email: "fixture@example.invalid",
      app_metadata: {},
      user_metadata: {},
    });
  if (url.pathname === "/rest/v1/profiles") {
    if (
      scenario === "fallback-roles" &&
      url.searchParams.get("id")?.startsWith("in.")
    )
      return json(
        { code: "XX000", message: "Fixture profile read failure" },
        500,
      );
    const profile = { id, role: "super_admin", nickname: "Fixture" };
    return json(
      url.searchParams.get("id")?.startsWith("in.") ? [profile] : profile,
    );
  }
  if (url.pathname === "/rest/v1/site_visit_logs" && req.method === "GET") {
    if (scenario === "fallback-read" && !url.searchParams.has("created_at"))
      return json(
        { code: "XX000", message: "Fixture cumulative read failure" },
        500,
      );
    return json(
      scenario === "fallback-roles" && url.searchParams.has("created_at")
        ? rows.slice(0, 3)
        : rows,
    );
  }
  if (url.pathname === "/rest/v1/rpc/get_site_visit_identity_overview") {
    if (scenario.startsWith("fallback-"))
      return json(
        { code: "PGRST202", message: "Fixture missing overview RPC" },
        404,
      );
    let body = "";
    req.on("data", (part) => {
      body += part;
    });
    req.on("end", () => {
      const count = JSON.parse(body || "{}").p_include_internal ? 6 : 3;
      json({
        total_visitors: count,
        total_sessions: count,
        total_pageviews: count,
        period_visitors: count,
        period_sessions: count,
        period_pageviews: count,
        today_visitors: count,
        today_pageviews: count,
      });
    });
    return;
  }
  return json({ error: "Fixture denies unsupported request" }, 405);
}).listen(4014, "127.0.0.1");
