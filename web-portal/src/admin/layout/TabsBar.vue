<script setup lang="ts">
/** 页签栏：记录已访问页面，支持关闭当前 / 关闭其他 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NTag } from 'naive-ui'
import { useAppStore } from '@/admin/stores/app'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()

const tabs = computed(() => appStore.tabs)

function isActive(path: string): boolean {
  return route.path === path
}

function go(path: string): void {
  if (route.path !== path) void router.push(path)
}

function close(path: string): void {
  if (route.meta.affix) return
  const wasActive = isActive(path)
  const remaining = appStore.removeTab(path)
  if (wasActive) {
    const next = remaining[remaining.length - 1]
    void router.push(next ? next.path : '/admin/dashboard')
  }
}

function closeOthers(): void {
  appStore.removeOtherTabs(route.path)
}
</script>

<template>
  <div data-testid="admin-tabs-bar" class="flex items-center gap-2 overflow-x-auto px-4 py-2">
    <NTag
      v-for="tab in tabs"
      :key="tab.path"
      :type="isActive(tab.path) ? 'primary' : 'default'"
      :bordered="false"
      size="small"
      closable
      :disabled="false"
      class="cursor-pointer whitespace-nowrap"
      @click="go(tab.path)"
      @close="close(tab.path)"
    >
      {{ tab.title }}
    </NTag>

    <NButton v-if="tabs.length > 1" text size="tiny" class="ml-1 whitespace-nowrap" @click="closeOthers">
      关闭其他
    </NButton>
  </div>
</template>
