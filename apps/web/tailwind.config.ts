import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/index.tsx",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "#1e3a8a", // Deep Blue
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#6ee7b7", // Soft Mint
          foreground: "#1e3a8a",
        },
        accent: {
          DEFAULT: "#fb7185", // Coral Red
        },
        // UI redesign (docs/UI_REDESIGN_PLAN_2026-10-31.md 1-1), values from
        // docs/design/v6.1/reference/reference.css :root. Redesigned screens
        // use these; screens not yet redesigned keep the colours above.
        pl: {
          ink: "#1C2D4F",
          "ink-soft": "#3D4A66",
          paper: "#F1EEE4",
          card: "#FFFFFF",
          line: "#E2DCCD",
          "line-strong": "#DDD7C8",
          divider: "#ECE7DA",
          sub: "#4A4E59",
          meta: "#5B5F6B",
          faint: "#8A8D96",
          // v6.1: the stamp colour is for the deadline stamp only.
          accent: "#BE3A2B",
          stamp: "#BE3A2B",
          poster: "#ECE7DA",
          green: "#2F6B4F",
          ok: "#2F6B4F",
          "ok-bg": "#E3EEE6",
          pill: "#F1EEE4",
          "pill-muted": "#EFECE3",
          closed: "#F8F6F0",
          "closed-tag": "#E7E3D8",
          "badge-line": "#A9ABB3",
          band: "#E9E4D6",
        },
        kakao: {
          DEFAULT: "#FEE500",
          text: "#191919",
        },
      },
      fontFamily: {
        "pl-serif": ["var(--font-pl-serif)", "serif"],
        "pl-sans": ["var(--font-pl-sans)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
