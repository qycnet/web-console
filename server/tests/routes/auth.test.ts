import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import authRoutes from '../src/routes/auth.js'

// Mock database
vi.mock('../src/services/database.js', () => ({
  db: {
    getUserByUsername: vi.fn(),
    getUserById: vi.fn()
  }
}))

import { db } from '../src/services/database.js'

const app = express()
app.use(express.json())
app.use('/api/auth', authRoutes)

describe('Auth Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/auth/login', () => {
    it('should return token for local request', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '127.0.0.1')
        .send({ username: 'test', password: 'test' })

      expect(response.status).toBe(200)
      expect(response.body.token).toBeDefined()
      expect(response.body.user.role).toBe('admin')
    })

    it('should return 400 for missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})

      expect(response.status).toBe(400)
      expect(response.body.error).toBeDefined()
    })

    it('should return 401 for invalid credentials', async () => {
      vi.mocked(db.getUserByUsername).mockReturnValue(null)

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'wrong', password: 'wrong' })

      expect(response.status).toBe(401)
    })
  })

  describe('POST /api/auth/logout', () => {
    it('should return success message', async () => {
      const response = await request(app)
        .post('/api/auth/logout')

      expect(response.status).toBe(200)
      expect(response.body.message).toBe('已登出')
    })
  })

  describe('GET /api/auth/me', () => {
    it('should return 401 without token', async () => {
      const response = await request(app)
        .get('/api/auth/me')

      expect(response.status).toBe(401)
    })
  })
})
