/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cool, considered neutrals — a premium, calm base (not framework gray).
        ink: {
          DEFAULT: '#15202e', // near-black slate for primary text / hero numbers
          soft: '#4c5768',
          faint: '#8b95a6',
        },
        surface: {
          DEFAULT: '#ffffff',
          sunken: '#f3f6fb', // page background
          raised: '#ffffff',
        },
        line: '#e5eaf1',
        lineSoft: '#eef2f7',
        // Brand accent — a confident indigo for nav, primary actions, focus, links.
        brand: {
          DEFAULT: '#3f4fbf',
          hover: '#354399',
          soft: '#eef0fc',
          ring: '#c3caf3',
        },
        // Health states — validated palette (see dataviz validator). Loudest thing on screen.
        risk: {
          green: '#1f9d55',
          greenBg: '#e8f6ee',
          yellow: '#c77700',
          yellowBg: '#fbf1df',
          red: '#d1344b',
          redBg: '#fbe9ec',
          growth: '#2563a8',
          growthBg: '#e7f0fa',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        // Hero number scale — money is the boldest type on the page.
        hero: ['2.5rem', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '600' }],
        stat: ['1.875rem', { lineHeight: '1.1', letterSpacing: '-0.015em', fontWeight: '600' }],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(21, 32, 46, 0.04), 0 1px 3px rgba(21, 32, 46, 0.06)',
        cardHover: '0 4px 12px rgba(21, 32, 46, 0.08), 0 2px 4px rgba(21, 32, 46, 0.05)',
        lift: '0 8px 24px rgba(21, 32, 46, 0.10)',
      },
      transitionTimingFunction: {
        calm: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};
