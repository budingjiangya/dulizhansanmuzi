/**
 * 应用入口
 * 全局装配：路由前缀、统一校验管道、统一拦截器、统一异常过滤器、CORS 白名单、
 * Swagger 文档、静态资源、优雅退出。
 *
 * 注意：必须在任何业务模块之前安装契约包加载垫片，否则 CommonJS 运行时
 * （node dist/main.js）无法解析 ESM 形式的 @sanmuzi/contracts。
 * 编译后所有 import 都会被提升为 require，因此这里的函数调用会先于下方 require 执行。
 */
import { registerContractsLoader } from './register-contracts'

registerContractsLoader()

import { Logger, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory, Reflector } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import type { NextFunction, Request, Response } from 'express'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { configureFfmpeg, resolveExecutable } from './common/utils/ffmpeg.util'
import { STATIC_URL_PREFIX } from './common/constants/storage.constants'
import { UPLOAD_ROOT, type AppConfiguration } from './config/configuration'
/** 请求对象上追加 traceId（供过滤器输出） */
type TracedRequest = Request & { traceId?: string }

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap')
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  })
  const configService = app.get(ConfigService<AppConfiguration, true>)

  const port = configService.get('port', { infer: true })
  const apiPrefix = configService.get('apiPrefix', { infer: true })
  const corsOrigins = configService.get('corsOrigins', { infer: true })

  // FFmpeg 可执行文件路径（支持 .env 覆盖，留空则从 PATH 查找）
  configureFfmpeg({
    ffmpegPath: configService.get('ffmpegPath', { infer: true }),
    ffprobePath: configService.get('ffprobePath', { infer: true }),
  })
  logger.log(`FFmpeg 路径：${resolveExecutable('ffmpeg')}`)
  logger.log(`FFprobe 路径：${resolveExecutable('ffprobe')}`)

  // 确保本地上传目录存在（静态资源根目录）
  mkdirSync(UPLOAD_ROOT, { recursive: true })

  // 追踪 ID 中间件：所有响应（含错误）都能带上 traceId，便于对照日志
  app.use((request: TracedRequest, response: Response, next: NextFunction) => {
    const incoming = request.headers['x-trace-id']
    const traceId = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID()
    request.traceId = traceId
    response.setHeader('X-Trace-Id', traceId)
    next()
  })

  // 全局路由前缀：静态资源 /static 不套用 api 前缀
  app.setGlobalPrefix(apiPrefix, { exclude: ['static/(.*)'] })

  // 统一校验管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidNonWhitelisted: false,
    }),
  )

  // 统一响应包装 + 统一异常包装
  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)))
  app.useGlobalFilters(new AllExceptionsFilter())

  // CORS 白名单：无 Origin 的请求（curl / 服务端调用）放行
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true)
        return
      }
      logger.warn(`CORS 拒绝来源：${origin}`)
      callback(null, false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Trace-Id'],
    exposedHeaders: ['X-Trace-Id'],
  })

  // Swagger 文档（挂在 /{apiPrefix}/docs，不受全局前缀二次拼接影响）
  const swaggerConfig = new DocumentBuilder()
    .setTitle('产品推荐博客站点 API')
    .setDescription(
      '产品推荐博客站点后端接口文档：包含前台门户接口、登录鉴权、账号/角色/日志管理、博客文章管理、' +
        '文件与视频上传（FFmpeg 抽帧 / 分片上传）与工作台统计。\n\n' +
        '统一响应结构：成功 { code: 0, message: "ok", data, timestamp }；' +
        '失败 { code, message, data: null, timestamp, traceId }。',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: '登录接口返回的 token，格式：Bearer <token>' },
      'bearer',
    )
    .addServer(`http://localhost:${port}`, '本地开发环境')
    .build()
  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true, docExpansion: 'list' },
  })

  app.enableShutdownHooks()

  await app.listen(port, '0.0.0.0')

  logger.log(`服务已启动：http://localhost:${port}/${apiPrefix}`)
  logger.log(`接口文档：http://localhost:${port}/${apiPrefix}/docs`)
  logger.log(`静态资源：http://localhost:${port}${STATIC_URL_PREFIX}/...`)
  logger.log(`存储驱动：${configService.get('storageDriver', { infer: true })}`)
}

void bootstrap()
