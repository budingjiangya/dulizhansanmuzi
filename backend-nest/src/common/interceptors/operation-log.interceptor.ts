/**
 * 操作日志拦截器
 *
 * 只记录「后台已鉴权的写操作」：
 * 1. 路由必须声明 @OperationLog 元数据，否则直接放行（零开销）；
 * 2. 请求必须已通过 JWT 鉴权（request.user.userId 存在）——公开接口不记录，
 *    匿名操作写进审计日志没有意义，而且会被刷；
 * 3. HTTP 方法必须属于 POST / PUT / PATCH / DELETE。
 *
 * 记录时机：
 * - 业务成功 → result = 1
 * - 业务抛错 → result = 0 并写入 errorMessage，然后**原样重新抛出**（不吞异常、不改变响应）
 *
 * 可靠性取舍：写日志在同一请求内 await 完成，而不是 fire-and-forget。
 * 异步写虽然更快，但进程退出会丢记录，且无法在验证脚本中断言「操作后日志立刻可查」。
 * 整个写库过程用 try/catch 兜住：日志写失败只告警，绝不影响业务响应。
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { OperationLogMeta } from '../decorators/operation-log.decorator'
import { OPERATION_LOG_KEY } from '../decorators/operation-log.decorator'
import { getClientIp } from '../utils/ip.util'
import { PrismaService } from '../../prisma/prisma.service'
import type { Observable } from 'rxjs'
import { catchError, from, map, mergeMap, throwError } from 'rxjs'

/** 需要记录日志的 HTTP 方法 */
const LOGGED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** 请求对象上由 JWT 守卫写入的用户信息 */
interface AuthedRequest {
  user?: { userId?: number; roleId?: number }
  params?: Record<string, string>
  method?: string
  originalUrl?: string
  url?: string
  headers?: Record<string, unknown>
  ip?: string
  socket?: { remoteAddress?: string }
}

@Injectable()
export class OperationLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(OperationLogInterceptor.name)

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<OperationLogMeta>(OPERATION_LOG_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!meta) return next.handle()

    const request = context.switchToHttp().getRequest<AuthedRequest>()
    const adminUserId = request.user?.userId
    const method = (request.method ?? '').toUpperCase()

    // 未登录（公开接口）或非写方法：不记录
    if (!adminUserId || !LOGGED_METHODS.has(method)) return next.handle()

    const targetIdRaw = request.params?.id
    const targetId = targetIdRaw !== undefined && Number.isFinite(Number(targetIdRaw)) ? Number(targetIdRaw) : null
    const base = {
      meta,
      adminUserId,
      targetId,
      requestMethod: method,
      requestPath: request.originalUrl ?? request.url ?? '',
      operationIp: this.resolveIp(request),
    }

    return next.handle().pipe(
      /*
       * 成功：先 await 写库，再放行响应。
       *
       * 这里刻意不用 fire-and-forget（`void this.write(...)`）：那样「写日志」与「返回响应」
       * 并行，调用方收到响应后立刻查日志页会偶发查不到记录 —— 验证脚本会随机失败，
       * 进程退出时也可能丢掉尚未落库的日志。多一次 insert 的延迟换来确定性，值得。
       */
      mergeMap((data: unknown) =>
        from(this.write({ ...base, result: 1, errorMessage: null })).pipe(map(() => data)),
      ),
      catchError((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        // 失败路径同样先 await 写库，再把原异常原样抛出（不吞异常、不改变错误响应）
        return from(this.write({ ...base, result: 0, errorMessage: message.slice(0, 512) })).pipe(
          mergeMap(() => throwError(() => error)),
        )
      }),
    )
  }

  /** 取真实客户端 IP（优先 X-Forwarded-For） */
  private resolveIp(request: AuthedRequest): string {
    try {
      return getClientIp(request as never)
    } catch {
      return request.ip ?? request.socket?.remoteAddress ?? 'unknown'
    }
  }

  /** 写库：任何失败都只告警，不影响业务响应 */
  private async write(entry: {
    meta: OperationLogMeta
    adminUserId: number
    targetId: number | null
    requestMethod: string
    requestPath: string
    operationIp: string
    result: number
    errorMessage: string | null
  }): Promise<void> {
    try {
      // 操作人账号在日志里存快照：账号改名或删除后日志仍然可读
      const user = await this.prisma.adminUser.findUnique({
        where: { id: entry.adminUserId },
        select: { username: true },
      })

      await this.prisma.adminOperationLog.create({
        data: {
          adminUserId: entry.adminUserId,
          adminUsername: user?.username ?? 'unknown',
          module: entry.meta.module,
          action: entry.meta.action,
          targetType: entry.meta.targetType ?? null,
          targetId: entry.targetId,
          requestMethod: entry.requestMethod,
          requestPath: entry.requestPath.slice(0, 255),
          operationIp: entry.operationIp,
          result: entry.result,
          errorMessage: entry.errorMessage,
        },
      })
    } catch (error) {
      this.logger.warn(
        `操作日志写入失败（不影响业务）：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
