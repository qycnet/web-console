import { ref } from 'vue'

interface ErrorInfo {
  id: string
  message: string
  stack?: string
  timestamp: Date
  component?: string
}

const errors = ref<ErrorInfo[]>([])

export function useErrorHandler() {
  function captureError(error: Error, component?: string) {
    const errorInfo: ErrorInfo = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      message: error.message,
      stack: error.stack,
      timestamp: new Date(),
      component
    }

    errors.value.push(errorInfo)

    // 保持最近 50 条错误
    if (errors.value.length > 50) {
      errors.value.shift()
    }

    // 发送到后端记录
    sendErrorToBackend(errorInfo)

    return errorInfo
  }

  async function sendErrorToBackend(error: ErrorInfo) {
    try {
      await fetch('/api/monitor/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(error)
      })
    } catch {
      // 忽略发送错误
    }
  }

  function clearErrors() {
    errors.value = []
  }

  function getErrors() {
    return errors.value
  }

  return {
    errors,
    captureError,
    clearErrors,
    getErrors
  }
}

// 全局错误处理器
export function setupGlobalErrorHandler() {
  // Vue 错误
  if (typeof window !== 'undefined') {
    window.onerror = (message, source, lineno, colno, error) => {
      console.error('[Global Error]', { message, source, lineno, colno, error })
      if (error) {
        useErrorHandler().captureError(error)
      }
      return false
    }

    // Promise 未捕获错误
    window.addEventListener('unhandledrejection', (event) => {
      console.error('[Unhandled Rejection]', event.reason)
      if (event.reason instanceof Error) {
        useErrorHandler().captureError(event.reason)
      }
    })
  }
}
