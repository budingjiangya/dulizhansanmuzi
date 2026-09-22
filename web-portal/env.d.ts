/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

interface ImportMetaEnv {
  /** 开发环境代理的后端地址（仅 vite dev 使用） */
  readonly VITE_API_TARGET?: string
  /** 生产环境后端基地址，例如 https://api.example.com；留空则用同源相对路径 */
  readonly VITE_API_BASE?: string
  /** 静态资源基地址（后端 /static 所在源）；留空则用同源 */
  readonly VITE_ASSET_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
