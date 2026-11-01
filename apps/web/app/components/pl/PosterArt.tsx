"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { DefaultPoster, type DefaultPosterProps } from "./DefaultPoster";
import {
  optimizablePosterImage,
  usablePosterImage,
  type PosterImageMeta,
} from "../../../lib/feedImages";

export function PosterArt({
  id,
  src,
  title,
  category,
  organization,
  imageWidth,
  imageHeight,
  imageStatus,
  priority = false,
  feed = false,
}: DefaultPosterProps &
  PosterImageMeta & {
    id: string;
    src?: string | null;
    priority?: boolean;
    feed?: boolean;
  }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const [probed, setProbed] = useState<{
    src: string;
    width?: number;
    height?: number;
    status?: string | null;
  } | null>(null);
  useEffect(() => {
    setProbed(null);
    if (
      !src ||
      !optimizablePosterImage(src) ||
      (imageWidth && imageHeight) ||
      imageStatus
    )
      return;
    const controller = new AbortController();
    fetch(
      `/api/poster-image-meta?id=${encodeURIComponent(id)}&src=${encodeURIComponent(src)}`,
      { signal: controller.signal },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((value) => {
        if (value?.src === src && !controller.signal.aborted) setProbed(value);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [id, src, imageWidth, imageHeight, imageStatus]);
  const w = imageWidth || probed?.width,
    h = imageHeight || probed?.height;
  const resolvedStatus = imageStatus || probed?.status;
  const waiting = !imageStatus && !(w && h);
  const fallback =
    failed ||
    waiting ||
    !optimizablePosterImage(src) ||
    !usablePosterImage(src, {
      imageWidth: w,
      imageHeight: h,
      imageStatus: resolvedStatus as PosterImageMeta["imageStatus"],
    });
  const tall = feed && w && h && h / w > 2;
  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[#ECE7DA]"
      style={{ containerType: "inline-size" }}
    >
      {fallback ? (
        <DefaultPoster
          title={title}
          category={category}
          organization={organization}
        />
      ) : (
        <Image
          src={src!}
          alt=""
          fill
          sizes={
            feed
              ? "(min-width:1280px) 285px, (min-width:1200px) calc(25vw - 35px), (min-width:768px) calc(33.333vw - 27px), calc(50vw - 21px)"
              : "64px"
          }
          quality={80}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          className={tall ? "object-cover object-top" : "object-contain"}
          onError={() => setFailed(true)}
        />
      )}
      {!fallback && tall && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#ECE7DA] via-[#ECE7DA]/90 to-transparent pt-10 pb-2 text-center text-xs font-bold text-pl-ink">
          전체 보기
        </span>
      )}
    </div>
  );
}
