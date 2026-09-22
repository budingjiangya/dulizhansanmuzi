/**
 * 登录态：Token + 当前用户 + 实时权限码
 * 约定：权限数组只作为「菜单/按钮显隐」依据，接口层鉴权完全由后端负责，前端不做安全边界。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AdminUserInfo, LoginDto } from '@sanmuzi/contracts'
import { AdminStatus } from '@sanmuzi/contracts'
import { fetchProfile, login as loginApi } from '@/admin/api/auth'
import { TOKEN_EXPIRES_KEY, TOKEN_KEY } from '@/admin/config'

function readStoredToken(): string {
  const token = localStorage.getItem(TOKEN_KEY) ?? ''
  const expires = Number(localStorage.getItem(TOKEN_EXPIRES_KEY) ?? 0)
  if (token && expires > 0 && expires <= Date.now()) {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_EXPIRES_KEY)
    return ''
  }
  return token
}

export const useUserStore = defineStore('user', () => {
  const token = ref(readStoredToken())
  const userInfo = ref<AdminUserInfo | null>(null)
  /** 是否已尝试拉取过用户信息，避免路由守卫重复请求 */
  const profileLoaded = ref(false)

  const permissions = computed<string[]>(() => userInfo.value?.permissions ?? [])
  const isSuperAdmin = computed(() => userInfo.value?.roleId === 1)
  const displayName = computed(() => userInfo.value?.realName || userInfo.value?.username || '未登录')
  const isEnabled = computed(() => userInfo.value?.status === AdminStatus.ENABLED)

  function hasPermission(code?: string | string[]): boolean {
    if (!code) return true
    const required = Array.isArray(code) ? code : [code]
    return required.some((item) => permissions.value.includes(item))
  }

  function setToken(next: string, expiresAt?: number): void {
    token.value = next
    if (next) {
      localStorage.setItem(TOKEN_KEY, next)
      if (expiresAt) localStorage.setItem(TOKEN_EXPIRES_KEY, String(expiresAt))
    } else {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(TOKEN_EXPIRES_KEY)
    }
  }

  async function login(payload: LoginDto): Promise<AdminUserInfo> {
    const result = await loginApi(payload)
    setToken(result.token, result.expiresAt)
    userInfo.value = result.user
    profileLoaded.value = true
    return result.user
  }

  async function loadProfile(force = false): Promise<AdminUserInfo | null> {
    if (!token.value) return null
    if (profileLoaded.value && !force) return userInfo.value
    const profile = await fetchProfile()
    userInfo.value = profile
    profileLoaded.value = true
    return profile
  }

  /** 仅清理本地登录态；页面跳转由调用方（路由守卫 / 布局层）负责 */
  function resetState(): void {
    setToken('')
    userInfo.value = null
    profileLoaded.value = false
  }

  return {
    token,
    userInfo,
    profileLoaded,
    permissions,
    isSuperAdmin,
    displayName,
    isEnabled,
    hasPermission,
    setToken,
    login,
    loadProfile,
    resetState,
  }
})
