<template>
  <div class="agents-page">
    <n-card title="Agent 管理">
      <template #header-extra>
        <n-button type="primary" @click="showCreateModal = true" :disabled="hasPendingTasks">
          <template #icon><n-icon :component="AddOutline" /></template>
          新建 Agent
        </n-button>
      </template>

      <n-data-table
        :columns="columns"
        :data="agents"
        :loading="loading"
        :row-key="(row: Agent) => row.id"
        :pagination="{ pageSize: 10 }"
      />
    </n-card>

    <!-- 详情/对话弹窗 -->
    <n-modal v-model:show="showDetail" preset="card" style="width: 900px; height: 600px;">
      <template #header>
        <n-space align="center">
          <span>{{ selectedAgent?.name }}</span>
          <n-tag :type="getStatusType(selectedAgent?.status)">
            {{ getStatusText(selectedAgent?.status) }}
          </n-tag>
          <n-button size="tiny" quaternary @click="openEditModal">编辑</n-button>
        </n-space>
      </template>

      <n-tabs type="line">
        <n-tab-pane name="info" tab="信息">
          <n-descriptions :column="2" bordered>
            <n-descriptions-item label="ID">{{ selectedAgent?.id }}</n-descriptions-item>
            <n-descriptions-item label="状态">
              <n-tag :type="getStatusType(selectedAgent?.status)">
                {{ getStatusText(selectedAgent?.status) }}
              </n-tag>
            </n-descriptions-item>
            <n-descriptions-item label="模型">{{ selectedAgent?.model }}</n-descriptions-item>
            <n-descriptions-item label="创建时间">{{ selectedAgent?.createdAt || '-' }}</n-descriptions-item>
            <n-descriptions-item label="描述" :span="2">
              {{ selectedAgent?.description || '-' }}
            </n-descriptions-item>
          </n-descriptions>

          <n-divider>已安装技能</n-divider>
          <n-space>
            <n-tag v-for="skill in selectedAgent?.skills" :key="skill" closable @close="handleRemoveSkill(skill)">
              {{ skill }}
            </n-tag>
            <n-button size="tiny" quaternary @click="showAddSkill = true">+ 添加</n-button>
          </n-space>
        </n-tab-pane>

        <n-tab-pane name="chat" tab="对话">
          <div class="chat-container">
            <div class="messages" ref="messagesRef">
              <div v-for="msg in messages" :key="msg.id" :class="['message', msg.role]">
                <div class="message-content">{{ msg.content }}</div>
                <div class="message-time">{{ msg.time }}</div>
              </div>
            </div>
            <n-input-group>
              <n-input v-model:value="chatInput" placeholder="输入消息..." @keyup.enter="handleSendMessage" />
              <n-button type="primary" @click="handleSendMessage">发送</n-button>
            </n-input-group>
          </div>
        </n-tab-pane>

        <n-tab-pane name="logs" tab="日志">
          <n-log :rows="15" :log="agentLogs" language="log" />
        </n-tab-pane>
      </n-tabs>
    </n-modal>

    <!-- 创建 Agent 弹窗（符合方案：写入workspace人设文件 → agents add） -->
    <n-modal v-model:show="showCreateModal" preset="card" title="新建 Agent" style="width: 600px;">
      <n-form label-placement="left" label-width="100px">
        <n-form-item label="名称" required>
          <n-input v-model:value="createForm.name" placeholder="Agent 名称（如 zhangsan）" />
        </n-form-item>
        <n-form-item label="模型">
          <n-select v-model:value="createForm.model" :options="modelOptions" placeholder="选择模型（可选）" />
        </n-form-item>
        <n-form-item label="人设">
          <n-input
            v-model:value="createForm.persona"
            type="textarea"
            :rows="6"
            placeholder="角色的 AGENTS.md 内容，例如：&#10;你是张三，一个幽默的脱口秀演员，&#10;擅长用段子回答各种问题。"
          />
        </n-form-item>
        <n-form-item label="工作空间">
          <n-input v-model:value="createForm.workspace" placeholder="留空自动生成" disabled />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showCreateModal = false">取消</n-button>
          <n-button type="primary" @click="handleCreateAgent">确定创建</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 编辑 Agent 弹窗（符合方案：改人设写workspace + 改模型直接操作config.json） -->
    <n-modal v-model:show="showEditModal" preset="card" title="编辑 Agent" style="width: 600px;">
      <n-form label-placement="left" label-width="100px">
        <n-form-item label="名称">
          <n-input v-model:value="editForm.name" placeholder="Agent 名称" />
        </n-form-item>
        <n-form-item label="模型">
          <n-select v-model:value="editForm.model" :options="modelOptions" placeholder="修改模型（可选）" />
        </n-form-item>
        <n-form-item label="人设">
          <n-input
            v-model:value="editForm.persona"
            type="textarea"
            :rows="6"
            placeholder="修改角色的 AGENTS.md 人设"
          />
        </n-form-item>
        <n-form-item label="Emoji">
          <n-input v-model:value="editForm.emoji" placeholder="🦞" maxlength="2" />
        </n-form-item>
        <n-form-item label="主题">
          <n-input v-model:value="editForm.theme" placeholder="主题色（如 blue）" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showEditModal = false">取消</n-button>
          <n-button type="primary" @click="handleEditAgent">保存</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 添加技能弹窗 -->
    <n-modal v-model:show="showAddSkill" preset="card" title="添加技能" style="width: 400px;">
      <n-select v-model:value="newSkill" filterable :options="availableSkills" placeholder="选择技能" />
      <template #footer>
        <n-space justify="end">
          <n-button @click="showAddSkill = false">取消</n-button>
          <n-button type="primary" @click="handleAddSkill">确定</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, h, computed, onMounted, onUnmounted } from 'vue'
import {
  NCard,
  NDataTable,
  NButton,
  NSpace,
  NIcon,
  NTag,
  NModal,
  NTabs,
  NTabPane,
  NDescriptions,
  NDescriptionsItem,
  NDivider,
  NInputGroup,
  NInput,
  NLog,
  NForm,
  NFormItem,
  NSelect,
  NSpin,
  NAlert,
  useMessage,
  useDialog,
  type DataTableColumns
} from 'naive-ui'
import {
  AddOutline,
  PlayOutline,
  StopOutline,
  RefreshOutline,
  ChatbubbleOutline,
  TrashOutline,
  SyncOutline
} from '@vicons/ionicons5'
import { api } from '@/api'

interface Agent {
  id: string
  name: string
  description: string
  model: string
  status: 'running' | 'stopped' | 'error'
  skills: string[]
  createdAt: string
  persona?: string
}

interface PendingOp {
  taskId: string
  type: 'create' | 'update' | 'delete'
  message: string
}

const message = useMessage()
const dialog = useDialog()

const agents = ref<Agent[]>([])
const loading = ref(false)
const showDetail = ref(false)
const showCreateModal = ref(false)
const showEditModal = ref(false)
const showAddSkill = ref(false)
const selectedAgent = ref<Agent | null>(null)
const chatInput = ref('')
const messages = ref<any[]>([])
const agentLogs = ref('')

const createForm = ref({ name: '', model: '', workspace: '', persona: '' })
const editForm = ref({ name: '', model: '', persona: '', emoji: '', theme: '' })
const newSkill = ref('')

const modelOptions = ref<{ label: string; value: string }[]>(
  JSON.parse(JSON.stringify([{ label: 'default', value: 'default' }]))
)

const availableSkills = ref<{ label: string; value: string }[]>([])

// ====== 异步任务状态管理 ======
const pendingTasks = ref<Map<string, PendingOp>>(new Map())
let taskPollTimer: ReturnType<typeof setInterval> | null = null

/** 当前是否有任务在跑 */
const hasPendingTasks = computed(() => pendingTasks.value.size > 0)

/**
 * 获取 Agent 在某个操作类型的任务中时返回 'pending'，否则返回原状态
 */
function getAgentStatus(agent: Agent): string {
  if (pendingTasks.value.has(agent.id)) return 'pending'
  return agent.status
}

function getStatusType(status?: string) {
  switch (status) {
    case 'running': return 'success'
    case 'stopped': return 'default'
    case 'error': return 'error'
    case 'pending': return 'warning'
    default: return 'default'
  }
}

function getStatusText(status?: string) {
  switch (status) {
    case 'running': return '运行中'
    case 'stopped': return '已停止'
    case 'error': return '错误'
    case 'pending': return '任务中...'
    default: return '未知'
  }
}

/**
 * 提交异步任务，开始轮询
 */
function submitTask(agentId: string, taskId: string, type: PendingOp['type'], msg: string) {
  pendingTasks.value.set(agentId, { taskId, type, message: msg })
  if (!taskPollTimer) {
    taskPollTimer = setInterval(pollTasks, 2000)
  }
}

/**
 * 轮询所有 pending 任务的状态
 */
async function pollTasks() {
  if (pendingTasks.value.size === 0) {
    if (taskPollTimer) { clearInterval(taskPollTimer); taskPollTimer = null }
    return
  }

  for (const [agentId, op] of pendingTasks.value.entries()) {
    try {
      const result = await api.tasks.get(op.taskId)
      if (result.status === 'success') {
        pendingTasks.value.delete(agentId)
        message.success(`操作完成: ${op.message}`)
        loadAgents()
      } else if (result.status === 'failed') {
        pendingTasks.value.delete(agentId)
        message.error(`操作失败: ${result.error || op.message}`)
        loadAgents()
      }
      // pending / running — 继续等
    } catch {
      // 请求失败暂不处理，下次轮询重试
    }
  }

  if (pendingTasks.value.size === 0 && taskPollTimer) {
    clearInterval(taskPollTimer)
    taskPollTimer = null
  }
}

const columns: DataTableColumns<Agent> = [
  { title: '名称', key: 'name' },
  {
    title: '状态',
    key: 'status',
    width: 120,
    render(row) {
      const effStatus = getAgentStatus(row)
      return h(NSpace, { align: 'center', size: 'small' }, {
        default: () => {
          const items = [h(NTag, { type: getStatusType(effStatus) as any, size: 'small' }, { default: () => getStatusText(effStatus) })]
          if (effStatus === 'pending') {
            items.push(h(NSpin, { size: 'small' }))
          }
          return items
        }
      })
    }
  },
  { title: '模型', key: 'model', width: 120 },
  {
    title: '技能数',
    key: 'skills',
    width: 100,
    render(row) { return (row.skills?.length || 0) }
  },
  { title: '创建时间', key: 'createdAt', width: 180, render(row) { return row.createdAt || '-' } },
  {
    title: '操作',
    key: 'actions',
    width: 300,
    render(row) {
      const isPending = pendingTasks.value.has(row.id)
      return h(NSpace, null, {
        default: () => [
          h(NButton, {
            size: 'small',
            quaternary: true,
            disabled: isPending,
            onClick: () => handleView(row)
          }, { icon: () => h(NIcon, { component: ChatbubbleOutline }) }),
          row.status === 'running' ?
            h(NButton, {
              size: 'small',
              quaternary: true,
              disabled: isPending,
              onClick: () => handleStop(row)
            }, { icon: () => h(NIcon, { component: StopOutline }) }) :
            h(NButton, {
              size: 'small',
              quaternary: true,
              disabled: isPending,
              onClick: () => handleStart(row)
            }, { icon: () => h(NIcon, { component: PlayOutline }) }),
          h(NButton, {
            size: 'small',
            quaternary: true,
            disabled: isPending,
            onClick: () => handleRestart(row)
          }, { icon: () => h(NIcon, { component: RefreshOutline }) }),
          h(NButton, {
            size: 'small',
            quaternary: true,
            disabled: isPending,
            onClick: () => handleDelete(row)
          }, { icon: () => h(NIcon, { component: TrashOutline }) })
        ]
      })
    }
  }
]

function getStatusType(status?: string) {
  switch (status) {
    case 'running': return 'success'
    case 'stopped': return 'default'
    case 'error': return 'error'
    default: return 'default'
  }
}

function getStatusText(status?: string) {
  switch (status) {
    case 'running': return '运行中'
    case 'stopped': return '已停止'
    case 'error': return '错误'
    default: return '未知'
  }
}

onMounted(() => {
  loadAgents()
  loadModels()
  loadAvailableSkills()
})

async function loadAgents() {
  loading.value = true
  try {
    agents.value = await api.agents.list()
  } catch (err) {
    message.error('加载 Agent 列表失败')
  } finally {
    loading.value = false
  }
}

async function loadModels() {
  try {
    const models = await api.agents.models()
    modelOptions.value = [
      { label: 'default', value: 'default' },
      ...models.map((m: any) => ({
        label: `${m.name} (${m.provider})`,
        value: m.id
      }))
    ]
  } catch {}
}

async function loadAvailableSkills() {
  try {
    const skills = await api.skills.installed()
    availableSkills.value = skills.map((s: any) => ({
      label: s.nameZh || s.name || s.id,
      value: s.id || s.name
    }))
  } catch {}
}

function handleView(agent: Agent) {
  selectedAgent.value = agent
  messages.value = []
  chatInput.value = ''
  agentLogs.value = `[INFO] Agent ${agent.name} loaded\n[INFO] Status: ${agent.status}\n[INFO] Model: ${agent.model}`
  showDetail.value = true
}

function openEditModal() {
  if (!selectedAgent.value) return
  editForm.value = {
    name: selectedAgent.value.name,
    model: selectedAgent.value.model,
    persona: selectedAgent.value.persona || '',
    emoji: '',
    theme: ''
  }
  showEditModal.value = true
}

async function handleStart(agent: Agent) {
  try {
    await api.agents.start(agent.id)
    agent.status = 'running'
    message.success('Agent 已启动')
  } catch (err: any) {
    message.error(err?.error || '启动失败')
  }
}

async function handleStop(agent: Agent) {
  try {
    await api.agents.stop(agent.id)
    agent.status = 'stopped'
    message.success('Agent 已停止')
  } catch (err: any) {
    message.error(err?.error || '停止失败')
  }
}

async function handleRestart(agent: Agent) {
  try {
    await api.agents.restart(agent.id)
    agent.status = 'running'
    message.success('Agent 已重启')
  } catch (err: any) {
    message.error(err?.error || '重启失败')
  }
}

function handleDelete(agent: Agent) {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除 Agent「${agent.name}」吗？此操作不可撤消。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        // 改成异步任务 + 轮询
        const result = await api.agents.delete(agent.id)
        if (result.taskId) {
          submitTask(agent.id, result.taskId, 'delete', '删除 Agent')
          message.info('删除任务已提交，正在处理...')
        } else {
          // 兼容非异步响应
          message.success('Agent 已删除')
          loadAgents()
        }
      } catch (err: any) {
        message.error(err?.error || '删除失败')
      }
    }
  })
}

async function handleCreateAgent() {
  if (!createForm.value.name) {
    message.error('请输入 Agent 名称')
    return
  }
  try {
    const result = await api.agents.create(createForm.value.name, {
      model: createForm.value.model || undefined,
      workspace: createForm.value.workspace || undefined,
      persona: createForm.value.persona || undefined
    })
    if (result.taskId) {
      // 异步任务模式
      const agentName = createForm.value.name
      submitTask(agentName, result.taskId, 'create', '创建 Agent')
      message.info('创建任务已提交，正在处理...')
      showCreateModal.value = false
      createForm.value = { name: '', model: '', workspace: '', persona: '' }
    } else {
      // 兼容非异步响应
      message.success(`Agent「${result.name}」创建成功`)
      showCreateModal.value = false
      createForm.value = { name: '', model: '', workspace: '', persona: '' }
      loadAgents()
    }
  } catch (err: any) {
    const msg = err?.error || err?.message || '创建失败'
    message.error(msg)
  }
}

async function handleEditAgent() {
  if (!selectedAgent.value) return
  try {
    const result = await api.agents.update(selectedAgent.value.id, {
      name: editForm.value.name || undefined,
      model: editForm.value.model || undefined,
      persona: editForm.value.persona || undefined,
      emoji: editForm.value.emoji || undefined,
      theme: editForm.value.theme || undefined
    })
    if (result.taskId) {
      // 异步任务模式
      submitTask(selectedAgent.value.id, result.taskId, 'update', '更新 Agent')
      message.info('更新任务已提交，正在处理...')
      showEditModal.value = false
    } else {
      // 兼容非异步响应
      message.success('Agent 信息已更新')
      showEditModal.value = false
      loadAgents()
    }
  } catch (err: any) {
    const msg = err?.error || err?.message || '更新失败'
    message.error(msg)
  }
}

function handleRemoveSkill(skill: string) {
  if (!selectedAgent.value) return
  const idx = selectedAgent.value.skills.indexOf(skill)
  if (idx !== -1) {
    selectedAgent.value.skills.splice(idx, 1)
    message.success(`已移除技能「${skill}」`)
  }
}

async function handleAddSkill() {
  if (!newSkill.value || !selectedAgent.value) return
  // 通过真实API安装技能
  try {
    await api.skills.install(newSkill.value)
    selectedAgent.value.skills.push(newSkill.value)
    message.success(`技能「${newSkill.value}」已安装`)
  } catch (err: any) {
    const msg = err?.error || err?.message || '安装失败'
    message.error(msg)
  }
  newSkill.value = ''
  showAddSkill.value = false
}

async function handleSendMessage() {
  if (!chatInput.value.trim()) return
  const text = chatInput.value
  messages.value.push({
    id: Date.now(),
    role: 'user',
    content: text,
    time: new Date().toLocaleTimeString()
  })
  chatInput.value = ''

  try {
    if (selectedAgent.value) {
      const result = await api.agents.chat(selectedAgent.value.id, text)
      messages.value.push({
        id: Date.now(),
        role: 'assistant',
        content: result.response || 'Agent 没有返回内容',
        time: new Date().toLocaleTimeString()
      })
    }
  } catch (err: any) {
    messages.value.push({
      id: Date.now(),
      role: 'assistant',
      content: err?.error || '发送失败，请重试',
      time: new Date().toLocaleTimeString()
    })
  }
}
</script>

<style scoped>
.agents-page {
  height: 100%;
}

.chat-container {
  display: flex;
  flex-direction: column;
  height: 400px;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: var(--n-color);
  border-radius: 4px;
  margin-bottom: 12px;
}

.message {
  margin-bottom: 12px;
}

.message.user {
  text-align: right;
}

.message-content {
  display: inline-block;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--n-color-hover);
}

.message.user .message-content {
  background: #18a058;
  color: white;
}

.message-time {
  font-size: 12px;
  color: var(--n-text-color-3);
  margin-top: 4px;
}
</style>
