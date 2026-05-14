import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on all interfaces so phones/tablets on the same Wi-Fi can load
    // the dev server at http://<mac-lan-ip>:5173. Equivalent to `vite --host`.
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Forward Socket.IO traffic (HTTP handshake + WebSocket upgrade) to the
      // backend. Frontend connects to its own origin, so LAN clients work.
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
