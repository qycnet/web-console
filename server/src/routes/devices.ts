import { Router, Response, Request } from 'express'
import { authMiddleware, requireRole, auditLog } from '../middleware/auth.js'
import { deviceService } from '../services/device-service.js'
import { logger } from '../utils/logger.js'

const router = Router()

// 所有路由需要认证
router.use(authMiddleware)

/**
 * GET /api/devices
 * 获取所有设备列表
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const devices = deviceService.getDevices()
    res.json(devices)
  } catch (error) {
    logger.error('Failed to get devices:', error)
    res.status(500).json({ error: '获取设备列表失败' })
  }
})

/**
 * GET /api/devices/sessions
 * 获取所有会话列表
 */
router.get('/sessions', async (_req: Request, res: Response) => {
  try {
    const activeOnly = _req.query.active === 'true'
    const sessions = deviceService.getSessions(activeOnly)
    res.json(sessions)
  } catch (error) {
    logger.error('Failed to get sessions:', error)
    res.status(500).json({ error: '获取会话列表失败' })
  }
})

/**
 * GET /api/devices/user/:userId
 * 获取指定用户的设备
 */
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const devices = deviceService.getUserDevices(req.params.userId)
    res.json(devices)
  } catch (error) {
    logger.error('Failed to get user devices:', error)
    res.status(500).json({ error: '获取用户设备列表失败' })
  }
})

/**
 * GET /api/devices/:deviceId
 * 获取设备详情
 */
router.get('/:deviceId', async (req: Request, res: Response) => {
  try {
    const device = deviceService.getDevice(req.params.deviceId)
    if (!device) {
      return res.status(404).json({ error: '设备不存在' })
    }
    res.json(device)
  } catch (error) {
    logger.error('Failed to get device:', error)
    res.status(500).json({ error: '获取设备信息失败' })
  }
})

/**
 * DELETE /api/devices/:deviceId
 * 强制设备下线（撤销所有会话）
 */
router.delete('/:deviceId',
  requireRole('admin'),
  auditLog('device:revoke'),
  async (req: Request, res: Response) => {
    try {
      const count = deviceService.revokeDevice(req.params.deviceId)
      logger.info(`Device revoked: ${req.params.deviceId}, ${count} sessions ended`)
      res.json({
        message: `设备已下线，已结束 ${count} 个会话`,
        endedSessions: count
      })
    } catch (error) {
      logger.error('Failed to revoke device:', error)
      res.status(500).json({ error: '设备强制下线失败' })
    }
  }
)

/**
 * POST /api/devices/sessions/:sessionId/end
 * 结束指定会话
 */
router.post('/sessions/:sessionId/end',
  requireRole('admin'),
  auditLog('session:end'),
  async (req: Request, res: Response) => {
    try {
      const success = deviceService.endSession(req.params.sessionId)
      if (!success) {
        return res.status(404).json({ error: '会话不存在' })
      }
      logger.info(`Session ended: ${req.params.sessionId}`)
      res.json({ message: '会话已结束' })
    } catch (error) {
      logger.error('Failed to end session:', error)
      res.status(500).json({ error: '结束会话失败' })
    }
  }
)

/**
 * POST /api/devices/user/:userId/revoke
 * 撤销用户所有会话
 */
router.post('/user/:userId/revoke',
  requireRole('admin'),
  auditLog('session:revoke-all'),
  async (req: Request, res: Response) => {
    try {
      const count = deviceService.revokeUserSessions(req.params.userId)
      logger.info(`All sessions revoked for user ${req.params.userId}: ${count}`)
      res.json({ message: `已结束该用户 ${count} 个会话` })
    } catch (error) {
      logger.error('Failed to revoke user sessions:', error)
      res.status(500).json({ error: '撤销用户会话失败' })
    }
  }
)

/**
 * POST /api/devices/register
 * 注册/更新设备（由 Auth 模块调用）
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    // 从请求上下文中推断设备信息，不依赖前端传参
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
             || req.ip
             || req.socket?.remoteAddress
             || ''
    const userAgent = req.headers['user-agent'] || ''
    const userId = req.body?.userId || (req as any).user?.userId || ''
    const username = req.body?.username || ''
    const result = deviceService.registerDevice({ ip, userAgent, userId, username })
    res.json(result)
  } catch (error) {
    logger.error('Failed to register device:', error)
    res.status(500).json({ error: '设备注册失败' })
  }
})

export default router
