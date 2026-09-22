/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

interface ImportMetaEnv {
  /** 开发环境代理的后端地址 */
  readonly VITE_API_TARGET?: string
  /** 生产环境后端接口基地址 */
  readonly VITE_API_BASE?: string
  /** 静态资源（上传文件）基地址 */
  readonly VITE_ASSET_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * @wangeditor/editor-for-vue 5.1.12 未在 package.json 的 exports 中声明 types 条件，
 * TS 在 moduleResolution=Bundler 下无法解析到 dist/src/index.d.ts，这里补一份等价声明。
 */
declare module '@wangeditor/editor-for-vue' {
  import type { DefineComponent } from 'vue'
  export const Editor: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export const Toolbar: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
}

