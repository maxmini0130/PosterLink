"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, UserCog, ChevronUp, ChevronDown, User, Wrench, ShieldCheck } from "lucide-react";

type UserRole = "user" | "operator" | "admin" | "super_admin";

interface ManagedUser {
  id: string;
  nickname: string | null;
  email: string;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
}

const ROLE_TABS: { value: UserRole; label: string; color: string }[] = [
  { value: "user", label: "일반 사용자", color: "text-gray-500" },
  { value: "operator", label: "운영자", color: "text-emerald-500" },
  { value: "admin", label: "관리자", color: "text-indigo-500" },
  { value: "super_admin", label: "슈퍼 관리자", color: "text-violet-500" },
];

const ROLE_BADGE: Record<UserRole, string> = {
  user: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  operator: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  admin: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  super_admin: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<UserRole>("user");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);

  // super_admin 확인
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (data?.role !== "super_admin") {
        toast.error("슈퍼 관리자 권한이 필요합니다.");
        router.push("/admin");
      } else {
        setIsSuperAdmin(true);
      }
    })();
  }, [router]);

  // 탭 변경 시 유저 목록 로드
  useEffect(() => {
    if (!isSuperAdmin) return;
    setLoading(true);
    fetch(`/api/admin/users?role=${activeTab}`)
      .then((r) => r.json())
      .then((data) => setUsers(data.users ?? []))
      .finally(() => setLoading(false));
  }, [activeTab, isSuperAdmin]);

  const changeRole = async (userId: string, newRole: UserRole) => {
    setChangingId(userId);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "역할 변경 실패");
    } else {
      toast.success(`역할이 ${newRole}(으)로 변경되었습니다.`);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    }
    setChangingId(null);
  };

  if (isSuperAdmin === null) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="animate-spin text-indigo-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl">
          <UserCog size={24} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">사용자 권한 관리</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">역할을 선택해 승격/강등할 수 있습니다.</p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-slate-800">
        {ROLE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-5 py-3 text-sm font-black transition-all border-b-2 -mb-px ${
              activeTab === tab.value
                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                : "border-transparent text-gray-400 hover:text-gray-700 dark:hover:text-slate-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 유저 목록 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-indigo-400" size={28} />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-slate-500 text-sm font-bold">
          해당 역할의 사용자가 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-4 bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-100 dark:border-slate-800 shadow-sm"
            >
              {/* 아바타 */}
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0 overflow-hidden">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User size={18} className="text-indigo-400" />
                )}
              </div>

              {/* 정보 */}
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm text-gray-900 dark:text-white truncate">
                  {u.nickname ?? "이름 없음"}
                </p>
                <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{u.email}</p>
              </div>

              {/* 역할 뱃지 */}
              <span className={`text-xs font-black px-3 py-1 rounded-full shrink-0 ${ROLE_BADGE[u.role]}`}>
                {u.role}
              </span>

              {/* 가입일 */}
              <span className="text-xs text-gray-400 dark:text-slate-500 shrink-0 hidden sm:block">
                {new Date(u.created_at).toLocaleDateString("ko-KR")}
              </span>

              {/* 액션 버튼 */}
              <div className="flex gap-2 shrink-0">
                {changingId === u.id ? (
                  <Loader2 size={18} className="animate-spin text-indigo-400" />
                ) : (
                  <>
                    {/* 승격 */}
                    {activeTab === "user" && (
                      <button
                        onClick={() => changeRole(u.id, "operator")}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-black hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                      >
                        <Wrench size={13} />
                        운영자로
                      </button>
                    )}
                    {activeTab === "user" && (
                      <button
                        onClick={() => changeRole(u.id, "admin")}
                        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-black hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                      >
                        <ShieldCheck size={13} />
                        관리자로
                      </button>
                    )}
                    {activeTab === "operator" && (
                      <button
                        onClick={() => changeRole(u.id, "admin")}
                        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-black hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                      >
                        <ChevronUp size={13} />
                        관리자로 승격
                      </button>
                    )}
                    {activeTab === "operator" && (
                      <button
                        onClick={() => changeRole(u.id, "user")}
                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 rounded-xl text-xs font-black hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <ChevronDown size={13} />
                        사용자로 강등
                      </button>
                    )}
                    {activeTab === "admin" && (
                      <button
                        onClick={() => changeRole(u.id, "operator")}
                        className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-black hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
                      >
                        <ChevronDown size={13} />
                        운영자로 강등
                      </button>
                    )}
                    {activeTab === "admin" && (
                      <button
                        onClick={() => changeRole(u.id, "user")}
                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 rounded-xl text-xs font-black hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <ChevronDown size={13} />
                        사용자로 강등
                      </button>
                    )}
                    {activeTab === "super_admin" && (
                      <button
                        onClick={() => changeRole(u.id, "admin")}
                        className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-xl text-xs font-black hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
                      >
                        <ChevronDown size={13} />
                        관리자로 강등
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
