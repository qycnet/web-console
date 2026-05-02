import { Router, Response, Request } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { taskService } from '../services/task-service.js'
import { logger } from '../utils/logger.js'

const router = Router()

router.use(authMiddleware)

/**
 * GET /api/tasks
 * 获取任务列表
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50
    const types = req.query.types ? (req.query.types as string).split(',') : undefined
    const tasks = taskService.getTasks(limit, types)
    res.json(tasks)
  } catch (error) {
    logger.error('Failed to get tasks:', error)
    res.status(500).json({ error: '获取任务列表失败' })
  }
})

/**
 * GET /api/tasks/:taskId
 * 获取单个任务状态（前端轮询用）
 */
router.get('/:taskId', async (req: Request, res: Response) => {
  try {
    const task = taskService.getTask(req.params.taskId)
    if (!task) {
      return res.status(404).json({ error: '任务不存在' })
    }
    res.json(task)
  } catch (error) {
    logger.error('Failed to get task:', error)
    res.status(500).json({ error: '获取任务信息失败' })
  }
})

export default router
