/** Shared by the browser, crawler and offline audit. Unknown dimensions are not an approval. */
exports.assessPosterImage = function ({
  url,
  width = null,
  height = null,
  isPoster = undefined,
  broken = false,
}) {
  if (!url) return "missing";
  if (broken) return "broken";
  if (isPoster === false) return "unsuitable";
  if (!(Number(width) > 0 && Number(height) > 0)) return null;
  if (width < 400 || height < 400 || width / height > 1.9) return "unsuitable";
  return "ok";
};

/** Header-only decoder: no native dependency and no image file persistence. */
exports.readImageDimensions = function (b) {
  if (b.length >= 24 && b.toString("ascii", 1, 4) === "PNG")
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length >= 10 && b.toString("ascii", 0, 3) === "GIF")
    return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (
    b.length >= 30 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  ) {
    const type = b.toString("ascii", 12, 16);
    if (type === "VP8X")
      return {
        width: 1 + b.readUIntLE(24, 3),
        height: 1 + b.readUIntLE(27, 3),
      };
    if (type === "VP8 ")
      return {
        width: b.readUInt16LE(26) & 0x3fff,
        height: b.readUInt16LE(28) & 0x3fff,
      };
    if (type === "VP8L")
      return {
        width: 1 + (((b[22] & 63) << 8) | b[21]),
        height:
          1 + (((b[24] & 15) << 10) | (b[23] << 2) | ((b[22] & 192) >> 6)),
      };
  }
  if (b.length < 4 || b[0] !== 255 || b[1] !== 216) return null;
  let pos = 2;
  while (pos + 4 <= b.length) {
    if (b[pos] !== 255) {
      pos++;
      continue;
    }
    const marker = b[pos + 1];
    if (marker === 255) {
      pos++;
      continue;
    }
    if (marker === 0 || marker === 216 || marker === 217) {
      pos += 2;
      continue;
    }
    const length = b.readUInt16BE(pos + 2);
    if (length < 2) return null;
    if (
      marker >= 192 &&
      marker <= 207 &&
      ![196, 200, 204].includes(marker) &&
      pos + 9 <= b.length
    )
      return {
        width: b.readUInt16BE(pos + 7),
        height: b.readUInt16BE(pos + 5),
      };
    pos += length + 2;
  }
  return null;
};
