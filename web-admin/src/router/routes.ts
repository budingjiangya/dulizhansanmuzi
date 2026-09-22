import type { RouteRecordRaw } from 'vue-router'

/**
 * 常量路由：所有人可访问（登录、错误页）
 */
export const constantRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login/LoginView.vue'),
    meta: { title: '登录', anonymous: true, hideInMenu: true },
  },
  {
    path: '/403',
    name: 'forbidden',
    component: () => import('@/views/error/ForbiddenView.vue'),
    meta: { title: '无权访问', hideInMenu: true },
  },
  {
    path: '/404',
    name: 'not-found',
    component: () => import('@/views/error/NotFoundView.vue'),
    meta: { title: '页面不存在', anonymous: true, hideInMenu: true },
  },
]

/**
 * 业务路由：统一挂在 AdminLayout 下。
 * 说明：路由在启动时一次性注册，菜单与按钮按权限码过滤，访问无权页面由路由守卫拦到 /403；
 * 接口层面仍由后端 RBAC 守卫二次校验，前端不构成安全边界。
 */
export const businessRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layout/AdminLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/dashboard/DashboardView.vue'),
        meta: { title: '工作台', icon: 'dashboard', affix: true },
      },
      {
        path: 'blog/articles',
        name: 'blog-article-list',
        component: () => import('@/views/blog/ArticleListView.vue'),
        meta: { title: '文章管理', icon: 'article', permission: 'blog:article:list' },
      },
      {
        path: 'blog/articles/create',
        name: 'blog-article-create',
        component: () => import('@/views/blog/ArticleEditView.vue'),
        meta: { title: '新建文章', icon: 'edit', permission: 'blog:article:create', hideInMenu: true },
      },
      {
        path: 'blog/articles/:id/edit',
        name: 'blog-article-edit',
        component: () => import('@/views/blog/ArticleEditView.vue'),
        meta: { title: '编辑文章', icon: 'edit', permission: 'blog:article:update', hideInMenu: true },
      },
      {
        path: 'system/users',
        name: 'system-user-list',
        component: () => import('@/views/system/UserListView.vue'),
        meta: { title: '账号管理', icon: 'user', permission: 'system:user:list' },
      },
      {
        path: 'system/roles',
        name: 'system-role-list',
        component: () => import('@/views/system/RoleListView.vue'),
        meta: { title: '角色权限', icon: 'role', permission: 'system:role:list' },
      },
      {
        path: 'system/login-logs',
        name: 'system-login-log',
        component: () => import('@/views/system/LoginLogView.vue'),
        meta: { title: '登录日志', icon: 'log', permission: 'system:log:list' },
      },
      {
        path: 'profile/password',
        name: 'profile-password',
        component: () => import('@/views/profile/PasswordView.vue'),
        meta: { title: '修改密码', icon: 'lock' },
      },
    ],
  },
]

export const fallbackRoute: RouteRecordRaw = {
  path: '/:pathMatch(.*)*',
  redirect: '/404',
  meta: { hideInMenu: true },
}

/** 全部业务子路由（用于生成菜单与权限校验） */
export const menuRoutes = businessRoutes[0]?.children ?? []
