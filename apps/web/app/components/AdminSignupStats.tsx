"use client";

import { useEffect, useState } from "react";
import type { SignupStats } from "../../lib/authSignupStats";

export function AdminSignupStats() {
  const [stats, setStats] = useState<SignupStats | null>(null);
  const [status, setStatus] = useState("가입 집계를 확인하고 있습니다.");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/signup-stats", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          setStatus(
            response.status === 403
              ? "Auth 가입 통계는 최고 관리자만 조회할 수 있습니다."
              : "가입 집계를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.",
          );
          return;
        }
        setStats(await response.json());
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setStatus(
            "가입 집계를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.",
          );
      });
    return () => controller.abort();
  }, []);
  return (
    <section
      aria-label="Auth 신규 계정 집계"
      className="rounded-[2rem] border border-gray-100 bg-white p-7 shadow-sm mb-12"
    >
      <h2 className="text-sm font-black text-gray-900 mb-4">
        Auth 신규 계정 집계
      </h2>
      {stats ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["현재 계정", stats.totalAccounts],
              ["오늘 생성", stats.today],
              ["이번 주 생성", stats.thisWeek],
              ["이번 달 생성", stats.thisMonth],
            ].map(([label, count]) => (
              <div key={label} className="rounded-2xl bg-gray-50 p-4">
                <p className="text-xs font-bold text-gray-500">{label}</p>
                <p className="text-2xl font-black text-gray-900">{count}</p>
              </div>
            ))}
          </div>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-bold">
              최근 31일 일별 생성 계정
            </summary>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {stats.daily.map((day) => (
                <li key={day.date}>
                  {day.date}: {day.count}건
                </li>
              ))}
            </ul>
          </details>
          <p className="mt-3 text-xs text-gray-500">
            기준:{" "}
            {new Date(stats.asOf).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}{" "}
            (한국 시간). 이번 주는 월요일부터, 이번 달은 1일부터 기준
            시각까지입니다.
          </p>
        </>
      ) : (
        <p role="status" className="text-sm text-gray-500">
          {status}
        </p>
      )}
      <p className="mt-3 text-xs leading-relaxed text-gray-500">
        Supabase Auth에 현재 남아 있는 계정의 생성 시각 기준입니다. 이메일
        확인·온보딩 완료 수 또는 중복 없는 실인원 수가 아닙니다. 기존
        로그인·계정 연결은 추가 가입으로 세지 않으며, 탈퇴 후 새 계정으로
        재가입하면 새로 집계합니다. 삭제된 계정은 제외되므로 탈퇴 전 과거 가입
        총량은 복원할 수 없습니다. 여러 페이지 조회는 단일 DB 스냅샷이 아닙니다.
      </p>
    </section>
  );
}
