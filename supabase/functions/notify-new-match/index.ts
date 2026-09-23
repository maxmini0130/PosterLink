import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.103.2";
import { parseExpoResult } from "../_shared/notification-logic.mjs";
import {
  buildNotificationLink,
  recordNotificationSent,
} from "../_shared/notification-events.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

async function recordDeliveries(
  serviceClient: SupabaseClient<any, "public", "public", any, any>,
  notificationIds: string[],
  result: {
    status: "sent" | "failed" | "skipped";
    ticketId?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
) {
  if (notificationIds.length === 0) return;

  const { error } = await serviceClient
    .from("notification_delivery_logs")
    .insert(
      notificationIds.map((notificationId) => ({
        notification_id: notificationId,
        channel: "expo_push",
        status: result.status,
        provider_ticket_id: result.ticketId ?? null,
        error_code: result.errorCode ?? null,
        error_message: result.errorMessage ?? null,
      })),
    );

  if (error) console.error("Notification delivery log error:", error);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
      "";
    const supabaseServiceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return new Response(
        JSON.stringify({ error: "Authorization header is required" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        },
      );
    }

    const authedClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const {
      data: { user },
      error: authError,
    } = await authedClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: authError?.message ?? "Unauthorized" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        },
      );
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: callerProfile, error: callerProfileError } =
      await serviceClient
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

    if (posterError || !poster)
      throw new Error(posterError?.message ?? "Poster not found");
    if (poster.poster_status !== "published") {
      return new Response(
        JSON.stringify({
          message: "Poster is not published.",
          sentCount: 0,
          pendingCount: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const { data: notifications, error: notificationError } =
      await serviceClient
        .from("notifications")
        .select("id, user_id, title, body")
        .eq("type", "new_match")
        .eq("target_id", poster_id)
        .is("push_sent_at", null)
        .is("push_discarded_at", null);

    if (notificationError) throw new Error(notificationError.message);
    if (!notifications || notifications.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No pending push notifications found.",
          sentCount: 0,
          pendingCount: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const notificationIdsByUser = new Map<string, string[]>();
    const notificationMessageByUser = new Map<
      string,
      { title: string; body: string }
    >();
    for (const notification of notifications) {
      const ids = notificationIdsByUser.get(notification.user_id) ?? [];
      ids.push(notification.id);
      notificationIdsByUser.set(notification.user_id, ids);
      if (!notificationMessageByUser.has(notification.user_id)) {
        notificationMessageByUser.set(notification.user_id, {
          title: notification.title || "포스터링크 알림",
          body: notification.body || `새 공고가 등록됐어요: ${poster.title}`,
        });
      }
    }

    const userIds = [...notificationIdsByUser.keys()];
    const { data: profiles, error: profileError } = await serviceClient
      .from("profiles")
      .select("id, expo_push_token, is_notified")
      .in("id", userIds)
      .not("expo_push_token", "is", null)
      .eq("is_notified", true)
      .neq("expo_push_token", "");

    if (profileError) throw new Error(profileError.message);

    const { data: latestPoster, error: latestPosterError } = await serviceClient
      .from("posters")
      .select("poster_status")
      .eq("id", poster_id)
      .single();

    if (latestPosterError) throw new Error(latestPosterError.message);
    if (latestPoster.poster_status !== "published") {
      const notificationIds = notifications.map(
        (notification) => notification.id,
      );
      const { error: discardError } = await serviceClient
        .from("notifications")
        .update({
          push_discarded_at: new Date().toISOString(),
          push_discard_reason: "poster_not_published",
        })
        .in("id", notificationIds);
      if (discardError) throw new Error(discardError.message);

      await recordDeliveries(serviceClient, notificationIds, {
        status: "skipped",
        errorCode: "poster_not_published",
      });

      return new Response(
        JSON.stringify({
          message: "Poster is no longer published.",
          sentCount: 0,
          pendingCount: notifications.length,
          skippedCount: notifications.length,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No users with push token.",
          sentCount: 0,
          pendingCount: notifications.length,
          skippedCount: notifications.length,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    let sentCount = 0;
    let failedCount = 0;
    const sentNotificationIds = new Set<string>();
    const invalidTokenUserIds: string[] = [];

    for (const profile of profiles) {
      if (!profile.expo_push_token) continue;
      const notificationIds = notificationIdsByUser.get(profile.id) ?? [];
      const message = notificationMessageByUser.get(profile.id) ?? {
        title: "포스터링크 알림",
        body: `새 공고가 등록됐어요: ${poster.title}`,
      };

      let deliveryResult;
      try {
        const pushResponse = await fetch(
          "https://exp.host/--/api/v2/push/send",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              to: profile.expo_push_token,
              title: message.title,
              body: message.body,
              data: {
                posterId: poster_id,
                link_url: buildNotificationLink(poster_id, "new_match"),
              },
            }),
          },
        );
        const pushPayload = await pushResponse.json().catch(() => null);
        deliveryResult = parseExpoResult(pushResponse.ok, pushPayload);
      } catch (error) {
        deliveryResult = {
          status: "failed" as const,
          ticketId: null,
          errorCode: "expo_network_error",
          errorMessage: error instanceof Error ? error.message : String(error),
          invalidToken: false,
        };
      }

      await recordDeliveries(serviceClient, notificationIds, deliveryResult);

      if (deliveryResult.invalidToken) invalidTokenUserIds.push(profile.id);
      if (deliveryResult.status === "sent") {
        sentCount += 1;
        await recordNotificationSent(serviceClient, {
          posterId: poster_id,
          posterStatus: "published",
          ctaVariant: "closed_poster_v1",
          metadata: { channel: "expo_push", notification_type: "new_match" },
        });
        for (const notificationId of notificationIds)
          sentNotificationIds.add(notificationId);
      } else {
        failedCount += 1;
      }
    }

    if (invalidTokenUserIds.length > 0) {
      const { error: tokenError } = await serviceClient
        .from("profiles")
        .update({ expo_push_token: null })
        .in("id", [...new Set(invalidTokenUserIds)]);
      if (tokenError) console.error("Invalid token cleanup error:", tokenError);
    }

    if (sentNotificationIds.size > 0) {
      const { error: updateError } = await serviceClient
        .from("notifications")
        .update({ push_sent_at: new Date().toISOString() })
        .in("id", [...sentNotificationIds]);
      if (updateError) throw new Error(updateError.message);
    }

    return new Response(
      JSON.stringify({
        message: "Push notifications processed.",
        sentCount,
        failedCount,
        pendingCount: notifications.length,
        skippedCount: notifications.length - sentNotificationIds.size,
        invalidTokensCleared: invalidTokenUserIds.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("New match notification failed:", message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
