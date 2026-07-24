import axios from "axios";
import * as cheerio from "cheerio";
import crypto from "node:crypto";
import iconv from "iconv-lite";
import zlib from "zlib";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { evaluatePosterDateQuality } from "./poster-date-quality.js";

const execFileAsync = promisify(execFile);
const DEFAULT_ATTACHMENT_LIMIT = 2;
const DEFAULT_MAX_BYTES = 2_500_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_TOTAL_TEXT = 8_000;
const DEFAULT_MAX_TEXT_PER_ATTACHMENT = 4_000;
const DEFAULT_HWP_TIMEOUT_MS = 20_000;

const TEXT_KINDS = new Set(["pdf", "hwpx", "docx", "txt", "html", "xml", "json", "csv"]);
const UNSUPPORTED_BINARY_KINDS = new Set(["hwp", "image", "archive", "unknown"]);

const attachmentClient = axios.create({
  responseType: "arraybuffer",
  timeout: readPositiveInt("CRAWLER_ATTACHMENT_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
  maxContentLength: readPositiveInt("CRAWLER_ATTACHMENT_MAX_BYTES", DEFAULT_MAX_BYTES),
  maxBodyLength: readPositiveInt("CRAWLER_ATTACHMENT_MAX_BYTES", DEFAULT_MAX_BYTES),
  headers: {
    "User-Agent": "PosterLink-Crawler/1.0 (posterlink.kr; attachment text analysis)",
    "Accept": "application/pdf,application/zip,application/xml,text/*,*/*;q=0.7",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.3",
  },
  validateStatus: (status) => status >= 200 && status < 400,
});

function readPositiveInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function enabled() {
  return process.env.CRAWLER_ATTACHMENT_ANALYSIS !== "0";
}

function safeUrl(value, baseUrl) {
  const text = String(value ?? "").trim();
  if (!text || /^javascript:/i.test(text)) return null;
  try {
    return new URL(text, baseUrl || undefined).href;
  } catch {
    return null;
  }
}

function lastPathName(url) {
  try {
    const path = new URL(url).pathname;
    const value = path.split("/").filter(Boolean).pop();
    return value ? decodeURIComponent(value) : "";
  } catch {
    return "";
  }
}

function attachmentName(attachment, url) {
  return String(
    attachment?.name ??
    attachment?.title ??
    attachment?.filename ??
    attachment?.fileName ??
    attachment?.label ??
    lastPathName(url) ??
    ""
  ).replace(/\s+/g, " ").trim();
}

function extensionFromValue(value) {
  const text = String(value ?? "").toLowerCase();
  const match = text.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i);
  return match?.[1] ?? null;
}

function guessKind(input = {}, contentType = "") {
  const type = String(contentType ?? "").toLowerCase();
  const value = [
    input.name,
    input.title,
    input.filename,
    input.fileName,
    input.url,
  ].filter(Boolean).join(" ").toLowerCase();
  const ext = extensionFromValue(value);

  if (type.includes("pdf") || ext === "pdf") return "pdf";
  if (type.includes("hwpx") || ext === "hwpx") return "hwpx";
  if (type.includes("hwp") || ext === "hwp") return "hwp";
  if (type.includes("wordprocessingml") || ext === "docx") return "docx";
  if (type.startsWith("text/html") || ext === "html" || ext === "htm") return "html";
  if (type.includes("xml") || ext === "xml") return "xml";
  if (type.includes("json") || ext === "json") return "json";
  if (type.includes("csv") || ext === "csv") return "csv";
  if (type.startsWith("text/") || ["txt", "text", "md"].includes(ext ?? "")) return "txt";
  if (type.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext ?? "")) return "image";
  if (["zip", "7z", "rar"].includes(ext ?? "")) return "archive";
  return "unknown";
}

function looksLikeDownloadUrl(url) {
  return /download|file|attach|atch|bbs.*file|fileDown|downLoad|downloadFile|filedownload/i.test(String(url ?? ""));
}

function looksLikeUsefulAttachment(name) {
  return /공고|모집|지원|신청|접수|안내|계획|사업|참가|참여|교육|프로그램|채용|붙임|첨부|서식|양식/i.test(String(name ?? ""));
}

function collectAttachmentCandidates(post) {
  const baseUrl = post?.sourceUrl || post?.url;
  const candidates = [];
  const seen = new Set();
  const push = (attachment, source) => {
    const url = safeUrl(attachment?.url ?? attachment?.href, baseUrl);
    if (!url || seen.has(url)) return;

    const name = attachmentName(attachment, url);
    const kind = guessKind({ ...attachment, name, url });
    const shouldTry = TEXT_KINDS.has(kind) || (
      kind === "unknown" &&
      looksLikeDownloadUrl(url) &&
      looksLikeUsefulAttachment(name)
    );
    if (!shouldTry) return;

    seen.add(url);
    candidates.push({
      source,
      url,
      name: name || "attachment",
      kind,
    });
  };

  for (const attachment of post?.attachments ?? []) push(attachment, "attachment");
  for (const link of post?.links ?? post?.poster_links ?? []) push(link, "link");

  return candidates;
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)));
}

function cleanExtractedText(value, maxLength = DEFAULT_MAX_TEXT_PER_ATTACHMENT) {
  const text = decodeEntities(value)
    .replace(/\u0000/g, " ")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim();

  return Array.from(text).slice(0, maxLength).join("");
}

function detectCharset(contentType, buffer) {
  const charset = String(contentType ?? "").match(/charset=([^\s;]+)/i)?.[1];
  if (charset) return charset.toLowerCase();
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return "utf-8";
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return "utf-16le";
  if (buffer[0] === 0xfe && buffer[1] === 0xff) return "utf-16be";

  const head = buffer.slice(0, 4096).toString("ascii");
  return head.match(/charset=["']?([^\s"';>]+)/i)?.[1]?.toLowerCase() ?? "utf-8";
}

function decodeBuffer(buffer, contentType = "") {
  const charset = detectCharset(contentType, buffer);
  let decoded = iconv.decode(buffer, charset);
  const replacementCount = (decoded.match(/\uFFFD/g) ?? []).length;
  if (replacementCount >= 5 && charset !== "cp949") {
    try {
      const cp949 = iconv.decode(buffer, "cp949");
      if ((cp949.match(/\uFFFD/g) ?? []).length < replacementCount) decoded = cp949;
    } catch {
      // Keep the first decode.
    }
  }
  return decoded;
}

function extractTextLike(buffer, contentType, kind) {
  const decoded = decodeBuffer(buffer, contentType);
  if (kind === "html") {
    const $ = cheerio.load(decoded);
    $("script, style, noscript").remove();
    return cleanExtractedText($("body").text() || $.root().text());
  }
  if (kind === "xml") return xmlToText(decoded);
  return cleanExtractedText(decoded);
}

function findEndOfCentralDirectory(buffer) {
  const min = Math.max(0, buffer.length - 66_000);
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function readZipEntries(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) return [];

  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralDirOffset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  let offset = centralDirOffset;

  for (let i = 0; i < totalEntries && offset < buffer.length; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function zipEntryBuffer(buffer, entry) {
  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== 0x04034b50) return null;
  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataStart < 0 || dataEnd > buffer.length) return null;

  const data = buffer.slice(dataStart, dataEnd);
  if (entry.method === 0) return data;
  if (entry.method === 8) return zlib.inflateRawSync(data);
  return null;
}

function xmlToText(xml) {
  return cleanExtractedText(String(xml ?? "")
    .replace(/<\?xml[\s\S]*?\?>/gi, " ")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, " $1 ")
    .replace(/<\/(?:p|div|section|table|tr|li|h\d|w:p|hp:p|owpml:p)>/gi, "\n"));
}

function extractZipXmlText(buffer, kind) {
  const entries = readZipEntries(buffer);
  const selected = entries.filter((entry) => {
    const name = entry.name.toLowerCase();
    if (!name.endsWith(".xml")) return false;
    if (name.includes("_rels/") || name.includes("meta-inf/") || name.includes("settings")) return false;
    if (kind === "docx") return name === "word/document.xml" || /^word\/(?:header|footer)\d*\.xml$/.test(name);
    if (kind === "hwpx") return name.includes("contents/") || name.endsWith("content.hpf") || name.includes("section");
    return false;
  });

  const parts = [];
  for (const entry of selected.slice(0, 24)) {
    try {
      const fileBuffer = zipEntryBuffer(buffer, entry);
      if (!fileBuffer) continue;
      const text = xmlToText(fileBuffer.toString("utf8"));
      if (text) parts.push(text);
    } catch {
      // Skip corrupt zip members and continue with other files.
    }
  }

  return cleanExtractedText(parts.join("\n\n"), DEFAULT_MAX_TEXT_PER_ATTACHMENT);
}

function decodePdfBytes(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const codes = [];
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      codes.push(bytes.readUInt16BE(i));
    }
    return String.fromCodePoint(...codes.filter((code) => code !== 0));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.slice(2).toString("utf16le");
  }
  return bytes.toString("utf8").replace(/\uFFFD/g, "") || bytes.toString("latin1");
}

function decodePdfLiteral(raw) {
  const bytes = [];
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (char !== "\\") {
      bytes.push(raw.charCodeAt(i) & 0xff);
      continue;
    }

    const next = raw[++i];
    if (!next) break;
    if (next === "n") bytes.push(10);
    else if (next === "r") bytes.push(13);
    else if (next === "t") bytes.push(9);
    else if (next === "b") bytes.push(8);
    else if (next === "f") bytes.push(12);
    else if (["(", ")", "\\"].includes(next)) bytes.push(next.charCodeAt(0));
    else if (/[0-7]/.test(next)) {
      let octal = next;
      for (let j = 0; j < 2 && /[0-7]/.test(raw[i + 1] ?? ""); j += 1) {
        octal += raw[++i];
      }
      bytes.push(Number.parseInt(octal, 8) & 0xff);
    } else if (next === "\r" && raw[i + 1] === "\n") {
      i += 1;
    } else if (next !== "\n" && next !== "\r") {
      bytes.push(next.charCodeAt(0) & 0xff);
    }
  }
  return decodePdfBytes(Buffer.from(bytes));
}

function decodePdfHex(raw) {
  const cleaned = String(raw ?? "").replace(/\s+/g, "");
  if (!cleaned) return "";
  const padded = cleaned.length % 2 === 0 ? cleaned : `${cleaned}0`;
  return decodePdfBytes(Buffer.from(padded, "hex"));
}

function extractTextOperatorsFromPdfString(text) {
  const parts = [];
  for (const match of text.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) {
    const raw = match[0].replace(/\s*Tj$/, "").slice(1, -1);
    parts.push(decodePdfLiteral(raw));
  }
  for (const match of text.matchAll(/<([0-9a-fA-F\s]+)>\s*Tj/g)) {
    parts.push(decodePdfHex(match[1]));
  }
  for (const match of text.matchAll(/\[((?:\s*(?:\((?:\\.|[^\\)])*\)|<[^>]+>|-?\d+(?:\.\d+)?)\s*)+)\]\s*TJ/g)) {
    const arrayText = match[1];
    for (const item of arrayText.matchAll(/\((?:\\.|[^\\)])*\)|<([0-9a-fA-F\s]+)>/g)) {
      if (item[0].startsWith("(")) parts.push(decodePdfLiteral(item[0].slice(1, -1)));
      else parts.push(decodePdfHex(item[1]));
    }
    parts.push("\n");
  }
  return parts.join(" ");
}

function inflatePdfStream(buffer) {
  try {
    return zlib.inflateSync(buffer);
  } catch {
    try {
      return zlib.inflateRawSync(buffer);
    } catch {
      return null;
    }
  }
}

function extractPdfText(buffer) {
  const raw = buffer.toString("latin1");
  const parts = [extractTextOperatorsFromPdfString(raw)];
  const streamPattern = /<<(?:.|\n|\r){0,2000}?>>\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
  for (const match of raw.matchAll(streamPattern)) {
    const dictionary = match[0].slice(0, Math.min(match[0].indexOf("stream"), 2000));
    if (!/FlateDecode/i.test(dictionary)) continue;
    const inflated = inflatePdfStream(Buffer.from(match[1], "latin1"));
    if (!inflated) continue;
    parts.push(extractTextOperatorsFromPdfString(inflated.toString("latin1")));
  }
  return cleanExtractedText(parts.join("\n"), DEFAULT_MAX_TEXT_PER_ATTACHMENT);
}

function splitCommandLine(value) {
  const tokens = [];
  let current = "";
  let quote = null;
  for (const char of String(value ?? "")) {
    if ((char === "\"" || char === "'") && !quote) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (/\s/.test(char) && !quote) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

async function extractLegacyHwpText(buffer) {
  const commandLine = process.env.CRAWLER_HWP_TEXT_EXTRACTOR_COMMAND?.trim();
  if (!commandLine) {
    return {
      status: "unsupported",
      reason: "legacy hwp requires CRAWLER_HWP_TEXT_EXTRACTOR_COMMAND",
      text: "",
    };
  }

  const parts = splitCommandLine(commandLine);
  const command = parts.shift();
  if (!command) {
    return { status: "unsupported", reason: "invalid hwp extractor command", text: "" };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "posterlink-hwp-"));
  const tempPath = path.join(tempDir, "attachment.hwp");
  try {
    await fs.writeFile(tempPath, buffer);
    const args = parts.length > 0
      ? parts.map((part) => part.replace(/\{file\}/g, tempPath))
      : [tempPath];
    if (!args.some((arg) => arg.includes(tempPath))) args.push(tempPath);

    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: readPositiveInt("CRAWLER_HWP_TEXT_EXTRACTOR_TIMEOUT_MS", DEFAULT_HWP_TIMEOUT_MS),
      maxBuffer: readPositiveInt("CRAWLER_HWP_TEXT_EXTRACTOR_MAX_BUFFER", 4_000_000),
      windowsHide: true,
    });
    const text = cleanExtractedText(stdout, DEFAULT_MAX_TEXT_PER_ATTACHMENT);
    if (!text || text.length < 20) {
      return {
        status: "failed",
        reason: cleanExtractedText(stderr || "hwp extractor returned no readable text", 240),
        text: "",
      };
    }
    return { status: "extracted", reason: "", text };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function extractAttachmentText(buffer, kind, contentType) {
  if (kind === "hwp") return extractLegacyHwpText(buffer);

  if (UNSUPPORTED_BINARY_KINDS.has(kind)) {
    return {
      status: "unsupported",
      reason: kind === "hwp"
        ? "legacy hwp requires an external converter"
        : "unsupported attachment type",
      text: "",
    };
  }

  if (kind === "pdf") return { status: "extracted", text: extractPdfText(buffer) };
  if (kind === "hwpx" || kind === "docx") return { status: "extracted", text: extractZipXmlText(buffer, kind) };
  if (["txt", "html", "xml", "json", "csv"].includes(kind)) {
    return { status: "extracted", text: extractTextLike(buffer, contentType, kind) };
  }

  return { status: "unsupported", reason: "unsupported attachment type", text: "" };
}

async function analyzeAttachment(candidate, maxBytes) {
  const response = await attachmentClient.get(candidate.url);
  const contentType = response.headers?.["content-type"] ?? "";
  const buffer = Buffer.from(response.data);
  const contentHash = crypto.createHash("sha256").update(buffer).digest("hex");
  if (buffer.length > maxBytes) {
    return {
      ...candidate,
      contentHash,
      status: "failed",
      reason: `attachment exceeds ${maxBytes} bytes`,
      textLength: 0,
    };
  }

  const kind = guessKind(candidate, contentType);
  const extracted = await extractAttachmentText(buffer, kind, contentType);
  const text = cleanExtractedText(extracted.text ?? "");
  if (extracted.status === "unsupported") {
    return {
      ...candidate,
      kind,
      contentHash,
      status: "unsupported",
      reason: extracted.reason,
      textLength: 0,
    };
  }
  if (!text || text.length < 20) {
    return {
      ...candidate,
      kind,
      contentHash,
      status: "failed",
      reason: "no readable text extracted",
      textLength: 0,
    };
  }

  return {
    ...candidate,
    kind,
    contentHash,
    status: "extracted",
    reason: "",
    text,
    textLength: text.length,
  };
}

function publicSourceSummary(source) {
  return {
    source: source.source,
    name: source.name,
    url: source.url,
    kind: source.kind,
    status: source.status,
    reason: source.reason ?? "",
    textLength: source.textLength ?? 0,
    contentHash: source.contentHash ?? null,
  };
}

export async function analyzePostAttachments(post, options = {}) {
  if (!enabled()) {
    return { checked: 0, extracted: 0, unsupported: 0, failed: 0, contentAdded: false, sources: [] };
  }

  const limit = options.limit ?? readPositiveInt("CRAWLER_ATTACHMENT_ANALYSIS_LIMIT", DEFAULT_ATTACHMENT_LIMIT);
  const maxBytes = options.maxBytes ?? readPositiveInt("CRAWLER_ATTACHMENT_MAX_BYTES", DEFAULT_MAX_BYTES);
  const maxTotalText = options.maxTotalText ?? readPositiveInt("CRAWLER_ATTACHMENT_TEXT_CHARS", DEFAULT_MAX_TOTAL_TEXT);
  const candidates = collectAttachmentCandidates(post).slice(0, limit);
  if (candidates.length === 0) {
    return { checked: 0, extracted: 0, unsupported: 0, failed: 0, contentAdded: false, sources: [] };
  }

  const results = [];
  for (const candidate of candidates) {
    try {
      results.push(await analyzeAttachment(candidate, maxBytes));
    } catch (error) {
      results.push({
        ...candidate,
        status: "failed",
        reason: String(error?.message ?? error).slice(0, 240),
        textLength: 0,
      });
    }
  }

  const textBlocks = results
    .filter((result) => result.status === "extracted" && result.text)
    .map((result) => `[attachment: ${result.name}]\n${result.text}`);
  const addedText = cleanExtractedText(textBlocks.join("\n\n"), maxTotalText);
  const dateQuality = addedText
    ? evaluatePosterDateQuality({
        ...post,
        content: [post.content, addedText].filter(Boolean).join("\n\n"),
      }, { extractedDeadline: post.deadline ?? null })
    : null;

  return {
    checked: results.length,
    extracted: results.filter((result) => result.status === "extracted").length,
    unsupported: results.filter((result) => result.status === "unsupported").length,
    failed: results.filter((result) => result.status === "failed").length,
    contentAdded: Boolean(addedText),
    addedText,
    suggestedDeadline: dateQuality?.suggestedDeadline ?? null,
    sources: results.map(publicSourceSummary),
  };
}
