<template>
  <div class="chat-panel">
    <!-- 消息列表 -->
    <div class="messages" ref="messagesRef">
      <div
        v-for="msg in messages"
        :key="msg.id"
        :class="['message', msg.role]"
      >
        <div class="message-avatar">{{ msg.role === 'user' ? '👤' : '🤖' }}</div>
        <div class="message-bubble">
          <div v-if="msg.agentName" class="message-agent-name">{{ msg.agentName }}</div>
          <div class="message-content">
            {{ msg.content }}
            <span
              v-if="msg.role === 'assistant' && msg === messages[messages.length - 1] && isStreaming"
              class="cursor-blink"
            >▍</span>
          </div>
          <div class="message-time">{{ msg.time }}</div>
        </div>
      </div>
      <div v-if="messages.length === 0" class="empty-state">
        <div class="empty-icon">💬</div>
        <div class="empty-text">开始与 {{ agentName }} 对话</div>
        <div class="empty-hint">输入消息并按 Enter 发送</div>
      </div>
    </div>

    <!-- 输入栏 -->
    <div class="input-bar">
      <div class="input-wrapper">
        <n-input
          :value="inputText"
          type="textarea"
          :rows="2"
          placeholder="输入消息..."
          :disabled="isStreaming"
          @update:value="$emit('update:inputText', $event)"
          @keydown.enter.prevent="$emit('send')"
        />
      </div>
      <n-button
        type="primary"
        :disabled="!inputText.trim() || isStreaming"
        :loading="isStreaming"
        @click="$emit('send')"
      >
        发送
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { NButton, NInput } from 'naive-ui'
import type { ChatMessage } from '@/stores/chat'

const props = defineProps<{
  messages: ChatMessage[]
  inputText: string
  isStreaming: boolean
  agentName: string
}>()

defineEmits<{
  'send': []
  'update:inputText': [value: string]
}>()

const messagesRef = ref<HTMLElement | null>(null)

watch(
  () => props.messages.length,
  async () => {
    await nextTick()
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  }
)
</script>

<style scoped>
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

.message-agent-name {
  font-size: 12px;
  font-weight: 600;
  color: #7c3aed;
  margin-bottom: 4px;
  padding: 0 2px;
}

.message.user .message-agent-name {
  color: #18a058;
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

.cursor-blink {
  animation: blink 1s step-end infinite;
  color: #18a058;
}

@keyframes blink {
  50% { opacity: 0; }
}
</style>
