<script setup lang="ts">
/** 工作台：核心指标 + 近 7 天登录趋势（纯 CSS 柱状，不引图表库） */
import { computed, onMounted, ref } from 'vue'
import { NAlert, NButton, NCard, NGi, NGrid, NSpin, NStatistic, NTag } from 'naive-ui'
import type { DashboardStatsVo } from '@sanmuzi/contracts'
import { fetchDashboardStats } from '@/api/dashboard'
import { BizError } from '@/api/request'
import { useUserStore } from '@/stores/user'
import { formatDate } from '@/utils/format'

const userStore = useUserStore()

const stats = ref<DashboardStatsVo | null>(null)
const loading = ref(true)
const errorText = ref('')

const trend = computed(() => stats.value?.loginTrend ?? [])
const trendMax = computed(() => {
  const max = Math.max(1, ...trend.value.map((item) => item.success + item.fail))
  return max
})

const publishRate = computed(() => {
  const total = stats.value?.articleTotal ?? 0
  if (!total) return 0
  return Math.round(((stats.value?.articlePublished ?? 0) / total) * 100)
})

async function load(): Promise<void> {
  loading.value = true
  errorText.value = ''
  try {
    stats.value = await fetchDashboardStats()
  } catch (error) {
    errorText.value = error instanceof BizError ? error.message : '统计数据加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <NCard :bordered="false" size="small">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-[17px] font-semibold">你好，{{ userStore.displayName }}</h2>
          <p class="mt-1 text-[13px] opacity-65">
            当前角色：{{ userStore.userInfo?.roleName ?? '-' }} · 权限项 {{ userStore.permissions.length }} 个
          </p>
        </div>
        <div class="flex items-center gap-2">
          <NTag :bordered="false" size="small" type="info">{{ formatDate(new Date()) }}</NTag>
          <NButton size="small" :loading="loading" @click="load">刷新</NButton>
        </div>
      </div>
    </NCard>

    <NAlert v-if="errorText" type="error" :bordered="false">{{ errorText }}</NAlert>

    <NSpin :show="loading">
      <NGrid :cols="4" :x-gap="12" :y-gap="12" responsive="screen" item-responsive>
        <NGi span="4 s:2 m:1">
          <NCard :bordered="false" size="small">
            <NStatistic label="文章总数" :value="stats?.articleTotal ?? 0" />
            <p class="mt-2 text-[12px] opacity-60">已上架 {{ publishRate }}%</p>
          </NCard>
        </NGi>
        <NGi span="4 s:2 m:1">
          <NCard :bordered="false" size="small">
            <NStatistic label="已上架" :value="stats?.articlePublished ?? 0" />
            <p class="mt-2 text-[12px] opacity-60">草稿 {{ stats?.articleDraft ?? 0 }} 篇</p>
          </NCard>
        </NGi>
        <NGi span="4 s:2 m:1">
          <NCard :bordered="false" size="small">
            <NStatistic label="首页推荐位" :value="stats?.recommendTotal ?? 0" />
            <p class="mt-2 text-[12px] opacity-60">前台首页展示数量</p>
          </NCard>
        </NGi>
        <NGi span="4 s:2 m:1">
          <NCard :bordered="false" size="small">
            <NStatistic label="管理员账号" :value="stats?.adminUserTotal ?? 0" />
            <p class="mt-2 text-[12px] opacity-60">含启用与禁用</p>
          </NCard>
        </NGi>
      </NGrid>

      <div class="mt-3 grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <NCard :bordered="false" size="small" title="近 7 天登录趋势">
          <div class="flex h-[190px] items-end gap-3">
            <div v-for="item in trend" :key="item.date" class="flex flex-1 flex-col items-center gap-2">
              <div class="flex w-full flex-1 flex-col justify-end gap-[3px]">
                <div
                  class="w-full rounded-sm bg-[#2563eb]"
                  :style="{ height: `${Math.max(2, (item.success / trendMax) * 130)}px` }"
                  :title="`成功 ${item.success} 次`"
                ></div>
                <div
                  class="w-full rounded-sm bg-[#ef4444]/70"
                  :style="{ height: `${(item.fail / trendMax) * 130}px` }"
                  :title="`失败 ${item.fail} 次`"
                ></div>
              </div>
              <span class="text-[11px] whitespace-nowrap opacity-60">{{ item.date.slice(5) }}</span>
            </div>
            <div v-if="!trend.length" class="grid h-full w-full place-items-center text-[13px] opacity-50">
              暂无登录记录
            </div>
          </div>
          <div class="mt-4 flex items-center gap-4 border-t border-black/5 pt-3 text-[12px] opacity-70">
            <span class="flex items-center gap-1.5">
              <i class="inline-block h-2.5 w-2.5 rounded-sm bg-[#2563eb]"></i> 登录成功
            </span>
            <span class="flex items-center gap-1.5">
              <i class="inline-block h-2.5 w-2.5 rounded-sm bg-[#ef4444]/70"></i> 登录失败
            </span>
          </div>
        </NCard>

        <NCard :bordered="false" size="small" title="今日登录">
          <div class="grid grid-cols-2 gap-3">
            <NStatistic label="成功" :value="stats?.loginToday ?? 0" />
            <NStatistic label="失败" :value="stats?.loginFailToday ?? 0" />
          </div>
          <p class="mt-4 text-[12.5px] leading-relaxed opacity-65">
            登录成功与失败都会写入登录日志，仅超级管理员可查询。
          </p>
        </NCard>
      </div>
    </NSpin>
  </div>
</template>
