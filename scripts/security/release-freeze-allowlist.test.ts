import test from "node:test";
import assert from "node:assert/strict";
import {
  APPROVED_MIGRATIONS,
  checkSupabaseChanges,
  checkTestScript,
} from "./releaseFreezeAllowlist";

const base =
  'tsx --test "scripts/security/profile-role.test.ts" "apps/web/lib/a.test.ts"';
const exists = (path: string) => path !== "apps/web/lib/missing.test.ts";

test("test script accepts only appended existing test files", () => {
  assert.deepEqual(checkTestScript(base, base, exists), []);
  assert.deepEqual(
    checkTestScript(
      `${base} "apps/web/lib/b.test.ts" "scripts/c.test.ts"`,
      base,
      exists,
    ),
    [],
  );
});

test("test script rejects no-op, removed, rewritten or failure-masking commands", () => {
  for (const script of [
    'node -e "process.exit(0)"',
    'tsx --test "apps/web/lib/a.test.ts"',
    `${base} || true`,
    `${base}; exit 0`,
    `${base} "--test-skip-pattern=."`,
    `${base} "$(true).test.ts"`,
    `${base} "apps/web/lib/a.test.ts"`,
    `${base} "apps/web/lib/b.test.ts" "apps/web/lib/b.test.ts"`,
    `${base} "apps/web/lib/missing.test.ts"`,
    `${base} "apps/web/lib/b.ts"`,
    `true && ${base}`,
  ]) {
    assert.notDeepEqual(checkTestScript(script, base, exists), [], script);
  }
});

const [approvedPath, approvedCommit] = Object.entries(APPROVED_MIGRATIONS)[0];
const reviewed = "-- reviewed\nCREATE TABLE x ();\n";
const readAt = (commit: string, path: string) =>
  commit === approvedCommit && path === approvedPath ? reviewed : "";

test("supabase accepts only approved migrations with reviewed content", () => {
  assert.deepEqual(
    checkSupabaseChanges([], () => "", readAt),
    [],
  );
  assert.deepEqual(
    checkSupabaseChanges(
      [`A\t${approvedPath}`],
      () => reviewed.replace(/\n/g, "\r\n"),
      readAt,
    ),
    [],
  );
});

test("supabase rejects unlisted, edited, modified or deleted migrations", () => {
  const ageGate =
    "ALTER TABLE profiles ADD COLUMN birth_date DATE CHECK (birth_date IS NULL OR birth_date <= (CURRENT_DATE - INTERVAL '14 years')::date);";
  const cases: Array<[string[], (path: string) => string]> = [
    [["A\tsupabase/migrations/20261031020000_enrollment.sql"], () => ageGate],
    [[`A\t${approvedPath}`], () => reviewed + ageGate],
    [
      ["M\tsupabase/migrations/20260417000000_consolidated_schema.sql"],
      () => "",
    ],
    [
      ["D\tsupabase/migrations/20260417000000_consolidated_schema.sql"],
      () => "",
    ],
    [[`M\t${approvedPath}`], () => reviewed],
    [["A\tsupabase/config.toml"], () => ""],
  ];
  for (const [lines, readCurrent] of cases) {
    assert.notDeepEqual(
      checkSupabaseChanges(lines, readCurrent, readAt),
      [],
      lines[0],
    );
  }
});
