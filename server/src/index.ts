import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { createServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import { config } from 'dotenv'
import { logger } from './utils/logger.js'
import { rateLimiter } from './middleware/auth.js'
import { openclawService } from './services/openclaw-service.js'
import { skillService } from './services/skill-service.js'
import authRoutes from './routes/auth.js'
import configRoutes from './routes/config.js'
import filesRoutes from './routes/files.js'
import skillsRoutes from './routes/skills.js'
import agentsRoutes from './routes/agents.js'
import usersRoutes from './routes/users.js'
import monitorRoutes from './routes/monitor.js'

config()

const app = express()
const httpServer = createServer(app)
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
  }
})

const PORT = process.env.PORT || 3001

// 中间件
app.use(helmet({
  contentSecurityPolicy: false // 开发环境禁用 CSP
}))
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// 速率限制
app.use('/api/', rateLimiter)

// 静态文件
app.use(express.static('public'))

// API 路由
app.use('/api/auth', authRoutes)
app.use('/api/config', configRoutes)
app.use('/api/files', filesRoutes)
app.use('/api/skills', skillsRoutes)
app.use('/api/agents', agentsRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/monitor', monitorRoutes)

// 健康检查
app.get('/api/health', async (req, res) => {
  const openclawInfo = await openclawService.discover()
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    openclaw: openclawInfo ? {
      version: openclawInfo.version,
      installed: true
    } : {
      installed: false
    }
  })
})

// WebSocket 连接
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`)

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`)
  })

  // 实时日志推送
  socket.on('subscribe:logs', () => {
    socket.join('logs')
    logger.info(`Client ${socket.id} subscribed to logs`)
  })

  socket.on('unsubscribe:logs', () => {
    socket.leave('logs')
    logger.info(`Client ${socket.id} unsubscribed from logs`)
  })

  // Agent 状态订阅
  socket.on('subscribe:agents', () => {
    socket.join('agents')
    logger.info(`Client ${socket.id} subscribed to agents`)
  })

  socket.on('unsubscribe:agents', () => {
    socket.leave('agents')
  })
})

// Agent 状态事件转发到 WebSocket
openclawService.on('agent:status', (agent) => {
  io.to('agents').emit('agent:status', agent)
})

openclawService.on('agent:started', (data) => {
  io.to('agents').emit('agent:started', data)
})

openclawService.on('agent:stopped', (data) => {
  io.to('agents').emit('agent:stopped', data)
})

openclawService.on('agent:error', (data) => {
  io.to('agents').emit('agent:error', data)
})

// 错误处理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Error:', err)
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  })
})

// 初始化服务
async function init() {
  try {
    // 发现 OpenClaw
    const openclawInfo = await openclawService.discover()
    if (openclawInfo) {
      logger.info(`OpenClaw found: v${openclawInfo.version} at ${openclawInfo.installDir}`)
    } else {
      logger.warn('OpenClaw not found, running in standalone mode')
    }

    // 初始化技能服务
    await skillService.init()
    logger.info('Skill service initialized')

    // 启动 Agent 监控
    openclawService.monitorAgents()

    // 启动服务器
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`)
      logger.info(`📚 API docs: http://localhost:${PORT}/api/health`)
      logger.info(`🔌 WebSocket: ws://localhost:${PORT}`)
    })
  } catch (error) {
    logger.error('Failed to initialize:', error)
    process.exit(1)
  }
}

init()

export { io }
