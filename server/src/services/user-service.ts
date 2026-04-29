import Database from 'better-sqlite3'
import bcrypt from 'bcrypt'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { logger } from '../utils/logger.js'

export interface User {
  id: string
  username: string
  email?: string
  role: 'admin' | 'user' | 'viewer'
  status: 'active' | 'inactive' | 'locked'
  createdAt: Date
  updatedAt: Date
  lastLoginAt?: Date
  loginCount: number
}

export interface UserCreateInput {
  username: string
  password: string
  email?: string
  role?: 'admin' | 'user' | 'viewer'
}

export interface UserUpdateInput {
  email?: string
  role?: 'admin' | 'user' | 'viewer'
  status?: 'active' | 'inactive' | 'locked'
  password?: string
}

export interface AuditLog {
  id: string
  userId: string
  action: string
  resource: string
  details: string
  ip: string
  userAgent: string
  timestamp: Date
}

class UserService {
  private db: Database.Database

  constructor(database: Database.Database) {
    this.db = database
    this.initTables()
  }

  /**
   * 初始化用户表
   */
  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        role TEXT DEFAULT 'user',
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login_at DATETIME,
        login_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        details TEXT,
        ip TEXT,
        user_agent TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
    `)

    // 创建默认管理员
    this.createDefaultAdmin()
  }

  /**
   * 创建默认管理员账户
   */
  private async createDefaultAdmin(): Promise<void> {
    const adminExists = this.db.prepare('SELECT id FROM users WHERE username = ?').get('admin')
    if (!adminExists) {
      const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(4).toString('hex')
      const hashedPassword = await bcrypt.hash(adminPassword, 10)
      this.db.prepare(`
        INSERT INTO users (id, username, password, role, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuidv4(), 'admin', hashedPassword, 'admin', 'active')
      logger.info(`Default admin account created (username: admin, password: ${adminPassword})`)
      console.log(`\n⚠️  [DEFAULT ADMIN] username: admin, password: ${adminPassword}\n`)
    }
  }

  /**
   * 创建用户
   */
  async createUser(input: UserCreateInput): Promise<User> {
    const existingUser = this.db.prepare('SELECT id FROM users WHERE username = ?').get(input.username)
    if (existingUser) {
      throw new Error('用户名已存在')
    }

    const hashedPassword = await bcrypt.hash(input.password, 10)
    const id = uuidv4()

    this.db.prepare(`
      INSERT INTO users (id, username, password, email, role, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.username, hashedPassword, input.email || null, input.role || 'user', 'active')

    logger.info(`User created: ${input.username}`)
    return this.getUserById(id)!
  }

  /**
   * 获取用户列表
   */
  getUsers(page: number = 1, limit: number = 20): User[] {
    const offset = (page - 1) * limit
    const rows = this.db.prepare(`
      SELECT id, username, email, role, status, created_at, updated_at, last_login_at, login_count
      FROM users
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as any[]

    return rows.map(this.mapRowToUser)
  }

  /**
   * 根据 ID 获取用户
   */
  getUserById(id: string): User | null {
    const row = this.db.prepare(`
      SELECT id, username, email, role, status, created_at, updated_at, last_login_at, login_count
      FROM users WHERE id = ?
    `).get(id) as any

    return row ? this.mapRowToUser(row) : null
  }

  /**
   * 根据用户名获取用户
   */
  getUserByUsername(username: string): (User & { password: string }) | null {
    const row = this.db.prepare(`
      SELECT * FROM users WHERE username = ?
    `).get(username) as any

    return row ? { ...this.mapRowToUser(row), password: row.password } : null
  }

  /**
   * 更新用户
   */
  async updateUser(id: string, input: UserUpdateInput): Promise<User> {
    const user = this.getUserById(id)
    if (!user) {
      throw new Error('用户不存在')
    }

    const updates: string[] = []
    const values: any[] = []

    if (input.email !== undefined) {
      updates.push('email = ?')
      values.push(input.email)
    }
    if (input.role !== undefined) {
      updates.push('role = ?')
      values.push(input.role)
    }
    if (input.status !== undefined) {
      updates.push('status = ?')
      values.push(input.status)
    }
    if (input.password !== undefined) {
      updates.push('password = ?')
      values.push(await bcrypt.hash(input.password, 10))
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP')
      values.push(id)

      this.db.prepare(`
        UPDATE users SET ${updates.join(', ')} WHERE id = ?
      `).run(...values)

      logger.info(`User updated: ${id}`)
    }

    return this.getUserById(id)!
  }

  /**
   * 删除用户
   */
  deleteUser(id: string): void {
    const user = this.getUserById(id)
    if (!user) {
      throw new Error('用户不存在')
    }

    if (user.username === 'admin') {
      throw new Error('不能删除管理员账户')
    }

    this.db.prepare('DELETE FROM users WHERE id = ?').run(id)
    logger.info(`User deleted: ${id}`)
  }

  /**
   * 验证用户登录
   */
  async validateLogin(username: string, password: string, ip: string): Promise<User | null> {
    const user = this.getUserByUsername(username)
    if (!user) {
      return null
    }

    if (user.status === 'locked') {
      throw new Error('账户已被锁定')
    }

    if (user.status === 'inactive') {
      throw new Error('账户已停用')
    }

    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      return null
    }

    // 更新登录信息
    this.db.prepare(`
      UPDATE users
      SET last_login_at = CURRENT_TIMESTAMP, login_count = login_count + 1
      WHERE id = ?
    `).run(user.id)

    // 记录审计日志
    this.addAuditLog(user.id, 'login', 'auth', 'User logged in', ip)

    return user
  }

  /**
   * 修改密码
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = this.getUserByUsername(
      this.db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any
    )
    if (!user) {
      throw new Error('用户不存在')
    }

    const validPassword = await bcrypt.compare(oldPassword, user.password)
    if (!validPassword) {
      throw new Error('原密码错误')
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10)
    this.db.prepare(`
      UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(hashedPassword, userId)

    logger.info(`Password changed for user: ${userId}`)
  }

  /**
   * 添加审计日志
   */
  addAuditLog(
    userId: string,
    action: string,
    resource: string,
    details: string,
    ip: string = '',
    userAgent: string = ''
  ): void {
    this.db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, resource, details, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), userId, action, resource, details, ip, userAgent)
  }

  /**
   * 获取审计日志
   */
  getAuditLogs(
    userId?: string,
    action?: string,
    startDate?: Date,
    endDate?: Date,
    page: number = 1,
    limit: number = 50
  ): AuditLog[] {
    let sql = 'SELECT * FROM audit_logs WHERE 1=1'
    const params: any[] = []

    if (userId) {
      sql += ' AND user_id = ?'
      params.push(userId)
    }
    if (action) {
      sql += ' AND action = ?'
      params.push(action)
    }
    if (startDate) {
      sql += ' AND timestamp >= ?'
      params.push(startDate.toISOString())
    }
    if (endDate) {
      sql += ' AND timestamp <= ?'
      params.push(endDate.toISOString())
    }

    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?'
    params.push(limit, (page - 1) * limit)

    const rows = this.db.prepare(sql).all(...params) as any[]
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      action: row.action,
      resource: row.resource,
      details: row.details,
      ip: row.ip,
      userAgent: row.user_agent,
      timestamp: new Date(row.timestamp)
    }))
  }

  /**
   * 映射数据库行到用户对象
   */
  private mapRowToUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : undefined,
      loginCount: row.login_count || 0
    }
  }

  /**
   * 获取用户总数
   */
  getUserCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM users').get() as any
    return row.count
  }
}

export { UserService }
