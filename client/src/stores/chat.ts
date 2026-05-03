import { defineStore } from 'pinia'
import { api } from '@/api'
import axios from 'axios'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  time: string
  agentId?: string     // 群聊时标识消息来自哪个 agent
  agentName?: string   // 群聊时 agent 名称
  isGroupToken?: boolean // 群聊流式 token 标记
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
  isGroup?: boolean       // 是否是群聊
  agentIds?: string[]     // 群聊时参与的所有 agent
  agentNames?: string[]   // 群聊时参与的所有 agent 名称
  groupAgents?: GroupAgentState[] // 群聊各 agent 的流式状态
}

interface GroupAgentState {
  agentId: string
  agentName: string
  content: string
  done: boolean
  error?: string
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
      const existing = this.tabs.find(t => t.agentId === agentId && !t.isGroup)
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

    openGroupTab(agents: { id: string; name: string }[]) {
      const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const groupName = `群聊: ${agents.map(a => a.name).join(' + ')}`
      const newTab: ChatTab = {
        id: groupId,
        agentId: agents.map(a => a.id).join(','),
        agentName: groupName,
        agentIds: agents.map(a => a.id),
        agentNames: agents.map(a => a.name),
        groupAgents: agents.map(a => ({ agentId: a.id, agentName: a.name, content: '', done: false })),
        sessionId: '',
        messages: [],
        inputText: '',
        isStreaming: false,
        isGroup: true,
        unreadCount: 0
      }
      this.tabs.push(newTab)
      this.activeTabId = groupId
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

      // 群聊走独立逻辑
      if (tab.isGroup) {
        return this.sendGroupMessage(tabId)
      }

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

    /**
     * 群聊多 Agent 消息发送
     */
    async sendGroupMessage(tabId: string) {
      const tab = this.tabs.find(t => t.id === tabId)
      if (!tab || !tab.inputText.trim() || tab.isStreaming || !tab.agentIds || !tab.agentNames) return

      const text = tab.inputText
      // 添加用户消息
      tab.messages.push({
        id: Date.now(),
        role: 'user',
        content: text,
        time: new Date().toLocaleTimeString()
      })
      tab.inputText = ''
      tab.isStreaming = true

      // 初始化每个 agent 的流式状态
      tab.groupAgents = tab.agentIds.map((aid, i) => ({
        agentId: aid,
        agentName: tab.agentNames![i],
        content: '',
        done: false
      }))
      tab.sessionId = tab.sessionId || ''

      const token = localStorage.getItem('token')

      try {
        const response = await axios.post('/api/chat/group', {
          agentIds: tab.agentIds,
          message: text,
          sessionId: tab.sessionId || undefined
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          },
          responseType: 'text',
          onDownloadProgress: (progressEvent) => {
            // axios SSE 处理：解析 event.target.responseText
            const responseText = (progressEvent.event.target as any)?.responseText || ''
            if (!responseText) return

            const lines = responseText.split('\n')
            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || !trimmed.startsWith('data: ')) continue

              const dataStr = trimmed.slice(6)
              if (dataStr === '[DONE]') continue

              try {
                const data = JSON.parse(dataStr)
                if (data.type === 'session' && data.sessionId) {
                  tab.sessionId = data.sessionId
                } else if (data.agentId) {
                  if (data.error) {
                    // 某个 agent 报错
                    const agentState = tab.groupAgents?.find(a => a.agentId === data.agentId)
                    if (agentState) {
                      agentState.error = data.error
                      agentState.done = true
                    }
                  } else {
                    // 流式 token
                    const agentState = tab.groupAgents?.find(a => a.agentId === data.agentId)
                    if (agentState) {
                      agentState.content += data.token || ''
                    }
                  }
                }
              } catch { /* ignore parse errors */ }
            }
          }
        })
        // 请求完成后，重新渲染各 agent 的回复
        tab.isStreaming = false
        // 将 groupAgents 的最终内容写入 messages
        if (tab.groupAgents) {
          for (const agentState of tab.groupAgents) {
            if (agentState.content) {
              tab.messages.push({
                id: Date.now() + Math.random(),
                role: 'assistant',
                content: agentState.content,
                time: new Date().toLocaleTimeString(),
                agentId: agentState.agentId,
                agentName: agentState.agentName
              })
            } else if (agentState.error) {
              tab.messages.push({
                id: Date.now() + Math.random(),
                role: 'assistant',
                content: `❌ ${agentState.error}`,
                time: new Date().toLocaleTimeString(),
                agentId: agentState.agentId,
                agentName: agentState.agentName
              })
            }
          }
        }
      } catch (err: any) {
        tab.isStreaming = false
        const errMsg = err?.response?.data?.error || err?.message || '群聊发送失败'
        tab.messages.push({
          id: Date.now(),
          role: 'assistant',
          content: `❌ ${errMsg}`,
          time: new Date().toLocaleTimeString()
        })
      }
    },

    toggleMinimize() {
      this.isMinimized = !this.isMinimized
      if (this.isMinimized && this.activeTab) {
        const tab = this.tabs.find(t => t.id === this.activeTabId)
        if (tab) tab.unreadCount = 0
      }
    }
  }
})
