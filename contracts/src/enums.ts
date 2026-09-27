/**
 * 全站枚举与权限码：后端守卫、后台菜单/按钮显隐、种子数据都引用此处，避免字符串硬编码漂移。
 */

/* ------------------------------------------------------------------ *
 * 角色
 * ------------------------------------------------------------------ */

export const RoleId = {
  /** 超级管理员：账号/角色/日志 + 全部文章权限 */
  SUPER_ADMIN: 1,
  /** 内容编辑：仅文章新增、编辑、删除 */
  CONTENT_EDITOR: 2,
} as const

export type RoleIdValue = (typeof RoleId)[keyof typeof RoleId]

export const ROLE_NAME: Record<RoleIdValue, string> = {
  [RoleId.SUPER_ADMIN]: '超级管理员',
  [RoleId.CONTENT_EDITOR]: '内容编辑',
}

/* ------------------------------------------------------------------ *
 * 权限码
 * ------------------------------------------------------------------ */

export const PERMISSIONS = {
  /* 博客文章 */
  BLOG_ARTICLE_LIST: 'blog:article:list',
  BLOG_ARTICLE_CREATE: 'blog:article:create',
  BLOG_ARTICLE_UPDATE: 'blog:article:update',
  BLOG_ARTICLE_DELETE: 'blog:article:delete',
  BLOG_ARTICLE_UPLOAD: 'blog:article:upload',
  /* 账号管理 */
  SYSTEM_USER_LIST: 'system:user:list',
  SYSTEM_USER_CREATE: 'system:user:create',
  SYSTEM_USER_UPDATE: 'system:user:update',
  SYSTEM_USER_DELETE: 'system:user:delete',
  SYSTEM_USER_RESET_PWD: 'system:user:reset-password',
  /* 角色管理 */
  SYSTEM_ROLE_LIST: 'system:role:list',
  SYSTEM_ROLE_CREATE: 'system:role:create',
  SYSTEM_ROLE_UPDATE: 'system:role:update',
  SYSTEM_ROLE_DELETE: 'system:role:delete',
  /* 登录日志 */
  SYSTEM_LOG_LIST: 'system:log:list',
  /* 分类管理 */
  BLOG_CATEGORY_LIST: 'blog:category:list',
  BLOG_CATEGORY_CREATE: 'blog:category:create',
  BLOG_CATEGORY_UPDATE: 'blog:category:update',
  BLOG_CATEGORY_DELETE: 'blog:category:delete',
  /* 邮件订阅 */
  SYSTEM_SUBSCRIBE_LIST: 'system:subscribe:list',
  SYSTEM_SUBSCRIBE_DELETE: 'system:subscribe:delete',
  /* 操作日志 */
  SYSTEM_OPLOG_LIST: 'system:oplog:list',
} as const

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

/** 权限码分组元数据：后台权限配置界面与角色编辑页直接渲染该结构 */
export interface PermissionGroup {
  key: string
  label: string
  items: Array<{ code: PermissionCode; label: string }>
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'blog',
    label: '博客文章',
    items: [
      { code: PERMISSIONS.BLOG_ARTICLE_LIST, label: '文章列表' },
      { code: PERMISSIONS.BLOG_ARTICLE_CREATE, label: '新增文章' },
      { code: PERMISSIONS.BLOG_ARTICLE_UPDATE, label: '编辑文章' },
      { code: PERMISSIONS.BLOG_ARTICLE_DELETE, label: '删除文章' },
      { code: PERMISSIONS.BLOG_ARTICLE_UPLOAD, label: '资源上传' },
    ],
  },
  {
    key: 'system',
    label: '账号管理',
    items: [
      { code: PERMISSIONS.SYSTEM_USER_LIST, label: '账号列表' },
      { code: PERMISSIONS.SYSTEM_USER_CREATE, label: '新增账号' },
      { code: PERMISSIONS.SYSTEM_USER_UPDATE, label: '编辑账号' },
      { code: PERMISSIONS.SYSTEM_USER_DELETE, label: '删除账号' },
      { code: PERMISSIONS.SYSTEM_USER_RESET_PWD, label: '重置密码' },
    ],
  },
  {
    key: 'role',
    label: '角色管理',
    items: [
      { code: PERMISSIONS.SYSTEM_ROLE_LIST, label: '角色列表' },
      { code: PERMISSIONS.SYSTEM_ROLE_CREATE, label: '新增角色' },
      { code: PERMISSIONS.SYSTEM_ROLE_UPDATE, label: '编辑角色' },
      { code: PERMISSIONS.SYSTEM_ROLE_DELETE, label: '删除角色' },
    ],
  },
  {
    key: 'log',
    label: '登录日志',
    items: [{ code: PERMISSIONS.SYSTEM_LOG_LIST, label: '日志查询' }],
  },
  {
    key: 'category',
    label: '分类管理',
    items: [
      { code: PERMISSIONS.BLOG_CATEGORY_LIST, label: '分类列表' },
      { code: PERMISSIONS.BLOG_CATEGORY_CREATE, label: '新增分类' },
      { code: PERMISSIONS.BLOG_CATEGORY_UPDATE, label: '编辑分类' },
      { code: PERMISSIONS.BLOG_CATEGORY_DELETE, label: '删除分类' },
    ],
  },
  {
    key: 'subscribe',
    label: '邮件订阅',
    items: [
      { code: PERMISSIONS.SYSTEM_SUBSCRIBE_LIST, label: '订阅列表' },
      { code: PERMISSIONS.SYSTEM_SUBSCRIBE_DELETE, label: '删除订阅' },
    ],
  },
  {
    key: 'oplog',
    label: '操作日志',
    items: [{ code: PERMISSIONS.SYSTEM_OPLOG_LIST, label: '日志查询' }],
  },
]

/** 超管拥有全部权限码 */
export const ALL_PERMISSIONS: PermissionCode[] = PERMISSION_GROUPS.flatMap((group) =>
  group.items.map((item) => item.code),
)

/**
 * 内容编辑的权限
 * 除文章增删改查与上传外，额外需要 `blog:category:list` —— 写文章时要选分类。
 * 但不包含分类的增删改，也不包含订阅与操作日志（那些属于超管）。
 */
export const CONTENT_EDITOR_PERMISSIONS: PermissionCode[] = [
  PERMISSIONS.BLOG_ARTICLE_LIST,
  PERMISSIONS.BLOG_ARTICLE_CREATE,
  PERMISSIONS.BLOG_ARTICLE_UPDATE,
  PERMISSIONS.BLOG_ARTICLE_DELETE,
  PERMISSIONS.BLOG_ARTICLE_UPLOAD,
  PERMISSIONS.BLOG_CATEGORY_LIST,
]

/* ------------------------------------------------------------------ *
 * 账号状态 / 登录结果 / 封面类型
 * ------------------------------------------------------------------ */

/** 管理员账号状态 */
export const AdminStatus = {
  /** 0 禁用 */
  DISABLED: 0,
  /** 1 启用 */
  ENABLED: 1,
} as const

export type AdminStatusValue = (typeof AdminStatus)[keyof typeof AdminStatus]

export const ADMIN_STATUS_TEXT: Record<AdminStatusValue, string> = {
  [AdminStatus.ENABLED]: '启用',
  [AdminStatus.DISABLED]: '禁用',
}

/** 登录日志结果 */
export const LoginResult = {
  FAIL: 0,
  SUCCESS: 1,
} as const

export type LoginResultValue = (typeof LoginResult)[keyof typeof LoginResult]

export const LOGIN_RESULT_TEXT: Record<LoginResultValue, string> = {
  [LoginResult.SUCCESS]: '登录成功',
  [LoginResult.FAIL]: '登录失败',
}

/** 封面类型：多图轮播 / 短视频悬浮预览 */
export const CoverType = {
  /** 多张图片 hover 自动轮切 */
  IMAGE: 'image',
  /** 短视频 hover 静音预览，默认展示 FFmpeg 抽帧静态封面 */
  VIDEO: 'video',
} as const

export type CoverTypeValue = (typeof CoverType)[keyof typeof CoverType]

export const COVER_TYPE_TEXT: Record<CoverTypeValue, string> = {
  [CoverType.IMAGE]: '多图轮播',
  [CoverType.VIDEO]: '视频悬浮预览',
}

/** 分片上传状态 */
export const UploadStatus = {
  PENDING: 'pending',
  MERGING: 'merging',
  DONE: 'done',
  FAILED: 'failed',
} as const

export type UploadStatusValue = (typeof UploadStatus)[keyof typeof UploadStatus]
