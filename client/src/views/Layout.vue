<template>
  <n-layout has-sider class="layout">
    <!-- 侧边栏 -->
    <n-layout-sider
      bordered
      collapse-mode="width"
      :collapsed-width="64"
      :width="240"
      :collapsed="collapsed"
      show-trigger
      @collapse="collapsed = true"
      @expand="collapsed = false"
    >
      <div class="logo">
        <img src="@/assets/logo.svg" alt="OpenClaw" />
        <span v-show="!collapsed">OpenClaw Console</span>
      </div>
      <n-menu
        :collapsed="collapsed"
        :collapsed-width="64"
        :collapsed-icon-size="22"
        :options="menuOptions"
        :value="currentKey"
        @update:value="handleMenuSelect"
      />
    </n-layout-sider>

    <n-layout>
      <!-- 顶部栏 -->
      <n-layout-header bordered class="header">
        <div class="header-left">
          <n-breadcrumb>
            <n-breadcrumb-item>首页</n-breadcrumb-item>
            <n-breadcrumb-item>{{ currentRoute?.meta?.title }}</n-breadcrumb-item>
          </n-breadcrumb>
        </div>
        <div class="header-right">
          <n-button quaternary circle @click="toggleTheme">
            <template #icon>
              <n-icon :component="themeStore.isDark ? SunnyOutline : MoonOutline" />
            </template>
          </n-button>
          <n-dropdown :options="userOptions" @select="handleUserSelect">
            <n-button quaternary>
              <template #icon>
                <n-icon :component="PersonOutline" />
              </template>
              {{ userStore.user?.username || '用户' }}
            </n-button>
          </n-dropdown>
        </div>
      </n-layout-header>

      <!-- 主内容区 -->
      <n-layout-content class="content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<script setup lang="ts">
import { h, ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NMenu,
  NBreadcrumb,
  NBreadcrumbItem,
  NButton,
  NIcon,
  NDropdown
} from 'naive-ui'
import {
  SpeedometerOutline,
  SettingsOutline,
  FolderOutline,
  AppsOutline,
  RocketOutline,
  DesktopOutline,
  DocumentTextOutline,
  PeopleOutline,
  PersonOutline,
  MoonOutline,
  SunnyOutline,
  LogOutOutline
} from '@vicons/ionicons5'
import { useThemeStore } from '@/stores/theme'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const route = useRoute()
const themeStore = useThemeStore()
const userStore = useUserStore()

const collapsed = ref(false)
const currentRoute = computed(() => route)

const baseMenuOptions: any[] = [
  {
    label: '仪表盘',
    key: 'dashboard',
    type: 'default' as const,
    icon: () => h(NIcon, null, { default: () => h(SpeedometerOutline) })
  },
  {
    label: '配置管理',
    key: 'config',
    type: 'default' as const,
    icon: () => h(NIcon, null, { default: () => h(SettingsOutline) })
  },
  {
    label: '文件管理',
    key: 'files',
    type: 'default' as const,
    icon: () => h(NIcon, null, { default: () => h(FolderOutline) })
  },
  {
    label: '技能中心',
    key: 'skills',
    type: 'default' as const,
    icon: () => h(NIcon, null, { default: () => h(AppsOutline) })
  },
  {
    label: 'Agent 管理',
    key: 'agents',
    type: 'default' as const,
    icon: () => h(NIcon, null, { default: () => h(RocketOutline) })
  },
  {
    label: '用户管理',
    key: 'users',
    type: 'default' as const,
    icon: () => h(NIcon, null, { default: () => h(PeopleOutline) }),
    show: computed(() => userStore.isAdmin)
  },
  {
    label: '系统监控',
    key: 'monitor',
    type: 'default' as const,
    icon: () => h(NIcon, null, { default: () => h(DesktopOutline) })
  },
  {
    label: '日志管理',
    key: 'logs',
    type: 'default' as const,
    icon: () => h(NIcon, null, { default: () => h(DocumentTextOutline) })
  }
]

const menuOptions = computed(() => {
  return baseMenuOptions.filter(item => {
    if ('show' in item) {
      return (item as any).show.value
    }
    return true
  })
})

const currentKey = computed(() => route.name as string)

const userOptions = [
  { label: '退出登录', key: 'logout', icon: () => h(NIcon, null, { default: () => h(LogOutOutline) }) }
]

function handleMenuSelect(key: string) {
  router.push(`/${key}`)
}

function handleUserSelect(key: string) {
  if (key === 'logout') {
    userStore.logout()
    router.push('/login')
  }
}

function toggleTheme() {
  themeStore.toggleTheme()
}
</script>

<style scoped>
.layout {
  height: 100vh;
}

.logo {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 0 16px;
  font-weight: 600;
  font-size: 16px;
}

.logo img {
  width: 32px;
  height: 32px;
}

.header {
  height: 64px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.content {
  padding: 24px;
  min-height: calc(100vh - 64px);
  overflow: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
