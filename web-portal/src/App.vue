<script setup lang="ts">
/**
 * 根组件：访客端与后台共用一个应用。
 * - 访客端（/、/article/:id）：带站点页头与页脚
 * - 管理后台（/admin/**）：使用 AdminLayout 自带外壳，不渲染站点页头页脚
 */
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import SiteHeader from '@/components/SiteHeader.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import { useSiteConfigStore } from '@/stores/siteConfig'

const route = useRoute()
const siteConfigStore = useSiteConfigStore()

const isAdminArea = computed(() => route.path.startsWith('/admin'))

onMounted(() => {
  void siteConfigStore.load()
})
</script>

<template>
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
</template>
