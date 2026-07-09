/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['"Inter Tight"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        bg:      '#080a0f',
        surface: { DEFAULT: '#0e1118', 2: '#141921', 3: '#1b2030' },
        border:  { DEFAULT: 'rgba(255,255,255,0.06)', hi: 'rgba(255,255,255,0.12)' },
        ink:     { DEFAULT: '#e8eaf2', 2: 'rgba(232,234,242,0.55)', 3: 'rgba(232,234,242,0.25)' },
        violet:  { DEFAULT: '#a78bfa', soft: 'rgba(167,139,250,0.1)' },
        blue:    { DEFAULT: '#60a5fa', soft: 'rgba(96,165,250,0.1)' },
        green:   { DEFAULT: '#4ade80', soft: 'rgba(74,222,128,0.1)' },
        amber:   { DEFAULT: '#fbbf24', soft: 'rgba(251,191,36,0.1)' },
        rose:    { DEFAULT: '#f87171', soft: 'rgba(248,113,113,0.1)' },
      },
      animation: {
        'fade-up':  'fadeUp .5s ease both',
        'fade-in':  'fadeIn .4s ease both',
        'slide-r':  'slideR .4s ease both',
        float:      'float 6s ease-in-out infinite',
        'spin-slow':'spin 8s linear infinite',
      },
      keyframes: {
        fadeUp:  { from: { opacity: 0, transform: 'translateY(20px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        fadeIn:  { from: { opacity: 0 }, to: { opacity: 1 } },
        slideR:  { from: { opacity: 0, transform: 'translateX(-12px)' }, to: { opacity: 1, transform: 'translateX(0)' } },
        float:   { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
      },
    },
  },
  plugins: [],
}
