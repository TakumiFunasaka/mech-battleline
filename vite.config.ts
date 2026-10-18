import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // 相対パスで出力し、GitHub Pages のサブパス（/mech-battleline/）でもそのまま動くようにする
  base: './',
  plugins: [react()],
})
