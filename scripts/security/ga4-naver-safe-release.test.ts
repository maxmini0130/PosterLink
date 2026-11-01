import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  APPROVED_SNAPSHOTS,
  checkSupabaseChanges,
  normalize,
} from "./releaseFreezeAllowlist";

test("GA engine and withdrawal transport are reused without replacement", () => {
  for (const file of [
    "analytics.ts",
    "analyticsTransport.ts",
    "analyticsPrivacy.ts",
    "analyticsAuthReceipt.ts",
  ]) {
    const path = `apps/web/lib/${file}`;
    assert.equal(
      readFileSync(path, "utf8").replace(/\r\n/g, "\n"),
      execFileSync("git", ["show", `bb066ee:${path}`], {
        encoding: "utf8",
      }).replace(/\r\n/g, "\n"),
    );
  }
});

test("GA integration retains deployed Naver stop and does not include age or DB changes", () => {
  for (const path of [
    "apps/web/app/api/auth/naver/route.ts",
    "apps/web/app/api/auth/naver/callback/route.ts",
    "apps/web/lib/naverAvailability.ts",
    "apps/web/middleware.ts",
    "apps/web/app/api/auth/delete-account/route.ts",
    "apps/web/instrumentation.ts",
    "apps/web/instrumentation-client.ts",
    "apps/web/lib/sentryPrivacy.ts",
    "apps/web/app/api/admin/signup-stats/route.ts",
  ]) {
    assert.equal(
      readFileSync(path, "utf8").replace(/\r\n/g, "\n"),
      execFileSync("git", ["show", `2faf121:${path}`], {
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
        "2faf121",
        "--",
        "apps/web/app/api/onboarding",
        "apps/mobile",
        "pnpm-lock.yaml",
      ],
      { encoding: "utf8" },
    ).trim(),
    "",
  );
  // Onboarding and migrations keep the unreleased minimum-age gate out by pinning
  // their content: either the base or a reviewed snapshot in releaseFreezeAllowlist.ts.
  const show = (commit: string, path: string) =>
    execFileSync("git", ["show", `${commit}:${path}`], { encoding: "utf8" });
  const onboarding = "apps/web/app/onboarding/page.tsx";
  const current = normalize(readFileSync(onboarding, "utf8"));
  assert.ok(
    [
      show("2faf121", onboarding),
      show(APPROVED_SNAPSHOTS[onboarding], onboarding),
    ]
      .map(normalize)
      .includes(current),
    `${onboarding} differs from its base and reviewed snapshot`,
  );
  assert.deepEqual(
    checkSupabaseChanges(
      execFileSync(
        "git",
        ["diff", "--name-status", "--no-renames", "2faf121", "--", "supabase"],
        { encoding: "utf8" },
      )
        .trim()
        .split("\n")
        .filter(Boolean),
      (path) => readFileSync(path, "utf8"),
      show,
    ),
    [],
  );
});

test("production defaults remain disabled; policy does not invent countries or claim completed automatic deletion", () => {
  const env = readFileSync(".env.example", "utf8");
  assert.match(env, /NEXT_PUBLIC_GA_ENABLED=false/);
  assert.match(env, /NEXT_PUBLIC_GA_POLICY_REVIEWED=false/);
  const policy = readFileSync("apps/web/app/privacy/policy.ts", "utf8");
  for (const value of [
    "주식회사 맥스미니",
    "김정민 대표이사",
    "maxmini@maxmini.co.kr",
    "14개월",
    "국외 처리 승인 대기",
    "현재 자동 탈퇴와 보존기간 자동 정리는 운영하지 않습니다.",
  ])
    assert(policy.includes(value), value);
  assert(!policy.includes("13~18세"));
  assert(
    !readFileSync("apps/web/lib/analytics.ts", "utf8").includes("G-K8EVG5FHHF"),
  );
});
