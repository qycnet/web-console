import axios from 'axios'
import type { AxiosInstance } from 'axios'

const instance: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000
})

// 请求拦截器
instance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器
instance.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error.response?.data || error)
  }
)

export const api = {
  auth: {
    login: (username: string, password: string) =>
      instance.post('/auth/login', { username, password }),
    logout: () => instance.post('/auth/logout'),
    me: () => instance.get('/auth/me')
  },

  config: {
    list: () => instance.get('/config'),
    get: (key: string) => instance.get(`/config/${key}`),
    update: (key: string, value: any) => instance.put(`/config/${key}`, { value }),
    reload: () => instance.post('/config/reload'),
    backup: () => instance.get('/config/backup'),
    restore: (backupId: string) => instance.post(`/config/restore/${backupId}`)
  },

  files: {
    list: (path: string) => instance.get('/files', { params: { path } }),
    read: (path: string) => instance.get('/files/read', { params: { path } }),
    write: (path: string, content: string) => instance.put('/files/write', { path, content }),
    upload: (formData: FormData) => instance.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
    download: (path: string) => instance.get('/files/download', {
      params: { path },
      responseType: 'blob'
    }),
    delete: (path: string) => instance.delete('/files', { params: { path } }),
    move: (oldPath: string, newPath: string) => instance.put('/files/move', { oldPath, newPath }),
    mkdir: (path: string) => instance.post('/files/mkdir', { path })
  },

  skills: {
    list: () => instance.get('/skills'),
    installed: () => instance.get('/skills/installed'),
    install: (skillId: string) => instance.post(`/skills/install/${skillId}`),
    uninstall: (skillId: string) => instance.delete(`/skills/${skillId}`),
    configure: (skillId: string, config: any) => instance.put(`/skills/${skillId}/config`, config)
  },

  agents: {
    list: () => instance.get('/agents'),
    get: (agentId: string) => instance.get(`/agents/${agentId}`),
    start: (agentId: string) => instance.post(`/agents/${agentId}/start`),
    stop: (agentId: string) => instance.post(`/agents/${agentId}/stop`),
    restart: (agentId: string) => instance.post(`/agents/${agentId}/restart`)
  },

  monitor: {
    system: () => instance.get('/monitor/system'),
    processes: () => instance.get('/monitor/processes'),
    logs: (params: { level?: string; search?: string; limit?: number }) =>
      instance.get('/monitor/logs', { params })
  }
}

export default api
