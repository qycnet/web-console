<template>
  <div class="agents-page">
    <n-card title="Agent 管理">
      <template #header-extra>
        <n-button type="primary" @click="handleCreate">
          <template #icon><n-icon :component="AddOutline" /></template>
          新建 Agent
        </n-button>
      </template>

      <n-data-table
        :columns="columns"
        :data="agents"
        :loading="loading"
        :row-key="(row: Agent) => row.id"
      />
    </n-card>

    <!-- Agent 详情/对话弹窗 -->
    <n-modal v-model:show="showDetail" preset="card" style="width: 900px; height: 600px;">
      <template #header>
        <n-space align="center">
          <span>{{ selectedAgent?.name }}</span>
          <n-tag :type="getStatusType(selectedAgent?.status)">
            {{ getStatusText(selectedAgent?.status) }}
          </n-tag>
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
            <n-descriptions-item label="创建时间">{{ selectedAgent?.createdAt }}</n-descriptions-item>
            <n-descriptions-item label="描述" :span="2">
              {{ selectedAgent?.description }}
            </n-descriptions-item>
          </n-descriptions>

          <n-divider>已安装技能</n-divider>
          <n-space>
            <n-tag v-for="skill in selectedAgent?.skills" :key="skill">
              {{ skill }}
            </n-tag>
          </n-space>
        </n-tab-pane>

        <n-tab-pane name="chat" tab="对话">
          <div class="chat-container">
            <div class="messages" ref="messagesRef">
              <div
                v-for="msg in messages"
                :key="msg.id"
                :class="['message', msg.role]"
              >
                <div class="message-content">{{ msg.content }}</div>
                <div class="message-time">{{ msg.time }}</div>
              </div>
            </div>
            <n-input-group>
              <n-input
                v-model:value="chatInput"
                placeholder="输入消息..."
                @keyup.enter="handleSendMessage"
              />
              <n-button type="primary" @click="handleSendMessage">发送</n-button>
            </n-input-group>
          </div>
        </n-tab-pane>

        <n-tab-pane name="logs" tab="日志">
          <n-log
            :rows="15"
            :log="agentLogs"
            language="log"
          />
        </n-tab-pane>
      </n-tabs>
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
  useMessage,
  type DataTableColumns
} from 'naive-ui'
import {
  AddOutline,
  PlayOutline,
  StopOutline,
  RefreshOutline,
  ChatbubbleOutline,
  TrashOutline
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

const agents = ref<Agent[]>([])
const loading = ref(false)
const showDetail = ref(false)
const selectedAgent = ref<Agent | null>(null)
const chatInput = ref('')
const messages = ref<any[]>([])
const agentLogs = ref('')

const columns: DataTableColumns<Agent> = [
  { title: '名称', key: 'name' },
  {
    title: '状态',
    key: 'status',
    render(row) {
      return h(NTag, { type: getStatusType(row.status) }, { default: () => getStatusText(row.status) })
    }
  },
  { title: '模型', key: 'model' },
  { title: '创建时间', key: 'createdAt' },
  {
    title: '操作',
    key: 'actions',
    width: 280,
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

onMounted(loadAgents)

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

function handleView(agent: Agent) {
  selectedAgent.value = agent
  showDetail.value = true
  // 加载日志
  agentLogs.value = `[INFO] Agent ${agent.name} started...\n[INFO] Loading skills...\n[INFO] Ready.`
}

async function handleStart(agent: Agent) {
  try {
    await api.agents.start(agent.id)
    agent.status = 'running'
    message.success('Agent 已启动')
  } catch (err) {
    message.error('启动失败')
  }
}

async function handleStop(agent: Agent) {
  try {
    await api.agents.stop(agent.id)
    agent.status = 'stopped'
    message.success('Agent 已停止')
  } catch (err) {
    message.error('停止失败')
  }
}

async function handleRestart(agent: Agent) {
  try {
    await api.agents.restart(agent.id)
    agent.status = 'running'
    message.success('Agent 已重启')
  } catch (err) {
    message.error('重启失败')
  }
}

function handleDelete(_agent: Agent) {
  message.info('删除功能开发中...')
}

function handleCreate() {
  message.info('创建 Agent 功能开发中...')
}

function handleSendMessage() {
  if (!chatInput.value.trim()) return
  messages.value.push({
    id: Date.now(),
    role: 'user',
    content: chatInput.value,
    time: new Date().toLocaleTimeString()
  })
  chatInput.value = ''
  // 模拟回复
  setTimeout(() => {
    messages.value.push({
      id: Date.now(),
      role: 'assistant',
      content: '收到您的消息，正在处理...',
      time: new Date().toLocaleTimeString()
    })
  }, 500)
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
