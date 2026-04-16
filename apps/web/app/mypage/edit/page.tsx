"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Header } from "../../app/components/Header";
import { BottomNav } from "../../app/components/BottomNav";
import { ChevronLeft, Check, Loader2, MapPin, Calendar, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@posterlink/ui";

export default function ProfileEditPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regions, setRegions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    nickname: "",
    primaryRegionId: "",
    ageBand: "",
    selectedCategoryIds: [] as string[]
  });

  const router = useRouter();

  const ageBands = [
    { label: "청소년", value: "teen" },
    { label: "20대", value: "20s" },
    { label: "30대", value: "30s" },
    { label: "40대", value: "40s" },
    { label: "50대", value: "50s" },
    { label: "60대 이상", value: "60_plus" }
  ];

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch Profile, Regions, Categories, and User Interests in parallel
      const [profileRes, regionRes, categoryRes, interestRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("regions").select("*").in("level", ["nation", "sido"]).order("level", { ascending: false }),
        supabase.from("categories").select("*").order("sort_order"),
        supabase.from("user_interest_categories").select("category_id").eq("user_id", user.id)
      ]);

      if (profileRes.data) {
        setFormData(prev => ({
          ...prev,
          nickname: profileRes.data.nickname || "",
          primaryRegionId: profileRes.data.primary_region_id || "",
          ageBand: profileRes.data.age_band || ""
        }));
      }
      
      if (regionRes.data) setRegions(regionRes.data);
      if (categoryRes.data) setCategories(categoryRes.data);
      if (interestRes.data) {
        setFormData(prev => ({
          ...prev,
          selectedCategoryIds: interestRes.data.map((i: any) => i.category_id)
        }));
      }
      
      setLoading(false);
    };

    fetchData();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Update Profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          nickname: formData.nickname,
          primary_region_id: formData.primaryRegionId || null,
          age_band: formData.ageBand as any
        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      // 2. Update Interests (Delete and Re-insert)
      await supabase.from("user_interest_categories").delete().eq("user_id", user.id);
      
      if (formData.selectedCategoryIds.length > 0) {
        const inserts = formData.selectedCategoryIds.map(catId => ({
          user_id: user.id,
          category_id: catId
        }));
        const { error: catError } = await supabase.from("user_interest_categories").insert(inserts);
        if (catError) throw catError;
      }

      alert("프로필이 수정되었습니다.");
      router.push("/mypage");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = (id: string) => {
    setFormData(prev => ({
      ...prev,
      selectedCategoryIds: prev.selectedCategoryIds.includes(id)
        ? prev.selectedCategoryIds.filter(i => i !== id)
        : [...prev.selectedCategoryIds, id]
    }));
  };

  if (loading) return <div className="p-10 text-center animate-pulse">정보 불러오는 중...</div>;

  return (
    <div className="min-h-screen bg-white pb-24">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="p-2 hover:bg-gray-50 rounded-full transition-all">
              <ChevronLeft size={24} />
            </button>
            <h1 className="text-2xl font-black text-gray-900">프로필 수정 ✏️</h1>
          </div>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-black rounded-2xl shadow-lg shadow-blue-100 disabled:bg-gray-200 transition-all active:scale-95"
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
            저장
          </button>
        </div>

        <div className="space-y-10">
          {/* Nickname */}
          <section>
            <label className="block text-sm font-black text-gray-400 uppercase mb-3 px-1">NICKNAME</label>
            <input 
              type="text" 
              value={formData.nickname}
              onChange={(e) => setFormData({...formData, nickname: e.target.value})}
              placeholder="닉네임을 입력하세요"
              className="w-full p-5 bg-gray-50 border-none rounded-[1.5rem] font-bold text-gray-900 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
            />
          </section>

          {/* Region & Age */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section>
              <label className="flex items-center gap-2 text-sm font-black text-gray-400 uppercase mb-3 px-1">
                <MapPin size={14} /> REGION
              </label>
              <select 
                value={formData.primaryRegionId}
                onChange={(e) => setFormData({...formData, primaryRegionId: e.target.value})}
                className="w-full p-5 bg-gray-50 border-none rounded-[1.5rem] font-bold text-gray-900 focus:ring-2 focus:ring-blue-100 outline-none appearance-none"
              >
                <option value="">전국</option>
                {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </section>

            <section>
              <label className="flex items-center gap-2 text-sm font-black text-gray-400 uppercase mb-3 px-1">
                <Calendar size={14} /> AGE BAND
              </label>
              <select 
                value={formData.ageBand}
                onChange={(e) => setFormData({...formData, ageBand: e.target.value})}
                className="w-full p-5 bg-gray-50 border-none rounded-[1.5rem] font-bold text-gray-900 focus:ring-2 focus:ring-blue-100 outline-none appearance-none"
              >
                <option value="">연령 선택</option>
                {ageBands.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </section>
          </div>

          {/* Categories */}
          <section>
            <label className="flex items-center gap-2 text-sm font-black text-gray-400 uppercase mb-4 px-1">
              <Tag size={14} /> INTERESTS
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const isSelected = formData.selectedCategoryIds.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    className={`px-5 py-3 rounded-2xl text-sm font-black transition-all ${
                      isSelected 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' 
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
