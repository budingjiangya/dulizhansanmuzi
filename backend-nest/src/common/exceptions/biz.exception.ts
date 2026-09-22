/**
 * 业务异常
 * 承载 contracts 中的 BizCode，由 AllExceptionsFilter 统一转换为响应体与 HTTP 状态码。
 * 业务代码只抛这个异常，不直接拼装响应，保证错误结构唯一。
 */
import { HttpException } from '@nestjs/common'
import { BizCode, type BizCodeValue } from '@sanmuzi/contracts'

/** 业务码 -> HTTP 状态码映射 */
export const BIZ_CODE_HTTP_STATUS: Record<number, number> = {
  [BizCode.SUCCESS]: 200,
  [BizCode.PARAM_INVALID]: 400,
  [BizCode.UNAUTHORIZED]: 401,
  [BizCode.FORBIDDEN]: 403,
  [BizCode.NOT_FOUND]: 404,
  [BizCode.CONFLICT]: 409,
  [BizCode.TOO_MANY_REQUESTS]: 429,
  [BizCode.SERVER_ERROR]: 500,
}

/** 常见业务异常消息模板 */
export const BIZ_MESSAGE = {
  UNAUTHORIZED: '登录状态已失效，请重新登录',
  FORBIDDEN: '当前账号无该操作权限',
  NOT_FOUND: '资源不存在',
  CONFLICT: '数据已存在或状态冲突',
  TOO_MANY_REQUESTS: '操作过于频繁，请稍后再试',
  SERVER_ERROR: '服务器内部错误',
} as const

export class BizException extends HttpException {
  /** 业务码 */
  readonly bizCode: BizCodeValue

  constructor(bizCode: BizCodeValue, message: string, data: unknown = null) {
    super({ code: bizCode, message, data }, BIZ_CODE_HTTP_STATUS[bizCode] ?? 500)
    this.bizCode = bizCode
  }

  /** 40000 参数校验失败 */
  static paramInvalid(message = '请求参数不合法'): BizException {
    return new BizException(BizCode.PARAM_INVALID, message)
  }

  /** 40100 未登录 / Token 失效 */
  static unauthorized(message: string = BIZ_MESSAGE.UNAUTHORIZED): BizException {
    return new BizException(BizCode.UNAUTHORIZED, message)
  }

  /** 40300 无权限 */
  static forbidden(message: string = BIZ_MESSAGE.FORBIDDEN): BizException {
    return new BizException(BizCode.FORBIDDEN, message)
  }

  /** 40400 资源不存在 */
  static notFound(message: string = BIZ_MESSAGE.NOT_FOUND): BizException {
    return new BizException(BizCode.NOT_FOUND, message)
  }

  /** 40900 业务冲突 */
  static conflict(message: string = BIZ_MESSAGE.CONFLICT): BizException {
    return new BizException(BizCode.CONFLICT, message)
  }

  /** 42900 限流 */
  static tooManyRequests(message: string = BIZ_MESSAGE.TOO_MANY_REQUESTS): BizException {
    return new BizException(BizCode.TOO_MANY_REQUESTS, message)
  }

  /** 50000 服务端异常 */
  static serverError(message: string = BIZ_MESSAGE.SERVER_ERROR): BizException {
    return new BizException(BizCode.SERVER_ERROR, message)
  }
}
