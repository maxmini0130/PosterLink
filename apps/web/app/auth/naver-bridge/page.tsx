"use client";

import { useEffect, useState } from "react";

export default function NaverBridgePage() {
  const [actionLink, setActionLink] = useState<string | null>(null);

  useEffect(() => {
    const al = new URLSearchParams(window.location.search).get("al");
    if (al) setActionLink(decodeURIComponent(al));
  }, []);

  if (!actionLink) return <div className="p-8">로딩 중...</div>;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-white gap-6">
      <p className="text-lg font-bold text-gray-700">디버그: 아래 버튼을 클릭하세요</p>
      <a
        href={actionLink}
        className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl"
      >
        네이버 로그인 완료하기 (직접 클릭)
      </a>
      <p className="text-xs text-gray-400 break-all max-w-xl">{actionLink}</p>
    </div>
  );
}
