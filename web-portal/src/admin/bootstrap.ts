/**
 * 后台区域初始化（仅在进入 /admin 时按需加载）
 *
 * 为什么单独成文件：
 * main.ts 若静态导入后台的路由守卫、权限指令或 store，Rollup 会把 Naive-UI（约 890 kB）
 * 打进访客端首屏依赖链并被 index.html 预加载，首页性能直接受影响。
 * 这里改为动态 import()，让整个后台区域独立成 chunk，只有访问 /admin 才下载。
 */
import type { Router } from 'vue-router'
import { setUnauthorizedHandler } from '@/admin/api/request'
import { setupAdminGuard } from '@/admin/router/guard'
import { setupPermissionDirective } from '@/admin/permission/directive'
import { useUserStore } from '@/admin/stores/user'
import { message } from '@/admin/utils/discrete'
import { ADMIN_LOGIN_PATH } from '@/admin/config'

export interface AdminBootstrapOptions {
  app: import('vue').App
  router: Router
}

export function bootstrapAdminArea({ app, router }: AdminBootstrapOptions): void {
  setupAdminGuard(router)
  setupPermissionDirective(app)

  /**
   * 40100 统一处理：清理登录态并跳后台登录页。
   * 只在后台区域内触发，避免访客端公开接口返回 401 时被错误跳转。
   */
  setUnauthorizedHandler(() => {
    const current = router.currentRoute.value
    if (!current.path.startsWith('/admin') || current.path === ADMIN_LOGIN_PATH) return
    const userStore = useUserStore()
    userStore.resetState()
    message.warning('登录已过期，请重新登录')
    void router.replace({ path: ADMIN_LOGIN_PATH, query: { redirect: current.fullPath } })
  })
}
