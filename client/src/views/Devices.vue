<template>
  <div class="devices-page">
    <n-tabs type="line" animated>
      <n-tab-pane name="devices" tab="设备管理">
        <n-card title="已连接的设备">
          <n-data-table
            :columns="deviceColumns"
            :data="devices"
            :loading="loading"
            :pagination="{ pageSize: 10 }"
          />
        </n-card>
      </n-tab-pane>
      <n-tab-pane name="sessions" tab="活跃会话">
        <n-card title="登录会话">
          <n-data-table
            :columns="sessionColumns"
            :data="sessions"
            :loading="loading"
            :pagination="{ pageSize: 10 }"
          />
        </n-card>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import {
  NCard,
  NDataTable,
  NButton,
  NSpace,
  NTag,
  NIcon,
  NModal,
  NTabs,
  NTabPane,
  NDescriptions,
  NDescriptionsItem,
  useMessage,
  useDialog,
  type DataTableColumns
} from 'naive-ui'
import { PhonePortraitOutline, LaptopOutline, GlobeOutline, DesktopOutline, HelpCircleOutline } from '@vicons/ionicons5'
import api from '../api'

const message = useMessage()
const dialog = useDialog()
const loading = ref(false)
const devices = ref<any[]>([])
const sessions = ref<any[]>([])

const typeIcon: Record<string, any> = {
  mobile: PhonePortraitOutline,
  browser: GlobeOutline,
  desktop: DesktopOutline,
  api: LaptopOutline
}

const typeColor: Record<string, string> = {
  mobile: 'orange',
  browser: 'blue',
  desktop: 'green',
  api: 'purple',
  unknown: 'grey'
}

const deviceColumns: DataTableColumns<any> = [
  {
    title: '设备',
    key: 'name',
    render(row) {
      const icon = typeIcon[row.type] || HelpCircleOutline
      return h('div', { style: 'display:flex;align-items:center;gap:8px' }, [
        h(NIcon, { size: 20 }, { default: () => h(icon) }),
        row.name || '未知设备'
      ])
    }
  },
  {
    title: '类型',
    key: 'type',
    render(row) {
      const map: Record<string, string> = {
        mobile: '手机',
        browser: '浏览器',
        desktop: '桌面',
        api: 'API',
        unknown: '未知'
      }
      return h(NTag, { type: typeColor[row.type] as any, size: 'small' }, () => map[row.type] || row.type)
    }
  },
  {
    title: 'IP 地址',
    key: 'ip'
  },
  {
    title: '平台',
    key: 'platform'
  },
  {
    title: '状态',
    key: 'online',
    render(row) {
      return h(NTag, { type: row.online ? 'success' : 'default', size: 'small' }, () => row.online ? '在线' : '离线')
    }
  },
  {
    title: '会话数',
    key: 'sessions'
  },
  {
    title: '最后活跃',
    key: 'lastActive',
    render(row) {
      return new Date(row.lastActive).toLocaleString('zh-CN')
    }
  },
  {
    title: '操作',
    key: 'actions',
    render(row) {
      return h(NButton, {
        size: 'small',
        type: 'error',
        secondary: true,
        onClick: () => handleRevokeDevice(row)
      }, () => '强制下线')
    }
  }
]

const sessionColumns: DataTableColumns<any> = [
  {
    title: '用户',
    key: 'username'
  },
  {
    title: '设备类型',
    key: 'deviceInfo',
    render(row) {
      return `${row.deviceInfo?.platform || '-'} · ${row.deviceInfo?.browser || '-'}`
    }
  },
  {
    title: 'IP 地址',
    key: 'ip'
  },
  {
    title: '状态',
    key: 'active',
    render(row) {
      return h(NTag, { type: row.active ? 'success' : 'default', size: 'small' }, () => row.active ? '活跃' : '已结束')
    }
  },
  {
    title: '创建时间',
    key: 'createdAt',
    render(row) {
      return new Date(row.createdAt).toLocaleString('zh-CN')
    }
  },
  {
    title: '最后活跃',
    key: 'lastActive',
    render(row) {
      return new Date(row.lastActive).toLocaleString('zh-CN')
    }
  },
  {
    title: '操作',
    key: 'actions',
    render(row) {
      if (!row.active) return null
      return h(NButton, {
        size: 'small',
        type: 'warning',
        secondary: true,
        onClick: () => handleEndSession(row)
      }, () => '结束会话')
    }
  }
]

async function loadData() {
  loading.value = true
  try {
    const [devicesData, sessionsData] = await Promise.all([
      api.devices.list(),
      api.devices.sessions()
    ])
    devices.value = devicesData
    sessions.value = sessionsData
  } catch (err: any) {
    message.error('加载数据失败')
  } finally {
    loading.value = false
  }
}

function handleRevokeDevice(device: any) {
  dialog.warning({
    title: '确认下线设备',
    content: `确定要强制设备「${device.name}」下线吗？将结束该设备上所有 ${device.sessions} 个活跃会话。`,
    positiveText: '确定下线',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.devices.revoke(device.id)
        message.success('设备已强制下线')
        loadData()
      } catch {
        message.error('操作失败')
      }
    }
  })
}

function handleEndSession(session: any) {
  dialog.warning({
    title: '确认结束会话',
    content: `确定要结束用户「${session.username}」的会话吗？`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.devices.endSession(session.id)
        message.success('会话已结束')
        loadData()
      } catch {
        message.error('操作失败')
      }
    }
  })
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.devices-page {
  max-width: 1400px;
}
</style>
