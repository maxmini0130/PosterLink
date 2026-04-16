"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";

export default function NewPosterPage() {
  const [formData, setFormData] = useState({
    title: "",
    source_org_name: "",
    region: "전국",
    category: "지원금/복지",
    application_end_at: "",
    official_link: "",
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let imagePath = "";
    if (imageFile) {
      const fileName = `${Date.now()}_${imageFile.name}`;
      const { data, error } = await supabase.storage.from("poster-originals").upload(fileName, imageFile);
      if (data) imagePath = data.path;
      if (error) { alert(error.message); setLoading(false); return; }
    }

    const { error } = await supabase.from("posters").insert({
      title: formData.title,
      source_org_name: formData.source_org_name,
      status: "draft",
      application_end_at: formData.application_end_at ? new Date(formData.application_end_at).toISOString() : null,
      created_by: user.id,
    });

    if (error) alert(error.message);
    else {
      alert("초안이 저장되었습니다.");
      router.push("/operator/posters");
    }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-8">새 포스터 등록</h1>
      
      <form onSubmit={handleUpload} className="space-y-6 bg-white p-8 rounded-2xl shadow-sm">
        {/* Image Upload Placeholder */}
        <div className="border-2 border-dashed rounded-xl p-10 text-center hover:border-primary transition-colors cursor-pointer">
          <input type="file" onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="hidden" id="poster-image" />
          <label htmlFor="poster-image" className="cursor-pointer">
            {imageFile ? imageFile.name : "포스터 이미지를 선택하세요 (PNG, JPG)"}
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-bold mb-1">제목</label>
            <input type="text" value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl" required />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">기관명</label>
            <input type="text" value={formData.source_org_name} onChange={(e) => setFormData({...formData, source_org_name: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl" required />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">마감일</label>
            <input type="date" value={formData.application_end_at} onChange={(e) => setFormData({...formData, application_end_at: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl" />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">지역</label>
            <select className="w-full p-3 bg-gray-50 rounded-xl">
              <option>전국</option>
              <option>서울</option>
              <option>경기</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">카테고리</label>
            <select className="w-full p-3 bg-gray-50 rounded-xl">
              <option>지원금/복지</option>
              <option>교육/취업</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold mb-1">공식 홈페이지 링크</label>
          <input type="url" value={formData.official_link} onChange={(e) => setFormData({...formData, official_link: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl" placeholder="https://..." />
        </div>

        <div className="flex gap-3 pt-4">
          <button type="button" onClick={() => router.back()} className="flex-1 py-4 border font-bold rounded-xl">취소</button>
          <button type="submit" disabled={loading} className="flex-1 py-4 bg-primary text-white font-bold rounded-xl shadow-lg">
            {loading ? "저장 중..." : "초안 저장"}
          </button>
        </div>
      </form>
    </div>
  );
}
