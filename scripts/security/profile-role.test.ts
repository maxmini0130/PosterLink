import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";

const schema = readFileSync(
  "supabase/migrations/20260417000000_consolidated_schema.sql",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20261023010000_protect_profile_role_writes.sql",
  "utf8",
);
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const SUPER = "44444444-4444-4444-8444-444444444444";
const NEW = "55555555-5555-4555-8555-555555555555";

test("isolated PostgreSQL reproduces profile role escalation and validates the migration", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE TABLE public.regions (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT (NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
      ${schema.match(/CREATE TABLE profiles \([\s\S]*?\n\);/)![0]}
      ALTER TABLE public.profiles ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false;
      ALTER TABLE public.profiles ADD COLUMN points integer NOT NULL DEFAULT 0;
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
      ${[...schema.matchAll(/CREATE POLICY "profiles_(?:select|insert|update)"[^;]+;/g)].map((m) => m[0]).join("\n")}
      GRANT SELECT,INSERT,UPDATE,DELETE ON public.profiles TO anon,authenticated,service_role;
      INSERT INTO auth.users VALUES ('${A}'),('${B}'),('${ADMIN}'),('${SUPER}'),('${NEW}');
      INSERT INTO public.profiles(id,role) VALUES ('${A}','user'),('${B}','user'),('${ADMIN}','admin'),('${SUPER}','super_admin');
    `);
    const as = (
      role: "authenticated" | "anon" | "service_role",
      id: string,
      sql: string,
      extra = {},
    ) =>
      db.transaction(async (tx) => {
        await tx.exec(`SET LOCAL ROLE ${role}`);
        await tx.query("SELECT set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ sub: id, role, ...extra }),
        ]);
        return tx.query(sql);
      });
    await t.test(
      "baseline: own-row UPDATE policy allows promotion to admin and super_admin",
      async () => {
        for (const role of ["admin", "super_admin"]) {
          const result = await as(
            "authenticated",
            A,
            `UPDATE public.profiles SET role='${role}' WHERE id='${A}' RETURNING role`,
          );
          assert.equal(result.rows[0].role, role);
        }
        await db.exec(`UPDATE public.profiles SET role='user' WHERE id='${A}'`);
      },
    );
    const rollbackGrants = (
      await db.query<{ statement: string }>(
        readFileSync("scripts/security/profile-role-acl-backup.sql", "utf8"),
      )
    ).rows
      .map((row) => row.statement)
      .join("\n");
    await t.test(
      "read-only catalog preflight and ACL snapshot run without selecting member rows",
      async () => {
        await db.exec(
          readFileSync("scripts/security/profile-role-preflight.sql", "utf8"),
        );
        assert.match(
          rollbackGrants,
          /GRANT UPDATE ON TABLE public.profiles TO authenticated/,
        );
      },
    );
    await db.exec(migration);
    await t.test(
      "column rights: member cannot INSERT/UPDATE role; service writer retains access",
      async () => {
        const r = await db.query<{
          member_insert: boolean;
          member_update: boolean;
          service_update: boolean;
        }>(
          `SELECT has_column_privilege('authenticated','public.profiles','role','INSERT') member_insert, has_column_privilege('authenticated','public.profiles','role','UPDATE') member_update, has_column_privilege('service_role','public.profiles','role','UPDATE') service_update`,
        );
        assert.deepEqual(r.rows[0], {
          member_insert: false,
          member_update: false,
          service_update: true,
        });
      },
    );
    await t.test(
      "direct SQL/REST target-list equivalent: own promotion is denied",
      async () => {
        for (const role of ["admin", "super_admin"])
          await assert.rejects(
            as(
              "authenticated",
              A,
              `UPDATE public.profiles SET role='${role}' WHERE id='${A}'`,
            ),
            (e: { code: string }) => e.code === "42501",
          );
      },
    );
    await t.test("privileged role on profile INSERT is denied", async () => {
      await assert.rejects(
        as(
          "authenticated",
          NEW,
          `INSERT INTO public.profiles(id,role) VALUES ('${NEW}','admin')`,
        ),
        (e: { code: string }) => e.code === "42501",
      );
    });
    await t.test(
      "signup without role uses database default; upsert preserves existing staff roles",
      async () => {
        const fresh = await as(
          "authenticated",
          NEW,
          `INSERT INTO public.profiles(id,nickname) VALUES ('${NEW}','new') RETURNING role`,
        );
        assert.equal(fresh.rows[0].role, "user");
        const staff = await as(
          "authenticated",
          ADMIN,
          `INSERT INTO public.profiles(id,nickname) VALUES ('${ADMIN}','edited') ON CONFLICT(id) DO UPDATE SET id=EXCLUDED.id,nickname=EXCLUDED.nickname RETURNING role,nickname`,
        );
        assert.deepEqual(staff.rows[0], { role: "admin", nickname: "edited" });
      },
    );
    await t.test(
      "ordinary profile edit/push/notification and existing non-role permissions remain",
      async () => {
        const r = await as(
          "authenticated",
          A,
          `UPDATE public.profiles SET nickname='member',age_band='20s',gender='prefer_not_to_say',expo_push_token='synthetic',is_notified=true,onboarding_completed=true WHERE id='${A}' RETURNING role`,
        );
        assert.equal(r.rows[0].role, "user");
      },
    );
    await t.test(
      "other member edits remain denied by existing RLS",
      async () => {
        const r = await as(
          "authenticated",
          A,
          `UPDATE public.profiles SET nickname='not-allowed' WHERE id='${B}' RETURNING id`,
        );
        assert.equal(r.rows.length, 0);
        await assert.rejects(
          as(
            "authenticated",
            A,
            `INSERT INTO public.profiles(id,nickname) VALUES ('${B}','not-allowed')`,
          ),
        );
      },
    );
    await t.test("anonymous writes are denied", async () => {
      await assert.rejects(
        as(
          "anon",
          A,
          `UPDATE public.profiles SET nickname='not-allowed' WHERE id='${A}'`,
        ),
        (e: { code: string }) => e.code === "42501",
      );
    });
    await t.test(
      "claims cannot grant SQL privileges or elevate role",
      async () => {
        await assert.rejects(
          as(
            "authenticated",
            A,
            `UPDATE public.profiles SET role='admin' WHERE id='${A}'`,
            {
              role: "service_role",
              app_metadata: { role: "super_admin" },
              user_metadata: { role: "super_admin" },
            },
          ),
          (e: { code: string }) => e.code === "42501",
        );
      },
    );
    await t.test(
      "trusted service role can perform existing administrator role changes",
      async () => {
        const r = await as(
          "service_role",
          SUPER,
          `UPDATE public.profiles SET role='operator' WHERE id='${B}' RETURNING role`,
        );
        assert.equal(r.rows[0].role, "operator");
      },
    );
    await t.test(
      "service role grants and revokes administrator roles without changing existing staff",
      async () => {
        for (const role of ["admin", "super_admin", "user"]) {
          const result = await as(
            "service_role",
            SUPER,
            `UPDATE public.profiles SET role='${role}' WHERE id='${A}' RETURNING role`,
          );
          assert.equal(result.rows[0].role, role);
        }
        const existing = await db.query<{ role: string }>(
          `SELECT role FROM public.profiles WHERE id IN ('${ADMIN}','${SUPER}') ORDER BY role`,
        );
        assert.deepEqual(
          existing.rows.map((row) => row.role),
          ["admin", "super_admin"],
        );
      },
    );
    await t.test(
      "DEFINER owner cannot turn a member session into a trusted writer",
      async () => {
        await db.exec(
          `CREATE FUNCTION public.test_definer_role_write() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ UPDATE public.profiles SET role='admin' WHERE id='${A}' $$; GRANT EXECUTE ON FUNCTION public.test_definer_role_write() TO authenticated`,
        );
        await assert.rejects(
          as("authenticated", A, "SELECT public.test_definer_role_write()"),
          (e: { code: string }) => e.code === "42501",
        );
      },
    );
    await t.test(
      "trigger also blocks unsafe writes if a column grant is accidentally restored",
      async () => {
        await db.exec(
          "GRANT UPDATE(role), INSERT(role) ON public.profiles TO authenticated",
        );
        await assert.rejects(
          as(
            "authenticated",
            A,
            `UPDATE public.profiles SET role='admin' WHERE id='${A}'`,
          ),
          (e: { code: string }) => e.code === "42501",
        );
        await db.exec(
          "REVOKE UPDATE(role), INSERT(role) ON public.profiles FROM authenticated",
        );
      },
    );
    await t.test(
      "migration is re-runnable without granting previously unavailable role access",
      async () => {
        const privileges = () =>
          db.query(
            `SELECT attname, has_column_privilege('authenticated',attrelid,attnum,'INSERT') member_insert, has_column_privilege('authenticated',attrelid,attnum,'UPDATE') member_update, has_column_privilege('service_role',attrelid,attnum,'UPDATE') service_update FROM pg_attribute WHERE attrelid='public.profiles'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum`,
          );
        const before = (await privileges()).rows;
        const policies = (
          await db.query(
            "SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='profiles' ORDER BY policyname",
          )
        ).rows;
        await db.exec(migration);
        assert.deepEqual((await privileges()).rows, before);
        assert.deepEqual(
          (
            await db.query(
              "SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='profiles' ORDER BY policyname",
            )
          ).rows,
          policies,
        );
        const r = await db.query<{ allowed: boolean }>(
          "SELECT has_column_privilege('authenticated','public.profiles','role','UPDATE') allowed",
        );
        assert.equal(r.rows[0].allowed, false);
      },
    );
    await t.test(
      "existing administrator DEFINER points RPC still works; ordinary members are denied",
      async () => {
        await db.exec(
          readFileSync(
            "supabase/migrations/20260508020000_add_increment_points_rpc.sql",
            "utf8",
          ),
        );
        await as(
          "authenticated",
          ADMIN,
          `SELECT public.increment_points('${B}',3)`,
        );
        const r = await db.query<{ points: number }>(
          `SELECT points FROM public.profiles WHERE id='${B}'`,
        );
        assert.equal(r.rows[0].points, 3);
        await assert.rejects(
          as("authenticated", A, `SELECT public.increment_points('${B}',3)`),
        );
      },
    );
    await t.test(
      "old payloads including unchanged role need a refreshed client",
      async () => {
        await assert.rejects(
          as(
            "authenticated",
            A,
            `UPDATE public.profiles SET role='user',nickname='old-client' WHERE id='${A}'`,
          ),
          (e: { code: string }) => e.code === "42501",
        );
      },
    );
    await t.test(
      "trusted database operator can bootstrap an initial administrator",
      async () => {
        const id = "66666666-6666-4666-8666-666666666666";
        await db.exec(
          `INSERT INTO auth.users VALUES ('${id}'); INSERT INTO public.profiles(id,role) VALUES ('${id}','super_admin')`,
        );
        const r = await db.query<{ role: string }>(
          `SELECT role FROM public.profiles WHERE id='${id}'`,
        );
        assert.equal(r.rows[0].role, "super_admin");
      },
    );
    await t.test(
      "migration refuses disabled RLS rather than silently approving unsafe row access",
      async () => {
        await db.exec("ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY");
        await assert.rejects(db.exec(migration));
        await db.exec(
          "ROLLBACK; ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY",
        );
      },
    );
    await t.test(
      "unexpected inherited role privileges abort the migration atomically",
      async () => {
        await db.exec(
          "CREATE ROLE test_inherited_writer; GRANT UPDATE(role) ON public.profiles TO test_inherited_writer; GRANT test_inherited_writer TO authenticated",
        );
        await assert.rejects(db.exec(migration));
        await db.exec(
          "ROLLBACK; REVOKE test_inherited_writer FROM authenticated",
        );
        const r = await db.query<{ allowed: boolean }>(
          "SELECT has_column_privilege('authenticated','public.profiles','role','UPDATE') allowed",
        );
        assert.equal(r.rows[0].allowed, false);
      },
    );
    await t.test(
      "migration refuses a missing role default needed by signup",
      async () => {
        await db.exec(
          "ALTER TABLE public.profiles ALTER COLUMN role DROP DEFAULT",
        );
        await assert.rejects(db.exec(migration));
        await db.exec(
          "ROLLBACK; ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'user'",
        );
      },
    );
    await t.test(
      "Supabase client and direct REST-shaped requests execute the guarded PostgreSQL writes",
      async () => {
        // This adapter tests HTTP->SQL privileges. It is not a PostgREST/GoTrue
        // replacement and never connects to the operating Supabase project.
        const signature = (value: string) =>
          createHmac("sha256", "isolated-role-test-only")
            .update(value)
            .digest("base64url");
        const unsigned =
          Buffer.from('{"alg":"HS256"}').toString("base64url") +
          "." +
          Buffer.from(
            JSON.stringify({ sub: A, role: "authenticated" }),
          ).toString("base64url");
        const token = unsigned + "." + signature(unsigned);
        const server = createServer(async (req, res) => {
          res.setHeader("Content-Type", "application/json");
          const reply = (status: number, value: unknown) => {
            res.statusCode = status;
            res.end(JSON.stringify(value));
          };
          const bearer = (req.headers.authorization || "").replace(
            "Bearer ",
            "",
          );
          const [head, payload, sig] = bearer.split(".");
          if (sig !== signature(head + "." + payload))
            return reply(401, { message: "invalid test session" });
          const claims = JSON.parse(
            Buffer.from(payload, "base64url").toString(),
          );
          if (claims.role !== "authenticated" || claims.sub !== A)
            return reply(401, { message: "invalid test session" });
          const url = new URL(req.url!, "http://127.0.0.1");
          if (req.method !== "PATCH" || url.pathname !== "/rest/v1/profiles")
            return reply(405, {});
          let body = "";
          for await (const chunk of req) body += chunk;
          try {
            const record = JSON.parse(body) as Record<string, string>;
            if (
              !Object.keys(record).every((key) =>
                ["role", "nickname"].includes(key),
              )
            )
              return reply(400, {});
            const literal = (value: string) =>
              "'" + String(value).replace(/'/g, "''") + "'";
            const sets = Object.entries(record)
              .map(([key, value]) => `"${key}"=${literal(value)}`)
              .join(",");
            const id = (url.searchParams.get("id") || "").replace(/^eq\./, "");
            const result = await as(
              "authenticated",
              A,
              `UPDATE public.profiles SET ${sets} WHERE id=${literal(id)}::uuid RETURNING id`,
            );
            reply(200, result.rows);
          } catch (error) {
            reply(403, {
              code: (error as { code: string }).code,
              message: "test database denied write",
            });
          }
        });
        await new Promise<void>((resolve) =>
          server.listen(0, "127.0.0.1", resolve),
        );
        try {
          const address = server.address() as { port: number };
          const base = `http://127.0.0.1:${address.port}`;
          const client = createClient(base, "isolated-public-key", {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          });
          const promoted = await client
            .from("profiles")
            .update({ role: "admin" })
            .eq("id", A)
            .select("id");
          assert.equal(promoted.error?.code, "42501");
          const direct = await fetch(`${base}/rest/v1/profiles?id=eq.${A}`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ role: "super_admin" }),
          });
          assert.equal(direct.status, 403);
          const other = await client
            .from("profiles")
            .update({ nickname: "forbidden" })
            .eq("id", B)
            .select("id");
          assert.deepEqual(other.data, []);
          const own = await client
            .from("profiles")
            .update({ nickname: "allowed" })
            .eq("id", A)
            .select("id");
          assert.equal(own.error, null);
          assert.equal(own.data?.length, 1);
          const tampered = await fetch(`${base}/rest/v1/profiles?id=eq.${A}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${unsigned}.invalid` },
            body: JSON.stringify({ role: "admin" }),
          });
          assert.equal(tampered.status, 401);
        } finally {
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          );
        }
      },
    );
    await t.test(
      "isolated emergency rollback restores the captured ACL without changing member roles",
      async () => {
        const before = (
          await db.query("SELECT id,role FROM public.profiles ORDER BY id")
        ).rows;
        await db.exec(
          `BEGIN; DROP TRIGGER guard_profile_role_writes ON public.profiles; DROP FUNCTION public.guard_profile_role_writes(); REVOKE INSERT,UPDATE ON public.profiles FROM PUBLIC,anon,authenticated,service_role; DO $$ DECLARE cols text; BEGIN SELECT string_agg(format('%I',attname),',') INTO cols FROM pg_attribute WHERE attrelid='public.profiles'::regclass AND attnum>0 AND NOT attisdropped; EXECUTE format('REVOKE INSERT (%s),UPDATE (%s) ON public.profiles FROM PUBLIC,anon,authenticated,service_role',cols,cols); END $$; ${rollbackGrants} COMMIT;`,
        );
        assert.deepEqual(
          (await db.query("SELECT id,role FROM public.profiles ORDER BY id"))
            .rows,
          before,
        );
        const r = await db.query<{ allowed: boolean }>(
          "SELECT has_column_privilege('authenticated','public.profiles','role','UPDATE') allowed",
        );
        assert.equal(r.rows[0].allowed, true); // Restores the unsafe baseline, not a recommended operating state.
      },
    );
  } finally {
    await db.close();
  }
});
