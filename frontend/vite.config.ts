import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 같은 와이파이의 휴대폰에서 http://<내 PC IP>:5173 으로 접속 가능
    host: true,
    // /api 로 시작하는 요청은 FastAPI(8000)로 넘김
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
