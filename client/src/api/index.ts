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
    restore: (backupId: string) => instance.post(`/config/restore/${backupId}`)
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
    revokeUser: (userId: string) => instance.post(`/devices/user/${userId}/revoke`)
  }
}

export default api

// Re-export common types used in views
export interface FileItem {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modified: string
}
