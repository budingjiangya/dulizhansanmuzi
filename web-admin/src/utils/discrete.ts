/**
 * Naive-UI 脱离上下文的全局 API（message / dialog / notification）
 * 在组件 setup 之外（路由守卫、axios 拦截器、store）也能弹出提示。
 * 主题在 main.ts 里通过 createDiscreteApi 的 configProviderProps 与根组件保持一致。
 */
import { createDiscreteApi, type ConfigProviderProps } from 'naive-ui'

const configProviderProps: ConfigProviderProps = {
  themeOverrides: {
    common: {
      primaryColor: '#2563eb',
      primaryColorHover: '#3b82f6',
      primaryColorPressed: '#1d4ed8',
      primaryColorSuppl: '#2563eb',
      borderRadius: '6px',
    },
  },
}

export const { message, dialog, notification, loadingBar } = createDiscreteApi(
  ['message', 'dialog', 'notification', 'loadingBar'],
  { configProviderProps },
)
