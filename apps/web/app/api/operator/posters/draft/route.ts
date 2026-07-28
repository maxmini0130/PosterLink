import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const MODEL = process.env.OPENAI_POSTER_DRAFT_MODEL?.trim() || process.env.OPENAI_NOTICE_FACTS_MODEL?.trim() || "gpt-5-mini";
const MAX_PROMPT_CHARS = Number(process.env.POSTER_DRAFT_PROMPT_CHARS ?? "4000");
const OPENAI_REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? "45000");

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function createUserClient(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: authHeader } },
      },
    );
  }
  return createSupabaseServerClient();
}

function createOpenAiTimeoutSignal() {
  const timeoutMs = Number.isFinite(OPENAI_REQUEST_TIMEOUT_MS) && OPENAI_REQUEST_TIMEOUT_MS > 0
    ? OPENAI_REQUEST_TIMEOUT_MS
    : 45000;
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

function parseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}

function normalizeText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeDate(value: unknown) {
  const text = normalizeText(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeUrl(value: unknown) {
  const text = normalizeText(value, 500);
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  const supabase = await createUserClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const sourceText = String(body?.sourceText ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_PROMPT_CHARS);
  if (sourceText.length < 10) {
    return NextResponse.json({ error: "초안으로 만들 내용을 조금 더 입력해주세요." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const admin = createAdminClient();
  const [{ data: categories }, { data: regions }] = await Promise.all([
    admin.from("categories").select("id, name, code").order("sort_order"),
    admin.from("regions").select("id, name, full_name, level").in("level", ["nation", "sido", "sigungu"]),
  ]);

  const categoryOptions = (categories ?? []).map((category: any) => ({
    id: String(category.id),
    name: String(category.name ?? ""),
    code: String(category.code ?? ""),
  }));
  const regionOptions = (regions ?? []).map((region: any) => ({
    id: String(region.id),
    name: String(region.full_name || region.name || ""),
    level: String(region.level ?? ""),
  }));
  const categoryIds = categoryOptions.map((category) => category.id);
  const regionIds = regionOptions.map((region) => region.id);

  const prompt = [
    "너는 공공/기관 공고 등록 담당자를 돕는 한국어 공고 초안 작성 도우미다.",
    "입력 텍스트에 근거해서 PosterLink 등록 폼에 넣을 값을 만든다.",
    "명확하지 않은 값은 빈 문자열로 둔다. 날짜는 반드시 YYYY-MM-DD 형식으로만 쓴다.",
    "카테고리와 지역은 제공된 id 중 하나만 선택하고, 확실하지 않으면 빈 문자열을 쓴다.",
    "요약은 사용자가 바로 게시 검수할 수 있게 1~2문장으로 간결하게 쓴다.",
    "모호하거나 누락된 필수 정보는 missing_fields/ambiguous_phrases에 한국어로 적는다.",
    "",
    `카테고리 후보(JSON): ${JSON.stringify(categoryOptions)}`,
    `지역 후보(JSON): ${JSON.stringify(regionOptions.slice(0, 250))}`,
    "",
    "입력:",
    sourceText,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: createOpenAiTimeoutSignal(),
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      text: {
        format: {
          type: "json_schema",
          name: "operator_poster_draft",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              source_org_name: { type: "string" },
              category_id: { type: "string", enum: ["", ...categoryIds] },
              region_id: { type: "string", enum: ["", ...regionIds] },
              application_end_at: { type: "string" },
              summary_short: { type: "string" },
              official_link: { type: "string" },
              missing_fields: { type: "array", items: { type: "string" } },
              ambiguous_phrases: { type: "array", items: { type: "string" } },
            },
            required: [
              "title",
              "source_org_name",
              "category_id",
              "region_id",
              "application_end_at",
              "summary_short",
              "official_link",
              "missing_fields",
              "ambiguous_phrases",
            ],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: `OpenAI API ${response.status}` }, { status: 502 });
  }

  const payload = await response.json();
  const outputText = payload.output_text
    ?? payload.output?.flatMap((item: any) => item.content ?? []).map((part: any) => part.text ?? "").join("\n")
    ?? "";
  const parsed = parseJson(outputText);

  return NextResponse.json({
    draft: {
      title: normalizeText(parsed.title, 180),
      sourceOrgName: normalizeText(parsed.source_org_name, 120),
      categoryId: categoryIds.includes(parsed.category_id) ? parsed.category_id : "",
      regionId: regionIds.includes(parsed.region_id) ? parsed.region_id : "",
      appEndAt: normalizeDate(parsed.application_end_at),
      summaryShort: normalizeText(parsed.summary_short, 500),
      officialLink: normalizeUrl(parsed.official_link),
    },
    review: {
      missingFields: Array.isArray(parsed.missing_fields)
        ? parsed.missing_fields.map((item: unknown) => normalizeText(item, 80)).filter(Boolean).slice(0, 8)
        : [],
      ambiguousPhrases: Array.isArray(parsed.ambiguous_phrases)
        ? parsed.ambiguous_phrases.map((item: unknown) => normalizeText(item, 120)).filter(Boolean).slice(0, 8)
        : [],
    },
    model: MODEL,
  });
}
