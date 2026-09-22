/**
 * 统一响应拦截器
 * 成功响应统一包装为 { code: 0, message: 'ok', data, timestamp }；
 * 通过 @RawResponse() 标记的接口（文件流、HTML）原样透传。
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { BizCode, type ApiResponse } from '@sanmuzi/contracts'
import type { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator'

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T> | T> {
    const isRaw =
      this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false

    if (isRaw) return next.handle()

    return next.handle().pipe(
      map((data) => ({
        code: BizCode.SUCCESS,
        message: 'ok',
        data: (data ?? null) as T,
        timestamp: Date.now(),
      })),
    )
  }
}
