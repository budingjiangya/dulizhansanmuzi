import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:3000'

/**
 * 单应用双区域：
 * - 访客端：/             （首页推荐列表、文章详情）
 * - 管理后台：/admin       （登录、工作台、文章、账号、角色、日志）
 * 两者共用同一个 Vite dev server 与同一份构建产物，后台路由按需懒加载，
 * 因此访客端首屏不会加载 Naive-UI 与富文本编辑器。
 */
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@sanmuzi/contracts': fileURLToPath(new URL('../contracts/src/index.ts', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      // 后端统一前缀 /api；/static 是后端静态资源（上传的图片与视频）
      '/api': { target: API_TARGET, changeOrigin: true },
      '/static': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    // 不做手工 manualChunks：后台依赖通过 main.ts 的动态 import 自然分包，
    // 手工指定反而会把 Naive-UI 提升到首屏预加载列表里。
  },
})
