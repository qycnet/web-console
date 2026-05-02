import fs from 'fs-extra'
import path from 'path'
import crypto from 'crypto'
import { database } from './database.js'
import { logger } from '../utils/logger.js'

export interface AgentChatConfig {
  id: string
  name: string
  persona?: string
  provider: string
  model: string
  apiKey?: string
  temperature: number
  maxTokens: number
}

// 全局 DeepSeek API Key（从环境变量或 OpenClaw config 读取）
let globalApiKey: string = process.env.DEEPSEEK_API_KEY || ''

export function setGlobalApiKey(key: string) {
  globalApiKey = key
}

export function getGlobalApiKey(): string {
  return globalApiKey
}

type TokenCallback = (token: string) => void
type DoneCallback = () => void
type ErrorCallback = (error: string) => void

/**
 * 从 config.json 获取用户的 API key（支持按 provider 配置）
 */
function getApiKeyForProvider(provider: string): string {
  // 先从环境变量
  const envKey = process.env[`${provider.toUpperCase()}_API_KEY`]
  if (envKey) return envKey
  // 全局 key
  if (globalApiKey) return globalApiKey
  return ''
}

/**
 * 构建 messages 数组（system prompt + 历史消息 + 当前消息）
 */
function buildMessages(
  persona: string | undefined,
  history: any[],
  message: string
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = []

  // 人设注入
  if (persona) {
    messages.push({ role: 'system', content: persona })
  }

  // 历史消息（最近 30 条，控制上下文窗口）
  const recentHistory = history.slice(-30)
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content })
  }

  // 当前消息
  messages.push({ role: 'user', content: message })

  return messages
}

/**
 * 获取兼容 OpenAI 格式的 API base URL
 */
function getApiBaseUrl(provider: string): string {
  const urlMap: Record<string, string> = {
    'deepseek': 'https://api.deepseek.com',
    'openai': 'https://api.openai.com',
    'cm-plan': 'https://api.cm-plan.com/v1',
    'siliconflow': 'https://api.siliconflow.cn/v1',
    'azure': process.env.AZURE_OPENAI_ENDPOINT || 'https://api.openai.com',
    'aliyun': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    'baidu': 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1',
    'zhipu': 'https://open.bigmodel.cn/api/paas/v4',
    'volc': 'https://ark.cn-beijing.volces.com/api/v3',
    'moonshot': 'https://api.moonshot.cn/v1',
    'baichuan': 'https://api.baichuan-ai.com/v1'
  }
  return urlMap[provider] || 'https://api.deepseek.com'
}

/**
 * 获取 API Key
 */
function getApiKey(agent: AgentChatConfig): string {
  return agent.apiKey || getApiKeyForProvider(agent.provider)
}

/**
 * 流式对话：直调 LLM API（OpenAI 兼容格式）
 */
export async function chatStream(
  agent: AgentChatConfig,
  sessionId: string,
  message: string,
  onToken: TokenCallback,
  onDone: DoneCallback,
  onError: ErrorCallback
): Promise<void> {
  try {
    // 1. 读取会话历史
    const history = database.getRecentMessages(sessionId, 50)

    // 2. 构建 messages
    const messages = buildMessages(agent.persona, history, message)

    // 3. 获取 API key 和 base URL
    const apiKey = getApiKey(agent)
    const baseUrl = getApiBaseUrl(agent.provider)
    const apiUrl = `${baseUrl}/v1/chat/completions`

    if (!apiKey) {
      onError('未配置 API Key，请在设置中配置')
      return
    }

    // 4. 调用 streaming API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: agent.model || 'deepseek-chat',
        messages,
        stream: true,
        temperature: agent.temperature ?? 0.7,
        max_tokens: agent.maxTokens ?? 4096
      })
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      onError(`API 请求失败 (${response.status}): ${errText.substring(0, 200)}`)
      return
    }

    // 5. 流式读取
    const reader = response.body?.getReader()
    if (!reader) {
      onError('无法获取响应流')
      return
    }

    const decoder = new TextDecoder()
    let fullReply = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // 保留未完成的行

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue

        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          // 刷新 buffer 中可能残留的完整 data 行
          break
        }

        try {
          const json = JSON.parse(data)
          const token = json.choices?.[0]?.delta?.content
          if (token) {
            fullReply += token
            onToken(token)
          }
        } catch {
          // 忽略解析错误（可能是不完整 chunk）
        }
      }
    }

    // 处理 buffer 中最后一行的 data
    if (buffer.trim().startsWith('data: ')) {
      const data = buffer.trim().slice(6)
      if (data !== '[DONE]') {
        try {
          const json = JSON.parse(data)
          const token = json.choices?.[0]?.delta?.content
          if (token) {
            fullReply += token
            onToken(token)
          }
        } catch { /* ignore */ }
      }
    }

    // 6. 持久化消息
    database.saveMessage(sessionId, 'user', message)
    database.saveMessage(sessionId, 'assistant', fullReply)
    database.touchSession(sessionId)

    // 7. 自动设置标题（第一条消息时）
    const session = database.getSession(sessionId)
    if (session && !session.title) {
      const title = message.length > 50 ? message.substring(0, 50) + '...' : message
      database.updateSessionTitle(sessionId, title)
    }

    onDone()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error('chatStream error:', msg)
    onError(`对话失败: ${msg}`)
  }
}

/**
 * 非流式对话（作为 fallback）
 */
export async function chat(
  agent: AgentChatConfig,
  sessionId: string,
  message: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullReply = ''

    chatStream(
      agent,
      sessionId,
      message,
      (token) => { fullReply += token },
      () => resolve(fullReply),
      (error) => reject(new Error(error))
    )
  })
}

/**
 * 生成新的 session ID
 */
export function generateSessionId(): string {
  return crypto.randomUUID()
}
