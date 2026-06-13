/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0b0f19',
          800: '#111827',
          700: '#1f2937',
          600: '#374151',
        },
        neon: {
          blue: '#3b82f6',
          green: '#10b981',
          purple: '#8b5cf6',
          red: '#ef4444',
          orange: '#f59e0b',
        }
      },
    },
  },
  plugins: [],
}
