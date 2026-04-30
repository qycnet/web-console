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
        <n-tab-pane name="models" tab="模型管理">
          <div v-if="!parsedConfig.models?.providers || Object.keys(parsedConfig.models.providers).length === 0" class="empty-state">
            <n-empty description="暂无模型配置，点击添加">
              <template #extra>
                <n-button type="primary" @click="addProvider">添加供应商</n-button>
              </template>
            </n-empty>
          </div>
          <n-space vertical v-else>
            <n-space justify="end">
              <n-button type="primary" ghost @click="addProvider">添加供应商</n-button>
            </n-space>
            <n-card
              v-for="(provider, key, idx) in parsedConfig.models.providers"
              :key="key"
              :title="key"
              :segmented="true"
              size="small"
            >
              <template #header-extra>
                <n-space>
                  <n-button size="tiny" quaternary @click="editProvider(key)">
                    <template #icon><n-icon :component="CreateOutline" /></template>
                  </n-button>
                  <n-popconfirm @positive-click="deleteProvider(key)">
                    <template #trigger>
                      <n-button size="tiny" quaternary type="error">
                        <template #icon><n-icon :component="TrashOutline" /></template>
                      </n-button>
                    </template>
                    确定删除供应商 "{{ key }}" 吗？
                  </n-popconfirm>
                </n-space>
              </template>
              <n-descriptions :column="2" size="small" bordered>
                <n-descriptions-item label="API 地址">{{ provider.baseUrl || '-' }}</n-descriptions-item>
                <n-descriptions-item label="API 类型">{{ provider.api || '-' }}</n-descriptions-item>
                <n-descriptions-item label="模型数">{{ (provider.models || []).length }}</n-descriptions-item>
                <n-descriptions-item label="已启用">{{ provider.enabled !== false ? '是' : '否' }}</n-descriptions-item>
              </n-descriptions>

              <n-divider>模型列表</n-divider>
              <n-data-table
                :columns="modelColumns"
                :data="(provider.models || []).map((m: any, i: number) => ({ ...m, _providerKey: key, _idx: i }))"
                size="small"
                :bordered="false"
              />
              <n-space justify="end" style="margin-top: 8px;">
                <n-button size="tiny" @click="addModel(key)">添加模型</n-button>
              </n-space>
            </n-card>
          </n-space>
        </n-tab-pane>

        <n-tab-pane name="browser" tab="浏览器配置">
          <n-form label-placement="left" :model="browserForm">
            <n-form-item label="启用">
              <n-switch v-model:value="browserForm.enabled" />
            </n-form-item>
            <n-form-item label="可执行路径">
              <n-input v-model:value="browserForm.executablePath" placeholder="chrome 路径" />
            </n-form-item>
            <n-form-item label="无头模式">
              <n-switch v-model:value="browserForm.headless" />
            </n-form-item>
            <n-form-item label="默认 Profile">
              <n-input v-model:value="browserForm.defaultProfile" />
            </n-form-item>
            <n-form-item label="远程 CDP 超时 (ms)">
              <n-input-number v-model:value="browserForm.remoteCdpTimeoutMs" :min="500" :step="100" />
            </n-form-item>
            <n-form-item label="允许私有网络">
              <n-switch v-model:value="browserForm.ssrfPolicy?.allowPrivateNetwork" />
            </n-form-item>
          </n-form>
          <n-divider>Profile 配置</n-divider>
          <n-space v-for="(profile, key) in browserForm.profiles || {}" :key="key">
            <n-card :title="key" size="small">
              <template #header-extra>
                <n-popconfirm @positive-click="deleteProfile(key)">
                  <template #trigger>
                    <n-button size="tiny" quaternary type="error">
                      <template #icon><n-icon :component="TrashOutline" /></template>
                    </n-button>
                  </template>
                  确定删除 Profile "{{ key }}" 吗？
                </n-popconfirm>
              </template>
              <n-form-item label="CDP 端口">
                <n-input-number v-model:value="profile.cdpPort" :min="1024" :max="65535" />
              </n-form-item>
              <n-form-item label="颜色">
                <n-input v-model:value="profile.color" placeholder="#FF4500" />
              </n-form-item>
            </n-card>
          </n-space>
          <n-space justify="end" style="margin-top: 8px;">
            <n-button @click="addProfile">添加 Profile</n-button>
            <n-button type="primary" @click="saveBrowserConfig">保存浏览器配置</n-button>
          </n-space>
        </n-tab-pane>

        <n-tab-pane name="overview" tab="配置概览">
          <n-grid :cols="2" :x-gap="16" :y-gap="16">
            <n-gi v-for="(module, key) in configModules" :key="key">
              <n-card :title="module.label" size="small">
                <template #header-extra>
                  <n-tag size="small" :type="module.exists ? 'success' : 'default'">
                    {{ module.exists ? `已配置` : '无' }}
                  </n-tag>
                </template>
                <n-ellipsis :line-clamp="3" v-if="module.summary">
                  {{ module.summary }}
                </n-ellipsis>
                <n-p v-else depth="3">暂无配置</n-p>
              </n-card>
            </n-gi>
          </n-grid>
        </n-tab-pane>

        <n-tab-pane name="json" tab="JSON 编辑器">
          <div class="editor-toolbar">
            <n-space>
              <n-tag :type="configExists ? 'success' : 'error'">
                {{ configExists ? '已加载' : '未找到' }}
              </n-tag>
              <n-button size="small" @click="handleFormatJson">格式化</n-button>
              <n-button size="small" @click="handleValidateJson">验证</n-button>
              <n-button size="small" @click="handleReset">重置</n-button>
              <n-button size="small" type="primary" @click="handleSaveJson">保存</n-button>
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
        </n-tab-pane>
      </n-tabs>
    </n-card>

    <!-- 添加/编辑供应商对话框 -->
    <n-modal v-model:show="showProviderDialog" preset="card" title="编辑供应商" style="width: 600px;">
      <n-form>
        <n-form-item label="供应商名称">
          <n-input v-model:value="editProviderForm.name" placeholder="如: xiaoyiprovider" />
        </n-form-item>
        <n-form-item label="API 地址">
          <n-input v-model:value="editProviderForm.baseUrl" placeholder="https://..." />
        </n-form-item>
        <n-form-item label="API 类型">
          <n-select v-model:value="editProviderForm.api" :options="[{label:'openai-completions',value:'openai-completions'}]" />
        </n-form-item>
        <n-form-item label="API Key">
          <n-input v-model:value="editProviderForm.apiKey" type="password" show-password-on="click" />
        </n-form-item>
        <n-form-item label="已启用">
          <n-switch v-model:value="editProviderForm.enabled" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showProviderDialog = false">取消</n-button>
          <n-button type="primary" @click="saveProvider">保存</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 添加模型对话框 -->
    <n-modal v-model:show="showModelDialog" preset="card" title="编辑模型" style="width: 500px;">
      <n-form>
        <n-form-item label="模型 ID">
          <n-input v-model:value="editModelForm.id" placeholder="模型标识" />
        </n-form-item>
        <n-form-item label="模型名称">
          <n-input v-model:value="editModelForm.name" placeholder="显示名称" />
        </n-form-item>
        <n-form-item label="上下文窗口">
          <n-input-number v-model:value="editModelForm.contextWindow" :min="1024" :step="1024" />
        </n-form-item>
        <n-form-item label="最大 Token">
          <n-input-number v-model:value="editModelForm.maxTokens" :min="256" :step="256" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showModelDialog = false">取消</n-button>
          <n-button type="primary" @click="saveModel">保存</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 添加 Profile 对话框 -->
    <n-modal v-model:show="showProfileDialog" preset="card" title="添加 Profile" style="width: 400px;">
      <n-form>
        <n-form-item label="Profile 名称">
          <n-input v-model:value="newProfileName" placeholder="如: work" />
        </n-form-item>
        <n-form-item label="CDP 端口">
          <n-input-number v-model:value="newProfileCdpPort" :min="1024" :max="65535" />
        </n-form-item>
        <n-form-item label="颜色">
          <n-input v-model:value="newProfileColor" placeholder="#0066CC" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showProfileDialog = false">取消</n-button>
          <n-button type="primary" @click="saveProfile">保存</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
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
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NSwitch,
  NDataTable,
  NPopconfirm,
  NModal,
  NEllipsis,
  type DataTableColumns,
  useMessage
} from 'naive-ui'
import { RefreshOutline, DownloadOutline, CreateOutline, TrashOutline } from '@vicons/ionicons5'
import { api } from '@/api'
import { useThemeStore } from '@/stores/theme'
import MonacoEditor from '@/components/MonacoEditor.vue'

const message = useMessage()
const themeStore = useThemeStore()
const activeTab = ref('models')
const jsonConfig = ref('{}')
const originalConfig = ref('{}')
const configExists = ref(false)
const parsedConfig = ref<Record<string, any>>({})

// 供应商编辑
const showProviderDialog = ref(false)
const editProviderForm = reactive({
  name: '',
  baseUrl: '',
  api: 'openai-completions',
  apiKey: '',
  enabled: true
})
const editingProviderKey = ref<string | null>(null)

// 模型编辑
const showModelDialog = ref(false)
const editModelForm = reactive({
  id: '',
  name: '',
  contextWindow: 4096,
  maxTokens: 2048
})
const editingProviderForModel = ref('')

// Profile 编辑
const showProfileDialog = ref(false)
const newProfileName = ref('')
const newProfileCdpPort = ref(18800)
const newProfileColor = ref('#0066CC')

// 浏览器表单
const browserForm = reactive<Record<string, any>>({
  enabled: true,
  executablePath: '',
  headless: true,
  defaultProfile: 'openclaw',
  remoteCdpTimeoutMs: 1500,
  ssrfPolicy: { allowPrivateNetwork: true },
  profiles: {} as Record<string, { cdpPort: number; color: string }>
})

const modelColumns: DataTableColumns = [
  { title: '模型 ID', key: 'id', width: 200 },
  { title: '名称', key: 'name' },
  { title: '上下文窗口', key: 'contextWindow', width: 120 },
  { title: '最大 Token', key: 'maxTokens', width: 120 },
  { title: '操作', key: '_actions', width: 80, render() { return '' } }
]

const configModules = computed(() => {
  const modules: Record<string, any> = parsedConfig.value
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
    browser: (v) => `浏览器: ${v.enabled ? '已启用' : '已禁用'}`,
    skills: (v) => `额外目录: ${(v.load?.extraDirs || []).length} 个`,
    tools: (v) => `禁用工具: ${(v.deny || []).length} 个`,
    session: (v) => `作用域: ${v.dmScope || '-'}`,
  }
  return Object.keys(modules).filter(k => !k.startsWith('$')).map(key => ({
    key,
    label: labels[key] || key,
    exists: true,
    summary: summaryMap[key]?.(modules[key]) || `${typeof modules[key]}`
  }))
})

onMounted(async () => {
  await fetchConfig()
})

async function fetchConfig() {
  try {
    const res = await api.config.list()
    parsedConfig.value = res
    jsonConfig.value = JSON.stringify(res, null, 2)
    originalConfig.value = jsonConfig.value
    configExists.value = Object.keys(res).length > 0

    // 初始化浏览器表单
    if (res.browser) {
      Object.assign(browserForm, res.browser)
    }
  } catch (err) {
    console.error('Failed to load config:', err)
    message.error('加载配置失败')
  }
}

// ---- 供应商管理 ----
function addProvider() {
  editingProviderKey.value = null
  editProviderForm.name = ''
  editProviderForm.baseUrl = ''
  editProviderForm.api = 'openai-completions'
  editProviderForm.apiKey = ''
  editProviderForm.enabled = true
  showProviderDialog.value = true
}

function editProvider(key: string) {
  editingProviderKey.value = key
  const provider = parsedConfig.value.models?.providers?.[key] || {}
  editProviderForm.name = key
  editProviderForm.baseUrl = provider.baseUrl || ''
  editProviderForm.api = provider.api || 'openai-completions'
  editProviderForm.apiKey = provider.apiKey || ''
  editProviderForm.enabled = provider.enabled !== false
  showProviderDialog.value = true
}

function saveProvider() {
  const providers = parsedConfig.value.models?.providers || {}
  const providerName = editProviderForm.name

  // 如果改名，删除旧的 key
  if (editingProviderKey.value && editingProviderKey.value !== providerName) {
    delete providers[editingProviderKey.value]
  }

  providers[providerName] = {
    ...(providers[providerName] || {}),
    baseUrl: editProviderForm.baseUrl,
    api: editProviderForm.api,
    apiKey: editProviderForm.apiKey,
    enabled: editProviderForm.enabled,
    models: providers[providerName]?.models || []
  }

  parsedConfig.value.models = parsedConfig.value.models || {}
  parsedConfig.value.models.providers = providers

  showProviderDialog.value = false
  saveConfig()
}

function deleteProvider(key: string) {
  if (parsedConfig.value.models?.providers) {
    delete parsedConfig.value.models.providers[key]
    saveConfig()
  }
}

// ---- 模型管理 ----
function addModel(providerKey: string) {
  editingProviderForModel.value = providerKey
  editModelForm.id = ''
  editModelForm.name = ''
  editModelForm.contextWindow = 4096
  editModelForm.maxTokens = 2048
  showModelDialog.value = true
}

function saveModel() {
  const providers = parsedConfig.value.models?.providers
  if (!providers || !providers[editingProviderForModel.value]) return

  providers[editingProviderForModel.value].models = providers[editingProviderForModel.value].models || []
  providers[editingProviderForModel.value].models.push({
    id: editModelForm.id,
    name: editModelForm.name,
    contextWindow: editModelForm.contextWindow,
    maxTokens: editModelForm.maxTokens
  })

  showModelDialog.value = false
  saveConfig()
}

// ---- Profile 管理 ----
function addProfile() {
  newProfileName.value = ''
  newProfileCdpPort.value = 18800
  newProfileColor.value = '#0066CC'
  showProfileDialog.value = true
}

function saveProfile() {
  const name = newProfileName.value.trim()
  if (!name) {
    message.error('请输入 Profile 名称')
    return
  }
  browserForm.profiles = browserForm.profiles || {}
  browserForm.profiles[name] = {
    cdpPort: newProfileCdpPort.value,
    color: newProfileColor.value
  }
  showProfileDialog.value = false
  message.success('Profile 已添加，请点击保存浏览器配置')
}

function deleteProfile(key: string) {
  if (browserForm.profiles) {
    delete browserForm.profiles[key]
  }
}

async function saveBrowserConfig() {
  parsedConfig.value.browser = { ...browserForm }
  await saveConfig()
  message.success('浏览器配置已保存')
}

// ---- 通用 ----
async function saveConfig() {
  try {
    await api.config.update('all', parsedConfig.value)
    jsonConfig.value = JSON.stringify(parsedConfig.value, null, 2)
    originalConfig.value = jsonConfig.value
    message.success('配置已保存')
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

function handleJsonChange(val: string) {
  jsonConfig.value = val
}

async function handleSaveJson() {
  try {
    const parsed = JSON.parse(jsonConfig.value)
    parsedConfig.value = parsed
    await api.config.update('all', parsed)
    originalConfig.value = jsonConfig.value
    message.success('配置已保存')
  } catch (err: any) {
    message.error(`保存失败: ${err.message}`)
  }
}

</script>

<style scoped>
.config-page {
  max-width: 1200px;
}
.empty-state {
  padding: 40px 0;
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
