import { ref, onMounted, onUnmounted } from 'vue'
import { io, Socket } from 'socket.io-client'

export function useWebSocket() {
  const socket = ref<Socket | null>(null)
  const isConnected = ref(false)
  const logs = ref<string[]>([])

  function connect(url: string = window.location.origin) {
    if (socket.value?.connected) return

    socket.value = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    })

    socket.value.on('connect', () => {
      isConnected.value = true
      console.log('[WebSocket] Connected')
    })

    socket.value.on('disconnect', () => {
      isConnected.value = false
      console.log('[WebSocket] Disconnected')
    })

    socket.value.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error)
    })

    // 接收实时日志
    socket.value.on('log', (data: { level: string; message: string; timestamp: string }) => {
      const logLine = `[${data.timestamp}] [${data.level.toUpperCase()}] ${data.message}`
      logs.value.push(logLine)
      // 保持最近 500 条日志
      if (logs.value.length > 500) {
        logs.value.shift()
      }
    })
  }

  function disconnect() {
    if (socket.value) {
      socket.value.disconnect()
      socket.value = null
      isConnected.value = false
    }
  }

  function subscribeLogs() {
    socket.value?.emit('subscribe:logs')
  }

  function unsubscribeLogs() {
    socket.value?.emit('unsubscribe:logs')
  }

  function clearLogs() {
    logs.value = []
  }

  return {
    socket,
    isConnected,
    logs,
    connect,
    disconnect,
    subscribeLogs,
    unsubscribeLogs,
    clearLogs
  }
}
