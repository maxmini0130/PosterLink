"use client";
import toast from "react-hot-toast";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { fetchProfileMap } from "../../lib/posterHelpers";
import { ReportModal } from "./ReportModal";
import { MessageSquare, Send, AlertTriangle, Trash2, ChevronDown } from "lucide-react";

const PAGE_SIZE = 5;
type CommentType = "question" | "review";

const COMMENT_TYPE_META: Record<CommentType, { label: string; placeholder: string; empty: string; badgeClass: string }> = {
  question: {
    label: "질문",
    placeholder: "공고에 대해 궁금한 점을 질문으로 남겨주세요.",
    empty: "첫 번째 질문을 남겨보세요.",
    badgeClass: "bg-blue-50 text-blue-600",
  },
  review: {
    label: "후기",
    placeholder: "신청 경험, 참여 후기, 도움이 된 점을 후기로 남겨주세요.",
    empty: "첫 번째 후기를 남겨보세요.",
    badgeClass: "bg-emerald-50 text-emerald-600",
  },
};

interface CommentSectionProps {
  posterId: string;
}

export function CommentSection({ posterId }: CommentSectionProps) {
  const [comments, setComments] = useState<any[]>([]);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [newComment, setNewComment] = useState("");
  const [selectedType, setSelectedType] = useState<CommentType>("question");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  const fetchComments = async () => {
    const { data } = await supabase
      .from("comments")
      .select("*")
      .eq("poster_id", posterId)
      .in("status", ["normal"])
      .order("created_at", { ascending: false });

    if (!data || data.length === 0) { setComments([]); return; }

    const profileMap = await fetchProfileMap(data.map((c: any) => c.user_id));
    setComments(data.map((c: any) => ({ ...c, profiles: profileMap[c.user_id] ?? null })));
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    fetchComments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posterId]);

  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [selectedType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return void toast.error("로그인이 필요합니다.");
    if (!newComment.trim()) return;
    if (newComment.trim().length > 500) return void toast.error("댓글은 500자 이내로 작성해주세요.");

    setLoading(true);
    const { error } = await supabase.from("comments").insert({
      poster_id: posterId,
      user_id: user.id,
      body: newComment,
      comment_type: selectedType
    });

    if (error) toast.error(error.message);
    else {
      setNewComment("");
      fetchComments();
    }
    setLoading(false);
  };

  const handleReport = async (reasonCode: string, reasonDetail: string) => {
    if (!reportingCommentId) return;
    if (!user) {
      setReportingCommentId(null);
      toast.error("로그인이 필요합니다.");
      return;
    }

    const { data: existingReport, error: existingReportError } = await supabase
      .from("comment_reports")
      .select("id")
      .eq("comment_id", reportingCommentId)
      .eq("reporter_user_id", user.id)
      .maybeSingle();

    if (!existingReportError && existingReport) {
      setReportingCommentId(null);
      toast("이미 신고가 접수된 댓글입니다.", { icon: "ℹ️" });
      return;
    }

    const { error } = await supabase.from("comment_reports").insert({
      comment_id: reportingCommentId,
      reporter_user_id: user.id,
      reason_code: reasonCode,
      reason_detail: reasonDetail
    });
    setReportingCommentId(null);
    if (error) {
      if (error.code === "23505") {
        toast("이미 신고가 접수된 댓글입니다.", { icon: "ℹ️" });
      } else {
        toast.error(error.message);
      }
    }
    else toast.success("신고가 접수되었습니다.");
  };

  const handleDelete = async (commentId: string) => {
    const { error } = await supabase.from("comments").update({ status: 'deleted' }).eq("id", commentId);
    setDeletingCommentId(null);
    if (error) toast.error(error.message);
    else fetchComments();
  };

  const normalizedComments = comments.map((comment) => ({
    ...comment,
    comment_type: comment.comment_type === "review" ? "review" : "question",
  }));
  const questionCount = normalizedComments.filter((comment) => comment.comment_type === "question").length;
  const reviewCount = normalizedComments.filter((comment) => comment.comment_type === "review").length;
  const filteredComments = normalizedComments.filter((comment) => comment.comment_type === selectedType);
  const selectedMeta = COMMENT_TYPE_META[selectedType];

  return (
    <>
    {reportingCommentId && (
      <ReportModal
        title="댓글 신고"
        onSubmit={handleReport}
        onClose={() => setReportingCommentId(null)}
      />
    )}
    <section className="mt-12 border-t border-gray-100 pt-10">
      <div className="flex items-center gap-2 mb-6">
        <MessageSquare className="text-blue-600" size={22} />
        <h2 className="text-xl font-black text-gray-900">질문과 후기</h2>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-gray-50 p-1.5">
        {(["question", "review"] as CommentType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setSelectedType(type)}
            className={`rounded-xl px-4 py-3 text-sm font-black transition-all ${
              selectedType === type
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-400 hover:text-gray-700"
            }`}
          >
            {COMMENT_TYPE_META[type].label} {type === "question" ? questionCount : reviewCount}
          </button>
        ))}
      </div>

      {/* 삭제 확인 인라인 모달 */}
      {deletingCommentId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-[2rem] p-7 w-full max-w-xs shadow-2xl">
            <p className="text-base font-black text-gray-900 mb-2">댓글 삭제</p>
            <p className="text-sm text-gray-500 font-bold mb-6">이 댓글을 삭제하시겠습니까?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingCommentId(null)} className="flex-1 py-3 border border-gray-200 text-gray-500 font-black rounded-2xl hover:bg-gray-50">취소</button>
              <button onClick={() => handleDelete(deletingCommentId)} className="flex-1 py-3 bg-rose-500 text-white font-black rounded-2xl hover:bg-rose-600">삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 댓글 작성 폼 */}
      <form onSubmit={handleSubmit} className="mb-10 relative">
        <div className="mb-3 flex flex-wrap gap-2">
          {(["question", "review"] as CommentType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              className={`rounded-2xl px-4 py-2 text-xs font-black transition-colors ${
                selectedType === type
                  ? COMMENT_TYPE_META[type].badgeClass
                  : "bg-gray-50 text-gray-400 hover:bg-gray-100"
              }`}
            >
              {COMMENT_TYPE_META[type].label}로 작성
            </button>
          ))}
        </div>
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={user ? selectedMeta.placeholder : "로그인 후 작성할 수 있습니다."}
          disabled={!user || loading}
          className="w-full p-5 bg-gray-50 border-none rounded-3xl text-sm font-bold text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-blue-100 outline-none resize-none min-h-[120px]"
        />
        <button
          disabled={!user || loading || !newComment.trim()}
          className="absolute bottom-4 right-4 p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100 disabled:bg-gray-200 transition-all hover:bg-blue-700"
        >
          <Send size={18} />
        </button>
      </form>

      {/* 댓글 리스트 */}
      <div className="space-y-6">
        {filteredComments.slice(0, displayCount).map((comment) => (
          <div key={comment.id} className="group relative bg-white p-6 rounded-[2rem] border border-gray-50 hover:border-blue-50 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 text-[10px] font-black rounded-lg ${COMMENT_TYPE_META[comment.comment_type as CommentType].badgeClass}`}>
                  {COMMENT_TYPE_META[comment.comment_type as CommentType].label}
                </span>
                <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 text-[10px] font-black uppercase">
                  {comment.profiles?.nickname?.charAt(0) || 'U'}
                </div>
                <span className="text-sm font-black text-gray-900">{comment.profiles?.nickname || '익명'}</span>
                {comment.is_official && (
                  <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[9px] font-black rounded-md uppercase tracking-tighter">OFFICIAL</span>
                )}
                <span className="text-[11px] font-bold text-gray-300">
                  {new Date(comment.created_at).toLocaleDateString()}
                </span>
              </div>
              
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {user?.id === comment.user_id ? (
                  <button onClick={() => setDeletingCommentId(comment.id)} className="p-2 text-gray-300 hover:text-rose-500 transition-colors">
                    <Trash2 size={16} />
                  </button>
                ) : (
                  <button onClick={() => user ? setReportingCommentId(comment.id) : toast.error("로그인이 필요합니다.")} className="p-2 text-gray-300 hover:text-orange-500 transition-colors">
                    <AlertTriangle size={16} />
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm font-medium text-gray-700 leading-relaxed pl-1">
              {comment.body}
            </p>
          </div>
        ))}

        {filteredComments.length === 0 && (
          <div className="py-20 text-center bg-gray-50/50 rounded-[3rem] border border-dashed border-gray-200">
            <p className="text-sm text-gray-400 font-bold">{selectedMeta.empty}</p>
          </div>
        )}

        {filteredComments.length > displayCount && (
          <button
            onClick={() => setDisplayCount(prev => prev + PAGE_SIZE)}
            className="w-full py-4 border border-gray-100 rounded-2xl text-sm font-black text-gray-400 hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
          >
            <ChevronDown size={16} /> {selectedMeta.label} 더보기 ({filteredComments.length - displayCount}개 남음)
          </button>
        )}
      </div>
    </section>
    </>
  );
}
