"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 text-center">
          <p className="mb-4 text-6xl font-black text-gray-100">500</p>
          <h2 className="mb-2 text-xl font-black text-gray-900">서비스 오류가 발생했습니다</h2>
          <p className="mb-8 text-sm text-gray-400">문제가 자동 보고되었습니다. 잠시 후 다시 시도해주세요.</p>
          <button
            onClick={reset}
            className="rounded-2xl bg-gray-900 px-8 py-4 font-black text-white transition-all hover:bg-black"
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
