"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";

interface PosterImageFallbackProps {
  src?: string | null;
  alt: string;
  title: string;
  org?: string | null;
  className?: string;
  imgClassName?: string;
  fallbackClassName?: string;
  iconSize?: number;
}

export function PosterImageFallback({
  src,
  alt,
  title,
  org,
  className = "h-full w-full",
  imgClassName = "h-full w-full object-cover",
  fallbackClassName = "p-4",
  iconSize = 24,
}: PosterImageFallbackProps) {
  const [failed, setFailed] = useState(false);
  const compact = iconSize <= 18;
  const iconBoxClassName = compact ? "h-8 w-8 rounded-xl" : iconSize >= 34 ? "h-16 w-16 rounded-3xl" : "h-12 w-12 rounded-2xl";
  const titleClassName = compact ? "line-clamp-2 text-[10px]" : "line-clamp-4 text-base";

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={imgClassName} onError={() => setFailed(true)} />;
  }

  return (
    <div className={`${className} ${fallbackClassName} flex flex-col justify-between bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-700 dark:via-slate-800 dark:to-slate-900`}>
      <div className={`flex ${iconBoxClassName} items-center justify-center bg-white/80 text-blue-500 shadow-sm dark:bg-slate-900/60 dark:text-blue-300`}>
        <FileText size={iconSize} />
      </div>
      <div>
        <p className={`${compact ? "mb-1" : "mb-2"} line-clamp-1 text-[10px] font-black uppercase tracking-wider text-blue-400 dark:text-blue-300`}>
          {org || "PosterLink"}
        </p>
        <p className={`${titleClassName} font-black leading-snug text-slate-800 dark:text-slate-100`}>
          {title}
        </p>
      </div>
    </div>
  );
}
