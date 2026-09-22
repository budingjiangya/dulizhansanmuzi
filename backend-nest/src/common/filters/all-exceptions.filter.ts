/**
 * 全局异常过滤器
 * 把任意异常统一转换为 { code, message, data: null, timestamp, traceId }，
 * 并同步设置 HTTP 状态码（40100->401、40300->403、40400->404、40900->409、42900->429，其余 400/500）。
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { BizCode } from '@sanmuzi/contracts'
import type { Request, Response } from 'express'
import { BIZ_CODE_HTTP_STATUS, BizException } from '../exceptions/biz.exception'

/** 请求对象上挂载的追踪信息（由 main.ts 中间件写入） */
export interface TracedRequest extends Request {
  traceId?: string
}

/** 过滤器输出体 */
interface ErrorBody {
  code: number
  message: string
  data: null
  timestamp: number
  traceId: string
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<TracedRequest>()
    const traceId = request.traceId ?? `trace-${Date.now().toString(36)}`

    const { code, message, status } = this.resolve(exception)

    if (status >= 500) {
      const stack = exception instanceof Error ? exception.stack : String(exception)
      this.logger.error(`[${traceId}] ${request.method} ${request.originalUrl} -> ${code} ${message}\n${stack}`)
    } else {
      this.logger.warn(`[${traceId}] ${request.method} ${request.originalUrl} -> ${code} ${message}`)
    }

    const body: ErrorBody = { code, message, data: null, timestamp: Date.now(), traceId }
    response.status(status).json(body)
  }

  /** 把各类异常归一化为业务码 + 消息 + HTTP 状态码 */
  private resolve(exception: unknown): { code: number; message: string; status: number } {
    // 1. 业务异常（含守卫抛出的鉴权异常）
    if (exception instanceof BizException) {
      return {
        code: exception.bizCode,
        message: exception.message,
        status: BIZ_CODE_HTTP_STATUS[exception.bizCode] ?? 500,
      }
    }

    // 2. Nest 内置 HTTP 异常：按状态码映射业务码
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const payload = exception.getResponse()
      const message = this.extractHttpMessage(payload, exception.message)
      return { code: this.mapStatusToBizCode(status), message, status }
    }

    // 3. Prisma 已知错误
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.resolvePrismaError(exception)
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return { code: BizCode.PARAM_INVALID, message: '数据校验失败', status: HttpStatus.BAD_REQUEST }
    }

    // 4. 其他未知异常
    const message = exception instanceof Error ? exception.message : '服务器内部错误'
    return { code: BizCode.SERVER_ERROR, message: message || '服务器内部错误', status: HttpStatus.INTERNAL_SERVER_ERROR }
  }

  /** 从 HttpException 响应体中提取可读消息（校验失败时拼接全部约束提示） */
  private extractHttpMessage(payload: unknown, fallback: string): string {
    if (typeof payload === 'string' && payload.trim() !== '') return payload
    if (typeof payload === 'object' && payload !== null) {
      const record = payload as { message?: unknown; error?: unknown }
      if (Array.isArray(record.message)) {
        const list = record.message.filter((item): item is string => typeof item === 'string')
        if (list.length > 0) return list.join('；')
      }
      if (typeof record.message === 'string' && record.message.trim() !== '') return record.message
      if (typeof record.error === 'string' && record.error.trim() !== '') return record.error
    }
    return fallback
  }

  /** HTTP 状态码 -> 业务码 */
  private mapStatusToBizCode(status: number): number {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return BizCode.PARAM_INVALID
      case HttpStatus.UNAUTHORIZED:
        return BizCode.UNAUTHORIZED
      case HttpStatus.FORBIDDEN:
        return BizCode.FORBIDDEN
      case HttpStatus.NOT_FOUND:
        return BizCode.NOT_FOUND
      case HttpStatus.CONFLICT:
        return BizCode.CONFLICT
      case HttpStatus.TOO_MANY_REQUESTS:
        return BizCode.TOO_MANY_REQUESTS
      default:
        return status >= 500 ? BizCode.SERVER_ERROR : BizCode.PARAM_INVALID
    }
  }

  /** Prisma 已知错误 -> 业务码 */
  private resolvePrismaError(error: Prisma.PrismaClientKnownRequestError): {
    code: number
    message: string
    status: number
  } {
    switch (error.code) {
      case 'P2002': {
        const target = error.meta?.target
        const field = Array.isArray(target) ? target.join(', ') : typeof target === 'string' ? target : '字段'
        return {
          code: BizCode.CONFLICT,
          message: `数据已存在，违反唯一约束：${field}`,
          status: HttpStatus.CONFLICT,
        }
      }
      case 'P2003':
        return { code: BizCode.CONFLICT, message: '存在关联数据，操作被拒绝', status: HttpStatus.CONFLICT }
      case 'P2025':
        return { code: BizCode.NOT_FOUND, message: '记录不存在或已被删除', status: HttpStatus.NOT_FOUND }
      case 'P2000':
        return { code: BizCode.PARAM_INVALID, message: '字段内容过长', status: HttpStatus.BAD_REQUEST }
      default:
        return { code: BizCode.SERVER_ERROR, message: `数据库操作失败（${error.code}）`, status: HttpStatus.INTERNAL_SERVER_ERROR }
    }
  }
}
