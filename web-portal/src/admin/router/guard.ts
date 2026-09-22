/**
 * 后台路由守卫（在访客端路由守卫之后注册，二者互不干扰）
 *
 * 规则：
 * 1. /admin 之外的路径直接放行
 * 2. 后台匿名页面（登录、404）放行
 * 3. 无 Token → /admin/login（携带 redirect）
 * 4. 有 Token 但未拉取用户信息 → 拉取（失败视为登录态失效）
 * 5. 目标路由声明了 permission 且当前角色不具备 → /admin/403
 */
import type { Router } from 'vue-router'
import { useUserStore } from '@/admin/stores/user'
import { BizError } from '@/admin/api/request'
import { message } from '@/admin/utils/discrete'
import { ADMIN_LOGIN_PATH } from '@/admin/config'

export function setupAdminGuard(router: Router): void {
  router.beforeEach(async (to) => {
    if (!to.path.startsWith('/admin')) return true
    if (to.meta.anonymous) return true

    const userStore = useUserStore()

    if (!userStore.token) {
      return { path: ADMIN_LOGIN_PATH, query: to.fullPath === ADMIN_LOGIN_PATH ? {} : { redirect: to.fullPath } }
    }

    if (!userStore.profileLoaded) {
      try {
        await userStore.loadProfile()
      } catch (error) {
        userStore.resetState()
        const tip = error instanceof BizError ? error.message : '登录态已失效，请重新登录'
        message.warning(tip)
        return { path: ADMIN_LOGIN_PATH, query: { redirect: to.fullPath } }
      }
    }

    const required = to.meta.permission
    if (required && !userStore.hasPermission(required)) {
      message.warning('当前账号没有访问该页面的权限')
      return { path: '/admin/403' }
    }

    return true
  })
}
