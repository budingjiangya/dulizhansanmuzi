import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setUnauthorizedHandler } from '@/api/request'
import { setupPermissionDirective } from '@/permission/directive'
import { useUserStore } from '@/stores/user'
import { message } from '@/utils/discrete'
import './styles/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
setupPermissionDirective(app)

/**
 * 40100 统一处理：清理登录态并跳登录页。
 * 只在非登录页触发，避免登录接口本身返回 401 时产生跳转循环。
 */
setUnauthorizedHandler(() => {
  const userStore = useUserStore()
  const current = router.currentRoute.value
  userStore.resetState()
  if (current.name === 'login') return
  message.warning('登录已过期，请重新登录')
  void router.replace({ name: 'login', query: { redirect: current.fullPath } })
})

app.mount('#app')
