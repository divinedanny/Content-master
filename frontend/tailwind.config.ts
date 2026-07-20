import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Command Centre dark palette
        ink: {
          950: "#0a0e17",
          900: "#0e1420",
          850: "#131a29",
          800: "#18202f",
          700: "#222c3f",
          600: "#2e3a52",
        },
        accent: {
          DEFAULT: "#5b8cff",
          soft: "#7ba3ff",
          glow: "#3d6fff",
        },
        // Platform brand colors
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
        panel: "0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px rgba(0,0,0,0.35)",
        glow: "0 0 0 1px rgba(91,140,255,0.4), 0 8px 30px rgba(61,111,255,0.25)",
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
