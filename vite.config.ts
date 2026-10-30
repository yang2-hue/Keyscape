import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({mode})=>({
  base: loadEnv(mode, '.', 'VITE_').VITE_BASE_PATH || '/',
  plugins: [react()],
  // Generated sources stay ignored; published model changes must be detected
  // so new GLBs are served instead of the HTML fallback during development.
  server: { watch: { ignored: ['**/outputs/**', '**/work/**'] } },
  // Scratch HTML under work/ and outputs/ imports stale /node_modules/.vite
  // paths; letting the dependency scanner read them aborts pre-bundling and
  // every bare import then answers 504. Only the real entry is scanned.
  optimizeDeps: { entries: ['index.html'] },
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
}));
