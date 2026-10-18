import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // 相対パスで出力し、GitHub Pages のサブパス（/mech-battleline/）でもそのまま動くようにする
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      // 共有山札版（/）と、デッキ制の試作（/deck/）の2ページ
      input: {
        main: resolve(__dirname, 'index.html'),
        deck: resolve(__dirname, 'deck/index.html'),
      },
    },
  },
})
