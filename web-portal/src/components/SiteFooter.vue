<script setup lang="ts">
import { computed } from 'vue'
import { useSiteConfigStore } from '@/stores/siteConfig'

const siteConfigStore = useSiteConfigStore()
const footerText = computed(() => siteConfigStore.config.footerText)
const icp = computed(() => siteConfigStore.config.icp)
const siteDescription = computed(() => siteConfigStore.config.siteDescription)
</script>

<template>
  <footer class="rule-top mt-24">
    <div class="shell flex flex-col gap-3 py-10 text-[13px] text-ink-muted md:flex-row md:items-center md:justify-between">
      <p class="max-w-[52ch]">{{ siteDescription }}</p>
      <div class="flex flex-col gap-1 md:items-end">
        <span>{{ footerText }}</span>
        <span v-if="icp">{{ icp }}</span>
      </div>
    </div>
  </footer>
</template>
