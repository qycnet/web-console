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
        <n-tab-pane name="json" tab="JSON 编辑器">
          <div class="editor-toolbar">
            <n-space>
              <n-badge :value="`配置文件: ${configPath}`" :type="configExists ? 'success' : 'error'">
                <n-tag :type="configExists ? 'success' : 'error'">
                  {{ configExists ? '已加载' : '未找到' }}
                </n-tag>
              </n-badge>
              <n-button size="small" @click="handleFormatJson">格式化</n-button>
              <n-button size="small" @click="handleValidateJson">验证</n-button>
            </n-space>
          </div>
          <div class="editor-wrapper">
            <MonacoEditor
              v-model="jsonConfig"
              language="json"
              :height="600"
              :theme="themeStore.isDark ? 'vs-dark' : 'vs'"
              @change="handleJsonChange"
            />
          </div>
          <n-space justify="end" style="margin-top: 16px;">
            <n-button @click="handleReset">重置</n-button>
            <n-button type="primary" @click="handleSaveJson">保存配置</n-button>
          </n-space>
        </n-tab-pane>

        <n-tab-pane name="overview" tab="配置概览">
          <n-descriptions :column="1" bordered label-placement="left">
            <n-descriptions-item label="配置文件路径">
              <n-text code>{{ configPath }}</n-text>
            </n-descriptions-item>
            <n-descriptions-item label="配置状态">
              <n-tag :type="configExists ? 'success' : 'error'">
                {{ configExists ? '正常' : '不存在' }}
              </n-tag>
            </n-descriptions-item>
            <n-descriptions-item label="配置大小">
              {{ configSize > 0 ? (configSize / 1024).toFixed(1) + ' KB' : '未知' }}
            </n-descriptions-item>
          </n-descriptions>

          <n-divider>配置模块</n-divider>

          <n-grid :cols="2" :x-gap="16" :y-gap="16">
            <n-gi v-for="(module, key) in configModules" :key="key">
              <n-card :title="module.label" size="small">
                <template #header-extra>
                  <n-tag size="small" :type="module.exists ? 'success' : 'default'">
                    {{ module.exists ? `已配置` : '无' }}
                  </n-tag>
                </template>
                <n-p v-if="module.summary">{{ module.summary }}</n-p>
                <n-p v-else depth="3">暂无配置</n-p>
              </n-card>
            </n-gi>
          </n-grid>
        </n-tab-pane>
      </n-tabs>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  NCard,
  NTabs,
  NTabPane,
  NButton,
  NSpace,
  NIcon,
  NTag,
  NText,
  NP,
  NDescriptions,
  NDescriptionsItem,
  NDivider,
  NGrid,
  NGi,
  NBadge,
  useMessage
} from 'naive-ui'
import { RefreshOutline, DownloadOutline } from '@vicons/ionicons5'
import { api } from '@/api'
import { useThemeStore } from '@/stores/theme'
import MonacoEditor from '@/components/MonacoEditor.vue'

const message = useMessage()
const themeStore = useThemeStore()
const activeTab = ref('json')
const jsonConfig = ref('{}')
const originalConfig = ref('{}')
const configPath = ref('')
const configSize = ref(0)
const configExists = ref(false)

const configModules = computed(() => {
  let parsed: Record<string, any> = {}
  try {
    parsed = JSON.parse(jsonConfig.value)
  } catch { /* ignore */ }

  const topKeys = Object.keys(parsed)
  const labels: Record<string, string> = {
    models: '模型配置',
    agents: 'Agent 配置',
    channels: '渠道配置',
    gateway: '网关配置',
    plugins: '插件管理',
    browser: '浏览器配置',
    skills: '技能管理',
    session: '会话管理',
    messages: '消息管理',
    tools: '工具配置',
    commands: '命令配置',
    schedule: '定时任务',
    ui: '界面配置',
    auth: '认证配置'
  }

  const summaryMap: Record<string, (v: any) => string> = {
    models: (v) => `${Object.keys(v.providers || {}).length} 个模型供应商`,
    agents: (v) => `默认模型: ${v.defaults?.model?.primary || '-'}`,
    channels: (v) => `${Object.keys(v).length} 个渠道`,
    browser: (v) => `浏览器: ${v.enabled ? '已启用' : '已禁用'}`,
    skills: (v) => `额外目录: ${(v.load?.extraDirs || []).length} 个`,
    tools: (v) => `禁用工具: ${(v.deny || []).length} 个`,
    session: (v) => `作用域: ${v.dmScope || '-'}`,
  }

  return topKeys.filter(k => !k.startsWith('$')).map(key => ({
    key,
    label: labels[key] || key,
    exists: true,
    summary: summaryMap[key]?.(parsed[key]) || `${typeof parsed[key]}`
  }))
})

onMounted(async () => {
  await fetchConfig()
})

async function fetchConfig() {
  try {
    const res = await api.config.list()
    const json = JSON.stringify(res, null, 2)
    jsonConfig.value = json
    originalConfig.value = json
    configExists.value = Object.keys(res).length > 0

    // Try to get config path info
    try {
      const configRes = await api.config.get('_meta')
      if (configRes && configRes.path) {
        configPath.value = configRes.path
      }
    } catch {
      // fallback display
    }

    // Calculate size from string
    configSize.value = new Blob([json]).size
  } catch (err) {
    console.error('Failed to load config:', err)
    message.error('加载配置失败')
  }
}

function handleJsonChange(val: string) {
  // Validate on change - just mark
  jsonConfig.value = val
}

async function handleSaveJson() {
  try {
    const parsed = JSON.parse(jsonConfig.value)
    await api.config.update('all', parsed)
    originalConfig.value = jsonConfig.value
    message.success('配置已保存到 openclaw.json')
  } catch (err: any) {
    message.error(`保存失败: ${err.message}`)
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
    const blob = new Blob([jsonConfig.value], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `openclaw-config-backup-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    message.success('备份已下载')
  } catch (err) {
    message.error('备份失败')
  }
}

function handleReset() {
  jsonConfig.value = originalConfig.value
  message.success('已重置为上次保存的版本')
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
  max-width: 1200px;
}

.editor-toolbar {
  margin-bottom: 12px;
  padding: 0 4px;
}

.editor-wrapper {
  background: var(--n-color);
  border-radius: 4px;
  padding: 8px;
  border: 1px solid var(--n-border-color);
}
</style>
