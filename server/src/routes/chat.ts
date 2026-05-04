import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../utils/jwt-secret.js'
import { openclawService } from '../services/openclaw-service.js'
import { chatStream, generateSessionId, loadAgentSkillsContent, type AgentChatConfig } from '../services/deepseek-service.js'
import { database } from '../services/database.js'
import { logger } from '../utils/logger.js'

const router = Router()

// ============================================================================
// 群聊多 Agent 协作：POST /api/chat/group
// SSE (text/event-stream) 流式返回，每个 token 携带 agentId
// 格式：
//   data: {"agentId":"code","token":"Hello"}
//   data: {"agentId":"design","token":"Hi"}
//   data: {"agentId":"code","token":" world"}
//   data: {"agentId":"design","token":" there"}
//   data: [DONE]
// ============================================================================
router.post('/group', async (req: Request, res: Response) => {
  // 鉴权
  try {
    const authHeader = req.headers.authorization
    let token: string | undefined
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    }
    if (!token) {
      res.status(401).json({ error: '未授权访问' })
      return
    }
    const decoded = jwt.verify(token, getJwtSecret()) as any
    req.user = { userId: decoded.userId, role: decoded.role }
  } catch {
    res.status(401).json({ error: 'Token 无效或已过期' })
    return
  }

  // 设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const { agentIds, message, sessionId: existingSessionId } = req.body

  if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
    res.write(`data: ${JSON.stringify({ error: '请至少选择一个 Agent' })}\n\n`)
    res.end()
    return
  }

  if (!message) {
    res.write(`data: ${JSON.stringify({ error: '消息不能为空' })}\n\n`)
    res.end()
    return
  }

  // 生成或复用 session
  const sessionId = existingSessionId || generateSessionId()

  // 写入 session 初始化事件
  res.write(`data: ${JSON.stringify({ type: 'session', sessionId })}\n\n`)

  // 保存用户消息到 session
  // （chatStream 内部会保存每个 agent 的回复，同时保存用户消息）
  // 这里只需确保 session 存在即可
  const session = database.getSession(sessionId)
  if (!session) {
    database.createSession(sessionId, agentIds.join(','), message.substring(0, 30))
  }

  // 并发调用所有 agent 的流式对话
  const agentConfigs: AgentChatConfig[] = []
  let hasError = false

  for (const agentId of agentIds) {
    try {
      const agentInfo = await openclawService.getAgent(agentId)
      let agentConfig: AgentChatConfig

      if (agentInfo) {
        agentConfig = {
          id: agentInfo.id,
          name: agentInfo.name,
          persona: agentInfo.persona,
          skillsContent: await loadAgentSkillsContent(agentInfo.id),
          provider: agentInfo.provider || 'deepseek',
          model: agentInfo.model || 'deepseek-chat',
          apiKey: agentInfo.apiKey || undefined,
          temperature: agentInfo.temperature ?? 0.7,
          maxTokens: agentInfo.maxTokens ?? 4096
        }
      } else {
        const config = await openclawService.getConfig()
        const defaults = config?.agents?.defaults || {}
        const primary = defaults?.model?.primary || 'deepseek/deepseek-chat'
        const parts = primary.split('/')
        agentConfig = {
          id: agentId,
          name: agentId === 'main' ? 'Main Agent' : agentId,
          skillsContent: await loadAgentSkillsContent(agentId),
          provider: parts.length > 1 ? parts[0] : 'deepseek',
          model: parts.length > 1 ? parts[1] : parts[0],
          temperature: 0.7,
          maxTokens: 4096
        }
      }
      agentConfigs.push(agentConfig)
    } catch (err: any) {
      logger.error(`Failed to get agent ${agentId}:`, err)
      res.write(`data: ${JSON.stringify({ agentId, error: `Agent ${agentId} 加载失败: ${err.message}` })}\n\n`)
      hasError = true
    }
  }

  if (hasError) {
    res.write('data: [DONE]\n\n')
    res.end()
    return
  }

  // 并发执行所有 agent 的流式对话
  const results = await Promise.allSettled(
    agentConfigs.map((agentConfig) =>
      streamAgentGroupReply(agentConfig, sessionId, message, res)
    )
  )

  // 异步持久化
  for (const [index, result] of results.entries()) {
    const agentConfig = agentConfigs[index]
    if (result.status === 'fulfilled') {
      const { fullReply } = result.value
      // 保存 AI 回复（每个 agent 独立）
      database.saveMessage(sessionId, 'assistant', `@${agentConfig.id}\n${fullReply}`)
    }
  }

  // 设置会话标题（以第一条消息截取）
  const currentSession = database.getSession(sessionId)
  if (currentSession && !currentSession.title) {
    const title = message.length > 25 ? message.substring(0, 25) + '...' : message
    database.updateSessionTitle(sessionId, `群聊: ${title}`)
  }

  // 发送完成事件
  res.write('data: [DONE]\n\n')
  res.end()
})

/**
 * 单个 agent 的群聊流式回复
 */
async function streamAgentGroupReply(
  agent: AgentChatConfig,
  sessionId: string,
  message: string,
  res: Response
): Promise<{ fullReply: string }> {
  let fullReply = ''

  return new Promise((resolve, reject) => {
    chatStream(
      agent,
      sessionId,
      `@${agent.name}\n${message}`,
      // onToken — 带上 agentId 前缀
      (token) => {
        fullReply += token
        try {
          res.write(`data: ${JSON.stringify({ agentId: agent.id, agentName: agent.name, token })}\n\n`)
        } catch {
          // 客户端断开时忽略写入错误
        }
      },
      // onDone — 发完成标记
      () => {
        try {
          res.write(`data: ${JSON.stringify({ agentId: agent.id, agentName: agent.name, token: '', done: true })}\n\n`)
        } catch { /* ignore */ }
        resolve({ fullReply })
      },
      // onError
      (error) => {
        fullReply = `错误: ${error}`
        try {
          res.write(`data: ${JSON.stringify({ agentId: agent.id, agentName: agent.name, error })}\n\n`)
        } catch { /* ignore */ }
        resolve({ fullReply })
      }
    )
  })
}

export default router
