"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { AlertCircle, CheckCircle2, EyeOff, MessageSquare, AlertTriangle, Loader2 } from "lucide-react";

export default function AdminReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("comment_reports")
      .select(`
        *,
        comments (
          id,
          body,
          status,
          user_id,
          profiles (nickname)
        ),
        reporter:profiles!comment_reports_reporter_id_fkey (nickname)
      `)
      .eq("status", "received")
      .order("created_at", { ascending: true });

    if (data) setReports(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleAction = async (reportId: string, commentId: string, action: 'hide' | 'dismiss') => {
    if (!confirm(action === 'hide' ? "해당 댓글을 숨김 처리하시겠습니까?" : "신고를 기각하시겠습니까?")) return;

    if (action === 'hide') {
      await supabase.from("comments").update({ status: 'hidden' }).eq("id", commentId);
    }

    const { error } = await supabase
      .from("comment_reports")
      .update({ 
        status: 'actioned',
        handled_at: new Date().toISOString()
      })
      .eq("id", reportId);

    if (error) alert(error.message);
    else {
      alert(action === 'hide' ? "댓글 숨김 및 신고 처리 완료" : "신고 기각 완료");
      fetchReports();
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-20">
      <div className="mb-10">
        <h1 className="text-4xl font-black text-gray-900 dark:text-white italic tracking-tight">Report Center 🚨</h1>
        <p className="text-gray-400 dark:text-slate-500 font-bold mt-2">사용자로부터 접수된 부적절한 댓글 신고를 검토합니다.</p>
      </div>

      {loading ? (
        <div className="space-y-6">
          {[1, 2].map(i => (
            <div key={i} className="h-48 bg-white dark:bg-slate-900 rounded-[2.5rem] animate-pulse border border-gray-100 dark:border-slate-800" />
          ))}
        </div>
      ) : reports.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {reports.map((report) => (
            <div key={report.id} className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-slate-800 flex flex-col md:flex-row justify-between gap-8 transition-all hover:shadow-md dark:hover:shadow-rose-900/5">
              {/* 신고 상세 */}
              <div className="flex-1 space-y-5">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-[11px] font-black rounded-lg uppercase tracking-wider border border-rose-100 dark:border-rose-900/30">
                    REASON: {report.reason_code}
                  </span>
                  <span className="text-[11px] font-bold text-gray-400 dark:text-slate-500 italic">
                    {new Date(report.created_at).toLocaleString()} 에 접수됨
                  </span>
                </div>
                
                <div className="bg-gray-50 dark:bg-slate-800/50 p-6 rounded-[2rem] border border-gray-100 dark:border-slate-700/50 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <MessageSquare size={80} />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-3 text-[11px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest">
                      <MessageSquare size={14} /> 신고 대상 댓글 <span className="text-gray-300 dark:text-slate-600">|</span> <span className="text-gray-500">@{report.comments?.profiles?.nickname}</span>
                    </div>
                    <p className="text-base font-bold text-gray-700 dark:text-slate-200 leading-relaxed italic">
                      "{report.comments?.body}"
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-4 bg-orange-50/30 dark:bg-orange-900/10 rounded-2xl border border-orange-100/50 dark:border-orange-900/20">
                  <AlertCircle size={16} className="text-orange-500 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-black text-orange-600 uppercase mb-1">Reporter Note</p>
                    <p className="text-sm font-bold text-gray-600 dark:text-slate-400">{report.reason_detail || "추가 상세 사유 없음"}</p>
                    <p className="text-[10px] text-gray-400 mt-1 italic">Reporter: {report.reporter?.nickname}</p>
                  </div>
                </div>
              </div>

              {/* 관리 액션 */}
              <div className="w-full md:w-56 flex flex-row md:flex-col gap-3 justify-center pt-2">
                <button 
                  onClick={() => handleAction(report.id, report.comment_id, 'hide')}
                  className="flex-1 md:flex-none px-6 py-5 bg-gray-900 dark:bg-slate-100 text-white dark:text-slate-900 font-black rounded-2xl text-sm flex items-center justify-center gap-2 hover:bg-black dark:hover:bg-white transition-all shadow-lg shadow-gray-200 dark:shadow-none"
                >
                  <EyeOff size={18} /> 댓글 숨김
                </button>
                <button 
                  onClick={() => handleAction(report.id, report.comment_id, 'dismiss')}
                  className="flex-1 md:flex-none px-6 py-5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500 font-black rounded-2xl text-sm flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
                >
                  <CheckCircle2 size={18} /> 신고 기각
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-40 text-center bg-white dark:bg-slate-900 rounded-[3rem] border border-dashed border-gray-200 dark:border-slate-800">
           <CheckCircle2 className="mx-auto text-green-100 dark:text-green-900/20 mb-6" size={64} />
           <p className="text-gray-400 dark:text-slate-500 font-black text-lg">처리 대기 중인 신고 내역이 없습니다.</p>
           <p className="text-gray-300 dark:text-slate-600 text-sm mt-1">커뮤니티가 아주 깨끗합니다! ✨</p>
        </div>
      )}
    </div>
  );
}
