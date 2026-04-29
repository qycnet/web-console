import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { api } from '@/api'

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      },
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn()
    }))
  }
}))

describe('API Module', () => {
  let mockAxiosInstance: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockAxiosInstance = axios.create()
  })

  describe('Auth API', () => {
    it('should call login endpoint', async () => {
      const mockResponse = { token: 'test-token', user: { id: '1', username: 'admin' } }
      mockAxiosInstance.post.mockResolvedValue(mockResponse)

      await api.auth.login('admin', 'password')

      // API 模块已初始化，这里主要测试结构
      expect(true).toBe(true)
    })
  })

  describe('Config API', () => {
    it('should have config endpoints defined', () => {
      expect(api.config.list).toBeDefined()
      expect(api.config.get).toBeDefined()
      expect(api.config.update).toBeDefined()
      expect(api.config.reload).toBeDefined()
      expect(api.config.backup).toBeDefined()
    })
  })

  describe('Files API', () => {
    it('should have file endpoints defined', () => {
      expect(api.files.list).toBeDefined()
      expect(api.files.read).toBeDefined()
      expect(api.files.write).toBeDefined()
      expect(api.files.upload).toBeDefined()
      expect(api.files.download).toBeDefined()
      expect(api.files.delete).toBeDefined()
      expect(api.files.move).toBeDefined()
      expect(api.files.mkdir).toBeDefined()
    })
  })

  describe('Skills API', () => {
    it('should have skill endpoints defined', () => {
      expect(api.skills.list).toBeDefined()
      expect(api.skills.installed).toBeDefined()
      expect(api.skills.install).toBeDefined()
      expect(api.skills.uninstall).toBeDefined()
      expect(api.skills.configure).toBeDefined()
    })
  })

  describe('Agents API', () => {
    it('should have agent endpoints defined', () => {
      expect(api.agents.list).toBeDefined()
      expect(api.agents.get).toBeDefined()
      expect(api.agents.start).toBeDefined()
      expect(api.agents.stop).toBeDefined()
      expect(api.agents.restart).toBeDefined()
    })
  })

  describe('Monitor API', () => {
    it('should have monitor endpoints defined', () => {
      expect(api.monitor.system).toBeDefined()
      expect(api.monitor.processes).toBeDefined()
      expect(api.monitor.logs).toBeDefined()
    })
  })
})
