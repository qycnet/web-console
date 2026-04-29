<template>
  <div class="logs-page">
    <n-card title="日志管理">
      <template #header-extra>
        <n-space>
          <n-select
            v-model:value="logLevel"
            :options="levelOptions"
            style="width: 120px;"
            @update:value="loadLogs"
          />
          <n-input
            v-model:value="searchQuery"
            placeholder="搜索日志..."
            clearable
            style="width: 200px;"
            @update:value="loadLogs"
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
        </n-space>
      </template>

      <n-log
        :rows="25"
        :log="logContent"
        language="log"
        :loading="loading"
      />

      <n-pagination
        v-model:page="currentPage"
        :page-count="totalPages"
        style="margin-top: 16px; justify-content: center;"
        @update:page="loadLogs"
      />
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  NCard,
  NSpace,
  NSelect,
  NInput,
  NButton,
  NIcon,
  NLog,
  NPagination,
  useMessage,
  useDialog
} from 'naive-ui'
import { SearchOutline, DownloadOutline, TrashOutline } from '@vicons/ionicons5'
import { api } from '@/api'

const message = useMessage()
const dialog = useDialog()

const logLevel = ref<string | null>(null)
const searchQuery = ref('')
const logContent = ref('')
const loading = ref(false)
const currentPage = ref(1)
const totalPages = ref(1)

const levelOptions = [
  { label: '全部', value: null },
  { label: 'DEBUG', value: 'debug' },
  { label: 'INFO', value: 'info' },
  { label: 'WARN', value: 'warn' },
  { label: 'ERROR', value: 'error' }
]

onMounted(loadLogs)

async function loadLogs() {
  loading.value = true
  try {
    const res = await api.monitor.logs({
      level: logLevel.value || undefined,
      search: searchQuery.value || undefined,
      limit: 100
    })
    logContent.value = res.logs.join('\n')
    totalPages.value = Math.ceil(res.total / 100)
  } catch (err) {
    message.error('加载日志失败')
  } finally {
    loading.value = false
  }
}

function handleExport() {
  const blob = new Blob([logContent.value], { type: 'text/plain' })
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
      logContent.value = ''
      message.success('日志已清空')
    }
  })
}
</script>

<style scoped>
.logs-page {
  height: 100%;
}
</style>
