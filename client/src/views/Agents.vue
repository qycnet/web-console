<template>
  <div class="agents-page">
    <n-card title="Agent 管理">
      <template #header-extra>
        <n-button type="primary" @click="showCreateModal = true">
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

    <!-- 创建 Agent 弹窗 -->
    <n-modal v-model:show="showCreateModal" preset="card" title="新建 Agent" style="width: 500px;">
      <n-form label-placement="left" label-width="100px">
        <n-form-item label="名称">
          <n-input v-model:value="createForm.name" placeholder="Agent 名称" />
        </n-form-item>
        <n-form-item label="模型">
          <n-select v-model:value="createForm.model" :options="modelOptions" placeholder="选择模型" />
        </n-form-item>
        <n-form-item label="工作空间">
          <n-input v-model:value="createForm.workspace" placeholder="工作空间路径（可选）" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showCreateModal = false">取消</n-button>
          <n-button type="primary" @click="handleCreateAgent">确定创建</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 编辑 Agent 弹窗 -->
    <n-modal v-model:show="showEditModal" preset="card" title="编辑 Agent" style="width: 500px;">
      <n-form label-placement="left" label-width="100px">
        <n-form-item label="名称">
          <n-input v-model:value="editForm.name" placeholder="Agent 名称" />
        </n-form-item>
        <n-form-item label="Emoji">
          <n-input v-model:value="editForm.emoji" placeholder="🦞" maxlength="2" />
        </n-form-item>
        <n-form-item label="主题">
          <n-input v-model:value="editForm.theme" placeholder="主题色" />
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
import { ref, h, onMounted } from 'vue'
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
  CreateOutline
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

const createForm = ref({ name: '', model: '', workspace: '' })
const editForm = ref({ name: '', emoji: '', theme: '' })
const newSkill = ref('')

const modelOptions = [
  { label: 'default', value: 'default' }
]

const availableSkills = ref<{ label: string; value: string }[]>([])

const columns: DataTableColumns<Agent> = [
  { title: '名称', key: 'name' },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render(row) {
      return h(NTag, { type: getStatusType(row.status) }, { default: () => getStatusText(row.status) })
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
      return h(NSpace, null, {
        default: () => [
          h(NButton, {
            size: 'small',
            quaternary: true,
            onClick: () => handleView(row)
          }, { icon: () => h(NIcon, { component: ChatbubbleOutline }) }),
          row.status === 'running' ?
            h(NButton, {
              size: 'small',
              quaternary: true,
              onClick: () => handleStop(row)
            }, { icon: () => h(NIcon, { component: StopOutline }) }) :
            h(NButton, {
              size: 'small',
              quaternary: true,
              onClick: () => handleStart(row)
            }, { icon: () => h(NIcon, { component: PlayOutline }) }),
          h(NButton, {
            size: 'small',
            quaternary: true,
            onClick: () => handleRestart(row)
          }, { icon: () => h(NIcon, { component: RefreshOutline }) }),
          h(NButton, {
            size: 'small',
            quaternary: true,
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
        await api.agents.delete(agent.id)
        message.success('Agent 已删除')
        loadAgents()
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
      workspace: createForm.value.workspace || undefined
    })
    message.success(`Agent「${result.name}」创建成功`)
    showCreateModal.value = false
    createForm.value = { name: '', model: '', workspace: '' }
    loadAgents()
  } catch (err: any) {
    message.error(err?.error || '创建失败')
  }
}

async function handleEditAgent() {
  if (!selectedAgent.value) return
  try {
    await api.agents.update(selectedAgent.value.id, {
      name: editForm.value.name || undefined,
      emoji: editForm.value.emoji || undefined,
      theme: editForm.value.theme || undefined
    })
    message.success('Agent 信息已更新')
    showEditModal.value = false
    loadAgents()
  } catch (err: any) {
    message.error(err?.error || '更新失败')
  }
}

function handleRemoveSkill(_skill: string) {
  message.info('移除技能功能开发中...')
}

async function handleAddSkill() {
  if (!newSkill.value || !selectedAgent.value) return
  selectedAgent.value.skills.push(newSkill.value)
  newSkill.value = ''
  showAddSkill.value = false
  message.success('技能已添加')
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
