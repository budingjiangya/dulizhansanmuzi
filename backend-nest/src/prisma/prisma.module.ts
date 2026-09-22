/**
 * Prisma 模块（全局）
 * 导出 PrismaService，供所有业务模块注入使用。
 */
import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
