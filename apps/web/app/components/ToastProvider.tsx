"use client";

import { Toaster } from "react-hot-toast";

export function ToastProvider() {
  return (
    <Toaster
      // Bottom of the screen above the tab bar on mobile, bottom left on PC
      // (UI redesign plan 2, 3-1); see .pl-toaster in globals.css.
      position="bottom-center"
      containerClassName="pl-toaster"
      toastOptions={{
        duration: 3500,
        style: {
          fontWeight: 700,
          borderRadius: "1rem",
          fontSize: "0.875rem",
        },
        success: { iconTheme: { primary: "#6366f1", secondary: "#fff" } },
        error: { duration: 5000 },
      }}
    />
  );
}
