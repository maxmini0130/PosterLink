"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { AlertCircle, CheckCircle2, EyeOff, Trash2, MessageSquare, User } from "lucide-react";

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
      // 1. 댓글 상태를 hidden으로 변경
      await supabase.from("comments").update({ status: 'hidden' }).eq("id", commentId);
    }

    // 2. 신고 상태를 완료로 변경
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
    <div className="max-w-6xl mx-auto">
      <div className="mb-10">
        <h1 className="text-3xl font-black text-gray-900 italic">Report Center 🚨</h1>
        <p className="text-gray-400 font-bold mt-2">사용자로부터 접수된 부적절한 댓글 신고를 검토합니다.</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <div key={i} className="h-32 bg-white rounded-3xl animate-pulse" />)}
        </div>
      ) : reports.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {reports.map((report) => (
            <div key={report.id} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
              <div className="flex flex-col md:flex-row justify-between gap-6">
                {/* 신고 상세 */}
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-orange-50 text-orange-600 text-[11px] font-black rounded-lg uppercase">
                      Reason: {report.reason_code}
                    </span>
                    <span className="text-[11px] font-bold text-gray-300">
                      신고일: {new Date(report.created_at).toLocaleString()}
                    </span>
                  </div>
                  
                  <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                    <div className="flex items-center gap-2 mb-2 text-[11px] font-black text-gray-400">
                      <MessageSquare size={14} /> 신고 대상 댓글 (작성자: {report.comments?.profiles?.nickname})
                    </div>
                    <p className="text-sm font-medium text-gray-700">{report.comments?.body}</p>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                    <AlertCircle size={14} className="text-orange-400" />
                    상세 사유: {report.reason_detail || "내용 없음"}
                  </div>
                </div>

                {/* 관리 액션 */}
                <div className="flex flex-row md:flex-col gap-3 justify-center">
                  <button 
                    onClick={() => handleAction(report.id, report.comment_id, 'hide')}
                    className="flex-1 md:flex-none px-6 py-4 bg-gray-900 text-white font-black rounded-2xl text-sm flex items-center justify-center gap-2 hover:bg-black transition-all"
                  >
                    <EyeOff size={18} /> 댓글 숨김
                  </button>
                  <button 
                    onClick={() => handleAction(report.id, report.comment_id, 'dismiss')}
                    className="flex-1 md:flex-none px-6 py-4 bg-white border border-gray-100 text-gray-400 font-black rounded-2xl text-sm flex items-center justify-center gap-2 hover:bg-gray-50 transition-all"
                  >
                    <CheckCircle2 size={18} /> 기각
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-40 text-center bg-white rounded-[3rem] border border-dashed border-gray-200">
           <CheckCircle2 className="mx-auto text-green-100 mb-4" size={48} />
           <p className="text-gray-400 font-bold">현재 처리할 신고 내역이 없습니다. 깨끗한 서비스입니다! ✨</p>
        </div>
      )}
    </div>
  );
}
