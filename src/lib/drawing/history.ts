import { cloneDocument } from './geometry'
import type { DrawingDocument, DrawingHistory } from './types'

const MAX_HISTORY = 80

export function createHistory(document: DrawingDocument): DrawingHistory {
  return {
    past: [],
    present: cloneDocument(document),
    future: [],
  }
}

export function commitHistory(history: DrawingHistory, next: DrawingDocument): DrawingHistory {
  return {
    past: [...history.past, cloneDocument(history.present)].slice(-MAX_HISTORY),
    present: cloneDocument(next),
    future: [],
  }
}

export function undoHistory(history: DrawingHistory): DrawingHistory {
  const previous = history.past.at(-1)
  if (!previous) return history
  return {
    past: history.past.slice(0, -1),
    present: cloneDocument(previous),
    future: [cloneDocument(history.present), ...history.future],
  }
}

export function redoHistory(history: DrawingHistory): DrawingHistory {
  const next = history.future[0]
  if (!next) return history
  return {
    past: [...history.past, cloneDocument(history.present)].slice(-MAX_HISTORY),
    present: cloneDocument(next),
    future: history.future.slice(1),
  }
}
