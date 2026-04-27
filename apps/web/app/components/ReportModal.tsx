"use client";

import { useState } from "react";
import { AlertTriangle, X, Send } from "lucide-react";

interface ReportModalProps {
  title?: string;
  onSubmit: (reasonCode: string, reasonDetail: string) => Promise<void>;
  onClose: () => void;
}

const REASON_OPTIONS = [
  { code: "obscene", label: "욕설/혐오 표현" },
  { code: "false_info", label: "허위 정보" },
  { code: "spam", label: "광고/스팸" },
  { code: "illegal", label: "불법 콘텐츠" },
  { code: "other", label: "기타" },
];

export function ReportModal({ title = "신고하기", onSubmit, onClose }: ReportModalProps) {
  const [reasonCode, setReasonCode] = useState("other");
  const [reasonDetail, setReasonDetail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await onSubmit(reasonCode, reasonDetail);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-50 rounded-xl flex items-center justify-center">
              <AlertTriangle size={16} className="text-orange-500" />
            </div>
            <h2 className="text-lg font-black text-gray-900">{title}</h2>
          </div>
          <button onClick={onClose} className="p-2 text-gray-300 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-xs font-black text-gray-400 uppercase mb-3 block">신고 유형</label>
            <div className="grid grid-cols-2 gap-2">
              {REASON_OPTIONS.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => setReasonCode(opt.code)}
                  className={`py-3 px-4 text-sm font-black rounded-2xl transition-all ${
                    reasonCode === opt.code
                      ? "bg-orange-500 text-white shadow-lg shadow-orange-100"
                      : "bg-gray-50 text-gray-500 hover:bg-orange-50 hover:text-orange-500"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-black text-gray-400 uppercase mb-2 block">상세 사유 (선택)</label>
            <textarea
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              placeholder="신고 사유를 구체적으로 입력해주세요."
              rows={3}
              className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-medium text-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-orange-100 outline-none resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-100 disabled:bg-gray-200"
          >
            <Send size={16} /> {loading ? "접수 중..." : "신고 접수"}
          </button>
        </form>
      </div>
    </div>
  );
}
