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
          900: '#07080a', // Deep neutral obsidian black.
          800: '#0e1016', // Charcoal dark card.
          700: '#1a1f2c', // Slate steel gray border.
          600: '#282f42', // Muted steel slate gray.
        },
        neon: {
          blue: '#00e5ff', // Ice Cyan.
          green: '#00ff88', // Neon Mint Green.
          emerald: '#10b981', // Cyber Emerald Green.
          orange: '#ff9800', // Neon Amber Orange.
          red: '#ff3b3b', // Neon Red.
        }
      },
      boxShadow: {
        glow: '0 0 15px rgba(0, 229, 255, 0.15)', // Cyan neon glow effect.
        'glow-green': '0 0 15px rgba(0, 255, 136, 0.15)', // Green neon glow effect.
      }
    },
  },
  plugins: [],
}
