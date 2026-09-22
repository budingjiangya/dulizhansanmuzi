/**
 * @RawResponse() 装饰器
 * 声明该接口跳过统一响应包装（例如直接输出文件流、HTML 页面）。
 */
import { SetMetadata } from '@nestjs/common'

/** 元数据 key：跳过统一包装 */
export const RAW_RESPONSE_KEY = 'rawResponse'

/** 声明该接口不做 { code, message, data } 包装 */
export const RawResponse = (): MethodDecorator & ClassDecorator => SetMetadata(RAW_RESPONSE_KEY, true)
