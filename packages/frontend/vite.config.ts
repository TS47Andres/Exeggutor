import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND_PORT = parseInt(process.env.EXEGGUTOR_BACKEND_PORT || '17492', 10); // Backend port from env or default.

export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.EXEGGUTOR_FRONTEND_PORT || '17493', 10), // Frontend port from env or default.
    host: true,
    proxy: {
      '/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${BACKEND_PORT}`,
        ws: true,
      },
    },
  },
});
