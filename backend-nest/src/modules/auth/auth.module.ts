/**
 * 鉴权模块
 * 注册 JwtModule（密钥用 Buffer 形式，与 JwtStrategy 保持一致）与 JwtStrategy。
 */
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import type { AppConfiguration } from '../../config/configuration'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './strategies/jwt.strategy'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfiguration, true>) => ({
        secret: String(configService.get('jwtSecret', { infer: true })),
        signOptions: {
          expiresIn: configService.get('jwtExpiresIn', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
