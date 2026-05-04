import fs from 'fs-extra'
import path from 'path'
import crypto from 'crypto'
import { database } from './database.js'
import { logger } from '../utils/logger.js'

// Agent workspace 技能目录：server/data/agents/{agentId}/workspace/skills/
export const AGENTS_DATA_DIR = path.join(process.cwd(), 'data', 'agents')

/**
 * 读取 Agent 绑定的技能文档内容
 * 遍历 workspace/skills/{skillId}/SKILL.md，拼接为完整 markdown
 */
export async function loadAgentSkillsContent(agentId: string): Promise<string> {
  const skillsDir = path.join(AGENTS_DATA_DIR, agentId, 'workspace', 'skills')
  if (!await fs.pathExists(skillsDir)) return ''
  const entries = await fs.readdir(skillsDir, { withFileTypes: true })
  const parts: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md')
    if (await fs.pathExists(skillMdPath)) {
      const content = await fs.readFile(skillMdPath, 'utf-8')
      parts.push(`### ${entry.name}\n\n${content}`)
    }
  }
  return parts.join('\n\n---\n\n')
}

export interface AgentChatConfig {
  id: string
  name: string
  persona?: string
  skillsContent?: string        // 该 Agent 绑定的技能文档内容（SKILL.md 拼接）
  provider: string
  model: string
  apiKey?: string            // agent 级别的 API Key（暂未启用，预留）
  baseUrl?: string           // 从 config.json providers 读取，覆盖硬编码 URL
  temperature: number
  maxTokens: number
}

type TokenCallback = (token: string) => void
type DoneCallback = () => void
type ErrorCallback = (error: string) => void

/**
 * 构建 messages 数组（system prompt + 历史消息 + 当前消息）
 */
function buildMessages(
  persona: string | undefined,
  skillsContent: string | undefined,   // ← 新增参数
  history: any[],
  message: string
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = []

  // 人设注入
  if (persona) {
    messages.push({ role: 'system', content: persona })
  }

  // 技能注入（在 system prompt 中追加可用工具说明）
  if (skillsContent) {
    messages.push({
      role: 'system',
      content: `## 可用技能\n\n${skillsContent}`
    })
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
 * 从 OpenClaw config.json 读取 providers 配置
 * 格式参考：
 * {
 *   "models": {
 *     "providers": {
 *       "deepseek": {
 *         "apiKey": "sk-xxx",
 *         "baseUrl": "https://api.deepseek.com",
 *         "models": ["deepseek-chat"]
 *       },
 *       "openai": { "apiKey": "...", "baseUrl": "...", ... }
 *     }
 *   }
 * }
 */
let cachedConfig: any = null

async function readProvidersConfig(): Promise<{ apiKey: string; baseUrl: string } | null> {
  try {
    // 从 OpenClaw config.json 读取
    const openclawDir = process.env.OPENCLAW_DIR || path.join(process.env.HOME || '', '.openclaw')
    const configPath = path.join(openclawDir, 'config.json')
    if (!await fs.pathExists(configPath)) {
      return null
    }
    const config = await fs.readJson(configPath)
    cachedConfig = config
    return config
  } catch {
    return null
  }
}

function getConfig() {
  return cachedConfig
}

export { getConfig as getDeepseekConfig }

/**
 * 获取 provider 在 config.json 中的配置
 */
async function getProviderConfig(providerName: string): Promise<{ apiKey?: string; baseUrl?: string }> {
  try {
    const config = await readProvidersConfig()
    if (!config) return {}
    const provider = (config as any)?.models?.providers?.[providerName]
    if (!provider) return {}
    return {
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl
    }
  } catch {
    return {}
  }
}

/**
 * 获取 API Key — 优先级：
 * 1. agent 级别的 apiKey（agent.apiKey）
 * 2. config.json models.providers[provider].apiKey
 * 3. 环境变量 <PROVIDER>_API_KEY
 * 4. 空
 */
async function resolveApiKey(agent: AgentChatConfig): Promise<string> {
  // 1. agent 级别
  if (agent.apiKey) return agent.apiKey

  // 2. config.json 中的 provider 配置
  const providerCfg = await getProviderConfig(agent.provider)
  if (providerCfg.apiKey) return providerCfg.apiKey

  // 3. 环境变量
  const envKey = process.env[`${agent.provider.toUpperCase()}_API_KEY`]
  if (envKey) return envKey

  // 4. 全局 key
  const globalKey = process.env.DEEPSEEK_API_KEY || ''
  if (globalKey) return globalKey

  return ''
}

/**
 * 获取 API Base URL — 优先级：
 * 1. config.json models.providers[provider].baseUrl
 * 2. agent 级别的 baseUrl
 * 3. 硬编码默认 URL 映射
 * 4. 默认 deepseek
 */
async function resolveBaseUrl(agent: AgentChatConfig): Promise<string> {
  // 1. config.json 中的 provider 配置
  const providerCfg = await getProviderConfig(agent.provider)
  if (providerCfg.baseUrl) return providerCfg.baseUrl

  // 2. agent 级别
  if (agent.baseUrl) return agent.baseUrl

  // 3. 硬编码默认
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
  return urlMap[agent.provider] || 'https://api.deepseek.com'
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
    const messages = buildMessages(agent.persona, agent.skillsContent, history, message)

    // 3. 获取 API key 和 base URL（从 config.json providers 配置）
    const apiKey = await resolveApiKey(agent)
    let baseUrl = await resolveBaseUrl(agent)
    // 确保 baseUrl 不以 /v1 结尾（后面会拼接 /v1/chat/completions）
    if (baseUrl.endsWith('/v1')) baseUrl = baseUrl.replace(/\/v1$/, '')
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.replace(/\/$/, '')

    const apiUrl = `${baseUrl}/v1/chat/completions`

    if (!apiKey) {
      onError('未配置 API Key，请在设置中配置')
      return
    }

    logger.info(`Stream chat: model=${agent.model}, baseUrl=${baseUrl}, session=${sessionId}`)

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
