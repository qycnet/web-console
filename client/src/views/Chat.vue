<template>
  <div class="chat-page">
    <ChatHeader
      @new-chat="showAgentSelector = true"
      @group-chat="showGroupChat = true"
      @minimize="chatStore.toggleMinimize()"
    />
    <ChatTabBar
      v-if="chatStore.tabs.length > 0"
      :tabs="chatStore.tabs"
      :active-tab-id="chatStore.activeTabId"
      @switch-tab="chatStore.switchTab"
      @close-tab="chatStore.closeTab"
    />
    <ChatPanel
      v-if="chatStore.activeTab && chatStore.activeTabId"
      :messages="chatStore.activeTab.messages"
      :input-text="chatStore.activeTab.inputText"
      :is-streaming="chatStore.activeTab.isStreaming"
      :agent-name="chatStore.activeTab.agentName"
      @update:input-text="chatStore.activeTab!.inputText = $event"
      @send="handleSend"
    />
    <div v-else class="no-chat">
      <div class="no-chat-icon">💬</div>
      <div class="no-chat-text">选择一个 Agent 开始对话</div>
      <n-button type="primary" @click="showAgentSelector = true">
        <template #icon><n-icon :component="AddOutline" /></template>
        新建对话
      </n-button>
    </div>
    <AgentSelector v-model:visible="showAgentSelector" @select="selectAgent" />
    <GroupChatSelector v-model:visible="showGroupChat" @create="createGroupChat" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NButton, NIcon, useMessage } from 'naive-ui'
import { AddOutline } from '@vicons/ionicons5'
import { api } from '@/api'
import { useChatStore } from '@/stores/chat'
import ChatHeader from '@/components/ChatHeader.vue'
import ChatTabBar from '@/components/ChatTabBar.vue'
import ChatPanel from '@/components/ChatPanel.vue'
import AgentSelector from '@/components/AgentSelector.vue'
import GroupChatSelector from '@/components/GroupChatSelector.vue'

const chatStore = useChatStore()
const route = useRoute()
const message = useMessage()

const showAgentSelector = ref(false)
const showGroupChat = ref(false)

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
}

function createGroupChat(agents: Array<{ id: string; name: string }>) {
  chatStore.openGroupTab(agents)
}

function handleSend() {
  if (!chatStore.activeTab) return
  chatStore.sendMessage(chatStore.activeTab.id).catch(() => {
    message.error('发送失败')
  })
}
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
</style>
