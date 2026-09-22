/** 后台环境配置：接口与静态资源基地址集中管理 */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')
export const ASSET_BASE = (import.meta.env.VITE_ASSET_BASE ?? '').replace(/\/+$/, '')

/** 登录态存储键 */
export const TOKEN_KEY = 'sanmuzi-admin-token'
export const TOKEN_EXPIRES_KEY = 'sanmuzi-admin-token-expires'

/** 上传约束（与后端 MAX_* 环境变量保持一致） */
export const UPLOAD_LIMITS = {
  imageMaxMB: 10,
  videoMaxMB: 500,
  chunkSizeMB: 8,
  imageAccept: 'image/png,image/jpeg,image/webp,image/gif',
  videoAccept: 'video/mp4,video/webm,video/quicktime',
} as const
