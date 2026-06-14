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
      },
      boxShadow: {
        glow: '0 0 10px rgba(255, 255, 255, 0.05)', // Subtle white header shadow.
      }
    },
  },
  plugins: [],
}
