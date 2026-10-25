import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { watch: { ignored: ['**/outputs/**', '**/work/**', '**/public/models/**'] } },
  build: {
    // Split the heavy 3D stack away from app code: the libraries change far
    // less often than the studies, so returning visitors keep them cached.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          'three-fiber': ['@react-three/fiber', '@react-three/drei'],
          'three-post': ['@react-three/postprocessing'],
        },
      },
    },
  },
});
