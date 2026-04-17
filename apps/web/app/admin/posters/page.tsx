"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Check, X, ExternalLink, Image as ImageIcon, Eye, FileCheck, Filter, Loader2 } from "lucide-react";
import Link from "next/link";

type PosterStatus = 'review' | 'published' | 'rejected' | 'draft';

export default function AdminPostersPage() {
  const [posters, setPosters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFilter, setCurrentFilter] = useState<PosterStatus>('review');

  const fetchPosters = async (status: PosterStatus) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("posters")
      .select(`
        *,
        poster_categories (categories (name)),
        poster_regions (regions (name)),
        poster_images (image_url)
      `)
      .eq("poster_status", status)
      .order("created_at", { ascending: status === 'review' }); // 대기중은 오래된 순, 나머지는 최신순

    if (data) setPosters(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchPosters(currentFilter);
  }, [currentFilter]);

  const handleStatusChange = async (id: string, newStatus: 'published' | 'rejected') => {
    const confirmMsg = newStatus === 'published' ? "승인하시겠습니까? 즉시 서비스에 노출됩니다." : "반려하시겠습니까?";
    if (!confirm(confirmMsg)) return;

    const { error } = await supabase
      .from("posters")
      .update({
        poster_status: newStatus,
        published_at: newStatus === 'published' ? new Date().toISOString() : null
      })
      .eq("id", id);

    if (error) alert(error.message);
    else {
      alert(newStatus === 'published' ? "승인 완료!" : "반려 처리되었습니다.");
      fetchPosters(currentFilter);
    }
  };

  const tabs: { label: string; value: PosterStatus }[] = [
    { label: "검수 대기", value: 'review' },
    { label: "승인 완료", value: 'published' },
    { label: "반려됨", value: 'rejected' },
    { label: "임시 저장", value: 'draft' },
  ];

  return (
    <div className="max-w-6xl mx-auto pb-20">
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-gray-900 dark:text-white italic tracking-tight">Poster Verification 🔍</h1>
          <p className="text-gray-400 dark:text-slate-500 font-bold mt-2">운영자가 등록한 포스터의 정보를 확인하고 최종 게시를 결정합니다.</p>
        </div>
      </div>

      {/* Tabs Filter */}
      <div className="flex flex-wrap gap-2 mb-8 bg-gray-100 dark:bg-slate-900 p-1.5 rounded-[1.5rem] w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setCurrentFilter(tab.value)}
            className={`px-6 py-3 rounded-2xl text-sm font-black transition-all ${
              currentFilter === tab.value
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 bg-white dark:bg-slate-900 rounded-[2.5rem] animate-pulse border border-gray-100 dark:border-slate-800" />
          ))}
        </div>
      ) : posters.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {posters.map((p) => (
            <div key={p.id} className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-slate-800 flex flex-col md:flex-row gap-8 items-start hover:shadow-md dark:hover:shadow-indigo-900/10 transition-all group">
              {/* Thumbnail Preview */}
              <div className="w-full md:w-32 aspect-[3/4] bg-gray-50 dark:bg-slate-800 rounded-2xl flex-shrink-0 overflow-hidden border border-gray-100 dark:border-slate-700 flex items-center justify-center relative group/img">
                {p.poster_images?.[0] ? (
                  <img 
                    src={p.poster_images[0].image_url} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110"
                    alt="Poster"
                  />
                ) : (
                  <ImageIcon className="text-gray-200 dark:text-slate-700" size={32} />
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                  <Eye className="text-white" size={24} />
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 text-[10px] font-black rounded-lg uppercase tracking-wider ${
                    p.poster_status === 'published' ? 'bg-green-50 dark:bg-green-900/20 text-green-600' :
                    p.poster_status === 'rejected' ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600' :
                    'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600'
                  }`}>
                    {p.poster_status.replace('_', ' ')}
                  </span>
                  <span className="text-[11px] font-bold text-gray-400 dark:text-slate-500 italic">
                    {new Date(p.created_at).toLocaleDateString()} 에 요청됨
                  </span>
                </div>
                
                <h3 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">{p.title}</h3>
                <p className="text-sm font-bold text-gray-500 dark:text-slate-400 flex items-center gap-2">
                  <span className="text-indigo-500">@{p.source_org_name}</span>
                  <span className="w-1 h-1 bg-gray-300 rounded-full" />
                  <span>{p.poster_regions?.[0]?.regions?.name || '전국'}</span>
                </p>

                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-slate-400 text-[11px] font-black rounded-full border border-gray-100 dark:border-slate-700">
                    분야: {p.poster_categories?.[0]?.categories?.name}
                  </span>
                  <span className="px-3 py-1 bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-slate-400 text-[11px] font-black rounded-full border border-gray-100 dark:border-slate-700">
                    마감: {p.application_end_at ? new Date(p.application_end_at).toLocaleDateString() : '상시'}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="w-full md:w-auto flex flex-row md:flex-col gap-3 justify-end h-full pt-2">
                <Link 
                  href={`/posters/${p.id}`} 
                  target="_blank"
                  className="p-4 bg-gray-50 dark:bg-slate-800 text-gray-400 dark:text-slate-500 rounded-2xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-all border border-transparent hover:border-gray-200 dark:hover:border-slate-600"
                >
                  <ExternalLink size={20} />
                </Link>
                {p.poster_status !== 'rejected' && (
                  <button 
                    onClick={() => handleStatusChange(p.id, 'rejected')}
                    className="p-4 bg-rose-50 dark:bg-rose-900/10 text-rose-500 rounded-2xl hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-all"
                  >
                    <X size={20} />
                  </button>
                )}
                {p.poster_status !== 'published' && (
                  <button 
                    onClick={() => handleStatusChange(p.id, 'published')}
                    className="p-4 md:p-6 bg-indigo-600 dark:bg-indigo-500 text-white rounded-[1.5rem] hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all shadow-xl shadow-indigo-100 dark:shadow-none"
                  >
                    <Check size={24} strokeWidth={3} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-40 text-center bg-white dark:bg-slate-900 rounded-[3rem] border border-dashed border-gray-200 dark:border-slate-800">
           <FileCheck className="mx-auto text-gray-200 dark:text-slate-800 mb-6" size={64} />
           <p className="text-gray-400 dark:text-slate-500 font-black text-lg">해당 조건의 포스터가 없습니다.</p>
           <p className="text-gray-300 dark:text-slate-600 text-sm mt-1">모든 검수가 완료되었거나 데이터가 비어있습니다. ✨</p>
        </div>
      )}
    </div>
  );
}
