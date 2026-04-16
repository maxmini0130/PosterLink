"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import Link from "next/link";

export default function OperatorPostersPage() {
  const [posters, setPosters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPosters = async () => {
      const { data } = await supabase.from("posters").select("*").order("created_at", { ascending: false });
      if (data) setPosters(data);
      setLoading(false);
    };
    fetchPosters();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">포스터 관리</h1>
        <Link href="/operator/posters/new" className="px-6 py-3 bg-primary text-white font-bold rounded-xl shadow-lg">+ 새 포스터</Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-400 uppercase font-bold">
            <tr>
              <th className="px-6 py-4">제목</th>
              <th className="px-6 py-4">기관</th>
              <th className="px-6 py-4">상태</th>
              <th className="px-6 py-4">마감일</th>
              <th className="px-6 py-4">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {posters.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-medium">{p.title}</td>
                <td className="px-6 py-4 text-gray-500">{p.source_org_name}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold ${p.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                    {p.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4">{p.application_end_at?.split("T")[0] || "-"}</td>
                <td className="px-6 py-4 text-primary font-bold">
                  <Link href={`/operator/posters/${p.id}`}>수정</Link>
                </td>
              </tr>
            ))}
            {posters.length === 0 && !loading && (
              <tr><td colSpan={5} className="px-6 py-20 text-center text-gray-400">등록된 포스터가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
