import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import { logger } from '../utils/logger.js'
import { getJwtSecret } from '../utils/jwt-secret.js'

const JWT_SECRET = getJwtSecret()

// 扩展 Request 类型
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string
        role: string
      }
    }
  }
}

/**
 * JWT 认证中间件
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权访问' })
  }

  const token = authHeader.substring(7)
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any
    req.user = { userId: decoded.userId, role: decoded.role }
    next()
  } catch {
    return res.status(401).json({ error: 'Token 无效或已过期' })
  }
}

/**
 * 角色权限中间件
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: '未授权访问' })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' })
    }

    next()
  }
}

/**
 * 检查是否为本地请求（仅信任直接连接 IP，不信任 X-Forwarded-For 防止 SSRF）
 */
export function isLocalRequest(req: Request): boolean {
  const ip = req.ip || req.socket.remoteAddress || ''
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

/**
 * IP 白名单中间件
 */
export function ipWhitelist(whitelist: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // 本地访问始终允许
    if (isLocalRequest(req)) {
      return next()
    }

    const ip = req.ip || req.connection.remoteAddress || ''

    if (whitelist.length > 0 && !whitelist.includes(ip)) {
      logger.warn(`Access denied for IP: ${ip}`)
      return res.status(403).json({ error: '访问被拒绝' })
    }

    next()
  }
}

/**
 * 请求速率限制
 */
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100, // 每个 IP 最多 100 次请求
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`)
    res.status(429).json({ error: '请求过于频繁，请稍后再试' })
  }
})

/**
 * 严格的速率限制（用于敏感操作）
 */
export const strictRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 小时
  max: 10, // 每个 IP 最多 10 次
  message: { error: '操作次数过多，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
})

/**
 * 操作审计中间件
 */
export function auditLog(action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // 记录请求
    const startTime = Date.now()

    // 监听响应完成
    res.on('finish', () => {
      const duration = Date.now() - startTime
      logger.info(`[AUDIT] ${action}`, {
        user: req.user?.userId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip
      })
    })

    next()
  }
}

/**
 * 二次确认中间件（用于危险操作）
 */
export function requireConfirmation(req: Request, res: Response, next: NextFunction) {
  const confirmHeader = req.headers['x-confirm-action']

  if (confirmHeader !== 'true') {
    return res.status(400).json({
      error: '需要二次确认',
      message: '请在请求头中添加 X-Confirm-Action: true 以确认此操作'
    })
  }

  next()
}
