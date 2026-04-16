"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import { Button } from "@posterlink/ui";

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [region, setRegion] = useState("");
  const [ageBand, setAgeBand] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const router = useRouter();

  // Mock data for now
  const regions = ["전국", "서울특별시", "경기도", "인천광역시", "부산광역시", "대구광역시"];
  const ageBands = ["청소년", "20대", "30대", "40대", "50대", "60대 이상"];
  const categoryList = ["지원금/복지", "교육/취업", "문화/행사", "주거/금융", "소상공인"];

  const handleComplete = async () => {
    // 1. Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 2. Update profile (Assume role 'user' for now)
    await supabase.from("profiles").update({
      primary_region_id: null, // Link to real ID in production
      age_band: '20s', // Map correctly in production
      role: 'user'
    }).eq("id", user.id);

    // 3. Save interests (Assume categories are already in DB)
    // ... logic for user_interest_categories

    router.push("/");
  };

  return (
    <div className="min-h-screen bg-white flex flex-col p-6 max-w-md mx-auto">
      <div className="flex-1">
        <h1 className="text-2xl font-bold mb-8">
          {step === 1 && "어느 지역에 살고 계신가요?"}
          {step === 2 && "연령대를 알려주세요."}
          {step === 3 && "관심 있는 정보를 선택해주세요."}
        </h1>

        {step === 1 && (
          <div className="grid grid-cols-2 gap-3">
            {regions.map((r) => (
              <button
                key={r}
                onClick={() => setRegion(r)}
                className={`p-4 rounded-xl border text-sm font-medium transition-colors ${region === r ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600'}`}
              >
                {r}
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-2 gap-3">
            {ageBands.map((a) => (
              <button
                key={a}
                onClick={() => setAgeBand(a)}
                className={`p-4 rounded-xl border text-sm font-medium transition-colors ${ageBand === a ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600'}`}
              >
                {a}
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-wrap gap-2">
            {categoryList.map((c) => (
              <button
                key={c}
                onClick={() => setCategories(prev => prev.includes(c) ? prev.filter(v => v !== c) : [...prev, c])}
                className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${categories.includes(c) ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 text-gray-600'}`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-10">
        <Button 
          onClick={() => step < 3 ? setStep(step + 1) : handleComplete()}
          className="w-full h-14 text-lg font-bold bg-blue-600 hover:bg-blue-700 rounded-2xl"
        >
          {step === 3 ? "시작하기" : "다음"}
        </Button>
      </div>
    </div>
  );
}
