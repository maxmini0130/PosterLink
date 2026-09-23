import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.103.2";
import {
  DEADLINE_OFFSETS,
  deadlineCopy,
  getKstDayBounds,
  parseExpoResult,
} from "../_shared/notification-logic.mjs";
import {
  buildNotificationLink,
  recordNotificationSent,
} from "../_shared/notification-events.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function recordDelivery(
  supabase: SupabaseClient<any, "public", "public", any, any>,
  notificationId: string,
  result: {
    status: "sent" | "failed" | "skipped";
    ticketId?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
  deadlineOffsetDays: number,
) {
  const { error } = await supabase.from("notification_delivery_logs").insert({
    notification_id: notificationId,
    channel: "expo_push",
    status: result.status,
    provider_ticket_id: result.ticketId ?? null,
    error_code: result.errorCode ?? null,
    error_message: result.errorMessage ?? null,
    metadata_json: { deadline_offset_days: deadlineOffsetDays },
  });

  if (error) console.error("Notification delivery log error:", error);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    let notificationCount = 0;
    let pushSentCount = 0;
    let pushFailedCount = 0;
    let pushSkippedCount = 0;

    for (const deadlineOffsetDays of DEADLINE_OFFSETS) {
      const bounds = getKstDayBounds(deadlineOffsetDays);
      const { data: expiringPosters, error: postersError } = await supabase
        .from("posters")
        .select("id, title, source_org_name")
        .gte("application_end_at", bounds.start)
        .lte("application_end_at", bounds.end)
        .eq("poster_status", "published")
        .eq("verification_status", "verified")
        .not("verified_at", "is", null)
        .eq("deadline_type", "fixed");

      if (postersError) throw postersError;

      for (const poster of expiringPosters ?? []) {
        const { data: latestPoster, error: latestPosterError } = await supabase
          .from("posters")
          .select("poster_status")
          .eq("id", poster.id)
          .single();

        if (latestPosterError) {
          console.error(
            "Latest poster status lookup error:",
            latestPosterError,
          );
          continue;
        }
        if (latestPoster?.poster_status !== "published") continue;

        const { data: favorites, error: favoritesError } = await supabase
          .from("favorites")
          .select(
            `
            user_id,
            profiles:user_id (nickname, expo_push_token, is_notified)
          `,
          )
          .eq("poster_id", poster.id);

        if (favoritesError) {
          console.error("Favorite lookup error:", favoritesError);
          continue;
        }

        const userIds = (favorites ?? []).map((favorite) => favorite.user_id);
        const existingUserIds = new Set<string>();
        if (userIds.length > 0) {
          const { data: existingNotifications, error: existingError } =
            await supabase
              .from("notifications")
              .select("user_id")
              .eq("type", "favorite_deadline")
              .eq("target_id", poster.id)
              .eq("deadline_offset_days", deadlineOffsetDays)
              .in("user_id", userIds);

          if (existingError) {
            console.error("Existing notification lookup error:", existingError);
            continue;
          }
          for (const notification of existingNotifications ?? []) {
            existingUserIds.add(notification.user_id);
          }
        }

        for (const favorite of favorites ?? []) {
          const profile = Array.isArray(favorite.profiles)
            ? favorite.profiles[0]
            : favorite.profiles;
          if (
            !profile ||
            profile.is_notified !== true ||
            existingUserIds.has(favorite.user_id)
          )
            continue;

          const copy = deadlineCopy(deadlineOffsetDays, poster.title);
          const { data: notification, error: notifyError } = await supabase
            .from("notifications")
            .insert({
              user_id: favorite.user_id,
              type: "favorite_deadline",
              title: copy.title,
              body: copy.body,
              target_type: "poster",
              target_id: poster.id,
              deadline_offset_days: deadlineOffsetDays,
            })
            .select("id")
            .single();

          if (notifyError) {
            console.error("Notification insertion error:", notifyError);
            continue;
          }
          notificationCount += 1;

          if (!profile.expo_push_token) {
            pushSkippedCount += 1;
            await recordDelivery(
              supabase,
              notification.id,
              {
                status: "skipped",
                errorCode: "missing_push_token",
              },
              deadlineOffsetDays,
            );
            continue;
          }

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
                  title: copy.title,
                  body: copy.body,
                  data: {
                    posterId: poster.id,
                    deadlineOffsetDays,
                    link_url: buildNotificationLink(poster.id, "favorite_deadline"),
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
              errorMessage:
                error instanceof Error ? error.message : String(error),
              invalidToken: false,
            };
          }

          await recordDelivery(
            supabase,
            notification.id,
            deliveryResult,
            deadlineOffsetDays,
          );

          if (deliveryResult.invalidToken) {
            const { error: tokenError } = await supabase
              .from("profiles")
              .update({ expo_push_token: null })
              .eq("id", favorite.user_id);
            if (tokenError)
              console.error("Invalid token cleanup error:", tokenError);
          }

          if (deliveryResult.status === "sent") {
            pushSentCount += 1;
            await recordNotificationSent(supabase, {
              posterId: poster.id,
              posterStatus: "published",
              ctaVariant: "favorite_deadline_v1",
              metadata: {
                channel: "expo_push",
                notification_type: "favorite_deadline",
                deadline_offset_days: deadlineOffsetDays,
              },
            });
            const { error: sentAtError } = await supabase
              .from("notifications")
              .update({ push_sent_at: new Date().toISOString() })
              .eq("id", notification.id);
            if (sentAtError)
              console.error("Notification sent timestamp error:", sentAtError);
          } else {
            pushFailedCount += 1;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: "Deadline check complete.",
        deadlineOffsets: DEADLINE_OFFSETS,
        notificationCount,
        pushSentCount,
        pushFailedCount,
        pushSkippedCount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Deadline check failed:", message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
