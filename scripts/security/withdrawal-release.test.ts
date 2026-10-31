import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("withdrawal-only release preserves production authentication, stats, SEO and database code", () => {
  for (const path of [
    "apps/web/middleware.ts",
    "apps/web/app/login/page.tsx",
    "apps/web/app/signup/page.tsx",
    "apps/web/app/auth/callback/route.ts",
    "apps/web/app/api/auth/naver/callback/route.ts",
    "apps/web/app/api/admin/signup-stats/route.ts",
    "apps/web/lib/authSignupStats.ts",
    "apps/web/app/layout.tsx",
  ]) {
    assert.equal(
      readFileSync(path, "utf8").replace(/\r\n/g, "\n"),
      execFileSync("git", ["show", `19db3c39:${path}`], {
        encoding: "utf8",
      }).replace(/\r\n/g, "\n"),
      path,
    );
  }
  assert.equal(
    execFileSync(
      "git",
      [
        "diff",
        "19db3c39",
        "--",
        "supabase/migrations",
        "apps/web/app/api/admin",
        "apps/web/app/robots.ts",
        "apps/web/app/sitemap.ts",
        "apps/web/app/sitemap-index.xml",
      ],
      { encoding: "utf8" },
    ).trim(),
    "",
  );
});
