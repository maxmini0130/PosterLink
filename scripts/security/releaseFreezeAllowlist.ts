/**
 * Reviewed additions the GA release freeze checks accept on top of their base
 * commits. Anything not listed here, byte-for-byte, still fails the checks.
 * A later stage that needs a new migration or another onboarding change adds an
 * entry pinned to its reviewed commit, so the change to this file is reviewed too.
 */

/** Stage 0 retention measurement, reviewed by Codex at 3579136. */
const STAGE0_REVIEWED = "3474a6bbd68384482ad61f132550134ab22a1bfb";

/** New migration path -> commit holding its reviewed content. */
export const APPROVED_MIGRATIONS: Readonly<Record<string, string>> = {
  "supabase/migrations/20261031010000_extend_product_events_for_retention.sql":
    STAGE0_REVIEWED,
};

/** File path -> commit holding its reviewed content; replaces the base pin. */
export const APPROVED_SNAPSHOTS: Readonly<Record<string, string>> = {
  "apps/web/app/onboarding/page.tsx": STAGE0_REVIEWED,
};

const TEST_PATH = /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.test\.ts$/;

export function normalize(text: string) {
  return text.replace(/\r\n/g, "\n");
}

/**
 * The root test script may only gain test files appended to the base command.
 * Returns the problems found; empty means accepted.
 */
export function checkTestScript(
  current: string,
  base: string,
  exists: (path: string) => boolean,
): string[] {
  if (!current.startsWith(base)) return ["base test command changed"];
  const rest = current.slice(base.length);
  const added: string[] = [];
  const problems: string[] = [];
  const pattern = / "([^"]*)"/y;
  let index = 0;
  while (index < rest.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(rest);
    if (!match) return [`unexpected test script suffix: ${rest.slice(index)}`];
    added.push(match[1]);
    index = pattern.lastIndex;
  }
  const baseFiles = new Set(
    [...base.matchAll(/"([^"]*)"/g)].map((match) => match[1]),
  );
  for (const path of added) {
    if (!TEST_PATH.test(path)) problems.push(`not a test file path: ${path}`);
    else if (
      baseFiles.has(path) ||
      added.indexOf(path) !== added.lastIndexOf(path)
    )
      problems.push(`duplicate test file: ${path}`);
    else if (!exists(path)) problems.push(`missing test file: ${path}`);
  }
  return problems;
}

/**
 * `git diff --name-status --no-renames <base> -- supabase` lines may only add
 * approved migrations whose content matches the reviewed commit.
 */
export function checkSupabaseChanges(
  nameStatusLines: string[],
  readCurrent: (path: string) => string,
  readAt: (commit: string, path: string) => string,
): string[] {
  const problems: string[] = [];
  for (const line of nameStatusLines) {
    const [status, path] = line.split("\t");
    const commit = APPROVED_MIGRATIONS[path ?? ""];
    if (status !== "A" || !commit) {
      problems.push(`unapproved supabase change: ${line}`);
      continue;
    }
    if (normalize(readCurrent(path)) !== normalize(readAt(commit, path)))
      problems.push(`migration differs from reviewed content: ${path}`);
  }
  return problems;
}
