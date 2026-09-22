/**
 * @Public() 装饰器
 * 标记无需登录即可访问的接口（登录、前台门户接口）。
 */
import { SetMetadata } from '@nestjs/common'

/** 元数据 key：标记为公开接口 */
export const IS_PUBLIC_KEY = 'isPublic'

/** 声明该接口跳过 JWT 鉴权 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true)
