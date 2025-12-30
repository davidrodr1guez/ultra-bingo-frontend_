import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks - split large dependencies
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-wagmi': ['wagmi', 'viem', '@wagmi/core', '@wagmi/connectors'],
          'vendor-motion': ['framer-motion'],
          'vendor-socket': ['socket.io-client'],
        },
      },
    },
    chunkSizeWarningLimit: 300,
  },
})
