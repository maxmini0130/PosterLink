"use client";

import Link from "next/link";
import { Bell, Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BottomNav } from "../../components/BottomNav";
import { Header } from "../../components/Header";
import { supabase } from "../../lib/supabase";
import { institutionTypeLabel } from "../../../lib/discoveryRoutes";

type FollowedInstitution = {
  id: string;
  slug: string;
  name: string;
  region_name: string | null;
  institution_type: string | null;
};

export default function FollowedInstitutionsPage() {
  const router = useRouter();
  const [institutions, setInstitutions] = useState<FollowedInstitution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/login?redirectTo=${encodeURIComponent("/institutions/following")}`);
        return;
      }
      const { data: follows } = await supabase
        .from("institution_follows")
        .select("institution_id,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      const ids = (follows ?? []).map((follow) => follow.institution_id);
      if (ids.length > 0) {
        const { data } = await supabase
          .from("institutions")
          .select("id,slug,name,region_name,institution_type")
          .in("id", ids)
          .eq("is_public", true);
        const order = new Map(ids.map((id, index) => [id, index]));
        setInstitutions(
          ((data ?? []) as FollowedInstitution[]).sort(
            (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
          ),
        );
      }
      setLoading(false);
    };
    load();
  }, [router]);

  return (
    <div className="min-h-screen bg-white pb-24">
      <Header />
      <main className="container mx-auto max-w-4xl px-4 py-8">
        <header className="border-b border-slate-200 pb-6">
          <p className="text-xs font-black uppercase text-blue-700">Following</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">팔로우한 기관</h1>
          <p className="mt-3 text-sm font-bold text-slate-600">관심 기관의 공고를 한곳에서 다시 확인하세요.</p>
        </header>

        {loading ? (
          <div className="py-20 text-center text-sm font-black text-slate-400">기관을 불러오는 중입니다.</div>
        ) : institutions.length > 0 ? (
          <div className="grid gap-3 py-8 sm:grid-cols-2">
            {institutions.map((institution) => (
              <Link
                key={institution.id}
                href={`/institutions/${institution.slug}`}
                className="flex items-start gap-4 border border-slate-200 p-5 hover:border-blue-500"
              >
                <Building2 className="shrink-0 text-blue-700" size={21} />
                <div className="min-w-0">
                  <h2 className="font-black text-slate-950">{institution.name}</h2>
                  <p className="mt-2 text-xs font-bold text-slate-500">
                    {[institution.region_name, institutionTypeLabel(institution.institution_type)].filter(Boolean).join(" · ") || "기관 정보 확인 중"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="border-b border-slate-200 py-20 text-center">
            <Bell className="mx-auto text-slate-300" size={38} />
            <p className="mt-4 text-sm font-black text-slate-600">아직 팔로우한 기관이 없습니다.</p>
            <Link href="/institutions" className="mt-5 inline-flex bg-blue-700 px-4 py-3 text-sm font-black text-white">
              기관 찾아보기
            </Link>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
