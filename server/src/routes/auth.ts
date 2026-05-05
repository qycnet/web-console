import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { db } from '../services/database.js'
import { UserService } from '../services/user-service.js'
import { logger } from '../utils/logger.js'
import { strictRateLimiter } from '../middleware/auth.js'
import { v4 as uuidv4 } from 'uuid'

import { getJwtSecret } from '../utils/jwt-secret.js'

const router = Router()
const JWT_SECRET = getJwtSecret()
const userService = new UserService(db)

// Access token 有效期
const ACCESS_TOKEN_EXPIRY = '1h'
// Refresh token 有效期（30天）
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 3600 * 1000

// 检查是否为本地访问
function isLocalRequest(req: Request): boolean {
  const ip = req.ip || req.socket.remoteAddress || ''
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

// 登录（使用严格速率限制）
router.post('/login', strictRateLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码必填' })
    }

    const ip = req.ip || req.socket.remoteAddress || ''

    try {
      const user = await userService.validateLogin(username, password, ip)
      if (!user) {
        return res.status(401).json({ error: '用户名或密码错误' })
      }

      // 通过 UserService.getUserByUsername 获取 password_changed
      const userWithPwd = userService.getUserByUsername(username)
      const needsPasswordChange = userWithPwd?.password_changed === 0

      const accessToken = jwt.sign(
        { userId: user.id, role: user.role, type: 'access' },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY }
      )

      // 生成 refresh token
      const refreshToken = uuidv4()
      userService.setRefreshToken(refreshToken, user.id, user.role, Date.now() + REFRESH_TOKEN_EXPIRY_MS)

      logger.info(`User logged in: ${username}`)
      res.json({
        token: accessToken,
        refreshToken,
        expiresIn: 3600,
        needsPasswordChange,
        user: { id: user.id, username: user.username, role: user.role }
      })
    } catch (error: any) {
      // Handle locked/inactive errors from validateLogin
      if (error.message === '账户已被锁定' || error.message === '账户已停用') {
        return res.status(403).json({ error: error.message })
      }
      throw error
    }
  } catch (error) {
    logger.error('Login error:', error)
    res.status(500).json({ error: '登录失败' })
  }
})

// 刷新 Token
router.post('/refresh', (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken 不能为空' })
    }

    const tokenData = userService.getRefreshToken(refreshToken)
    if (!tokenData) {
      return res.status(401).json({ error: 'Refresh token 无效或已过期' })
    }

    // 检查是否过期
    if (tokenData.expiresAt < Date.now()) {
      userService.deleteRefreshToken(refreshToken)
      return res.status(401).json({ error: 'Refresh token 已过期，请重新登录' })
    }

    // 生成新的 access token
    const newAccessToken = jwt.sign(
      { userId: tokenData.userId, role: tokenData.role, type: 'access' },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    )

    // 滚动续期 refresh token
    const newRefreshToken = uuidv4()
    userService.deleteRefreshToken(refreshToken)
    userService.setRefreshToken(newRefreshToken, tokenData.userId, tokenData.role, Date.now() + REFRESH_TOKEN_EXPIRY_MS)

    logger.info(`Token refreshed for user ${tokenData.userId}`)
    res.json({
      token: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 3600
    })
  } catch (error) {
    logger.error('Token refresh error:', error)
    res.status(500).json({ error: '刷新 Token 失败' })
  }
})

// 登出
router.post('/logout', (req: Request, res: Response) => {
  const { refreshToken } = req.body
  if (refreshToken) userService.deleteRefreshToken(refreshToken)
  res.json({ message: '已登出' })
})

// 获取当前用户信息
router.get('/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权' })
  }

  const token = authHeader.substring(7)
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any
    const user = userService.getUserById(decoded.userId)
    if (!user) {
      return res.status(401).json({ error: '用户不存在' })
    }
    res.json({ id: user.id, username: user.username, role: user.role })
  } catch {
    res.status(401).json({ error: 'Token 无效' })
  }
})

export default router
