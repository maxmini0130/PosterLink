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
        // UI redesign (docs/UI_REDESIGN_PLAN_2026-10-31.md 1-1). Redesigned
        // screens use these; screens not yet redesigned keep the colours above.
        pl: {
          ink: "#1C2D4F",
          paper: "#F1EEE4",
          card: "#FFFFFF",
          line: "#D9D3C3",
          divider: "#ECE7DA",
          sub: "#4A4E59",
          meta: "#5B5F6B",
          accent: "#BE3A2B",
          poster: "#E2DCCB",
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
