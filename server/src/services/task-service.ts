import { EventEmitter } from 'events'
import crypto from 'crypto'
import { logger } from '../utils/logger.js'

export type TaskStatus = 'pending' | 'running' | 'success' | 'failed'

export interface Task {
  id: string
  type: string
  status: TaskStatus
  message?: string
  result?: any
  error?: string
  createdAt: string
  completedAt?: string
}

type TaskRunner = (task: Task, payload?: any) => Promise<any>

class TaskService extends EventEmitter {
  private tasks: Map<string, Task> = new Map()
  private runners: Map<string, TaskRunner> = new Map()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  /**
   * 注册任务处理器
   */
  onTask(type: string, runner: TaskRunner): void {
    this.runners.set(type, runner)
  }

  /**
   * 提交一个异步任务，立即返回 taskId
   */
  submit(type: string, payload?: any): string {
    const task: Task = {
      id: crypto.randomUUID(),
      type,
      status: 'pending',
      createdAt: new Date().toISOString()
    }
    this.tasks.set(task.id, task)
    this.emit('task:new', task)

    // 异步执行（不 await，HTTP 响应先返回）
    this._executeTask(task, payload).catch(err => {
      logger.error(`Task ${task.id} (${type}) execution error:`, err)
    })

    return task.id
  }

  /**
   * 获取任务状态
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId)
  }

  /**
   * 获取所有任务
   */
  getTasks(limit: number = 50, types?: string[]): Task[] {
    let list = Array.from(this.tasks.values())
    if (types && types.length > 0) {
      list = list.filter(t => types.includes(t.type))
    }
    return list
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit)
  }

  /**
   * 清理已完成的任务（默认保留最近 100 条）
   */
  cleanup(keepLatest: number = 100): void {
    const sorted = Array.from(this.tasks.entries())
      .sort(([, a], [, b]) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const toDelete = sorted.slice(keepLatest)
    for (const [id] of toDelete) {
      if (this.tasks.get(id)?.status === 'success' || this.tasks.get(id)?.status === 'failed') {
        this.tasks.delete(id)
      }
    }
  }

  /**
   * 启动定期清理（每 10 分钟清理一次）
   */
  startCleanup(): void {
    if (this.cleanupInterval) return
    this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000)
  }

  /**
   * 停止定期清理
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  private async _executeTask(task: Task, payload?: any): Promise<void> {
    const runner = this.runners.get(task.type)
    if (!runner) {
      task.status = 'failed'
      task.error = `No runner registered for task type: ${task.type}`
      task.completedAt = new Date().toISOString()
      this.emit('task:failed', task)
      return
    }

    task.status = 'running'
    task.message = '执行中...'
    this.emit('task:started', task)

    try {
      const result = await runner(task, payload)
      task.status = 'success'
      task.result = result
      task.message = '完成'
      task.completedAt = new Date().toISOString()
      this.emit('task:completed', task)
    } catch (err: any) {
      task.status = 'failed'
      task.error = err.message || String(err)
      task.completedAt = new Date().toISOString()
      this.emit('task:failed', task)
    }
  }
}

export const taskService = new TaskService()
