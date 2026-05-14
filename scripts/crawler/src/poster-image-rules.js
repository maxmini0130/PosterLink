import axios from "axios";

const MIN_SCORE = Number(process.env.POSTER_IMAGE_RULE_MIN_SCORE ?? "45");
const PROBE_BYTES = 512 * 1024;

const HARD_REJECT_URL_PATTERNS = [
  /(?:^|[\/_.-])logo(?:[\/_.-]|$)/i,
  /(?:^|[\/_.-])icon(?:[\/_.-]|$)/i,
  /(?:^|[\/_.-])favicon(?:[\/_.-]|$)/i,
  /(?:^|[\/_.-])sprite(?:[\/_.-]|$)/i,
  /(?:^|[\/_.-])btn(?:[\/_.-]|$)/i,
  /(?:^|[\/_.-])button(?:[\/_.-]|$)/i,
  /(?:^|[\/_.-])sns(?:[\/_.-]|$)/i,
  /(?:^|[\/_.-])wa[_-]?mark(?:[\/_.-]|$)/i,
  /web[_-]?accessibility|accessibility[_-]?mark/i,
  /(?:facebook|twitter|instagram|youtube|kakao|naver_blog)/i,
];

const POSITIVE_URL_PATTERNS = [
  /poster/i,
  /flyer/i,
  /notice/i,
  /event/i,
  /program/i,
  /recruit/i,
  /banner/i,
  /popup/i,
  /attach/i,
  /atch/i,
  /getimg/i,
  /file/i,
];

const POSITIVE_TEXT_PATTERNS = [
  /모집|신청|접수|행사|교육|강좌|공고|안내|지원|참여|프로그램|축제|캠페인|채용|대상|문의|기간/,
  /poster|flyer|event|program|recruit|notice|announcement|campaign/i,
];

function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getUrlPath(imageUrl) {
  try {
    const url = new URL(imageUrl);
    return decodeURIComponent(`${url.pathname}${url.search}`);
  } catch {
    return imageUrl;
  }
}

function parsePngSize(buffer) {
  if (buffer.length < 24) return null;
  if (buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function parseGifSize(buffer) {
  if (buffer.length < 10) return null;
  const signature = buffer.toString("ascii", 0, 6);
  if (signature !== "GIF87a" && signature !== "GIF89a") return null;
  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
  };
}

function parseWebpSize(buffer) {
  if (buffer.length < 30) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;

  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (chunk === "VP8L" && buffer.length >= 25) {
    const b0 = buffer[21];
    const b1 = buffer[22];
    const b2 = buffer[23];
    const b3 = buffer[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }

  if (chunk === "VP8X" && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }

  return null;
}

function parseJpegSize(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;

    const isSofMarker = (
      marker >= 0xc0 && marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    );
    if (isSofMarker && offset + 8 < buffer.length) {
      return {
        width: buffer.readUInt16BE(offset + 7),
        height: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += 2 + length;
  }

  return null;
}

function parseImageSize(buffer) {
  return parsePngSize(buffer)
    ?? parseGifSize(buffer)
    ?? parseWebpSize(buffer)
    ?? parseJpegSize(buffer);
}

async function probeImage(imageUrl) {
  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 12000,
    maxContentLength: 5 * 1024 * 1024,
    headers: {
      "User-Agent": "PosterLink-Crawler/1.0 (posterlink.kr; poster image rules)",
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.3",
      "Range": `bytes=0-${PROBE_BYTES - 1}`,
    },
    validateStatus: (status) => status >= 200 && status < 400,
  });

  const buffer = Buffer.from(response.data);
  return {
    contentType: response.headers["content-type"]?.split(";")[0]?.toLowerCase() ?? "",
    contentLength: Number(response.headers["content-length"] ?? 0),
    dimensions: parseImageSize(buffer),
  };
}

export async function scorePosterImageCandidate(imageUrl, context = {}) {
  const urlText = getUrlPath(imageUrl);
  const contextText = [
    context.title,
    context.site,
    context.board,
    context.category,
    context.content,
    context.sourceUrl,
  ].filter(Boolean).join(" ");
  const reasons = [];
  const signals = [];
  let score = 30;

  if (!imageUrl) {
    return { passes: false, score: 0, reason: "missing image URL", reasons: ["missing image URL"], signals: [] };
  }

  if (HARD_REJECT_URL_PATTERNS.some((pattern) => pattern.test(urlText))) {
    return {
      passes: false,
      score: 0,
      reason: "URL looks like logo/icon/button asset",
      reasons: ["URL looks like logo/icon/button asset"],
      signals: [],
    };
  }

  if (POSITIVE_URL_PATTERNS.some((pattern) => pattern.test(urlText))) {
    score += 10;
    signals.push("poster-like URL");
  }

  if (POSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(contextText))) {
    score += 15;
    signals.push("poster-like title/content");
  }

  let probe = null;
  try {
    probe = await probeImage(imageUrl);
  } catch (error) {
    reasons.push(`image probe failed: ${error.message}`);
    score -= 5;
  }

  if (probe?.contentType) {
    if (!probe.contentType.startsWith("image/")) {
      return {
        passes: false,
        score: 0,
        reason: `not an image content type: ${probe.contentType}`,
        reasons: [`not an image content type: ${probe.contentType}`],
        signals,
        contentType: probe.contentType,
      };
    }

    if (probe.contentType === "image/svg+xml") {
      score -= 30;
      reasons.push("SVG is often a logo/icon asset");
    }
  }

  const dimensions = probe?.dimensions ?? null;
  if (dimensions) {
    const { width, height } = dimensions;
    const area = width * height;
    const ratio = width / height;

    if (width < 220 || height < 220 || area < 90000) {
      score -= 45;
      reasons.push(`image too small (${width}x${height})`);
    } else if (width >= 300 && height >= 400) {
      score += 20;
      signals.push(`usable resolution (${width}x${height})`);
    } else {
      score += 8;
      signals.push(`medium resolution (${width}x${height})`);
    }

    if (ratio >= 0.45 && ratio <= 1.15) {
      score += 18;
      signals.push("portrait/card aspect ratio");
    } else if (ratio > 1.15 && ratio <= 1.9) {
      score += 6;
      signals.push("landscape card aspect ratio");
    } else {
      score -= 25;
      reasons.push(`unlikely poster aspect ratio (${ratio.toFixed(2)})`);
    }
  } else {
    reasons.push("image dimensions unknown");
  }

  if (probe?.contentLength > 0) {
    if (probe.contentLength < 12000) {
      score -= 20;
      reasons.push(`file too small (${probe.contentLength} bytes)`);
    } else if (probe.contentLength >= 50000) {
      score += 8;
      signals.push("substantial file size");
    }
  }

  const finalScore = clampScore(score);
  return {
    passes: finalScore >= MIN_SCORE,
    score: finalScore,
    reason: reasons[0] ?? signals[0] ?? "rule candidate accepted",
    reasons,
    signals,
    contentType: probe?.contentType,
    contentLength: probe?.contentLength,
    dimensions,
  };
}

export async function selectBestPosterImage(images, context = {}) {
  const candidates = [];

  for (const imageUrl of images ?? []) {
    const rule = await scorePosterImageCandidate(imageUrl, context);
    candidates.push({ imageUrl, rule });
  }

  candidates.sort((a, b) => b.rule.score - a.rule.score);
  const selected = candidates.find((candidate) => candidate.rule.passes) ?? null;

  return {
    selectedImageUrl: selected?.imageUrl ?? null,
    selectedRule: selected?.rule ?? null,
    candidates,
  };
}

export async function filterAndOrderPosterImages(images, context = {}) {
  const selection = await selectBestPosterImage(images, context);

  if (!selection.selectedImageUrl) {
    return {
      images: [],
      posterImageRule: null,
      posterImageCandidates: selection.candidates,
    };
  }

  const passingImages = selection.candidates
    .filter((candidate) => candidate.rule.passes)
    .map((candidate) => candidate.imageUrl);

  const orderedImages = [
    selection.selectedImageUrl,
    ...passingImages.filter((imageUrl) => imageUrl !== selection.selectedImageUrl),
  ];

  return {
    images: orderedImages,
    posterImageRule: selection.selectedRule,
    posterImageCandidates: selection.candidates,
  };
}
