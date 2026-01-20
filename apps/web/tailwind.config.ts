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
        // Background Colors (Dark Theme)
        bg: {
          primary: '#0f0f0f',
          secondary: '#1a1a1a',
          tertiary: '#242424',
          elevated: '#2a2a2a',
        },
        // Text Colors
        text: {
          primary: '#f0f0f0',
          secondary: '#b0b0b0',
          tertiary: '#707070',
          muted: '#4a4a4a',
        },
        // Accent Colors (치지직 + LoL 테마)
        accent: {
          primary: '#0bc4e2',
          hover: '#09a8c2',
          active: '#078ca8',
          gold: '#c89b3c',
          success: '#00c853',
          danger: '#ff1744',
          warning: '#ffa726',
        },
        // Tier Colors (LoL 티어 시스템)
        tier: {
          iron: '#5a5a5a',
          bronze: '#cd7f32',
          silver: '#c0c0c0',
          gold: '#ffd700',
          platinum: '#40e0d0',
          emerald: '#50c878',
          diamond: '#b9f2ff',
          master: '#9b30ff',
          grandmaster: '#ff4500',
          challenger: '#f4c430',
        },
      },
      fontFamily: {
        sans: [
          'Pretendard Variable',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
      // 간단하고 성능에 영향 없는 애니메이션만
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-in': 'slideIn 300ms ease-out',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideIn: {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      // Transition duration (성능 최적화)
      transitionDuration: {
        '150': '150ms',
      },
    },
  },
  plugins: [],
};

export default config;
