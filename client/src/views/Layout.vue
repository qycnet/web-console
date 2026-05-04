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

      <!-- 修改密码弹窗 -->
      <n-modal v-model:show="showChangePasswordModal" preset="card" title="修改密码" style="width: 420px;">
        <n-form ref="changePasswordFormRef" :model="changePasswordForm" :rules="changePasswordRules">
          <n-form-item path="oldPassword" label="原密码">
            <n-input
              v-model:value="changePasswordForm.oldPassword"
              type="password"
              placeholder="请输入原密码"
              show-password-on="click"
            />
          </n-form-item>
          <n-form-item path="newPassword" label="新密码">
            <n-input
              v-model:value="changePasswordForm.newPassword"
              type="password"
              placeholder="请输入新密码（至少6位）"
              show-password-on="click"
            />
          </n-form-item>
          <n-form-item path="confirmPassword" label="确认新密码">
            <n-input
              v-model:value="changePasswordForm.confirmPassword"
              type="password"
              placeholder="请再次输入新密码"
              show-password-on="click"
            />
          </n-form-item>
        </n-form>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showChangePasswordModal = false">取消</n-button>
            <n-button type="primary" @click="handleChangePassword" :loading="changingPassword">确认修改</n-button>
          </n-space>
        </template>
      </n-modal>

      <!-- 主内容区 -->
      <n-layout-content class="content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </n-layout-content>
    </n-layout>
    <ChatFloat />
  </n-layout>
</template>

<script setup lang="ts">
import { h, ref, computed, onMounted } from 'vue'
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
  NDropdown,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NSpace,
  useMessage
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
  LogOutOutline,
  PhonePortraitOutline,
  ChatbubblesOutline
} from '@vicons/ionicons5'
import { useThemeStore } from '@/stores/theme'
import { useUserStore } from '@/stores/user'
import { api } from '@/api'
import ChatFloat from '@/components/ChatFloat.vue'

const router = useRouter()
const route = useRoute()
const themeStore = useThemeStore()
const userStore = useUserStore()
const message = useMessage()

const collapsed = ref(false)
const currentRoute = computed(() => route)

// 修改密码
const showChangePasswordModal = ref(false)
const changingPassword = ref(false)
const changePasswordFormRef = ref()
const changePasswordForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})
const changePasswordRules = {
  oldPassword: { required: true, message: '请输入原密码', trigger: 'blur' },
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '新密码至少6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    {
      validator: (_rule: any, value: string) => value === changePasswordForm.value.newPassword,
      message: '两次密码不一致',
      trigger: 'blur'
    }
  ]
}

async function handleChangePassword() {
  try {
    await changePasswordFormRef.value?.validate()
    changingPassword.value = true
    await api.users.changePassword(changePasswordForm.value.oldPassword, changePasswordForm.value.newPassword)
    message.success('密码修改成功')
    showChangePasswordModal.value = false
    changePasswordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
  } catch (error: any) {
    message.error(error.error || error.message || '修改密码失败')
  } finally {
    changingPassword.value = false
  }
}

// 页面刷新后从 token 恢复用户信息（否则侧边栏 admin 权限菜单不显示）
onMounted(() => {
  if (userStore.isLoggedIn && !userStore.user) {
    userStore.fetchUser()
  }
})

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
    label: '对话',
    key: 'chat',
    type: 'default' as const,
    icon: () => h(NIcon, null, { default: () => h(ChatbubblesOutline) })
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
  },
  {
    label: '设备管理',
    key: 'devices',
    type: 'default' as const,
    icon: () => h(NIcon, null, { default: () => h(PhonePortraitOutline) })
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
  { label: '修改密码', key: 'changePassword' },
  { label: '退出登录', key: 'logout', icon: () => h(NIcon, null, { default: () => h(LogOutOutline) }) }
]

function handleMenuSelect(key: string) {
  router.push(`/${key}`)
}

function handleUserSelect(key: string) {
  if (key === 'logout') {
    userStore.logout()
    router.push('/login')
  } else if (key === 'changePassword') {
    showChangePasswordModal.value = true
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
