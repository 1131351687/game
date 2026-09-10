import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  // 构建产物部署在 GitHub Pages 项目站点子路径下；开发时用根路径
  base: command === 'build' ? '/game/' : '/',
  plugins: [react()],
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
}));
