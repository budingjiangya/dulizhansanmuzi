/**
 * 应用级 UI 状态：主题、侧边栏折叠、页签
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export interface AppTab {
  name: string
  path: string
  title: string
  affix?: boolean
}

const THEME_KEY = 'sanmuzi-admin-theme'
const COLLAPSE_KEY = 'sanmuzi-admin-collapsed'

export const useAppStore = defineStore('app', () => {
  const dark = ref(localStorage.getItem(THEME_KEY) === 'dark')
  const collapsed = ref(localStorage.getItem(COLLAPSE_KEY) === '1')
  const tabs = ref<AppTab[]>([])

  const theme = computed(() => (dark.value ? 'dark' : 'light'))

  function toggleTheme(): void {
    dark.value = !dark.value
    localStorage.setItem(THEME_KEY, dark.value ? 'dark' : 'light')
  }

  function toggleCollapse(): void {
    collapsed.value = !collapsed.value
    localStorage.setItem(COLLAPSE_KEY, collapsed.value ? '1' : '0')
  }

  function addTab(tab: AppTab): void {
    if (!tab.name || tabs.value.some((item) => item.path === tab.path)) return
    tabs.value = [...tabs.value, tab]
  }

  function removeTab(path: string): AppTab[] {
    tabs.value = tabs.value.filter((item) => item.affix || item.path !== path)
    return tabs.value
  }

  function removeOtherTabs(path: string): void {
    tabs.value = tabs.value.filter((item) => item.affix || item.path === path)
  }

  function resetTabs(): void {
    tabs.value = tabs.value.filter((item) => item.affix)
  }

  return {
    dark,
    theme,
    collapsed,
    tabs,
    toggleTheme,
    toggleCollapse,
    addTab,
    removeTab,
    removeOtherTabs,
    resetTabs,
  }
})
