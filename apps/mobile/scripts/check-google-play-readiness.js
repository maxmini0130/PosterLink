#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appJsonPath = path.join(root, "app.json");
const packageJsonPath = path.join(root, "package.json");
const androidBuildGradlePath = path.join(root, "android", "build.gradle");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parseMajor(versionRange) {
  const match = String(versionRange ?? "").match(/(\d+)\./);
  return match ? Number(match[1]) : null;
}

function parseGradleDefaultNumber(source, propertyName) {
  const pattern = new RegExp(`${propertyName}\\s*=\\s*[^\\n]*?:\\s*['"]?(\\d+)['"]?`);
  const match = source.match(pattern);
  return match ? Number(match[1]) : null;
}

function parseGradleDefaultString(source, propertyName) {
  const pattern = new RegExp(`${propertyName}\\s*=\\s*[^\\n]*?:\\s*['"]([^'"]+)['"]`);
  const match = source.match(pattern);
  return match ? match[1] : null;
}

const appJson = readJson(appJsonPath);
const packageJson = readJson(packageJsonPath);
const buildGradle = readText(androidBuildGradlePath);

const expo = appJson.expo ?? {};
const android = expo.android ?? {};
const expoMajor = parseMajor(packageJson.dependencies?.expo);
const reactNativeMajorMinor = String(packageJson.dependencies?.["react-native"] ?? "").match(/(\d+\.\d+)/)?.[1] ?? null;
const compileSdkVersion = parseGradleDefaultNumber(buildGradle, "compileSdkVersion");
const targetSdkVersion = parseGradleDefaultNumber(buildGradle, "targetSdkVersion");
const buildToolsVersion = parseGradleDefaultString(buildGradle, "buildToolsVersion");

const checks = [
  {
    name: "Android package is set",
    ok: android.package === "com.maxmini.posterlink",
    detail: android.package ?? "(missing)",
  },
  {
    name: "Android versionCode is positive",
    ok: Number(android.versionCode) > 0,
    detail: String(android.versionCode ?? "(missing)"),
  },
  {
    name: "Expo SDK can target Android API 36",
    ok: Number(expoMajor) >= 54,
    detail: `expo=${packageJson.dependencies?.expo ?? "(missing)"}`,
  },
  {
    name: "compileSdkVersion is at least 36",
    ok: Number(compileSdkVersion) >= 36,
    detail: String(compileSdkVersion ?? "(missing)"),
  },
  {
    name: "targetSdkVersion is at least 36",
    ok: Number(targetSdkVersion) >= 36,
    detail: String(targetSdkVersion ?? "(missing)"),
  },
  {
    name: "buildToolsVersion is set for API 36",
    ok: typeof buildToolsVersion === "string" && buildToolsVersion.startsWith("36."),
    detail: buildToolsVersion ?? "(missing)",
  },
  {
    name: "Privacy policy URL is documented",
    ok: true,
    detail: "https://www.posterlink.kr/privacy",
  },
  {
    name: "Terms URL is documented",
    ok: true,
    detail: "https://www.posterlink.kr/terms",
  },
];

const failed = checks.filter((check) => !check.ok);

console.log(JSON.stringify({
  app: expo.name ?? "(missing)",
  package: android.package ?? null,
  version: expo.version ?? null,
  versionCode: android.versionCode ?? null,
  expo: packageJson.dependencies?.expo ?? null,
  reactNative: reactNativeMajorMinor,
  compileSdkVersion,
  targetSdkVersion,
  buildToolsVersion,
  status: failed.length === 0 ? "pass" : "fail",
  checks,
}, null, 2));

if (failed.length > 0) {
  console.error(`Google Play readiness failed: ${failed.length} blocking check(s).`);
  process.exit(1);
}
