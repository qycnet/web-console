import { Router, Response } from 'express'
import { logger } from '../utils/logger.js'

const router = Router()

// 模拟 Agent 数据
const agents = [
  {
    id: 'agent-1',
    name: '主 Agent',
    description: '主要的 AI 助手',
    model: 'gpt-4',
    status: 'running',
    skills: ['weather', 'translator', 'reminder'],
    createdAt: '2024-01-15 10:00:00'
  },
  {
    id: 'agent-2',
    name: '写作助手',
    description: '专注于内容创作',
    model: 'claude-3',
    status: 'stopped',
    skills: ['translator'],
    createdAt: '2024-01-16 14:30:00'
  }
]

// 获取 Agent 列表
router.get('/', (_, res: Response) => {
  res.json(agents)
})

// 获取单个 Agent
router.get('/:agentId', (req, res: Response) => {
  const agent = agents.find(a => a.id === req.params.agentId)
  if (!agent) {
    return res.status(404).json({ error: 'Agent 不存在' })
  }
  res.json(agent)
})

// 启动 Agent
router.post('/:agentId/start', (req, res: Response) => {
  const agent = agents.find(a => a.id === req.params.agentId)
  if (!agent) {
    return res.status(404).json({ error: 'Agent 不存在' })
  }
  agent.status = 'running'
  logger.info(`Agent started: ${req.params.agentId}`)
  res.json({ message: 'Agent 已启动' })
})

// 停止 Agent
router.post('/:agentId/stop', (req, res: Response) => {
  const agent = agents.find(a => a.id === req.params.agentId)
  if (!agent) {
    return res.status(404).json({ error: 'Agent 不存在' })
  }
  agent.status = 'stopped'
  logger.info(`Agent stopped: ${req.params.agentId}`)
  res.json({ message: 'Agent 已停止' })
})

// 重启 Agent
router.post('/:agentId/restart', (req, res: Response) => {
  const agent = agents.find(a => a.id === req.params.agentId)
  if (!agent) {
    return res.status(404).json({ error: 'Agent 不存在' })
  }
  agent.status = 'running'
  logger.info(`Agent restarted: ${req.params.agentId}`)
  res.json({ message: 'Agent 已重启' })
})

export default router
