import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const crawlerRoot = path.resolve(__dirname, "..");

function findPythonBin() {
  const candidates = [
    process.env.POSTER_AI_PYTHON,
    path.join(crawlerRoot, ".venv", "Scripts", "python.exe"),
    path.join(crawlerRoot, ".venv", "bin", "python"),
    "python3",
    "python",
  ].filter(Boolean);

  return candidates.find((candidate) => {
    if (candidate.includes(path.sep) || candidate.endsWith(".exe")) {
      return existsSync(candidate);
    }
    return true;
  });
}

const scriptName = process.argv[2];
if (!scriptName) {
  console.error("Usage: node ml/run-python.js <script.py> [...args]");
  process.exit(1);
}

const pythonBin = findPythonBin();
const scriptPath = path.join(__dirname, scriptName);
const result = spawnSync(pythonBin, [scriptPath, ...process.argv.slice(3)], {
  cwd: crawlerRoot,
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
