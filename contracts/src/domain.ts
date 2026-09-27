/**
 * 领域模型与接口出入参契约
 * 与 backend-nest/prisma/schema.prisma 一一对应；两个前端只消费这里的类型。
 */

import type { PageQuery, TimeRangeQuery } from './core'
import type { AdminStatusValue, CoverTypeValue, LoginResultValue } from './enums'

/* ------------------------------------------------------------------ *
 * 鉴权
 * ------------------------------------------------------------------ */

/** JWT 载荷：只放 userId / roleId，权限每次请求实时查库 */
export interface JwtPayload {
  userId: number
  roleId: number
  /** 签发时间（秒） */
  iat?: number
  /** 过期时间（秒） */
  exp?: number
}

export interface LoginDto {
  username: string
  password: string
}

export interface LoginVo {
  /** JWT 访问令牌 */
  token: string
  /** 过期时间戳（毫秒） */
  expiresAt: number
  user: AdminUserInfo
}

/** 当前登录管理员信息（/auth/profile 与登录接口共用） */
export interface AdminUserInfo {
  id: number
  username: string
  realName: string
  roleId: number
  roleName: string
  status: AdminStatusValue
  permissions: string[]
  lastLoginAt: string | null
}

export interface ChangePasswordDto {
  oldPassword: string
  newPassword: string
}

/* ------------------------------------------------------------------ *
 * 管理员账号
 * ------------------------------------------------------------------ */

export interface AdminUserVo {
  id: number
  username: string
  realName: string
  roleId: number
  roleName: string
  status: AdminStatusValue
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminUserQuery extends PageQuery {
  username?: string
  realName?: string
  roleId?: number
  status?: AdminStatusValue
}

export interface CreateAdminUserDto {
  username: string
  password: string
  realName: string
  roleId: number
  status?: AdminStatusValue
}

export type UpdateAdminUserDto = Partial<Omit<CreateAdminUserDto, 'username' | 'password'>> & {
  username?: string
}

export interface ResetPasswordDto {
  newPassword: string
}

/* ------------------------------------------------------------------ *
 * 角色
 * ------------------------------------------------------------------ */

export interface AdminRoleVo {
  id: number
  roleName: string
  permissions: string[]
  createdAt: string
  updatedAt: string
  /** 该角色下的账号数量，删除前提示用 */
  userCount: number
}

export interface CreateAdminRoleDto {
  roleName: string
  permissions: string[]
}

export type UpdateAdminRoleDto = Partial<CreateAdminRoleDto>

/* ------------------------------------------------------------------ *
 * 登录日志
 * ------------------------------------------------------------------ */

export interface LoginLogVo {
  id: number
  adminUserId: number
  username: string
  realName: string | null
  loginIp: string
  loginResult: LoginResultValue
  loginTime: string
}

export interface LoginLogQuery extends PageQuery, TimeRangeQuery {
  username?: string
  loginResult?: LoginResultValue
}

/* ------------------------------------------------------------------ *
 * 博客文章
 * ------------------------------------------------------------------ */

/** 首页卡片列表项：刻意不带 content，避免首页拉取富文本正文 */
export interface ArticleListItemVo {
  id: number
  title: string
  shortDesc: string
  coverType: CoverTypeValue
  /** coverType=image 时的多张封面图（已解析为可用地址） */
  coverImages: string[]
  /** coverType=video 时的短视频地址 */
  coverVideo: string | null
  /** coverType=video 时的 FFmpeg 随机抽帧静态封面 */
  coverVideoFrame: string | null
  isRecommend: boolean
  isPublish: boolean
  sort: number
  /** 所属分类 id，未分类为 null */
  categoryId: number | null
  /** 所属分类名，未分类为 null（列表与详情都回填，避免前端再查一次） */
  categoryName: string | null
  createdAt: string
  updatedAt: string
}

/** 文章详情：含富文本 HTML 正文 */
export interface ArticleDetailVo extends ArticleListItemVo {
  content: string
}

export interface ArticleQuery extends PageQuery {
  keyword?: string
  coverType?: CoverTypeValue
  isRecommend?: boolean
  isPublish?: boolean
  startTime?: string
  endTime?: string
}

/** 前台站内搜索入参（公开接口，覆盖全部已上架文章） */
export interface PortalSearchQuery extends PageQuery {
  /** 搜索关键词，必填；匹配标题、摘要与富文本正文 */
  keyword: string
}

export interface CreateArticleDto {
  title: string
  shortDesc: string
  coverType: CoverTypeValue
  coverImages?: string[]
  coverVideo?: string | null
  coverVideoFrame?: string | null
  content: string
  isRecommend?: boolean
  isPublish?: boolean
  sort?: number
  /** 所属分类 id；null 或省略表示未分类 */
  categoryId?: number | null
}

export type UpdateArticleDto = Partial<CreateArticleDto>

/** 列表内快速切换上下架 / 推荐位 */
export interface ToggleArticleDto {
  value: boolean
}

/** 拖拽排序入参 */
export interface SortArticleDto {
  sort: number
}

/* ------------------------------------------------------------------ *
 * 文件与视频
 * ------------------------------------------------------------------ */

export interface UploadedFileVo {
  /** 站内可访问地址，例如 /static/uploads/2026/01/xxx.png */
  url: string
  /** 原始文件名 */
  originalName: string
  /** 字节大小 */
  size: number
  /** MIME 类型 */
  mimeType: string
}

export interface UploadedVideoVo extends UploadedFileVo {
  /** ffprobe 读取的视频总时长（秒），读取失败为 null */
  duration: number | null
  /** 分辨率，例如 1280x720 */
  resolution: string | null
  /** 随机抽帧得到的静态封面地址 */
  coverVideoFrame: string | null
  /** 抽帧时间点（秒） */
  frameTime: number | null
}

/** 分片上传：初始化 */
export interface ChunkInitDto {
  /** 文件唯一标识（前端按 name+size+lastModified 生成） */
  fileHash: string
  fileName: string
  fileSize: number
  /** 分片大小（字节） */
  chunkSize: number
  /** 分片总数 */
  totalChunks: number
  mimeType?: string
}

export interface ChunkInitVo {
  uploadId: string
  fileHash: string
  /** 已上传完成的分片序号，用于断点续传 */
  uploadedChunks: number[]
  /** 秒传命中：该文件此前已合并完成，直接返回地址 */
  instant: boolean
  file: UploadedVideoVo | null
}

export interface ChunkPartVo {
  uploadId: string
  chunkIndex: number
  received: number
}

export interface ChunkMergeDto {
  uploadId: string
}

/** 单独对一个已上传视频重新抽帧 */
export interface ExtractFrameDto {
  /** 视频站内地址 */
  videoUrl: string
  /** 指定时间点（秒）；不传则在后端随机 */
  time?: number
}

export interface ExtractFrameVo {
  coverVideoFrame: string
  frameTime: number
  duration: number
}

/* ------------------------------------------------------------------ *
 * 站点配置（前台）
 * ------------------------------------------------------------------ */

export interface SiteNavItem {
  label: string
  path: string
}

export interface SiteConfigVo {
  siteName: string
  siteSubtitle: string
  siteDescription: string
  nav: SiteNavItem[]
  footerText: string
  icp: string
}

/* ------------------------------------------------------------------ *
 * 工作台统计（后台首页）
 * ------------------------------------------------------------------ */

export interface DashboardStatsVo {
  articleTotal: number
  articlePublished: number
  articleDraft: number
  recommendTotal: number
  adminUserTotal: number
  loginToday: number
  loginFailToday: number
  /** 最近 7 天登录趋势 */
  loginTrend: Array<{ date: string; success: number; fail: number }>
}

/* ------------------------------------------------------------------ *
 * 分类（后台管理 + 前台展示共用）
 * ------------------------------------------------------------------ */

export interface CategoryVo {
  id: number
  name: string
  /** 排序权重，越大越靠前 */
  sort: number
  /** 该分类下的文章数量（用于前台展示与后台删除前提示） */
  articleCount: number
  createdAt: string
  updatedAt: string
}

export interface CreateCategoryDto {
  name: string
  sort?: number
}

export type UpdateCategoryDto = Partial<CreateCategoryDto>

/* ------------------------------------------------------------------ *
 * 邮件订阅（图形验证码 + 公开提交）
 * ------------------------------------------------------------------ */

export interface CaptchaVo {
  /** 验证码标识，提交时原样回传；本身不含答案 */
  captchaId: string
  /** 已编码好的 data URI，前端直接用于 <img src>，不要走 v-html */
  imageBase64: string
}

export interface SubscribeDto {
  email: string
  /** 留言，选填，可留空 */
  message?: string
  captchaId: string
  captchaCode: string
}

export interface SubscribeResultVo {
  /** true 表示该邮箱此前已订阅，本次未新建记录 */
  duplicated: boolean
}

export interface SubscriptionVo {
  id: number
  email: string
  message: string | null
  sourceIp: string
  userAgent: string | null
  status: number
  createdAt: string
}

export interface QuerySubscriptionDto extends PageQuery, TimeRangeQuery {
  email?: string
}

/* ------------------------------------------------------------------ *
 * 操作日志（后台写操作的审计记录）
 * ------------------------------------------------------------------ */

export interface OperationLogVo {
  id: number
  adminUserId: number | null
  /** 操作人账号快照：账号改名或删除后日志仍可读 */
  adminUsername: string
  /** 模块，如 blog:category */
  module: string
  /** 动作，如 create / update / delete */
  action: string
  targetType: string | null
  targetId: number | null
  summary: string | null
  requestMethod: string
  requestPath: string
  operationIp: string
  /** 1 成功 / 0 失败 */
  result: number
  errorMessage: string | null
  createdAt: string
}

export interface QueryOperationLogDto extends PageQuery, TimeRangeQuery {
  adminUsername?: string
  module?: string
  /** 1 成功 / 0 失败 */
  result?: number
}

/** 拦截器写入操作日志的入参（业务代码不直接构造，由拦截器组装） */
export interface OperationLogEntry {
  adminUserId: number | null
  adminUsername: string
  module: string
  action: string
  targetType?: string | null
  targetId?: number | null
  summary?: string | null
  requestMethod: string
  requestPath: string
  operationIp: string
  result: number
  errorMessage?: string | null
}
