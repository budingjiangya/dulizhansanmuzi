/**
 * 存储与上传相关常量
 * 约定：数据库里只保存「站内相对地址」（例如 /static/uploads/2026/01/xxx.jpg），
 * 绝对地址由前端或 StorageService.resolveUrl 按需拼接，便于更换域名与对象存储。
 */

/** 存储驱动枚举 */
export const STORAGE_DRIVER = {
  /** 本地磁盘 + Nest 静态托管 */
  LOCAL: 'local',
  /** MinIO 对象存储 */
  MINIO: 'minio',
} as const

export type StorageDriverValue = (typeof STORAGE_DRIVER)[keyof typeof STORAGE_DRIVER]

/** 站内静态资源访问前缀（与 ServeStaticModule 的 serveRoot 保持一致） */
export const STATIC_URL_PREFIX = '/static/uploads'

/** 本地驱动落盘根目录（相对于 backend-nest） */
export const LOCAL_STORAGE_DIR = 'storage/uploads'

/** 允许上传的图片扩展名 */
export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'] as const

/** 允许上传的视频扩展名 */
export const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v'] as const

/** 扩展名 -> MIME 映射（上传时统一归档类型） */
export const EXTENSION_MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
}

/** 依据扩展名取 MIME（未登记返回二进制流） */
export function resolveMimeByExtension(extension: string): string {
  return EXTENSION_MIME_MAP[extension.toLowerCase()] ?? 'application/octet-stream'
}

/** 上传分类目录名（决定 storage/uploads 下的一级目录） */
export const UPLOAD_CATEGORY = {
  /** 文章图片：正文配图与多图封面 */
  ARTICLE_IMAGE: 'article-image',
  /** 文章视频：封面短视频与直传视频 */
  ARTICLE_VIDEO: 'article-video',
  /** FFmpeg 抽帧封面 */
  VIDEO_FRAME: 'video-frame',
  /** 演示素材（种子数据） */
  DEMO: 'demo',
  /** 分片上传临时目录 */
  CHUNK_TEMP: 'chunk-temp',
} as const

/** 抽帧图片统一扩展名 */
export const FRAME_IMAGE_EXTENSION = '.jpg'

/** 单个上传文件名随机化长度（十六进制字符数） */
export const RANDOM_NAME_LENGTH = 24

/** 依赖注入令牌：存储驱动实现（local / minio） */
export const STORAGE_DRIVER_TOKEN = 'STORAGE_DRIVER_TOKEN'
