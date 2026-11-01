import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

// The Naver identity migration (design docs/NAVER_LOGIN_SECURITY_DESIGN_2026-11-01.md
// option B) against a synthetic auth schema. Only synthetic ids and hashes.
const migration = readFileSync(
  "supabase/migrations/20261101030000_add_naver_identity.sql",
  "utf8",
).replace(/NOTIFY pgrst[^;]*;/g, "");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const hex = (seed: string) => seed.padStart(64, "0");
// Hash of Naver user n under key version v (any 64 hex digits will do).
const nh = (n: number, v: number) => hex(`${v}0${n}`);
const hashes = (n: number, versions: number[]) =>
  JSON.stringify(
    Object.fromEntries(versions.map((v) => [String(v), nh(n, v)])),
  );
const SECRET = hex("a1");
const OTHER_SECRET = hex("a2");
const STATE = hex("b1");
const TOKEN = hex("c1");

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz,
      email_change text DEFAULT '', banned_until timestamptz, deleted_at timestamptz,
      raw_app_meta_data jsonb DEFAULT '{}'::jsonb);
    CREATE TABLE auth.identities (id serial PRIMARY KEY, user_id uuid REFERENCES auth.users(id));
    GRANT USAGE ON SCHEMA auth, public TO authenticated, anon, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;
    INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
      ('${A}', 'a@example.com', now()), ('${B}', 'b@example.com', now()),
      ('${C}', 'c@example.com', now());
    INSERT INTO auth.identities (user_id) VALUES ('${A}'), ('${B}'), ('${C}');
  `);
  await db.exec(migration);
  await db.exec(
    `INSERT INTO naver_hash_keys (version, status) VALUES (1, 'active')`,
  );
  return db;
}

async function one<T = Record<string, unknown>>(
  db: PGlite,
  sql: string,
  params: unknown[] = [],
) {
  return (await db.query<T>(sql, params)).rows[0];
}
const val = async (db: PGlite, sql: string, params: unknown[] = []) =>
  Object.values((await one(db, sql, params)) ?? {})[0];

async function start(
  db: PGlite,
  purpose = "login",
  session: string | null = null,
  parent: string | null = null,
  secret = SECRET,
) {
  return (await val(db, "SELECT naver_tx_start($1, $2, $3, $4, $5)", [
    purpose,
    secret,
    STATE,
    session,
    parent,
  ])) as string;
}
async function callback(db: PGlite, tx: string, h: string, secret = SECRET) {
  return one<{
    purpose: string;
    flow: string | null;
    target_user_id: string | null;
  }>(db, "SELECT * FROM naver_tx_callback($1, $2, $3, $4::jsonb)", [
    tx,
    secret,
    STATE,
    h,
  ]);
}
const state = async (db: PGlite, tx: string) =>
  val(db, "SELECT state FROM naver_auth_transactions WHERE id = $1", [tx]);
const linkedUser = async (db: PGlite, hash: string) =>
  val(
    db,
    `SELECT s.user_id FROM naver_subject_hashes h JOIN naver_subjects s ON s.id = h.subject_id WHERE h.hash = $1`,
    [hash],
  );
const subjects = async (db: PGlite) =>
  Number(await val(db, "SELECT count(*) FROM naver_subjects"));

/** link_session for a signed-in member with a fresh sign-in. */
async function linkSession(db: PGlite, user: string, h: string) {
  const tx = await start(db, "link_session", user);
  await callback(db, tx, h);
  return val(db, "SELECT complete_naver_link($1, $2, $3, now())", [
    tx,
    SECRET,
    user,
  ]);
}

/** A login with an unknown Naver ID that goes to the e-mail step. */
async function toEmail(
  db: PGlite,
  n: number,
  flow: "signup" | "link_email",
  email: string,
  target: string | null,
) {
  const tx = await start(db);
  const r = await callback(db, tx, hashes(n, [1]));
  assert.equal(r.target_user_id, null);
  assert.equal(
    await val(db, "SELECT naver_tx_email_sent($1, $2, $3, $4, $5, $6)", [
      tx,
      SECRET,
      flow,
      email,
      TOKEN,
      target,
    ]),
    true,
  );
  return tx;
}

test("sign-up: e-mail proof, account made by this transaction, then plain logins", async () => {
  const db = await setup();
  const tx = await toEmail(db, 7, "signup", "New@Example.com", null);
  // Wrong token five times fails the transaction.
  const bad = await toEmail(db, 8, "signup", "x@example.com", null);
  for (let i = 0; i < 5; i++)
    assert.equal(
      await val(db, "SELECT naver_tx_confirm_email($1, $2, $3, NULL)", [
        bad,
        SECRET,
        hex("ff"),
      ]),
      false,
    );
  assert.equal(await state(db, bad), "failed");

  assert.equal(
    await val(db, "SELECT naver_tx_confirm_email($1, $2, $3, NULL)", [
      tx,
      SECRET,
      TOKEN,
    ]),
    true,
  );
  assert.equal(
    await val(db, "SELECT naver_tx_creating_user($1, $2)", [tx, SECRET]),
    "new@example.com",
  );
  const NEW = "44444444-4444-4444-8444-444444444444";
  // An account with the same e-mail but not made by this transaction is refused.
  await db.query(
    `INSERT INTO auth.users (id, email, email_confirmed_at, raw_app_meta_data) VALUES ($1, 'new@example.com', now(), '{}')`,
    [NEW],
  );
  assert.equal(
    await val(db, "SELECT naver_tx_user_created($1, $2, $3)", [
      tx,
      SECRET,
      NEW,
    ]),
    false,
  );
  await db.query(
    `UPDATE auth.users SET raw_app_meta_data = jsonb_build_object('naver_tx', $1::text) WHERE id = $2`,
    [tx, NEW],
  );
  assert.equal(
    await val(db, "SELECT naver_tx_user_created($1, $2, $3)", [
      tx,
      SECRET,
      NEW,
    ]),
    true,
  );
  assert.equal(
    await val(db, "SELECT complete_naver_link($1, $2)", [tx, SECRET]),
    NEW,
  );
  assert.equal(await state(db, tx), "completed");
  // Completing again does nothing.
  assert.equal(
    await val(db, "SELECT complete_naver_link($1, $2)", [tx, SECRET]),
    null,
  );

  const login = await start(db);
  const r = await callback(db, login, hashes(7, [1]));
  assert.deepEqual(
    { ...r },
    { purpose: "login", flow: "login", target_user_id: NEW },
  );
  // The same callback cannot be consumed twice.
  assert.equal(await callback(db, login, hashes(7, [1])), undefined);
  assert.equal(
    await val(db, "SELECT naver_tx_complete_login($1, $2, $3)", [
      login,
      SECRET,
      A,
    ]),
    false,
  );
  assert.equal(
    await val(db, "SELECT naver_tx_complete_login($1, $2, $3)", [
      login,
      SECRET,
      NEW,
    ]),
    true,
  );
});

test("the mail link only works in the browser that holds the secret, or after the same Naver re-authenticates", async () => {
  const db = await setup();
  // Attacker (Naver 9) asks to link to A's e-mail.
  const tx = await toEmail(db, 9, "link_email", "a@example.com", A);
  // A opens the mail in another browser: no secret, nothing happens.
  assert.equal(
    await val(db, "SELECT naver_tx_confirm_email($1, $2, $3, NULL)", [
      tx,
      OTHER_SECRET,
      TOKEN,
    ]),
    false,
  );
  // A re-authenticates with A's own Naver (5): mismatch, the request fails.
  const child = await start(db, "reauth", null, tx, OTHER_SECRET);
  assert.equal(
    await val(db, "SELECT naver_tx_reauth_swap($1, $2, $3, $4::jsonb, $5)", [
      child,
      OTHER_SECRET,
      STATE,
      hashes(5, [1]),
      hex("d1"),
    ]),
    false,
  );
  assert.equal(await state(db, tx), "failed");
  assert.equal(await subjects(db), 0);

  // The owner of Naver 9 opens it elsewhere and re-authenticates: the parent moves to the new browser.
  const own = await toEmail(db, 9, "link_email", "a@example.com", A);
  const child2 = await start(db, "reauth", null, own, OTHER_SECRET);
  assert.equal(
    await val(db, "SELECT naver_tx_reauth_swap($1, $2, $3, $4::jsonb, $5)", [
      child2,
      OTHER_SECRET,
      STATE,
      hashes(9, [1]),
      hex("d2"),
    ]),
    true,
  );
  assert.equal(
    await val(db, "SELECT naver_tx_confirm_email($1, $2, $3, NULL)", [
      own,
      SECRET,
      TOKEN,
    ]),
    false,
  ); // old browser secret
  // Signed in as another member in this browser: stop.
  assert.equal(
    await val(db, "SELECT naver_tx_confirm_email($1, $2, $3, $4)", [
      own,
      hex("d2"),
      TOKEN,
      B,
    ]),
    false,
  );
  assert.equal(await state(db, own), "failed");

  const ok = await toEmail(db, 9, "link_email", "a@example.com", A);
  assert.equal(
    await val(db, "SELECT naver_tx_confirm_email($1, $2, $3, NULL)", [
      ok,
      SECRET,
      TOKEN,
    ]),
    true,
  );
  assert.equal(
    await val(db, "SELECT complete_naver_link($1, $2)", [ok, SECRET]),
    A,
  );
  assert.equal(await linkedUser(db, nh(9, 1)), A);
});

test("the final link re-checks the account: e-mail changed, change pending, banned or unconfirmed -> no link", async () => {
  for (const change of [
    "UPDATE auth.users SET email = 'moved@example.com' WHERE id = $1",
    "UPDATE auth.users SET email_change = 'next@example.com' WHERE id = $1",
    "UPDATE auth.users SET banned_until = now() + interval '1 day' WHERE id = $1",
    "UPDATE auth.users SET email_confirmed_at = NULL WHERE id = $1",
    "UPDATE auth.users SET deleted_at = now() WHERE id = $1",
  ]) {
    const db = await setup();
    const tx = await toEmail(db, 3, "link_email", "a@example.com", A);
    assert.equal(
      await val(db, "SELECT naver_tx_confirm_email($1, $2, $3, NULL)", [
        tx,
        SECRET,
        TOKEN,
      ]),
      true,
    );
    await db.query(change, [A]); // after the confirmation screen
    assert.equal(
      await val(db, "SELECT complete_naver_link($1, $2)", [tx, SECRET]),
      null,
      change,
    );
    assert.equal(await state(db, tx), "failed");
    assert.equal(await subjects(db), 0);
  }
  // link_session needs the same member and a sign-in within 10 minutes.
  const db = await setup();
  const tx = await start(db, "link_session", A);
  await callback(db, tx, hashes(3, [1]));
  assert.equal(
    await val(
      db,
      "SELECT complete_naver_link($1, $2, $3, now() - interval '11 minutes')",
      [tx, SECRET, A],
    ),
    null,
  );
  const tx2 = await start(db, "link_session", A);
  await callback(db, tx2, hashes(3, [1]));
  assert.equal(
    await val(db, "SELECT complete_naver_link($1, $2, $3, now())", [
      tx2,
      SECRET,
      B,
    ]),
    null,
  );
  assert.equal(await subjects(db), 0);
});

test("without the account row lock the link is refused and nothing is left behind", async () => {
  const db = await setup();
  const tx = await toEmail(db, 3, "link_email", "a@example.com", A);
  assert.equal(
    await val(db, "SELECT naver_tx_confirm_email($1, $2, $3, NULL)", [
      tx,
      SECRET,
      TOKEN,
    ]),
    true,
  );
  // An owner that may read auth.users but not lock its rows.
  await db.exec(`
    CREATE ROLE naver_owner NOLOGIN BYPASSRLS;
    GRANT USAGE ON SCHEMA auth, public TO naver_owner;
    GRANT SELECT ON auth.users TO naver_owner;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO naver_owner;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO naver_owner;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO naver_owner;
    ALTER FUNCTION complete_naver_link(uuid, text, uuid, timestamptz) OWNER TO naver_owner;
  `);
  assert.equal(
    await val(db, "SELECT complete_naver_link($1, $2)", [tx, SECRET]),
    null,
  );
  assert.equal(await state(db, tx), "failed");
  assert.equal(await subjects(db), 0);
  // Control: the same owner allowed to lock the row links normally.
  await db.exec("GRANT UPDATE ON auth.users TO naver_owner");
  const again = await toEmail(db, 3, "link_email", "a@example.com", A);
  assert.equal(
    await val(db, "SELECT naver_tx_confirm_email($1, $2, $3, NULL)", [
      again,
      SECRET,
      TOKEN,
    ]),
    true,
  );
  assert.equal(
    await val(db, "SELECT complete_naver_link($1, $2)", [again, SECRET]),
    A,
  );
});

test("one Naver ID, one account: across key versions, rotation and recovery", async () => {
  const db = await setup();
  // C linked while only V1 existed; A linked as well.
  assert.equal(await linkSession(db, C, hashes(30, [1])), C);
  assert.equal(await linkSession(db, A, hashes(10, [1])), A);
  // A member who already has a usable Naver link cannot link another one.
  assert.equal(await linkSession(db, A, hashes(11, [1])), null);

  await db.exec(
    `INSERT INTO naver_hash_keys (version, status) VALUES (2, 'active')`,
  );
  // A request without the V2 hash is refused.
  const old = await start(db);
  assert.equal(await callback(db, old, hashes(10, [1])), undefined);
  assert.equal(await state(db, old), "failed");
  // A logs in with both: V2 hash added to A's identity.
  const login = await start(db);
  assert.equal(
    (await callback(db, login, hashes(10, [1, 2])))?.target_user_id,
    A,
  );
  assert.equal(await linkedUser(db, nh(10, 2)), A);
  // B tries A's Naver ID with V1+V2, then with V2 only: both refused, A unchanged.
  assert.equal(await linkSession(db, B, hashes(10, [1, 2])), null);
  const v2only = JSON.stringify({ "1": nh(99, 1), "2": nh(10, 2) });
  assert.equal(await linkSession(db, B, v2only), null);
  assert.equal(await linkedUser(db, nh(10, 1)), A);
  assert.equal(
    await val(db, "SELECT count(*) FROM naver_subjects WHERE user_id = $1", [
      B,
    ]),
    0,
  );

  // V1 retired: only C (never logged in with V2) needs relinking.
  await db.exec(
    `UPDATE naver_hash_keys SET status = 'retired', retired_at = now() WHERE version = 1`,
  );
  const relink = async (user: string) =>
    db.transaction(async (t) => {
      await t.query("SET LOCAL ROLE authenticated");
      await t.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: user }),
      ]);
      return (
        await t.query<{ naver_needs_relink: boolean }>(
          "SELECT * FROM my_login_methods()",
        )
      ).rows[0];
    });
  assert.equal((await relink(C)).naver_needs_relink, true);
  assert.equal((await relink(A)).naver_needs_relink, false);
  const before = await val(
    db,
    "SELECT id FROM naver_subjects WHERE user_id = $1",
    [C],
  );
  // Recovery keeps the identity row and replaces its hashes; the old hash is gone.
  assert.equal(await linkSession(db, C, hashes(30, [2])), C);
  assert.equal(
    await val(db, "SELECT id FROM naver_subjects WHERE user_id = $1", [C]),
    before,
  );
  assert.equal(await linkedUser(db, nh(30, 1)), undefined);
  assert.equal(await linkedUser(db, nh(30, 2)), C);
  assert.equal((await relink(C)).naver_needs_relink, false);
  // A second recovery for C is refused (it now has an active hash).
  assert.equal(await linkSession(db, C, hashes(31, [2])), null);
  assert.equal(
    await val(
      db,
      "SELECT string_agg(event, ',' ORDER BY id) FROM naver_identity_events WHERE user_id = $1",
      [C],
    ),
    "linked,recovered",
  );
});

test("a re-authentication across a rotation with no common key version restarts", async () => {
  const db = await setup();
  const tx = await toEmail(db, 9, "link_email", "a@example.com", A);
  await db.exec(`INSERT INTO naver_hash_keys (version, status) VALUES (2, 'active');
                 UPDATE naver_hash_keys SET status = 'retired', retired_at = now() WHERE version = 1`);
  const child = await start(db, "reauth", null, tx, OTHER_SECRET);
  assert.equal(
    await val(db, "SELECT naver_tx_reauth_swap($1, $2, $3, $4::jsonb, $5)", [
      child,
      OTHER_SECRET,
      STATE,
      hashes(9, [2]),
      hex("d3"),
    ]),
    false,
  );
  assert.equal(await state(db, tx), "failed");
});

test("only service_role runs the functions; members read only their own link state", async () => {
  const db = await setup();
  await linkSession(db, A, hashes(10, [1]));
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(
      db.transaction(async (t) => {
        await t.query(`SET LOCAL ROLE ${role}`);
        await t.query("SELECT naver_tx_start('login', $1, $2)", [
          SECRET,
          STATE,
        ]);
      }),
      /permission denied/,
    );
    await assert.rejects(
      db.transaction(async (t) => {
        await t.query(`SET LOCAL ROLE ${role}`);
        await t.query("SELECT * FROM naver_subject_hashes");
      }),
      /permission denied/,
    );
  }
  await db.transaction(async (t) => {
    await t.query("SET LOCAL ROLE service_role");
    assert.ok(
      await t.query("SELECT naver_tx_start('login', $1, $2)", [SECRET, STATE]),
    );
  });
  const mine = await db.transaction(async (t) => {
    await t.query("SET LOCAL ROLE authenticated");
    await t.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: B }),
    ]);
    return (await t.query("SELECT * FROM my_login_methods()"))
      .rows[0] as Record<string, unknown>;
  });
  assert.equal(mine.naver_linked, false);
});

test("e-mail lookup returns one live account's id and creating transaction only", async () => {
  const db = await setup();
  const row = await one(
    db,
    "SELECT * FROM naver_find_user_by_email(' A@Example.com ')",
  );
  assert.deepEqual({ ...row }, { user_id: A, naver_tx: null });
  await db.query(
    `INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ('55555555-5555-4555-8555-555555555555', 'a@example.com', now())`,
  );
  assert.equal(
    await one(db, "SELECT * FROM naver_find_user_by_email('a@example.com')"),
    undefined,
  );
});

test("unlink needs another sign-in method; old transactions are purged", async () => {
  const db = await setup();
  await linkSession(db, A, hashes(10, [1]));
  await db.query("DELETE FROM auth.identities WHERE user_id = $1", [A]);
  assert.equal(await val(db, "SELECT naver_unlink($1)", [A]), false);
  await db.query("INSERT INTO auth.identities (user_id) VALUES ($1)", [A]);
  assert.equal(await val(db, "SELECT naver_unlink($1)", [A]), true);
  assert.equal(await subjects(db), 0);

  const live = await start(db);
  const stale = await start(db);
  await db.query(
    "UPDATE naver_auth_transactions SET expires_at = now() - interval '2 days', updated_at = now() - interval '2 days' WHERE id = $1",
    [stale],
  );
  await db.query(
    "UPDATE naver_auth_transactions SET state = 'completed', updated_at = now() - interval '8 days' WHERE purpose = 'link_session'",
  );
  await val(db, "SELECT naver_purge_transactions()");
  assert.equal(await state(db, stale), "expired"); // expired now, deleted a day later
  assert.equal(await state(db, live), "started");
  assert.equal(
    Number(
      await val(
        db,
        "SELECT count(*) FROM naver_auth_transactions WHERE purpose = 'link_session'",
      ),
    ),
    0,
  );
});
