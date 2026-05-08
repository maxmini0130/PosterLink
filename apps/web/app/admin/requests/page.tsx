"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "../../lib/supabase";
import { Check, X, MapPin, FileText, Clock, User, Star, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";

const POINTS_PER_APPROVAL = 50;

type RequestStatus = "pending" | "approved" | "rejected";

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RequestStatus>("pending");
  const [rejectModal, setRejectModal] = useState<{ id: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);

  const fetchRequests = async (status: RequestStatus) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("poster_requests")
      .select("*, profiles!poster_requests_requester_id_fkey(nickname, email)")
      .eq("status", status)
      .order("created_at", { ascending: status === "pending" });

    if (error) {
      toast.error("데이터 로드 실패");
    } else {
      setRequests(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests(filter);
  }, [filter]);

  const handleApprove = async (req: any) => {
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. 요청 상태 승인으로 변경
      const { error: reqErr } = await supabase
        .from("poster_requests")
        .update({ status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
        .eq("id", req.id);
      if (reqErr) throw reqErr;

      // 2. 포인트 적립 (point_logs + profiles.points 갱신)
      if (req.requester_id) {
        const { error: logErr } = await supabase
          .from("point_logs")
          .insert({
            user_id: req.requester_id,
            amount: POINTS_PER_APPROVAL,
            reason: "poster_request_approved",
            ref_id: req.id,
          });
        if (logErr) throw logErr;

        const { error: pointErr } = await supabase.rpc("increment_points", {
          p_user_id: req.requester_id,
          p_amount: POINTS_PER_APPROVAL,
        });
        // RPC가 없으면 직접 업데이트
        if (pointErr) {
          const { data: profile } = await supabase.from("profiles").select("points").eq("id", req.requester_id).single();
          await supabase.from("profiles").update({ points: (profile?.points ?? 0) + POINTS_PER_APPROVAL }).eq("id", req.requester_id);
        }
      }

      toast.success(`승인 완료! ${req.profiles?.nickname ?? "사용자"}에게 ${POINTS_PER_APPROVAL}포인트 적립`);
      fetchRequests(filter);
    } catch (err: any) {
      toast.error("오류: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("poster_requests")
        .update({
          status: "rejected",
          rejection_reason: rejectReason.trim() || null,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", rejectModal.id);
      if (error) throw error;

      toast.success("반려 처리 완료");
      setRejectModal(null);
      setRejectReason("");
      fetchRequests(filter);
    } catch (err: any) {
      toast.error("오류: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const tabs: { key: RequestStatus; label: string }[] = [
    { key: "pending", label: "대기중" },
    { key: "approved", label: "승인됨" },
    { key: "rejected", label: "반려됨" },
  ];

  return (
    <div>
      {/* 반려 모달 */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-black text-lg text-gray-900 dark:text-white mb-4">반려 사유</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="반려 사유를 입력하세요 (선택)"
              className="w-full p-3 bg-gray-50 dark:bg-slate-700 rounded-xl text-sm font-bold outline-none resize-none text-gray-900 dark:text-white placeholder:font-normal mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setRejectModal(null); setRejectReason(""); }}
                className="flex-1 py-3 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 rounded-xl font-black text-sm"
              >
                취소
              </button>
              <button
                onClick={handleReject}
                disabled={processing}
                className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-black text-sm disabled:opacity-50"
              >
                반려 확정
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white">등록 요청 관리</h1>
          <p className="text-gray-400 font-bold mt-1 text-sm">사용자가 보낸 포스터 등록 요청을 검토합니다.</p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-xl font-black text-sm transition-all ${
              filter === tab.key
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100 dark:shadow-none"
                : "bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-slate-700 hover:border-indigo-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-white dark:bg-slate-800 rounded-3xl animate-pulse border border-gray-100 dark:border-slate-700" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="py-24 text-center text-gray-400 font-bold text-sm bg-white dark:bg-slate-800 rounded-3xl border border-gray-100 dark:border-slate-700">
          {filter === "pending" ? "대기 중인 요청이 없습니다." : "해당 요청이 없습니다."}
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <div
              key={req.id}
              className="bg-white dark:bg-slate-800 rounded-3xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden"
            >
              <div className="flex flex-col md:flex-row gap-0">
                {/* 이미지 */}
                {req.image_url && (
                  <div className="md:w-48 md:shrink-0 relative">
                    <a href={req.image_url} target="_blank" rel="noopener noreferrer" className="block h-full">
                      <Image
                        src={req.image_url}
                        alt="요청 이미지"
                        width={192}
                        height={160}
                        className="w-full h-40 md:h-full object-cover"
                      />
                      <div className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-lg">
                        <ExternalLink size={12} />
                      </div>
                    </a>
                  </div>
                )}

                {/* 내용 */}
                <div className="flex-1 p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2 text-xs text-gray-400 font-bold">
                      <User size={13} />
                      <span>{req.profiles?.nickname ?? "알 수 없음"}</span>
                      <span className="text-gray-300 dark:text-gray-600">|</span>
                      <Clock size={13} />
                      <span>{new Date(req.created_at).toLocaleDateString()}</span>
                    </div>
                    {filter === "approved" && (
                      <span className="flex items-center gap-1 text-xs font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 px-2 py-1 rounded-lg">
                        <Star size={11} fill="currentColor" /> +{POINTS_PER_APPROVAL}P 적립됨
                      </span>
                    )}
                  </div>

                  {req.location && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 font-bold mb-2">
                      <MapPin size={13} className="text-gray-400 shrink-0" />
                      {req.location}
                    </div>
                  )}

                  <div className="flex items-start gap-1.5 text-sm text-gray-700 dark:text-gray-200 font-bold mb-4">
                    <FileText size={14} className="text-gray-400 shrink-0 mt-0.5" />
                    <p className="line-clamp-3">{req.description}</p>
                  </div>

                  {req.rejection_reason && (
                    <p className="text-xs text-rose-500 font-bold bg-rose-50 dark:bg-rose-900/20 rounded-xl px-3 py-2 mb-3">
                      반려 사유: {req.rejection_reason}
                    </p>
                  )}

                  {/* 액션 버튼 (대기중일 때만) */}
                  {filter === "pending" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(req)}
                        disabled={processing}
                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black text-xs disabled:opacity-50 transition-colors"
                      >
                        <Check size={14} /> 승인 (+{POINTS_PER_APPROVAL}P)
                      </button>
                      <button
                        onClick={() => setRejectModal({ id: req.id })}
                        disabled={processing}
                        className="flex items-center gap-1.5 px-4 py-2 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 text-rose-500 border border-rose-100 dark:border-rose-800 rounded-xl font-black text-xs disabled:opacity-50 transition-colors"
                      >
                        <X size={14} /> 반려
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
