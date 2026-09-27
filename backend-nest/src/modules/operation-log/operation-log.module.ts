/**
 * 操作日志模块
 *
 * 写入：由全局拦截器 common/interceptors/operation-log.interceptor.ts 直接落库
 *      （已在 app.module.ts 注册为 APP_INTERCEPTOR），因此本模块不再重复实现 record。
 * 查询：OperationLogService.list + OperationLogController（/admin/operation-logs，权限码 system:oplog:list）。
 */
import { Module } from '@nestjs/common'
import { OperationLogController } from './operation-log.controller'
import { OperationLogService } from './operation-log.service'

@Module({
  controllers: [OperationLogController],
  providers: [OperationLogService],
  exports: [OperationLogService],
})
export class OperationLogModule {}
