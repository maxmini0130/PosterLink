import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPosterAcceptingApplications } from "../../../../lib/posterApplication";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
const MAX_QUERY_CHARS = Number(process.env.POSTER_SEARCH_QUERY_CHARS ?? "500");
const OPENAI_REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? "45000");

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function createOpenAiTimeoutSignal() {
  const timeoutMs = Number.isFinite(OPENAI_REQUEST_TIMEOUT_MS) && OPENAI_REQUEST_TIMEOUT_MS > 0
    ? OPENAI_REQUEST_TIMEOUT_MS
    : 45000;
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

function embeddingToPgVector(embedding: unknown) {
  if (!Array.isArray(embedding) || embedding.length === 0) return null;
  if (!embedding.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  return `[${embedding.join(",")}]`;
}

async function embedQuery(query: string) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    signal: createOpenAiTimeoutSignal(),
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, input: query }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI embedding failed: ${response.status}`);
  }

  const payload = await response.json();
  return embeddingToPgVector(payload.data?.[0]?.embedding);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const query = String(body?.query ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_CHARS);
  const limit = Math.min(Math.max(Number(body?.limit ?? 60) || 60, 1), 100);
  const categoryId = typeof body?.categoryId === "string" && body.categoryId.trim()
    ? body.categoryId.trim()
    : null;
  const regionIds = Array.isArray(body?.regionIds)
    ? body.regionIds.map((value: unknown) => String(value).trim()).filter(Boolean).slice(0, 50)
    : null;

  if (query.length < 2) {
    return NextResponse.json({ posters: [], semantic: false });
  }

  try {
    const queryEmbedding = await embedQuery(query);
    if (!queryEmbedding) {
      return NextResponse.json({ posters: [], semantic: false, reason: "embedding_not_available" });
    }

    const { data, error } = await getAdminClient().rpc("match_posters_by_embedding", {
      p_query_embedding: queryEmbedding,
      p_limit: limit,
      p_match_threshold: 0.2,
      p_category_id: categoryId,
      p_region_ids: regionIds && regionIds.length > 0 ? regionIds : null,
    });

    if (error) throw error;

    const posters = (data ?? []).filter((poster: any) =>
      isPosterAcceptingApplications({
        applicationStartAt: poster.application_start_at,
        applicationEndAt: poster.application_end_at,
        deadlineType: poster.deadline_type,
      }),
    );

    return NextResponse.json({
      posters,
      semantic: true,
      model: MODEL,
    });
  } catch (error: any) {
    console.warn("[semantic-search] fallback to keyword search:", error?.message ?? error);
    return NextResponse.json(
      { posters: [], semantic: false, reason: "semantic_search_failed" },
      { status: 200 },
    );
  }
}
