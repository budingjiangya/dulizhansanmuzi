/**
 * 前台环境配置：所有可外部化的地址集中在 config 目录，业务代码不直接读 import.meta.env。
 */

/** 接口基地址：默认同源（开发由 vite proxy 转发到 3000 端口） */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

/** 静态资源基地址：后端 /static 所在源，默认同源 */
export const ASSET_BASE = (import.meta.env.VITE_ASSET_BASE ?? '').replace(/\/+$/, '')

/** 首页每页卡片数量 */
export const HOME_PAGE_SIZE = 9

/** 站点兜底配置：接口未返回时保证页面结构与文案完整 */
export const FALLBACK_SITE_CONFIG = {
  siteName: '三目子',
  siteSubtitle: '把用过的东西，写成能用的建议',
  siteDescription: '产品推荐与长期评测。不带货、不接稿，只写自己每天在用的东西。',
  nav: [
    { label: '首页', path: '/' },
    { label: '全部推荐', path: '/#list' },
  ],
  footerText: `© ${new Date().getFullYear()} 三目子 · 产品推荐`,
  icp: '',
}
