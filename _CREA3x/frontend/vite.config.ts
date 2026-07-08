import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Dev convenience: forward API calls to the FastAPI backend
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
