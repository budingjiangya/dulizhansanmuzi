<script setup lang="ts">
import { computed, h } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { NIcon, NMenu, type MenuOption } from 'naive-ui'
import { PERMISSIONS } from '@sanmuzi/contracts'
import { useUserStore } from '@/admin/stores/user'
import SvgIcon from '@/components/SvgIcon.vue'

const route = useRoute()
const userStore = useUserStore()

function renderIcon(name: string) {
  return () => h(NIcon, { size: 18 }, { default: () => h(SvgIcon, { name, size: 18 }) })
}

function renderLink(path: string, label: string) {
  return () => h(RouterLink, { to: path }, { default: () => label })
}

/** 菜单按权限码过滤：无权限的入口不渲染（接口层仍由后端守卫二次校验） */
const menuOptions = computed<MenuOption[]>(() => {
  const options: MenuOption[] = [
    {
      key: 'dashboard',
      label: renderLink('/admin/dashboard', '工作台'),
      icon: renderIcon('dashboard'),
    },
  ]

  const blogChildren: MenuOption[] = []
  if (userStore.hasPermission(PERMISSIONS.BLOG_ARTICLE_LIST)) {
    blogChildren.push({
      key: 'blog-article-list',
      label: renderLink('/admin/blog/articles', '文章管理'),
      icon: renderIcon('article'),
    })
  }
  if (userStore.hasPermission(PERMISSIONS.BLOG_ARTICLE_CREATE)) {
    blogChildren.push({
      key: 'blog-article-create',
      label: renderLink('/admin/blog/articles/create', '新建文章'),
      icon: renderIcon('edit'),
    })
  }
  if (blogChildren.length) {
    options.push({
      key: 'blog',
      label: '内容运营',
      icon: renderIcon('article'),
      children: blogChildren,
    })
  }

  const systemChildren: MenuOption[] = []
  if (userStore.hasPermission(PERMISSIONS.SYSTEM_USER_LIST)) {
    systemChildren.push({
      key: 'system-user-list',
      label: renderLink('/admin/system/users', '账号管理'),
      icon: renderIcon('user'),
    })
  }
  if (userStore.hasPermission(PERMISSIONS.SYSTEM_ROLE_LIST)) {
    systemChildren.push({
      key: 'system-role-list',
      label: renderLink('/admin/system/roles', '角色权限'),
      icon: renderIcon('role'),
    })
  }
  if (userStore.hasPermission(PERMISSIONS.SYSTEM_LOG_LIST)) {
    systemChildren.push({
      key: 'system-login-log',
      label: renderLink('/admin/system/login-logs', '登录日志'),
      icon: renderIcon('log'),
    })
  }
  if (systemChildren.length) {
    options.push({
      key: 'system',
      label: '系统管理',
      icon: renderIcon('role'),
      children: systemChildren,
    })
  }

  options.push({
    key: 'profile-password',
    label: renderLink('/admin/profile/password', '修改密码'),
    icon: renderIcon('lock'),
  })

  return options
})

const activeKey = computed(() => (route.name ? String(route.name) : ''))
const expandedKeys = computed(() => {
  if (route.path.startsWith('/blog')) return ['blog']
  if (route.path.startsWith('/system')) return ['system']
  return []
})
</script>

<template>
  <NMenu
    :options="menuOptions"
    :value="activeKey"
    :default-expanded-keys="expandedKeys"
    :indent="18"
    :collapsed-width="64"
    :collapsed-icon-size="20"
    :root-indent="18"
  />
</template>
