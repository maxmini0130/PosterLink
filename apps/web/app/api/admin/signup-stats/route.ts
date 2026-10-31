import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase-server";
import {
  readAuthorizedSignupStats,
  SignupStatsError,
} from "../../../../lib/authSignupStats";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    Vary: "Cookie",
  };
  try {
    const session = await createSupabaseServerClient();
    const signal = AbortSignal.timeout(20000);
    const stats = await readAuthorizedSignupStats({
      actor: async () => {
        const { data, error } = await session.auth.getUser();
        if (error || !data.user) return null;
        const profile = await session
          .from("profiles")
          .select("role")
          .eq("id", data.user.id)
          .single();
        if (profile.error) throw new SignupStatsError(503);
        return { role: profile.data?.role ?? null };
      },
      page: async (page, perPage) => {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new SignupStatsError(503);
        // Use explicit pagination: the installed Auth SDK's Link parser truncates
        // multi-digit page numbers. Never follow a URL supplied in a Link header.
        const endpoint = new URL("/auth/v1/admin/users", url);
        endpoint.searchParams.set("page", String(page));
        endpoint.searchParams.set("per_page", String(perPage));
        const response = await fetch(endpoint, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          cache: "no-store",
          signal,
        });
        if (!response.ok) throw new SignupStatsError(503);
        const rawTotal = response.headers.get("x-total-count");
        if (!rawTotal || !/^\d+$/.test(rawTotal))
          throw new SignupStatsError(503);
        const total = Number(rawTotal);
        const data = (await response.json()) as {
          users?: { id: string; created_at: string }[];
        };
        if (!Array.isArray(data.users)) throw new SignupStatsError(503);
        return {
          users: data.users.map(({ id, created_at }) => ({ id, created_at })),
          total,
          nextPage: page * perPage < total ? page + 1 : null,
        };
      },
    });
    return NextResponse.json(stats, { headers });
  } catch (error) {
    const status = error instanceof SignupStatsError ? error.status : 503;
    // Never expose upstream Auth errors, tokens, or user lists.
    return NextResponse.json(
      {
        error:
          status === 401
            ? "Unauthorized"
            : status === 403
              ? "Forbidden"
              : "Signup statistics unavailable",
      },
      { status, headers },
    );
  }
}
