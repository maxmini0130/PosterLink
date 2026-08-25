"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, Check, Send, X } from "lucide-react";

type FieldReportButtonProps = {
  posterId: string;
  fieldKey: string;
  label: string;
};

export function FieldReportButton({ posterId, fieldKey, label }: FieldReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const response = await fetch("/api/field-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posterId, fieldKey, note }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "신고 접수에 실패했습니다.");
      toast.success("정보 신고가 접수되었습니다.");
      setOpen(false);
      setNote("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "신고 접수에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-300 transition-colors hover:bg-amber-50 hover:text-amber-600"
        title={`${label} 정보 신고`}
        aria-label={`${label} 정보 신고`}
      >
        <AlertTriangle size={14} />
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50 p-3 sm:col-span-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-black text-amber-700">{label} 정보가 부정확한가요?</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full p-1 text-amber-500 hover:bg-white"
          aria-label="닫기"
        >
          <X size={14} />
        </button>
      </div>
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="무엇이 다른지 간단히 알려주세요."
        className="mb-2 w-full resize-none rounded-lg border border-amber-100 bg-white px-3 py-2 text-xs font-medium text-gray-800 outline-none focus:ring-2 focus:ring-amber-200"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-amber-700 disabled:bg-gray-300"
        >
          {loading ? <Check size={13} /> : <Send size={13} />}
          {loading ? "접수 중" : "신고"}
        </button>
      </div>
    </div>
  );
}
