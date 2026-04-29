import { Router, Response, Request } from 'express'
import { authMiddleware, requireRole, auditLog, requireConfirmation } from '../middleware/auth.js'
import { UserService } from '../services/user-service.js'
import { db } from '../services/database.js'
import { logger } from '../utils/logger.js'

const router = Router()
const userService = new UserService(db)

router.use(authMiddleware)

/**
 * GET /api/users
 * 获取用户列表（仅管理员）
 */
router.get('/',
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1
      const limit = parseInt(req.query.limit as string) || 20

      const users = userService.getUsers(page, limit)
      const total = userService.getUserCount()

      res.json({
        users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      })
    } catch (error) {
      logger.error('Failed to get users:', error)
      res.status(500).json({ error: '获取用户列表失败' })
    }
  }
)

/**
 * GET /api/users/me
 * 获取当前用户信息
 */
router.get('/me', (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: '未授权' })
  }

  const user = userService.getUserById(req.user.userId)
  if (!user) {
    return res.status(404).json({ error: '用户不存在' })
  }

  res.json(user)
})

/**
 * POST /api/users
 * 创建用户（仅管理员）
 */
router.post('/',
  requireRole('admin'),
  auditLog('user:create'),
  async (req: Request, res: Response) => {
    try {
      const { username, password, email, role } = req.body

      if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码必填' })
      }

      const user = await userService.createUser({
        username,
        password,
        email,
        role: role || 'user'
      })

      res.status(201).json(user)
    } catch (error: any) {
      logger.error('Failed to create user:', error)
      res.status(400).json({ error: error.message || '创建用户失败' })
    }
  }
)

/**
 * PUT /api/users/:userId
 * 更新用户信息
 */
router.put('/:userId',
  auditLog('user:update'),
  async (req: Request, res: Response) => {
    try {
      const { userId } = req.params

      // 只有管理员可以修改其他用户，普通用户只能修改自己
      if (req.user?.role !== 'admin' && req.user?.userId !== userId) {
        return res.status(403).json({ error: '权限不足' })
      }

      const { email, role, status, password } = req.body

      // 只有管理员可以修改角色和状态
      const updateData: any = { email }
      if (req.user?.role === 'admin') {
        if (role) updateData.role = role
        if (status) updateData.status = status
      }
      if (password) updateData.password = password

      const user = await userService.updateUser(userId, updateData)
      res.json(user)
    } catch (error: any) {
      logger.error('Failed to update user:', error)
      res.status(400).json({ error: error.message || '更新用户失败' })
    }
  }
)

/**
 * DELETE /api/users/:userId
 * 删除用户（仅管理员）
 */
router.delete('/:userId',
  requireRole('admin'),
  requireConfirmation,
  auditLog('user:delete'),
  async (req: Request, res: Response) => {
    try {
      await userService.deleteUser(req.params.userId)
      res.json({ message: '用户已删除' })
    } catch (error: any) {
      logger.error('Failed to delete user:', error)
      res.status(400).json({ error: error.message || '删除用户失败' })
    }
  }
)

/**
 * POST /api/users/change-password
 * 修改密码
 */
router.post('/change-password',
  auditLog('user:change-password'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: '未授权' })
      }

      const { oldPassword, newPassword } = req.body

      if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: '原密码和新密码必填' })
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: '新密码长度至少 6 位' })
      }

      await userService.changePassword(req.user.userId, oldPassword, newPassword)
      res.json({ message: '密码修改成功' })
    } catch (error: any) {
      logger.error('Failed to change password:', error)
      res.status(400).json({ error: error.message || '修改密码失败' })
    }
  }
)

/**
 * GET /api/users/audit-logs
 * 获取审计日志（仅管理员）
 */
router.get('/audit-logs',
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      const { userId, action, startDate, endDate, page, limit } = req.query

      const logs = userService.getAuditLogs(
        userId as string,
        action as string,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined,
        parseInt(page as string) || 1,
        parseInt(limit as string) || 50
      )

      res.json(logs)
    } catch (error) {
      logger.error('Failed to get audit logs:', error)
      res.status(500).json({ error: '获取审计日志失败' })
    }
  }
)

export default router
