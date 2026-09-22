/**
 * 后台配置：接口与静态资源基地址统一从访客端 config 复用，
 * 避免同一份环境变量在两个地方各解析一遍导致漂移。
 */

import { API_BASE, ASSET_BASE } from '@/config'

export { API_BASE, ASSET_BASE }

/** 登录态存储键 */
export const TOKEN_KEY = 'sanmuzi-admin-token'
export const TOKEN_EXPIRES_KEY = 'sanmuzi-admin-token-expires'

/** 后台登录页与首页路径（单应用双区域，后台统一挂在 /admin 下） */
export const ADMIN_HOME_PATH = '/admin/dashboard'
export const ADMIN_LOGIN_PATH = '/admin/login'

/** 上传约束（与后端 MAX_* 环境变量保持一致） */
export const UPLOAD_LIMITS = {
  imageMaxMB: 10,
  videoMaxMB: 500,
  chunkSizeMB: 8,
  imageAccept: 'image/png,image/jpeg,image/webp,image/gif',
  videoAccept: 'video/mp4,video/webm,video/quicktime',
} as const
