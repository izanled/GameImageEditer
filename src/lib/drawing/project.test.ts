import { describe, expect, it } from 'vitest'
import { createEmptyDocument, parseDrawingProject, serializeDrawingProject } from './project'

describe('drawing project serialization', () => {
  it('round trips project JSON', () => {
    const document = createEmptyDocument(320, 240)
    const parsed = parseDrawingProject(serializeDrawingProject(document))

    expect(parsed.canvas.width).toBe(320)
    expect(parsed.canvas.height).toBe(240)
    expect(parsed.layers[0]).toMatchObject({ type: 'raster', name: '브러쉬 레이어' })
  })
})
