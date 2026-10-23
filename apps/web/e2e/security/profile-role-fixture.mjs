// Isolated local HTTP fixture. No real Supabase project or credentials.
import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
const SIGNING_SECRET = "local-test-only-signing-secret";
const sign = (value) =>
  createHmac("sha256", SIGNING_SECRET).update(value).digest("base64url");
let scenario = "normal";

let profileWrites = 0;
let lastProfileHasRole = false;
let lastProfileIsMember = false;
const ids = {
  super_admin: "11111111-1111-4111-8111-111111111111",
  admin: "22222222-2222-4222-8222-222222222222",
  user: "33333333-3333-4333-8333-333333333333",
};
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:4010");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:4002");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  const json = (value, status = 200) => {
    res.statusCode = status;
    res.end(JSON.stringify(value));
  };
  if (url.pathname === "/control" && req.method === "POST") {
    scenario = url.searchParams.get("scenario") || "normal";

    profileWrites = 0;
    lastProfileHasRole = false;
    lastProfileIsMember = false;
    return json({ ok: true });
  }
  if (url.pathname === "/control")
    return json({
      profileWrites,
      lastProfileHasRole,
      lastProfileIsMember,
    });
  if (url.pathname === "/auth/v1/signup" && req.method === "POST") {
    if (scenario === "signup-failure")
      return json({ msg: "Fixture signup failure" }, 400);

    const payload = Buffer.from(
      JSON.stringify({
        sub: ids.user,
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 3600,
        fixture_role: "user",
      }),
    ).toString("base64url");
    return json({
      access_token:
        "eyJhbGciOiJIUzI1NiJ9." +
        payload +
        "." +
        sign("eyJhbGciOiJIUzI1NiJ9." + payload),
      refresh_token: "fixture-refresh",
      token_type: "bearer",
      expires_in: 3600,
      user: {
        id: ids.user,
        email: "fixture@example.invalid",
        created_at: new Date(Date.now() - 1).toISOString(),
        app_metadata: {},
        user_metadata: {},
        identities: [{ provider: "email", id: ids.user }],
      },
    });
  }
  if (url.pathname === "/rest/v1/profiles" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const record = JSON.parse(body);
      profileWrites++;
      lastProfileHasRole = Object.hasOwn(record, "role");
      lastProfileIsMember = record.id === ids.user;
      json({}, 201);
    });
    return;
  }
  if (req.method !== "GET")
    return json({ error: "fixture denies writes" }, 405);
  if (url.pathname === "/auth/v1/user") {
    const token = (req.headers.authorization || "").split(" ")[1] || "";
    let role;
    try {
      const [header, payload, signature] = token.split(".");
      const expected = Buffer.from(sign(`${header}.${payload}`));
      const provided = Buffer.from(signature || "");
      const claims = JSON.parse(Buffer.from(payload, "base64url"));
      if (
        expected.length !== provided.length ||
        !timingSafeEqual(expected, provided) ||
        JSON.parse(Buffer.from(header, "base64url")).alg !== "HS256" ||
        claims.exp <= Date.now() / 1000 ||
        claims.sub !== ids[claims.fixture_role]
      )
        throw new Error("invalid");
      role = claims.fixture_role;
    } catch {
      /* invalid session */
    }
    if (!ids[role]) return json({ message: "invalid fixture token" }, 401);
    return json({
      id: ids[role],
      aud: "authenticated",
      role: "authenticated",
      email: "fixture@example.invalid",
      created_at: "2020-01-01T00:00:00Z",
      app_metadata: {},
      user_metadata: {},
    });
  }
  if (url.pathname === "/rest/v1/profiles") {
    const id = (url.searchParams.get("id") || "").replace("eq.", "");
    return json({
      role:
        scenario === "revoked-role"
          ? "user"
          : Object.keys(ids).find((role) => ids[role] === id) || "user",
      onboarding_completed: true,
    });
  }
  return json({ ok: true });
});
server.listen(4010, "127.0.0.1");
