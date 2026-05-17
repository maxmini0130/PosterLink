"use client";
import toast from "react-hot-toast";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";
import { Button } from "@posterlink/ui";
import { Camera, ChevronLeft, Loader2 } from "lucide-react";
import { ImageCropper } from "../../../components/ImageCropper";

function getRegionLabel(region: any) {
  if (!region) return "";
  if (region.level === "sigungu") return region.full_name || region.name;
  return region.name;
}

export default function NewPosterPage() {
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const router = useRouter();

  const [categories, setCategories] = useState<any[]>([]);
  const [regions, setRegions] = useState<any[]>([]);

  // 폼 상태
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [croppedImageBlobs, setCroppedImageBlobs] = useState<Blob[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const imagePreviewsRef = useRef<string[]>([]);
  const [showCropper, setShowCropper] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
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
      const { data: regs } = await supabase.from("regions").select("*").in("level", ["nation", "sido", "sigungu"]).order("level", { ascending: false }).order("full_name", { ascending: true });
      if (cats) setCategories(cats);
      if (regs) setRegions(regs);
      setInitialLoading(false);
    };
    fetchBaseData();
  }, []);

  useEffect(() => {
    imagePreviewsRef.current = imagePreviews;
  }, [imagePreviews]);

  useEffect(() => {
    return () => {
      imagePreviewsRef.current.forEach((preview) => URL.revokeObjectURL(preview));
    };
  }, []);

  const goBackToList = () => {
    router.push("/operator/posters");
  };

  const clearSelectedImage = () => {
    imagePreviews.forEach((preview) => URL.revokeObjectURL(preview));
    setImagePreviews([]);
    setCroppedImageBlobs([]);
    setOriginalImage(null);
    setShowCropper(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeSelectedImage = (index: number) => {
    setImagePreviews((previews) => {
      const next = previews.filter((_, previewIndex) => previewIndex !== index);
      URL.revokeObjectURL(previews[index]);
      return next;
    });
    setCroppedImageBlobs((blobs) => blobs.filter((_, blobIndex) => blobIndex !== index));
  };

  const compressForCropper = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const MAX = 2400;
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.9));
        };
        img.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
      reader.readAsDataURL(file);
    });

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (croppedImageBlobs.length >= 2) {
      toast.error("포스터 이미지는 최대 2장까지 등록할 수 있습니다.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    try {
      const compressed = await compressForCropper(file);
      setOriginalImage(compressed);
      setShowCropper(true);
    } catch (err: any) {
      toast.error(err.message ?? "이미지를 열지 못했습니다.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const onCropComplete = (blob: Blob) => {
    setCroppedImageBlobs((blobs) => [...blobs, blob].slice(0, 2));
    setImagePreviews((previews) => [...previews, URL.createObjectURL(blob)].slice(0, 2));
    setShowCropper(false);
    if (croppedImageBlobs.length === 0) runOcr(blob);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resizeBlobForOcr = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const MAX = 1000;
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("OCR용 이미지를 만들지 못했습니다."));
      };
      img.src = url;
    });

  const runOcr = async (blob: Blob) => {
    setIsAnalyzing(true);
    try {
      const base64data = await resizeBlobForOcr(blob);
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('process-ocr', {
        body: { imageBase64: base64data.split(',')[1] },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {}
      });
      if (error) {
        console.error("OCR Error:", error);
        return;
      }
      if (data) {
        setFormData(prev => ({
          ...prev,
          title: data.title || prev.title,
          sourceOrgName: data.sourceOrgName || prev.sourceOrgName,
          appEndAt: data.appEndAt || prev.appEndAt,
          summaryShort: data.summaryShort || prev.summaryShort,
          officialLink: data.officialLink || prev.officialLink,
          categoryId: categories.find(c => c.code === data.categoryId)?.id || prev.categoryId
        }));
      }
    } catch (err) {
      console.error("OCR Error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (croppedImageBlobs.length === 0) return void toast.error("포스터 이미지를 보정하여 등록해주세요.");
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("인증 오류");

      const publicUrls: string[] = [];
      for (const [index, blob] of croppedImageBlobs.entries()) {
        const uploadFormData = new FormData();
        uploadFormData.append("image", blob, `poster_${index + 1}.jpg`);
        const uploadRes = await fetch("/api/upload/poster", {
          method: "POST",
          body: uploadFormData,
        });
        if (!uploadRes.ok) {
          const d = await uploadRes.json().catch(() => ({ error: "이미지 업로드 실패" }));
          throw new Error(d.error ?? "이미지 업로드 실패");
        }
        const { publicUrl } = await uploadRes.json();
        if (publicUrl) publicUrls.push(publicUrl);
      }
      if (publicUrls.length === 0) throw new Error("업로드된 이미지 URL을 받지 못했습니다.");

      // 2. 포스터 정보 저장
      const { data: poster, error: posterError } = await supabase
        .from("posters")
        .insert({
          title: formData.title,
          source_org_name: formData.sourceOrgName,
          poster_status: "review",
          application_end_at: formData.appEndAt || null,
          summary_short: formData.summaryShort,
          created_by: user.id
        })
        .select()
        .single();

      if (posterError) throw posterError;

      // 2-1. 포스터 카테고리 연결 (M:N 대응)
      const { error: categoryError } = await supabase.from("poster_categories").insert({
        poster_id: poster.id,
        category_id: formData.categoryId
      });
      if (categoryError) throw categoryError;

      // 2-2. 포스터 지역 연결 (M:N 대응)
      if (formData.regionId) {
        const { error: regionError } = await supabase.from("poster_regions").insert({
          poster_id: poster.id,
          region_id: formData.regionId
        });
        if (regionError) throw regionError;
      }

      // 3. 이미지 URL을 posters에 직접 저장
      const { error: thumbnailError } = await supabase.from("posters").update({ thumbnail_url: publicUrls[0] }).eq("id", poster.id);
      if (thumbnailError) throw thumbnailError;

      const { error: imageError } = await supabase.from("poster_images").insert(
        publicUrls.map((publicUrl, index) => ({
          poster_id: poster.id,
          storage_path: publicUrl,
          image_type: index === 0 ? "thumbnail" : "original",
        }))
      );
      if (imageError) throw imageError;

      // 4. 링크 저장
      if (formData.officialLink) {
        const { error: linkError } = await supabase.from("poster_links").insert({
          poster_id: poster.id,
          link_type: "official_homepage",
          url: formData.officialLink,
          title: "공식 홈페이지",
          is_primary: true
        });
        if (linkError) throw linkError;
      }

      toast.success("포스터가 등록되었습니다. 관리자 검수 후 게시됩니다.");
      router.push("/operator/posters");
    } catch (err: any) {
      toast.error("오류 발생: " + err.message);
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
        <button type="button" onClick={goBackToList} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-black text-gray-900">
          새 포스터 등록
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* 이미지 업로드 & 미리보기 */}
        <section className="bg-white p-8 rounded-[2.5rem] border-2 border-dashed border-gray-100 hover:border-blue-200 transition-all group overflow-hidden relative shadow-sm">
          {isAnalyzing && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
              <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-4" />
              <p className="text-gray-900 font-black">AI 분석 중...</p>
              <p className="text-gray-400 text-xs font-bold mt-1">포스터 정보를 자동으로 추출하고 있습니다.</p>
            </div>
          )}
          <input ref={fileInputRef} type="file" id="poster-upload" className="hidden" accept="image/*" onChange={handleImageChange} />
          <div className="flex flex-col items-center justify-center min-h-[350px]">
            {imagePreviews.length > 0 ? (
              <div className="flex flex-col items-center gap-4">
                <div className="grid w-full max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
                  {imagePreviews.map((preview, index) => (
                    <div key={preview} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview} alt={`포스터 미리보기 ${index + 1}`} className="h-[320px] w-full rounded-[2rem] border-4 border-white object-contain shadow-2xl" />
                      <button
                        type="button"
                        onClick={() => removeSelectedImage(index)}
                        className="absolute right-3 top-3 rounded-xl bg-white/95 px-3 py-1.5 text-[11px] font-black text-gray-600 shadow-lg"
                      >
                        제거
                      </button>
                      {index === 0 && (
                        <span className="absolute left-3 top-3 rounded-xl bg-blue-600 px-3 py-1.5 text-[11px] font-black text-white shadow-lg">
                          대표
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={clearSelectedImage}
                    className="px-5 py-2.5 rounded-2xl bg-gray-100 text-gray-600 text-xs font-black hover:bg-gray-200 transition-colors"
                  >
                    사진 제거
                  </button>
                  {imagePreviews.length < 2 && (
                    <label htmlFor="poster-upload" className="cursor-pointer flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-blue-50 text-blue-600 text-xs font-black hover:bg-blue-100 transition-colors">
                      <Camera size={14} /> 사진 추가
                    </label>
                  )}
                </div>
              </div>
            ) : (
              <label htmlFor="poster-upload" className="cursor-pointer text-center">
                <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-5 group-hover:scale-110 transition-transform">
                  <Camera size={36} />
                </div>
                <p className="text-gray-900 font-black text-lg">포스터 사진 촬영 또는 업로드</p>
                <p className="text-gray-400 text-sm mt-1 font-bold italic">앞/뒤 이미지가 있으면 최대 2장까지 등록할 수 있습니다.</p>
              </label>
            )}
          </div>
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
              {regions.map(r => <option key={r.id} value={r.id}>{getRegionLabel(r)}</option>)}
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
          <div className="md:col-span-2">
            <label className="text-xs font-black text-gray-400 uppercase mb-2 block px-1">SUMMARY</label>
            <textarea value={formData.summaryShort} onChange={(e) => setFormData({...formData, summaryShort: e.target.value})} rows={3} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-100 text-gray-900 resize-none" placeholder="공고 핵심 내용을 2~3문장으로 요약해주세요." />
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
