import { create } from 'zustand'

export type BgBackend = 'browser' | 'local'

interface SettingsState {
  bgBackend: BgBackend
  localBgUrl: string
  setBgBackend: (b: BgBackend) => void
  setLocalBgUrl: (url: string) => void
}

const DEFAULT_LOCAL_URL = 'http://localhost:8765'

function read(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore storage failures
  }
}

export const useSettings = create<SettingsState>((set) => ({
  bgBackend: (read('bgBackend', 'browser') as BgBackend) || 'browser',
  localBgUrl: read('localBgUrl', DEFAULT_LOCAL_URL),
  setBgBackend: (b) => {
    write('bgBackend', b)
    set({ bgBackend: b })
  },
  setLocalBgUrl: (url) => {
    write('localBgUrl', url)
    set({ localBgUrl: url })
  },
}))
