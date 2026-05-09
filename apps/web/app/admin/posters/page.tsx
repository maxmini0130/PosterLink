"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Check,
  CheckSquare,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  PencilLine,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { fetchCategoryRegionNames } from "../../lib/posterHelpers";
import { resolvePosterImageUrl } from "../../../lib/posterImage";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

type PosterStatus = "review" | "published" | "rejected" | "draft";

export default function AdminPostersPage() {
  const [posters, setPosters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFilter, setCurrentFilter] = useState<PosterStatus>("review");
  const [rejectModal, setRejectModal] = useState<{ id: string; title: string } | null>(null);
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [previewPoster, setPreviewPoster] = useState<any | null>(null);

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

    setSelectedIds([]);
    setLoading(false);
  };

  useEffect(() => {
    fetchPosters(currentFilter);
  }, [currentFilter]);

  const handleReject = async () => {
    if (!rejectModal) return;
    setRejecting(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("posters")
      .update({ poster_status: "rejected", rejection_reason: rejectReason.trim() || null })
      .eq("id", rejectModal.id);
    if (error) {
      toast.error(error.message);
    } else {
      await supabase.from("admin_actions").insert({
        actor_user_id: user?.id ?? null,
        target_type: "poster",
        target_id: rejectModal.id,
        action_type: "reject",
        action_reason: rejectReason.trim() || null,
        metadata_json: { title: rejectModal.title },
      });
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

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("posters")
      .update({
        poster_status: newStatus,
        published_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    await supabase.from("admin_actions").insert({
      actor_user_id: user?.id ?? null,
      target_type: "poster",
      target_id: id,
      action_type: "approve",
      metadata_json: { status: newStatus },
    });

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

  const selectablePosters = posters.filter((poster) => poster.poster_status !== "published");
  const selectableIds = selectablePosters.map((poster) => poster.id);
  const selectedCount = selectedIds.length;
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : selectableIds);
  };

  const togglePosterSelection = (id: string) => {
    setSelectedIds((ids) => ids.includes(id) ? ids.filter((selectedId) => selectedId !== id) : [...ids, id]);
  };

  const handleBulkApprove = async () => {
    if (selectedCount === 0) return;
    if (!confirm(`선택한 ${selectedCount}건을 승인하시겠습니까? 즉시 서비스에 반영됩니다.`)) return;

    setBulkProcessing(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("posters")
      .update({
        poster_status: "published",
        published_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .in("id", selectedIds);

    if (error) {
      toast.error(error.message);
      setBulkProcessing(false);
      return;
    }

    await supabase.from("admin_actions").insert(selectedIds.map((id) => ({
      actor_user_id: user?.id ?? null,
      target_type: "poster",
      target_id: id,
      action_type: "approve",
      metadata_json: { status: "published", bulk: true },
    })));

    toast.success(`${selectedCount}건을 승인했습니다.`);
    setSelectedIds([]);
    setBulkProcessing(false);
    fetchPosters(currentFilter);
  };

  const handleBulkReject = async () => {
    if (selectedCount === 0) return;

    setBulkProcessing(true);
    const { data: { user } } = await supabase.auth.getUser();
    const reason = rejectReason.trim() || null;
    const { error } = await supabase
      .from("posters")
      .update({
        poster_status: "rejected",
        rejection_reason: reason,
      })
      .in("id", selectedIds);

    if (error) {
      toast.error(error.message);
      setBulkProcessing(false);
      return;
    }

    await supabase.from("admin_actions").insert(selectedIds.map((id) => ({
      actor_user_id: user?.id ?? null,
      target_type: "poster",
      target_id: id,
      action_type: "reject",
      action_reason: reason,
      metadata_json: { bulk: true },
    })));

    toast.success(`${selectedCount}건을 반려했습니다.`);
    setBulkRejectOpen(false);
    setRejectReason("");
    setSelectedIds([]);
    setBulkProcessing(false);
    fetchPosters(currentFilter);
  };

  const handleDeleteRejected = async (poster: any) => {
    if (poster.poster_status !== "rejected") {
      toast.error("반려된 포스터만 완전 삭제할 수 있습니다.");
      return;
    }

    if (!confirm(`반려된 포스터를 완전 삭제할까요?\n\n${poster.title}\n\n삭제하면 다음 크롤링에서 새 항목으로 다시 들어올 수 있고, 연결된 링크/카테고리/조회 로그도 함께 삭제됩니다.`)) {
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("posters")
      .delete()
      .eq("id", poster.id)
      .eq("poster_status", "rejected");

    if (error) {
      toast.error(error.message);
      return;
    }

    await supabase.from("admin_actions").insert({
      actor_user_id: user?.id ?? null,
      target_type: "poster",
      target_id: poster.id,
      action_type: "delete",
      action_reason: "rejected poster permanently deleted",
      metadata_json: {
        title: poster.title,
        status: "rejected",
        source_key: poster.source_key ?? null,
      },
    });

    toast.success("반려 포스터를 완전 삭제했습니다.");
    setPreviewPoster((current: any | null) => current?.id === poster.id ? null : current);
    fetchPosters(currentFilter);
  };

  const handleBulkDeleteRejected = async () => {
    const rejectedPosters = posters.filter((poster) => selectedIds.includes(poster.id) && poster.poster_status === "rejected");
    if (rejectedPosters.length === 0) return;

    if (!confirm(`선택한 반려 포스터 ${rejectedPosters.length}건을 완전 삭제할까요?\n\n삭제하면 다음 크롤링에서 새 항목으로 다시 들어올 수 있고, 연결된 데이터도 함께 삭제됩니다.`)) {
      return;
    }

    setBulkProcessing(true);
    const { data: { user } } = await supabase.auth.getUser();
    const ids = rejectedPosters.map((poster) => poster.id);
    const { error } = await supabase
      .from("posters")
      .delete()
      .in("id", ids)
      .eq("poster_status", "rejected");

    if (error) {
      toast.error(error.message);
      setBulkProcessing(false);
      return;
    }

    await supabase.from("admin_actions").insert(rejectedPosters.map((poster) => ({
      actor_user_id: user?.id ?? null,
      target_type: "poster",
      target_id: poster.id,
      action_type: "delete",
      action_reason: "rejected poster permanently deleted",
      metadata_json: {
        title: poster.title,
        status: "rejected",
        source_key: poster.source_key ?? null,
        bulk: true,
      },
    })));

    toast.success(`반려 포스터 ${rejectedPosters.length}건을 완전 삭제했습니다.`);
    setSelectedIds([]);
    setBulkProcessing(false);
    fetchPosters(currentFilter);
  };

  const tabs: { label: string; value: PosterStatus }[] = [
    { label: "검수 대기", value: "review" },
    { label: "승인 완료", value: "published" },
    { label: "반려됨", value: "rejected" },
    { label: "임시 저장", value: "draft" },
  ];

  return (
    <>
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

      {posters.length > 0 && (
        <div className="mb-6 flex flex-col gap-3 rounded-[2rem] border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={toggleSelectAll}
            disabled={selectableIds.length === 0 || bulkProcessing}
            className="flex items-center gap-3 text-sm font-black text-gray-600 transition-colors hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:text-indigo-400"
          >
            {allSelected ? <CheckSquare size={20} className="text-indigo-600" /> : <Square size={20} />}
            전체 선택
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-400 dark:bg-slate-800">
              {selectedCount}/{selectableIds.length}
            </span>
          </button>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleBulkApprove}
              disabled={selectedCount === 0 || bulkProcessing}
              className="flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-xs font-black text-white shadow-lg shadow-indigo-100 transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:shadow-none"
            >
              <Check size={16} />
              선택 승인
            </button>
            <button
              type="button"
              onClick={() => { setRejectReason(""); setBulkRejectOpen(true); }}
              disabled={selectedCount === 0 || bulkProcessing}
              className="flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-black text-rose-500 transition-all hover:bg-rose-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-300 dark:bg-rose-900/10 dark:hover:bg-rose-900/20"
            >
              <X size={16} />
              선택 반려
            </button>
            {currentFilter === "rejected" && (
              <button
                type="button"
                onClick={handleBulkDeleteRejected}
                disabled={selectedCount === 0 || bulkProcessing}
                className="flex items-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-xs font-black text-white transition-all hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-300"
              >
                <Trash2 size={16} />
                선택 완전 삭제
              </button>
            )}
          </div>
        </div>
      )}

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
              className={`group flex flex-col gap-8 rounded-[2.5rem] border bg-white p-8 shadow-sm transition-all hover:shadow-md dark:bg-slate-900 dark:hover:shadow-indigo-900/10 md:flex-row md:items-start ${
                selectedIds.includes(poster.id)
                  ? "border-indigo-300 ring-4 ring-indigo-50 dark:border-indigo-500 dark:ring-indigo-950"
                  : "border-gray-100 dark:border-slate-800"
              }`}
            >
              {poster.poster_status !== "published" && (
                <button
                  type="button"
                  onClick={() => togglePosterSelection(poster.id)}
                  disabled={bulkProcessing}
                  className="self-start rounded-2xl bg-gray-50 p-3 text-gray-300 transition-colors hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-40 dark:bg-slate-800 dark:hover:bg-indigo-900/20"
                  title="선택"
                  aria-label="선택"
                >
                  {selectedIds.includes(poster.id) ? <CheckSquare size={22} /> : <Square size={22} />}
                </button>
              )}

              <div className="group/img relative flex w-full flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 aspect-[3/4] md:w-32 dark:border-slate-700 dark:bg-slate-800">
                {resolvePosterImageUrl(poster.thumbnail_url, poster.source_key) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolvePosterImageUrl(poster.thumbnail_url, poster.source_key) ?? ""}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover/img:scale-110"
                    alt="Poster"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-4 dark:from-slate-800 dark:via-slate-900 dark:to-indigo-950">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 text-indigo-500 shadow-sm dark:bg-slate-950/60 dark:text-indigo-300">
                      <FileText size={22} />
                    </div>
                    <div>
                      <p className="mb-1 line-clamp-1 text-[10px] font-black text-indigo-400">{poster.source_org_name || "PosterLink"}</p>
                      <p className="line-clamp-4 text-sm font-black leading-snug text-slate-800 dark:text-slate-100">{poster.title}</p>
                    </div>
                  </div>
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

                <button
                  onClick={() => setPreviewPoster(poster)}
                  title="검수 미리보기"
                  aria-label="검수 미리보기"
                  className="rounded-2xl bg-indigo-50 p-4 text-indigo-600 transition-all hover:bg-indigo-100 dark:bg-indigo-900/10 dark:text-indigo-400 dark:hover:bg-indigo-900/30"
                >
                  <Eye size={20} />
                </button>

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

                {poster.poster_status === "rejected" && (
                  <button
                    onClick={() => handleDeleteRejected(poster)}
                    title="완전 삭제"
                    aria-label="완전 삭제"
                    className="rounded-2xl bg-red-600 p-4 text-white shadow-xl shadow-red-100 transition-all hover:bg-red-700 dark:shadow-none"
                  >
                    <Trash2 size={20} />
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

      {bulkRejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-6">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-2xl dark:bg-slate-900">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-rose-50 rounded-2xl flex items-center justify-center">
                <X size={20} className="text-rose-500" />
              </div>
              <h3 className="text-lg font-black text-gray-900 dark:text-white">선택 포스터 반려</h3>
            </div>
            <p className="text-sm text-gray-400 mb-5 ml-[52px]">
              선택한 {selectedCount}건을 반려합니다.
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
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setBulkRejectOpen(false); setRejectReason(""); }}
                disabled={bulkProcessing}
                className="flex-1 py-4 border border-gray-200 text-gray-500 font-black rounded-2xl hover:bg-gray-50 transition-all disabled:opacity-50 dark:border-slate-700 dark:text-slate-400"
              >
                취소
              </button>
              <button
                onClick={handleBulkReject}
                disabled={bulkProcessing || selectedCount === 0}
                className="flex-1 py-4 bg-rose-500 text-white font-black rounded-2xl hover:bg-rose-600 transition-all disabled:opacity-50"
              >
                {bulkProcessing ? "처리 중..." : "선택 반려"}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewPoster && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5 dark:border-slate-800">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-indigo-500">Review Preview</p>
                <h3 className="mt-1 text-xl font-black leading-tight text-gray-900 dark:text-white">{previewPoster.title}</h3>
                <p className="mt-1 text-sm font-bold text-gray-400">{previewPoster.source_org_name || "기관 미상"}</p>
              </div>
              <button
                onClick={() => setPreviewPoster(null)}
                className="rounded-2xl bg-gray-50 p-3 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:bg-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label="닫기"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid flex-1 overflow-y-auto md:grid-cols-[minmax(280px,420px)_1fr]">
              <div className="bg-gray-50 p-5 dark:bg-slate-900">
                <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-950">
                  {resolvePosterImageUrl(previewPoster.thumbnail_url, previewPoster.source_key) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolvePosterImageUrl(previewPoster.thumbnail_url, previewPoster.source_key) ?? ""} alt={previewPoster.title} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-6 dark:from-slate-800 dark:via-slate-900 dark:to-indigo-950">
                      <FileText className="text-indigo-500" size={40} />
                      <p className="text-2xl font-black leading-tight text-slate-800 dark:text-slate-100">{previewPoster.title}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6 p-6">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-300">
                    {previewPoster.poster_status}
                  </span>
                  <span className="rounded-full bg-gray-50 px-3 py-1.5 text-xs font-black text-gray-500 dark:bg-slate-900 dark:text-slate-400">
                    {previewPoster.categoryName || "기타"}
                  </span>
                  <span className="rounded-full bg-gray-50 px-3 py-1.5 text-xs font-black text-gray-500 dark:bg-slate-900 dark:text-slate-400">
                    {previewPoster.regionName || "지역 미상"}
                  </span>
                </div>

                <div className="grid gap-3 text-sm">
                  <div className="rounded-2xl border border-gray-100 p-4 dark:border-slate-800">
                    <p className="mb-1 text-xs font-black text-gray-400">마감일</p>
                    <p className="font-bold text-gray-900 dark:text-white">
                      {previewPoster.application_end_at ? new Date(previewPoster.application_end_at).toLocaleDateString() : "상시"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 p-4 dark:border-slate-800">
                    <p className="mb-1 text-xs font-black text-gray-400">등록일</p>
                    <p className="font-bold text-gray-900 dark:text-white">{new Date(previewPoster.created_at).toLocaleString()}</p>
                  </div>
                  {previewPoster.summary_short && (
                    <div className="rounded-2xl border border-gray-100 p-4 dark:border-slate-800">
                      <p className="mb-2 text-xs font-black text-gray-400">요약</p>
                      <p className="whitespace-pre-wrap text-sm font-bold leading-relaxed text-gray-700 dark:text-slate-200">
                        {previewPoster.summary_short}
                      </p>
                    </div>
                  )}
                  {previewPoster.source_key && (
                    <a
                      href={previewPoster.source_key}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-fit items-center gap-2 rounded-2xl bg-gray-900 px-4 py-3 text-xs font-black text-white transition-colors hover:bg-black dark:bg-white dark:text-slate-950"
                    >
                      <ExternalLink size={15} />
                      원문 열기
                    </a>
                  )}
                </div>

                {previewPoster.poster_status !== "published" && (
                  <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-5 dark:border-slate-800">
                    <button
                      onClick={() => {
                        setPreviewPoster(null);
                        void handleStatusChange(previewPoster.id, "published");
                      }}
                      className="flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-indigo-700"
                    >
                      <Check size={17} />
                      승인
                    </button>
                    <button
                      onClick={() => {
                        const poster = previewPoster;
                        setPreviewPoster(null);
                        handleStatusChange(poster.id, "rejected", poster.title);
                      }}
                      className="flex items-center gap-2 rounded-2xl bg-rose-50 px-5 py-3 text-sm font-black text-rose-500 transition-colors hover:bg-rose-100 dark:bg-rose-900/10 dark:hover:bg-rose-900/20"
                    >
                      <X size={17} />
                      반려
                    </button>
                    <Link
                      href={`/operator/posters/${previewPoster.id}/edit?returnTo=admin`}
                      className="flex items-center gap-2 rounded-2xl bg-blue-50 px-5 py-3 text-sm font-black text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-900/10 dark:text-blue-400 dark:hover:bg-blue-900/20"
                    >
                      <PencilLine size={17} />
                      수정
                    </Link>
                    {previewPoster.poster_status === "rejected" && (
                      <button
                        onClick={() => {
                          void handleDeleteRejected(previewPoster);
                        }}
                        className="flex items-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-red-700"
                      >
                        <Trash2 size={17} />
                        완전 삭제
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
