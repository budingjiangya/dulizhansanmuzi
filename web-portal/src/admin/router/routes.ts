import type { RouteRecordRaw } from 'vue-router'

/**
 * 后台常量路由：所有人可访问（后台登录、错误页）
 * 路径统一带 /admin 前缀，与访客端共用 history 模式。
 */
export const constantRoutes: RouteRecordRaw[] = [
  {
    path: '/admin/login',
    name: 'admin-login',
    component: () => import('@/admin/views/login/LoginView.vue'),
    meta: { title: '登录', anonymous: true, hideInMenu: true },
  },
  {
    path: '/admin/403',
    name: 'admin-forbidden',
    component: () => import('@/admin/views/error/ForbiddenView.vue'),
    meta: { title: '无权访问', hideInMenu: true },
  },
  {
    path: '/admin/404',
    name: 'admin-not-found',
    component: () => import('@/admin/views/error/NotFoundView.vue'),
    meta: { title: '页面不存在', anonymous: true, hideInMenu: true },
  },
]

/**
 * 后台业务路由：统一挂在 AdminLayout 下，绝对路径 /admin/...。
 * 说明：路由在启动时一次性注册，菜单与按钮按权限码过滤，访问无权页面由路由守卫拦到 /admin/403；
 * 接口层面仍由后端 RBAC 守卫二次校验，前端不构成安全边界。
 */
export const businessRoutes: RouteRecordRaw[] = [
  {
    path: '/admin',
    component: () => import('@/admin/layout/AdminLayout.vue'),
    redirect: '/admin/dashboard',
    children: [
      {
        path: '/admin/dashboard',
        name: 'admin-dashboard',
        component: () => import('@/admin/views/dashboard/DashboardView.vue'),
        meta: { title: '工作台', icon: 'dashboard', affix: true },
      },
      {
        path: '/admin/blog/articles',
        name: 'admin-blog-article-list',
        component: () => import('@/admin/views/blog/ArticleListView.vue'),
        meta: { title: '文章管理', icon: 'article', permission: 'blog:article:list' },
      },
      {
        path: '/admin/blog/articles/create',
        name: 'admin-blog-article-create',
        component: () => import('@/admin/views/blog/ArticleEditView.vue'),
        meta: { title: '新建文章', icon: 'edit', permission: 'blog:article:create', hideInMenu: true },
      },
      {
        path: '/admin/blog/articles/:id/edit',
        name: 'admin-blog-article-edit',
        component: () => import('@/admin/views/blog/ArticleEditView.vue'),
        meta: { title: '编辑文章', icon: 'edit', permission: 'blog:article:update', hideInMenu: true },
      },
      {
        path: '/admin/system/users',
        name: 'admin-system-user-list',
        component: () => import('@/admin/views/system/UserListView.vue'),
        meta: { title: '账号管理', icon: 'user', permission: 'system:user:list' },
      },
      {
        path: '/admin/system/roles',
        name: 'admin-system-role-list',
        component: () => import('@/admin/views/system/RoleListView.vue'),
        meta: { title: '角色权限', icon: 'role', permission: 'system:role:list' },
      },
      {
        path: '/admin/system/login-logs',
        name: 'admin-system-login-log',
        component: () => import('@/admin/views/system/LoginLogView.vue'),
        meta: { title: '登录日志', icon: 'log', permission: 'system:log:list' },
      },
      {
        path: '/admin/profile/password',
        name: 'admin-profile-password',
        component: () => import('@/admin/views/profile/PasswordView.vue'),
        meta: { title: '修改密码', icon: 'lock' },
      },
    ],
  },
]

/** 未匹配地址：后台前缀进后台 404，其余进驻客端 404 */
export const fallbackRoute: RouteRecordRaw = {
  path: '/:pathMatch(.*)*',
  redirect: (to) => (to.path.startsWith('/admin') ? '/admin/404' : '/not-found'),
  meta: { hideInMenu: true },
}

/** 全部业务子路由（用于生成菜单与权限校验） */
export const menuRoutes = businessRoutes[0]?.children ?? []
