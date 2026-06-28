import { create } from 'zustand'

export type PreviewBg = 'transparent' | 'navy' | 'ivory' | 'white' | 'black'

const KEY = 'previewBg'
const VALUES: PreviewBg[] = ['transparent', 'navy', 'ivory', 'white', 'black']

function getInitial(): PreviewBg {
  if (typeof window === 'undefined') return 'transparent'
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && (VALUES as string[]).includes(saved)) return saved as PreviewBg
  } catch {
    // ignore storage failures (private mode, etc.)
  }
  return 'transparent'
}

function apply(bg: PreviewBg): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-preview-bg', bg)
  try {
    localStorage.setItem(KEY, bg)
  } catch {
    // ignore storage failures (private mode, etc.)
  }
}

interface PreviewBgState {
  previewBg: PreviewBg
  setPreviewBg: (bg: PreviewBg) => void
}

export const usePreviewBg = create<PreviewBgState>((set) => {
  const initial = getInitial()
  apply(initial)
  return {
    previewBg: initial,
    setPreviewBg: (bg) => {
      apply(bg)
      set({ previewBg: bg })
    },
  }
})
