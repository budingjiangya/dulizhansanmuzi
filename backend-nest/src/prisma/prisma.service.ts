/**
 * Prisma 数据库服务
 * 生命周期：onModuleInit 建立连接（失败直接抛错，避免服务带病启动），onModuleDestroy 断开连接。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    })
  }

  /** 应用启动时连接数据库 */
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect()
      this.logger.log('MySQL 连接成功')
    } catch (error) {
      this.logger.error(`MySQL 连接失败：${error instanceof Error ? error.message : String(error)}`)
      throw error
    }

    this.enableShutdownHooks()
  }

  /**
   * 注册 Prisma 优雅退出钩子
   * 说明：不同 Prisma 版本对 beforeExit 事件的支持不一致，这里做类型收敛 + 异常兜底，
   * 即使当前版本不支持也不会影响服务正常运行（Nest 关闭时仍会走 onModuleDestroy）。
   */
  enableShutdownHooks(): void {
    try {
      const client = this as unknown as {
        $on?: (event: 'beforeExit', callback: () => Promise<void> | void) => void
      }
      client.$on?.('beforeExit', () => {
        void this.$disconnect()
      })
      this.logger.log('Prisma 优雅退出钩子已注册')
    } catch {
      this.logger.debug('当前 Prisma 版本不支持 beforeExit 事件，跳过优雅退出监听')
    }
  }

  /** 应用关闭时断开连接 */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
    this.logger.log('MySQL 连接已关闭')
  }

  /** 健康检查：数据库连通性 */
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`
      return true
    } catch {
      return false
    }
  }
}
