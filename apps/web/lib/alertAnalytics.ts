"use client";

import { track } from "@vercel/analytics";

export type AlertEventName =
  | "alert_cta_view"
  | "alert_cta_click"
  | "auth_modal_view"
  | "login_complete"
  | "alert_saved"
  | "notification_sent"
  | "notification_open";

export type AlertEventProperties = {
  poster_id: string;
  poster_status: string;
  region: string;
  category: string;
  cta_variant: string;
};

export function trackAlertEvent(
  name: AlertEventName,
  properties: AlertEventProperties,
) {
  track(name, properties);
  if (name === "notification_sent") return;

  void fetch("/api/alert-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_name: name, ...properties }),
    keepalive: true,
  }).catch(() => {
    // Analytics must never interrupt the user's alert flow.
  });
}
