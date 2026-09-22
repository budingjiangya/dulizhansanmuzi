/**
 * Redis 模块（全局）
 * 导出 RedisService，供登录限流、首页缓存、分片上传会话使用。
 */
import { Global, Module } from '@nestjs/common'
import { RedisService } from './redis.service'

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
