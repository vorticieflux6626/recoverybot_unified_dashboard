import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import {
  DASHBOARD_FRONTEND_PORT,
  DASHBOARD_BACKEND_PORT,
} from './config/ports'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@config': path.resolve(__dirname, './config'),
      '@ecosystem': path.resolve(__dirname, './ecosystem_config'),
    },
  },
  server: {
    port: DASHBOARD_FRONTEND_PORT,
    proxy: {
      '/api': {
        target: `http://localhost:${DASHBOARD_BACKEND_PORT}`,
        changeOrigin: true,
      },
    },
  },
})
