import { describe, expect, it } from 'vitest'
import { createHistory, commitHistory, redoHistory, undoHistory } from './history'
import { createEmptyDocument } from './project'

describe('drawing history', () => {
  it('undoes and redoes document snapshots', () => {
    const initial = createEmptyDocument(100, 100)
    const next = { ...initial, canvas: { ...initial.canvas, width: 200 } }
    const history = commitHistory(createHistory(initial), next)

    const undone = undoHistory(history)
    expect(undone.present.canvas.width).toBe(100)

    const redone = redoHistory(undone)
    expect(redone.present.canvas.width).toBe(200)
  })
})
