import { existsSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const cwd = process.cwd();
const candidates = [
  process.env.DOTENV_CONFIG_PATH,
  path.resolve(cwd, ".env.local"),
  path.resolve(cwd, ".env"),
  path.resolve(cwd, "apps/web/.env.local"),
  path.resolve(cwd, "../apps/web/.env.local"),
  path.resolve(cwd, "../../apps/web/.env.local"),
].filter(Boolean);

for (const filePath of candidates) {
  if (existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false });
  }
}
