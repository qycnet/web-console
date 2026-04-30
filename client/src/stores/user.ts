import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api'

export interface User {
  id: string
  username: string
  role: string
  createdAt?: string
}

export const useUserStore = defineStore('user', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const user = ref<User | null>(null)

  const isLoggedIn = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  async function login(username: string, password: string) {
    const res = await api.auth.login(username, password)
    token.value = res.token
    user.value = { id: res.user.id, username: res.user.username, role: res.user.role }
    localStorage.setItem('token', res.token)
    return res
  }

  async function logout() {
    await api.auth.logout()
    token.value = null
    user.value = null
    localStorage.removeItem('token')
  }

  async function fetchUser() {
    if (!token.value) return
    try {
      const res = await api.auth.me()
      user.value = { id: res.id, username: res.username, role: res.role }
    } catch {
      logout()
    }
  }

  return {
    token,
    user,
    isLoggedIn,
    isAdmin,
    login,
    logout,
    fetchUser
  }
})
