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
        primary:       "#2D5A3D",
        "primary-light":"#E8F2EB",
        accent:        "#C84B2F",
        creme:         "#FDFAF5",
        cremeDeep:     "#F7F1E6",   // V3 — pills count, fonds doux, badges secondaires
        texte:         "#1A1209",
        "texte-doux":  "#7A6A5A",
        "texte-tres-doux":"#A99B89",
        bord:          "#E8E0D4",
        bordSoft:      "#F0EAE0",   // V3 — border des cards, plus subtil que bord
        gris:          "#6B5E4E",
        carte:         "#4A90D9",
        // legacy — ne pas supprimer, encore utilisé dans certains composants
        orange:        "#C84B2F",
        vert:          "#2D5A3D",
      },
      fontFamily: {
        inter:   ["var(--font-inter)", "Inter", "system-ui", "-apple-system", "sans-serif"],
        serif:   ["var(--font-dm-serif)", "Georgia", "serif"],
        caveat:  ["var(--font-caveat)", "Caveat", "cursive"],
        // legacy — gardé pour composants pas encore migrés
        syne:    ["Syne", "sans-serif"],
      },
      borderRadius: {
        card:  "16px",
        tile:  "20px",
        pill:  "999px",
      },
      boxShadow: {
        card:    "0 1px 6px 0 rgba(44,28,16,0.06)",
        "card-hover":"0 4px 16px 0 rgba(44,28,16,0.10)",
        tile:    "0 2px 10px 0 rgba(44,28,16,0.08)",
        // Spec V2 compact : ombre plus douce qu'avant pour eviter le
        // halo grisatre visible aux coins de la bbox du hero carousel.
        hero:    "0 6px 24px 0 rgba(44,28,16,0.18)",
        fab:     "0 4px 20px 0 rgba(232,98,42,0.40)",
      },
      letterSpacing: {
        tight2: "-0.02em",
        tight3: "-0.03em",
      },
    },
  },
  plugins: [],
};
export default config;
