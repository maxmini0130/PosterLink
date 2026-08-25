"use client";
import toast from "react-hot-toast";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";
import { Button } from "@posterlink/ui";
import { Camera, ChevronLeft, ImagePlus, Loader2, WandSparkles } from "lucide-react";
import { ImageCropper } from "../../../components/ImageCropper";
import { getCityRegions, getDistrictRegions, getRegionLabel, getSelectedCityId, getSelectedDistrictId } from "../../../lib/regionHelpers";

const TEMPLATE_PALETTES = [
  { accent: "#2563eb", dark: "#1e3a8a", soft: "#dbeafe" },
  { accent: "#059669", dark: "#064e3b", soft: "#d1fae5" },
  { accent: "#dc2626", dark: "#7f1d1d", soft: "#fee2e2" },
  { accent: "#7c3aed", dark: "#4c1d95", soft: "#ede9fe" },
];

function templatePaletteForText(text: string) {
  const seed = Array.from(text).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return TEMPLATE_PALETTES[seed % TEMPLATE_PALETTES.length];
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

function wrapCanvasLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);

  if (lines.length === maxLines && words.length > lines.join(" ").split(/\s+/).length) {
    let lastLine = `${lines[maxLines - 1]}...`;
    while (lastLine.length > 1 && ctx.measureText(lastLine).width > maxWidth) {
      lastLine = `${lastLine.slice(0, -4)}...`;
    }
    lines[maxLines - 1] = lastLine;
  }

  return lines;
}

function drawWrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const lines = wrapCanvasLines(ctx, text, maxWidth, maxLines);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

async function createTemplatePosterBlob({
  title,
  org,
  category,
  period,
  summary,
}: {
  title: string;
  org: string;
  category: string;
  period: string;
  summary: string;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("포스터 이미지를 만들 수 없습니다.");

  const palette = templatePaletteForText(`${title}${category}`);
  const fontFamily = `"Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", Arial, sans-serif`;

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = palette.accent;
  ctx.fillRect(0, 0, canvas.width, 420);
  ctx.fillStyle = palette.dark;
  ctx.globalAlpha = 0.18;
  ctx.beginPath();
  ctx.moveTo(690, 0);
  ctx.lineTo(1080, 0);
  ctx.lineTo(1080, 420);
  ctx.lineTo(520, 420);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(255,255,255,0.18)";
  roundedRect(ctx, 72, 72, 280, 58, 29);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 28px ${fontFamily}`;
  ctx.fillText((category || "공고").slice(0, 18), 104, 111);

  ctx.font = `900 ${title.length > 70 ? 58 : 66}px ${fontFamily}`;
  const titleBottom = drawWrappedText(ctx, title || "공고 제목", 72, 205, 900, 78, 5);
  ctx.font = `800 30px ${fontFamily}`;
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.fillText((org || "기관명").slice(0, 34), 72, Math.min(titleBottom + 35, 385));

  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, 72, 492, 936, 704, 24);
  ctx.fill();

  ctx.fillStyle = palette.soft;
  roundedRect(ctx, 112, 540, 856, 150, 20);
  ctx.fill();
  ctx.fillStyle = palette.dark;
  ctx.font = `900 28px ${fontFamily}`;
  ctx.fillText("신청 기간", 152, 595);
  ctx.font = `900 44px ${fontFamily}`;
  drawWrappedText(ctx, period || "원문 공고 확인", 152, 657, 780, 52, 2);

  ctx.fillStyle = "#111827";
  ctx.font = `900 34px ${fontFamily}`;
  ctx.fillText("주요 내용", 112, 770);
  ctx.fillStyle = "#334155";
  ctx.font = `800 38px ${fontFamily}`;
  drawWrappedText(ctx, summary || "자세한 내용은 원문 공고를 확인하세요.", 112, 840, 856, 56, 6);

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(112, 1092);
  ctx.lineTo(968, 1092);
  ctx.stroke();

  ctx.fillStyle = "#0f172a";
  ctx.font = `900 34px ${fontFamily}`;
  ctx.fillText("자세한 내용은 원문 공고를 확인하세요.", 112, 1155);

  ctx.fillStyle = palette.accent;
  roundedRect(ctx, 72, 1240, 250, 52, 26);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 25px ${fontFamily}`;
  ctx.fillText("PosterLink", 114, 1275);
  ctx.fillStyle = "#64748b";
  ctx.font = `800 24px ${fontFamily}`;
  ctx.fillText("공공 공고를 더 쉽게 모아보기", 348, 1275);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("포스터 이미지를 만들 수 없습니다."));
    }, "image/png");
  });
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
  const [imageSubmitError, setImageSubmitError] = useState("");
  const imageSubmitErrorRef = useRef<HTMLDivElement | null>(null);
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
    setImageSubmitError("");
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
    setImageSubmitError("");
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
  const [isDrafting, setIsDrafting] = useState(false);
  const [isTemplateGenerating, setIsTemplateGenerating] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftReview, setDraftReview] = useState<{ missingFields: string[]; ambiguousPhrases: string[] } | null>(null);

  const onCropComplete = (blob: Blob) => {
    setCroppedImageBlobs((blobs) => [...blobs, blob].slice(0, 2));
    setImagePreviews((previews) => [...previews, URL.createObjectURL(blob)].slice(0, 2));
    setImageSubmitError("");
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

  const generateSmartDraft = async () => {
    const sourceText = draftPrompt.trim();
    if (sourceText.length < 10) {
      toast.error("공고 초안으로 만들 내용을 조금 더 입력해주세요.");
      return;
    }

    setIsDrafting(true);
    setDraftReview(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/operator/posters/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ sourceText }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "AI 초안 생성에 실패했습니다.");
      }

      const draft = payload.draft ?? {};
      setFormData((prev) => ({
        ...prev,
        title: draft.title || prev.title,
        sourceOrgName: draft.sourceOrgName || prev.sourceOrgName,
        categoryId: draft.categoryId || prev.categoryId,
        regionId: draft.regionId || prev.regionId,
        appEndAt: draft.appEndAt || prev.appEndAt,
        summaryShort: draft.summaryShort || prev.summaryShort,
        officialLink: draft.officialLink || prev.officialLink,
      }));
      setDraftReview(payload.review ?? null);
      toast.success("AI 초안을 폼에 채웠습니다. 게시 전 사실관계를 확인해주세요.");
    } catch (err: any) {
      toast.error(err.message ?? "AI 초안 생성에 실패했습니다.");
    } finally {
      setIsDrafting(false);
    }
  };

  const generateTemplatePoster = async () => {
    if (!formData.title.trim()) {
      toast.error("포스터 제목을 먼저 입력해주세요.");
      return;
    }
    if (!formData.sourceOrgName.trim()) {
      toast.error("기관명을 먼저 입력해주세요.");
      return;
    }

    setIsTemplateGenerating(true);
    try {
      const categoryName = categories.find((category) => category.id === formData.categoryId)?.name ?? "공고";
      const period = formData.appEndAt ? `${formData.appEndAt} 마감` : "원문 공고 확인";
      const blob = await createTemplatePosterBlob({
        title: formData.title.trim(),
        org: formData.sourceOrgName.trim(),
        category: categoryName,
        period,
        summary: formData.summaryShort.trim() || "자세한 내용은 원문 공고를 확인하세요.",
      });

      imagePreviews.forEach((preview) => URL.revokeObjectURL(preview));
      setCroppedImageBlobs([blob]);
      setImagePreviews([URL.createObjectURL(blob)]);
      setOriginalImage(null);
      setShowCropper(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("폼 내용을 바탕으로 포스터 이미지를 만들었습니다.");
    } catch (err: any) {
      toast.error(err.message ?? "포스터 이미지를 만들지 못했습니다.");
    } finally {
      setIsTemplateGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (croppedImageBlobs.length === 0) {
      const message = "포스터 이미지를 포함하여 등록해주세요. 상단에서 이미지를 업로드하거나 자동 제작을 먼저 실행하세요.";
      setImageSubmitError(message);
      requestAnimationFrame(() => {
        imageSubmitErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        imageSubmitErrorRef.current?.focus();
      });
      toast.error(message, { duration: 6000 });
      return;
    }
    
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
          link_type: "official_notice",
          url: formData.officialLink,
          title: "공식 공고 원문",
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

  const selectedCityId = getSelectedCityId(formData.regionId, regions);
  const selectedDistrictId = getSelectedDistrictId(formData.regionId, regions);
  const districtRegions = getDistrictRegions(regions, selectedCityId || null);

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
        <section className="space-y-4 rounded-[2rem] border border-blue-100 bg-blue-50/40 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-black text-gray-900">
                <WandSparkles size={18} className="text-blue-600" />
                AI 공고 초안
              </h2>
              <p className="mt-1 text-xs font-bold leading-5 text-gray-500">
                원문 메모나 행사 정보를 붙여넣으면 등록 폼의 주요 항목을 먼저 채웁니다.
              </p>
            </div>
            <button
              type="button"
              onClick={generateSmartDraft}
              disabled={isDrafting}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-xs font-black text-white shadow-lg shadow-blue-100 transition-colors hover:bg-blue-700 disabled:bg-blue-200"
            >
              {isDrafting ? <Loader2 size={16} className="animate-spin" /> : <WandSparkles size={16} />}
              초안 채우기
            </button>
          </div>
          <textarea
            value={draftPrompt}
            onChange={(event) => setDraftPrompt(event.target.value)}
            rows={5}
            className="w-full resize-none rounded-2xl border border-blue-100 bg-white p-4 text-sm font-bold leading-6 text-gray-900 outline-none transition focus:ring-2 focus:ring-blue-100 placeholder:text-gray-300"
            placeholder="예: 마포구 청년 창업 교육 참여자 모집. 대상은 만 19~39세 예비창업자, 교육비 무료, 신청 마감은 2026-08-31, 문의는 일자리청년과..."
          />
          {draftReview && (draftReview.missingFields.length > 0 || draftReview.ambiguousPhrases.length > 0) && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-800">
              {draftReview.missingFields.length > 0 && (
                <p>확인 필요: {draftReview.missingFields.join(", ")}</p>
              )}
              {draftReview.ambiguousPhrases.length > 0 && (
                <p className="mt-1">모호한 표현: {draftReview.ambiguousPhrases.join(", ")}</p>
              )}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-[2rem] border border-indigo-100 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-black text-gray-900">
              <ImagePlus size={18} className="text-indigo-600" />
              포스터 이미지 자동 제작
            </h2>
            <p className="mt-1 text-xs font-bold leading-5 text-gray-500">
              입력된 제목, 기관, 마감일, 요약으로 검수용 기본 포스터 이미지를 만듭니다.
            </p>
          </div>
          <button
            type="button"
            onClick={generateTemplatePoster}
            disabled={isTemplateGenerating}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 text-xs font-black text-white shadow-lg shadow-indigo-100 transition-colors hover:bg-indigo-700 disabled:bg-indigo-200"
          >
            {isTemplateGenerating ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
            이미지 만들기
          </button>
        </section>

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
            <select value={selectedCityId} onChange={(e) => setFormData({...formData, regionId: e.target.value})} className="w-full p-4 bg-gray-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-100 appearance-none text-gray-900">
              <option value="">전국</option>
              {getCityRegions(regions).map(r => <option key={r.id} value={r.id}>{getRegionLabel(r)}</option>)}
            </select>
            {districtRegions.length > 0 && (
              <select value={selectedDistrictId} onChange={(e) => setFormData({...formData, regionId: e.target.value || selectedCityId})} className="mt-3 w-full p-4 bg-gray-50 border-none rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-100 appearance-none text-gray-900">
                <option value="">{getRegionLabel(regions.find((r) => r.id === selectedCityId))} 전체</option>
                {districtRegions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
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

        {imageSubmitError && (
          <div
            ref={imageSubmitErrorRef}
            tabIndex={-1}
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700 outline-none ring-0 focus-visible:ring-2 focus-visible:ring-rose-300"
          >
            {imageSubmitError}
          </div>
        )}
        <Button disabled={loading} className="w-full h-16 rounded-[2rem] border border-gray-950 bg-gray-950 text-lg font-black text-white shadow-2xl transition-all hover:bg-black disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-600">
          {loading ? <Loader2 className="animate-spin" /> : "보정된 포스터 등록하기"}
        </Button>
      </form>
    </div>
  );
}
