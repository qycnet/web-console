import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useThemeStore } from '@/stores/theme'

describe('Theme Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('should initialize with light theme by default', () => {
    const store = useThemeStore()
    expect(store.isDark).toBe(false)
  })

  it('should toggle theme', () => {
    const store = useThemeStore()
    expect(store.isDark).toBe(false)

    store.toggleTheme()
    expect(store.isDark).toBe(true)

    store.toggleTheme()
    expect(store.isDark).toBe(false)
  })

  it('should persist theme to localStorage', () => {
    const store = useThemeStore()
    store.toggleTheme()

    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('should load theme from localStorage', () => {
    localStorage.setItem('theme', 'dark')
    setActivePinia(createPinia())

    const store = useThemeStore()
    expect(store.isDark).toBe(true)
  })
})
