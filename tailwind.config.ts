import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        orange:   "#E8622A",
        vert:     "#5B8C5A",
        creme:    "#FAF7F2",
        carte:    "#4A90D9",
        texte:    "#2C2C2C",
        bord:     "#EDE8E0",
      },
      fontFamily: {
        syne:  ["Syne", "sans-serif"],
        inter: ["Inter", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
      },
      boxShadow: {
        card: "0 2px 12px 0 rgba(44,44,44,0.08)",
        fab:  "0 4px 20px 0 rgba(232,98,42,0.4)",
      },
    },
  },
  plugins: [],
};
export default config;
