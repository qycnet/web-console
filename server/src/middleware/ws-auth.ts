import { Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { logger } from '../utils/logger.js'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required')
}

/**
 * WebSocket JWT 认证中间件
 * 在连接建立时验证 token，拒绝未授权连接
 */
export function wsAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token

  if (!token) {
    logger.warn(`WebSocket connection rejected: no token provided (socket: ${socket.id})`)
    return next(new Error('未授权：缺少 Token'))
  }

  try {
    const decoded = jwt.verify(token as string, JWT_SECRET) as any
    ;(socket as any).user = { userId: decoded.userId, role: decoded.role }
    logger.info(`WebSocket authenticated: user=${decoded.userId} role=${decoded.role} (socket: ${socket.id})`)
    next()
  } catch (err) {
    logger.warn(`WebSocket connection rejected: invalid token (socket: ${socket.id})`)
    next(new Error('未授权：Token 无效或已过期'))
  }
}
