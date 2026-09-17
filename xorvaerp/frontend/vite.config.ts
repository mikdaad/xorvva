import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Xorva.API dev port — must match backend/Xorva.API/Properties/launchSettings.json
      '/api': {
        target: 'http://localhost:5270',
        changeOrigin: true,
      },
    },
  },
})
