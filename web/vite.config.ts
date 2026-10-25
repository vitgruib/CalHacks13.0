import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // The landing lazy-loads hero/src/embed.tsx (T75, T76). Files outside web/
  // must take these packages from web/node_modules: Vercel installs only web/,
  // and one copy of React and three.js has to serve both.
  resolve: {
    dedupe: ['react', 'react-dom', 'three', 'three-stdlib', 'postprocessing', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'],
  },
})
