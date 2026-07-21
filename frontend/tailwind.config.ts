import type { Config } from "tailwindcss";

// Colors are driven by CSS variables (RGB channels) defined in globals.css, so
// the entire UI flips between light and dark by swapping variables — no
// per-component changes needed. `white`, `slate`, `ink` and `black` carry
// semantic meaning here: `white` = primary foreground, `slate` = secondary
// text, `ink` = surfaces, `black` = deep overlays.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary foreground (was pure white). Flips to near-black in light.
        white: v("fg"),
        // Deep overlays / input fills / modal scrims.
        black: v("deep"),
        // Secondary text scale (semantic: 100 = strongest, 600 = faintest).
        slate: {
          100: v("slate-100"),
          200: v("slate-200"),
          300: v("slate-300"),
          400: v("slate-400"),
          500: v("slate-500"),
          600: v("slate-600"),
        },
        // Surfaces.
        ink: {
          950: v("ink-950"),
          900: v("ink-900"),
          850: v("ink-850"),
          800: v("ink-800"),
          700: v("ink-700"),
          600: v("ink-600"),
        },
        // Inset input/textarea fill (light gray in light, near-black in dark).
        field: v("field"),
        accent: {
          DEFAULT: v("accent"),
          soft: v("accent-soft"),
          glow: v("accent-glow"),
        },
        // Status text shades used as `text-*-300` — darken in light mode.
        emerald: { 300: v("emerald-300") },
        rose: { 300: v("rose-300") },
        amber: { 300: v("amber-300") },
        // Platform brand colors (theme-independent).
        whatsapp: "#25D366",
        instagram: "#E1306C",
        facebook: "#1877F2",
        tiktok: "#ff2b56",
        linkedin: "#0A66C2",
        x: "#e7e9ea",
        google: "#EA4335",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        panel: "var(--panel-shadow)",
        glow: "0 0 0 1px rgb(var(--accent) / 0.4), 0 8px 30px rgb(var(--accent) / 0.25)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseglow: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out both",
        pulseglow: "pulseglow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
