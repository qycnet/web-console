import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setupGlobalErrorHandler } from './utils/errorHandler'

// 设置全局错误处理
setupGlobalErrorHandler()

const app = createApp(App)

// Vue 错误处理
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', err, info)
  // 可以在这里上报错误
}

app.use(createPinia())
app.use(router)

app.mount('#app')
