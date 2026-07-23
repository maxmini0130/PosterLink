"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ExternalLink,
  Inbox,
  Loader2,
  RefreshCcw,
  Send,
} from "lucide-react";

type AdminNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
  recipient_count?: number;
};

type CollectionAlert = {
  id: string;
  target_id: string;
  action_reason: string | null;
  metadata_json: Record<string, any> | null;
  created_at: string;
};

type ApiPayload = {
  notifications: AdminNotification[];
  collection_alerts: CollectionAlert[];
  error?: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function alertTone(severity?: string) {
  if (severity === "critical") return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100";
  return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100";
}

function getAdminPath(alert: CollectionAlert) {
  const metadata = alert.metadata_json ?? {};
  return typeof metadata.admin_path === "string" && metadata.admin_path.startsWith("/admin/")
    ? metadata.admin_path
    : `/admin/collection-sources${metadata.source_slug ? `?source=${encodeURIComponent(metadata.source_slug)}` : ""}`;
}

function extractAdminPathFromBody(body: string) {
  return body.match(/관리 링크:\s*(\/admin\/[^\s]+)/)?.[1] ?? "";
}

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [collectionAlerts, setCollectionAlerts] = useState<CollectionAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const unreadCollectionAlertCount = useMemo(() => collectionAlerts.length, [collectionAlerts.length]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/notifications", { cache: "no-store" });
      const payload = (await response.json()) as ApiPayload;
      if (!response.ok) throw new Error(payload.error ?? "알림을 불러오지 못했습니다.");
      setNotifications(payload.notifications ?? []);
      setCollectionAlerts(payload.collection_alerts ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "알림을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchNotifications();
  }, []);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("제목과 내용을 모두 입력하세요.");
      return;
    }
    if (!confirm("전체 사용자에게 시스템 공지를 발송할까요?")) return;

    setSending(true);
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "공지 발송에 실패했습니다.");

      toast.success(`${payload.recipient_count ?? 0}명에게 공지를 발송했습니다.`);
      setTitle("");
      setBody("");
      await fetchNotifications();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "공지 발송에 실패했습니다.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl pb-20">
      <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-indigo-500">Notifications</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-gray-950 dark:text-white">관리자 알림</h1>
          <p className="mt-2 text-sm font-bold text-gray-500 dark:text-slate-400">
            사용자 공지와 수집 운영 알림을 한곳에서 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchNotifications}
          disabled={loading}
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-black text-gray-600 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
          새로고침
        </button>
      </header>

      <section className="mb-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">수집 알림</p>
          <p className="mt-3 text-3xl font-black text-gray-950 dark:text-white">{unreadCollectionAlertCount}</p>
          <p className="mt-2 text-xs font-bold text-gray-400">최근 자동 진단 알림</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">시스템 공지</p>
          <p className="mt-3 text-3xl font-black text-gray-950 dark:text-white">{notifications.length}</p>
          <p className="mt-2 text-xs font-bold text-gray-400">최근 발송 이력</p>
        </div>
        <Link
          href="/admin/collection-sources?health=attention"
          className="rounded-lg border border-indigo-100 bg-indigo-50 p-5 shadow-sm transition-colors hover:bg-indigo-100 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20"
        >
          <p className="text-xs font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-200">Collection Sources</p>
          <p className="mt-3 text-lg font-black text-gray-950 dark:text-white">점검 대상 보기</p>
          <p className="mt-2 text-xs font-bold text-indigo-700/80 dark:text-indigo-100/80">수집 기관 관리 화면으로 이동</p>
        </Link>
      </section>

      <section className="mb-10 rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-500" />
          <h2 className="text-lg font-black text-gray-950 dark:text-white">수집 자동 진단 알림</h2>
        </div>

        {loading ? (
          <div className="h-32 animate-pulse rounded-lg bg-gray-50 dark:bg-slate-950" />
        ) : collectionAlerts.length > 0 ? (
          <div className="space-y-3">
            {collectionAlerts.map((alert) => {
              const metadata = alert.metadata_json ?? {};
              return (
                <div key={alert.id} className={`rounded-lg border p-4 ${alertTone(metadata.severity)}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest opacity-70">
                        {metadata.alert_key ?? "collection_source_alert"} · {formatDate(alert.created_at)}
                      </p>
                      <h3 className="mt-1 text-base font-black">{metadata.source_slug ?? "수집 기관"} · {metadata.label ?? "점검 필요"}</h3>
                      <p className="mt-2 whitespace-pre-wrap text-xs font-bold leading-5 opacity-80">{alert.action_reason ?? "수집 결과를 확인하세요."}</p>
                      <p className="mt-2 text-xs font-bold opacity-70">
                        확인 {metadata.checked ?? 0} · 신규 {metadata.created ?? 0} · 유효 {metadata.valid ?? 0} · 제외 {metadata.rejected ?? 0} · 실패 {metadata.failed ?? 0}
                      </p>
                    </div>
                    <Link
                      href={getAdminPath(alert)}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-white/80 px-3 text-xs font-black text-gray-800 shadow-sm transition-colors hover:bg-white dark:bg-slate-950/70 dark:text-slate-100"
                    >
                      <ExternalLink size={13} />
                      수집 이력 보기
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 p-10 text-center dark:border-slate-800">
            <CheckCircle2 className="mx-auto mb-3 text-emerald-500" size={32} />
            <p className="text-sm font-bold text-gray-400">최근 수집 자동 진단 알림이 없습니다.</p>
          </div>
        )}
      </section>

      <section className="mb-10 rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-center gap-2">
          <Send size={18} className="text-indigo-500" />
          <h2 className="text-lg font-black text-gray-950 dark:text-white">시스템 공지 발송</h2>
        </div>
        <div className="grid gap-3">
          <input
            type="text"
            placeholder="공지 제목"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
          />
          <textarea
            placeholder="공지 내용"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            className="resize-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-900 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !title.trim() || !body.trim()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-black text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? <Loader2 className="animate-spin" size={18} /> : <Bell size={18} />}
            전체 공지 발송
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-black uppercase tracking-widest text-gray-400">최근 시스템 공지</h2>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-lg border border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-900" />
            ))}
          </div>
        ) : notifications.length > 0 ? (
          <div className="space-y-3">
            {notifications.map((notification) => {
              const adminPath = extractAdminPathFromBody(notification.body);
              return (
                <div key={notification.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-black text-gray-950 dark:text-white">{notification.title}</h3>
                      <p className="mt-2 whitespace-pre-wrap text-xs font-bold leading-5 text-gray-500 dark:text-slate-400">{notification.body}</p>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <p className="text-[11px] font-bold text-gray-400">{formatDate(notification.created_at)}</p>
                      {notification.recipient_count && (
                        <p className="mt-1 text-[11px] font-black text-indigo-500">수신 {notification.recipient_count}명</p>
                      )}
                    </div>
                  </div>
                  {adminPath && (
                    <Link href={adminPath} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gray-950 px-3 py-2 text-xs font-black text-white hover:bg-gray-800 dark:bg-white dark:text-slate-950">
                      <ExternalLink size={13} />
                      관리 화면 열기
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 bg-white p-16 text-center dark:border-slate-800 dark:bg-slate-900">
            <Inbox className="mx-auto mb-4 text-gray-300 dark:text-slate-700" size={48} />
            <p className="text-sm font-bold text-gray-400">발송된 시스템 공지가 없습니다.</p>
          </div>
        )}
      </section>
    </div>
  );
}
