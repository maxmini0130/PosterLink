"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { MessageSquare, Send, AlertTriangle, MoreVertical, Trash2 } from "lucide-react";

interface CommentSectionProps {
  posterId: string;
}

export function CommentSection({ posterId }: CommentSectionProps) {
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from("comments")
      .select("*")
      .eq("poster_id", posterId)
      .in("status", ["normal"])
      .order("created_at", { ascending: false });

    if (data) setComments(data);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    fetchComments();
  }, [posterId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return alert("로그인이 필요합니다.");
    if (!newComment.trim()) return;
    if (newComment.trim().length > 500) return alert("댓글은 500자 이내로 작성해주세요.");

    setLoading(true);
    const { error } = await supabase.from("comments").insert({
      poster_id: posterId,
      user_id: user.id,
      body: newComment,
      comment_type: 'general'
    });

    if (error) alert(error.message);
    else {
      setNewComment("");
      fetchComments();
    }
    setLoading(false);
  };

  const handleReport = async (commentId: string) => {
    const reason = prompt("신고 사유를 입력해주세요 (욕설, 허위정보, 광고 등)");
    if (!reason) return;

    const { error } = await supabase.from("comment_reports").insert({
      comment_id: commentId,
      reporter_id: user.id,
      reason_code: 'other',
      reason_detail: reason
    });

    if (error) alert(error.message);
    else alert("신고가 접수되었습니다.");
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm("댓글을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("comments").update({ status: 'deleted' }).eq("id", commentId);
    if (error) alert(error.message);
    else fetchComments();
  };

  return (
    <section className="mt-12 border-t border-gray-100 pt-10">
      <div className="flex items-center gap-2 mb-6">
        <MessageSquare className="text-blue-600" size={22} />
        <h2 className="text-xl font-black text-gray-900">질문/후기 ({comments.length})</h2>
      </div>

      {/* 댓글 작성 폼 */}
      <form onSubmit={handleSubmit} className="mb-10 relative">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={user ? "공고에 대해 궁금한 점이나 후기를 남겨주세요." : "로그인 후 댓글을 작성할 수 있습니다."}
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
        {comments.map((comment) => (
          <div key={comment.id} className="group relative bg-white p-6 rounded-[2rem] border border-gray-50 hover:border-blue-50 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 text-[10px] font-black uppercase">
                  U
                </div>
                <span className="text-sm font-black text-gray-900">사용자</span>
                {comment.is_official && (
                  <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[9px] font-black rounded-md uppercase tracking-tighter">OFFICIAL</span>
                )}
                <span className="text-[11px] font-bold text-gray-300">
                  {new Date(comment.created_at).toLocaleDateString()}
                </span>
              </div>
              
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {user?.id === comment.user_id ? (
                  <button onClick={() => handleDelete(comment.id)} className="p-2 text-gray-300 hover:text-rose-500 transition-colors">
                    <Trash2 size={16} />
                  </button>
                ) : (
                  <button onClick={() => handleReport(comment.id)} className="p-2 text-gray-300 hover:text-orange-500 transition-colors">
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

        {comments.length === 0 && (
          <div className="py-20 text-center bg-gray-50/50 rounded-[3rem] border border-dashed border-gray-200">
            <p className="text-sm text-gray-400 font-bold">첫 번째 질문이나 후기를 남겨보세요! 💬</p>
          </div>
        )}
      </div>
    </section>
  );
}
