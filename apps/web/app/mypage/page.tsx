"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import Link from "next/link";
import { User, MessageSquare, Heart, Bell, LogOut, ChevronRight, MapPin, Calendar, Trash2, Star, PlusCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function MyPage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [togglingNotif, setTogglingNotif] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) {
        router.push("/login");
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("*, regions(name)")
        .eq("id", user.id)
        .single();
      
      if (data) setProfile(data);
      setLoading(false);
    };

    fetchProfile();
  }, [router]);

  const handleToggleNotification = async () => {
    if (!profile || togglingNotif) return;
    setTogglingNotif(true);
    const next = !profile.is_notified;
    const { error } = await supabase
      .from("profiles")
      .update({ is_notified: next })
      .eq("id", profile.id);
    if (error) {
      toast.error("알림 설정 변경에 실패했습니다.");
    } else {
      setProfile((p: any) => ({ ...p, is_notified: next }));
      toast.success(next ? "알림을 켰습니다" : "알림을 껐습니다");
    }
    setTogglingNotif(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "탈퇴") return;
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/delete-account", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      await supabase.auth.signOut();
      toast.success("계정이 삭제되었습니다.");
      router.push("/");
    } catch (err: any) {
      toast.error(err.message ?? "탈퇴 처리 중 오류가 발생했습니다.");
      setDeleting(false);
    }
  };

  if (loading) return <div className="p-10 text-center animate-pulse">마이페이지 로딩 중...</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        {/* User Profile Summary */}
        <section className="bg-white p-8 rounded-[2.5rem] shadow-sm mb-6 border border-gray-100 flex flex-col items-center text-center">
          <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-4 border-4 border-white shadow-md">
            <User size={40} strokeWidth={2.5} />
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-1">{profile?.nickname || '닉네임 없음'}</h2>
          <div className="flex gap-2 mb-4 flex-wrap justify-center">
            <span className="text-[11px] font-bold text-gray-400 bg-gray-50 px-2.5 py-1 rounded-lg flex items-center gap-1">
              <MapPin size={12} /> {profile?.regions?.name || '지역 미설정'}
            </span>
            <span className="text-[11px] font-bold text-gray-400 bg-gray-50 px-2.5 py-1 rounded-lg flex items-center gap-1">
              <Calendar size={12} /> {profile?.age_band?.replace('s', '대') || '연령 미설정'}
            </span>
          </div>
          {/* 포인트 */}
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 px-4 py-2 rounded-2xl mb-6">
            <Star size={15} className="text-amber-500" fill="currentColor" />
            <span className="text-sm font-black text-amber-700">{(profile?.points ?? 0).toLocaleString()} P</span>
            <span className="text-xs text-amber-500 font-bold">보유 포인트</span>
          </div>
          
          <Link 
            href="/mypage/edit"
            className="px-6 py-3 bg-gray-900 text-white text-sm font-black rounded-2xl hover:bg-black transition-all shadow-lg shadow-gray-200"
          >
            프로필 수정하기
          </Link>
        </section>

        {/* Menu Grid */}
        <div className="grid grid-cols-1 gap-3">
          <Link href="/favorites" className="flex items-center justify-between p-6 bg-white rounded-3xl border border-gray-100 hover:border-blue-100 transition-all group shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Heart size={22} fill="currentColor" />
              </div>
              <span className="font-black text-gray-700">내가 찜한 포스터</span>
            </div>
            <ChevronRight className="text-gray-200 group-hover:text-blue-600 transition-colors" />
          </Link>

          <Link href="/posters/request" className="flex items-center justify-between p-6 bg-white rounded-3xl border border-gray-100 hover:border-indigo-100 transition-all group shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <PlusCircle size={22} />
              </div>
              <span className="font-black text-gray-700">포스터 등록 요청하기</span>
            </div>
            <ChevronRight className="text-gray-200 group-hover:text-indigo-600 transition-colors" />
          </Link>

          <Link href="/mypage/comments" className="flex items-center justify-between p-6 bg-white rounded-3xl border border-gray-100 hover:border-blue-100 transition-all group shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <MessageSquare size={22} />
              </div>
              <span className="font-black text-gray-700">내가 쓴 댓글 관리</span>
            </div>
            <ChevronRight className="text-gray-200 group-hover:text-blue-600 transition-colors" />
          </Link>

          {/* 알림 설정 토글 */}
          <button
            onClick={handleToggleNotification}
            disabled={togglingNotif}
            className="flex items-center justify-between p-6 bg-white rounded-3xl border border-gray-100 hover:border-blue-100 transition-all group shadow-sm disabled:opacity-60"
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${profile?.is_notified ? "bg-amber-50 text-amber-500" : "bg-gray-50 text-gray-300"}`}>
                <Bell size={22} fill={profile?.is_notified ? "currentColor" : "none"} />
              </div>
              <div className="text-left">
                <p className="font-black text-gray-700">새 포스터 알림</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {profile?.is_notified ? "알림 켜짐 — 탭하면 끄기" : "알림 꺼짐 — 탭하면 켜기"}
                </p>
              </div>
            </div>
            <div className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 ${profile?.is_notified ? "bg-primary" : "bg-gray-200"}`}>
              <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${profile?.is_notified ? "translate-x-6" : "translate-x-0"}`} />
            </div>
          </button>

          <div className="p-2"></div>

          <button
            onClick={handleLogout}
            className="flex items-center justify-between p-6 bg-white rounded-3xl border border-gray-100 hover:bg-rose-50 transition-all group shadow-sm"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-50 text-gray-400 rounded-2xl flex items-center justify-center group-hover:bg-rose-100 group-hover:text-rose-500 transition-all">
                <LogOut size={22} />
              </div>
              <span className="font-black text-gray-400 group-hover:text-rose-500 transition-colors">로그아웃</span>
            </div>
          </button>

          <button
            onClick={() => { setDeleteConfirm(""); setShowDeleteModal(true); }}
            className="flex items-center justify-between p-6 bg-white rounded-3xl border border-gray-100 hover:bg-red-50 transition-all group shadow-sm"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-50 text-gray-300 rounded-2xl flex items-center justify-center group-hover:bg-red-100 group-hover:text-red-400 transition-all">
                <Trash2 size={22} />
              </div>
              <span className="font-black text-gray-300 group-hover:text-red-400 transition-colors">회원 탈퇴</span>
            </div>
          </button>
        </div>
      </main>

      <BottomNav />

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-2xl flex items-center justify-center">
                <Trash2 size={20} className="text-red-500" />
              </div>
              <h3 className="text-lg font-black text-gray-900">회원 탈퇴</h3>
            </div>
            <p className="text-sm text-gray-500 font-bold mb-2">
              탈퇴 시 모든 데이터(찜, 댓글, 알림)가 <span className="text-red-500">영구 삭제</span>되며 복구할 수 없습니다.
            </p>
            <p className="text-sm text-gray-400 mb-6">
              계속하려면 아래 입력창에 <strong className="text-gray-700">탈퇴</strong>를 입력하세요.
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="탈퇴"
              className="w-full p-4 bg-gray-50 rounded-2xl font-bold text-gray-900 outline-none border-2 border-transparent focus:border-red-200 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 py-4 border border-gray-200 text-gray-500 font-black rounded-2xl hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== "탈퇴" || deleting}
                className="flex-1 py-4 bg-red-500 text-white font-black rounded-2xl hover:bg-red-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {deleting ? "처리 중..." : "탈퇴하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
