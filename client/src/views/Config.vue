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
          <ConfigSectionCollection
            title="供应商"
            :items="modelProviders"
            :presets="modelPresets"
            :sub-item-config="{label:'模型', fields:{id:'',name:'',contextWindow:4096,maxTokens:2048}, fieldTypes:{id:'string',name:'string',contextWindow:'number',maxTokens:'number'}}"
            @update="onProviderUpdate"
            @delete="onProviderDelete"
            @add-sub="onAddModel"
          />
        </n-tab-pane>

        <n-tab-pane name="channels" tab="通道管理">
          <ConfigSectionCollection
            title="通道"
            :items="channelItems"
            :presets="channelPresets"
            @update="onChannelUpdate"
            @delete="onChannelDelete"
          />
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
              <n-switch v-model:value="browserForm.ssrfPolicy.allowPrivateNetwork" />
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
            <n-button @click="showProfileDialog = true">添加 Profile</n-button>
            <n-button type="primary" @click="saveBrowserConfig">保存浏览器配置</n-button>
          </n-space>
        </n-tab-pane>

        <n-tab-pane name="protected" tab="受保护文件">
          <div class="protected-paths">
            <div style="margin-bottom: 16px; color: #666; font-size: 14px;">
              配置非 admin 用户不可操作的文件或目录路径（前缀匹配）。受保护路径对 admin 用户不受影响。
            </div>
            <n-list bordered>
              <n-list-item v-for="(p, idx) in protectedPaths" :key="idx">
                <n-thing>
                  <template #description>
                    <code style="font-size: 13px;">{{ p }}</code>
                  </template>
                  <template #action>
                    <n-button size="tiny" quaternary type="error" @click="removeProtectedPath(idx)">
                      <template #icon><n-icon :component="TrashOutline" /></template>
                    </n-button>
                  </template>
                </n-thing>
              </n-list-item>
            </n-list>
            <n-empty v-if="protectedPaths.length === 0" description="暂无受保护路径" style="margin: 24px 0;" />
            <n-space style="margin-top: 12px;">
              <n-input
                v-model:value="newProtectedPath"
                placeholder="例如: .openclaw/config.json 或 .ssh"
                style="width: 400px;"
                clearable
                @keyup.enter="addProtectedPath"
              />
              <n-button @click="addProtectedPath" :disabled="!newProtectedPath.trim()">添加</n-button>
            </n-space>
            <n-space justify="end" style="margin-top: 24px;">
              <n-button type="primary" @click="saveProtectedPaths" :loading="savingProtectedPaths">保存配置</n-button>
            </n-space>
          </div>
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
import { ref, computed, reactive, onMounted } from 'vue'
import {
  NCard,
  NTabs,
  NTabPane,
  NButton,
  NSpace,
  NIcon,
  NTag,
  NGrid,
  NGi,
  NInput,
  NInputNumber,
  NModal,
  NForm,
  NFormItem,
  NPopconfirm,
  useMessage
} from 'naive-ui'
import { RefreshOutline, DownloadOutline, TrashOutline } from '@vicons/ionicons5'
import { api } from '@/api'
import { useThemeStore } from '@/stores/theme'
import MonacoEditor from '@/components/MonacoEditor.vue'
import ConfigSectionCollection from '@/components/ConfigSectionCollection.vue'
import type { CollectionPreset } from '@/components/ConfigSectionCollection.vue'

const message = useMessage()
const themeStore = useThemeStore()
const activeTab = ref('models')
const showProfileDialog = ref(false)
const jsonConfig = ref('{}')
const originalConfig = ref('{}')
const configExists = ref(false)
const parsedConfig = ref<Record<string, any>>({})

// ---- 模型供应商预设 ----
const modelPresets: CollectionPreset[] = [
  {
    label: '小艺供应商',
    keyPrefix: 'xiaoyiprovider',
    fields: {
      baseUrl: 'https://celia-claw-drcn.ai.dbankcloud.cn/celia-claw/v1/sse-api',
      api: 'openai-completions',
      apiKey: '',
      enabled: true
    },
    fieldTypes: { baseUrl: 'string', api: 'select', apiKey: 'string', enabled: 'switch' },
    fieldLabels: { baseUrl: 'API 地址', api: 'API 类型', apiKey: 'API Key', enabled: '已启用' },
    fieldPlaceholders: { baseUrl: 'https://...' },
    fieldOptions: { api: [{ label: 'openai-completions', value: 'openai-completions' }, { label: 'anthropic', value: 'anthropic' }] }
  },
  {
    label: '通用 OpenAI',
    keyPrefix: 'openai',
    fields: {
      baseUrl: 'https://api.openai.com/v1',
      api: 'openai-completions',
      apiKey: '',
      enabled: true
    },
    fieldTypes: { baseUrl: 'string', api: 'select', apiKey: 'string', enabled: 'switch' },
    fieldLabels: { baseUrl: 'API 地址', api: 'API 类型', apiKey: 'API Key', enabled: '已启用' },
    fieldPlaceholders: { baseUrl: 'https://api.openai.com/v1' },
    fieldOptions: { api: [{ label: 'openai-completions', value: 'openai-completions' }, { label: 'anthropic', value: 'anthropic' }] }
  }
]

// ---- 通道预设 ----
const channelPresets: CollectionPreset[] = [
  {
    label: '飞书机器人',
    keyPrefix: 'feishu',
    fields: { webhook: '', secret: '' },
    fieldTypes: { webhook: 'string', secret: 'string' },
    fieldLabels: { webhook: 'Webhook 地址', secret: '密钥' },
    fieldPlaceholders: { webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/...' }
  },
  {
    label: '企业微信机器人',
    keyPrefix: 'wecom',
    fields: { webhook: '' },
    fieldTypes: { webhook: 'string' },
    fieldLabels: { webhook: 'Webhook 地址' }
  },
  {
    label: '钉钉机器人',
    keyPrefix: 'dingtalk',
    fields: { webhook: '', secret: '' },
    fieldTypes: { webhook: 'string', secret: 'string' },
    fieldLabels: { webhook: 'Webhook 地址', secret: '加签密钥' }
  },
  {
    label: 'QQ 机器人',
    keyPrefix: 'qq',
    fields: { botId: '', token: '' },
    fieldTypes: { botId: 'string', token: 'string' },
    fieldLabels: { botId: 'Bot ID', token: 'Token' }
  }
]

// ---- 计算属性 ----
const modelProviders = computed(() => parsedConfig.value.models?.providers || {})
const channelItems = computed(() => parsedConfig.value.channels || {})

const configModules = computed(() => {
  const modules: Record<string, any> = parsedConfig.value
  const labels: Record<string, string> = {
    channels: '通道管理',
    models: '模型管理',
    agents: 'Agent 配置',
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
    models: (v) => `${Object.keys(v.providers || {}).length} 个供应商`,
    channels: (v) => `${Object.keys(v).length} 个通道`,
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

// ---- 初始化 ----
onMounted(async () => {
  await fetchConfig()
  await loadProtectedPaths()
})

async function fetchConfig() {
  try {
    const res = await api.config.list()
    parsedConfig.value = res
    jsonConfig.value = JSON.stringify(res, null, 2)
    originalConfig.value = jsonConfig.value
    configExists.value = Object.keys(res).length > 0
  } catch (err) {
    console.error('Failed to load config:', err)
    message.error('加载配置失败')
  }
}

// ---- 模型供应商 CRUD ----
function onProviderUpdate(key: string, value: any) {
  const providers = parsedConfig.value.models?.providers || {}
  // 如果 key 变了（重命名），删除旧的
  if (providers[key] && providers[key] !== value) {
    // existing key being overwritten, keep
  }
  providers[key] = { ...value, models: providers[key]?.models || [] }
  parsedConfig.value.models = parsedConfig.value.models || {}
  parsedConfig.value.models.providers = { ...providers }
  saveConfig()
}

function onProviderDelete(key: string) {
  if (parsedConfig.value.models?.providers) {
    const providers = { ...parsedConfig.value.models.providers }
    delete providers[key]
    parsedConfig.value.models.providers = providers
    saveConfig()
  }
}

function onAddModel(parentKey: string, model: any) {
  const providers = parsedConfig.value.models?.providers
  if (!providers || !providers[parentKey]) return
  providers[parentKey].models = providers[parentKey].models || []
  providers[parentKey].models.push(model)
  saveConfig()
}

// ---- 通道 CRUD ----
function onChannelUpdate(key: string, value: any) {
  const channels = { ...(parsedConfig.value.channels || {}) }
  channels[key] = { ...value }
  parsedConfig.value.channels = channels
  saveConfig()
}

function onChannelDelete(key: string) {
  const channels = { ...(parsedConfig.value.channels || {}) }
  delete channels[key]
  parsedConfig.value.channels = channels
  saveConfig()
}

// ---- 浏览器配置 ----
const browserForm = reactive({
  enabled: true,
  executablePath: '',
  headless: false,
  defaultProfile: 'openclaw',
  remoteCdpTimeoutMs: 1500,
  ssrfPolicy: { allowPrivateNetwork: true },
  profiles: {} as Record<string, { cdpPort: number; color: string }>
})

const newProfileName = ref('')
const newProfileCdpPort = ref(18800)
const newProfileColor = ref('#0066CC')

function saveProfile() {
  const name = newProfileName.value.trim()
  if (!name) {
    message.error('请输入 Profile 名称')
    return
  }
  browserForm.profiles[name] = {
    cdpPort: newProfileCdpPort.value,
    color: newProfileColor.value
  }
  newProfileName.value = ''
  message.success('Profile 已添加，请点击保存浏览器配置')
}

function deleteProfile(key: string) {
  delete browserForm.profiles[key]
}

async function saveBrowserConfig() {
  parsedConfig.value.browser = { ...browserForm }
  await saveConfig()
  message.success('浏览器配置已保存')
}

// ---- 受保护路径 ----
const protectedPaths = ref<string[]>([])
const newProtectedPath = ref('')
const savingProtectedPaths = ref(false)

function addProtectedPath() {
  const path = newProtectedPath.value.trim()
  if (!path) return
  if (protectedPaths.value.includes(path)) {
    message.warning('该路径已存在')
    return
  }
  protectedPaths.value.push(path)
  newProtectedPath.value = ''
}

function removeProtectedPath(idx: number) {
  protectedPaths.value.splice(idx, 1)
}

async function loadProtectedPaths() {
  try {
    const res = await api.config.get('protected-paths')
    protectedPaths.value = res.paths || []
  } catch {
    // If endpoint doesn't exist, use defaults
    protectedPaths.value = ['.openclaw/config.json', '.openclaw/openclaw.json']
  }
}

async function saveProtectedPaths() {
  savingProtectedPaths.value = true
  try {
    const res = await fetch('/api/config/protected-paths', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ paths: protectedPaths.value })
    })
    if (!res.ok) throw new Error((await res.json()).error || '保存失败')
    message.success('受保护路径已保存')
  } catch (err: any) {
    message.error(`保存失败: ${err.message}`)
  } finally {
    savingProtectedPaths.value = false
  }
}

async function saveConfig() {
  try {
    await api.config.update('all', parsedConfig.value)
    jsonConfig.value = JSON.stringify(parsedConfig.value, null, 2)
    originalConfig.value = jsonConfig.value
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
