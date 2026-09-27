/**
 * 操作日志元数据装饰器
 *
 * 用法（加在后台已鉴权的写接口上）：
 *   @OperationLog({ module: 'blog:category', action: 'create', targetType: 'category' })
 *
 * 只有声明了本装饰器的路由才会被 OperationLogInterceptor 记录；
 * 未声明的路由完全不产生日志开销。
 *
 * 记录条件（拦截器内强制校验，装饰器本身不做判断）：
 * - 请求已通过 JWT 鉴权（request.user.userId 存在）
 * - HTTP 方法属于 POST / PUT / PATCH / DELETE
 * 公开接口（无 request.user）即使误加装饰器也不会被记录。
 */
import { SetMetadata } from '@nestjs/common'

/** 元数据 key */
export const OPERATION_LOG_KEY = 'operation_log_meta'

export interface OperationLogMeta {
  /** 模块标识，如 blog:category、system:user */
  module: string
  /** 动作标识，如 create / update / delete */
  action: string
  /** 目标类型，如 category、user；仅用于展示 */
  targetType?: string
}

export function OperationLog(meta: OperationLogMeta): MethodDecorator {
  return SetMetadata(OPERATION_LOG_KEY, meta)
}
