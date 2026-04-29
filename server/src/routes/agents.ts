import { Router, Response, Request } from 'express'
import { authMiddleware, requireRole, auditLog } from '../middleware/auth.js'
import { openclawService } from '../services/openclaw-service.js'
import { logger } from '../utils/logger.js'

const router = Router()

// 所有路由需要认证
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
 * 启动 Agent
 */
router.post('/:agentId/start',
  requireRole('admin'),
  auditLog('agent:start'),
  async (req: Request, res: Response) => {
    try {
      await openclawService.startAgent(req.params.agentId)
      res.json({ message: 'Agent 启动中...' })
    } catch (error) {
      logger.error('Failed to start agent:', error)
      res.status(500).json({ error: '启动 Agent 失败' })
    }
  }
)

/**
 * POST /api/agents/:agentId/stop
 * 停止 Agent
 */
router.post('/:agentId/stop',
  requireRole('admin'),
  auditLog('agent:stop'),
  async (req: Request, res: Response) => {
    try {
      await openclawService.stopAgent(req.params.agentId)
      res.json({ message: 'Agent 停止中...' })
    } catch (error) {
      logger.error('Failed to stop agent:', error)
      res.status(500).json({ error: '停止 Agent 失败' })
    }
  }
)

/**
 * POST /api/agents/:agentId/restart
 * 重启 Agent
 */
router.post('/:agentId/restart',
  requireRole('admin'),
  auditLog('agent:restart'),
  async (req: Request, res: Response) => {
    try {
      await openclawService.restartAgent(req.params.agentId)
      res.json({ message: 'Agent 重启中...' })
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
 * POST /api/agents/:agentId/chat
 * 与 Agent 对话
 */
router.post('/:agentId/chat', async (req: Request, res: Response) => {
  try {
    const { message } = req.body
    if (!message) {
      return res.status(400).json({ error: '消息内容不能为空' })
    }

    const response = await openclawService.sendMessage(req.params.agentId, message)
    res.json({ response })
  } catch (error) {
    logger.error('Failed to send message:', error)
    res.status(500).json({ error: '发送消息失败' })
  }
})

/**
 * GET /api/agents/:agentId/stats
 * 获取 Agent 统计信息
 */
router.get('/:agentId/stats', async (req: Request, res: Response) => {
  try {
    const agent = await openclawService.getAgent(req.params.agentId)
    if (!agent) {
      return res.status(404).json({ error: 'Agent 不存在' })
    }

    res.json({
      id: agent.id,
      status: agent.status,
      uptime: agent.uptime,
      memoryUsage: agent.memoryUsage,
      cpuUsage: agent.cpuUsage,
      requestCount: Math.floor(Math.random() * 1000), // 模拟数据
      errorCount: Math.floor(Math.random() * 10), // 模拟数据
      avgResponseTime: Math.floor(Math.random() * 500) + 100 // 模拟数据
    })
  } catch (error) {
    logger.error('Failed to get agent stats:', error)
    res.status(500).json({ error: '获取统计信息失败' })
  }
})

export default router
