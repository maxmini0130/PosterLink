"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import { Header } from "../../components/Header";
import { BottomNav } from "../../components/BottomNav";
import { Camera, ChevronLeft, Loader2, MapPin, FileText, Star } from "lucide-react";
import toast from "react-hot-toast";

export default function PosterRequestPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        toast.error("로그인이 필요합니다.");
        router.push("/login");
        return;
      }
      setUser(session.user);
    });
  }, [router]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return void toast.error("내용을 입력해주세요.");
    if (!user) return;

    setLoading(true);
    try {
      let imageUrl: string | null = null;

      if (imageFile) {
        const ext = imageFile.name.split(".").pop();
        const filePath = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("poster-requests")
          .upload(filePath, imageFile, { contentType: imageFile.type });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from("poster-requests").getPublicUrl(filePath);
        imageUrl = publicUrl;
      }

      const { error } = await supabase.from("poster_requests").insert({
        requester_id: user.id,
        image_url: imageUrl,
        location: location.trim() || null,
        description: description.trim(),
        status: "pending",
      });
      if (error) throw error;

      toast.success("등록 요청이 접수되었습니다! 검토 후 승인 시 50포인트가 적립됩니다.");
      router.push("/");
    } catch (err: any) {
      toast.error("오류 발생: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24 transition-colors duration-300">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">포스터 등록 요청</h1>
            <p className="text-sm text-gray-400 font-bold mt-0.5">승인 시 <span className="text-blue-600 dark:text-blue-400">50포인트</span> 적립</p>
          </div>
        </div>

        {/* 포인트 안내 */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <Star size={18} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" fill="currentColor" />
          <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
            아직 등록되지 않은 포스터를 발견했나요? 사진과 정보를 보내주시면 관리자가 검토 후 게시합니다. 승인되면 50포인트를 드려요!
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 사진 업로드 */}
          <section className="bg-white dark:bg-slate-800 rounded-[2rem] border-2 border-dashed border-gray-100 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700 transition-all overflow-hidden">
            <input
              type="file"
              id="request-image"
              className="hidden"
              accept="image/*"
              onChange={handleImageChange}
            />
            <label htmlFor="request-image" className="cursor-pointer flex flex-col items-center justify-center min-h-[220px] p-6">
              {imagePreview ? (
                <div className="relative group w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="미리보기" className="w-full max-h-[300px] object-contain rounded-2xl" />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center">
                    <span className="bg-white text-gray-900 text-xs font-black px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-lg">
                      <Camera size={13} /> 사진 변경
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Camera size={28} />
                  </div>
                  <p className="font-black text-gray-700 dark:text-gray-200">포스터 사진 업로드</p>
                  <p className="text-xs text-gray-400 font-bold mt-1">선택사항 — 사진이 있으면 더 빠르게 처리됩니다</p>
                </div>
              )}
            </label>
          </section>

          {/* 장소 */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm">
            <label className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <MapPin size={13} /> 장소
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="예) 서울시 마포구 홍익대학교 앞 게시판"
              className="w-full p-3 bg-gray-50 dark:bg-slate-700 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-800 text-gray-900 dark:text-white placeholder:text-gray-400 placeholder:font-normal"
            />
          </div>

          {/* 내용 */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm">
            <label className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <FileText size={13} /> 내용 <span className="text-rose-400">*</span>
            </label>
            <div className="mb-3 rounded-2xl bg-gray-50 p-3 text-xs font-bold leading-relaxed text-gray-500 dark:bg-slate-700 dark:text-gray-300">
              예: 공고명, 주관기관, 신청 마감일, 신청 대상, 공식 홈페이지 주소를 아는 만큼 적어주세요.
            </div>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="포스터에 대해 알고 있는 내용을 적어주세요. (공고명, 주관기관, 마감일 등)"
              className="w-full p-3 bg-gray-50 dark:bg-slate-700 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-800 text-gray-900 dark:text-white placeholder:text-gray-400 placeholder:font-normal resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !description.trim()}
            className="w-full h-14 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-slate-700 text-white disabled:text-gray-400 font-black rounded-2xl shadow-lg shadow-blue-100 dark:shadow-none transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : "등록 요청 보내기"}
          </button>
        </form>
      </main>
      <BottomNav />
    </div>
  );
}
