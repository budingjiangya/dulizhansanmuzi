/**
 * 博客文章模块
 */
import { Module } from '@nestjs/common'
import { BlogController } from './blog.controller'
import { BlogService } from './blog.service'

@Module({
  controllers: [BlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
