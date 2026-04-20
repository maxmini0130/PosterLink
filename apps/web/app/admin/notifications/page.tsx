"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Bell, Send, Loader2, CheckCircle2, Inbox } from "lucide-react";

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // 시스템 공지 발송 폼
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const fetchNotifications = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("type", "system_notice")
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) setNotifications(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return alert("제목과 본문을 모두 입력해주세요.");
    if (!confirm("전체 사용자에게 시스템 공지를 발송하시겠습니까?")) return;

    setSending(true);
    try {
      // 모든 사용자 조회
      const { data: users, error: usersError } = await supabase
        .from("profiles")
        .select("id");

      if (usersError) throw usersError;
      if (!users || users.length === 0) {
        alert("발송 대상 사용자가 없습니다.");
        return;
      }

      const inserts = users.map((u: any) => ({
        user_id: u.id,
        type: "system_notice",
        title: title.trim(),
        body: body.trim(),
        target_type: "system",
      }));

      const { error } = await supabase.from("notifications").insert(inserts);
      if (error) throw error;

      alert(`${users.length}명에게 공지가 발송되었습니다.`);
      setTitle("");
      setBody("");
      fetchNotifications();
    } catch (err: any) {
      alert("발송 실패: " + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="mb-10">
        <h1 className="text-4xl font-black text-gray-900 dark:text-white italic tracking-tight">Notifications 📢</h1>
        <p className="text-gray-400 dark:text-slate-500 font-bold mt-2">전체 사용자에게 시스템 공지를 발송하고 이력을 확인합니다.</p>
      </div>

      {/* 공지 발송 폼 */}
      <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-gray-100 dark:border-slate-800 mb-10">
        <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
          <Send size={14} /> New System Notice
        </h3>
        <div className="space-y-4">
          <input
            type="text"
            placeholder="공지 제목 (예: 서비스 점검 안내)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-4 bg-gray-50 dark:bg-slate-800 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-100 text-gray-900 dark:text-white placeholder:text-gray-400"
          />
          <textarea
            placeholder="공지 내용을 입력하세요."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="w-full p-4 bg-gray-50 dark:bg-slate-800 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-100 text-gray-900 dark:text-white placeholder:text-gray-400 resize-none"
          />
          <button
            onClick={handleSend}
            disabled={sending || !title.trim() || !body.trim()}
            className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-lg shadow-indigo-100 dark:shadow-none hover:bg-indigo-700 transition-all disabled:bg-gray-200 disabled:text-gray-400 flex items-center justify-center gap-2"
          >
            {sending ? <Loader2 className="animate-spin" size={18} /> : <Bell size={18} />}
            {sending ? "발송 중..." : "전체 공지 발송"}
          </button>
        </div>
      </div>

      {/* 발송 이력 */}
      <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4 px-2">Recent Notices</h3>
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-white dark:bg-slate-900 rounded-[2rem] animate-pulse border border-gray-100 dark:border-slate-800" />
          ))}
        </div>
      ) : notifications.length > 0 ? (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div key={n.id} className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-gray-100 dark:border-slate-800 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between mb-2">
                <h4 className="text-sm font-black text-gray-900 dark:text-white">{n.title}</h4>
                <span className="text-[10px] font-bold text-gray-300 dark:text-slate-600 shrink-0 ml-4">
                  {new Date(n.created_at).toLocaleString()}
                </span>
              </div>
              <p className="text-xs font-medium text-gray-500 dark:text-slate-400 leading-relaxed">{n.body}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-32 text-center bg-white dark:bg-slate-900 rounded-[3rem] border border-dashed border-gray-200 dark:border-slate-800">
          <Inbox className="mx-auto text-gray-200 dark:text-slate-700 mb-4" size={48} />
          <p className="text-gray-400 dark:text-slate-500 font-bold">발송된 시스템 공지가 없습니다.</p>
        </div>
      )}
    </div>
  );
}
