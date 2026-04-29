import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { db } from '../services/database.js'
import { logger } from '../utils/logger.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'openclaw-secret-key'

// 检查是否为本地访问
function isLocalRequest(req: Request): boolean {
  const ip = req.ip || req.connection.remoteAddress || ''
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

// 登录
router.post('/login', async (req: Request, res: Response) => {
  try {
    // 本地访问免认证
    if (isLocalRequest(req)) {
      const token = jwt.sign(
        { userId: 'local', role: 'admin' },
        JWT_SECRET,
        { expiresIn: '7d' }
      )
      return res.json({
        token,
        user: { id: 'local', username: 'local', role: 'admin' }
      })
    }

    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码必填' })
    }

    const user = db.getUserByUsername(username)
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' })
    }

    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      return res.status(401).json({ error: '用户名或密码错误' })
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    logger.info(`User logged in: ${username}`)
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role }
    })
  } catch (error) {
    logger.error('Login error:', error)
    res.status(500).json({ error: '登录失败' })
  }
})

// 登出
router.post('/logout', (req: Request, res: Response) => {
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
    const user = db.getUserById(decoded.userId)
    if (!user) {
      return res.status(401).json({ error: '用户不存在' })
    }
    res.json({ id: user.id, username: user.username, role: user.role })
  } catch {
    res.status(401).json({ error: 'Token 无效' })
  }
})

export default router
