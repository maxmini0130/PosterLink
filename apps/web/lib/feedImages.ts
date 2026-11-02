import { assessPosterImage } from "../../../packages/lib/posterImagePolicy.cjs";

export type ImageStatus = "ok" | "missing" | "unsuitable" | "broken";
export type PosterImageMeta = {
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageStatus?: ImageStatus | null;
};

export function usablePosterImage(
  src?: string | null,
  meta: PosterImageMeta = {},
) {
  if (
    !src ||
    ["missing", "unsuitable", "broken"].includes(meta.imageStatus ?? "")
  )
    return false;
  return (
    assessPosterImage({
      url: src,
      width: meta.imageWidth,
      height: meta.imageHeight,
    }) !== "unsuitable"
  );
}

/** Only our public Storage images enter the optimizer; external originals use the default until copied after approval. */
export function optimizablePosterImage(src?: string | null) {
  if (!src) return false;
  try {
    const u = new URL(src);
    return (
      u.protocol === "https:" &&
      /^[a-z0-9]+\.supabase\.co$/.test(u.hostname) &&
      u.pathname.startsWith("/storage/v1/object/public/")
    );
  } catch {
    return false;
  }
}

export function imageMetadata(
  image: Record<string, unknown> | undefined,
): PosterImageMeta {
  // New crawler measured it but deliberately withheld a decision (e.g. low
  // confidence). Do not turn that pending review into ok using dimensions.
  if (image?.image_width && !image.image_status)
    return { imageWidth: null, imageHeight: null, imageStatus: null };
  return {
    imageWidth: Number(image?.image_width || image?.width) || null,
    imageHeight: Number(image?.image_height || image?.height) || null,
    imageStatus: ["ok", "missing", "unsuitable", "broken"].includes(
      String(image?.image_status),
    )
      ? (image.image_status as ImageStatus)
      : null,
  };
}
