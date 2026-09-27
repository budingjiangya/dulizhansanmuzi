<script setup lang="ts">
/**
 * 站点页头
 *
 * 布局：桌面（≥768px）单行 —— 左侧站点名 + 副标题，右侧导航链接组 + 站内搜索框；
 * 窄屏导航换行、搜索框独占一行。
 *
 * 导航项来自后端 site-config（有 24 小时 Redis 缓存，改动后需执行 pnpm backend:cache:flush）。
 * 视觉上只使用留白、字号层级与一条细分隔线，不引入卡片边框或按钮底色。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSiteConfigStore } from '@/stores/siteConfig'
import HeaderSearch from '@/components/HeaderSearch.vue'

const siteConfigStore = useSiteConfigStore()
const route = useRoute()

const siteName = computed(() => siteConfigStore.config.siteName)
const subtitle = computed(() => siteConfigStore.config.siteSubtitle)
const nav = computed(() => siteConfigStore.config.nav ?? [])
/** 在搜索页时把当前关键词回填到搜索框 */
const currentKeyword = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))

function isActive(path: string): boolean {
  if (path.startsWith('/#')) return route.path === '/' && route.hash === path.slice(1)
  return route.path === path
}
</script>

<template>
  <header class="rule-bottom">
    <div class="shell flex flex-col gap-4 py-6 md:flex-row md:items-baseline md:justify-between md:py-8">
      <RouterLink :to="{ name: 'home' }" class="group inline-block">
        <h1 class="font-serif text-2xl leading-none font-semibold tracking-tight text-ink md:text-[1.75rem]">
          {{ siteName }}
        </h1>
        <p class="mt-2 text-[13px] text-ink-muted">{{ subtitle }}</p>
      </RouterLink>

      <div class="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
        <nav
          data-testid="site-nav"
          class="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-ink-soft md:gap-x-6"
        >
          <RouterLink
            v-for="entry in nav"
            :key="entry.path"
            :to="entry.path"
            class="transition-colors duration-200 hover:text-accent"
            :class="isActive(entry.path) ? 'text-ink' : ''"
          >
            {{ entry.label }}
          </RouterLink>
        </nav>

        <HeaderSearch :initial-value="currentKeyword" />
      </div>
    </div>
  </header>
</template>
