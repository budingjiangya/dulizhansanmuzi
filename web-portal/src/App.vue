<script setup lang="ts">
/**
 * 根组件：访客端与后台共用一个应用，并挂载全局 Naive-UI Provider。
 *
 * ⚠️ 这里必须保留 NConfigProvider / NDialogProvider / NMessageProvider / NNotificationProvider：
 * 后台所有 Naive-UI 组件（DataTable、Modal、Message 等）都依赖这些注入。
 * 一旦缺失，控制台会出现 `injection "n-config-provider" not found`，表格、弹窗、消息提示
 * 会退回默认主题与默认语言，主题覆写也不再生效。
 * （v1.1.0 合并后台到前端时曾误删本文件的 Provider，导致该问题在 v1.1.2 修复。）
 *
 * 另外注意 `class="n-config-provider"`：NConfigProvider 需要这个类名才会挂载主题样式节点，
 * 否则 themeOverrides 不会生成对应的 CSS 变量。
 *
 * 区域渲染：
 * - 访客端（/、/article/:id 等）：站点页头 + 内容 + 页脚
 * - 管理后台（/admin/**）：AdminLayout 自带外壳，不渲染站点页头页脚
 */
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  NConfigProvider,
  NDialogProvider,
  NGlobalStyle,
  NLoadingBarProvider,
  NMessageProvider,
  NNotificationProvider,
  darkTheme,
  dateZhCN,
  zhCN,
} from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'
import SiteHeader from '@/components/SiteHeader.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import { useSiteConfigStore } from '@/stores/siteConfig'
import { useAppStore } from '@/admin/stores/app'

const route = useRoute()
const siteConfigStore = useSiteConfigStore()
/** 主题偏好由后台的 store 统一维护，访客端也沿用 */
const appStore = useAppStore()

const isAdminArea = computed(() => route.path.startsWith('/admin'))
const theme = computed(() => (appStore.dark ? darkTheme : null))

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#2563eb',
    primaryColorHover: '#3b82f6',
    primaryColorPressed: '#1d4ed8',
    primaryColorSuppl: '#2563eb',
    borderRadius: '6px',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  },
  DataTable: {
    thFontWeight: '600',
  },
}

onMounted(() => {
  void siteConfigStore.load()
})
</script>

<template>
  <NConfigProvider
    :theme="theme"
    :theme-overrides="themeOverrides"
    :locale="zhCN"
    :date-locale="dateZhCN"
    class="n-config-provider"
  >
    <NGlobalStyle />
    <NLoadingBarProvider>
      <NDialogProvider>
        <NNotificationProvider>
          <NMessageProvider>
            <div v-if="isAdminArea" class="min-h-screen">
              <RouterView v-slot="{ Component }">
                <component :is="Component" />
              </RouterView>
            </div>

            <div v-else class="flex min-h-screen flex-col">
              <SiteHeader />
              <main class="flex-1">
                <RouterView v-slot="{ Component }">
                  <component :is="Component" />
                </RouterView>
              </main>
              <SiteFooter />
            </div>
          </NMessageProvider>
        </NNotificationProvider>
      </NDialogProvider>
    </NLoadingBarProvider>
  </NConfigProvider>
</template>
