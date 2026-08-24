#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const artifactsDir = path.join(repoRoot, "data", "results");
const startedAt = new Date();

const args = new Set(process.argv.slice(2));
const skipDbReset = args.has("--skip-db-reset");
const skipE2e = args.has("--skip-e2e");
const skipBuild = args.has("--skip-build");

function quoteWindowsArg(value) {
  const text = String(value);
  if (!/[ \t"&|<>^]/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

function run(command, commandArgs, options = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const isWindows = process.platform === "win32";
    const child = spawn(
      isWindows ? process.env.ComSpec || "cmd.exe" : command,
      isWindows
        ? ["/d", "/s", "/c", [command, ...commandArgs].map(quoteWindowsArg).join(" ")]
        : commandArgs,
      {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      shell: false,
      stdio: "inherit",
      },
    );

    child.on("close", (code) => {
      resolve({
        command: [command, ...commandArgs].join(" "),
        cwd: options.cwd ?? repoRoot,
        code,
        duration_ms: Date.now() - started,
      });
    });
  });
}

function group(name) {
  console.log(`\n=== ${name} ===`);
}

const steps = [];

async function runStep(name, command, commandArgs, options) {
  group(name);
  const result = await run(command, commandArgs, options);
  steps.push({ name, ...result });
  if (result.code !== 0) {
    throw new Error(`${name} failed with exit code ${result.code}`);
  }
}

async function main() {
  if (!existsSync(artifactsDir)) mkdirSync(artifactsDir, { recursive: true });

  if (!skipDbReset) {
    await runStep("Supabase local migration reset", "pnpm", [
      "dlx",
      "supabase",
      "db",
      "reset",
    ]);
  } else {
    steps.push({ name: "Supabase local migration reset", skipped: true });
  }

  if (!skipBuild) {
    await runStep("Web typecheck", "pnpm", [
      "--filter",
      "web",
      "exec",
      "tsc",
      "--noEmit",
      "--pretty",
      "false",
    ]);
    await runStep("Web lint", "pnpm", ["--filter", "web", "lint"]);
    await runStep("Web production build", "pnpm", ["--filter", "web", "build"]);
  } else {
    steps.push({ name: "Web typecheck/lint/build", skipped: true });
  }

  if (!skipE2e) {
    await runStep(
      "Phase 1 Playwright smoke flows",
      "pnpm",
      [
        "--filter",
        "web",
        "test:e2e",
        "auth.spec.ts",
        "home.spec.ts",
        "poster.spec.ts",
        "posters-list.spec.ts",
        "authenticated/user/onboarding.spec.ts",
        "authenticated/admin/review.spec.ts",
        "authenticated/admin/operations.spec.ts",
        "authenticated/operator/posters.spec.ts",
      ],
      {
        env: {
          E2E_WORKERS: process.env.E2E_WORKERS ?? "1",
        },
      },
    );
  } else {
    steps.push({ name: "Phase 1 Playwright smoke flows", skipped: true });
  }

  const report = {
    generated_at: new Date().toISOString(),
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    command: `pnpm audit:phase1${process.argv.slice(2).length ? ` ${process.argv.slice(2).join(" ")}` : ""}`,
    steps,
  };
  const reportPath = path.join(artifactsDir, "audit-phase1-report.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\nPhase 1 audit completed. Report: ${reportPath}`);
}

main().catch((error) => {
  const report = {
    generated_at: new Date().toISOString(),
    started_at: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    command: `pnpm audit:phase1${process.argv.slice(2).length ? ` ${process.argv.slice(2).join(" ")}` : ""}`,
    failed: true,
    error: error instanceof Error ? error.message : String(error),
    steps,
  };
  if (!existsSync(artifactsDir)) mkdirSync(artifactsDir, { recursive: true });
  writeFileSync(
    path.join(artifactsDir, "audit-phase1-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
