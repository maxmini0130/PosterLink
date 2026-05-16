"use client";

import { useMemo, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PosterImageFallback } from "./PosterImageFallback";

interface PosterImageCarouselProps {
  images: (string | null | undefined)[];
  title: string;
  org?: string | null;
  className?: string;
  imgClassName?: string;
  fallbackClassName?: string;
  iconSize?: number;
  showControls?: boolean;
  showIndicators?: boolean;
  showCounter?: boolean;
  onImageClick?: (imageUrl: string, index: number) => void;
}

export function PosterImageCarousel({
  images,
  title,
  org,
  className = "h-full w-full",
  imgClassName = "h-full w-full object-contain bg-gray-50",
  fallbackClassName = "p-4",
  iconSize = 24,
  showControls = false,
  showIndicators = true,
  showCounter = true,
  onImageClick,
}: PosterImageCarouselProps) {
  const imageUrls = useMemo(() => [...new Set(images.filter((url): url is string => Boolean(url)))], [images]);
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const swipedRef = useRef(false);
  const currentImage = imageUrls[index] ?? null;
  const hasMultiple = imageUrls.length > 1;

  const goTo = (nextIndex: number) => {
    if (!hasMultiple) return;
    setIndex((nextIndex + imageUrls.length) % imageUrls.length);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    swipedRef.current = false;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return;
    const delta = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;

    if (Math.abs(delta) < 36) return;
    swipedRef.current = true;
    goTo(index + (delta < 0 ? 1 : -1));
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (swipedRef.current) {
      event.preventDefault();
      event.stopPropagation();
      swipedRef.current = false;
      return;
    }
    if (currentImage) onImageClick?.(currentImage, index);
  };

  return (
    <div
      className={`${className} relative overflow-hidden`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
    >
      <PosterImageFallback
        src={currentImage}
        alt={title}
        title={title}
        org={org}
        className="h-full w-full"
        fallbackClassName={fallbackClassName}
        imgClassName={imgClassName}
        iconSize={iconSize}
      />

      {hasMultiple && showCounter && (
        <div className="absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-black text-white shadow-sm backdrop-blur">
          {index + 1}/{imageUrls.length}
        </div>
      )}

      {hasMultiple && showControls && (
        <>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              goTo(index - 1);
            }}
            className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/60"
            aria-label="이전 이미지"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              goTo(index + 1);
            }}
            className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/60"
            aria-label="다음 이미지"
          >
            <ChevronRight size={18} />
          </button>
        </>
      )}

      {hasMultiple && showIndicators && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1.5 backdrop-blur">
          {imageUrls.map((imageUrl, imageIndex) => (
            <span
              key={`${imageUrl}-${imageIndex}`}
              className={`h-1.5 rounded-full transition-all ${imageIndex === index ? "w-4 bg-white" : "w-1.5 bg-white/45"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
