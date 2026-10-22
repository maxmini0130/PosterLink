import "./load-env.js";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// User-authorized review of the exact 18 published candidates from 2026-10-22.
// Source snapshots/posters and the original DB rows are ignored local artifacts.
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../data/results/predeploy-fixes-20261022",
);
const portal = (id) =>
  `https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=${id}`;
const kst = (date, time = "23:59:59") => `${date}T${time}+09:00`;
const confirmed = [
  [
    "b18ae132-f434-4f8c-af33-c87da3f319a5",
    kst("2026-10-09"),
    "until_exhausted",
    portal(74210),
    "공식 포털 신청기간은 9/22~10/9. AI 제안 10/13은 첫 프로그램 행사일로 포스터에서 확인.",
  ],
  [
    "6c53d8d2-ee69-4e29-9e93-6b900dc3f7be",
    kst("2026-10-22"),
    "until_exhausted",
    portal(74098),
    "공식 포털 신청기간 9/17~10/22. 포스터 10/24는 수업일이며 모집 종료일이 아님.",
  ],
  [
    "cee9981d-4a27-44d8-b105-d69d0da1b352",
    kst("2026-09-03", "14:00:00"),
    "fixed",
    "https://dobongstartup.com/bbs/board.php?bo_table=donotic&wr_id=155",
    "기관 원문 마감 표기 및 실제 포스터 신청기간 8/12~9/3 14:00 일치.",
  ],
  [
    "1f428c77-05f7-467d-a0b9-436a174ac64a",
    kst("2026-08-12", "23:59:00"),
    "until_exhausted",
    portal(72598),
    "Instagram 직접 본문은 접근 불가. 공식 공공 포털의 2026년 본문에 8/5 12:00~8/12 23:59 명시. 첨부 포스터 2026년 확인. 3배수 조기 마감 가능.",
  ],
  [
    "aa2d4df0-2521-441d-9c54-50d907aeb6af",
    kst("2026-08-27", "23:59:00"),
    "fixed",
    portal(73093),
    "Instagram 직접 본문은 접근 불가. 공식 포털과 2026년 추가모집 포스터에 8/19 18:00~8/27 23:59 일치.",
  ],
  [
    "9acd1add-a209-4c52-8023-f97879883b98",
    kst("2026-08-23", "23:59:00"),
    "fixed",
    portal(72777),
    "기관 링크는 정상 본문을 반환하지 않음. 공식 포털 본문 8/6 14:00~8/23 23:59와 2026년 포스터 8/6~8/23 일치.",
  ],
  [
    "e28be63d-fab1-4558-b32a-a8ee96c85fc4",
    kst("2026-08-23", "23:59:00"),
    "fixed",
    portal(72913),
    "기존 기관 URL 본문 확인 불가. 공식 포털 본문에 2026.8.17 00:00~8.23 23:59 명시, 2026년 하반기 실제 포스터 일치.",
  ],
];
const openEnded = [
  [
    "0347d306-c3fe-492f-9f90-9d39079d38af",
    "https://news.seoul.go.kr/gov/archives/580360",
    "신청기간 8/31 10:00~는 시작일. 9/11~13은 여행일, 9/3은 입금 안내일. 종료일 미확인 유지.",
  ],
  [
    "e4a0a436-df97-49af-8b97-179acfbf8a94",
    "https://news.seoul.go.kr/gov/archives/580364",
    "신청기간 8/31 10:00~는 시작일. 여행·입금일을 마감으로 사용하지 않음.",
  ],
  [
    "3c30b029-f7b8-4fd4-b481-64f35a7b8440",
    "https://news.seoul.go.kr/gov/archives/580306",
    "신청기간 8/24 10:00~는 시작일. 확정 종료일 없음.",
  ],
  [
    "595a95ea-2a05-4f0a-a0e6-8caa014569a2",
    "https://news.seoul.go.kr/gov/archives/580310",
    "신청기간 8/24 10:00~는 시작일. 원문의 여행 날짜·요일에도 충돌이 있어 임의 보정하지 않음.",
  ],
  [
    "59d21bff-d9b5-48d2-b0c6-1fa649cec347",
    "https://news.seoul.go.kr/gov/archives/580314",
    "신청기간 8/24 10:00~는 시작일. 여행·입금일과 구분.",
  ],
  [
    "986c1030-11e3-4b51-8d91-0360b8c97ac7",
    "https://news.seoul.go.kr/gov/archives/580186",
    "신청기간 8/17 10:00~는 시작일. 종료일 미확인 유지.",
  ],
  [
    "7fbd0b27-eaf7-4a02-afd2-8c66a356a9e1",
    "https://news.seoul.go.kr/gov/archives/579930",
    "8/10은 신청 시작일, 8/13은 입금 안내일. 어느 것도 모집 종료일로 확정하지 않음.",
  ],
  [
    "8e95ef7f-f256-4743-bab8-9a472d9a39f2",
    "https://news.seoul.go.kr/gov/archives/579936",
    "신청기간 8/10 10:00~는 시작일. 제목 코드와 본문 여행일도 달라 원문 불확실성 보존.",
  ],
  [
    "29ae4735-b0dc-44e7-ae5f-3528173791b8",
    portal(73556),
    "기관 원문 본문 접근 제한. 공식 포털 신청기간 9/4~ 선착순 마감. 시작일을 종료일로 바꾸지 않음.",
  ],
  [
    "ae79a191-1a39-45d5-a5ba-b51795a8235d",
    portal(73277),
    "공식 포털 신청기간 8/22~ 선착순 마감. 종료일 null 유지.",
  ],
  [
    "be46a746-c141-4ae6-ae55-fa3c0416be54",
    portal(73281),
    "기관 원문 본문 접근 제한. 공식 포털 신청기간 8/25~ 선착순 마감. AI의 8/25 종료일 제안은 시작일 오인.",
  ],
];

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply)
    assert(process.argv.includes("--confirm=DEADLINE_REVIEW_20261022"));
  const snapshot = JSON.parse(
    await fs.readFile(path.join(root, "snapshot.json"), "utf8"),
  );
  const decisions = [
    ...confirmed.map(([id, endAt, deadlineType, sourceUrl, evidence]) => ({
      id,
      endAt,
      deadlineType,
      sourceUrl,
      evidence,
      decision: "confirmed",
    })),
    ...openEnded.map(([id, sourceUrl, evidence]) => ({
      id,
      endAt: null,
      sourceUrl,
      evidence,
      decision: "open_ended",
    })),
  ];
  assert.equal(decisions.length, 18);
  assert.equal(new Set(decisions.map((row) => row.id)).size, 18);
  assert.deepEqual(
    new Set(decisions.map((row) => row.id)),
    new Set(snapshot.posters.map((row) => row.id)),
  );
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: current, error } = await client
    .from("posters")
    .select(
      "id,updated_at,poster_status,application_end_at,deadline_type,field_verification",
    )
    .in(
      "id",
      decisions.map((row) => row.id),
    );
  if (error) throw error;
  assert.equal(current.length, 18);
  for (const row of current) {
    const previous = snapshot.posters.find((item) => item.id === row.id);
    assert.equal(
      row.updated_at,
      previous.updated_at,
      `Concurrent edit: ${row.id}`,
    );
    assert.equal(row.poster_status, "published");
    assert.equal(row.application_end_at, null);
    const decision = decisions.find((item) => item.id === row.id);
    if (decision.endAt && previous.application_start_at) {
      assert.ok(
        Date.parse(previous.application_start_at) <= Date.parse(decision.endAt),
        `Reversed period: ${row.id}`,
      );
    }
  }
  const checkedAt = new Date().toISOString();
  const plan = decisions.map((decision) => {
    const row = current.find((item) => item.id === decision.id);
    const previous = row.field_verification ?? {};
    const deadlineReview = {
      ...decision,
      checkedAt,
      method: "official-source-review",
      promotionEligible:
        decision.decision === "confirmed" &&
        Date.parse(decision.endAt) > Date.now(),
      previousSuggestions: {
        correctedDeadline: previous.correctedDeadline,
        deadlineMatches: previous.deadlineMatches,
        dateQuality: previous.dateQuality,
      },
    };
    return {
      id: decision.id,
      expectedUpdatedAt: row.updated_at,
      patch: {
        ...(decision.decision === "confirmed"
          ? {
              application_end_at: decision.endAt,
              deadline_type: decision.deadlineType,
            }
          : {}),
        field_verification: {
          ...previous,
          deadlineMatches: true,
          deadlineReview,
        },
      },
    };
  });
  await fs.writeFile(
    path.join(root, "review-plan.json"),
    JSON.stringify(plan, null, 2),
  );
  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      targets: plan.length,
      deadlineChanges: confirmed.length,
      unchangedNullDeadlines: openEnded.length,
    }),
  );
  if (!apply) return;
  await fs.writeFile(
    path.join(root, "before-apply.json"),
    JSON.stringify(current, null, 2),
    { flag: "wx" },
  );
  const completed = [];
  for (const item of plan) {
    const { data, error } = await client
      .from("posters")
      .update(item.patch)
      .eq("id", item.id)
      .eq("poster_status", "published")
      .eq("updated_at", item.expectedUpdatedAt)
      .select(
        "id,application_end_at,deadline_type,field_verification,updated_at",
      )
      .single();
    if (error) throw error;
    assert.equal(
      data.field_verification.deadlineReview.decision,
      item.patch.field_verification.deadlineReview.decision,
    );
    if (item.patch.application_end_at)
      assert.equal(
        Date.parse(data.application_end_at),
        Date.parse(item.patch.application_end_at),
      );
    else assert.equal(data.application_end_at, null);
    completed.push({
      id: item.id,
      updated_at: data.updated_at,
      application_end_at: data.application_end_at,
    });
    await fs.writeFile(
      path.join(root, "applied.json"),
      JSON.stringify(completed, null, 2),
    );
  }
  console.log(
    JSON.stringify({
      verifiedUpdates: completed.length,
      publicStatusesPreserved: true,
    }),
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
