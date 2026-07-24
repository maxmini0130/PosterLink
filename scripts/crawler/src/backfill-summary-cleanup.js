// ---------------------------------------------------------------------------
// 기존 포스터 요약(summary_short/summary_long) 정리 백필
//
// 두 가지 결함을 무손실로 정리한다(재생성하지 않음):
//   1) 본문 앞에 남은 게시판 탭 라벨 접두어("상세정보 …")
//   2) 라벨 오매칭 아티팩트 세그먼트("내용: 은 …", "대상: 으로 …")
//
// 사용법:
//   node src/backfill-summary-cleanup.js            # dry-run(기본, 변경 없음)
//   node src/backfill-summary-cleanup.js --apply    # 백업 후 실제 적용
//
// 적용 시 변경 전 값을 백업 JSON 으로 저장한다.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../apps/web/.env.local") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase credentials");

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const apply = process.argv.includes("--apply");
const STATUSES = ["published", "review"];

// 본문 첫 부분에 남은 탭 라벨 접두어
const TAB_LABEL = /^(?:상세정보|상세보기|상세내용|본문보기|본문)(?:\s+|$)/;
// "라벨: 조사/구두점…" 형태의 오매칭 세그먼트
const ARTIFACT_PART = /^(대상|내용|기간|신청|장소|문의)\s*[:：]\s*(?:은|는|이|가|을|를|으로|로|과|와|에|의|도|,|·|\.|\()/;
// "기간: (" 처럼 값이 사실상 비어 있는 잔재 세그먼트
const JUNK_PART = /^(기간|대상|내용|신청|장소|문의)\s*[:：]\s*[()\-\s,·.]*$/;
const LONE_LABEL = /^(상세정보|상세보기|상세내용|본문보기|본문)$/;

export function cleanSummaryShort(value) {
  if (!value) return null;
  let text = value.replace(TAB_LABEL, "").trim();
  if (LONE_LABEL.test(text)) text = "";
  if (text.includes(" · ") || ARTIFACT_PART.test(text) || JUNK_PART.test(text)) {
    const parts = text.split("·").map((part) => part.trim()).filter(Boolean);
    text = parts.filter((part) => !ARTIFACT_PART.test(part) && !JUNK_PART.test(part)).join(" · ");
  }
  return text.trim() || null;
}

export function cleanSummaryLong(value) {
  if (!value) return null;
  const text = value.replace(TAB_LABEL, "").trim();
  return text || null;
}

async function fetchAll(status) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("posters")
      .select("id, summary_short, summary_long")
      .eq("poster_status", status)
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function main() {
  const rows = [];
  for (const status of STATUSES) rows.push(...(await fetchAll(status)));
  console.log(`검사 대상: ${rows.length}건 (${STATUSES.join(", ")})`);

  const changes = [];
  for (const row of rows) {
    const nextShort = cleanSummaryShort(row.summary_short);
    const nextLong = cleanSummaryLong(row.summary_long);
    const patch = {};
    if (nextShort !== (row.summary_short ?? null)) patch.summary_short = nextShort;
    if (nextLong !== (row.summary_long ?? null)) patch.summary_long = nextLong;
    if (Object.keys(patch).length > 0) {
      changes.push({
        id: row.id,
        old: { summary_short: row.summary_short ?? null, summary_long: row.summary_long ?? null },
        patch,
      });
    }
  }
  console.log(`변경 대상 행: ${changes.length}건`);

  if (!apply) {
    console.log("\n[dry-run] 실제 변경 없음. 적용하려면 --apply 를 붙여 실행하세요.");
    for (const change of changes.slice(0, 8)) {
      console.log(`\n■ ${change.id}`);
      console.log("  old short:", JSON.stringify((change.old.summary_short ?? "").slice(0, 80)));
      console.log("  new short:", JSON.stringify((change.patch.summary_short ?? change.old.summary_short ?? "").slice(0, 80)));
    }
    return;
  }

  const backupPath = path.resolve(__dirname, `../summary-cleanup-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(changes.map((c) => ({ id: c.id, ...c.old })), null, 2));
  console.log(`백업 저장: ${backupPath} (${changes.length}건)`);

  let ok = 0;
  let fail = 0;
  const errors = [];
  for (let i = 0; i < changes.length; i += 20) {
    await Promise.all(changes.slice(i, i + 20).map(async (change) => {
      const { error } = await supabase.from("posters").update(change.patch).eq("id", change.id);
      if (error) {
        fail += 1;
        if (errors.length < 5) errors.push(`${change.id}: ${error.message}`);
      } else {
        ok += 1;
      }
    }));
  }
  console.log(`완료: 성공 ${ok}, 실패 ${fail}`);
  if (errors.length) console.log("오류 샘플:\n" + errors.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
