import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The feed imports the real spending rules from ../server/src/rules.ts.
export default defineConfig({
  plugins: [react()],
  server: { port: 5190, fs: { allow: ['..'] } },
})
