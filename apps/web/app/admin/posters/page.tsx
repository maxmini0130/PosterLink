"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Check, X, ExternalLink, Image as ImageIcon, Eye } from "lucide-react";
import Link from "next/link";

export default function AdminPostersPage() {
  const [posters, setPosters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPendingPosters = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("posters")
      .select(`
        *,
        categories (name),
        regions (name),
        poster_images (storage_path)
      `)
      .in("status", ["review_requested", "draft"]) // 검수 대기 위주로 조회
      .order("created_at", { ascending: true });

    if (data) setPosters(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchPendingPosters();
  }, []);

  const handleStatusChange = async (id: string, newStatus: 'published' | 'rejected') => {
    const confirmMsg = newStatus === 'published' ? "승인하시겠습니까? 즉시 서비스에 노출됩니다." : "반려하시겠습니까?";
    if (!confirm(confirmMsg)) return;

    const { error } = await supabase
      .from("posters")
      .update({ 
        status: newStatus,
        published_at: newStatus === 'published' ? new Date().toISOString() : null
      })
      .eq("id", id);

    if (error) alert(error.message);
    else {
      alert(newStatus === 'published' ? "승인 완료!" : "반려 처리되었습니다.");
      fetchPendingPosters();
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-10">
        <h1 className="text-3xl font-black text-gray-900 italic">Poster Verification 🔍</h1>
        <p className="text-gray-400 font-bold mt-2">운영자가 등록한 포스터의 정보를 확인하고 최종 게시를 결정합니다.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-6">
          {[1, 2].map(i => <div key={i} className="h-48 bg-white rounded-3xl animate-pulse shadow-sm" />)}
        </div>
      ) : posters.length > 0 ? (
        <div className="space-y-6">
          {posters.map((p) => (
            <div key={p.id} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col md:flex-row gap-8 items-start hover:shadow-md transition-shadow">
              {/* Thumbnail Preview */}
              <div className="w-full md:w-32 aspect-[3/4] bg-gray-50 rounded-2xl flex-shrink-0 overflow-hidden border border-gray-100 flex items-center justify-center relative group">
                {p.poster_images?.[0] ? (
                  <img 
                    src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/poster-originals/${p.poster_images[0].storage_path}`} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon className="text-gray-200" size={32} />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Eye className="text-white" size={24} />
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-lg uppercase">
                      {p.status.replace('_', ' ')}
                    </span>
                    <span className="text-[11px] font-bold text-gray-400">
                      신청: {p.created_at ? new Date(p.created_at).toLocaleDateString() : '-'}
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-gray-900 leading-tight">{p.title}</h3>
                  <p className="text-sm font-bold text-gray-400 mt-1">{p.source_org_name} · {p.regions?.name || '전국'}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-gray-50 text-gray-500 text-[11px] font-bold rounded-full">
                    분야: {p.categories?.name}
                  </span>
                  <span className="px-3 py-1 bg-gray-50 text-gray-500 text-[11px] font-bold rounded-full">
                    마감: {p.application_end_at ? new Date(p.application_end_at).toLocaleDateString() : '상시'}
                  </span>
                </div>
                
                {p.summary_short && (
                  <p className="text-sm text-gray-600 font-medium leading-relaxed bg-indigo-50/30 p-4 rounded-2xl">
                    <span className="text-indigo-400 font-black mr-2">요약</span>
                    {p.summary_short}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="w-full md:w-auto flex flex-row md:flex-col gap-3 justify-end h-full">
                <Link 
                  href={`/posters/${p.id}`} 
                  target="_blank"
                  className="p-4 bg-gray-50 text-gray-400 rounded-2xl hover:bg-gray-100 transition-colors"
                >
                  <ExternalLink size={20} />
                </Link>
                <button 
                  onClick={() => handleStatusChange(p.id, 'rejected')}
                  className="p-4 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-100 transition-colors"
                >
                  <X size={20} />
                </button>
                <button 
                  onClick={() => handleStatusChange(p.id, 'published')}
                  className="p-4 md:p-6 bg-indigo-600 text-white rounded-[1.5rem] hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                  <Check size={24} strokeWidth={3} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-40 text-center bg-white rounded-[3rem] border border-dashed border-gray-200">
           <FileCheck className="mx-auto text-gray-200 mb-4" size={48} />
           <p className="text-gray-400 font-bold">현재 검수 대기 중인 포스터가 없습니다.</p>
        </div>
      )}
    </div>
  );
}
