import { Router, Response, Request, NextFunction } from 'express'
import { authMiddleware, requireRole, auditLog } from '../middleware/auth.js'
import { openclawService } from '../services/openclaw-service.js'
import { taskService } from '../services/task-service.js'
import { database } from '../services/database.js'
import { chatStream, generateSessionId, loadAgentSkillsContent, AGENTS_DATA_DIR, type AgentChatConfig } from '../services/deepseek-service.js'
import { logger } from '../utils/logger.js'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import fs from 'fs-extra'
import path from 'path'
import { getJwtSecret } from '../utils/jwt-secret.js'

const router = Router()

// 流式对话路由必须在 authMiddleware 之前注册
// 因为 EventSource 无法携带 Authorization header，走 query token 自鉴权
// ============================================================================
// 流式对话（新）：GET /api/agents/:agentId/chat/stream
// SSE (text/event-stream) 流式返回
// 从 query 参数 token 鉴权（替代 router-level authMiddleware）
// ============================================================================
router.get('/:agentId/chat/stream', async (req: Request, res: Response) => {
  // 鉴权：优先读取 Authorization header，fallback 到 query token
  //（EventSource 无法携带自定义 Header，因此 query token 作为备选）
  try {
    let token: string | undefined

    // ① 尝试从 Authorization header 读取
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    }

    // ② 如果没有 header token，从 query 参数读取（EventSource 场景）
    if (!token) {
      token = req.query.token as string | undefined
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

  // 先获取 Agent 配置并检查 disabled（输出 SSE 格式错误而非 HTTP JSON，
  // 因为浏览器 EventSource 无法读取非 200 状态码的响应体）
  const agentId = req.params.agentId
  const message = req.query.message as string
  let sessionId = req.query.sessionId as string

  if (!message) {
    res.status(400).json({ error: '消息不能为空' })
    return
  }

  // 设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')   // Nginx 禁用缓冲
  res.flushHeaders()

  // 检查 Agent 是否被禁用（在 SSE 流中返回错误事件，而不是 HTTP 403）
  let agentInfo: any

  try {
    agentInfo = await openclawService.getAgent(agentId)
    if (agentInfo && agentInfo.disabled) {
      res.write(`data: ${JSON.stringify({ error: '该 Agent 已被禁用，无法发起对话' })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }
  } catch {
    res.write(`data: ${JSON.stringify({ error: '获取 Agent 信息失败' })}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
    return
  }

  if (!sessionId) {
    sessionId = generateSessionId()
    database.createSession(sessionId, agentId, message.substring(0, 50))
  } else {
    const existing = database.getSession(sessionId)
    if (!existing) {
      database.createSession(sessionId, agentId)
    }
  }

  // 写入初始化事件（包含 sessionId，让前端知道）
  res.write(`data: ${JSON.stringify({ type: 'session', sessionId })}\n\n`)

  try {
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
      // main/default agent → 从 config.json 默认配置读取
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

    await chatStream(
      agentConfig,
      sessionId,
      message,
      (token) => {
        res.write(`data: ${JSON.stringify({ token })}\n\n`)
      },
      () => {
        res.write('data: [DONE]\n\n')
        res.end()
      },
      (error) => {
        res.write(`data: ${JSON.stringify({ error })}\n\n`)
        res.end()
      }
    )
  } catch (err: any) {
    logger.error('Stream chat error:', err)
    res.write(`data: ${JSON.stringify({ error: err.message || '对话失败' })}\n\n`)
    res.end()
  }
})

// ===== Agent 技能管理路由（在 authMiddleware 之前注册，内联鉴权） =====

/**
 * GET /api/agents/:agentId/skills
 * 获取 Agent 已绑定的技能列表
 */
router.get('/:agentId/skills', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params
    const skillsDir = path.join(AGENTS_DATA_DIR, agentId, 'workspace', 'skills')
    if (!await fs.pathExists(skillsDir)) {
      return res.json({ skills: [] })
    }
    const entries = await fs.readdir(skillsDir, { withFileTypes: true })
    const skills: Array<{ id: string; name?: string; description?: string }> = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const metaPath = path.join(skillsDir, entry.name, '_meta.json')
      let name: string | undefined
      let description: string | undefined
      if (await fs.pathExists(metaPath)) {
        try {
          const meta = await fs.readJson(metaPath)
          name = meta.name || entry.name
          description = meta.description
        } catch { /* ignore */ }
      }
      skills.push({ id: entry.name, name, description })
    }
    res.json({ skills })
  } catch (error) {
    logger.error('Failed to list agent skills:', error)
    res.status(500).json({ error: '获取技能列表失败' })
  }
})

/**
 * POST /api/agents/:agentId/skills/:skillId
 * 将全局技能安装到该 Agent（管理员权限）
 */
router.post('/:agentId/skills/:skillId',
  (req: Request, res: Response, next: NextFunction) => {
    const token = (() => {
      const authHeader = req.headers.authorization
      if (authHeader?.startsWith('Bearer ')) return authHeader.substring(7)
      return req.query.token as string
    })()
    if (!token) return res.status(401).json({ error: '未授权访问' })
    try {
      const decoded = jwt.verify(token, getJwtSecret()) as any
      ;(req as any).user = { userId: decoded.userId, role: decoded.role }
      if (decoded.role !== 'admin') return res.status(403).json({ error: '权限不足' })
      next()
    } catch {
      return res.status(401).json({ error: 'Token 无效' })
    }
  },
  async (req: Request, res: Response) => {
    try {
      const { agentId, skillId } = req.params
      const discovered = await openclawService.discover()
      if (!discovered) return res.status(500).json({ error: '无法找到 OpenClaw 安装目录' })
      const globalSkillDir = path.join(discovered.installDir, 'workspace', 'skills', skillId)
      if (!await fs.pathExists(globalSkillDir)) return res.status(404).json({ error: `全局技能 "${skillId}" 不存在` })
      if (!await fs.pathExists(path.join(globalSkillDir, 'SKILL.md'))) return res.status(404).json({ error: `技能 "${skillId}" 缺少 SKILL.md` })
      const agentSkillDir = path.join(AGENTS_DATA_DIR, agentId, 'workspace', 'skills', skillId)
      if (await fs.pathExists(agentSkillDir)) return res.status(409).json({ error: `技能 "${skillId}" 已安装到该 Agent` })
      await fs.ensureDir(agentSkillDir)
      await fs.copy(globalSkillDir, agentSkillDir)
      const registry = await readRegistry()
      if (!registry[agentId]) registry[agentId] = {}
      if (!registry[agentId].skills) registry[agentId].skills = []
      if (!registry[agentId].skills.includes(skillId)) registry[agentId].skills.push(skillId)
      await writeRegistry(registry)
      logger.info(`Skill "${skillId}" installed to agent "${agentId}"`)
      res.json({ message: '技能安装成功', skillId })
    } catch (error: any) {
      logger.error('Failed to install skill:', error)
      res.status(500).json({ error: error.message || '技能安装失败' })
    }
  }
)

/**
 * DELETE /api/agents/:agentId/skills/:skillId
 * 从该 Agent 卸载技能（管理员权限）
 */
router.delete('/:agentId/skills/:skillId',
  (req: Request, res: Response, next: NextFunction) => {
    const token = (() => {
      const authHeader = req.headers.authorization
      if (authHeader?.startsWith('Bearer ')) return authHeader.substring(7)
      return req.query.token as string
    })()
    if (!token) return res.status(401).json({ error: '未授权访问' })
    try {
      const decoded = jwt.verify(token, getJwtSecret()) as any
      ;(req as any).user = { userId: decoded.userId, role: decoded.role }
      if (decoded.role !== 'admin') return res.status(403).json({ error: '权限不足' })
      next()
    } catch {
      return res.status(401).json({ error: 'Token 无效' })
    }
  },
  async (req: Request, res: Response) => {
    try {
      const { agentId, skillId } = req.params
      const agentSkillDir = path.join(AGENTS_DATA_DIR, agentId, 'workspace', 'skills', skillId)
      if (!await fs.pathExists(agentSkillDir)) return res.status(404).json({ error: `Agent 未安装技能 "${skillId}"` })
      await fs.remove(agentSkillDir)
      const registry = await readRegistry()
      if (registry[agentId]?.skills) {
        registry[agentId].skills = registry[agentId].skills.filter((s: string) => s !== skillId)
        await writeRegistry(registry)
      }
      logger.info(`Skill "${skillId}" removed from agent "${agentId}"`)
      res.json({ message: '技能卸载成功', skillId })
    } catch (error: any) {
      logger.error('Failed to uninstall skill:', error)
      res.status(500).json({ error: error.message || '技能卸载失败' })
    }
  }
)

// 其他所有路由需要认证
router.use(authMiddleware)

/**
 * GET /api/agents
 * 获取 Agent 列表
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const agents = await openclawService.getAgents()
    res.json(agents)
  } catch (error) {
    logger.error('Failed to get agents:', error)
    res.status(500).json({ error: '获取 Agent 列表失败' })
  }
})

/**
 * GET /api/agents/models
 * 获取可用模型列表（从 OpenClaw 配置动态读取）
 */
router.get('/models', async (_req: Request, res: Response) => {
  try {
    const models = await openclawService.getAvailableModels()
    res.json(models)
  } catch (error) {
    logger.error('Failed to get models:', error)
    res.status(500).json({ error: '获取模型列表失败' })
  }
})

/**
 * GET /api/agents/:agentId
 * 获取单个 Agent 详情
 */
router.get('/:agentId', async (req: Request, res: Response) => {
  try {
    const agent = await openclawService.getAgent(req.params.agentId)
    if (!agent) {
      return res.status(404).json({ error: 'Agent 不存在' })
    }
    res.json(agent)
  } catch (error) {
    logger.error('Failed to get agent:', error)
    res.status(500).json({ error: '获取 Agent 信息失败' })
  }
})

/**
 * POST /api/agents/:agentId/start
 * 启用 Agent（将 start 重新定义为"启用"，调 enableAgent）
 */
router.post('/:agentId/start',
  requireRole('admin'),
  auditLog('agent:start'),
  async (req: Request, res: Response) => {
    try {
      await openclawService.enableAgent(req.params.agentId)
      res.json({ success: true, message: 'Agent 已启用' })
    } catch (error) {
      logger.error('Failed to enable agent:', error)
      res.status(500).json({ error: '启用 Agent 失败' })
    }
  }
)

/**
 * POST /api/agents/:agentId/stop
 * 禁用 Agent（将 stop 重新定义为"禁用"，调 disableAgent）
 */
router.post('/:agentId/stop',
  requireRole('admin'),
  auditLog('agent:stop'),
  async (req: Request, res: Response) => {
    try {
      await openclawService.disableAgent(req.params.agentId)
      res.json({ success: true, message: 'Agent 已禁用' })
    } catch (error) {
      logger.error('Failed to disable agent:', error)
      res.status(500).json({ error: '禁用 Agent 失败' })
    }
  }
)

/**
 * POST /api/agents/:agentId/restart
 * 先禁用再启用（等价"重启"语义）
 */
router.post('/:agentId/restart',
  requireRole('admin'),
  auditLog('agent:restart'),
  async (req: Request, res: Response) => {
    try {
      await openclawService.restartAgent2(req.params.agentId)
      res.json({ success: true, message: 'Agent 已重启' })
    } catch (error) {
      logger.error('Failed to restart agent:', error)
      res.status(500).json({ error: '重启 Agent 失败' })
    }
  }
)

/**
 * GET /api/agents/:agentId/logs
 * 获取 Agent 日志
 */
router.get('/:agentId/logs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100
    const logs = await openclawService.getAgentLogs(req.params.agentId, limit)
    res.json({ logs })
  } catch (error) {
    logger.error('Failed to get agent logs:', error)
    res.status(500).json({ error: '获取日志失败' })
  }
})

/**
 * GET /api/agents/:agentId/stats
 * 获取 Agent 统计信息（从 SQLite 和 config 获取真实数据）
 */
router.get('/:agentId/stats', async (req: Request, res: Response) => {
  try {
    const agentId = req.params.agentId
    const agent = await openclawService.getAgent(agentId)
    if (!agent) {
      return res.status(404).json({ error: 'Agent 不存在' })
    }

    // 从 SQLite 获取真实统计数据
    const sessions = database.getSessions(agentId, 1000)
    const sessionCount = sessions.length

    // 获取所有会话的消息，统计总消息数和 token 数
    let totalMessages = 0
    let totalTokens = 0
    for (const session of sessions) {
      const msgs = database.getMessages(session.id, 1000)
      totalMessages += msgs.length
      for (const msg of msgs) {
        totalTokens += (msg as any).tokens || 0
      }
    }

    // 从 OpenClaw 日志中统计错误数
    const logs = await openclawService.getAgentLogs(agentId, 1000)
    const errorCount = logs.filter(l =>
      l.includes('error') || l.includes('Error') || l.includes('ERROR')
    ).length

    // 计算平均响应时间（基于 token 数估算）
    const requestCount = totalMessages > 0 ? Math.ceil(totalMessages / 2) : 0
    const avgResponseTime = requestCount > 0 && totalTokens > 0
      ? Math.round(totalTokens / requestCount * 50)  // 按 50ms/token 估算
      : 0

    res.json({
      id: agent.id,
      status: agent.status,
      uptime: agent.uptime,
      memoryUsage: agent.memoryUsage,
      cpuUsage: agent.cpuUsage,
      requestCount,
      sessionCount,
      errorCount,
      totalMessages,
      totalTokens,
      avgResponseTime
    })
  } catch (error) {
    logger.error('Failed to get agent stats:', error)
    // 降级：返回基础数据
    res.json({
      requestCount: 0,
      sessionCount: 0,
      errorCount: 0,
      totalMessages: 0,
      totalTokens: 0,
      avgResponseTime: 0
    })
  }
})

/**
 * POST /api/agents
 * 创建新 Agent（异步任务 + 轮询）
 */
router.post('/',
  requireRole('admin'),
  auditLog('agent:create'),
  async (req: Request, res: Response) => {
    try {
      const { name, model, workspace, persona, description, provider, temperature, maxTokens, avatar, theme } = req.body
      if (!name) {
        return res.status(400).json({ error: 'Agent 名称不能为空' })
      }
      const taskId = taskService.submit('agent:create', { name, model, workspace, persona, description, provider, temperature, maxTokens, avatar, theme })
      logger.info(`Agent create task submitted: ${taskId}`)
      res.status(202).json({ taskId, message: 'Agent 创建任务已提交' })
    } catch (error) {
      logger.error('Failed to submit agent create task:', error)
      res.status(500).json({ error: '提交创建任务失败' })
    }
  }
)

/**
 * PUT /api/agents/:agentId
 * 更新 Agent 身份信息（异步任务 + 轮询）
 */
router.put('/:agentId',
  requireRole('admin'),
  auditLog('agent:update'),
  async (req: Request, res: Response) => {
    try {
      const { name, model, persona, emoji, avatar, theme, provider, temperature, maxTokens, description } = req.body
      const taskId = taskService.submit('agent:update', {
        agentId: req.params.agentId,
        updates: { name, model, persona, emoji, avatar, theme, provider, temperature, maxTokens, description }
      })
      logger.info(`Agent update task submitted: ${taskId}`)
      res.status(202).json({ taskId, message: 'Agent 更新任务已提交' })
    } catch (error) {
      logger.error('Failed to submit agent update task:', error)
      res.status(500).json({ error: '提交更新任务失败' })
    }
  }
)

/**
 * DELETE /api/agents/:agentId
 * 删除 Agent（异步任务 + 轮询）
 */
router.delete('/:agentId',
  requireRole('admin'),
  auditLog('agent:delete'),
  async (req: Request, res: Response) => {
    try {
      const taskId = taskService.submit('agent:delete', { agentId: req.params.agentId })
      logger.info(`Agent delete task submitted: ${taskId}`)
      res.status(202).json({ taskId, message: 'Agent 删除任务已提交' })
    } catch (error) {
      logger.error('Failed to submit agent delete task:', error)
      res.status(500).json({ error: '提交删除任务失败' })
    }
  }
)
/**
 * GET /api/agents/:agentId/sessions
 * 获取 Agent 的会话列表
 */
router.get('/:agentId/sessions', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50
    const sessions = database.getSessions(req.params.agentId, limit)
    res.json(sessions)
  } catch (error) {
    logger.error('Failed to get sessions:', error)
    res.status(500).json({ error: '获取会话列表失败' })
  }
})

/**
 * GET /api/agents/:agentId/sessions/:sessionId
 * 获取会话详情（消息列表）
 */
router.get('/:agentId/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const session = database.getSession(req.params.sessionId)
    if (!session) {
      return res.status(404).json({ error: '会话不存在' })
    }
    const messages = database.getMessages(req.params.sessionId)
    res.json({ session, messages })
  } catch (error) {
    logger.error('Failed to get session:', error)
    res.status(500).json({ error: '获取会话详情失败' })
  }
})

/**
 * POST /api/agents/:agentId/sessions
 * 新建会话
 */
router.post('/:agentId/sessions', async (req: Request, res: Response) => {
  try {
    const { title } = req.body
    const sessionId = generateSessionId()
    database.createSession(sessionId, req.params.agentId, title)
    res.json({ id: sessionId })
  } catch (error) {
    logger.error('Failed to create session:', error)
    res.status(500).json({ error: '创建会话失败' })
  }
})

/**
 * DELETE /api/agents/:agentId/sessions/:sessionId
 * 删除会话
 */
router.delete('/:agentId/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    database.deleteSession(req.params.sessionId)
    res.json({ message: '会话已删除' })
  } catch (error) {
    logger.error('Failed to delete session:', error)
    res.status(500).json({ error: '删除会话失败' })
  }
})

/**
 * GET /api/agents/:agentId/sessions/:sessionId/search
 * 搜索会话中的消息
 */
router.get('/:agentId/sessions/:sessionId/search', async (req: Request, res: Response) => {
  try {
    const { keyword } = req.query
    if (!keyword) {
      return res.status(400).json({ error: '搜索关键词不能为空' })
    }
    const messages = database.searchMessages(req.params.sessionId, keyword as string)
    res.json({ messages, count: messages.length })
  } catch (error) {
    logger.error('Failed to search messages:', error)
    res.status(500).json({ error: '搜索消息失败' })
  }
})

/**
 * GET /api/agents/:agentId/sessions/:sessionId/export
 * 导出会话为 JSON 格式
 */
router.get('/:agentId/sessions/:sessionId/export', async (req: Request, res: Response) => {
  try {
    const session = database.getSession(req.params.sessionId)
    if (!session) {
      return res.status(404).json({ error: '会话不存在' })
    }
    const messages = database.getMessages(req.params.sessionId)
    const exportData = {
      session: {
        id: session.id,
        agentId: session.agent_id,
        title: session.title,
        createdAt: session.created_at,
        updatedAt: session.updated_at
      },
      messages: messages.map((m: any) => ({
        role: m.role,
        content: m.content,
        tokens: m.tokens,
        createdAt: m.created_at
      })),
      exportedAt: new Date().toISOString()
    }
    res.json(exportData)
  } catch (error) {
    logger.error('Failed to export session:', error)
    res.status(500).json({ error: '导出会话失败' })
  }
})

/**
 * GET /api/agents/:agentId/sessions/:sessionId/export/markdown
 * 导出会话为 Markdown 格式
 */
router.get('/:agentId/sessions/:sessionId/export/markdown', async (req: Request, res: Response) => {
  try {
    const session = database.getSession(req.params.sessionId)
    if (!session) {
      return res.status(404).json({ error: '会话不存在' })
    }
    const messages = database.getMessages(req.params.sessionId)

    let md = `# ${session.title || '对话记录'}\n\n`
    md += `> Agent ID: \`${session.agent_id}\` · 创建时间: ${session.created_at} · 导出时间: ${new Date().toISOString()}\n\n`
    md += `---\n\n`

    for (const m of messages as any[]) {
      const roleLabel = m.role === 'user' ? '👤 用户' : '🤖 AI'
      md += `### ${roleLabel}\n${m.content}\n\n`
    }

    res.json({ markdown: md, filename: `${session.id}.md` })
  } catch (error) {
    logger.error('Failed to export session as markdown:', error)
    res.status(500).json({ error: '导出会话失败' })
  }
})

/**
 * 读取 Agent 注册表
 */
async function readRegistry(): Promise<Record<string, any>> {
  const registryPath = path.join(AGENTS_DATA_DIR, 'registry.json')
  if (!await fs.pathExists(registryPath)) return {}
  return await fs.readJson(registryPath)
}

/**
 * 保存 Agent 注册表
 */
async function writeRegistry(registry: Record<string, any>): Promise<void> {
  const registryPath = path.join(AGENTS_DATA_DIR, 'registry.json')
  await fs.ensureDir(path.dirname(registryPath))
  await fs.writeJson(registryPath, registry, { spaces: 2 })
}

export default router
