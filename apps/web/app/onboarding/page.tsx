"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import { Button } from "@posterlink/ui";

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // DB에서 불러올 데이터 상태
  const [regions, setRegions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
  // 사용자가 선택한 값 상태
  const [selectedRegionId, setSelectedRegionId] = useState("");
  const [selectedAgeBand, setSelectedAgeBand] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  
  const router = useRouter();

  const ageBands = [
    { label: "청소년", value: "teen" },
    { label: "20대", value: "20s" },
    { label: "30대", value: "30s" },
    { label: "40대", value: "40s" },
    { label: "50대", value: "50s" },
    { label: "60대 이상", value: "60_plus" }
  ];

  // 1. 초기 데이터 로드 (지역, 카테고리)
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // 광역 시도(level='sido') 또는 전국(level='nation')만 우선 로드
      const { data: regionData } = await supabase
        .from("regions")
        .select("id, name")
        .in("level", ["nation", "sido"])
        .order("level", { ascending: false }); // nation 먼저
        
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

  // 2. 최종 저장 로직
  const handleComplete = async () => {
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요합니다.");

      // 프로필 업데이트 (지역, 연령대)
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          primary_region_id: selectedRegionId,
          age_band: selectedAgeBand as any,
          role: 'user' // 기본 역할
        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      // 관심 카테고리 저장
      if (selectedCategoryIds.length > 0) {
        // 기존 관심사 삭제 후 재삽입 (Idempotent)
        await supabase.from("user_interest_categories").delete().eq("user_id", user.id);
        
        const inserts = selectedCategoryIds.map(catId => ({
          user_id: user.id,
          category_id: catId
        }));
        
        const { error: categoryError } = await supabase
          .from("user_interest_categories")
          .insert(inserts);
          
        if (categoryError) throw categoryError;
      }

      router.push("/");
    } catch (error: any) {
      alert("저장 중 오류가 발생했습니다: " + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 animate-pulse font-medium">데이터를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col p-6 max-w-md mx-auto">
      <div className="flex-1">
        <div className="mb-2">
          <span className="text-sm font-bold text-blue-600">Step {step} / 3</span>
        </div>
        <h1 className="text-2xl font-bold mb-8 leading-tight">
          {step === 1 && "어느 지역에 살고 계신가요?"}
          {step === 2 && "연령대를 알려주세요."}
          {step === 3 && "관심 있는 정보를 선택해주세요."}
        </h1>

        {step === 1 && (
          <div className="grid grid-cols-2 gap-3">
            {regions.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedRegionId(r.id)}
                className={`p-4 rounded-xl border text-sm font-bold transition-all ${selectedRegionId === r.id ? 'border-blue-600 bg-blue-50 text-blue-600 shadow-sm' : 'border-gray-100 bg-gray-50 text-gray-400'}`}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-2 gap-3">
            {ageBands.map((a) => (
              <button
                key={a.value}
                onClick={() => setSelectedAgeBand(a.value)}
                className={`p-4 rounded-xl border text-sm font-bold transition-all ${selectedAgeBand === a.value ? 'border-blue-600 bg-blue-50 text-blue-600 shadow-sm' : 'border-gray-100 bg-gray-50 text-gray-400'}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategoryIds(prev => prev.includes(c.id) ? prev.filter(v => v !== c.id) : [...prev, c.id])}
                className={`px-5 py-3 rounded-full border text-sm font-bold transition-all ${selectedCategoryIds.includes(c.id) ? 'border-blue-600 bg-blue-600 text-white shadow-md' : 'border-gray-100 bg-gray-50 text-gray-400'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-10">
        <Button 
          disabled={submitting || (step === 1 && !selectedRegionId) || (step === 2 && !selectedAgeBand) || (step === 3 && selectedCategoryIds.length === 0)}
          onClick={() => step < 3 ? setStep(step + 1) : handleComplete()}
          className="w-full h-15 text-lg font-bold bg-blue-600 hover:bg-blue-700 rounded-2xl shadow-lg shadow-blue-100 disabled:bg-gray-200 disabled:shadow-none"
        >
          {submitting ? "저장 중..." : step === 3 ? "포스터링크 시작하기" : "다음 단계로"}
        </Button>
      </div>
    </div>
  );
}
