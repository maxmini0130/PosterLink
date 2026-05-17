"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { fetchProfileMap } from "../../lib/posterHelpers";
import { AlertCircle, CheckCircle2, EyeOff, MessageSquare } from "lucide-react";
import toast from "react-hot-toast";

type PendingAction = { reportId: string; commentId: string; action: 'hide' | 'dismiss' };
type ReportFilter = "all" | "question" | "review";

const COMMENT_META: Record<"question" | "review", { label: string; badgeClass: string }> = {
  question: { label: "질문", badgeClass: "bg-blue-50 text-blue-600 border-blue-100" },
  review: { label: "후기", badgeClass: "bg-emerald-50 text-emerald-600 border-emerald-100" },
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actioning, setActioning] = useState(false);
  const [filter, setFilter] = useState<ReportFilter>("all");

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
      .from("comments").select("id, body, status, user_id, comment_type").in("id", commentIds);

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

  const normalizedReports = reports.map((report) => ({
    ...report,
    comment: {
      ...report.comment,
      comment_type: report.comment?.comment_type === "review" ? "review" : "question",
    },
  }));
  const questionCount = normalizedReports.filter((report) => report.comment?.comment_type === "question").length;
  const reviewCount = normalizedReports.filter((report) => report.comment?.comment_type === "review").length;
  const filteredReports = filter === "all"
    ? normalizedReports
    : normalizedReports.filter((report) => report.comment?.comment_type === filter);

  useEffect(() => { fetchReports(); }, []);

  const handleAction = async ({ reportId, commentId, action }: PendingAction) => {
    setActioning(true);
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

    if (!error) {
      await supabase.from("admin_actions").insert({
        actor_user_id: user?.id ?? null,
        target_type: "report",
        target_id: reportId,
        action_type: action === "hide" ? "hide" : "dismiss",
        metadata_json: {
          commentId,
          reportStatus: action === "hide" ? "actioned" : "dismissed",
          moderationAction: action,
        },
      });
    }

    setActioning(false);
    setPendingAction(null);

    if (error) toast.error(error.message);
    else {
      toast.success(action === 'hide' ? "댓글 숨김 및 신고 처리 완료" : "신고 기각 완료");
      fetchReports();
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-20">
      <div className="mb-10">
        <h1 className="text-4xl font-black text-gray-900 dark:text-white italic tracking-tight">Report Center 🚨</h1>
        <p className="text-gray-400 dark:text-slate-500 font-bold mt-2">사용자로부터 접수된 부적절한 질문/후기 신고를 검토합니다.</p>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-2 rounded-2xl bg-white p-1.5 shadow-sm dark:bg-slate-900">
        {[
          { key: "all", label: `전체 ${normalizedReports.length}` },
          { key: "question", label: `질문 ${questionCount}` },
          { key: "review", label: `후기 ${reviewCount}` },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key as ReportFilter)}
            className={`rounded-xl px-3 py-3 text-sm font-black transition-all ${
              filter === item.key
                ? "bg-gray-900 text-white shadow-sm"
                : "text-gray-400 hover:bg-gray-50 hover:text-gray-700 dark:hover:bg-slate-800"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-6">
          {[1, 2].map(i => (
            <div key={i} className="h-48 bg-white dark:bg-slate-900 rounded-[2.5rem] animate-pulse border border-gray-100 dark:border-slate-800" />
          ))}
        </div>
      ) : filteredReports.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {filteredReports.map((report) => (
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
                    <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px] font-black text-indigo-500 uppercase tracking-widest">
                      <MessageSquare size={14} /> 신고 대상
                      <span className={`rounded-lg border px-2 py-0.5 ${COMMENT_META[report.comment?.comment_type as "question" | "review"].badgeClass}`}>
                        {COMMENT_META[report.comment?.comment_type as "question" | "review"].label}
                      </span>
                      <span className="text-gray-300">|</span>
                      <span className="text-gray-500">@{report.comment?.authorNickname}</span>
                    </div>
                    <p className="text-base font-bold text-gray-700 dark:text-slate-200 leading-relaxed italic">
                      &ldquo;{report.comment?.body}&rdquo;
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
                  onClick={() => setPendingAction({ reportId: report.id, commentId: report.comment_id, action: 'hide' })}
                  className="flex-1 md:flex-none px-6 py-5 bg-gray-900 text-white font-black rounded-2xl text-sm flex items-center justify-center gap-2 hover:bg-black transition-all shadow-lg shadow-gray-200"
                >
                  <EyeOff size={18} /> 댓글 숨김
                </button>
                <button
                  onClick={() => setPendingAction({ reportId: report.id, commentId: report.comment_id, action: 'dismiss' })}
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
          <p className="text-gray-400 font-black text-lg">처리 대기 중인 {filter === "review" ? "후기" : filter === "question" ? "질문" : "신고 내역"}이 없습니다.</p>
          <p className="text-gray-300 text-sm mt-1">커뮤니티가 잘 관리되고 있습니다.</p>
        </div>
      )}

      {/* 확인 모달 */}
      {pendingAction && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-black text-gray-900 mb-2">
              {pendingAction.action === 'hide' ? '질문/후기 숨김 처리' : '신고 기각'}
            </h3>
            <p className="text-sm text-gray-500 font-bold mb-8">
              {pendingAction.action === 'hide'
                ? '해당 질문/후기를 숨김 처리하시겠습니까? 작성자에게는 표시되지 않습니다.'
                : '이 신고를 기각하시겠습니까? 질문/후기는 그대로 유지됩니다.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingAction(null)}
                disabled={actioning}
                className="flex-1 py-4 border border-gray-200 text-gray-500 font-black rounded-2xl hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={() => handleAction(pendingAction)}
                disabled={actioning}
                className={`flex-1 py-4 font-black rounded-2xl transition-all disabled:opacity-50 ${pendingAction.action === 'hide' ? 'bg-gray-900 text-white hover:bg-black' : 'bg-rose-500 text-white hover:bg-rose-600'}`}
              >
                {actioning ? '처리 중...' : pendingAction.action === 'hide' ? '숨김 처리' : '기각'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
