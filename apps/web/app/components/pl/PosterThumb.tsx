"use client";

import { useEffect, useState } from "react";

/** Poster thumbnail; a plain paper-coloured box when there is no image or it fails. */
export function PosterThumb({
  src,
  className = "h-[72px] w-14",
}: {
  src?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  return (
    <div
      className={`shrink-0 overflow-hidden rounded-md bg-pl-poster ${className}`}
      aria-hidden="true"
    >
      {src && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
