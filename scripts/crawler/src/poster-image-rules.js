import axios from "axios";

const MIN_SCORE = Number(process.env.POSTER_IMAGE_RULE_MIN_SCORE ?? "45");
const PROBE_BYTES = 512 * 1024;

const HARD_REJECT_URL_PATTERNS = [
  /(?:^|[\/$_.-])logo(?:[\/$_.-]|$)/i,
  /(?:^|[\/$_.-])icon(?:[\/$_.-]|$)/i,
  /(?:^|[\/$_.-])favicon(?:[\/$_.-]|$)/i,
  /(?:^|[\/$_.-])sprite(?:[\/$_.-]|$)/i,
  /(?:^|[\/$_.-])btn(?:[\/$_.-]|$)/i,
  /(?:^|[\/$_.-])button(?:[\/$_.-]|$)/i,
  /(?:^|[\/$_.-])sns(?:[\/$_.-]|$)/i,
  /(?:^|[\/$_.-])bul[_-]|(?:^|[\/$_.-])bg[_-]|addfile|anyboard\/skin|skin001/i,
  /(?:^|[\/$_.-])wa[_-]?mark(?:[\/$_.-]|$)/i,
  /web[_-]?accessibility|accessibility[_-]?mark|wa[_-]?cert|wa[_-]?logo/i,
  /\uC6F9\s*\uC811\uADFC\uC131|\uC811\uADFC\uC131\s*\uC778\uC99D|\uD488\uC9C8\s*\uC778\uC99D|\uC778\uC99D\s*\uB9C8\uD06C|\uB300\uCCB4\s*\uD14D\uC2A4\uD2B8|\uB300\uCCB4\uD14D\uC2A4\uD2B8/i,
  /(?:\uCE98\uB9B0\uB354|\uB2EC\uB825|\uC2A4\uCF00\uC904|\uC2A4\uCF00\uC904\uD615|\uC2DC\uAC04\uD45C|\uC77C\uC815\uD45C)/i,
  /(?:calendar|schedule|timetable)/i,
  /(?:facebook|twitter|instagram|youtube|kakao|naver_blog)/i,
];

const HARD_REJECT_CONTEXT_PATTERNS = [
  /\uC6F9\s*\uC811\uADFC\uC131|\uC6F9\uC811\uADFC\uC131|\uC811\uADFC\uC131\s*\uC778\uC99D|\uD488\uC9C8\s*\uC778\uC99D\s*\uB9C8\uD06C|\uD55C\uAD6D\uD615\s*\uC6F9\s*\uCF58\uD150\uCE20\s*\uC811\uADFC\uC131|\uB300\uCCB4\s*\uD14D\uC2A4\uD2B8|\uB300\uCCB4\uD14D\uC2A4\uD2B8/i,
  /\uD648\uD398\uC774\uC9C0.*(?:\uC774\uC6A9|\uC811\uC18D).*(?:\uC8FC\uCC28\s*\uD1B5\uC81C|\uC8FC\uCC28\uD1B5\uC81C)|(?:\uC8FC\uCC28\s*\uD1B5\uC81C|\uC8FC\uCC28\uD1B5\uC81C).*(?:\uD648\uD398\uC774\uC9C0|\uC774\uC6A9\s*\uC548\uB0B4)/i,
  /(?:\uAD00\uB0B4\s*\uB300\uAD00|\uB300\uAD00).*(?:\uC77C\uC815\uD45C|\uC77C\uC815\s*\uD45C)|(?:\uC13C\uD130|\uCCB4\uC721\uAD00|\uC2DC\uC124).*(?:\uAD00\uB0B4\s*\uB300\uAD00|\uB300\uAD00)/i,
  /(?:\d{1,2}\s*\uC6D4|[0-9]{2}\s*\uC6D4).*(?:\uC6D4\s*\uD504\uB85C\uADF8\uB7A8\s*\uC548\uB0B4|\uD504\uB85C\uADF8\uB7A8\s*\uC548\uB0B4|\uCE98\uB9B0\uB354|\uB2EC\uB825|\uC2A4\uCF00\uC904|\uC2DC\uAC04\uD45C|\uC77C\uC815\uD45C)|(?:\uC6D4\s*\uD504\uB85C\uADF8\uB7A8\s*\uC548\uB0B4|\uCE98\uB9B0\uB354|\uB2EC\uB825|\uC2A4\uCF00\uC904|\uC2DC\uAC04\uD45C|\uC77C\uC815\uD45C).*(?:\d{1,2}\s*\uC6D4|[0-9]{2}\s*\uC6D4)/i,
  /(?:\uAC15\uBD81\s*ANC|\uACF5\uC608\uC804\uC2DC\uAD00\s*\uAC15\uBD81\s*ANC).*(?:\d{1,2}\s*\uC6D4\s*\uACF5\uC608\s*(?:\uCCB4\uD5D8\s*)?\uD074\uB798\uC2A4|\uACF5\uC608\s*\uD074\uB798\uC2A4\s*\(\s*\d{1,2}\s*\uC6D4\s*\))/i,
];
const CERTIFICATION_MARK_SHAPE_MIN_RATIO = 1.35;
const CERTIFICATION_MARK_SHAPE_MAX_RATIO = 2.25;
const CERTIFICATION_MARK_SHAPE_MAX_WIDTH = 599;
const CERTIFICATION_MARK_SHAPE_MAX_HEIGHT = 399;

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
  /\uBAA8\uC9D1|\uC2E0\uCCAD|\uC811\uC218|\uD589\uC0AC|\uAD50\uC721|\uAC15\uC88C|\uACF5\uACE0|\uC548\uB0B4|\uC9C0\uC6D0|\uCC38\uC5EC|\uD504\uB85C\uADF8\uB7A8|\uCD95\uC81C|\uCEA0\uD398\uC778|\uCC44\uC6A9|\uB300\uC0C1|\uBB38\uC758|\uAE30\uAC04/,
  /\uCC38\uC5EC\uC790\s*\uBAA8\uC9D1|\uAD50\uC721\uC0DD\s*\uBAA8\uC9D1|\uACF5\uC608\s*\uD074\uB798\uC2A4|\uCCAD\uB144\uCEE4\uB9AC\uC5B4\uD328\uC2A4|\uC591\uC131\uACFC\uC815|\uC9C0\uC74C\uC704\uD06C|\uC2E0\uADDC\s*\uC624\uD508|\uD3B8\uC9D1\uC2E4\s*\uC2E0\uADDC\s*\uC624\uD508|\uD074\uB798\uC2A4|\uC6CC\uD06C\uC20D|\uD2B9\uAC15|\uD504\uB85C\uADF8\uB7A8|\uCD95\uC81C|\uD589\uC0AC/i,
  /poster|flyer|event|program|recruit|notice|announcement|campaign/i,
];
function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function isLikelyThumbnailProxy(imageUrl) {
  return /\/atch\/getImg\.do/i.test(imageUrl);
}

function removeThumbnailProxiesWhenOriginalsExist(images) {
  const hasOriginalLikeImage = images.some((imageUrl) => !isLikelyThumbnailProxy(imageUrl));
  return hasOriginalLikeImage ? images.filter((imageUrl) => !isLikelyThumbnailProxy(imageUrl)) : images;
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
  const requestOptions = {
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
  };

  let response;
  try {
    response = await axios.get(imageUrl, requestOptions);
  } catch (error) {
    if (error.response?.status !== 416) throw error;
    const { Range, ...headersWithoutRange } = requestOptions.headers;
    response = await axios.get(imageUrl, {
      ...requestOptions,
      headers: headersWithoutRange,
    });
  }

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
      reason: "URL looks like a non-poster asset",
      reasons: ["URL looks like a non-poster asset"],
      signals: [],
    };
  }

  if (HARD_REJECT_CONTEXT_PATTERNS.some((pattern) => pattern.test(contextText))) {
    return {
      passes: false,
      score: 0,
      reason: "context looks like accessibility, homepage, parking-control, rental-schedule, or monthly schedule notice",
      reasons: ["context looks like accessibility, homepage, parking-control, rental-schedule, or monthly schedule notice"],
      signals: [],
    };
  }

  if (POSITIVE_URL_PATTERNS.some((pattern) => pattern.test(urlText))) {
    score += 10;
    signals.push("poster-like URL");
  }

  if (context.preferredImageUrls?.includes(imageUrl)) {
    score += 15;
    signals.push("preferred detail image");
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
    if (!probe.contentType.startsWith("image/") && !probe.dimensions) {
      return {
        passes: false,
        score: 0,
        reason: `not an image content type: ${probe.contentType}`,
        reasons: [`not an image content type: ${probe.contentType}`],
        signals,
        contentType: probe.contentType,
      };
    }

    if (!probe.contentType.startsWith("image/") && probe.dimensions) {
      score += 8;
      signals.push(`image bytes with generic content type (${probe.contentType})`);
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

    if (
      ratio >= CERTIFICATION_MARK_SHAPE_MIN_RATIO &&
      ratio <= CERTIFICATION_MARK_SHAPE_MAX_RATIO &&
      width <= CERTIFICATION_MARK_SHAPE_MAX_WIDTH &&
      height <= CERTIFICATION_MARK_SHAPE_MAX_HEIGHT &&
      !context.preferredImageUrls?.includes(imageUrl)
    ) {
      return {
        passes: false,
        score: 0,
        reason: `image shape looks like a certification mark (${width}x${height})`,
        reasons: [`image shape looks like a certification mark (${width}x${height})`],
        signals,
        contentType: probe?.contentType,
        contentLength: probe?.contentLength,
        dimensions,
      };
    }

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

  const orderedImages = removeThumbnailProxiesWhenOriginalsExist([
    selection.selectedImageUrl,
    ...passingImages.filter((imageUrl) => imageUrl !== selection.selectedImageUrl),
  ]);

  return {
    images: orderedImages,
    posterImageRule: selection.selectedRule,
    posterImageCandidates: selection.candidates,
  };
}
