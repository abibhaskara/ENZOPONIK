import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ['unmammalian-giovani-nonpestilential.ngrok-free.dev'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          motion: ['framer-motion'],
          firestore: ['firebase/firestore'],
          firebaseAuth: ['firebase/auth'],
          icons: ['lucide-react'],
          mqtt: ['mqtt'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
