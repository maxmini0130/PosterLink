"use client";

import { Toaster } from "react-hot-toast";

export function ToastProvider() {
  return (
    <Toaster
      position="top-center"
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
