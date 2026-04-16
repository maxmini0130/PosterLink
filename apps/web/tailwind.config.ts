import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
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
      },
    },
  },
  plugins: [],
};
export default config;
