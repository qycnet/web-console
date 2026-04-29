<template>
  <div class="config-page">
    <n-card title="配置管理">
      <template #header-extra>
        <n-space>
          <n-button @click="handleReload">
            <template #icon><n-icon :component="RefreshOutline" /></template>
            热重载
          </n-button>
          <n-button @click="handleBackup">
            <template #icon><n-icon :component="DownloadOutline" /></template>
            备份
          </n-button>
        </n-space>
      </template>

      <n-tabs v-model:value="activeTab" type="line">
        <n-tab-pane name="form" tab="表单模式">
          <n-form label-placement="left" label-width="120px">
            <n-divider>基础配置</n-divider>
            <n-form-item label="应用名称">
              <n-input v-model:value="config.appName" />
            </n-form-item>
            <n-form-item label="端口">
              <n-input-number v-model:value="config.port" :min="1" :max="65535" />
            </n-form-item>
            <n-form-item label="调试模式">
              <n-switch v-model:value="config.debug" />
            </n-form-item>

            <n-divider>模型配置</n-divider>
            <n-form-item label="默认模型">
              <n-select v-model:value="config.model" :options="modelOptions" />
            </n-form-item>
            <n-form-item label="API Key">
              <n-input v-model:value="config.apiKey" type="password" show-password-on="click" />
            </n-form-item>

            <n-divider>安全配置</n-divider>
            <n-form-item label="启用认证">
              <n-switch v-model:value="config.authEnabled" />
            </n-form-item>
            <n-form-item label="会话超时">
              <n-input-number v-model:value="config.sessionTimeout" :min="60" />
              <template #feedback>秒</template>
            </n-form-item>
          </n-form>
          <n-space justify="end" style="margin-top: 16px;">
            <n-button type="primary" @click="handleSave">保存配置</n-button>
          </n-space>
        </n-tab-pane>

        <n-tab-pane name="json" tab="JSON 模式">
          <div class="editor-wrapper">
            <n-space style="margin-bottom: 8px;">
              <n-button size="small" @click="handleFormatJson">格式化</n-button>
              <n-button size="small" @click="handleValidateJson">验证</n-button>
            </n-space>
            <MonacoEditor
              v-model="jsonConfig"
              language="json"
              :height="500"
              :theme="themeStore.isDark ? 'vs-dark' : 'vs'"
              @change="handleJsonChange"
            />
          </div>
          <n-space justify="end" style="margin-top: 16px;">
            <n-button type="primary" @click="handleSaveJson">保存配置</n-button>
          </n-space>
        </n-tab-pane>
      </n-tabs>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import {
  NCard,
  NTabs,
  NTabPane,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSwitch,
  NSelect,
  NDivider,
  NButton,
  NSpace,
  NIcon,
  useMessage
} from 'naive-ui'
import { RefreshOutline, DownloadOutline } from '@vicons/ionicons5'
import { api } from '@/api'
import { useThemeStore } from '@/stores/theme'
import MonacoEditor from '@/components/MonacoEditor.vue'

const message = useMessage()
const themeStore = useThemeStore()
const activeTab = ref('form')
const jsonConfig = ref('')
const editorRef = ref()

const config = ref({
  appName: 'OpenClaw',
  port: 3000,
  debug: false,
  model: 'default',
  apiKey: '',
  authEnabled: true,
  sessionTimeout: 3600
})

const modelOptions = [
  { label: '默认模型', value: 'default' },
  { label: 'GPT-4', value: 'gpt-4' },
  { label: 'Claude 3', value: 'claude-3' }
]

watch(config, (val) => {
  jsonConfig.value = JSON.stringify(val, null, 2)
}, { deep: true })

onMounted(async () => {
  try {
    const res = await api.config.list()
    config.value = res
    jsonConfig.value = JSON.stringify(res, null, 2)
  } catch (err) {
    console.error('Failed to load config:', err)
  }
})

async function handleSave() {
  try {
    await api.config.update('all', config.value)
    message.success('配置已保存')
  } catch (err) {
    message.error('保存失败')
  }
}

function handleJsonChange(val: string) {
  try {
    const parsed = JSON.parse(val)
    config.value = parsed
  } catch {
    // JSON 格式错误，不做处理
  }
}

async function handleSaveJson() {
  try {
    const parsed = JSON.parse(jsonConfig.value)
    await api.config.update('all', parsed)
    message.success('配置已保存')
  } catch (err) {
    message.error('JSON 格式错误或保存失败')
  }
}

async function handleReload() {
  try {
    await api.config.reload()
    message.success('配置已重载')
  } catch (err) {
    message.error('重载失败')
  }
}

async function handleBackup() {
  try {
    const blob = await api.config.backup()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `config-backup-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    message.success('备份已下载')
  } catch (err) {
    message.error('备份失败')
  }
}

function handleFormatJson() {
  try {
    const parsed = JSON.parse(jsonConfig.value)
    jsonConfig.value = JSON.stringify(parsed, null, 2)
    message.success('格式化成功')
  } catch {
    message.error('JSON 格式错误')
  }
}

function handleValidateJson() {
  try {
    JSON.parse(jsonConfig.value)
    message.success('JSON 格式正确')
  } catch (e: any) {
    message.error(`JSON 格式错误: ${e.message}`)
  }
}
</script>

<style scoped>
.config-page {
  max-width: 900px;
}

.editor-wrapper {
  background: var(--n-color);
  border-radius: 4px;
  padding: 12px;
}
</style>
