import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const MAX_LOG_CHARS = 20000;
const RUN_TIMEOUT_MS = Number(process.env.CRAWLER_ADMIN_RUN_TIMEOUT_MS ?? 10 * 60 * 1000);

let activeRun: Promise<RunResult> | null = null;

type RunResult = {
  ok: boolean;
  logs: string;
  resultFile?: string | null;
  uploaded?: boolean;
};

type CrawlerRunner =
  | {
      mode: "bundle";
      bundleDir: string;
      indexPath: string;
      uploadPath: string;
    }
  | {
      mode: "source";
      crawlerDir: string;
    };

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function assertAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return ADMIN_ROLES.has(profile?.role);
}

async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function findCrawlerDir() {
  let current = process.cwd();

  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(current, "scripts", "crawler");
    if (await pathExists(path.join(candidate, "src", "index.js"))) return candidate;

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new Error("scripts/crawler directory was not found from the web app working directory.");
}

async function findCrawlerBundle() {
  let current = process.cwd();

  for (let i = 0; i < 8; i += 1) {
    const candidates = [
      path.join(current, ".generated", "crawler"),
      path.join(current, "apps", "web", ".generated", "crawler"),
    ];

    for (const bundleDir of candidates) {
      const indexPath = path.join(bundleDir, "index.cjs");
      const uploadPath = path.join(bundleDir, "upload-to-supabase.cjs");
      if (await pathExists(indexPath) && await pathExists(uploadPath)) {
        return {
          mode: "bundle" as const,
          bundleDir,
          indexPath,
          uploadPath,
        };
      }
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

async function resolveCrawlerRunner(): Promise<CrawlerRunner> {
  const bundle = await findCrawlerBundle();
  if (bundle) return bundle;

  return {
    mode: "source",
    crawlerDir: await findCrawlerDir(),
  };
}

function appendLog(current: string, chunk: Buffer | string) {
  const next = current + chunk.toString();
  return next.length > MAX_LOG_CHARS ? next.slice(next.length - MAX_LOG_CHARS) : next;
}

function runCommand(command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }) {
  return new Promise<string>((resolve, reject) => {
    let logs = "";
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
        SUPABASE_KEY: process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
        ...options.env,
      },
      shell: process.platform === "win32",
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Command timed out after ${Math.round(RUN_TIMEOUT_MS / 1000)}s\n${logs}`));
    }, RUN_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      logs = appendLog(logs, chunk);
    });
    child.stderr.on("data", (chunk) => {
      logs = appendLog(logs, chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(logs);
      } else {
        reject(new Error(`Command failed with exit code ${code}\n${logs}`));
      }
    });
  });
}

async function findLatestResultFile(workDir: string, startedAt: number) {
  const resultsDir = path.join(workDir, "data", "results");
  const entries = await fs.readdir(resultsDir).catch(() => []);
  const files = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) => {
        const fullPath = path.join(resultsDir, entry);
        const stat = await fs.stat(fullPath);
        return { fullPath, mtimeMs: stat.mtimeMs };
      })
  );

  return files
    .filter((file) => file.mtimeMs >= startedAt - 1000)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.fullPath ?? null;
}

async function runCrawler(options: { site?: string | null; source?: string | null } = {}) {
  const startedAt = Date.now();
  const runner = await resolveCrawlerRunner();
  const workDir = runner.mode === "bundle"
    ? await fs.mkdtemp(path.join(os.tmpdir(), "posterlink-crawler-"))
    : runner.crawlerDir;

  const crawlArgs = runner.mode === "bundle" ? [runner.indexPath] : ["src/index.js"];
  if (options.source) {
    crawlArgs.push("--source", options.source);
  } else if (options.site) {
    crawlArgs.push("--site", options.site);
  }

  let logs = runner.mode === "bundle"
    ? `Using bundled crawler: ${path.relative(process.cwd(), runner.bundleDir)}\nWorking directory: ${workDir}\n`
    : `Using source crawler: ${runner.crawlerDir}\n`;
  logs = appendLog(logs, await runCommand(process.execPath, crawlArgs, { cwd: workDir }));
  const resultFile = await findLatestResultFile(workDir, startedAt);

  if (!resultFile) {
    return {
      ok: true,
      logs: appendLog(logs, "\nNo new result JSON was created, so upload was skipped.\n"),
      resultFile: null,
      uploaded: false,
    };
  }

  logs = appendLog(logs, `\nUploading result file: ${path.relative(workDir, resultFile)}\n`);
  const uploadArgs = runner.mode === "bundle"
    ? [runner.uploadPath, resultFile]
    : ["src/upload-to-supabase.js", resultFile];
  logs = appendLog(logs, await runCommand(process.execPath, uploadArgs, { cwd: workDir }));

  return {
    ok: true,
    logs,
    resultFile,
    uploaded: true,
  };
}

export async function POST(request: Request) {
  if (process.env.CRAWLER_ADMIN_RUN_ENABLED !== "1") {
    return NextResponse.json(
      { error: "Crawler run button is disabled. Set CRAWLER_ADMIN_RUN_ENABLED=1 on a trusted server." },
      { status: 403 }
    );
  }

  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (activeRun) {
    return NextResponse.json({ error: "Crawler is already running." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const site = typeof body.site === "string" && body.site.trim() ? body.site.trim() : null;
  const source = typeof body.source === "string" && body.source.trim() ? body.source.trim() : null;

  activeRun = runCrawler({ site, source });
  try {
    const result = await activeRun;
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? "Crawler run failed." },
      { status: 500 }
    );
  } finally {
    activeRun = null;
  }
}
