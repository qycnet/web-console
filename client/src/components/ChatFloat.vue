<template>
  <transition name="float-fade">
    <div v-if="chatStore.isMinimized && chatStore.tabs.length > 0" class="chat-float" @click="restore">
      <div class="float-icon">💬</div>
      <div v-if="chatStore.totalUnread > 0" class="float-badge">{{ chatStore.totalUnread > 99 ? '99+' : chatStore.totalUnread }}</div>
      <div class="float-tooltip">点击打开对话</div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()

function restore() {
  // 如果有活跃 tab 则还原，否则打开第一个 tab
  if (!chatStore.activeTabId && chatStore.tabs.length > 0) {
    chatStore.switchTab(chatStore.tabs[0].id)
  }
  chatStore.isMinimized = false
}
</script>

<style scoped>
.chat-float {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #7c3aed, #3b82f6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  z-index: 9999;
  transition: transform 0.2s, box-shadow 0.2s;
  user-select: none;
}

.chat-float:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
}

.float-icon {
  font-size: 24px;
  line-height: 1;
}

.float-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #f5222d;
  color: white;
  font-size: 11px;
  font-weight: 700;
  min-width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  padding: 0 5px;
  box-shadow: 0 2px 6px rgba(245, 34, 45, 0.4);
}

.float-tooltip {
  position: absolute;
  right: 64px;
  background: rgba(0, 0, 0, 0.75);
  color: white;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

.chat-float:hover .float-tooltip {
  opacity: 1;
}

.float-fade-enter-active,
.float-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.float-fade-enter-from,
.float-fade-leave-to {
  opacity: 0;
  transform: scale(0.5);
}
</style>
