/**
 * 站点基础配置状态：只保留「页面骨架必须知道」的少量全局状态，
 * 列表数据由页面自己持有，不放进全局 store。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SiteConfigVo } from '@sanmuzi/contracts'
import { fetchSiteConfig } from '@/api/site'
import { FALLBACK_SITE_CONFIG } from '@/config'

export const useSiteConfigStore = defineStore('site-config', () => {
  const config = ref<SiteConfigVo>({ ...FALLBACK_SITE_CONFIG })
  const loaded = ref(false)
  let pending: Promise<void> | null = null

  async function load(): Promise<void> {
    if (loaded.value) return
    if (pending) return pending
    pending = (async () => {
      try {
        const remote = await fetchSiteConfig()
        config.value = { ...FALLBACK_SITE_CONFIG, ...remote }
      } catch {
        // 接口不可用时保持兜底文案，页面结构不塌陷
      } finally {
        loaded.value = true
        pending = null
      }
    })()
    return pending
  }

  return { config, loaded, load }
})
