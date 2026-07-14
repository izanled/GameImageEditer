import { useCallback, useEffect, useRef, useState } from 'react'

export interface UndoRedo {
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  /** Drop all history and adopt the current value as the new baseline. */
  clear: () => void
}

const COALESCE_MS = 500
const MAX_HISTORY = 100

function shallowEqual(a: object, b: object): boolean {
  const ka = Object.keys(a) as (keyof typeof a)[]
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => Object.is(a[k], (b as typeof a)[k]))
}

/**
 * Undo/redo over a snapshot of tool settings.
 *
 * `value` is a plain object rebuilt each render from the states to track;
 * changes are detected by shallow comparison, and rapid bursts (slider drags)
 * coalesce into a single history entry after a quiet period. `restore` must
 * write a snapshot back into the underlying states.
 *
 * Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z) are bound globally while mounted, except
 * when focus is in a text field.
 */
export function useUndoRedo<T extends object>(value: T, restore: (v: T) => void): UndoRedo {
  const past = useRef<T[]>([])
  const future = useRef<T[]>([])
  /** Last committed snapshot; during a burst it stays at the burst's base. */
  const committed = useRef<T>(value)
  const latest = useRef<T>(value)
  const skipNext = useRef(false)
  const timer = useRef<number | null>(null)
  const restoreRef = useRef(restore)
  const [flags, setFlags] = useState({ canUndo: false, canRedo: false })

  latest.current = value
  restoreRef.current = restore

  const syncFlags = useCallback(() => {
    setFlags((f) => {
      const canUndo = past.current.length > 0
      const canRedo = future.current.length > 0
      return f.canUndo === canUndo && f.canRedo === canRedo ? f : { canUndo, canRedo }
    })
  }, [])

  // Change detection runs every render; the shallowEqual guard makes it cheap.
  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false
      committed.current = latest.current
      return
    }
    if (shallowEqual(latest.current, committed.current)) return
    if (timer.current != null) clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      past.current.push(committed.current)
      if (past.current.length > MAX_HISTORY) past.current.shift()
      committed.current = latest.current
      future.current = []
      syncFlags()
    }, COALESCE_MS)
  })

  /** Commit a pending burst immediately (before undo/redo). */
  const flush = useCallback(() => {
    if (timer.current == null) return
    clearTimeout(timer.current)
    timer.current = null
    past.current.push(committed.current)
    if (past.current.length > MAX_HISTORY) past.current.shift()
    committed.current = latest.current
    future.current = []
  }, [])

  const undo = useCallback(() => {
    flush()
    const prev = past.current.pop()
    if (prev === undefined) return
    future.current.push(committed.current)
    committed.current = prev
    skipNext.current = true
    restoreRef.current(prev)
    syncFlags()
  }, [flush, syncFlags])

  const redo = useCallback(() => {
    flush()
    const next = future.current.pop()
    if (next === undefined) return
    past.current.push(committed.current)
    committed.current = next
    skipNext.current = true
    restoreRef.current(next)
    syncFlags()
  }, [flush, syncFlags])

  const clear = useCallback(() => {
    if (timer.current != null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    past.current = []
    future.current = []
    skipNext.current = true
    syncFlags()
  }, [syncFlags])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'TEXTAREA' || target.isContentEditable) return
        if (tag === 'INPUT') {
          const type = (target as HTMLInputElement).type
          if (type === 'text' || type === 'search' || type === 'number') return
        }
      }
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  useEffect(() => {
    return () => {
      if (timer.current != null) clearTimeout(timer.current)
    }
  }, [])

  return { undo, redo, canUndo: flags.canUndo, canRedo: flags.canRedo, clear }
}
