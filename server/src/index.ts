import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { createServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import { config } from 'dotenv'
import { logger } from './utils/logger.js'
import authRoutes from './routes/auth.js'
import configRoutes from './routes/config.js'
import filesRoutes from './routes/files.js'
import skillsRoutes from './routes/skills.js'
import agentsRoutes from './routes/agents.js'
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
app.use(helmet())
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 静态文件
app.use(express.static('public'))

// API 路由
app.use('/api/auth', authRoutes)
app.use('/api/config', configRoutes)
app.use('/api/files', filesRoutes)
app.use('/api/skills', skillsRoutes)
app.use('/api/agents', agentsRoutes)
app.use('/api/monitor', monitorRoutes)

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
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
  })

  socket.on('unsubscribe:logs', () => {
    socket.leave('logs')
  })
})

// 错误处理
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Error:', err)
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  })
})

// 启动服务器
httpServer.listen(PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`)
  logger.info(`📚 API docs: http://localhost:${PORT}/api/health`)
})

export { io }
