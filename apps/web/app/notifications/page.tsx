"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { Bell, Clock, Calendar, CheckCircle2, ChevronRight, Inbox } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchNotifications = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    if (user) {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      
      if (data) setNotifications(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchNotifications();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllAsRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'favorite_deadline': return <Clock className="text-rose-500" size={20} />;
      case 'new_match': return <Bell className="text-blue-500" size={20} />;
      default: return <Bell className="text-gray-400" size={20} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center justify-between mb-8 px-2">
          <h1 className="text-2xl font-black text-gray-900">알림 센터 🔔</h1>
          {notifications.some(n => !n.is_read) && (
            <button onClick={markAllAsRead} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors">전체 읽음</button>
          )}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white rounded-[2rem] animate-pulse" />)}
          </div>
        ) : notifications.length > 0 ? (
          <div className="space-y-3">
            {notifications.map((notif) => (
              <div 
                key={notif.id}
                onClick={() => markAsRead(notif.id)}
                className={`bg-white p-6 rounded-[2rem] shadow-sm border transition-all flex items-start gap-4 cursor-pointer hover:shadow-md ${notif.is_read ? 'border-gray-50 opacity-60' : 'border-blue-100 ring-2 ring-blue-50'}`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${notif.is_read ? 'bg-gray-50' : 'bg-blue-50'}`}>
                  {getIcon(notif.type)}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className={`text-sm font-black ${notif.is_read ? 'text-gray-500' : 'text-gray-900'}`}>{notif.title}</h3>
                    <span className="text-[10px] font-bold text-gray-300">{new Date(notif.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs font-medium text-gray-500 leading-relaxed mb-3">{notif.body}</p>
                  
                  {notif.target_id && (
                    <Link 
                      href={`/posters/${notif.target_id}`}
                      className="inline-flex items-center gap-1.5 text-[10px] font-black text-blue-600 bg-blue-50/50 px-2.5 py-1 rounded-lg"
                    >
                      공고 확인하기 <ChevronRight size={10} />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-40 text-center bg-white rounded-[3rem] border border-dashed border-gray-200">
             <Inbox className="mx-auto text-gray-100 mb-4" size={48} />
             <p className="text-gray-400 font-bold">새로운 알림이 없습니다.</p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
