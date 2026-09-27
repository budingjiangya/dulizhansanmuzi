/**
 * 缓存 key 常量
 * 统一在这里登记，避免各处硬编码字符串导致清理缓存时漏删。
 */

/** 前台文章列表缓存 key 前缀（清理时按前缀批量删除） */
export const PORTAL_ARTICLES_CACHE_KEY = 'cache:portal:articles'

/** 分片上传会话 key 前缀 */
export const CHUNK_SESSION_KEY = 'chunk:session'

/** 分片上传已完成文件（秒传）key 前缀 */
export const CHUNK_FINISHED_KEY = 'chunk:finished'

/** 图形验证码答案 key 前缀：`<prefix>:<captchaId>`，TTL 120 秒且一次性使用 */
export const CAPTCHA_KEY = 'captcha'

/** 邮件订阅提交限流 key 前缀：`<prefix>:<ip>`，窗口 1 小时 */
export const SUBSCRIBE_RATE_KEY = 'subscribe:rate'
