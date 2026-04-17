"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";
import { Button } from "@posterlink/ui";
import { Camera, Link as LinkIcon, Calendar, MapPin, Tag, Building2, ChevronLeft, Loader2, Scissors } from "lucide-react";
import { ImageCropper } from "../../../components/ImageCropper";

export default function NewPosterPage() {
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const router = useRouter();

  const [categories, setCategories] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);

  // 폼 상태
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [croppedImageBlob, setCroppedImageBlob] = useState<Blob | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  
  const [formData, setFormData] = useState({
    title: "",
    sourceOrgName: "",
    categoryId: "",
    regionId: "",
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
      const reader = new FileReader();
      reader.onloadend = () => {
        setOriginalImage(reader.result as string);
        setShowCropper(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const onCropComplete = async (blob: Blob) => {
    setCroppedImageBlob(blob);
    setImagePreview(URL.createObjectURL(blob));
    setShowCropper(false);

    // OCR 분석 시작
    setIsAnalyzing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        
        // Edge Function 호출
        const { data, error } = await supabase.functions.invoke('process-ocr', {
          body: { imageBase64: base64data.split(',')[1] }
        });

        if (error) throw error;

        // 추출된 데이터로 폼 채우기
        if (data) {
          setFormData(prev => ({
            ...prev,
            title: data.title || prev.title,
            sourceOrgName: data.sourceOrgName || prev.sourceOrgName,
            appEndAt: data.appEndAt || prev.appEndAt,
            summaryShort: data.summaryShort || prev.summaryShort,
            officialLink: data.officialLink || prev.officialLink,
            // 카테고리는 매칭 시도가 필요할 수 있음
            categoryId: categories.find(c => c.code === data.categoryId)?.id || prev.categoryId
          }));
          alert("이미지 분석이 완료되었습니다. 추출된 정보를 확인해주세요.");
        }
      };
    } catch (err: any) {
      console.error("OCR Error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!croppedImageBlob) return alert("포스터 이미지를 보정하여 등록해주세요.");
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("인증 오류");

      // 1. 보정된 이미지 업로드
      const fileName = `${Date.now()}_cropped.jpg`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("poster-originals")
        .upload(filePath, croppedImageBlob, { contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      // 2. 포스터 정보 저장
      const { data: poster, error: posterError } = await supabase
        .from("posters")
        .insert({
          title: formData.title,
          source_org_name: formData.sourceOrgName,
          poster_status: "draft",
          application_end_at: formData.appEndAt || null,
          summary_short: formData.summaryShort,
          created_by: user.id
        })
        .select()
        .single();

      if (posterError) throw posterError;

      // 2-1. 포스터 카테고리 연결 (M:N 대응)
      await supabase.from("poster_categories").insert({
        poster_id: poster.id,
        category_id: formData.categoryId
      });

      // 2-2. 포스터 지역 연결 (M:N 대응)
      if (formData.regionId) {
        await supabase.from("poster_regions").insert({
          poster_id: poster.id,
          region_id: formData.regionId
        });
      }

      // 3. 이미지 정보 저장 (Public URL 생성 후 저장)
      const { data: { publicUrl } } = supabase.storage.from("poster-originals").getPublicUrl(filePath);

      await supabase.from("poster_images").insert({
        poster_id: poster.id,
        image_type: "processed",
        image_url: publicUrl
      });

      // 4. 링크 저장
      if (formData.officialLink) {
        await supabase.from("poster_links").insert({
          poster_id: poster.id,
          link_type: "official_homepage",
          url: formData.officialLink,
          title: "공식 홈페이지",
          is_primary: true
        });
      }

      alert("보정된 이미지로 포스터가 등록되었습니다.");
      router.push("/operator/posters");
    } catch (err: any) {
      alert("오류 발생: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) return <div className="p-20 text-center font-bold text-blue-600">데이터 로드 중...</div>;

  return (
    <div className="max-w-3xl mx-auto pb-20">
      {showCropper && originalImage && (
        <ImageCropper 
          image={originalImage} 
          onCropComplete={onCropComplete} 
          onCancel={() => setShowCropper(false)} 
        />
      )}

      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          포스터 수집 및 보정 <Scissors size={20} className="text-blue-600" />
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* 이미지 업로드 & 미리보기 */}
        <section className="bg-white p-8 rounded-[2.5rem] border-2 border-dashed border-gray-100 hover:border-blue-200 transition-all group overflow-hidden relative shadow-sm">
          {isAnalyzing && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center animate-in fade-in duration-300">
              <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4" />
              <p className="text-gray-900 font-black">인공지능 분석 중...</p>
              <p className="text-gray-400 text-xs font-bold mt-1 italic">포스터 정보를 자동으로 추출하고 있습니다.</p>
            </div>
          )}
          <input type="file" id="poster-upload" className="hidden" accept="image/*" onChange={handleImageChange} />
          <label htmlFor="poster-upload" className="cursor-pointer flex flex-col items-center justify-center min-h-[350px]">
            {imagePreview ? (
              <div className="relative group">
                <img src={imagePreview} alt="Preview" className="max-h-[450px] rounded-[2rem] shadow-2xl border-4 border-white" />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-[2rem] flex items-center justify-center">
                  <div className="bg-white px-4 py-2 rounded-xl text-xs font-black text-gray-900 shadow-xl flex items-center gap-2">
                    <Camera size={14} /> 사진 변경 / 다시 보정
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-5 group-hover:scale-110 transition-transform">
                  <Camera size={36} />
                </div>
                <p className="text-gray-900 font-black text-lg">포스터 사진 촬영 또는 업로드</p>
                <p className="text-gray-400 text-sm mt-1 font-bold italic">업로드 후 자르기/회전 보정이 시작됩니다.</p>
              </div>
            )}
          </label>
        </section>

        {/* 상세 정보 입력 영역 (기존과 동일) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-10 rounded-[3rem] shadow-sm border border-gray-50">
          <div className="md:col-span-2">
            <label className="text-xs font-black text-gray-400 uppercase mb-2 block px-1">TITLE</label>
            <input type="text" required value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-100 text-gray-900" />
          </div>
          <div>
            <label className="text-xs font-black text-gray-400 uppercase mb-2 block px-1">ORGANIZATION</label>
            <input type="text" required value={formData.sourceOrgName} onChange={(e) => setFormData({...formData, sourceOrgName: e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-100 text-gray-900" />
          </div>
          <div>
            <label className="text-xs font-black text-gray-400 uppercase mb-2 block px-1">REGION</label>
            <select value={formData.regionId} onChange={(e) => setFormData({...formData, regionId: e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-100 appearance-none text-gray-900">
              <option value="">전국</option>
              {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-black text-gray-400 uppercase mb-2 block px-1">CATEGORY</label>
            <select required value={formData.categoryId} onChange={(e) => setFormData({...formData, categoryId: e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-100 appearance-none text-gray-900">
              <option value="">선택</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-black text-gray-400 uppercase mb-2 block px-1">DEADLINE</label>
            <input type="date" value={formData.appEndAt} onChange={(e) => setFormData({...formData, appEndAt: e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold outline-none text-gray-900" />
          </div>
          <div className="md:col-span-2 border-t border-gray-50 pt-6 mt-4">
            <label className="text-xs font-black text-gray-400 uppercase mb-2 block px-1">OFFICIAL LINK</label>
            <input type="url" value={formData.officialLink} onChange={(e) => setFormData({...formData, officialLink: e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-100 text-gray-900" placeholder="https://..." />
          </div>
        </div>

        <Button disabled={loading} className="w-full h-16 text-lg font-black bg-gray-900 hover:bg-black rounded-[2rem] shadow-2xl transition-all disabled:bg-gray-200">
          {loading ? <Loader2 className="animate-spin" /> : "보정된 포스터 등록하기"}
        </Button>
      </form>
    </div>
  );
}
