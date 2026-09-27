/**
 * 操作日志模块（骨架）
 *
 * Phase 1 由成员 B 实现：
 * - operation-log.service.ts：record（写库，内部 try/catch 绝不抛错）、list（分页查询）
 * - operation-log.controller.ts：@Controller('admin/operation-logs')，权限码 system:oplog:list
 * - dto/query-operation-log.dto.ts
 * - 配套的 common/decorators/operation-log.decorator.ts 与
 *   common/interceptors/operation-log.interceptor.ts（由成员 B 创建，
 *   拦截器的注册位置在 app.module.ts，属于冻结文件，需要时向主理人提出）
 *
 * 本文件由成员 B 补充 providers 与 controllers。
 */
import { Module } from '@nestjs/common'

@Module({})
export class OperationLogModule {}
