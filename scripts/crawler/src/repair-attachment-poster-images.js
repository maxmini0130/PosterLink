import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

import "./load-env.js";
import youthSeoul from "./adapters/youth-seoul.js";
import { scorePosterImageCandidate } from "./poster-image-rules.js";
import { buildReadableNoticeInfo, importPostImagesToStorage, syncPosterImages } from "./upload-to-supabase.js";

const apply = process.argv.includes("--apply");
const noAi = process.argv.includes("--no-ai");
const useAi = !noAi && (
  process.argv.includes("--verify-ai")
  || Boolean(process.env.OPENAI_API_KEY?.trim())
);
const discover = process.argv.includes("--discover");
const idArg = process.argv.find((value) => value.startsWith("--id="));
const targetId = idArg?.slice("--id=".length) || null;
const repairSummaries = !process.argv.includes("--images-only") && (
  Boolean(targetId)
  || process.argv.includes("--repair-summaries")
);
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number(limitArg.slice("--limit=".length))) : 500;
const statusesArg = process.argv.find((value) => value.startsWith("--statuses="));
const statuses = statusesArg
  ? statusesArg.slice("--statuses=".length).split(",").map((value) => value.trim()).filter(Boolean)
  : [];

const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
const supabaseKey = (process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase credentials");

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const YOUTH_SOURCE_PATTERN = /youth\.seoul\.go\.kr\/infoData\/sprtInfo\/view\.do/i;
const POSTER_ATTACHMENT_TEXT_PATTERN = /(?:포스터|홍보물|전단)[^.\n]{0,80}\.(?:png|jpe?g|webp|gif)/i;

function sanitizeForPostgrest(value) {
  if (typeof value === "string") {
    return value
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
      .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1");
  }
  if (Array.isArray(value)) return value.map(sanitizeForPostgrest);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, sanitizeForPostgrest(item)]),
    );
  }
  return value ?? null;
}

async function fetchRows() {
  let query = supabase
    .from("posters")
    .select(`
      id,title,source_org_name,poster_status,source_key,summary_short,summary_long,
      thumbnail_url,field_verification,updated_at,
      poster_images(id,storage_path,image_type,width,height,created_at)
    `)
    .neq("poster_status", "rejected");

  if (targetId) query = query.eq("id", targetId);
  else query = query.like("source_key", "%youth.seoul.go.kr/infoData/sprtInfo/view.do%");
  if (statuses.length > 0) query = query.in("poster_status", statuses);

  const { data, error } = await query.limit(limit);
  if (error) throw error;

  return (data ?? []).filter((row) => (
    targetId
    || discover
    || (
      YOUTH_SOURCE_PATTERN.test(String(row.source_key ?? ""))
      && POSTER_ATTACHMENT_TEXT_PATTERN.test(String(row.summary_long ?? ""))
    )
  ));
}

function hasStrongOriginalRule(rule) {
  const width = Number(rule?.dimensions?.width ?? 0);
  const height = Number(rule?.dimensions?.height ?? 0);
  const ratio = width > 0 && height > 0 ? width / height : 0;
  return Boolean(rule?.passes)
    && Number(rule?.score ?? 0) >= 85
    && width >= 800
    && height >= 800
    && ratio >= 0.45
    && ratio <= 0.9;
}

function imageArea(rule) {
  return Number(rule?.dimensions?.width ?? 0) * Number(rule?.dimensions?.height ?? 0);
}

function isPortraitOriginal(rule) {
  const width = Number(rule?.dimensions?.width ?? 0);
  const height = Number(rule?.dimensions?.height ?? 0);
  const ratio = width > 0 && height > 0 ? width / height : 0;
  return width >= 800 && height >= 800 && ratio >= 0.45 && ratio <= 0.9;
}

function isMeaningfullyBetterImage(selectedRule, currentRule) {
  const selectedArea = imageArea(selectedRule);
  const currentArea = imageArea(currentRule);
  if (selectedArea <= 0) return false;
  if (currentArea <= 0) return true;
  if (isPortraitOriginal(selectedRule) && !isPortraitOriginal(currentRule)) return true;
  return selectedArea >= currentArea * 1.5;
}

async function verifyWithAi(imageUrl, detail, selectedRule) {
  if (!useAi) return { accepted: true, classification: null, content: null, mode: "strong-rules" };

  const [{ classifyPosterImage }, { verifyPosterMatchesNotice }] = await Promise.all([
    import("./poster-image-classifier.js"),
    import("./poster-content-verifier.js"),
  ]);
  const context = {
    title: detail.title,
    content: detail.content,
    site: "청년몽땅정보통",
    sourceUrl: detail.sourceUrl,
    rule: selectedRule,
  };
  const classification = await classifyPosterImage(imageUrl, context);
  const content = classification.isPoster
    ? await verifyPosterMatchesNotice(imageUrl, { ...context, imageClassification: classification })
    : null;

  return {
    accepted: Boolean(classification.isPoster && content?.isSameNotice),
    classification,
    content,
    mode: "ai",
  };
}

async function buildRepair(row) {
  const detail = await youthSeoul.parseDetail(
    row.source_key,
    null,
    null,
    { skipExternal: !repairSummaries },
  );
  const attachmentCandidate = detail.attachmentImageCandidates?.find(
    (candidate) => candidate.explicitlyPosterNamed,
  );
  if (!attachmentCandidate) return { row, outcome: "no-named-poster-attachment" };

  const selectedImageUrl = detail.images?.[0];
  const selectedCandidate = detail.posterImageCandidates?.find(
    (candidate) => candidate.imageUrl === selectedImageUrl,
  );
  if (
    selectedImageUrl !== attachmentCandidate.url
    || !hasStrongOriginalRule(selectedCandidate?.rule)
  ) {
    return {
      row,
      outcome: "attachment-rule-rejected",
      attachmentCandidate,
      selectedCandidate,
    };
  }

  const currentRule = row.thumbnail_url
    ? await scorePosterImageCandidate(row.thumbnail_url, {
        title: detail.title || row.title,
        content: detail.content,
        site: "청년몽땅정보통",
        sourceUrl: row.source_key,
      })
    : null;
  if (!isMeaningfullyBetterImage(selectedCandidate.rule, currentRule)) {
    return {
      row,
      outcome: "current-image-already-sufficient",
      attachmentCandidate,
      selectedCandidate,
      currentRule,
    };
  }

  const verification = await verifyWithAi(
    selectedImageUrl,
    { ...detail, sourceUrl: row.source_key },
    selectedCandidate.rule,
  );
  if (!verification.accepted) {
    return {
      row,
      outcome: "attachment-ai-rejected",
      attachmentCandidate,
      selectedCandidate,
      verification,
    };
  }

  const readable = buildReadableNoticeInfo({
    title: detail.title || row.title,
    content: detail.content || row.summary_long,
  });

  return {
    row,
    outcome: "ready",
    detail,
    readable,
    attachmentCandidate,
    selectedCandidate,
    currentRule,
    verification,
  };
}

async function applyRepair(repair) {
  const {
    row,
    detail,
    readable,
    attachmentCandidate,
    selectedCandidate,
    currentRule,
    verification,
  } = repair;
  const importedImages = await importPostImagesToStorage(
    { images: [attachmentCandidate.url] },
    row.source_key,
    row.source_key,
  );
  const storedImage = importedImages[0];
  if (!storedImage || /^https?:\/\/youth\.seoul\.go\.kr/i.test(storedImage)) {
    throw new Error("attachment image was not imported to managed storage");
  }

  const patch = sanitizeForPostgrest({
    ...(repairSummaries
      ? {
          title: readable.title || row.title,
          summary_short: readable.summaryShort,
          summary_long: readable.summaryLong,
        }
      : {}),
    thumbnail_url: storedImage,
    field_verification: {
      ...(row.field_verification ?? {}),
      ...(repairSummaries
        ? {
            readableNotice: {
              ...(row.field_verification?.readableNotice ?? {}),
              title: readable.title,
              summaryShort: readable.summaryShort,
              facts: readable.facts,
              source: "attachment-poster-repair",
            },
          }
        : {}),
      attachmentPosterRepair: {
        repairedAt: new Date().toISOString(),
        previousThumbnail: row.thumbnail_url,
        attachmentName: attachmentCandidate.name,
        attachmentUrl: attachmentCandidate.url,
        storedImage,
        previousRule: currentRule,
        selectedRule: selectedCandidate.rule,
        verificationMode: verification.mode,
        imageClassification: verification.classification,
        contentVerification: verification.content,
      },
    },
  });

  const { error } = await supabase.from("posters").update(patch).eq("id", row.id);
  if (error) throw error;
  await syncPosterImages(row.id, { title: detail.title, images: [storedImage] }, row.source_key);

  return { storedImage, patch };
}

async function main() {
  const rows = await fetchRows();
  const report = {
    generatedAt: new Date().toISOString(),
    apply,
    useAi,
    discover,
    statuses,
    repairSummaries,
    checked: rows.length,
    ready: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    items: [],
  };

  console.log(`Attachment poster audit: ${rows.length} row(s), apply=${apply}, ai=${useAi}`);
  const concurrency = discover && noAi && !apply ? 6 : 1;
  for (let index = 0; index < rows.length; index += concurrency) {
    const batch = rows.slice(index, index + concurrency);
    const batchResults = await Promise.all(batch.map(async (row) => {
      try {
        return { row, repair: await buildRepair(row), error: null };
      } catch (error) {
        return { row, repair: null, error };
      }
    }));

    for (const { row, repair, error } of batchResults) {
      if (error) {
        report.failed += 1;
        report.items.push({ id: row.id, title: row.title, outcome: "failed", error: error.message });
        console.error(`- failed: ${row.id} ${row.title} - ${error.message}`);
        continue;
      }

      if (repair.outcome !== "ready") {
        report.unchanged += 1;
        report.items.push({ id: row.id, title: row.title, outcome: repair.outcome });
        console.log(`- ${repair.outcome}: ${row.id} ${row.title}`);
        continue;
      }

      report.ready += 1;
      let applied = null;
      if (apply) {
        applied = await applyRepair(repair);
        report.updated += 1;
      }
      report.items.push({
        id: row.id,
        title: row.title,
        outcome: apply ? "updated" : "ready",
        attachmentName: repair.attachmentCandidate.name,
        attachmentUrl: repair.attachmentCandidate.url,
        score: repair.selectedCandidate.rule.score,
        dimensions: repair.selectedCandidate.rule.dimensions,
        previousScore: repair.currentRule?.score ?? null,
        previousDimensions: repair.currentRule?.dimensions ?? null,
        verificationMode: repair.verification.mode,
        storedImage: applied?.storedImage ?? null,
        summaryShort: repair.readable.summaryShort,
      });
      console.log(`- ${apply ? "updated" : "ready"}: ${row.id} ${row.title}`);
    }
  }

  const reportPath = `data/results/attachment-poster-repair-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  await fs.mkdir("data/results", { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    checked: report.checked,
    ready: report.ready,
    updated: report.updated,
    unchanged: report.unchanged,
    failed: report.failed,
    reportPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
