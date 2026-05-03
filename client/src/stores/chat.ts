import { defineStore } from 'pinia'
import { api } from '@/api'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  time: string
}

export interface ChatTab {
  id: string
  agentId: string
  agentName: string
  sessionId: string
  messages: ChatMessage[]
  inputText: string
  isStreaming: boolean
  unreadCount: number
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    tabs: [] as ChatTab[],
    activeTabId: '',
    isMinimized: false
  }),

  getters: {
    activeTab(state): ChatTab | undefined {
      return state.tabs.find(t => t.id === state.activeTabId)
    },
    totalUnread(state): number {
      return state.tabs.reduce((sum, t) => sum + t.unreadCount, 0)
    }
  },

  actions: {
    openTab(agentId: string, agentName: string) {
      // 如果已有该 agent 的 tab，直接切换
      const existing = this.tabs.find(t => t.agentId === agentId)
      if (existing) {
        existing.unreadCount = 0
        this.activeTabId = existing.id
        this.isMinimized = false
        return
      }

      const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const newTab: ChatTab = {
        id: tabId,
        agentId,
        agentName,
        sessionId: '',
        messages: [],
        inputText: '',
        isStreaming: false,
        unreadCount: 0
      }
      this.tabs.push(newTab)
      this.activeTabId = tabId
      this.isMinimized = false
    },

    closeTab(tabId: string) {
      const idx = this.tabs.findIndex(t => t.id === tabId)
      if (idx === -1) return
      this.tabs.splice(idx, 1)
      if (this.activeTabId === tabId) {
        this.activeTabId = this.tabs.length > 0 ? this.tabs[Math.max(0, idx - 1)].id : ''
      }
    },

    switchTab(tabId: string) {
      this.activeTabId = tabId
      const tab = this.tabs.find(t => t.id === tabId)
      if (tab) tab.unreadCount = 0
    },

    async sendMessage(tabId: string) {
      const tab = this.tabs.find(t => t.id === tabId)
      if (!tab || !tab.inputText.trim() || tab.isStreaming) return

      const text = tab.inputText
      tab.messages.push({
        id: Date.now(),
        role: 'user',
        content: text,
        time: new Date().toLocaleTimeString()
      })
      tab.inputText = ''
      tab.isStreaming = true

      const msgId = Date.now() + 1
      tab.messages.push({
        id: msgId,
        role: 'assistant',
        content: '',
        time: new Date().toLocaleTimeString()
      })

      let currentReply = ''
      let eventSource: EventSource | null = null

      eventSource = api.agents.stream(
        tab.agentId,
        text,
        tab.sessionId,
        (token) => {
          currentReply += token
          const lastMsg = tab.messages[tab.messages.length - 1]
          if (lastMsg && lastMsg.role === 'assistant') {
            lastMsg.content = currentReply
          }
        },
        (sid) => {
          tab.sessionId = sid
        },
        () => {
          tab.isStreaming = false
          if (eventSource) { eventSource.close(); eventSource = null }
          if (!currentReply) {
            const lastMsg = tab.messages[tab.messages.length - 1]
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.content = 'Agent 没有返回内容'
            }
          }
        },
        (err) => {
          tab.isStreaming = false
          if (eventSource) { eventSource.close(); eventSource = null }
          const lastMsg = tab.messages[tab.messages.length - 1]
          if (lastMsg && lastMsg.role === 'assistant') {
            lastMsg.content = typeof err === 'string' ? err : (err?.error || '发送失败，请重试')
          }
        }
      )
    },

    toggleMinimize() {
      this.isMinimized = !this.isMinimized
      if (this.isMinimized && this.activeTab) {
        const tab = this.tabs.find(t => t.id === this.activeTabId)
        if (tab) tab.unreadCount = 0
      }
    }
  },

  // 持久化到 localStorage
  persist: {
    key: 'chat-state',
    storage: localStorage,
    paths: ['tabs', 'activeTabId', 'isMinimized']
  }
})
