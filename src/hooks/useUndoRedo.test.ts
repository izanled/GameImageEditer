import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { useUndoRedo } from './useUndoRedo'

function setup() {
  return renderHook(() => {
    const [n, setN] = useState(0)
    const history = useUndoRedo({ n }, (v) => setN(v.n))
    return { n, setN, history }
  })
}

async function settle(ms = 600) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useUndoRedo', () => {
  it('records a change after the quiet period and undoes/redoes it', async () => {
    const { result } = setup()
    expect(result.current.history.canUndo).toBe(false)

    act(() => result.current.setN(1))
    await settle()
    expect(result.current.history.canUndo).toBe(true)

    act(() => result.current.history.undo())
    expect(result.current.n).toBe(0)
    expect(result.current.history.canRedo).toBe(true)

    act(() => result.current.history.redo())
    expect(result.current.n).toBe(1)
    expect(result.current.history.canRedo).toBe(false)
  })

  it('coalesces rapid changes into a single history entry', async () => {
    const { result } = setup()
    act(() => result.current.setN(1))
    await settle(100)
    act(() => result.current.setN(2))
    await settle(100)
    act(() => result.current.setN(3))
    await settle()

    act(() => result.current.history.undo())
    expect(result.current.n).toBe(0)
    expect(result.current.history.canUndo).toBe(false)
  })

  it('undo during a pending burst reverts to the burst base', async () => {
    const { result } = setup()
    act(() => result.current.setN(1))
    await settle()
    act(() => result.current.setN(2)) // burst not yet committed
    act(() => result.current.history.undo())
    expect(result.current.n).toBe(1)
    act(() => result.current.history.undo())
    expect(result.current.n).toBe(0)
  })

  it('a new change clears the redo stack', async () => {
    const { result } = setup()
    act(() => result.current.setN(1))
    await settle()
    act(() => result.current.history.undo())
    expect(result.current.history.canRedo).toBe(true)
    act(() => result.current.setN(5))
    await settle()
    expect(result.current.history.canRedo).toBe(false)
  })

  it('clear drops history and adopts the current value as baseline', async () => {
    const { result } = setup()
    act(() => result.current.setN(1))
    await settle()
    act(() => result.current.history.clear())
    expect(result.current.history.canUndo).toBe(false)
    act(() => result.current.history.undo())
    expect(result.current.n).toBe(1)
  })

  it('binds Ctrl+Z / Ctrl+Y on window', async () => {
    const { result } = setup()
    act(() => result.current.setN(1))
    await settle()

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))
    })
    expect(result.current.n).toBe(0)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }))
    })
    expect(result.current.n).toBe(1)
  })

  it('ignores shortcuts while typing in a text input', async () => {
    const { result } = setup()
    act(() => result.current.setN(1))
    await settle()

    const input = document.createElement('input')
    input.type = 'text'
    document.body.appendChild(input)
    input.focus()
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    })
    expect(result.current.n).toBe(1)
    input.remove()
  })
})
