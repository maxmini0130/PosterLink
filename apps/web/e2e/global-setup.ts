import { chromium, FullConfig } from "@playwright/test";
import fs from "fs";
import path from "path";

const BASE_URL = "http://localhost:4000";
const AUTH_DIR = path.join(__dirname, ".auth");

// 빈 storageState (로그인 안 된 상태)
const EMPTY_STATE = JSON.stringify({ cookies: [], origins: [] });

function ensureAuthDir() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
}

function writeEmptyState(filePath: string) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, EMPTY_STATE);
}

async function loginAs(email: string, password: string, storageStatePath: string) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle");

  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button:has-text("이메일로 로그인")');

  // 홈으로 이동할 때까지 대기 (최대 10초)
  await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 10000 }).catch(() => {});

  await context.storageState({ path: storageStatePath });
  await browser.close();
  console.log(`  ✓ 세션 저장: ${storageStatePath}`);
}

export default async function globalSetup(_config: FullConfig) {
  ensureAuthDir();

  const accounts = [
    { email: process.env.E2E_USER_EMAIL, password: process.env.E2E_USER_PASSWORD, file: "user.json" },
    { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD, file: "admin.json" },
    { email: process.env.E2E_OPERATOR_EMAIL, password: process.env.E2E_OPERATOR_PASSWORD, file: "operator.json" },
  ];

  for (const { email, password, file } of accounts) {
    const filePath = path.join(AUTH_DIR, file);
    if (email && password) {
      await loginAs(email, password, filePath);
    } else {
      // 환경변수 없으면 빈 세션 파일 생성 → 인증 테스트는 로그인 안 된 상태로 실행
      writeEmptyState(filePath);
    }
  }
}
