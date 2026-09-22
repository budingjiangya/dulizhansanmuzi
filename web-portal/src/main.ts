import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

/**
 * 后台区域按需加载（保证访客端首屏不下载 Naive-UI / 富文本编辑器，约 1.7 MB）
 *
 * 时序真相（实测得出，务必保留这段顺序）：
 * vue-router 的 createWebHistory() 在「模块导入阶段」就发起并完成了首次导航，
 * 那一次导航早于 setupAdminGuard 注册，因此后台守卫对首屏这次导航完全不生效：
 * 表现为深链/硬刷新 /admin/** 时守卫从未执行、/api/auth/profile 从未请求，
 * 页面以「未登录」状态渲染（菜单缺失、顶栏显示未登录）。
 *
 * 正确做法：
 * 1. 模块导入阶段不依赖守卫执行任何鉴权逻辑；
 * 2. await router.isReady() 之后，若当前落在 /admin/**，显式补一次后台初始化
 *    （注册守卫 + 权限指令 + 401 处理），并主动拉取一次用户信息；
 * 3. 之后再 mount，保证首屏渲染时 store 已经就绪。
 * 运行时导航（点击、前进后退）由 history 拦截 + 守卫正常覆盖。
 */
let adminBooted = false
let adminBootPromise: Promise<void> | null = null

function ensureAdminBooted(): Promise<void> {
  if (adminBooted) return Promise.resolve()
  if (!adminBootPromise) {
    adminBootPromise = import('@/admin/bootstrap').then(({ bootstrapAdminArea }) => {
      bootstrapAdminArea({ app, router })
      adminBooted = true
    })
  }
  return adminBootPromise
}

function installAdminBootstrapInterceptor(): void {
  const { pushState, replaceState } = window.history

  const wrap =
    (original: History['pushState']) =>
    function patched(this: History, data: unknown, unused: string, url?: string | URL | null) {
      const target = typeof url === 'string' ? url : url?.toString() ?? ''
      if (target.includes('/admin')) void ensureAdminBooted()
      return original.call(this, data, unused, url)
    }

  window.history.pushState = wrap(pushState)
  window.history.replaceState = wrap(replaceState)

  window.addEventListener('popstate', () => {
    if (window.location.pathname.startsWith('/admin')) void ensureAdminBooted()
  })
}

/** 首屏落在后台时：补初始化 + 主动拉取用户信息（因为首次导航已经错过了守卫） */
async function hydrateAdminFirstScreen(): Promise<void> {
  if (!router.currentRoute.value.path.startsWith('/admin')) return

  await ensureAdminBooted()

  const { useUserStore } = await import('@/admin/stores/user')
  const userStore = useUserStore()
  if (!userStore.token || userStore.profileLoaded) return

  try {
    await userStore.loadProfile()
  } catch {
    // 拉取失败（未登录 / Token 过期）交给后续路由守卫处理，不阻塞首屏渲染
  }
}

async function bootstrap(): Promise<void> {
  installAdminBootstrapInterceptor()
  await router.isReady()
  await hydrateAdminFirstScreen()
  app.mount('#app')
}

void bootstrap()
