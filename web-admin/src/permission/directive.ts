/**
 * 权限指令：v-permission="PERMISSIONS.X" 或 v-permission="[A, B]"
 * 仅做元素显示隐藏，真正的接口鉴权在后端守卫完成。
 */
import type { App, Directive } from 'vue'
import type { PermissionCode } from '@sanmuzi/contracts'
import { useUserStore } from '@/stores/user'

type PermissionValue = PermissionCode | PermissionCode[]

const permissionDirective: Directive<HTMLElement, PermissionValue> = {
  mounted(el, binding) {
    const userStore = useUserStore()
    const required = binding.value
    if (!required || (Array.isArray(required) && required.length === 0)) return
    if (!userStore.hasPermission(required)) {
      el.parentNode?.removeChild(el)
    }
  },
}

export function setupPermissionDirective(app: App): void {
  app.directive('permission', permissionDirective)
}
