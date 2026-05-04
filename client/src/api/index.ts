import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig } from 'axios'

/**
 * Custom AxiosInstance type where all HTTP methods return Promise<T> directly
 * (instead of Promise<AxiosResponse<T>>), because the response interceptor
 * strips `.data` from every response.
 */
interface TypedAxiosInstance extends AxiosInstance {
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>
  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>
  put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>
  delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>
  head<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>
  options<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>
  patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>
  postForm<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>
  putForm<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>
  patchForm<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>
}

const instance = axios.create({
  baseURL: '/api',
  timeout: 30000
}) as TypedAxiosInstance

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

// 响应拦截器 - 直接返回 response.data
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
      instance.post<{ token: string; user: { id: string; username: string; role: string } }>('/auth/login', { username, password }),
    logout: () => instance.post('/auth/logout'),
    me: () => instance.get<{ id: string; username: string; role: string }>('/auth/me')
  },

  config: {
    list: () => instance.get('/config'),
    get: (key: string) => instance.get(`/config/${key}`),
    update: (key: string, value: any) => instance.put(`/config/${key}`, { value }),
    reload: () => instance.post('/config/reload'),
    backup: () => instance.get('/config/backup'),
    restore: (backupId: string) => instance.post(`/config/restore/${backupId}`),

    // ====== 供应商管理（P2 新增） ======
    providers: {
      list: () => instance.get('/config/providers'),
      get: (name: string) => instance.get(`/config/providers/${name}`),
      create: (name: string, options?: {
        apiKey?: string
        baseUrl?: string
        defaultModel?: string
        defaultTemperature?: number
        defaultMaxTokens?: number
      }) => instance.post('/config/providers', { name, ...options }),
      update: (name: string, updates: {
        apiKey?: string
        baseUrl?: string
        defaultModel?: string
        defaultTemperature?: number
        defaultMaxTokens?: number
        models?: Array<{ id: string; name?: string }>
      }) => instance.put(`/config/providers/${name}`, updates),
      delete: (name: string) => instance.delete(`/config/providers/${name}`),

      // ====== 模型管理 ======
      addModel: (providerName: string, id: string, name?: string) =>
        instance.post(`/config/providers/${providerName}/models`, { id, name }),
      removeModel: (providerName: string, modelId: string) =>
        instance.delete(`/config/providers/${providerName}/models/${modelId}`),
      setDefaultModel: (providerName: string, modelId: string) =>
        instance.put(`/config/providers/${providerName}/models/${modelId}/default`),
      listModels: (providerName: string) =>
        instance.get(`/config/providers/${providerName}/models`),
    },

    // ====== 全量模型 ======
    models: {
      list: () => instance.get('/config/models'),
    }
  },

  files: {
    list: (path: string) => instance.get<FileItem[]>('/files', { params: { path } }),
    read: (path: string) => instance.get<string>('/files/read', { params: { path } }),
    write: (path: string, content: string) => instance.put('/files/write', { path, content }),
    upload: (formData: FormData) => instance.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
    batchUpload: (formData: FormData) => instance.post('/files/batch-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000
    }),
    download: (path: string) => instance.get<Blob>('/files/download', {
      params: { path },
      responseType: 'blob'
    }),
    delete: (path: string) => instance.delete('/files', { params: { path } }),
    move: (oldPath: string, newPath: string) => instance.put('/files/move', { oldPath, newPath }),
    mkdir: (path: string) => instance.post('/files/mkdir', { path }),
    chunkInit: (filename: string, fileSize: number, targetDir: string) =>
      instance.post('/files/chunk/init', { filename, fileSize, targetDir }),
    chunkUpload: (formData: FormData) => instance.post('/files/chunk/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
    chunkMerge: (uploadId: string) => instance.post('/files/chunk/merge', { uploadId }),
    chunkStatus: (uploadId: string) => instance.get(`/files/chunk/status/${uploadId}`),
    chunkCancel: (uploadId: string) => instance.delete(`/files/chunk/cancel/${uploadId}`)
  },

  skills: {
    list: (search?: string) => instance.get('/skills', { params: { search } }),
    installed: () => instance.get('/skills/installed'),
    categories: () => instance.get('/skills/categories'),
    install: (skillId: string) => instance.post(`/skills/install/${skillId}`),
    uninstall: (skillId: string) => instance.delete(`/skills/${skillId}`),
    configure: (skillId: string, config: any) => instance.put(`/skills/${skillId}/config`, config),
    toggle: (skillId: string, enabled: boolean) => instance.put(`/skills/${skillId}/toggle`, { enabled })
  },

  // ====== 群聊多 Agent 协作 ======
  chat: {
    group: (data: { agentIds: string[]; message: string; sessionId?: string }) =>
      instance.post('/chat/group', data),
  },

  users: {
    changePassword: (oldPassword: string, newPassword: string) =>
      instance.post('/users/change-password', { oldPassword, newPassword }),
  },

  agents: {
    list: () => instance.get('/agents'),
    get: (agentId: string) => instance.get(`/agents/${agentId}`),
    start: (agentId: string) => instance.post(`/agents/${agentId}/start`),
    stop: (agentId: string) => instance.post(`/agents/${agentId}/stop`),
    restart: (agentId: string) => instance.post(`/agents/${agentId}/restart`),
    delete: (agentId: string) => instance.delete(`/agents/${agentId}`),
    create: (name: string, options?: {
      model?: string
      workspace?: string
      persona?: string
      description?: string
      provider?: string
      temperature?: number
      maxTokens?: number
      avatar?: string
      theme?: string
    }) =>
      instance.post('/agents', { name, ...options }),
    update: (agentId: string, updates: {
      name?: string
      model?: string
      persona?: string
      emoji?: string
      avatar?: string
      theme?: string
      provider?: string
      temperature?: number
      maxTokens?: number
      description?: string
    }) =>
      instance.put(`/agents/${agentId}`, updates),
    models: () => instance.get('/agents/models'),

    // ====== 流式对话（新） ======
    /**
     * 使用 SSE EventSource 流式对话
     * @returns EventSource 实例（用于外部 close）
     */
    stream: (
      agentId: string,
      message: string,
      sessionId: string,
      onToken: (token: string) => void,
      onSessionId: (sid: string) => void,
      onDone: () => void,
      onError: (err: any) => void
    ): EventSource => {
      const params = new URLSearchParams({ message })
      if (sessionId) params.set('sessionId', sessionId)
      // EventSource 不能携带 Authorization header，所以把 token 拼到 query
      const token = localStorage.getItem('token')
      if (token) params.set('token', token)
      const url = `/api/agents/${agentId}/chat/stream?${params.toString()}`
      const eventSource = new EventSource(url)

      eventSource.onmessage = (e) => {
        if (e.data === '[DONE]') {
          eventSource.close()
          onDone()
          return
        }
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'session') {
            onSessionId(data.sessionId)
          } else if (data.token) {
            onToken(data.token)
          } else if (data.error) {
            eventSource.close()
            onError(data.error)
          }
        } catch { /* ignore parse errors */ }
      }

      eventSource.onerror = (e) => {
        eventSource.close()
        onError(e)
      }

      return eventSource
    },

    // ====== 会话管理 ======
    sessions: {
      list: (agentId: string, limit?: number) =>
        instance.get(`/agents/${agentId}/sessions`, { params: { limit } }),
      get: (agentId: string, sessionId: string) =>
        instance.get(`/agents/${agentId}/sessions/${sessionId}`),
      create: (agentId: string, title?: string) =>
        instance.post(`/agents/${agentId}/sessions`, { title }),
      delete: (agentId: string, sessionId: string) =>
        instance.delete(`/agents/${agentId}/sessions/${sessionId}`)
    }
  },

  tasks: {
    get: (taskId: string) => instance.get(`/tasks/${taskId}`),
    list: (limit?: number) => instance.get('/tasks', { params: { limit } })
  },

  monitor: {
    system: () => instance.get('/monitor/system'),
    processes: () => instance.get('/monitor/processes'),
    logs: (params: { level?: string; search?: string; limit?: number }) =>
      instance.get<{ logs: string[]; total: number }>('/monitor/logs', { params }),
    network: () => instance.get('/monitor/network')
  },

  devices: {
    list: () => instance.get('/devices'),
    get: (deviceId: string) => instance.get(`/devices/${deviceId}`),
    revoke: (deviceId: string) => instance.delete(`/devices/${deviceId}`),
    sessions: (activeOnly?: boolean) => instance.get('/devices/sessions', { params: { active: activeOnly } }),
    endSession: (sessionId: string) => instance.post(`/devices/sessions/${sessionId}/end`),
    userDevices: (userId: string) => instance.get(`/devices/user/${userId}`),
    revokeUser: (userId: string) => instance.post(`/devices/user/${userId}/revoke`),
    register: (data?: any) => instance.post('/devices/register', data)
  }
}

export { instance as http }
export default api

// Re-export common types used in views
export interface FileItem {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modified: string
}
