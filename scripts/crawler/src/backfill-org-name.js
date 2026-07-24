// ---------------------------------------------------------------------------
// 기존 포스터 source_org_name 정확화 백필
//
// 수집 포털명("청년몽땅정보통" 등)이 기관으로 저장된 포스터에서, 제목의
// "실제기관 <프로그램명>" 형태로부터 실제 기관을 추출해 교체한다.
// 추출 불가(제목에 '<' 없음, 앞부분이 너무 긺)한 경우는 건드리지 않는다.
//
// 사용법:
//   node src/backfill-org-name.js            # dry-run(기본, 변경 없음)
//   node src/backfill-org-name.js --apply    # 백업 후 실제 적용
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { resolveSourceOrgName, PORTAL_ORG_NAMES } from "./poster-org.js";

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

async function fetchAll(status) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("posters")
      .select("id, title, source_org_name")
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

  const portalRows = rows.filter((row) => PORTAL_ORG_NAMES.has((row.source_org_name ?? "").trim()));
  console.log(`검사 대상: ${rows.length}건 (포털명 기관: ${portalRows.length}건)`);

  const changes = [];
  for (const row of portalRows) {
    const next = resolveSourceOrgName(row.title, row.source_org_name);
    if (next && next !== row.source_org_name) {
      changes.push({ id: row.id, old: row.source_org_name, next, title: row.title });
    }
  }
  console.log(`변경 대상 행: ${changes.length}건 (추출 불가로 유지: ${portalRows.length - changes.length}건)`);

  if (!apply) {
    console.log("\n[dry-run] 실제 변경 없음. 적용하려면 --apply 를 붙여 실행하세요.");
    for (const change of changes.slice(0, 12)) {
      console.log(`  "${change.old}" → "${change.next}"   ← ${change.title.slice(0, 45)}`);
    }
    return;
  }

  const backupPath = path.resolve(__dirname, `../org-name-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(changes.map((c) => ({ id: c.id, source_org_name: c.old })), null, 2));
  console.log(`백업 저장: ${backupPath} (${changes.length}건)`);

  let ok = 0;
  let fail = 0;
  const errors = [];
  for (let i = 0; i < changes.length; i += 20) {
    await Promise.all(changes.slice(i, i + 20).map(async (change) => {
      const { error } = await supabase.from("posters").update({ source_org_name: change.next }).eq("id", change.id);
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
