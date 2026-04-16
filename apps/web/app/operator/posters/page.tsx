"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import Link from "next/link";
import { Plus, Search, FileText, CheckCircle2, Clock, AlertCircle, Edit3, Send } from "lucide-react";

export default function OperatorPostersPage() {
  const [posters, setPosters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchPosters = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("posters")
        .select(`
          *,
          categories (name),
          regions (name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setPosters(data);
    } catch (err) {
      console.error("Error fetching operator posters:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosters();
  }, []);

  const handleRequestReview = async (id: string) => {
    if (!confirm("관리자에게 검수를 요청하시겠습니까?")) return;

    const { error } = await supabase
      .from("posters")
      .update({ status: "review_requested" })
      .eq("id", id);

    if (error) alert(error.message);
    else {
      alert("검수 요청이 완료되었습니다.");
      fetchPosters();
    }
  };

  const filteredPosters = posters.filter(p => 
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.source_org_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-50 text-green-600 text-[11px] font-black border border-green-100"><CheckCircle2 size={12}/> 게시 중</span>;
      case 'draft':
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 text-gray-400 text-[11px] font-black border border-gray-100"><FileText size={12}/> 초안 작성</span>;
      case 'review_requested':
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 text-[11px] font-black border border-blue-100"><Clock size={12}/> 검수 대기</span>;
      case 'rejected':
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-500 text-[11px] font-black border border-rose-100"><AlertCircle size={12}/> 반려됨</span>;
      case 'expired':
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-50 text-orange-600 text-[11px] font-black border border-orange-100">마감</span>;
      default:
        return <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-400 text-[11px] font-black">{status}</span>;
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-black text-gray-900">포스터 관리 📋</h1>
          <p className="text-gray-400 font-bold mt-1 text-sm">운영자가 등록한 포스터 목록을 관리하고 검수를 요청합니다.</p>
        </div>
        <Link href="/operator/posters/new" className="flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white font-black rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95">
          <Plus size={20} /> 새 포스터 등록
        </Link>
      </div>

      {/* 검색 바 */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
        <input 
          type="text" 
          placeholder="포스터 제목이나 기관명으로 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-4 bg-white border-none rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-blue-100 outline-none transition-all"
        />
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/50">
                <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-wider">포스터 정보</th>
                <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-wider">카테고리 / 지역</th>
                <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-wider">상태</th>
                <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-wider">마감일</th>
                <th className="px-6 py-5 text-xs font-black text-gray-400 uppercase tracking-wider text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredPosters.map((p) => (
                <tr key={p.id} className="hover:bg-blue-50/30 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-1">{p.title}</span>
                      <span className="text-[11px] font-bold text-gray-400 mt-1">{p.source_org_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded-md inline-block w-fit">#{p.categories?.name || '기타'}</span>
                      <span className="text-[11px] font-bold text-gray-400">{p.regions?.name || '전국'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    {getStatusBadge(p.status)}
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-xs font-bold text-gray-600">
                      {p.application_end_at ? new Date(p.application_end_at).toLocaleDateString() : "-"}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {p.status === 'draft' && (
                        <button 
                          onClick={() => handleRequestReview(p.id)}
                          className="p-2 text-blue-600 hover:bg-blue-100 rounded-xl transition-colors title='검수 요청'"
                        >
                          <Send size={18} />
                        </button>
                      )}
                      <Link 
                        href={`/operator/posters/${p.id}`}
                        className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-xl transition-colors"
                      >
                        <Edit3 size={18} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredPosters.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-32 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-200">
                        <FileText size={32} />
                      </div>
                      <p className="text-gray-400 font-bold text-sm">해당하는 포스터가 없습니다.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
