<template>
  <div class="logs-page">
    <n-card title="日志管理">
      <template #header-extra>
        <n-space>
          <n-badge :value="isConnected ? 'online' : 'offline'" :type="isConnected ? 'success' : 'default'" dot>
            <n-button quaternary size="small">
              <template #icon><n-icon :component="WifiOutline" /></template>
            </n-button>
          </n-badge>
          <n-select
            v-model:value="logLevel"
            :options="levelOptions"
            style="width: 120px;"
            @update:value="filterLogs"
          />
          <n-input
            v-model:value="searchQuery"
            placeholder="搜索日志..."
            clearable
            style="width: 200px;"
            @update:value="filterLogs"
          >
            <template #prefix>
              <n-icon :component="SearchOutline" />
            </template>
          </n-input>
          <n-button @click="handleExport">
            <template #icon><n-icon :component="DownloadOutline" /></template>
            导出
          </n-button>
          <n-button @click="handleClear">
            <template #icon><n-icon :component="TrashOutline" /></template>
            清空
          </n-button>
          <n-button :type="autoScroll ? 'primary' : 'default'" @click="autoScroll = !autoScroll">
            <template #icon><n-icon :component="ArrowDownOutline" /></template>
            自动滚动
          </n-button>
        </n-space>
      </template>

      <div class="log-container">
        <div class="log-controls">
          <n-space>
            <n-button size="small" @click="loadHistoricalLogs">
              加载历史日志
            </n-button>
            <n-switch v-model:value="realtimeEnabled" @update:value="toggleRealtime">
              <template #checked>实时</template>
              <template #unchecked>暂停</template>
            </n-switch>
          </n-space>
        </div>

        <div class="log-content" ref="logContentRef">
          <div
            v-for="(log, index) in filteredLogs"
            :key="index"
            :class="['log-line', getLogClass(log)]"
          >
            {{ log }}
          </div>
          <div v-if="filteredLogs.length === 0" class="log-empty">
            暂无日志
          </div>
        </div>
      </div>

      <n-pagination
        v-model:page="currentPage"
        :page-count="totalPages"
        style="margin-top: 16px; justify-content: center;"
        @update:page="loadHistoricalLogs"
      />
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import {
  NCard,
  NSpace,
  NSelect,
  NInput,
  NButton,
  NIcon,
  NPagination,
  NBadge,
  NSwitch,
  useMessage,
  useDialog
} from 'naive-ui'
import { SearchOutline, DownloadOutline, TrashOutline, WifiOutline, ArrowDownOutline } from '@vicons/ionicons5'
import { api } from '@/api'
import { useWebSocket } from '@/composables/useWebSocket'

const message = useMessage()
const dialog = useDialog()

const logLevel = ref<string>('')
const searchQuery = ref('')
const historicalLogs = ref<string[]>([])
const currentPage = ref(1)
const totalPages = ref(1)
const autoScroll = ref(true)
const realtimeEnabled = ref(true)
const logContentRef = ref<HTMLElement>()

const {
  isConnected,
  logs: realtimeLogs,
  connect,
  disconnect,
  subscribeLogs,
  unsubscribeLogs,
  clearLogs: clearRealtimeLogs
} = useWebSocket()

const levelOptions = [
  { label: '全部', value: '' as const },
  { label: 'DEBUG', value: 'debug' as const },
  { label: 'INFO', value: 'info' as const },
  { label: 'WARN', value: 'warn' as const },
  { label: 'ERROR', value: 'error' as const }
]

const allLogs = computed(() => {
  return [...historicalLogs.value, ...realtimeLogs.value]
})

const filteredLogs = computed(() => {
  let logs = allLogs.value

  if (logLevel.value) {
    logs = logs.filter(log => log.includes(`[${(logLevel.value as string).toUpperCase()}]`))
  }

  if (searchQuery.value) {
    logs = logs.filter(log => log.toLowerCase().includes(searchQuery.value.toLowerCase()))
  }

  return logs
})

function getLogClass(log: string): string {
  if (log.includes('[ERROR]')) return 'log-error'
  if (log.includes('[WARN]')) return 'log-warn'
  if (log.includes('[DEBUG]')) return 'log-debug'
  return 'log-info'
}

async function loadHistoricalLogs() {
  try {
    const res = await api.monitor.logs({
      level: logLevel.value || undefined,
      search: searchQuery.value || undefined,
      limit: 100
    })
    historicalLogs.value = res.logs
    totalPages.value = Math.ceil(res.total / 100)
  } catch (err) {
    message.error('加载日志失败')
  }
}

function filterLogs() {
  // 过滤时重新加载历史日志
  loadHistoricalLogs()
}

function toggleRealtime(enabled: boolean) {
  if (enabled) {
    subscribeLogs()
  } else {
    unsubscribeLogs()
  }
}

function handleExport() {
  const content = filteredLogs.value.join('\n')
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `openclaw-logs-${Date.now()}.log`
  a.click()
  URL.revokeObjectURL(url)
  message.success('日志已导出')
}

function handleClear() {
  dialog.warning({
    title: '确认清空',
    content: '确定要清空所有日志吗？此操作不可恢复。',
    positiveText: '清空',
    negativeText: '取消',
    onPositiveClick: () => {
      historicalLogs.value = []
      clearRealtimeLogs()
      message.success('日志已清空')
    }
  })
}

// 自动滚动到底部
watch(filteredLogs, async () => {
  if (autoScroll.value) {
    await nextTick()
    logContentRef.value?.scrollTo({
      top: logContentRef.value.scrollHeight,
      behavior: 'smooth'
    })
  }
})

onMounted(() => {
  connect()
  subscribeLogs()
  loadHistoricalLogs()
})

onUnmounted(() => {
  unsubscribeLogs()
  disconnect()
})
</script>

<style scoped>
.logs-page {
  height: 100%;
}

.log-container {
  background: #1e1e1e;
  border-radius: 4px;
  overflow: hidden;
}

.log-controls {
  padding: 8px 12px;
  background: #2d2d2d;
  border-bottom: 1px solid #3d3d3d;
}

.log-content {
  height: 500px;
  overflow-y: auto;
  padding: 12px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.log-line {
  padding: 2px 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-error {
  color: #ff6b6b;
}

.log-warn {
  color: #ffd93d;
}

.log-debug {
  color: #6bcb77;
}

.log-info {
  color: #e0e0e0;
}

.log-empty {
  color: #888;
  text-align: center;
  padding: 40px;
}

/* 滚动条样式 */
.log-content::-webkit-scrollbar {
  width: 8px;
}

.log-content::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.log-content::-webkit-scrollbar-thumb {
  background: #4d4d4d;
  border-radius: 4px;
}

.log-content::-webkit-scrollbar-thumb:hover {
  background: #5d5d5d;
}
</style>
