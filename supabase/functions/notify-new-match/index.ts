import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return new Response(JSON.stringify({ error: "Authorization header is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const authedClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
    });

    const {
      data: { user },
      error: authError,
    } = await authedClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: authError?.message ?? "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: callerProfile, error: callerProfileError } = await serviceClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (callerProfileError || !ADMIN_ROLES.has(callerProfile?.role ?? "")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const { poster_id } = await req.json();
    if (!poster_id) {
      return new Response(JSON.stringify({ error: "poster_id is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const { data: poster, error: posterError } = await serviceClient
      .from("posters")
      .select("id, title, poster_status")
      .eq("id", poster_id)
      .single();

    if (posterError || !poster) {
      throw new Error(posterError?.message ?? "Poster not found");
    }

    if (poster.poster_status !== "published") {
      return new Response(JSON.stringify({ message: "Poster is not published.", sentCount: 0, pendingCount: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const { data: notifications, error: notifError } = await serviceClient
      .from("notifications")
      .select("id, user_id")
      .eq("type", "new_match")
      .eq("target_id", poster_id)
      .is("push_sent_at", null);

    if (notifError) {
      throw new Error(notifError.message);
    }

    if (!notifications || notifications.length === 0) {
      return new Response(JSON.stringify({ message: "No pending push notifications found.", sentCount: 0, pendingCount: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const notificationIdsByUser = new Map<string, string[]>();
    for (const notification of notifications) {
      const ids = notificationIdsByUser.get(notification.user_id) ?? [];
      ids.push(notification.id);
      notificationIdsByUser.set(notification.user_id, ids);
    }

    const userIds = [...notificationIdsByUser.keys()];
    const { data: profiles, error: profileError } = await serviceClient
      .from("profiles")
      .select("id, expo_push_token")
      .in("id", userIds)
      .not("expo_push_token", "is", null)
      .neq("expo_push_token", "");

    if (profileError) {
      throw new Error(profileError.message);
    }

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({
        message: "No users with push token.",
        sentCount: 0,
        pendingCount: notifications.length,
        skippedCount: notifications.length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    let sentCount = 0;
    const sentNotificationIds = new Set<string>();
    const invalidTokenUserIds: string[] = [];

    for (const profile of profiles) {
      if (!profile.expo_push_token) continue;

      const pushResponse = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          to: profile.expo_push_token,
          title: "새 포스터 알림",
          body: `관심 분야/지역에 새 포스터가 등록됐어요: ${poster.title}`,
          data: { posterId: poster_id },
        }),
      });

      if (!pushResponse.ok) continue;

      const pushPayload = await pushResponse.json().catch(() => null);
      const tickets: Array<{ status?: string; details?: { error?: string } }> =
        Array.isArray(pushPayload?.data) ? pushPayload.data : [];

      const hasSuccessfulTicket = tickets.some((t) => t.status === "ok");

      // 만료된 토큰은 즉시 정리 대상으로 수집
      const hasInvalidToken = tickets.some(
        (t) => t.status === "error" && t.details?.error === "DeviceNotRegistered"
      );
      if (hasInvalidToken) {
        invalidTokenUserIds.push(profile.id);
      }

      if (!hasSuccessfulTicket) continue;

      sentCount += 1;
      for (const notificationId of notificationIdsByUser.get(profile.id) ?? []) {
        sentNotificationIds.add(notificationId);
      }
    }

    // 만료 토큰 일괄 삭제
    if (invalidTokenUserIds.length > 0) {
      await serviceClient
        .from("profiles")
        .update({ expo_push_token: null })
        .in("id", invalidTokenUserIds);
    }

    if (sentNotificationIds.size > 0) {
      const { error: updateError } = await serviceClient
        .from("notifications")
        .update({ push_sent_at: new Date().toISOString() })
        .in("id", [...sentNotificationIds]);

      if (updateError) {
        throw new Error(updateError.message);
      }
    }

    return new Response(JSON.stringify({
      message: "Push notifications processed.",
      sentCount,
      pendingCount: notifications.length,
      skippedCount: notifications.length - sentNotificationIds.size,
      invalidTokensCleared: invalidTokenUserIds.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
