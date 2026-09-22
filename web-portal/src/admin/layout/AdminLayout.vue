<script setup lang="ts">
/** 后台整体布局：左侧菜单 + 顶栏（折叠/面包屑/主题/账号） + 页签栏 + 内容区 */
import { computed, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import {
  NAvatar,
  NButton,
  NDropdown,
  NIcon,
  NLayout,
  NLayoutContent,
  NLayoutHeader,
  NLayoutSider,
  type DropdownOption,
} from 'naive-ui'
import { useAppStore } from '@/admin/stores/app'
import { useUserStore } from '@/admin/stores/user'
import { dialog, message } from '@/admin/utils/discrete'
import SvgIcon from '@/components/SvgIcon.vue'
import SideMenu from './SideMenu.vue'
import BreadcrumbNav from './BreadcrumbNav.vue'
import TabsBar from './TabsBar.vue'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const userStore = useUserStore()

/** 新开标签页回到访客端首页，方便改完内容立刻看效果 */
function openPortal(): void {
  window.open('/', '_blank', 'noopener')
}

const collapsed = computed(() => appStore.collapsed)

/** 路由变化时同步页签 */
watch(
  () => route.fullPath,
  () => {
    const name = typeof route.name === 'string' ? route.name : ''
    const title = route.meta.title ? String(route.meta.title) : ''
    if (!name || !title) return
    appStore.addTab({ name, path: route.path, title, affix: route.meta.affix })
  },
  { immediate: true },
)

const accountOptions: DropdownOption[] = [
  { label: '修改密码', key: 'password' },
  { label: '退出登录', key: 'logout' },
]

function handleAccountSelect(key: string): void {
  if (key === 'password') {
    void router.push({ name: 'admin-profile-password' })
    return
  }
  if (key === 'logout') {
    dialog.warning({
      title: '退出登录',
      content: '确认退出当前账号吗？',
      positiveText: '确认退出',
      negativeText: '取消',
      onPositiveClick: () => {
        userStore.resetState()
        appStore.resetTabs()
        message.success('已退出登录')
        void router.replace({ name: 'admin-login' })
      },
    })
  }
}
</script>

<template>
  <!-- #admin-app：后台样式作用域根节点，避免与访客端样式互相影响 -->
  <div id="admin-app" class="h-screen w-full">
    <NLayout class="h-screen" has-sider>
    <NLayoutSider
      bordered
      collapse-mode="width"
      :collapsed-width="64"
      :width="220"
      :collapsed="collapsed"
      :native-scrollbar="false"
      show-trigger
      @collapse="appStore.toggleCollapse"
      @expand="appStore.toggleCollapse"
    >
      <div class="flex h-14 items-center gap-2 overflow-hidden px-4">
        <RouterLink
          :to="{ name: 'admin-dashboard' }"
          class="flex items-center gap-2 overflow-hidden"
          :title="collapsed ? '三目子 · 内容管理' : '返回工作台'"
        >
          <span
            class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#2563eb] text-[13px] font-semibold text-white"
          >
            三
          </span>
          <span v-if="!collapsed" class="truncate text-[15px] font-semibold whitespace-nowrap">
            三目子 · 内容管理
          </span>
        </RouterLink>
      </div>
      <SideMenu />
    </NLayoutSider>

    <NLayout>
      <NLayoutHeader bordered class="flex h-14 items-center justify-between px-4">
        <div class="flex min-w-0 items-center gap-3">
          <NButton quaternary size="small" @click="appStore.toggleCollapse">
            <template #icon>
              <NIcon :size="18">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M3 5h18v2H3V5Zm0 6h18v2H3v-2Zm0 6h18v2H3v-2Z" />
                </svg>
              </NIcon>
            </template>
          </NButton>
          <div class="hidden md:block">
            <BreadcrumbNav />
          </div>
        </div>

        <div class="flex items-center gap-2">
          <NButton quaternary size="small" title="返回访客端首页" @click="openPortal">
            <template #icon>
              <NIcon :size="18">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path
                    d="M12 3 2 11h3v9h5v-6h4v6h5v-9h3L12 3Zm0 2.7 5 4.2V18h-1v-6H8v6H7v-8.1l5-4.2Z"
                  />
                </svg>
              </NIcon>
            </template>
            访客端
          </NButton>

          <NButton quaternary size="small" :title="appStore.dark ? '切换到浅色' : '切换到深色'" @click="appStore.toggleTheme">
            <template #icon>
              <SvgIcon :name="appStore.dark ? 'sun' : 'moon'" :size="18" />
            </template>
          </NButton>

          <NDropdown :options="accountOptions" trigger="click" @select="handleAccountSelect">
            <div class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-black/5">
              <NAvatar round :size="26" class="bg-[#2563eb] text-[12px] text-white">
                {{ userStore.displayName.slice(0, 1) }}
              </NAvatar>
              <div class="hidden leading-tight sm:block">
                <div class="text-[13px] font-medium">{{ userStore.displayName }}</div>
                <div class="text-[11px] opacity-60">{{ userStore.userInfo?.roleName ?? '-' }}</div>
              </div>
            </div>
          </NDropdown>
        </div>
      </NLayoutHeader>

      <TabsBar />

      <NLayoutContent class="h-[calc(100vh-6rem)]" :native-scrollbar="false" content-style="padding: 16px;">
        <RouterView v-slot="{ Component }">
          <component :is="Component" />
        </RouterView>
      </NLayoutContent>
    </NLayout>
    </NLayout>
  </div>
</template>
