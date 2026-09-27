<script setup lang="ts">
/**
 * 「即将上线」占位页
 *
 * 被 /category 与 /subscribe 复用，标题取路由 meta.title —— 一个组件服务两个入口。
 * 第二批做完分类与邮件订阅后，只需把路由指向真实页面，导航与布局都不用改。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const router = useRouter()

const title = computed(() => (route.meta.title ? String(route.meta.title) : '该功能'))
</script>

<template>
  <div class="shell">
    <EmptyState
      data-testid="coming-soon"
      :title="`${title}即将上线`"
      description="这个入口已经占好位置，功能正在开发中。当前可以先用首页推荐清单和顶部搜索浏览内容。"
      action-text="回到推荐清单"
      @action="router.push({ name: 'home' })"
    />
  </div>
</template>
