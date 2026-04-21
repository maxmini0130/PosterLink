"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../../lib/supabase";
import { useRouter, useParams } from "next/navigation";
import { ChevronLeft, Loader2, Trash2 } from "lucide-react";
import { Button } from "@posterlink/ui";

export default function EditPosterPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    title: "",
    sourceOrgName: "",
    categoryId: "",
    regionId: "",
    appEndAt: "",
    summaryShort: "",
    officialLink: "",
    thumbnailUrl: "",
  });

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: cats }, { data: regs }, { data: poster }] = await Promise.all([
        supabase.from("categories").select("*").order("sort_order"),
        supabase.from("regions").select("*").in("level", ["nation", "sido"]).order("level", { ascending: false }),
        supabase.from("posters").select("*").eq("id", id).single(),
      ]);

      if (cats) setCategories(cats);
      if (regs) setRegions(regs);

      if (poster) {
        const { data: linkData } = await supabase
          .from("poster_links").select("url").eq("poster_id", id).eq("is_primary", true).maybeSingle();

        setFormData({
          title: poster.title || "",
          sourceOrgName: poster.source_org_name || "",
          categoryId: poster.category_id || "",
          regionId: poster.primary_region_id || "",
          appEndAt: poster.application_end_at ? poster.application_end_at.slice(0, 10) : "",
          summaryShort: poster.summary_short || "",
          officialLink: linkData?.url || "",
          thumbnailUrl: poster.thumbnail_url || "",
        });
      }

      setInitialLoading(false);
    };

    fetchData();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from("posters").update({
        title: formData.title,
        source_org_name: formData.sourceOrgName,
        application_end_at: formData.appEndAt || null,
        summary_short: formData.summaryShort,
        category_id: formData.categoryId || null,
        primary_region_id: formData.regionId || null,
      }).eq("id", id);

      if (error) throw error;

      await supabase.from("poster_categories").delete().eq("poster_id", id);
      if (formData.categoryId) {
        await supabase.from("poster_categories").insert({ poster_id: id, category_id: formData.categoryId });
      }

      await supabase.from("poster_regions").delete().eq("poster_id", id);
      if (formData.regionId) {
        await supabase.from("poster_regions").insert({ poster_id: id, region_id: formData.regionId });
      }

      if (formData.officialLink) {
        await supabase.from("poster_links").upsert({
          poster_id: id,
          link_type: "official_homepage",
          url: formData.officialLink,
          title: "공식 홈페이지",
          is_primary: true,
        }, { onConflict: "poster_id,link_type" });
      }

      alert("저장되었습니다.");
      router.push("/operator/posters");
    } catch (err: any) {
      alert("오류 발생: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("포스터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
    const { error } = await supabase.from("posters").delete().eq("id", id);
    if (error) alert(error.message);
    else router.push("/operator/posters");
  };

  if (initialLoading) return <div className="p-20 text-center font-bold text-blue-600">데이터 로드 중...</div>;

  return (
    <div className="max-w-3xl mx-auto pb-20">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-black text-gray-900">포스터 수정</h1>
      </div>

      {formData.thumbnailUrl && (
        <div className="mb-8 rounded-[2.5rem] overflow-hidden border border-gray-100 shadow-sm">
          <img src={formData.thumbnailUrl} alt="포스터 이미지" className="w-full max-h-[300px] object-contain bg-gray-50" />
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-10 rounded-[3rem] shadow-sm border border-gray-50">
          <div className="md:col-span-2">
            <label className="text-xs font-black text-gray-400 uppercase mb-2 block px-1">TITLE</label>
            <input type="text" required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-100 text-gray-900" />
          </div>
          <div>
            <label className="text-xs font-black text-gray-400 uppercase mb-2 block px-1">ORGANIZATION</label>
            <input type="text" required value={formData.sourceOrgName} onChange={(e) => setFormData({ ...formData, sourceOrgName: e.target.value })} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-100 text-gray-900" />
          </div>
          <div>
            <label className="text-xs font-black text-gray-400 uppercase mb-2 block px-1">REGION</label>
            <select value={formData.regionId} onChange={(e) => setFormData({ ...formData, regionId: e.target.value })} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-100 appearance-none text-gray-900">
              <option value="">전국</option>
              {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-black text-gray-400 uppercase mb-2 block px-1">CATEGORY</label>
            <select value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-100 appearance-none text-gray-900">
              <option value="">선택</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-black text-gray-400 uppercase mb-2 block px-1">DEADLINE</label>
            <input type="date" value={formData.appEndAt} onChange={(e) => setFormData({ ...formData, appEndAt: e.target.value })} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold outline-none text-gray-900" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-black text-gray-400 uppercase mb-2 block px-1">SUMMARY</label>
            <textarea value={formData.summaryShort} onChange={(e) => setFormData({ ...formData, summaryShort: e.target.value })} rows={3} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-100 text-gray-900 resize-none" placeholder="공고 핵심 내용을 2~3문장으로 요약해주세요." />
          </div>
          <div className="md:col-span-2 border-t border-gray-50 pt-6 mt-4">
            <label className="text-xs font-black text-gray-400 uppercase mb-2 block px-1">OFFICIAL LINK</label>
            <input type="url" value={formData.officialLink} onChange={(e) => setFormData({ ...formData, officialLink: e.target.value })} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-100 text-gray-900" placeholder="https://..." />
          </div>
        </div>

        <Button disabled={loading} className="w-full h-16 text-lg font-black bg-gray-900 hover:bg-black rounded-[2rem] shadow-2xl transition-all disabled:bg-gray-200">
          {loading ? <Loader2 className="animate-spin" /> : "저장하기"}
        </Button>

        <button
          type="button"
          onClick={handleDelete}
          className="w-full h-14 text-sm font-black text-rose-500 border-2 border-rose-100 hover:bg-rose-50 rounded-[2rem] transition-all flex items-center justify-center gap-2"
        >
          <Trash2 size={18} /> 포스터 삭제
        </button>
      </form>
    </div>
  );
}
