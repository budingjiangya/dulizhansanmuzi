<script setup lang="ts">
/** 根组件：只负责主题 / 语言 / 尺寸等全局 Provider，业务渲染交给路由 */
import { computed } from 'vue'
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
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

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
</script>

<template>
  <NConfigProvider
    :theme="theme"
    :theme-overrides="themeOverrides"
    :locale="zhCN"
    :date-locale="dateZhCN"
    class="h-full"
  >
    <NGlobalStyle />
    <NLoadingBarProvider>
      <NDialogProvider>
        <NNotificationProvider>
          <NMessageProvider>
            <RouterView />
          </NMessageProvider>
        </NNotificationProvider>
      </NDialogProvider>
    </NLoadingBarProvider>
  </NConfigProvider>
</template>
