/**
 * 应用根模块
 * 装配：配置、Prisma、Redis、静态资源、全部业务模块，以及全局守卫（JWT -> 权限）。
 */
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ServeStaticModule } from '@nestjs/serve-static'
import { JwtAuthGuard } from './common/guards/jwt-auth.guard'
import { PermissionsGuard } from './common/guards/permissions.guard'
import { OperationLogInterceptor } from './common/interceptors/operation-log.interceptor'
import { configuration, UPLOAD_ROOT } from './config/configuration'
import { AdminRoleModule } from './modules/admin-role/admin-role.module'
import { AdminUserModule } from './modules/admin-user/admin-user.module'
import { AuthModule } from './modules/auth/auth.module'
import { BlogCategoryModule } from './modules/blog-category/blog-category.module'
import { BlogModule } from './modules/blog/blog.module'
import { DashboardModule } from './modules/dashboard/dashboard.module'
import { FileStorageModule } from './modules/file-storage/file-storage.module'
import { LoginLogModule } from './modules/login-log/login-log.module'
import { OperationLogModule } from './modules/operation-log/operation-log.module'
import { PortalModule } from './modules/portal/portal.module'
import { PrismaModule } from './prisma/prisma.module'
import { RedisModule } from './redis/redis.module'
import { SubscriptionModule } from './modules/subscription/subscription.module'

@Module({
  imports: [
    // 配置：configuration.ts 已用 dotenv 显式加载 backend-nest/.env，这里全局注册
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
    }),
    PrismaModule,
    RedisModule,
    // 静态资源：storage/uploads 暴露在 /static/uploads（不套用 api 全局前缀）
    ServeStaticModule.forRoot({
      rootPath: UPLOAD_ROOT,
      serveRoot: '/static/uploads',
      serveStaticOptions: {
        index: false,
        fallthrough: false,
        maxAge: '7d',
      },
    }),
    AuthModule,
    AdminUserModule,
    AdminRoleModule,
    LoginLogModule,
    BlogModule,
    BlogCategoryModule,
    SubscriptionModule,
    OperationLogModule,
    PortalModule,
    DashboardModule,
    FileStorageModule,
  ],
  providers: [
    // 全局守卫顺序：先鉴权（JwtAuthGuard），再鉴权码校验（PermissionsGuard）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // 操作日志拦截器：注册在全局拦截器链中，只对声明了 @OperationLog 的后台写操作生效
    { provide: APP_INTERCEPTOR, useClass: OperationLogInterceptor },
  ],
})
export class AppModule {}
