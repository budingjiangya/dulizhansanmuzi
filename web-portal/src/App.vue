<script setup lang="ts">
import { onMounted } from 'vue'
import SiteHeader from '@/components/SiteHeader.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import { useSiteConfigStore } from '@/stores/siteConfig'

const siteConfigStore = useSiteConfigStore()

onMounted(() => {
  void siteConfigStore.load()
})
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <SiteHeader />
    <main class="flex-1">
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </main>
    <SiteFooter />
  </div>
</template>
