/**
 * 应用配置加载器
 * 说明：Nest 的 ConfigModule 默认从「进程工作目录」查找 .env，pnpm --filter 执行时工作目录
 * 可能落在仓库根目录，因此这里用 dotenv 显式指定 backend-nest/.env 的绝对路径，保证
 * 无论从哪里启动都读取同一份配置。已存在的系统环境变量优先级更高（容器部署时覆盖用）。
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'

/**
 * 后端根目录（backend-nest）
 * 编译后 __dirname 为 <root>/dist/config，开发期 tsx 运行 src 时为 <root>/src/config，
 * 因此这里沿目录向上查找 package.json，兼容两种布局与容器内的 /app 目录。
 */
function locateBackendRoot(): string {
  let current = __dirname
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(resolve(current, 'package.json'))) return current
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return resolve(__dirname, '..')
}

/** 后端根目录（backend-nest） */
export const BACKEND_ROOT = locateBackendRoot()

/** .env 文件绝对路径 */
export const ENV_FILE_PATH = resolve(BACKEND_ROOT, '.env')

/** 存储根目录：backend-nest/storage */
export const STORAGE_ROOT = resolve(BACKEND_ROOT, 'storage')

/** 上传文件落盘根目录：backend-nest/storage/uploads */
export const UPLOAD_ROOT = resolve(STORAGE_ROOT, 'uploads')

/** 上传临时目录（multer 磁盘存储、分片合并中间产物） */
export const UPLOAD_TMP_ROOT = resolve(UPLOAD_ROOT, 'tmp')

if (existsSync(ENV_FILE_PATH)) {
  loadEnv({ path: ENV_FILE_PATH })
}

/** 读取字符串环境变量 */
function readString(key: string, fallback: string): string {
  const value = process.env[key]
  return value === undefined || value.trim() === '' ? fallback : value.trim()
}

/** 读取数字环境变量（非法值回退默认值） */
function readNumber(key: string, fallback: number): number {
  const raw = process.env[key]
  if (raw === undefined || raw.trim() === '') return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** 读取布尔环境变量（'true' / '1' 视为真） */
function readBoolean(key: string, fallback: boolean): boolean {
  const raw = process.env[key]
  if (raw === undefined || raw.trim() === '') return fallback
  return ['true', '1', 'yes', 'on'].includes(raw.trim().toLowerCase())
}

/** 读取逗号分隔的字符串数组 */
function readList(key: string, fallback: string[]): string[] {
  const raw = process.env[key]
  if (raw === undefined || raw.trim() === '') return fallback
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

/** 应用配置结构（全局唯一事实来源，所有模块通过 ConfigService 读取） */
export interface AppConfiguration {
  /** 运行环境 */
  nodeEnv: string
  /** 监听端口 */
  port: number
  /** 全局路由前缀 */
  apiPrefix: string
  /** 允许跨域的前端来源 */
  corsOrigins: string[]
  /** MySQL 连接串 */
  databaseUrl: string
  /** Redis 连接串 */
  redisUrl: string
  /** Redis key 统一前缀 */
  redisKeyPrefix: string
  /** 首页列表缓存秒数，0 关闭缓存 */
  portalCacheTtl: number
  /** JWT 密钥与有效期 */
  jwtSecret: string
  jwtExpiresIn: string
  /** 登录失败限流参数 */
  loginFailWindow: number
  loginFailMax: number
  loginLockSeconds: number
  /** 对象存储 */
  storageDriver: 'local' | 'minio'
  publicBaseUrl: string
  minio: {
    endPoint: string
    port: number
    useSSL: boolean
    accessKey: string
    secretKey: string
    bucket: string
  }
  /** 视频处理可执行文件路径（空串表示交给 PATH 解析） */
  ffmpegPath: string
  ffprobePath: string
  /** 上传大小上限（字节） */
  maxImageSize: number
  maxVideoSize: number
  maxChunkSize: number
  /** 种子脚本是否下载示例视频 */
  seedDownloadVideo: boolean
  /** 上传目录绝对路径 */
  uploadRoot: string
}

/** 组装配置对象 */
export function configuration(): AppConfiguration {
  const storageDriver = readString('STORAGE_DRIVER', 'local') === 'minio' ? 'minio' : 'local'
  return {
    nodeEnv: readString('NODE_ENV', 'development'),
    port: readNumber('PORT', 3000),
    apiPrefix: readString('API_PREFIX', 'api'),
    corsOrigins: readList('CORS_ORIGINS', [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
    ]),
    databaseUrl: readString('DATABASE_URL', ''),
    redisUrl: readString('REDIS_URL', ''),
    redisKeyPrefix: readString('REDIS_KEY_PREFIX', 'sanmuzi:'),
    portalCacheTtl: readNumber('PORTAL_CACHE_TTL', 30),
    jwtSecret: readString('JWT_SECRET', 'sanmuzi-product-blog-dev-secret'),
    jwtExpiresIn: readString('JWT_EXPIRES_IN', '2h'),
    loginFailWindow: readNumber('LOGIN_FAIL_WINDOW', 900),
    loginFailMax: readNumber('LOGIN_FAIL_MAX', 5),
    loginLockSeconds: readNumber('LOGIN_LOCK_SECONDS', 900),
    storageDriver,
    publicBaseUrl: readString('PUBLIC_BASE_URL', 'http://localhost:3000').replace(/\/+$/, ''),
    minio: {
      endPoint: readString('MINIO_ENDPOINT', '127.0.0.1'),
      port: readNumber('MINIO_PORT', 9000),
      useSSL: readBoolean('MINIO_USE_SSL', false),
      accessKey: readString('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: readString('MINIO_SECRET_KEY', 'minioadmin'),
      bucket: readString('MINIO_BUCKET', 'sanmuzi'),
    },
    ffmpegPath: readString('FFMPEG_PATH', ''),
    ffprobePath: readString('FFPROBE_PATH', ''),
    maxImageSize: readNumber('MAX_IMAGE_SIZE_MB', 10) * 1024 * 1024,
    maxVideoSize: readNumber('MAX_VIDEO_SIZE_MB', 500) * 1024 * 1024,
    maxChunkSize: readNumber('MAX_CHUNK_SIZE_MB', 8) * 1024 * 1024,
    seedDownloadVideo: readBoolean('SEED_DOWNLOAD_VIDEO', false),
    uploadRoot: UPLOAD_ROOT,
  }
}
