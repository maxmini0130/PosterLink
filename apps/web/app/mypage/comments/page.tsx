"use client";
import toast from "react-hot-toast";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Header } from "../../components/Header";
import { BottomNav } from "../../components/BottomNav";
import { MessageSquare, Trash2, ChevronLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type CommentFilter = "all" | "question" | "review";

const COMMENT_META: Record<"question" | "review", { label: string; badgeClass: string }> = {
  question: { label: "질문", badgeClass: "bg-blue-50 text-blue-600" },
  review: { label: "후기", badgeClass: "bg-emerald-50 text-emerald-600" },
};

export default function MyCommentsPage() {
  const [comments, setComments] = useState<any[]>([]);
  const [filter, setFilter] = useState<CommentFilter>("all");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchMyComments = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) { router.push("/login"); return; }

    const { data } = await supabase
      .from("comments")
      .select(`
        *,
        posters (id, title)
      `)
      .eq("user_id", user.id)
      .eq("status", "normal")
      .order("created_at", { ascending: false });

    if (data) setComments(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchMyComments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("댓글을 삭제하시겠습니까?")) return;
    const { error } = await supabase.from("comments").update({ status: 'deleted' }).eq("id", id);
    if (error) toast.error(error.message);
    else fetchMyComments();
  };

  const normalizedComments = comments.map((comment) => ({
    ...comment,
    comment_type: comment.comment_type === "review" ? "review" : "question",
  }));
  const filteredComments = filter === "all"
    ? normalizedComments
    : normalizedComments.filter((comment) => comment.comment_type === filter);
  const questionCount = normalizedComments.filter((comment) => comment.comment_type === "question").length;
  const reviewCount = normalizedComments.filter((comment) => comment.comment_type === "review").length;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => router.back()} className="p-2 hover:bg-white rounded-full transition-all">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-2xl font-black text-gray-900">내 댓글 관리 💬</h1>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-2 rounded-2xl bg-white p-1.5 shadow-sm">
          {[
            { key: "all", label: `전체 ${normalizedComments.length}` },
            { key: "question", label: `질문 ${questionCount}` },
            { key: "review", label: `후기 ${reviewCount}` },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key as CommentFilter)}
              className={`rounded-xl px-3 py-3 text-sm font-black transition-all ${
                filter === item.key
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-400 hover:bg-gray-50 hover:text-gray-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-32 bg-white rounded-[2rem] animate-pulse shadow-sm" />)}
          </div>
        ) : filteredComments.length > 0 ? (
          <div className="space-y-4">
            {filteredComments.map((comment) => (
              <div key={comment.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${COMMENT_META[comment.comment_type as "question" | "review"].badgeClass}`}>
                        {COMMENT_META[comment.comment_type as "question" | "review"].label}
                      </span>
                      <span className="text-[11px] font-bold text-gray-400">{new Date(comment.created_at).toLocaleDateString()}</span>
                    </div>
                    <Link href={`/posters/${comment.posters?.id}`} className="text-sm font-black text-gray-900 hover:text-blue-600 transition-colors line-clamp-1 flex items-center gap-1">
                      {comment.posters?.title} <ExternalLink size={12} />
                    </Link>
                  </div>
                  <button 
                    onClick={() => handleDelete(comment.id)}
                    className="p-3 bg-gray-50 text-gray-300 hover:bg-rose-50 hover:text-rose-500 rounded-2xl transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                
                <p className="text-sm font-medium text-gray-600 leading-relaxed bg-gray-50/50 p-4 rounded-2xl border border-gray-50">
                  {comment.body}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-40 text-center bg-white rounded-[3rem] border border-dashed border-gray-200">
             <MessageSquare className="mx-auto text-gray-100 mb-4" size={48} />
             <p className="text-gray-400 font-bold">아직 작성한 {filter === "review" ? "후기" : filter === "question" ? "질문" : "댓글"}이 없습니다.</p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
