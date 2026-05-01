"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Check,
  ExternalLink,
  Eye,
  FileCheck,
  Image as ImageIcon,
  PencilLine,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { fetchCategoryRegionNames } from "../../lib/posterHelpers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

type PosterStatus = "review" | "published" | "rejected" | "draft";

export default function AdminPostersPage() {
  const [posters, setPosters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFilter, setCurrentFilter] = useState<PosterStatus>("review");
  const [rejectModal, setRejectModal] = useState<{ id: string; title: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const fetchPosters = async (status: PosterStatus) => {
    setLoading(true);

    const { data, error } = await supabase
      .from("posters")
      .select("*")
      .eq("poster_status", status)
      .order("created_at", { ascending: status === "review" });

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    if (data) {
      const metaMap = await fetchCategoryRegionNames(data.map((poster: any) => poster.id));
      setPosters(data.map((poster: any) => ({ ...poster, ...metaMap[poster.id] })));
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchPosters(currentFilter);
  }, [currentFilter]);

  const handleReject = async () => {
    if (!rejectModal) return;
    setRejecting(true);
    const { error } = await supabase
      .from("posters")
      .update({ poster_status: "rejected", rejection_reason: rejectReason.trim() || null })
      .eq("id", rejectModal.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("반려 처리했습니다.");
      setRejectModal(null);
      setRejectReason("");
      fetchPosters(currentFilter);
    }
    setRejecting(false);
  };

  const handleStatusChange = async (id: string, newStatus: "published" | "rejected", posterTitle?: string) => {
    if (newStatus === "rejected") {
      setRejectReason("");
      setRejectModal({ id, title: posterTitle ?? id });
      return;
    }

    if (!confirm("승인하시겠습니까? 즉시 서비스에 반영됩니다.")) return;

    const { error } = await supabase
      .from("posters")
      .update({
        poster_status: newStatus,
        published_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    let pushSummary: string | null = null;

    if (newStatus === "published") {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        pushSummary = "포스터는 승인됐지만 푸시 알림을 보낼 세션이 없어 전송을 건너뛰었습니다.";
      } else {
        try {
          const response = await fetch(`${SUPABASE_URL}/functions/v1/notify-new-match`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ poster_id: id }),
          });

          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(payload?.error ?? "notify-new-match failed");
          }

          if (payload?.sentCount > 0) {
            pushSummary = `관심 사용자 ${payload.sentCount}명에게 푸시 알림을 보냈습니다.`;
          } else if (payload?.pendingCount === 0) {
            pushSummary = "새로 보낼 푸시 알림 대상이 없었습니다.";
          } else {
            pushSummary = "알림 대상은 있었지만 유효한 푸시 토큰이 없어 앱 푸시는 보내지 못했습니다.";
          }
        } catch (notifyError: any) {
          console.warn("notify-new-match push failed:", notifyError);
          pushSummary = `포스터는 승인됐지만 푸시 알림 전송 중 오류가 발생했습니다. (${notifyError.message})`;
        }
      }
    }

    toast.success(newStatus === "published" ? "승인 완료!" : "반려 처리했습니다.");
    if (pushSummary) {
      toast(pushSummary, { icon: "📣" });
    }

    fetchPosters(currentFilter);
  };

  const tabs: { label: string; value: PosterStatus }[] = [
    { label: "검수 대기", value: "review" },
    { label: "승인 완료", value: "published" },
    { label: "반려됨", value: "rejected" },
    { label: "임시 저장", value: "draft" },
  ];

  return (
    <div className="max-w-6xl mx-auto pb-20">
      <div className="mb-10 flex flex-col gap-6 justify-between md:flex-row md:items-end">
        <div>
          <h1 className="text-4xl font-black italic tracking-tight text-gray-900 dark:text-white">
            Poster Verification
          </h1>
          <p className="mt-2 font-bold text-gray-400 dark:text-slate-500">
            운영자가 등록된 포스터 정보를 확인하고 최종 게시 여부를 결정합니다.
          </p>
        </div>
      </div>

      <div className="mb-8 flex w-fit flex-wrap gap-2 rounded-[1.5rem] bg-gray-100 p-1.5 dark:bg-slate-900">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setCurrentFilter(tab.value)}
            className={`rounded-2xl px-6 py-3 text-sm font-black transition-all ${
              currentFilter === tab.value
                ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-400"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-[2.5rem] border border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-900"
            />
          ))}
        </div>
      ) : posters.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {posters.map((poster) => (
            <div
              key={poster.id}
              className="group flex flex-col gap-8 rounded-[2.5rem] border border-gray-100 bg-white p-8 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:shadow-indigo-900/10 md:flex-row md:items-start"
            >
              <div className="group/img relative flex w-full flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 aspect-[3/4] md:w-32 dark:border-slate-700 dark:bg-slate-800">
                {poster.thumbnail_url ? (
                  <Image
                    src={poster.thumbnail_url}
                    fill
                    sizes="128px"
                    className="object-cover transition-transform duration-500 group-hover/img:scale-110"
                    alt="Poster"
                  />
                ) : (
                  <ImageIcon className="text-gray-200 dark:text-slate-700" size={32} />
                )}

                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/img:opacity-100">
                  <Eye className="text-white" size={24} />
                </div>
              </div>

              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                      poster.poster_status === "published"
                        ? "bg-green-50 text-green-600 dark:bg-green-900/20"
                        : poster.poster_status === "rejected"
                          ? "bg-rose-50 text-rose-600 dark:bg-rose-900/20"
                          : "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20"
                    }`}
                  >
                    {poster.poster_status.replace("_", " ")}
                  </span>
                  <span className="text-[11px] font-bold italic text-gray-400 dark:text-slate-500">
                    {new Date(poster.created_at).toLocaleDateString()} 등록 요청
                  </span>
                </div>

                <h3 className="text-2xl font-black leading-tight text-gray-900 dark:text-white">
                  {poster.title}
                </h3>
                <p className="flex items-center gap-2 text-sm font-bold text-gray-500 dark:text-slate-400">
                  <span className="text-indigo-500">@{poster.source_org_name}</span>
                  <span className="h-1 w-1 rounded-full bg-gray-300" />
                  <span>{poster.regionName || "광역"}</span>
                </p>

                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-gray-100 bg-gray-50 px-3 py-1 text-[11px] font-black text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                    분야: {poster.categoryName || "기타"}
                  </span>
                  <span className="rounded-full border border-gray-100 bg-gray-50 px-3 py-1 text-[11px] font-black text-gray-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                    마감: {poster.application_end_at ? new Date(poster.application_end_at).toLocaleDateString() : "상시"}
                  </span>
                </div>
              </div>

              <div className="flex w-full flex-row justify-end gap-3 pt-2 md:w-auto md:flex-col">
                <Link
                  href={`/posters/${poster.id}`}
                  target="_blank"
                  title="공개 상세 보기"
                  aria-label="공개 상세 보기"
                  className="rounded-2xl border border-transparent bg-gray-50 p-4 text-gray-400 transition-all hover:border-gray-200 hover:bg-gray-100 dark:bg-slate-800 dark:text-slate-500 dark:hover:border-slate-600 dark:hover:bg-slate-700"
                >
                  <ExternalLink size={20} />
                </Link>

                <Link
                  href={`/operator/posters/${poster.id}/edit?returnTo=admin`}
                  title="포스터 수정"
                  aria-label="포스터 수정"
                  className="rounded-2xl bg-blue-50 p-4 text-blue-600 transition-all hover:bg-blue-100 dark:bg-blue-900/10 dark:text-blue-400 dark:hover:bg-blue-900/30"
                >
                  <PencilLine size={20} />
                </Link>

                {poster.poster_status !== "rejected" && (
                  <button
                    onClick={() => handleStatusChange(poster.id, "rejected", poster.title)}
                    title="반려"
                    aria-label="반려"
                    className="rounded-2xl bg-rose-50 p-4 text-rose-500 transition-all hover:bg-rose-100 dark:bg-rose-900/10 dark:hover:bg-rose-900/30"
                  >
                    <X size={20} />
                  </button>
                )}

                {poster.poster_status !== "published" && (
                  <button
                    onClick={() => handleStatusChange(poster.id, "published")}
                    title="승인"
                    aria-label="승인"
                    className="rounded-[1.5rem] bg-indigo-600 p-4 text-white shadow-xl shadow-indigo-100 transition-all hover:bg-indigo-700 dark:bg-indigo-500 dark:shadow-none dark:hover:bg-indigo-600 md:p-6"
                  >
                    <Check size={24} strokeWidth={3} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[3rem] border border-dashed border-gray-200 bg-white py-40 text-center dark:border-slate-800 dark:bg-slate-900">
          <FileCheck className="mx-auto mb-6 text-gray-200 dark:text-slate-800" size={64} />
          <p className="text-lg font-black text-gray-400 dark:text-slate-500">
            해당 조건의 포스터가 없습니다.
          </p>
          <p className="mt-1 text-sm text-gray-300 dark:text-slate-600">
            모든 검수가 끝났거나 데이터가 비어 있습니다.
          </p>
        </div>
      )}
    </div>

      {/* 반려 사유 모달 */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-6">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-2xl dark:bg-slate-900">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-rose-50 rounded-2xl flex items-center justify-center">
                <X size={20} className="text-rose-500" />
              </div>
              <h3 className="text-lg font-black text-gray-900 dark:text-white">포스터 반려</h3>
            </div>
            <p className="text-sm text-gray-400 mb-5 ml-[52px]">
              <span className="font-semibold text-gray-600 dark:text-slate-300">{rejectModal.title}</span>
            </p>
            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                반려 사유 <span className="text-gray-400 font-normal">(선택)</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="예: 이미지 품질 불량, 정보 오류, 정책 위반 등"
                rows={3}
                className="w-full rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:ring-2 focus:ring-rose-200 resize-none dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              />
              <p className="text-xs text-gray-400 mt-1.5">입력한 사유는 등록자에게 표시될 수 있습니다.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setRejectModal(null); setRejectReason(""); }}
                disabled={rejecting}
                className="flex-1 py-4 border border-gray-200 text-gray-500 font-black rounded-2xl hover:bg-gray-50 transition-all disabled:opacity-50 dark:border-slate-700 dark:text-slate-400"
              >
                취소
              </button>
              <button
                onClick={handleReject}
                disabled={rejecting}
                className="flex-1 py-4 bg-rose-500 text-white font-black rounded-2xl hover:bg-rose-600 transition-all disabled:opacity-50"
              >
                {rejecting ? "처리 중..." : "반려하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
