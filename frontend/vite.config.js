import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/traffic-dashboard/',
  server: {
    port: 5173,
    proxy: {
      '/traffic-dashboard/api': {
        target: 'http://localhost:3847',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/traffic-dashboard/, '')
      }
    }
  },
  build: {
    outDir: 'dist'
  }
})