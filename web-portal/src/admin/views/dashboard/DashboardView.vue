<script setup lang="ts">
/** 工作台：核心指标 + 近 7 天登录趋势（纯 CSS 柱状，不引图表库） */
import { computed, onMounted, ref } from 'vue'
import { NAlert, NButton, NCard, NGi, NGrid, NSpin, NStatistic, NTag } from 'naive-ui'
import type { DashboardStatsVo } from '@sanmuzi/contracts'
import { fetchDashboardStats } from '@/admin/api/dashboard'
import { BizError } from '@/admin/api/request'
import { useUserStore } from '@/admin/stores/user'
import { formatDate } from '@/admin/utils/format'

const userStore = useUserStore()

const stats = ref<DashboardStatsVo | null>(null)
const loading = ref(true)
const errorText = ref('')

const trend = computed(() => stats.value?.loginTrend ?? [])
const trendMax = computed(() => {
  const max = Math.max(1, ...trend.value.map((item) => item.success + item.fail))
  return max
})

/**
 * 单根柱子高度（px）
 * - 次数为 0：渲染 0 高度，表示当天没有登录（不是缺陷，是正确表现）
 * - 次数非 0：按比例缩放，但至少 2px —— 否则当某天次数远小于峰值时会被四舍五入成 0，
 *   视觉上与「当天没有登录」无法区分，会误导阅读
 */
function barHeight(count: number): string {
  if (count <= 0) return '0px'
  return `${Math.max(2, Math.round((count / trendMax.value) * 130))}px`
}

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
          <!--
            用内联样式固定图表高度与栅格布局：
            柱子高度依赖数据，若交给工具类容易在主题变量缺失时被压扁，这里显式声明更稳。
          -->
          <div
            data-testid="login-trend-chart"
            :style="{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.max(trend.length, 1)}, minmax(0, 1fr))`,
              gap: '10px',
              height: '190px',
              alignItems: 'end',
            }"
          >
            <div
              v-for="item in trend"
              :key="item.date"
              data-testid="trend-column"
              :style="{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%', justifyContent: 'flex-end' }"
            >
              <div
                :style="{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '3px', width: '100%', flex: '1 1 auto', minHeight: '0' }"
              >
                <div
                  :style="{
                    width: '100%',
                    height: barHeight(item.success),
                    backgroundColor: '#2563eb',
                    borderRadius: '2px',
                  }"
                  :title="`${item.date} 成功 ${item.success} 次`"
                ></div>
                <div
                  :style="{
                    width: '100%',
                    height: barHeight(item.fail),
                    backgroundColor: 'rgba(239,68,68,0.7)',
                    borderRadius: '2px',
                  }"
                  :title="`${item.date} 失败 ${item.fail} 次`"
                ></div>
              </div>
              <span :style="{ fontSize: '11px', opacity: 0.6, whiteSpace: 'nowrap' }">{{ item.date.slice(5) }}</span>
            </div>
            <div v-if="!trend.length" class="grid h-full w-full place-items-center text-[13px] opacity-50">
              暂无登录记录
            </div>
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-black/5 pt-3 text-[12px] opacity-70">
            <span class="flex items-center gap-1.5">
              <i class="inline-block h-2.5 w-2.5 rounded-sm bg-[#2563eb]"></i> 登录成功
            </span>
            <span class="flex items-center gap-1.5">
              <i class="inline-block h-2.5 w-2.5 rounded-sm bg-[#ef4444]/70"></i> 登录失败
            </span>
            <span class="ml-auto">柱子高度按当日登录次数等比缩放</span>
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
