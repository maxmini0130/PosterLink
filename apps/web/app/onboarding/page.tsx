"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import { Button } from "@posterlink/ui";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, User, Star, ChevronRight, Check } from "lucide-react";

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [regions, setRegions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
  const [selectedRegionId, setSelectedRegionId] = useState("");
  const [selectedAgeBand, setSelectedAgeBand] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  
  const router = useRouter();

  const ageBands = [
    { label: "청소년", value: "teen", desc: "13~18세" },
    { label: "20대", value: "20s", desc: "대학생/취준생" },
    { label: "30대", value: "30s", desc: "직장인/신혼부부" },
    { label: "40대", value: "40s", desc: "학부모/중장년" },
    { label: "50대", value: "50s", desc: "중장년/자영업" },
    { label: "60대 이상", value: "60_plus", desc: "시니어/어르신" }
  ];

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: regionData } = await supabase
        .from("regions")
        .select("id, name")
        .in("level", ["nation", "sido"])
        .order("level", { ascending: false });
        
      const { data: categoryData } = await supabase
        .from("categories")
        .select("id, name")
        .order("sort_order");

      if (regionData) setRegions(regionData);
      if (categoryData) setCategories(categoryData);
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleComplete = async () => {
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: { session } } = await supabase.auth.getSession();
      const fallbackUid = typeof window !== "undefined" ? localStorage.getItem("onboarding_uid") : null;
      const currentUser = user ?? session?.user ?? (fallbackUid ? { id: fallbackUid } : null);
      if (!currentUser) throw new Error("로그인 정보를 찾을 수 없습니다. 다시 로그인해주세요.");

      // 1. 프로필 업데이트 (지역 + 연령대)
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          primary_region_id: selectedRegionId,
          age_band: selectedAgeBand,
          role: 'user'
        })
        .eq("id", currentUser.id);

      if (profileError) throw profileError;

      // 2. 관심 카테고리 저장 (M:N)
      if (selectedCategoryIds.length > 0) {
        await supabase.from("user_interest_categories").delete().eq("user_id", currentUser.id);
        const inserts = selectedCategoryIds.map(catId => ({ user_id: currentUser.id, category_id: catId }));
        await supabase.from("user_interest_categories").insert(inserts);
      }

      localStorage.removeItem("onboarding_uid");
      router.push("/");
    } catch (error: any) {
      alert("Error saving profile: " + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-white flex flex-col p-8 max-w-lg mx-auto overflow-hidden">
      <div className="flex-1 pt-12">
        <header className="mb-12">
           <div className="flex gap-1.5 mb-6">
             {[1,2,3].map(i => (
               <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${step >= i ? 'w-8 bg-blue-600' : 'w-2 bg-gray-100'}`} />
             ))}
           </div>
           
           <AnimatePresence mode="wait">
             <motion.div
               key={step}
               initial={{ x: 20, opacity: 0 }}
               animate={{ x: 0, opacity: 1 }}
               exit={{ x: -20, opacity: 0 }}
               transition={{ duration: 0.3 }}
             >
               <h1 className="text-3xl font-black text-gray-900 leading-[1.15] italic tracking-tight">
                 {step === 1 && <>Welcome! ✨<br />살고 계신 지역을<br />알려주세요.</>}
                 {step === 2 && <>Good Choice! 👍<br />연령대를<br />알려주세요.</>}
                 {step === 3 && <>Last Step! 💡<br />관심 있는 정보를<br />모두 선택하세요.</>}
               </h1>
               <p className="text-gray-400 font-bold mt-3 text-sm italic">맞춤형 공고 추천을 위해 꼭 필요한 정보입니다.</p>
             </motion.div>
           </AnimatePresence>
        </header>

        <div className="min-h-[350px]">
          {step === 1 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-2 gap-3">
              {regions.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRegionId(r.id)}
                  className={`group p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${selectedRegionId === r.id ? 'border-blue-600 bg-blue-50/50 shadow-xl shadow-blue-50' : 'border-gray-50 bg-gray-50 hover:border-gray-100 hover:bg-white'}`}
                >
                  <MapPin size={24} className={selectedRegionId === r.id ? 'text-blue-600' : 'text-gray-300 group-hover:text-gray-400'} />
                  <span className={`text-[13px] font-black ${selectedRegionId === r.id ? 'text-blue-600' : 'text-gray-500'}`}>{r.name}</span>
                </button>
              ))}
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              {ageBands.map((a) => (
                <button
                  key={a.value}
                  onClick={() => setSelectedAgeBand(a.value)}
                  className={`w-full p-6 rounded-[2rem] border-2 transition-all flex items-center justify-between group ${selectedAgeBand === a.value ? 'border-gray-900 bg-gray-900 text-white shadow-2xl' : 'border-gray-50 bg-gray-50 hover:bg-white hover:border-gray-100'}`}
                >
                  <div className="text-left">
                    <p className={`text-base font-black ${selectedAgeBand === a.value ? 'text-white' : 'text-gray-900'}`}>{a.label}</p>
                    <p className={`text-[11px] font-bold ${selectedAgeBand === a.value ? 'text-gray-400' : 'text-gray-400'}`}>{a.desc}</p>
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${selectedAgeBand === a.value ? 'bg-white text-gray-900' : 'bg-white text-transparent border border-gray-100 group-hover:text-gray-200'}`}>
                    <Check size={16} strokeWidth={4} />
                  </div>
                </button>
              ))}
            </motion.div>
          )}

          {step === 3 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap gap-2.5">
              {categories.map((c) => {
                const isSelected = selectedCategoryIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCategoryIds(prev => isSelected ? prev.filter(v => v !== c.id) : [...prev, c.id])}
                    className={`px-6 py-3.5 rounded-full border-2 text-[13px] font-black transition-all flex items-center gap-2 ${isSelected ? 'border-blue-600 bg-blue-600 text-white shadow-xl shadow-blue-100' : 'border-gray-50 bg-gray-50 text-gray-400 hover:border-gray-100 hover:bg-white'}`}
                  >
                    {isSelected && <Star size={14} fill="white" />}
                    {c.name}
                  </button>
                );
              })}
            </motion.div>
          )}
        </div>
      </div>

      <footer className="mt-12">
        <Button 
          disabled={submitting || (step === 1 && !selectedRegionId) || (step === 2 && !selectedAgeBand) || (step === 3 && selectedCategoryIds.length === 0)}
          onClick={() => step < 3 ? setStep(step + 1) : handleComplete()}
          className="w-full h-18 text-lg font-black bg-gray-900 hover:bg-black text-white rounded-[2rem] shadow-2xl transition-all disabled:bg-gray-100 disabled:text-gray-300 flex items-center justify-center gap-3 group"
        >
          {submitting ? "SAVING..." : step === 3 ? "START POSTERLINK" : "NEXT STEP"}
          {!submitting && <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />}
        </Button>
      </footer>
    </div>
  );
}
