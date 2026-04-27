"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white text-center">
          <p className="text-6xl font-black text-gray-100 mb-4">500</p>
          <h2 className="text-xl font-black text-gray-900 mb-2">서비스 오류가 발생했습니다</h2>
          <p className="text-gray-400 text-sm mb-8">문제가 자동 보고되었습니다. 잠시 후 다시 시도해주세요.</p>
          <button
            onClick={reset}
            className="px-8 py-4 bg-gray-900 text-white font-black rounded-2xl hover:bg-black transition-all"
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
