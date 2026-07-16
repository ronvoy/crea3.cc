import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // HMR dev: forward /api to the backend. In the container this is set to
      // the backend service name (see run_fe.sh); locally it defaults to :8000.
      '/api': process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000',
    },
    // Allow the container/host to serve HMR to the browser at localhost:5173.
    hmr: { clientPort: 5173 },
  },
})
