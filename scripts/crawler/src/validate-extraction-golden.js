#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FIELD_IMPORTANCE } from "./extraction-eval.js";

const DEFAULT_SET = "eval/golden";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const KNOWN_FIELDS = new Set(Object.keys(FIELD_IMPORTANCE));

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }),
);

if (args.help || args.h) {
  console.log(`Usage:
  node src/validate-extraction-golden.js [--set=eval/golden] [--require-labels]

Validates Phase 2 extraction golden JSON labels before running
eval:extraction. The validator checks JSON shape, known truth fields, placeholder
values, ISO date fields, URL fields, numeric fields, and boolean poster labels.`);
  process.exit(0);
}

async function listJsonFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function normalizeItems(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Array.isArray(raw.items) ? raw.items : [raw];
}

function isDateField(fieldKey) {
  return fieldKey === "deadline_date" || fieldKey === "apply_start";
}

function isUrlField(fieldKey) {
  return fieldKey === "official_url" || fieldKey === "apply_url";
}

function isNumberField(fieldKey) {
  return fieldKey === "age_min" || fieldKey === "age_max" || fieldKey === "capacity";
}

function validateTruthValue(fieldKey, value) {
  if (value === null) return null;
  if (typeof value === "string" && value.includes("__FILL_AFTER_SOURCE_REVIEW")) {
    return "placeholder truth value must be removed";
  }
  if (isDateField(fieldKey) && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return "date truth value must use YYYY-MM-DD";
  }
  if (isUrlField(fieldKey)) {
    try {
      const url = new URL(String(value));
      if (!/^https?:$/.test(url.protocol)) return "URL truth value must be http(s)";
    } catch {
      return "URL truth value is invalid";
    }
  }
  if (isNumberField(fieldKey) && !Number.isFinite(Number(value))) {
    return "numeric truth value must be a number";
  }
  if (fieldKey === "is_real_poster" && typeof value !== "boolean") {
    return "is_real_poster truth value must be boolean";
  }
  if (fieldKey === "deadline_type" && !["fixed", "ongoing", "until_exhausted", "scheduled", "unknown"].includes(String(value))) {
    return "deadline_type truth value is not supported";
  }
  return null;
}

function validateItem(item, location) {
  const errors = [];
  const posterId = item?.poster_id ?? item?.posterId;
  if (!posterId) errors.push(`${location}: missing poster_id`);
  const truth = item?.truth;
  if (!truth || typeof truth !== "object" || Array.isArray(truth)) {
    errors.push(`${location}: truth must be an object`);
    return errors;
  }
  if (Object.keys(truth).length === 0) {
    errors.push(`${location}: truth is empty`);
    return errors;
  }
  for (const [fieldKey, value] of Object.entries(truth)) {
    if (!KNOWN_FIELDS.has(fieldKey)) {
      errors.push(`${location}: unknown truth field ${fieldKey}`);
      continue;
    }
    const error = validateTruthValue(fieldKey, value);
    if (error) errors.push(`${location}.${fieldKey}: ${error}`);
  }
  return errors;
}

async function main() {
  const setPath = path.resolve(REPO_ROOT, args.set || DEFAULT_SET);
  const files = await listJsonFiles(setPath);
  const errors = [];
  let itemCount = 0;
  let truthFieldCount = 0;

  for (const file of files) {
    const relativeFile = path.relative(REPO_ROOT, file).replace(/\\/g, "/");
    let raw;
    try {
      raw = JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error) {
      errors.push(`${relativeFile}: invalid JSON (${error.message})`);
      continue;
    }
    const items = normalizeItems(raw);
    if (items.length === 0) errors.push(`${relativeFile}: no labeled item found`);
    items.forEach((item, index) => {
      itemCount += 1;
      truthFieldCount += Object.keys(item?.truth ?? {}).length;
      errors.push(...validateItem(item, `${relativeFile}#${index + 1}`));
    });
  }

  if (args["require-labels"] && itemCount === 0) {
    errors.push(`${path.relative(REPO_ROOT, setPath).replace(/\\/g, "/")}: no golden JSON files found`);
  }

  const report = {
    set: path.relative(REPO_ROOT, setPath).replace(/\\/g, "/"),
    files: files.length,
    items: itemCount,
    truth_fields: truthFieldCount,
    ok: errors.length === 0,
    errors,
  };

  console.log(JSON.stringify(report, null, 2));
  if (errors.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
