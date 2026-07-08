import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

interface Props {
  children: ReactNode
  resetKey?: unknown
}

interface ViewState {
  scale: number
  x: number
  y: number
}

const MIN_SCALE = 0.25
const MAX_SCALE = 16
const DEFAULT_VIEW: ViewState = { scale: 1, x: 0, y: 0 }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export default function ZoomablePreview({ children, resetKey }: Props) {
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW)
  const [panning, setPanning] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  const resetView = useCallback(() => {
    setView(DEFAULT_VIEW)
    setPanning(false)
    lastPoint.current = null
  }, [])

  useEffect(() => {
    resetView()
  }, [resetKey, resetView])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const target = viewport

    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey) return

      event.preventDefault()
      const rect = target.getBoundingClientRect()
      const point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
      const factor = Math.exp(-event.deltaY * 0.0015)

      setView((current) => {
        const nextScale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE)
        const ratio = nextScale / current.scale
        return {
          scale: nextScale,
          x: point.x - (point.x - current.x) * ratio,
          y: point.y - (point.y - current.y) * ratio,
        }
      })
    }

    target.addEventListener('wheel', handleWheel, { passive: false })
    return () => target.removeEventListener('wheel', handleWheel)
  }, [])

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 2) return

    event.preventDefault()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic pointer events used by browser automation may not have an active pointer.
    }
    lastPoint.current = { x: event.clientX, y: event.clientY }
    setPanning(true)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!panning || !lastPoint.current) return

    event.preventDefault()
    const dx = event.clientX - lastPoint.current.x
    const dy = event.clientY - lastPoint.current.y
    lastPoint.current = { x: event.clientX, y: event.clientY }
    setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }))
  }

  function stopPanning(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setPanning(false)
    lastPoint.current = null
  }

  const hasMoved = view.scale !== 1 || view.x !== 0 || view.y !== 0

  return (
    <div className="inline-block max-w-full align-top">
      <div
        ref={viewportRef}
        className={`checkerboard max-w-full overflow-hidden rounded border border-slate-200 dark:border-slate-700 ${
          panning ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onContextMenu={(event) => event.preventDefault()}
        onPointerCancel={stopPanning}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPanning}
      >
        <div
          className="inline-block max-w-full select-none align-top"
          draggable={false}
          style={{
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
            transformOrigin: '0 0',
            willChange: hasMoved ? 'transform' : undefined,
          }}
        >
          {children}
        </div>
      </div>
      <div className="mt-2">
        <button
          type="button"
          onClick={resetView}
          disabled={!hasMoved}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          미리보기 초기화
        </button>
      </div>
    </div>
  )
}
