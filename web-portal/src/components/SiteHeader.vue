<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSiteConfigStore } from '@/stores/siteConfig'

const siteConfigStore = useSiteConfigStore()
const route = useRoute()

const siteName = computed(() => siteConfigStore.config.siteName)
const subtitle = computed(() => siteConfigStore.config.siteSubtitle)
const nav = computed(() => siteConfigStore.config.nav ?? [])

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

      <nav class="flex items-center gap-6 text-[13.5px] text-ink-soft">
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
    </div>
  </header>
</template>
