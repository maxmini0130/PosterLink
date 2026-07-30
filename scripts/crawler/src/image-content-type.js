export function sniffImageContentType(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer.toString("ascii", 1, 4) === "PNG"
  ) return "image/png";

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) {
    return "image/gif";
  }

  if (
    buffer.length >= 12
    && buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WEBP"
  ) return "image/webp";

  return null;
}

export function resolveImageContentType(declaredContentType, bytes) {
  const declared = String(declaredContentType ?? "").split(";")[0].trim().toLowerCase();
  if (declared.startsWith("image/")) return declared;
  return sniffImageContentType(bytes);
}
