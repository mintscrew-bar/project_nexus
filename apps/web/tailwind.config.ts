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
        // Semantic Brand Colors (Referenced from CSS variables in globals.css)
        brand: {
          50:  'rgb(var(--color-brand-50) / <alpha-value>)',
          100: 'rgb(var(--color-brand-100) / <alpha-value>)',
          200: 'rgb(var(--color-brand-200) / <alpha-value>)',
          300: 'rgb(var(--color-brand-300) / <alpha-value>)',
          400: 'rgb(var(--color-brand-400) / <alpha-value>)',
          500: 'rgb(var(--color-brand-500) / <alpha-value>)', // Main brand blue
          600: 'rgb(var(--color-brand-600) / <alpha-value>)',
          700: 'rgb(var(--color-brand-700) / <alpha-value>)',
          800: 'rgb(var(--color-brand-800) / <alpha-value>)',
          900: 'rgb(var(--color-brand-900) / <alpha-value>)',
          purple: 'rgb(var(--color-brand-purple) / <alpha-value>)', // Secondary brand purple
        },
        // Semantic UI Colors
        ui: {
          background: 'rgb(var(--color-ui-background) / <alpha-value>)',
          card: 'rgb(var(--color-ui-card) / <alpha-value>)',
          border: 'rgb(var(--color-ui-border) / <alpha-value>)',
          text: {
            base: 'rgb(var(--color-ui-text-base) / <alpha-value>)',
            muted: 'rgb(var(--color-ui-text-muted) / <alpha-value>)',
            accent: 'rgb(var(--color-ui-text-accent) / <alpha-value>)',
          },
        },
        // Existing LoL Theme Colors (Moved under 'lol' namespace for clarity)
        lol: {
          primary: { // Gold
            50: "#fdf4e3", 100: "#f9e4b8", 200: "#f5d38a", 300: "#f1c15c", 400: "#edb338",
            500: "#C89B3C", 600: "#a67c30", 700: "#845d24", 800: "#624018", 900: "#40240c",
          },
          secondary: { // Teal
            50: "#e8f4fc", 100: "#c5e2f7", 200: "#9ecff2", 300: "#77bcec", 400: "#59ace8",
            500: "#0397AB", 600: "#027a8b", 700: "#025d6a", 800: "#014049", 900: "#002428",
          },
          dark: { // Dark base
            50: "#e6e6e8", 100: "#c0c0c5", 200: "#96969f", 300: "#6c6c79", 400: "#4d4d5c",
            500: "#1E2328", 600: "#191d21", 700: "#13161a", 800: "#0d0f12", 900: "#07080a",
          },
          accent: {
            blue: "#0AC8B9", gold: "#F0E6D2", red: "#FF4655", green: "#00FF87",
          },
        },
      },
      fontFamily: {
        display: ["var(--font-beaufort)", "serif"],
        sans: ["var(--font-spiegel)", "sans-serif"],
      },
      animation: {
        "pulse-gold": "pulse-gold 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slide-up": "slide-up 0.3s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
      },
      keyframes: {
        "pulse-gold": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(200, 155, 60, 0.4)" },
          "50%": { boxShadow: "0 0 0 15px rgba(200, 155, 60, 0)" },
        },
        "slide-up": {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
