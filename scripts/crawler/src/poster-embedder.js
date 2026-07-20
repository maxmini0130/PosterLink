import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const CACHE_PATH = "data/poster_embeddings_cache.json";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const EMBEDDER_MODE = (process.env.POSTER_EMBEDDER ?? "auto").trim().toLowerCase();
const MODEL = process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
const MAX_INPUT_CHARS = Number(process.env.POSTER_EMBEDDING_INPUT_CHARS ?? "4000");

function isAiModeEnabled() {
  return EMBEDDER_MODE !== "off" && Boolean(OPENAI_API_KEY);
}

function buildEmbeddingInput({ title, summaryShort, summaryLong }) {
  return [title, summaryShort, summaryLong]
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_INPUT_CHARS);
}

function cacheKey(input) {
  return crypto.createHash("sha256").update(`${MODEL}:${input}`).digest("hex");
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
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache), "utf-8");
}

/**
 * Returns a float[] embedding for a poster's title+summary, or null when the
 * embedder is disabled, input is empty, or the API call fails (fail-open —
 * recommendation scoring treats a missing embedding as "no semantic signal").
 */
export async function embedPosterText({ title, summaryShort, summaryLong }) {
  const input = buildEmbeddingInput({ title, summaryShort, summaryLong });
  if (!input || !isAiModeEnabled()) return null;

  const cache = await loadCache();
  const key = cacheKey(input);
  if (Array.isArray(cache[key])) return cache[key];

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, input }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const embedding = payload.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) throw new Error("No embedding in response");

    cache[key] = embedding;
    await saveCache(cache);
    return embedding;
  } catch (error) {
    console.warn(`  Embedding failed: ${error.message}`);
    return null;
  }
}

export function embeddingToPgVector(embedding) {
  if (!Array.isArray(embedding) || embedding.length === 0) return null;
  return `[${embedding.join(",")}]`;
}
