"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { fetchProfileMap } from "../../lib/posterHelpers";
import { AlertCircle, CheckCircle2, EyeOff, MessageSquare } from "lucide-react";

export default function AdminReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("comment_reports")
      .select("*")
      .eq("report_status", "received")
      .order("created_at", { ascending: true });

    if (error || !data) { setLoading(false); return; }

    // 댓글 및 작성자 닉네임 별도 조회
    const commentIds = Array.from(new Set(data.map((r: any) => r.comment_id)));
    const { data: commentsData } = await supabase
      .from("comments").select("id, body, status, user_id").in("id", commentIds);

    const commentMap = Object.fromEntries((commentsData ?? []).map((c: any) => [c.id, c]));

    const allUserIds = [
      ...(commentsData ?? []).map((c: any) => c.user_id),
      ...data.map((r: any) => r.reporter_user_id),
    ];
    const profileMap = await fetchProfileMap(allUserIds);
    const authorMap = profileMap;
    const reporterMap = profileMap;

    setReports(data.map((r: any) => ({
      ...r,
      comment: {
        ...commentMap[r.comment_id],
        authorNickname: authorMap[commentMap[r.comment_id]?.user_id]?.nickname ?? '익명',
      },
      reporterNickname: reporterMap[r.reporter_user_id]?.nickname ?? '익명',
    })));
    setLoading(false);
  };

  useEffect(() => { fetchReports(); }, []);

  const handleAction = async (reportId: string, commentId: string, action: 'hide' | 'dismiss') => {
    if (!confirm(action === 'hide' ? "해당 댓글을 숨김 처리하시겠습니까?" : "신고를 기각하시겠습니까?")) return;

    const { data: { user } } = await supabase.auth.getUser();

    if (action === 'hide') {
      await supabase.from("comments").update({ status: 'hidden' }).eq("id", commentId);
    }

    const { error } = await supabase
      .from("comment_reports")
      .update({
        report_status: action === 'hide' ? 'actioned' : 'dismissed',
        handled_by: user?.id,
        handled_at: new Date().toISOString(),
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
            <div key={report.id} className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-slate-800 flex flex-col md:flex-row justify-between gap-8 transition-all hover:shadow-md">
              <div className="flex-1 space-y-5">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-rose-50 dark:bg-rose-900/20 text-rose-600 text-[11px] font-black rounded-lg uppercase tracking-wider border border-rose-100">
                    REASON: {report.reason_code}
                  </span>
                  <span className="text-[11px] font-bold text-gray-400 italic">
                    {new Date(report.created_at).toLocaleString()} 접수
                  </span>
                </div>

                <div className="bg-gray-50 dark:bg-slate-800/50 p-6 rounded-[2rem] border border-gray-100 dark:border-slate-700/50 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5"><MessageSquare size={80} /></div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-3 text-[11px] font-black text-indigo-500 uppercase tracking-widest">
                      <MessageSquare size={14} /> 신고 대상 댓글
                      <span className="text-gray-300">|</span>
                      <span className="text-gray-500">@{report.comment?.authorNickname}</span>
                    </div>
                    <p className="text-base font-bold text-gray-700 dark:text-slate-200 leading-relaxed italic">
                      "{report.comment?.body}"
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-4 bg-orange-50/30 rounded-2xl border border-orange-100/50">
                  <AlertCircle size={16} className="text-orange-500 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-black text-orange-600 uppercase mb-1">Reporter Note</p>
                    <p className="text-sm font-bold text-gray-600 dark:text-slate-400">{report.reason_detail || "추가 상세 사유 없음"}</p>
                    <p className="text-[10px] text-gray-400 mt-1 italic">Reporter: @{report.reporterNickname}</p>
                  </div>
                </div>
              </div>

              <div className="w-full md:w-56 flex flex-row md:flex-col gap-3 justify-center pt-2">
                <button
                  onClick={() => handleAction(report.id, report.comment_id, 'hide')}
                  className="flex-1 md:flex-none px-6 py-5 bg-gray-900 text-white font-black rounded-2xl text-sm flex items-center justify-center gap-2 hover:bg-black transition-all shadow-lg shadow-gray-200"
                >
                  <EyeOff size={18} /> 댓글 숨김
                </button>
                <button
                  onClick={() => handleAction(report.id, report.comment_id, 'dismiss')}
                  className="flex-1 md:flex-none px-6 py-5 bg-white border border-gray-200 text-gray-400 font-black rounded-2xl text-sm flex items-center justify-center gap-2 hover:bg-gray-50 transition-all"
                >
                  <CheckCircle2 size={18} /> 신고 기각
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-40 text-center bg-white dark:bg-slate-900 rounded-[3rem] border border-dashed border-gray-200 dark:border-slate-800">
          <CheckCircle2 className="mx-auto text-green-100 mb-6" size={64} />
          <p className="text-gray-400 font-black text-lg">처리 대기 중인 신고 내역이 없습니다.</p>
          <p className="text-gray-300 text-sm mt-1">커뮤니티가 아주 깨끗합니다! ✨</p>
        </div>
      )}
    </div>
  );
}
