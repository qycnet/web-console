<template>
  <div class="chat-tab-bar">
    <div class="tab-list">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab-item', { active: tab.id === activeTabId }]"
        @click="$emit('switch-tab', tab.id)"
      >
        <span class="tab-name">{{ tab.agentName }}</span>
        <span v-if="tab.unreadCount > 0" class="tab-badge">{{ tab.unreadCount }}</span>
        <button class="tab-close" @click.stop="$emit('close-tab', tab.id)">&times;</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatTab } from '@/stores/chat'

defineProps<{
  tabs: ChatTab[]
  activeTabId: string
}>()

defineEmits<{
  'switch-tab': [id: string]
  'close-tab': [id: string]
}>()
</script>

<style scoped>
.chat-tab-bar {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  border-bottom: 1px solid var(--n-divider-color);
  background: var(--n-color-embedded);
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
</style>
