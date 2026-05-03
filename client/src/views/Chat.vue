<template>
  <div class="chat-page">
    <!-- 对话 Tab 栏 -->
    <div class="chat-tab-bar">
      <div class="tab-list">
        <div
          v-for="tab in chatStore.tabs"
          :key="tab.id"
          :class="['tab-item', { active: tab.id === chatStore.activeTabId }]"
          @click="chatStore.switchTab(tab.id)"
        >
          <span class="tab-name">{{ tab.agentName }}</span>
          <span v-if="tab.unreadCount > 0" class="tab-badge">{{ tab.unreadCount }}</span>
          <button class="tab-close" @click.stop="chatStore.closeTab(tab.id)">&times;</button>
        </div>
      </div>
      <div class="tab-actions">
        <n-button size="tiny" quaternary @click="showAgentSelector = true">
          <template #icon><n-icon :component="AddOutline" /></template>
          新建对话
        </n-button>
      </div>
    </div>

    <!-- 对话面板 -->
    <div v-if="chatStore.activeTab && chatStore.activeTabId" class="chat-panel">
      <div class="messages" ref="messagesRef">
        <div
          v-for="msg in chatStore.activeTab.messages"
          :key="msg.id"
          :class="['message', msg.role]"
        >
          <div class="message-avatar">{{ msg.role === 'user' ? '👤' : '🤖' }}</div>
          <div class="message-bubble">
            <div class="message-content">
              {{ msg.content }}
              <span
                v-if="msg.role === 'assistant' && msg === chatStore.activeTab.messages[chatStore.activeTab.messages.length - 1] && chatStore.activeTab.isStreaming"
                class="cursor-blink"
              >▍</span>
            </div>
            <div class="message-time">{{ msg.time }}</div>
          </div>
        </div>
        <div v-if="chatStore.activeTab.messages.length === 0" class="empty-state">
          <div class="empty-icon">💬</div>
          <div class="empty-text">开始与 {{ chatStore.activeTab.agentName }} 对话</div>
          <div class="empty-hint">输入消息并按 Enter 发送</div>
        </div>
      </div>

      <div class="input-bar">
        <div class="input-wrapper">
          <n-input
            v-model:value="chatStore.activeTab.inputText"
            type="textarea"
            :rows="2"
            placeholder="输入消息..."
            :disabled="chatStore.activeTab.isStreaming"
            @keydown.enter.prevent="handleSend"
          />
        </div>
        <n-button
          type="primary"
          :disabled="!chatStore.activeTab.inputText.trim() || chatStore.activeTab.isStreaming"
          :loading="chatStore.activeTab.isStreaming"
          @click="handleSend"
        >
          发送
        </n-button>
      </div>
    </div>

    <!-- 未选择对话时 -->
    <div v-else class="no-chat">
      <div class="no-chat-icon">💬</div>
      <div class="no-chat-text">选择一个 Agent 开始对话</div>
      <n-button type="primary" @click="showAgentSelector = true">
        <template #icon><n-icon :component="AddOutline" /></template>
        新建对话
      </n-button>
    </div>

    <!-- Agent 选择弹窗 -->
    <n-modal v-model:show="showAgentSelector" preset="card" title="选择 Agent" style="width: 400px;">
      <n-input v-model:value="searchText" placeholder="搜索 Agent..." style="margin-bottom: 12px;" />
      <div class="agent-list">
        <div
          v-for="agent in filteredAgents"
          :key="agent.id"
          class="agent-item"
          @click="selectAgent(agent)"
        >
          <span class="agent-name">{{ agent.name }}</span>
          <n-tag size="tiny" :type="agent.status === 'running' ? 'success' : 'default'">
            {{ agent.status === 'running' ? '运行中' : '已停止' }}
          </n-tag>
        </div>
        <div v-if="filteredAgents.length === 0" class="agent-empty">暂无匹配的 Agent</div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NIcon, NInput, NTag, NModal, useMessage } from 'naive-ui'
import { AddOutline } from '@vicons/ionicons5'
import { useChatStore } from '@/stores/chat'
import { api } from '@/api'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const chatStore = useChatStore()

const showAgentSelector = ref(false)
const searchText = ref('')
const agents = ref<any[]>([])
const messagesRef = ref<HTMLElement | null>(null)

const filteredAgents = computed(() => {
  const kw = searchText.value.toLowerCase()
  return agents.value.filter(
    (a: any) => a.name.toLowerCase().includes(kw) || a.id.toLowerCase().includes(kw)
  )
})

// 从 query 参数打开指定 Agent
watch(
  () => route.query,
  (query) => {
    if (query.agentId && typeof query.agentId === 'string') {
      loadAgentAndOpen(query.agentId)
    }
  },
  { immediate: true }
)

// 滚动到底部
watch(
  () => chatStore.activeTab?.messages.length,
  async () => {
    await nextTick()
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  }
)

async function loadAgents() {
  try {
    agents.value = await api.agents.list()
  } catch {
    // ignore
  }
}

async function loadAgentAndOpen(agentId: string) {
  try {
    const agent = await api.agents.get(agentId)
    if (agent) {
      chatStore.openTab(agent.id, agent.name)
    }
  } catch {
    message.error('Agent 不存在')
  }
}

function selectAgent(agent: any) {
  chatStore.openTab(agent.id, agent.name)
  showAgentSelector.value = false
  searchText.value = ''
}

function handleSend() {
  if (!chatStore.activeTab) return
  chatStore.sendMessage(chatStore.activeTab.id).catch(() => {
    message.error('发送失败')
  })
}

onMounted(() => {
  loadAgents()
})
</script>

<style scoped>
.chat-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--n-color);
  border-radius: 8px;
  overflow: hidden;
}

.chat-tab-bar {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--n-divider-color);
  background: var(--n-color-embedded);
  gap: 8px;
}

.tab-list {
  display: flex;
  gap: 4px;
  flex: 1;
  overflow-x: auto;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  color: var(--n-text-color-3);
  transition: all 0.2s;
  position: relative;
}

.tab-item:hover {
  background: var(--n-color-hover);
  color: var(--n-text-color);
}

.tab-item.active {
  background: var(--n-primary-color);
  color: white;
}

.tab-badge {
  background: #f5222d;
  color: white;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 8px;
  min-width: 16px;
  text-align: center;
}

.tab-close {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  opacity: 0.5;
  line-height: 1;
  color: inherit;
}

.tab-close:hover {
  opacity: 1;
}

.tab-actions {
  flex-shrink: 0;
}

.chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.message {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
  align-items: flex-start;
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  background: var(--n-color-embedded);
  flex-shrink: 0;
}

.message-bubble {
  max-width: 70%;
}

.message.user .message-bubble {
  text-align: right;
}

.message-content {
  display: inline-block;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--n-color-hover);
  line-height: 1.6;
  font-size: 14px;
  white-space: pre-wrap;
  word-break: break-word;
}

.message.user .message-content {
  background: #18a058;
  color: white;
}

.message-time {
  font-size: 11px;
  color: var(--n-text-color-3);
  margin-top: 4px;
  padding: 0 4px;
}

.input-bar {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--n-divider-color);
  background: var(--n-color-embedded);
  align-items: flex-end;
}

.input-wrapper {
  flex: 1;
}

.no-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--n-text-color-3);
}

.no-chat-icon {
  font-size: 48px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--n-text-color-3);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 16px;
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 13px;
  opacity: 0.6;
}

.agent-list {
  max-height: 300px;
  overflow-y: auto;
}

.agent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.2s;
}

.agent-item:hover {
  background: var(--n-color-hover);
}

.agent-name {
  font-weight: 500;
}

.agent-empty {
  text-align: center;
  padding: 20px;
  color: var(--n-text-color-3);
}

.cursor-blink {
  animation: blink 1s step-end infinite;
  color: #18a058;
}

@keyframes blink {
  50% { opacity: 0; }
}
</style>
