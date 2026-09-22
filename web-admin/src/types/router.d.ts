/** 让 vue-router 的 meta 字段获得类型提示 */
import type { PermissionCode } from '@sanmuzi/contracts'

declare module 'vue-router' {
  interface RouteMeta {
    /** 侧边菜单标题 */
    title?: string
    /** 菜单图标（内联 SVG 路径或字符） */
    icon?: string
    /** 访问该页面需要的权限码；不填表示仅需登录 */
    permission?: PermissionCode
    /** 是否在侧边菜单中隐藏 */
    hideInMenu?: boolean
    /** 是否允许匿名访问 */
    anonymous?: boolean
    /** 是否在标签页中固定 */
    affix?: boolean
  }
}

export {}
