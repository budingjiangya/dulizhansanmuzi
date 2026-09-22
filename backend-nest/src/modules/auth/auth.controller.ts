/**
 * 鉴权控制器
 * 仅负责路由、参数与 Swagger 描述，业务逻辑全部在 AuthService。
 */
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import type { AdminUserInfo, LoginVo } from '@sanmuzi/contracts'
import type { Request } from 'express'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Public } from '../../common/decorators/public.decorator'
import { AuthService } from './auth.service'
import { ChangePasswordDto } from './dto/change-password.dto'
import { LoginDto } from './dto/login.dto'

@ApiTags('鉴权')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '账号登录',
    description: '校验用户名密码，成功返回 JWT 与管理员信息；失败写入登录日志，超限返回 42900。',
  })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: '登录成功，返回 { token, expiresAt, user }' })
  @ApiResponse({ status: 401, description: '用户名或密码错误（40100）' })
  @ApiResponse({ status: 429, description: '登录失败次数过多被锁定（42900）' })
  async login(@Body() dto: LoginDto, @Req() request: Request): Promise<LoginVo> {
    return this.authService.login(dto, request)
  }

  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前登录管理员信息', description: '返回含实时权限数组的 AdminUserInfo。' })
  @ApiOkResponse({ description: '当前登录管理员信息' })
  async profile(@CurrentUser() user: { userId: number }): Promise<AdminUserInfo> {
    return this.authService.getProfile(user.userId)
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: '修改当前账号密码', description: '校验旧密码后使用 bcrypt 重新哈希写入。' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({ description: '修改成功，data 为 null' })
  @ApiResponse({ status: 400, description: '旧密码不正确（40000）' })
  async changePassword(
    @CurrentUser() user: { userId: number },
    @Body() dto: ChangePasswordDto,
  ): Promise<null> {
    return this.authService.changePassword(user.userId, dto)
  }
}
