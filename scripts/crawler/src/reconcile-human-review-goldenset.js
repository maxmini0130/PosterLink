#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  HUMAN_REVIEW_TARGET_IDS,
  IMAGE_CORRECTIONS,
  REJECTION_CORRECTIONS,
  REVIEWED_NO_CHANGE,
  SOURCE_LINK_CORRECTIONS,
  TITLE_CORRECTIONS,
} from "./human-review-corrections.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "1"];
  }),
);
const input = path.resolve(
  REPO_ROOT,
  args.input || "data/baseline/human_golden_set_seed_20260728.csv",
);
const output = path.resolve(REPO_ROOT, args.output || input);
const UTF8_BOM = "\uFEFF";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  row.push(field);
  rows.push(row);

  const [rawHeader, ...body] = rows.filter((items) =>
    items.some((value) => value !== ""),
  );
  const header = rawHeader.map((key) => key.replace(/^\uFEFF/, ""));
  return {
    header,
    rows: body.map((items) =>
      Object.fromEntries(header.map((key, index) => [key, items[index] ?? ""])),
    ),
  };
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : `"${text}"`;
}

function resolutionFor(posterId) {
  const messages = [];
  if (SOURCE_LINK_CORRECTIONS.some((item) => item.id === posterId)) {
    messages.push(
      "신청서가 source_key로 지정된 오류 확인; 청년몽땅정보통 원문으로 DB 교정",
    );
  }
  if (IMAGE_CORRECTIONS.some((item) => item.id === posterId)) {
    messages.push(
      "원문 대조 후 대표 이미지를 올바른 포스터/목록 썸네일로 DB 교정",
    );
  }
  const noChange = REVIEWED_NO_CHANGE.find((item) => item.id === posterId);
  if (noChange) messages.push(`재검토 결과 정상: ${noChange.reason}`);
  if (TITLE_CORRECTIONS.some((item) => item.id === posterId)) {
    messages.push("원문 기준 제목과 기관명을 DB 교정");
  }
  if (REJECTION_CORRECTIONS.some((item) => item.id === posterId)) {
    messages.push("사람 판정과 원문 재검토에 따라 DB 반려 처리");
  }
  return messages.join(" | ");
}

async function main() {
  const parsed = parseCsv(await fs.readFile(input, "utf-8"));
  const header = parsed.header.includes("review_resolution")
    ? parsed.header
    : [...parsed.header, "review_resolution"];
  const matchedIds = new Set();

  for (const row of parsed.rows) {
    const posterId = String(row.sample_id).match(/^poster:(.+)$/)?.[1];
    if (!posterId || !HUMAN_REVIEW_TARGET_IDS.includes(posterId)) continue;
    matchedIds.add(posterId);

    if (SOURCE_LINK_CORRECTIONS.some((item) => item.id === posterId)) {
      row.gold_source_link_ok = "0";
    }
    if (IMAGE_CORRECTIONS.some((item) => item.id === posterId)) {
      row.gold_image_ok = "0";
    }
    if (REVIEWED_NO_CHANGE.some((item) => item.id === posterId)) {
      row.gold_image_ok = "1";
    }
    if (REJECTION_CORRECTIONS.some((item) => item.id === posterId)) {
      row.gold_is_valid_poster = "0";
      row.gold_image_ok = "0";
    }
    row.review_resolution = resolutionFor(posterId);
  }

  const missingIds = HUMAN_REVIEW_TARGET_IDS.filter(
    (id) => !matchedIds.has(id),
  );
  if (missingIds.length)
    throw new Error(
      `Reviewed rows missing from golden set: ${missingIds.join(", ")}`,
    );

  const csv = [
    header.map(csvValue).join(","),
    ...parsed.rows.map((row) =>
      header.map((key) => csvValue(row[key])).join(","),
    ),
  ].join("\n");
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${UTF8_BOM}${csv}`, "utf-8");

  console.log(
    JSON.stringify(
      {
        input,
        output,
        rows: parsed.rows.length,
        reconciled: matchedIds.size,
        source_link_errors: SOURCE_LINK_CORRECTIONS.length,
        image_errors: IMAGE_CORRECTIONS.length + REJECTION_CORRECTIONS.length,
        image_notes_corrected_as_normal: REVIEWED_NO_CHANGE.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
