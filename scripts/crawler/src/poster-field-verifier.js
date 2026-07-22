import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const CACHE_PATH = "data/poster_field_verifications.json";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const VERIFIER_MODE = (process.env.POSTER_FIELD_VERIFIER ?? "auto").trim().toLowerCase();
const MODEL = process.env.OPENAI_POSTER_FIELD_MODEL?.trim() || "gpt-5-mini";
const MIN_CONFIDENCE = Number(process.env.POSTER_FIELD_VERIFIER_MIN_CONFIDENCE ?? "0.6");
const MAX_CONTEXT_CHARS = Number(process.env.POSTER_FIELD_CONTEXT_CHARS ?? "4500");
const ALLOW_ON_ERROR = process.env.POSTER_FIELD_VERIFIER_ALLOW_ON_ERROR !== "0";
const FIELD_VERIFICATION_SCHEMA_VERSION = 2;

function isAiModeEnabled() {
  return VERIFIER_MODE !== "off" && Boolean(OPENAI_API_KEY);
}

function cacheKey(context = {}) {
  const stableContext = {
    schemaVersion: FIELD_VERIFICATION_SCHEMA_VERSION,
    title: context.title ?? "",
    site: context.site ?? "",
    sourceUrl: context.sourceUrl ?? "",
    extractedDeadline: context.extractedDeadline ?? "",
    extractedOrgName: context.extractedOrgName ?? "",
    content: String(context.content ?? "").slice(0, MAX_CONTEXT_CHARS),
  };

  return crypto.createHash("sha256").update(JSON.stringify(stableContext)).digest("hex");
}

async function loadCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

function parseJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON object in model response: ${text}`);
  return JSON.parse(match[0]);
}

function normalizeDate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : trimmed;
}

function normalizeText(value, maxLength = 200) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeResult(result) {
  const confidence = Math.max(0, Math.min(1, Number(result.confidence ?? 0)));
  const organizationConfidence = Math.max(0, Math.min(1, Number(result.organizationConfidence ?? confidence)));
  const sourceOrgName = normalizeText(result.sourceOrgName ?? result.collectionSourceName);
  const organizerName = normalizeText(result.organizerName ?? result.actualOrganizerName ?? result.correctedOrgName);
  const hostName = normalizeText(result.hostName ?? result.hostingOrgName);
  const operatorName = normalizeText(result.operatorName ?? result.publisherOrgName);
  const correctedOrgName = normalizeText(result.correctedOrgName ?? (result.orgNameMatches === false ? organizerName : null));
  const displayOrgName = normalizeText(correctedOrgName ?? organizerName ?? hostName ?? sourceOrgName);
  const sourceOrgRole = normalizeText(result.sourceOrgRole, 80);
  const organizationEvidence = normalizeText(result.organizationEvidence ?? result.evidence, 500);

  return {
    deadlineMatches: Boolean(result.deadlineMatches),
    correctedDeadline: normalizeDate(result.correctedDeadline),
    orgNameMatches: Boolean(result.orgNameMatches),
    correctedOrgName,
    sourceOrgName,
    organizerName,
    hostName,
    operatorName,
    organizationConfidence,
    organization: {
      sourceOrgName,
      organizerName,
      hostName,
      operatorName,
      displayOrgName,
      sourceOrgRole,
      evidence: organizationEvidence,
      confidence: organizationConfidence,
    },
    confidence,
    decision: String(result.decision ?? "checked").slice(0, 40),
    reason: String(result.reason ?? "").slice(0, 500),
    checkedAt: new Date().toISOString(),
    model: MODEL,
  };
}

function buildFieldContext(context = {}) {
  return [
    `Title: ${context.title ?? ""}`,
    `Organization/site (as crawled): ${context.site ?? ""}`,
    `Source URL: ${context.sourceUrl ?? ""}`,
    `Extracted deadline (regex, may be wrong or missing): ${context.extractedDeadline ?? "(none)"}`,
    `Extracted organization name (may be wrong): ${context.extractedOrgName ?? "(none)"}`,
    "Original notice text:",
    String(context.content ?? "").slice(0, MAX_CONTEXT_CHARS),
  ].join("\n");
}

function isUsableCachedResult(result) {
  if (!result) return false;
  if (ALLOW_ON_ERROR) return true;
  return result.decision !== "verification_failed";
}

export async function verifyPosterFields(context = {}) {
  if (!isAiModeEnabled()) {
    return {
      deadlineMatches: true,
      correctedDeadline: null,
      orgNameMatches: true,
      correctedOrgName: null,
      sourceOrgName: context.site ?? null,
      organizerName: null,
      hostName: null,
      operatorName: null,
      organizationConfidence: 0,
      organization: {
        sourceOrgName: context.site ?? null,
        organizerName: null,
        hostName: null,
        operatorName: null,
        displayOrgName: context.site ?? null,
        sourceOrgRole: null,
        evidence: null,
        confidence: 0,
      },
      confidence: 0,
      decision: "not_checked",
      reason: OPENAI_API_KEY ? "Field verifier disabled" : "OPENAI_API_KEY not configured",
      checkedAt: new Date().toISOString(),
      model: "none",
    };
  }

  const cache = await loadCache();
  const key = cacheKey(context);
  if (isUsableCachedResult(cache[key])) return cache[key];

  try {
    const prompt = [
      "You are PosterLink's field-accuracy verifier for public notice postings.",
      "A regex-based crawler extracted a deadline date and organization name from the notice text below.",
      "Check whether the extracted deadline actually matches the application/event deadline mentioned in the text.",
      "Also separate organization roles: sourceOrgName is the crawled website/provider, organizerName is the actual organizer/host named in the notice, hostName is the venue or hosting center if distinct, operatorName is the publisher/board operator if distinct.",
      "If the extracted deadline is missing, wrong, or ambiguous, provide the correct deadline as YYYY-MM-DD if the text clearly states one, otherwise null.",
      "If the extracted organization name is wrong for the actual organizer/host, provide correctedOrgName. If the crawled source and actual organizer differ, set orgNameMatches=false.",
      "Only propose a correction when the text gives clear, unambiguous evidence — do not guess.",
      "Field context:",
      buildFieldContext(context),
      "Return JSON only with: deadlineMatches boolean, correctedDeadline string|null (YYYY-MM-DD), orgNameMatches boolean, correctedOrgName string|null, sourceOrgName string|null, organizerName string|null, hostName string|null, operatorName string|null, sourceOrgRole string|null, organizationEvidence string|null, organizationConfidence number 0..1, confidence number 0..1, decision string, reason string.",
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
        text: {
          format: {
            type: "json_schema",
            name: "poster_field_verification",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                deadlineMatches: { type: "boolean" },
                correctedDeadline: { type: ["string", "null"] },
                orgNameMatches: { type: "boolean" },
                correctedOrgName: { type: ["string", "null"] },
                sourceOrgName: { type: ["string", "null"] },
                organizerName: { type: ["string", "null"] },
                hostName: { type: ["string", "null"] },
                operatorName: { type: ["string", "null"] },
                sourceOrgRole: { type: ["string", "null"] },
                organizationEvidence: { type: ["string", "null"] },
                organizationConfidence: { type: "number", minimum: 0, maximum: 1 },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                decision: { type: "string" },
                reason: { type: "string" },
              },
              required: [
                "deadlineMatches",
                "correctedDeadline",
                "orgNameMatches",
                "correctedOrgName",
                "sourceOrgName",
                "organizerName",
                "hostName",
                "operatorName",
                "sourceOrgRole",
                "organizationEvidence",
                "organizationConfidence",
                "confidence",
                "decision",
                "reason",
              ],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const outputText = payload.output_text
      ?? payload.output?.flatMap((item) => item.content ?? []).map((part) => part.text ?? "").join("\n")
      ?? "";
    const result = normalizeResult(parseJson(outputText));
    cache[key] = result;
    await saveCache(cache);
    return result;
  } catch (error) {
    const result = {
      deadlineMatches: true,
      correctedDeadline: null,
      orgNameMatches: true,
      correctedOrgName: null,
      sourceOrgName: context.site ?? null,
      organizerName: null,
      hostName: null,
      operatorName: null,
      organizationConfidence: 0,
      organization: {
        sourceOrgName: context.site ?? null,
        organizerName: null,
        hostName: null,
        operatorName: null,
        displayOrgName: context.site ?? null,
        sourceOrgRole: null,
        evidence: null,
        confidence: 0,
      },
      confidence: 0,
      decision: "verification_failed",
      reason: `Field verifier failed: ${error.message}`,
      checkedAt: new Date().toISOString(),
      model: MODEL,
    };
    cache[key] = result;
    await saveCache(cache);
    return result;
  }
}

export function applyFieldVerification(post, verification, { minConfidence = MIN_CONFIDENCE } = {}) {
  if (!verification || verification.confidence < minConfidence) {
    return { deadline: post.deadline ?? null, orgName: post.site ?? null };
  }

  const organizationDisplayName = normalizeText(
    verification.organization?.displayOrgName ??
    verification.correctedOrgName ??
    verification.organizerName ??
    verification.hostName
  );
  const shouldUseCorrectedDeadline =
    verification.correctedDeadline &&
    (!post.deadline || verification.deadlineMatches === false);

  const shouldUseCorrectedOrgName =
    (verification.correctedOrgName || organizationDisplayName) && verification.orgNameMatches === false;

  return {
    deadline: shouldUseCorrectedDeadline ? verification.correctedDeadline : (post.deadline ?? null),
    orgName: shouldUseCorrectedOrgName
      ? (verification.correctedOrgName ?? organizationDisplayName)
      : (organizationDisplayName ?? post.site ?? null),
  };
}
