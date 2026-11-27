import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// GitHub Pages 部署在 https://<user>.github.io/<repo>/，需要 base 前缀；
// 用环境变量注入，本地开发不设置时仍是 '/'。
export default defineConfig({
  plugins: [vue()],
  base: process.env.VITE_BASE ?? '/'
});
