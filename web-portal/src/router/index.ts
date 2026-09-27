import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { businessRoutes, constantRoutes, fallbackRoute } from '@/admin/router/routes'

/**
 * 全站路由表（单应用双区域）
 *
 * - 访客端 /：首页推荐列表、文章详情、404
 * - 管理后台 /admin：登录、工作台、内容运营、系统管理、修改密码
 *
 * 管理后台的路由全部使用绝对路径（/admin/...），且均为懒加载：
 * 访客端访问首页时不会下载 Naive-UI 与富文本编辑器的代码。
 */
const portalRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: '首页' },
  },
  {
    path: '/article/:id',
    name: 'article-detail',
    component: () => import('@/views/ArticleDetailView.vue'),
    meta: { title: '文章详情' },
  },
  {
    path: '/search',
    name: 'search',
    component: () => import('@/views/SearchView.vue'),
    meta: { title: '搜索' },
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('@/views/AboutView.vue'),
    meta: { title: '关于本站' },
  },
  {
    // 占位页：第二批做完分类后替换为真实页面
    path: '/category',
    name: 'category',
    component: () => import('@/views/ComingSoonView.vue'),
    meta: { title: '分类' },
  },
  {
    // 占位页：第二批做完邮件订阅后替换为真实页面
    path: '/subscribe',
    name: 'subscribe',
    component: () => import('@/views/ComingSoonView.vue'),
    meta: { title: '邮件订阅' },
  },
  {
    path: '/not-found',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: '页面不存在' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes: [...portalRoutes, ...constantRoutes, ...businessRoutes, fallbackRoute],
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})

const PORTAL_TITLE = '三目子 · 产品推荐'
const ADMIN_TITLE = '三目子内容管理后台'

router.afterEach((to) => {
  const title = to.meta.title ? String(to.meta.title) : ''
  const inAdmin = to.path.startsWith('/admin')
  if (inAdmin) {
    document.title = title ? `${title} · ${ADMIN_TITLE}` : ADMIN_TITLE
  } else {
    document.title = title ? `${title} — ${PORTAL_TITLE}` : PORTAL_TITLE
  }
})

export default router
