"use client";

import { Bell, BellOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function InstitutionFollowButton({ institutionId, returnPath }: { institutionId: string; returnPath: string }) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!active) return;
      setUserId(user?.id ?? null);
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("institution_follows")
        .select("institution_id")
        .eq("user_id", user.id)
        .eq("institution_id", institutionId)
        .maybeSingle();
      if (active) {
        setFollowing(Boolean(data));
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [institutionId]);

  const toggleFollow = async () => {
    if (!userId) {
      router.push(`/login?redirectTo=${encodeURIComponent(returnPath)}`);
      return;
    }
    setLoading(true);
    const result = following
      ? await supabase
          .from("institution_follows")
          .delete()
          .eq("user_id", userId)
          .eq("institution_id", institutionId)
      : await supabase.from("institution_follows").insert({ user_id: userId, institution_id: institutionId });
    if (!result.error) setFollowing((value) => !value);
    setLoading(false);
  };

  return (
    <button
      type="button"
      onClick={toggleFollow}
      disabled={loading}
      aria-pressed={following}
      className={`inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-black transition-colors disabled:cursor-wait disabled:opacity-60 ${
        following
          ? "border border-slate-300 bg-white text-slate-700 hover:border-rose-400 hover:text-rose-700"
          : "bg-blue-700 text-white hover:bg-blue-800"
      }`}
    >
      {following ? <BellOff size={17} /> : <Bell size={17} />}
      {loading ? "확인 중" : following ? "팔로우 취소" : "기관 팔로우"}
    </button>
  );
}
