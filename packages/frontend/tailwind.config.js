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
          900: '#000000', // Pure Black background.
          800: '#09090b', // Deep Zinc Charcoal (cards/panels).
          700: '#18181b', // Zinc Border.
          600: '#27272a', // Mid-tone Zinc Gray.
        },
        neon: {
          blue: '#ffffff', // High-contrast active components (Pure White).
          green: '#f4f4f5', // Light Zinc Gray.
          emerald: '#a1a1aa', // Mid Zinc Gray.
          orange: '#71717a', // Muted Zinc Gray.
          red: '#3f3f46', // Dark Zinc Details.
        }
      },
      boxShadow: {
        glow: '0 0 10px rgba(255, 255, 255, 0.05)', // Subtle white header shadow.
        'glow-green': '0 0 10px rgba(244, 244, 245, 0.05)', // Zinc border shadow.
      }
    },
  },
  plugins: [],
}
