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
          900: '#05070c', // Obsidian Deep Space Black.
          800: '#0c0e17', // Deep Slate Gray.
          700: '#181b2b', // Indigo Steel Border.
          600: '#2a2e45', // Muted Slate Gray.
        },
        neon: {
          blue: '#00f5ff', // Vibrant Cyber Cyan.
          purple: '#bd5eff', // Neon Violet.
          pink: '#d946ef', // Neon Magenta Pink.
          green: '#10b981', // Cyber Emerald Green.
          orange: '#f97316', // Cyber Neon Orange.
          red: '#ff4a4a', // Cyber Neon Red.
        }
      },
      boxShadow: {
        glow: '0 0 15px rgba(0, 245, 255, 0.15)', // Cyan neon glow effect.
        'glow-pink': '0 0 15px rgba(217, 70, 239, 0.15)', // Pink neon glow effect.
      }
    },
  },
  plugins: [],
}
