"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@posterlink/ui";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Star, ChevronRight, Check, Shield, User } from "lucide-react";
import toast from "react-hot-toast";

const TOTAL_STEPS = 6;

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const [regions, setRegions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  const [nickname, setNickname] = useState("");
  const [selectedRegionId, setSelectedRegionId] = useState("");
  const [selectedAgeBand, setSelectedAgeBand] = useState("");
  const [selectedGender, setSelectedGender] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);

  const router = useRouter();

  const ageBands = [
    { label: "청소년", value: "teen",    desc: "13~18세" },
    { label: "20대",   value: "20s",     desc: "대학생/취준생" },
    { label: "30대",   value: "30s",     desc: "직장인/신혼부부" },
    { label: "40대",   value: "40s",     desc: "학부모/중장년" },
    { label: "50대",   value: "50s",     desc: "중장년/자영업" },
    { label: "60대 이상", value: "60_plus", desc: "시니어/어르신" },
  ];

  const genders = [
    { label: "남성",       value: "male",             emoji: "🙋‍♂️" },
    { label: "여성",       value: "female",           emoji: "🙋‍♀️" },
    { label: "선택 안 함", value: "prefer_not_to_say", emoji: "🤍" },
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
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        router.replace("/login?error=login_failed");
        return;
      }
      const currentUser = user;

      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nickname.trim(),
          regionId: selectedRegionId,
          ageBand: selectedAgeBand,
          gender: selectedGender || "prefer_not_to_say",
          categoryIds: selectedCategoryIds,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "프로필 저장 실패");
      }

      router.push("/");
    } catch (error: any) {
      toast.error("프로필 저장 실패: " + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isNextDisabled =
    submitting ||
    (step === 0 && !agreed) ||
    (step === 1 && nickname.trim().length < 2) ||
    (step === 2 && !selectedRegionId) ||
    (step === 3 && !selectedAgeBand) ||
    (step === 4 && !selectedGender) ||
    (step === 5 && selectedCategoryIds.length === 0);

  const stepTitles = [
    <>서비스 이용을<br />시작하기 전에 👋</>,
    <>반갑습니다! 😊<br />닉네임을<br />설정해주세요.</>,
    <>Welcome! ✨<br />살고 계신 지역을<br />알려주세요.</>,
    <>Good Choice! 👍<br />연령대를<br />알려주세요.</>,
    <>Almost There! 🎯<br />성별을<br />알려주세요.</>,
    <>Last Step! 💡<br />관심 있는 정보를<br />모두 선택하세요.</>,
  ];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-white flex flex-col p-8 max-w-lg mx-auto overflow-hidden">
      <div className="flex-1 pt-12">
        <header className="mb-12">
          {/* 진행 바 */}
          <div className="flex gap-1.5 mb-6">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-500 ${step > i ? 'w-8 bg-blue-600' : step === i ? 'w-8 bg-blue-300' : 'w-2 bg-gray-100'}`}
              />
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
                {stepTitles[step]}
              </h1>
              <p className="text-gray-400 font-bold mt-3 text-sm italic">
                {step === 0
                  ? "아래 약관에 동의하신 후 서비스를 이용하실 수 있습니다."
                  : step === 1
                  ? "포스터링크에서 사용할 닉네임을 설정해주세요."
                  : "맞춤형 공고 추천을 위해 꼭 필요한 정보입니다."}
              </p>
            </motion.div>
          </AnimatePresence>
        </header>

        <div className="min-h-[350px]">
          {/* Step 0: 개인정보 동의 */}
          {step === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="rounded-3xl border-2 border-gray-50 bg-gray-50 p-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield size={18} className="text-blue-600" />
                  <span className="text-sm font-black text-gray-700">수집하는 개인정보 항목</span>
                </div>
                <div className="space-y-2 text-sm text-gray-500">
                  <div className="flex justify-between">
                    <span className="font-bold text-gray-600">수집 항목</span>
                    <span>이름, 이메일, 프로필 사진</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-gray-600">수집 목적</span>
                    <span>회원 식별 및 서비스 제공</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold text-gray-600">보유 기간</span>
                    <span>회원 탈퇴 시까지</span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
                  동의를 거부할 권리가 있으나, 거부 시 서비스 이용이 제한됩니다.
                </p>
              </div>

              <label className="flex items-start gap-3 cursor-pointer group p-4 rounded-2xl border-2 border-gray-50 hover:border-blue-100 hover:bg-blue-50/30 transition-all">
                <div
                  onClick={() => setAgreed(v => !v)}
                  className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${agreed ? 'bg-blue-600 border-blue-600' : 'border-gray-200 bg-white'}`}
                >
                  {agreed && <Check size={12} strokeWidth={4} className="text-white" />}
                </div>
                <span className="text-sm text-gray-600 leading-relaxed font-bold" onClick={() => setAgreed(v => !v)}>
                  <Link href="/terms" className="text-blue-600 hover:underline" target="_blank" onClick={e => e.stopPropagation()}>이용약관</Link> 및{" "}
                  <Link href="/privacy" className="text-blue-600 hover:underline" target="_blank" onClick={e => e.stopPropagation()}>개인정보처리방침</Link>에 동의하며,
                  위 개인정보 수집·이용에 동의합니다. <span className="text-rose-500">(필수)</span>
                </span>
              </label>
            </motion.div>
          )}

          {/* Step 1: 닉네임 설정 */}
          {step === 1 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="space-y-2">
                <div className="relative">
                  <User size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value.slice(0, 20))}
                    placeholder="닉네임을 입력하세요"
                    maxLength={20}
                    className="w-full pl-12 pr-16 py-5 rounded-[2rem] border-2 border-gray-100 bg-gray-50 text-gray-900 font-black text-base placeholder:text-gray-300 focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                  />
                  <span className="absolute right-5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-300">
                    {nickname.length}/20
                  </span>
                </div>
                {nickname.length > 0 && nickname.trim().length < 2 && (
                  <p className="text-xs text-rose-400 font-bold px-2">닉네임은 2자 이상 입력해주세요.</p>
                )}
              </div>
              <p className="text-xs text-gray-400 font-bold px-2">
                서비스 내에서 표시되는 이름입니다. 나중에 프로필에서 변경할 수 있어요.
              </p>
            </motion.div>
          )}

          {/* Step 2: 지역 선택 */}
          {step === 2 && (
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

          {/* Step 3: 연령대 선택 */}
          {step === 3 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              {ageBands.map((a) => (
                <button
                  key={a.value}
                  onClick={() => setSelectedAgeBand(a.value)}
                  className={`w-full p-6 rounded-[2rem] border-2 transition-all flex items-center justify-between group ${selectedAgeBand === a.value ? 'border-gray-900 bg-gray-900 text-white shadow-2xl' : 'border-gray-50 bg-gray-50 hover:bg-white hover:border-gray-100'}`}
                >
                  <div className="text-left">
                    <p className={`text-base font-black ${selectedAgeBand === a.value ? 'text-white' : 'text-gray-900'}`}>{a.label}</p>
                    <p className="text-[11px] font-bold text-gray-400">{a.desc}</p>
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${selectedAgeBand === a.value ? 'bg-white text-gray-900' : 'bg-white text-transparent border border-gray-100 group-hover:text-gray-200'}`}>
                    <Check size={16} strokeWidth={4} />
                  </div>
                </button>
              ))}
            </motion.div>
          )}

          {/* Step 4: 성별 선택 */}
          {step === 4 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <p className="text-xs text-gray-400 font-bold mb-4 px-1">
                성별 정보는 맞춤 공고 추천에만 사용되며, 언제든지 변경할 수 있습니다.
              </p>
              {genders.map((g) => (
                <button
                  key={g.value}
                  onClick={() => setSelectedGender(g.value)}
                  className={`w-full p-6 rounded-[2rem] border-2 transition-all flex items-center justify-between group ${selectedGender === g.value ? 'border-blue-600 bg-blue-50/50 shadow-xl shadow-blue-50' : 'border-gray-50 bg-gray-50 hover:bg-white hover:border-gray-100'}`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{g.emoji}</span>
                    <p className={`text-base font-black ${selectedGender === g.value ? 'text-blue-700' : 'text-gray-900'}`}>{g.label}</p>
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${selectedGender === g.value ? 'bg-blue-600 text-white' : 'bg-white text-transparent border border-gray-100 group-hover:text-gray-200'}`}>
                    <Check size={16} strokeWidth={4} />
                  </div>
                </button>
              ))}
            </motion.div>
          )}

          {/* Step 5: 관심 카테고리 */}
          {step === 5 && (
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
          disabled={isNextDisabled}
          onClick={() => step < TOTAL_STEPS - 1 ? setStep(step + 1) : handleComplete()}
          className="w-full h-18 text-lg font-black bg-gray-900 hover:bg-black text-white rounded-[2rem] shadow-2xl transition-all disabled:bg-gray-100 disabled:text-gray-300 flex items-center justify-center gap-3 group"
        >
          {submitting ? "SAVING..." : step === TOTAL_STEPS - 1 ? "START POSTERLINK" : "NEXT STEP"}
          {!submitting && <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />}
        </Button>
      </footer>
    </div>
  );
}
