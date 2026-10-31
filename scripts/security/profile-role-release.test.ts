import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const paths = [
  "apps/web/app/signup/page.tsx",
  "apps/web/app/auth/callback/route.ts",
  "apps/web/app/api/auth/naver/callback/route.ts",
  "apps/web/app/mypage/edit/page.tsx",
  "apps/web/app/api/onboarding/complete/route.ts",
];
const signupStatsPaths = [
  "apps/web/app/api/admin/signup-stats/route.ts",
  "apps/web/lib/authSignupStats.ts",
  "apps/web/app/components/AdminSignupStats.tsx",
  "apps/web/app/admin/page.tsx",
];

test("release preserves the five role-free handlers and adds only approved signup statistics", () => {
  const runtimeDiff = execFileSync(
    "git",
    [
      "diff",
      "--name-only",
      "b3519d2",
      "--",
      "apps/web/app",
      "apps/web/lib",
      "apps/web/middleware.ts",
      "apps/mobile",
      "packages",
    ],
    { encoding: "utf8" },
  )
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  assert.deepEqual(runtimeDiff.sort(), [...paths, ...signupStatsPaths, "apps/web/lib/authSignupStats.test.ts"].sort());
  for (const file of signupStatsPaths) {
    const approved = execFileSync("git", ["show", `74fe413:${file}`], {
      encoding: "utf8",
    });
    assert.equal(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), approved.replace(/\r\n/g, "\n"), file);
  }
  for (const file of paths) {
    let expected = execFileSync("git", ["show", `b3519d2:${file}`], {
      encoding: "utf8",
    }).replace(/\r\n/g, "\n");
    expected = expected
      .replace(/, role: 'user'/, "")
      .replace(/^[ \t]*role: ["']user["'],\n/m, "");
    if (file.includes("onboarding")) {
      const start = expected.indexOf(
        "  // ",
        expected.indexOf("  const admin ="),
      );
      const end = expected.indexOf("  const profileData:", start);
      assert.ok(start >= 0 && end > start);
      expected = (expected.slice(0, start) + expected.slice(end)).replace(
        /^[ \t]*role: currentRole,\n/m,
        "",
      );
    }
    assert.equal(
      readFileSync(file, "utf8").replace(/\r\n/g, "\n"),
      expected,
      file,
    );
  }
});

test("unapproved analytics is absent and existing authorization paths are unchanged", () => {
  for (const file of [
    "apps/web/lib/analytics.ts",
    "apps/web/app/components/GaAnalytics.tsx",
    "apps/web/app/components/AnalyticsConsentSettings.tsx",
  ])
    assert.equal(existsSync(file), false, file);
  for (const file of [
    "apps/web/app/layout.tsx",
    "apps/web/app/privacy/page.tsx",
    "apps/web/app/api/site-visits/route.ts",
    "apps/web/middleware.ts",
    "apps/web/app/api/admin/users/[id]/route.ts",
  ]) {
    const base = execFileSync("git", ["show", `b3519d2:${file}`], {
      encoding: "utf8",
    });
    assert.equal(
      readFileSync(file, "utf8").replace(/\r\n/g, "\n"),
      base.replace(/\r\n/g, "\n"),
      file,
    );
  }
});
