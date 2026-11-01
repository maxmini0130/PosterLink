import { probeImage } from "./poster-image-rules.js";
import { assessPosterImage } from "../../../packages/lib/posterImagePolicy.cjs";

/** Read only. Never silently turn a missing dimension or a probe error into ok. */
export async function inspectFeedImage(
  url,
  { probe = probeImage, classification = null } = {},
) {
  if (!url)
    return {
      width: null,
      height: null,
      image_width: null,
      image_height: null,
      image_status: "missing",
    };
  try {
    const result = await probe(url),
      width = result?.dimensions?.width ?? null,
      height = result?.dimensions?.height ?? null;
    const rejected =
      classification?.isPoster === false &&
      (classification?.source === "human" || classification?.confidence >= 0.8);
    const uncertain =
      classification &&
      classification.source !== "human" &&
      (!Number.isFinite(classification.confidence) ||
        classification.confidence < 0.65 ||
        (classification.isPoster === false && !rejected));
    const broken =
      !width &&
      !height &&
      Boolean(result?.contentType) &&
      !/^image\/|octet-stream/.test(result.contentType);
    const status = assessPosterImage({
      url,
      width,
      height,
      isPoster: rejected ? false : undefined,
      broken,
    });
    return {
      width,
      height,
      image_width: width,
      image_height: height,
      image_status: status === "ok" && uncertain ? null : status,
    };
  } catch (error) {
    return {
      width: null,
      height: null,
      image_width: null,
      image_height: null,
      image_status: [404, 410].includes(error.response?.status)
        ? "broken"
        : null,
    };
  }
}
