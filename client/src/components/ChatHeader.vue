<template>
  <div class="chat-header">
    <div class="header-title">
      <span class="title-icon">💬</span>
      <span class="title-text">对话</span>
    </div>
    <div class="header-actions">
      <n-button size="tiny" quaternary @click="$emit('new-chat')">
        <template #icon><n-icon :component="ChatbubbleOutline" /></template>
        单独
      </n-button>
      <n-button size="tiny" quaternary @click="$emit('group-chat')">
        <template #icon><n-icon :component="PeopleOutline" /></template>
        群聊
      </n-button>
      <n-button size="tiny" quaternary @click="$emit('minimize')" title="最小化">
        <template #icon><n-icon :component="RemoveOutline" /></template>
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NButton, NIcon } from 'naive-ui'
import { ChatbubbleOutline, PeopleOutline, RemoveOutline } from '@vicons/ionicons5'

defineEmits<{
  'new-chat': []
  'group-chat': []
  'minimize': []
}>()
</script>

<style scoped>
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--n-divider-color);
  background: var(--n-color-embedded);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 14px;
}

.title-icon {
  font-size: 16px;
}

.header-actions {
  display: flex;
  gap: 4px;
}
</style>
