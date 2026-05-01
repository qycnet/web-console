import { EventEmitter } from 'events'
import fs from 'fs-extra'
import path from 'path'
import crypto from 'crypto'
import { logger } from '../utils/logger.js'

export interface DeviceInfo {
  id: string
  name: string
  type: 'browser' | 'mobile' | 'desktop' | 'api' | 'unknown'
  platform: string
  browser: string
  ip: string
  userAgent: string
  lastActive: string
  firstSeen: string
  online: boolean
  sessions: number
  currentSessionId?: string
}

export interface SessionInfo {
  id: string
  deviceId: string
  userId: string
  username: string
  token: string
  ip: string
  userAgent: string
  deviceInfo: {
    type: string
    platform: string
    browser: string
  }
  createdAt: string
  lastActive: string
  expiresAt: string
  active: boolean
}

class DeviceService extends EventEmitter {
  private devices: Map<string, DeviceInfo> = new Map()
  private sessions: Map<string, SessionInfo> = new Map()
  private dataDir: string
  private devicesFilePath: string
  private sessionsFilePath: string

  constructor() {
    super()
    const openclawDir = process.env.OPENCLAW_DIR || path.join(process.env.HOME || '', '.openclaw')
    this.dataDir = path.join(openclawDir, 'data')
    this.devicesFilePath = path.join(this.dataDir, 'devices.json')
    this.sessionsFilePath = path.join(this.dataDir, 'sessions.json')
  }

  async init(): Promise<void> {
    try {
      await fs.ensureDir(this.dataDir)
      if (await fs.pathExists(this.devicesFilePath)) {
        const data = await fs.readJson(this.devicesFilePath) as Record<string, DeviceInfo>
        for (const [key, val] of Object.entries(data)) {
          this.devices.set(key, val)
        }
      }
      if (await fs.pathExists(this.sessionsFilePath)) {
        const data = await fs.readJson(this.sessionsFilePath) as Record<string, SessionInfo>
        for (const [key, val] of Object.entries(data)) {
          this.sessions.set(key, val)
        }
      }
      logger.info(`Device service initialized: ${this.devices.size} devices, ${this.sessions.size} sessions`)
    } catch (error) {
      logger.error('Failed to init device service:', error)
    }
  }

  private async persist(): Promise<void> {
    try {
      await fs.ensureDir(this.dataDir)
      const devicesObj: Record<string, DeviceInfo> = {}
      this.devices.forEach((v, k) => { devicesObj[k] = v })
      await fs.writeJson(this.devicesFilePath, devicesObj, { spaces: 2 })

      const sessionsObj: Record<string, SessionInfo> = {}
      this.sessions.forEach((v, k) => { sessionsObj[k] = v })
      await fs.writeJson(this.sessionsFilePath, sessionsObj, { spaces: 2 })
    } catch (error) {
      logger.error('Failed to persist device data:', error)
    }
  }

  /**
   * 注册或更新设备信息
   */
  registerDevice(params: {
    ip: string
    userAgent: string
    userId: string
    username: string
    sessionId?: string
  }): { device: DeviceInfo; session: SessionInfo } {
    const { ip, userAgent, userId, username, sessionId } = params
    const ua = this.parseUserAgent(userAgent)
    const deviceId = this.generateDeviceId(ip, ua)

    let device = this.devices.get(deviceId)
    if (!device) {
      device = {
        id: deviceId,
        name: this.generateDeviceName(ua),
        type: ua.type,
        platform: ua.platform,
        browser: ua.browser,
        ip,
        userAgent,
        lastActive: new Date().toISOString(),
        firstSeen: new Date().toISOString(),
        online: true,
        sessions: 0
      }
      this.devices.set(deviceId, device)
      this.emit('device:new', device)
    } else {
      device.ip = ip
      device.userAgent = userAgent
      device.lastActive = new Date().toISOString()
      device.online = true
      device.type = ua.type
      device.platform = ua.platform
      device.browser = ua.browser
      device.name = this.generateDeviceName(ua)
    }

    // 创建会话记录
    const session: SessionInfo = {
      id: sessionId || crypto.randomUUID(),
      deviceId,
      userId,
      username,
      token: '',
      ip,
      userAgent,
      deviceInfo: {
        type: ua.type,
        platform: ua.platform,
        browser: ua.browser
      },
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7天
      active: true
    }

    this.sessions.set(session.id, session)
    device.sessions = this.getActiveSessionsByDevice(deviceId).length
    device.currentSessionId = session.id
    this.emit('session:new', session)
    this.persist()
    return { device, session }
  }

  /**
   * 更新会话活跃时间
   */
  updateSessionActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.lastActive = new Date().toISOString()
      const device = this.devices.get(session.deviceId)
      if (device) {
        device.lastActive = new Date().toISOString()
      }
    }
  }

  /**
   * 结束会话（登出）
   */
  endSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false
    session.active = false
    const device = this.devices.get(session.deviceId)
    if (device) {
      device.sessions = this.getActiveSessionsByDevice(session.deviceId).length
      if (device.sessions === 0) {
        device.online = false
        device.currentSessionId = undefined
      }
    }
    this.emit('session:ended', session)
    this.persist()
    return true
  }

  /**
   * 结束设备所有会话（强制下线）
   */
  revokeDevice(deviceId: string): number {
    let count = 0
    for (const [id, session] of this.sessions) {
      if (session.deviceId === deviceId && session.active) {
        session.active = false
        count++
      }
    }
    const device = this.devices.get(deviceId)
    if (device) {
      device.online = false
      device.sessions = 0
      device.currentSessionId = undefined
    }
    this.emit('device:revoked', deviceId)
    this.persist()
    return count
  }

  /**
   * 结束用户所有会话
   */
  revokeUserSessions(userId: string): number {
    let count = 0
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.active) {
        session.active = false
        count++
      }
    }
    this.persist()
    return count
  }

  /**
   * 获取所有设备列表
   */
  getDevices(): DeviceInfo[] {
    const now = Date.now()
    // 清理5分钟无活跃的设备，标记离线
    for (const device of this.devices.values()) {
      const lastActive = new Date(device.lastActive).getTime()
      if (device.online && now - lastActive > 5 * 60 * 1000) {
        device.online = false
      }
    }
    return Array.from(this.devices.values())
      .sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime())
  }

  /**
   * 获取设备详情
   */
  getDevice(deviceId: string): DeviceInfo | undefined {
    return this.devices.get(deviceId)
  }

  /**
   * 获取会话列表
   */
  getSessions(activeOnly: boolean = false): SessionInfo[] {
    let list = Array.from(this.sessions.values())
    if (activeOnly) {
      list = list.filter(s => s.active)
    }
    return list.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime())
  }

  /**
   * 获取指定设备的活动会话
   */
  private getActiveSessionsByDevice(deviceId: string): SessionInfo[] {
    return Array.from(this.sessions.values())
      .filter(s => s.deviceId === deviceId && s.active)
  }

  /**
   * 获取指定用户的设备
   */
  getUserDevices(userId: string): DeviceInfo[] {
    const userSessionIds = new Set<string>()
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        userSessionIds.add(session.deviceId)
      }
    }
    return Array.from(userSessionIds)
      .map(id => this.devices.get(id))
      .filter((d): d is DeviceInfo => d !== undefined)
      .sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime())
  }

  /**
   * 删除旧数据（30天前的非活跃会话和设备）
   */
  async cleanup(): Promise<void> {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    for (const [id, session] of this.sessions) {
      if (!session.active && new Date(session.lastActive).getTime() < thirtyDaysAgo) {
        this.sessions.delete(id)
      }
    }
    for (const [id, device] of this.devices) {
      if (!device.online && new Date(device.lastActive).getTime() < thirtyDaysAgo) {
        const hasActiveSession = Array.from(this.sessions.values())
          .some(s => s.deviceId === id && s.active)
        if (!hasActiveSession) {
          this.devices.delete(id)
        }
      }
    }
    await this.persist()
  }

  /**
   * 从 User-Agent 解析设备类型
   */
  private parseUserAgent(ua: string): { type: DeviceInfo['type']; platform: string; browser: string } {
    const lower = ua.toLowerCase()

    let type: DeviceInfo['type'] = 'unknown'
    let platform = 'unknown'
    let browser = 'unknown'

    if (lower.includes('mobile') || lower.includes('android') || lower.includes('iphone')) {
      type = 'mobile'
    } else if (lower.includes('tablet') || lower.includes('ipad')) {
      type = 'mobile'
    } else if (lower.includes('electron') || lower.includes('node')) {
      type = 'desktop'
    } else if (lower.includes('curl') || lower.includes('wget') || lower.includes('python')) {
      type = 'api'
    } else {
      type = 'browser'
    }

    if (lower.includes('windows')) platform = 'Windows'
    else if (lower.includes('mac')) platform = 'macOS'
    else if (lower.includes('linux')) platform = 'Linux'
    else if (lower.includes('android')) platform = 'Android'
    else if (lower.includes('iphone') || lower.includes('ios')) platform = 'iOS'

    if (lower.includes('chrome') && !lower.includes('edg')) browser = 'Chrome'
    else if (lower.includes('firefox')) browser = 'Firefox'
    else if (lower.includes('safari') && !lower.includes('chrome')) browser = 'Safari'
    else if (lower.includes('edg')) browser = 'Edge'

    return { type, platform, browser }
  }

  /**
   * 生成设备唯一标识
   */
  private generateDeviceId(ip: string, ua: { type: string; platform: string; browser: string }): string {
    const hash = crypto.createHash('md5')
      .update(`${ip}-${ua.platform}-${ua.browser}-${ua.type}`)
      .digest('hex')
      .substring(0, 12)
    return `dev-${hash}`
  }

  /**
   * 生成设备显示名称
   */
  private generateDeviceName(ua: { type: string; platform: string; browser: string }): string {
    const typeNames: Record<string, string> = {
      browser: '浏览器',
      mobile: '手机',
      desktop: '桌面设备',
      api: 'API 客户端',
      unknown: '未知设备'
    }
    const parts = [ua.platform !== 'unknown' ? ua.platform : '', typeNames[ua.type] || ua.type]
    if (ua.browser !== 'unknown') {
      parts.push(`· ${ua.browser}`)
    }
    return parts.join(' ')
  }

  /**
   * 将会话标记为与 token 绑定
   * 在 JWT 校验时调用
   */
  bindTokenToSession(sessionId: string, token: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.token = token.substring(0, 20) + '...'
    }
  }
}

export const deviceService = new DeviceService()
