import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs-extra'
import bcrypt from 'bcrypt'

const OPENCLAW_DIR = process.env.OPENCLAW_DIR || path.join(process.env.HOME || '', '.openclaw')
const DB_PATH = path.join(OPENCLAW_DIR, 'web-console.db')

// 确保数据库目录存在
fs.ensureDirSync(OPENCLAW_DIR)

const db = new Database(DB_PATH)

// 初始化数据库表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`)

// 初始化默认管理员账户
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin')
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync('admin123', 10)
  db.prepare(`
    INSERT INTO users (id, username, password, role)
    VALUES (?, ?, ?, ?)
  `).run('user-1', 'admin', hashedPassword, 'admin')
}

export const database = {
  getUserByUsername: (username: string) => {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any
  },

  getUserById: (id: string) => {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any
  },

  createUser: (id: string, username: string, password: string, role: string = 'user') => {
    const hashedPassword = bcrypt.hashSync(password, 10)
    return db.prepare(`
      INSERT INTO users (id, username, password, role)
      VALUES (?, ?, ?, ?)
    `).run(id, username, hashedPassword, role)
  },

  getSetting: (key: string) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
    return row ? row.value : null
  },

  setSetting: (key: string, value: string) => {
    return db.prepare(`
      INSERT OR REPLACE INTO settings (key, value)
      VALUES (?, ?)
    `).run(key, value)
  }
}

export { db }
