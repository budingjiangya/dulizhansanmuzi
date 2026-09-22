import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { message } from '@/utils/discrete'
import { useUserStore } from '@/stores/user'
import { BizError } from '@/api/request'
import { businessRoutes, constantRoutes, fallbackRoute } from './routes'

const router = createRouter({
  history: createWebHistory(),
  routes: [...constantRoutes, ...businessRoutes, fallbackRoute],
  scrollBehavior: () => ({ top: 0 }),
})

/**
 * 全局前置守卫
 * 1. 匿名页面直接放行
 * 2. 无 Token → 登录页（携带 redirect）
 * 3. 有 Token 但未拉取用户信息 → 拉取（失败视为登录态失效）
 * 4. 目标路由声明了 permission 且当前角色不具备 → /403
 */
router.beforeEach(async (to: RouteLocationNormalized) => {
  const userStore = useUserStore()

  if (to.meta.anonymous) return true

  if (!userStore.token) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } }
  }

  if (!userStore.profileLoaded) {
    try {
      await userStore.loadProfile()
    } catch (error) {
      userStore.resetState()
      const tip = error instanceof BizError ? error.message : '登录态已失效，请重新登录'
      message.warning(tip)
      return { name: 'login', query: { redirect: to.fullPath } }
    }
  }

  const required = to.meta.permission
  if (required && !userStore.hasPermission(required)) {
    message.warning('当前账号没有访问该页面的权限')
    return { name: 'forbidden' }
  }

  return true
})

router.afterEach((to) => {
  const base = '三目子内容管理后台'
  document.title = to.meta.title ? `${String(to.meta.title)} · ${base}` : base
})

export default router
