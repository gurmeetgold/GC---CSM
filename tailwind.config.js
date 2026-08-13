/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Calm, CSM-facing base palette. Risk states are the loudest thing on screen.
        ink: {
          DEFAULT: '#1a2233',
          soft: '#4a5568',
          faint: '#8a94a6',
        },
        surface: {
          DEFAULT: '#ffffff',
          sunken: '#f6f8fb',
          raised: '#ffffff',
        },
        line: '#e3e8f0',
        // Health states — deliberately high-contrast, colorblind-considerate hues.
        risk: {
          green: '#1f9d55',
          greenBg: '#e8f6ee',
          yellow: '#c77700',
          yellowBg: '#fdf3e0',
          red: '#d1344b',
          redBg: '#fbe9ec',
          growth: '#2563a8',
          growthBg: '#e7f0fa',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
