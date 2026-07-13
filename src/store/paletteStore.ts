import { create } from 'zustand'
import type { RGB } from '../lib/image/color'

export interface SavedPalette {
  id: string
  name: string
  colors: RGB[]
  createdAt: number
}

const STORAGE_KEY = 'savedPalettes'

function isRGB(v: unknown): v is RGB {
  if (typeof v !== 'object' || v === null) return false
  const c = v as Record<string, unknown>
  return typeof c.r === 'number' && typeof c.g === 'number' && typeof c.b === 'number'
}

/** Parse persisted JSON defensively; malformed input yields an empty list. */
export function parseSavedPalettes(json: string | null): SavedPalette[] {
  if (!json) return []
  try {
    const raw: unknown = JSON.parse(json)
    if (!Array.isArray(raw)) return []
    return raw.filter((p): p is SavedPalette => {
      if (typeof p !== 'object' || p === null) return false
      const s = p as Record<string, unknown>
      return (
        typeof s.id === 'string' &&
        typeof s.name === 'string' &&
        typeof s.createdAt === 'number' &&
        Array.isArray(s.colors) &&
        s.colors.length > 0 &&
        s.colors.every(isRGB)
      )
    })
  } catch {
    return []
  }
}

function read(): SavedPalette[] {
  if (typeof window === 'undefined') return []
  try {
    return parseSavedPalettes(localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

function persist(list: SavedPalette[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // ignore storage failures (quota, private mode)
  }
}

interface PaletteStoreState {
  palettes: SavedPalette[]
  savePalette: (name: string, colors: RGB[]) => void
  removePalette: (id: string) => void
}

export const usePaletteStore = create<PaletteStoreState>((set) => ({
  palettes: read(),
  savePalette: (name, colors) =>
    set((s) => {
      const entry: SavedPalette = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        colors: colors.map((c) => ({ ...c })),
        createdAt: Date.now(),
      }
      const next = [...s.palettes, entry]
      persist(next)
      return { palettes: next }
    }),
  removePalette: (id) =>
    set((s) => {
      const next = s.palettes.filter((p) => p.id !== id)
      persist(next)
      return { palettes: next }
    }),
}))
