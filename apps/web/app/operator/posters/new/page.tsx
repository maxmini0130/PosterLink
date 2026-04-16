"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";
import { Button } from "@posterlink/ui";
import { Camera, Link as LinkIcon, Calendar, MapPin, Tag, Building2, ChevronLeft, Loader2 } from "lucide-react";

export default function NewPosterPage() {
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const router = useRouter();

  // DB에서 가져올 기초 데이터
  const [categories, setCategories] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);

  // 폼 상태
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    title: "",
    sourceOrgName: "",
    categoryId: "",
    regionId: "", // null이면 전국
    appStartAt: "",
    appEndAt: "",
    summaryShort: "",
    officialLink: ""
  });

  useEffect(() => {
    const fetchBaseData = async () => {
      const { data: cats } = await supabase.from("categories").select("*").order("sort_order");
      const { data: regs } = await supabase.from("regions").select("*").in("level", ["nation", "sido"]).order("level", { ascending: false });
      
      if (cats) setCategories(cats);
      if (regs) setRegions(regs);
      setInitialLoading(false);
    };
    fetchBaseData();
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageFile) return alert("포스터 이미지를 업로드해주세요.");
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("인증 오류");

      // 1. 이미지 업로드
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${user.id}/${Date.now()}_${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("poster-originals")
        .upload(filePath, imageFile);

      if (uploadError) throw uploadError;

      // 2. 포스터 기본 정보 저장
      const { data: poster, error: posterError } = await supabase
        .from("posters")
        .insert({
          title: formData.title,
          source_org_name: formData.sourceOrgName,
          category_id: formData.categoryId,
          primary_region_id: formData.regionId || null,
          application_start_at: formData.appStartAt || null,
          application_end_at: formData.appEndAt || null,
          summary_short: formData.summaryShort,
          status: "draft", // 운영자가 처음 올리면 검수 전 초안 상태
          created_by: user.id
        })
        .select()
        .single();

      if (posterError) throw posterError;

      // 3. 이미지 정보 저장
      await supabase.from("poster_images").insert({
        poster_id: poster.id,
        image_type: "original",
        storage_path: filePath
      });

      // 4. 공식 링크 저장
      if (formData.officialLink) {
        await supabase.from("poster_links").insert({
          poster_id: poster.id,
          link_type: "official_homepage",
          url: formData.officialLink,
          title: "공식 홈페이지",
          is_primary: true
        });
      }

      alert("포스터가 성공적으로 등록되었습니다 (초안 상태)");
      router.push("/operator/posters");
    } catch (err: any) {
      console.error(err);
      alert("등록 중 오류가 발생했습니다: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) return <div className="p-20 text-center font-bold text-blue-600">준비 중...</div>;

  return (
    <div className="max-w-3xl mx-auto pb-20">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-black text-gray-900">새 포스터 등록 🖼️</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* 이미지 업로드 영역 */}
        <section className="bg-white p-8 rounded-3xl border-2 border-dashed border-gray-200 hover:border-blue-400 transition-all group overflow-hidden">
          <input type="file" id="poster-upload" className="hidden" accept="image/*" onChange={handleImageChange} />
          <label htmlFor="poster-upload" className="cursor-pointer flex flex-col items-center justify-center min-h-[300px]">
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="max-h-[400px] rounded-xl shadow-lg" />
            ) : (
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Camera size={32} />
                </div>
                <p className="text-gray-900 font-black">포스터 사진을 올려주세요</p>
                <p className="text-gray-400 text-sm mt-1 font-bold">JPG, PNG 파일 (최대 10MB)</p>
              </div>
            )}
          </label>
        </section>

        {/* 상세 정보 입력 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm font-black text-gray-700 mb-2">
              <Tag size={16} className="text-blue-600" /> 포스터 제목
            </label>
            <input 
              type="text" required placeholder="공고문의 핵심 제목을 입력하세요"
              value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})}
              className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-blue-100 transition-all outline-none" 
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-black text-gray-700 mb-2">
              <Building2 size={16} className="text-blue-600" /> 공고 기관
            </label>
            <input 
              type="text" required placeholder="예: 서울특별시, 고용노동부"
              value={formData.sourceOrgName} onChange={(e) => setFormData({...formData, sourceOrgName: e.target.value})}
              className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-blue-100 transition-all outline-none" 
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-black text-gray-700 mb-2">
              <MapPin size={16} className="text-blue-600" /> 대상 지역
            </label>
            <select 
              className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-blue-100 outline-none appearance-none"
              value={formData.regionId} onChange={(e) => setFormData({...formData, regionId: e.target.value})}
            >
              <option value="">전국 대상</option>
              {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-black text-gray-700 mb-2">
               분야 카테고리
            </label>
            <select 
              required className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-blue-100 outline-none appearance-none"
              value={formData.categoryId} onChange={(e) => setFormData({...formData, categoryId: e.target.value})}
            >
              <option value="">분야 선택</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-black text-gray-700 mb-2">
              <Calendar size={16} className="text-blue-600" /> 신청 마감일
            </label>
            <input 
              type="date"
              value={formData.appEndAt} onChange={(e) => setFormData({...formData, appEndAt: e.target.value})}
              className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-blue-100 outline-none" 
            />
          </div>

          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm font-black text-gray-700 mb-2">
              <LinkIcon size={16} className="text-blue-600" /> 공식 홈페이지 링크
            </label>
            <input 
              type="url" placeholder="https://..."
              value={formData.officialLink} onChange={(e) => setFormData({...formData, officialLink: e.target.value})}
              className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-blue-100 transition-all outline-none" 
            />
          </div>

          <div className="md:col-span-2">
            <label className="flex items-center gap-2 text-sm font-black text-gray-700 mb-2">
              💡 한 줄 요약
            </label>
            <textarea 
              rows={3} placeholder="사용자가 이해하기 쉽게 핵심 혜택을 요약해주세요"
              value={formData.summaryShort} onChange={(e) => setFormData({...formData, summaryShort: e.target.value})}
              className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-blue-100 transition-all outline-none resize-none" 
            />
          </div>
        </div>

        <div className="pt-6">
          <Button 
            disabled={loading}
            className="w-full h-16 text-lg font-black bg-blue-600 hover:bg-blue-700 rounded-3xl shadow-xl shadow-blue-100 transition-all disabled:bg-gray-200"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin" /> 등록 중...
              </div>
            ) : "포스터 등록하기 (초안 저장)"}
          </Button>
        </div>
      </form>
    </div>
  );
}
