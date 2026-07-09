import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import ToolShell from '../../components/ToolShell'
import { createCanvas, getContext } from '../../lib/image/draw'
import { canvasToBlob, downloadBlob } from '../../lib/image/export'
import { loadImageFromFile } from '../../lib/image/load'
import {
  clamp,
  cloneDocument,
  createShapeLayer,
  findTopLayerAtPoint,
  getSelectionBounds,
  normalizeRect,
  radiansToDegrees,
  snapPoint,
  snapValue,
} from '../../lib/drawing/geometry'
import { commitHistory, createHistory, redoHistory, undoHistory } from '../../lib/drawing/history'
import {
  createEmptyDocument,
  parseDrawingProject,
  serializeDrawingProject,
} from '../../lib/drawing/project'
import { renderDocument } from '../../lib/drawing/render'
import type {
  Bounds,
  DrawingDocument,
  DrawingHistory,
  DrawingLayer,
  FillStyle,
  ImageLayer,
  Point,
  RgbaColor,
  ShapeKind,
  ShapeLayer,
} from '../../lib/drawing/types'
import { getTool } from '../registry'

const tool = getTool('image-editor')!

type ObjectPatch = Partial<Pick<ShapeLayer, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity'>>

type EditorTool = 'select' | 'marquee' | 'shape' | 'pencil' | 'brush' | 'eraser' | 'eyedropper'
const TOOL_BUTTONS: Array<{ mode: EditorTool; label: string; icon: string }> = [
  { mode: 'select', label: '선택', icon: '↖' },
  { mode: 'marquee', label: '영역 선택', icon: '▢' },
  { mode: 'shape', label: '도형', icon: '□' },
  { mode: 'pencil', label: '연필', icon: '✎' },
  { mode: 'brush', label: '브러쉬', icon: '●' },
  { mode: 'eraser', label: '지우개', icon: '⌫' },
]

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se'
interface CanvasTab {
  id: string
  name: string
  history: DrawingHistory
}

type DragState =
  | { kind: 'pan'; start: Point; view: ViewState }
  | { kind: 'marquee'; start: Point }
  | { kind: 'draw-shape'; start: Point }
  | { kind: 'move'; start: Point; original: DrawingDocument; ids: string[] }
  | { kind: 'resize'; handle: ResizeHandle; bounds: Bounds; original: DrawingDocument; ids: string[] }
  | { kind: 'rotate'; center: Point; startAngle: number; original: DrawingDocument; ids: string[] }
  | { kind: 'paint'; last: Point; layerId: string; original: DrawingDocument }

type PixelSelection = Bounds

type EditorClipboard =
  | { kind: 'layers'; layers: DrawingLayer[] }
  | { kind: 'pixels'; dataUrl: string; x: number; y: number; width: number; height: number }

interface ViewState {
  scale: number
  x: number
  y: number
}

interface ShapeDefaults {
  fill: RgbaColor
  fillStyle: FillStyle
  fill2: RgbaColor
  gradientAngle: number
  stroke: RgbaColor
  strokeWidth: number
  cornerRadius: number
  fillMode: ShapeLayer['fillMode']
  fillAmount: number
  fillStartAngle: number
  fillClockwise: boolean
  fillReverse: boolean
}

const SHAPE_OPTIONS: { kind: ShapeKind; label: string; sides?: number }[] = [
  { kind: 'rectangle', label: '네모' },
  { kind: 'ellipse', label: '원' },
  { kind: 'triangle', label: '세모' },
  { kind: 'star', label: '별', sides: 5 },
  { kind: 'polygon', label: '5각형', sides: 5 },
  { kind: 'polygon', label: '6각형', sides: 6 },
  { kind: 'polygon', label: '7각형', sides: 7 },
  { kind: 'polygon', label: '8각형', sides: 8 },
]

const PALETTE = ['#111827', '#ffffff', '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#06b6d4', '#2563eb', '#7c3aed', '#ec4899']
const HANDLE_SIZE = 10
const ROTATE_HANDLE_OFFSET = 28
const DEFAULT_VIEW: ViewState = { scale: 1, x: 0, y: 0 }

const DEFAULT_STYLE: ShapeDefaults = {
  fill: { hex: '#4f46e5', alpha: 1 },
  fillStyle: 'solid',
  fill2: { hex: '#22c55e', alpha: 1 },
  gradientAngle: 0,
  stroke: { hex: '#111827', alpha: 1 },
  strokeWidth: 2,
  cornerRadius: 0,
  fillMode: 'full',
  fillAmount: 1,
  fillStartAngle: -90,
  fillClockwise: true,
  fillReverse: false,
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createCanvasTab(name: string, document: DrawingDocument = createEmptyDocument()): CanvasTab {
  return {
    id: nextId('tab'),
    name,
    history: createHistory(document),
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'))
    reader.readAsDataURL(file)
  })
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'))
    image.src = src
  })
}

function hexFromPixel(data: Uint8ClampedArray): RgbaColor {
  const hex = `#${[data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`
  return { hex, alpha: Number((data[3] / 255).toFixed(2)) }
}

function selectedObjects(document: DrawingDocument, ids: string[]): Array<ShapeLayer | ImageLayer> {
  return document.layers.filter(
    (layer): layer is ShapeLayer | ImageLayer => ids.includes(layer.id) && layer.type !== 'raster',
  )
}

function isEditableTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

export default function ImageEditorTool() {
  const [tabs, setTabs] = useState<CanvasTab[]>(() => [createCanvasTab('캔버스 1')])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const activeTab = tabs.find((tab) => tab.id === (activeTabId ?? tabs[0]?.id)) ?? tabs[0]!
  const history = activeTab.history
  const document = history.present
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [activeLayerId, setActiveLayerId] = useState<string | null>('raster-base')
  const [activeTool, setActiveTool] = useState<EditorTool>('select')
  const [shapeChoice, setShapeChoice] = useState(SHAPE_OPTIONS[0])
  const [shapeDefaults, setShapeDefaults] = useState<ShapeDefaults>(DEFAULT_STYLE)
  const [brushColor, setBrushColor] = useState('#111827')
  const [brushSize, setBrushSize] = useState(18)
  const [brushOpacity, setBrushOpacity] = useState(1)
  const [brushHardness, setBrushHardness] = useState(0.8)
  const [pencilSize, setPencilSize] = useState(2)
  const [eraserSize, setEraserSize] = useState(24)
  const [eraserMode, setEraserMode] = useState<'raster' | 'object'>('raster')
  const [eraserShape, setEraserShape] = useState<'circle' | 'square'>('circle')
  const [showGrid, setShowGrid] = useState(true)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [gridSize, setGridSize] = useState(32)
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW)
  const [draftShape, setDraftShape] = useState<ShapeLayer | null>(null)
  const [recentColors, setRecentColors] = useState<string[]>(PALETTE.slice(0, 6))
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [eraserCursor, setEraserCursor] = useState<Point | null>(null)
  const [pixelSelection, setPixelSelection] = useState<PixelSelection | null>(null)
  const [draftPixelSelection, setDraftPixelSelection] = useState<PixelSelection | null>(null)
  const [renderNonce, setRenderNonce] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const rasterCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map())
  const rasterSourceRef = useRef<Map<string, string | null>>(new Map())
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const imageSourceRef = useRef<Map<string, string>>(new Map())
  const clipboardRef = useRef<EditorClipboard>({ kind: 'layers', layers: [] })
  const spacePressedRef = useRef(false)
  const documentRef = useRef(document)
  const selectedIdsRef = useRef(selectedIds)
  const activeLayerIdRef = useRef(activeLayerId)
  const pixelSelectionRef = useRef(pixelSelection)

  documentRef.current = document
  selectedIdsRef.current = selectedIds
  activeLayerIdRef.current = activeLayerId
  pixelSelectionRef.current = pixelSelection

  const selectedLayers = useMemo(() => selectedObjects(document, selectedIds), [document, selectedIds])
  const firstShape = selectedLayers.find((layer): layer is ShapeLayer => layer.type === 'shape') ?? null
  const selectionBounds = useMemo(() => getSelectionBounds(document.layers, selectedIds), [document.layers, selectedIds])
  const activeLayer = useMemo(() => {
    return document.layers.find((layer) => layer.id === activeLayerId)
      ?? document.layers.find((layer) => layer.type === 'raster')
      ?? document.layers[0]
      ?? null
  }, [activeLayerId, document.layers])
  const activeRasterLayer = activeLayer?.type === 'raster' ? activeLayer : null
  const displayedPixelSelection = draftPixelSelection ?? pixelSelection
  const gridTemplateColumns = `${leftCollapsed ? '44px' : '300px'} minmax(0,1fr) ${rightCollapsed ? '44px' : '320px'}`

  function setHistory(next: DrawingHistory | ((current: DrawingHistory) => DrawingHistory)) {
    const activeId = activeTab.id
    setTabs((current) =>
      current.map((tab) => {
        if (tab.id !== activeId) return tab
        const history = typeof next === 'function' ? next(tab.history) : next
        return { ...tab, history }
      }),
    )
  }

  function commitDocument(next: DrawingDocument) {
    setHistory((current) => commitHistory(current, next))
  }

  function replacePresent(next: DrawingDocument) {
    setHistory((current) => ({ ...current, present: cloneDocument(next) }))
  }

  function commitFromOriginal(original: DrawingDocument, finalDocument: DrawingDocument) {
    setHistory((current) => commitHistory({ ...current, present: original }, finalDocument))
  }

  function addRecentColor(color: string) {
    setRecentColors((current) => [color, ...current.filter((c) => c !== color)].slice(0, 10))
  }

  function activateTab(id: string) {
    setActiveTabId(id)
    setSelectedIds([])
    setActiveLayerId(null)
    setPixelSelection(null)
    setDraftPixelSelection(null)
    setDraftShape(null)
    requestAnimationFrame(fitViewToCanvas)
  }

  function closeTab(id: string) {
    if (tabs.length <= 1) return
    const index = tabs.findIndex((tab) => tab.id === id)
    const nextTabs = tabs.filter((tab) => tab.id !== id)
    setTabs(nextTabs)
    if (activeTab.id === id) {
      const nextActive = nextTabs[Math.max(0, index - 1)] ?? nextTabs[0]
      setActiveTabId(nextActive.id)
      setSelectedIds([])
      setActiveLayerId(null)
      setPixelSelection(null)
      setDraftPixelSelection(null)
      requestAnimationFrame(fitViewToCanvas)
    }
  }

  function addDocumentTab(name: string, nextDocument: DrawingDocument, selectedLayerId?: string) {
    const tab = createCanvasTab(name, nextDocument)
    setTabs((current) => [...current, tab])
    setActiveTabId(tab.id)
    setSelectedIds(selectedLayerId ? [selectedLayerId] : [])
    setActiveLayerId(selectedLayerId ?? nextDocument.layers.find((layer) => layer.type === 'raster')?.id ?? nextDocument.layers[0]?.id ?? null)
    setPixelSelection(null)
    setDraftPixelSelection(null)
    setDraftShape(null)
    requestAnimationFrame(fitViewToCanvas)
  }

  function fitViewToCanvas() {
    const viewport = viewportRef.current
    if (!viewport) return
    const width = Math.max(1, documentRef.current.canvas.width)
    const height = Math.max(1, documentRef.current.canvas.height)
    const scale = Math.min(1, Math.max(0.08, Math.min((viewport.clientWidth - 48) / width, (viewport.clientHeight - 48) / height)))
    setView({
      scale,
      x: Math.max(24, (viewport.clientWidth - width * scale) / 2),
      y: Math.max(24, (viewport.clientHeight - height * scale) / 2),
    })
  }

  function nudgeBrushSize(delta: number) {
    if (activeTool === 'eraser') {
      setEraserSize((value) => clamp(value + delta, 1, 180))
    } else if (activeTool === 'pencil') {
      setPencilSize((value) => clamp(value + delta, 1, 24))
    } else {
      setBrushSize((value) => clamp(value + delta, 1, 160))
    }
  }

  function setGridEnabled(enabled: boolean) {
    setShowGrid(enabled)
    setSnapToGrid(enabled)
  }

  function updateEraserCursor(event: ReactPointerEvent<HTMLElement>) {
    if (activeTool !== 'eraser' || eraserMode !== 'raster') {
      setEraserCursor(null)
      return
    }
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    setEraserCursor({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }

  function ensureRasterCanvas(layerId: string): HTMLCanvasElement {
    let canvas = rasterCanvasesRef.current.get(layerId)
    if (!canvas) {
      canvas = createCanvas(documentRef.current.canvas.width, documentRef.current.canvas.height)
      rasterCanvasesRef.current.set(layerId, canvas)
      return canvas
    }
    if (canvas.width !== documentRef.current.canvas.width || canvas.height !== documentRef.current.canvas.height) {
      const previous = createCanvas(canvas.width, canvas.height)
      getContext(previous, false).drawImage(canvas, 0, 0)
      canvas.width = documentRef.current.canvas.width
      canvas.height = documentRef.current.canvas.height
      getContext(canvas, false).drawImage(previous, 0, 0)
    }
    return canvas
  }

  useEffect(() => {
    if (document.layers.length === 0) {
      if (activeLayerId !== null) setActiveLayerId(null)
      return
    }
    if (activeLayerId && document.layers.some((layer) => layer.id === activeLayerId)) return
    setActiveLayerId(document.layers.find((layer) => layer.type === 'raster')?.id ?? document.layers[0].id)
  }, [activeLayerId, document.layers])

  useEffect(() => {
    const rasterIds = new Set<string>()
    for (const layer of document.layers) {
      if (layer.type !== 'raster') continue
      rasterIds.add(layer.id)
      const canvas = ensureRasterCanvas(layer.id)
      const previousSource = rasterSourceRef.current.get(layer.id)
      if (layer.dataUrl && previousSource !== layer.dataUrl) {
        loadImageElement(layer.dataUrl)
          .then((image) => {
            const ctx = getContext(canvas, false)
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(image, 0, 0)
            rasterSourceRef.current.set(layer.id, layer.dataUrl)
            setRenderNonce((value) => value + 1)
          })
          .catch((err: Error) => setError(err.message))
      } else if (!layer.dataUrl && previousSource !== null) {
        getContext(canvas, false).clearRect(0, 0, canvas.width, canvas.height)
        rasterSourceRef.current.set(layer.id, null)
      }
    }
    for (const id of rasterCanvasesRef.current.keys()) {
      if (!rasterIds.has(id)) {
        rasterCanvasesRef.current.delete(id)
        rasterSourceRef.current.delete(id)
      }
    }
  }, [document.canvas.height, document.canvas.width, document.layers])

  useEffect(() => {
    const imageIds = new Set<string>()
    for (const layer of document.layers) {
      if (layer.type !== 'image') continue
      imageIds.add(layer.id)
      if (imageSourceRef.current.get(layer.id) === layer.dataUrl) continue
      loadImageElement(layer.dataUrl)
        .then((image) => {
          imageCacheRef.current.set(layer.id, image)
          imageSourceRef.current.set(layer.id, layer.dataUrl)
          setRenderNonce((value) => value + 1)
        })
        .catch((err: Error) => setError(err.message))
    }
    for (const id of imageCacheRef.current.keys()) {
      if (!imageIds.has(id)) {
        imageCacheRef.current.delete(id)
        imageSourceRef.current.delete(id)
      }
    }
  }, [document.layers])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (canvas.width !== document.canvas.width) canvas.width = document.canvas.width
    if (canvas.height !== document.canvas.height) canvas.height = document.canvas.height
    const ctx = getContext(canvas, false)
    const renderLayers = draftShape ? [...document.layers, draftShape] : document.layers
    renderDocument(ctx, { ...document, layers: renderLayers }, {
      rasterCanvases: rasterCanvasesRef.current,
      imageCache: imageCacheRef.current,
    })
    if (showGrid) drawGrid(ctx, document.canvas.width, document.canvas.height, gridSize)
    drawPixelSelection(ctx, displayedPixelSelection)
    drawSelection(ctx, document, selectedIds)
  }, [displayedPixelSelection, document, draftShape, gridSize, renderNonce, selectedIds, showGrid])

  useEffect(() => {
    const frame = requestAnimationFrame(fitViewToCanvas)
    return () => cancelAnimationFrame(frame)
  }, [activeTab.id, document.canvas.height, document.canvas.width, leftCollapsed, rightCollapsed])

  useEffect(() => {
    const viewportElement = viewportRef.current
    if (!viewportElement) return

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const rect = viewportElement.getBoundingClientRect()
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      const factor = Math.exp(-event.deltaY * 0.0015)
      setView((current) => {
        const nextScale = clamp(current.scale * factor, 0.1, 8)
        const ratio = nextScale / current.scale
        return {
          scale: nextScale,
          x: point.x - (point.x - current.x) * ratio,
          y: point.y - (point.y - current.y) * ratio,
        }
      })
    }

    viewportElement.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => viewportElement.removeEventListener('wheel', onWheel, { capture: true })
  }, [])

  useEffect(() => {
    if (activeTool !== 'eraser') setEraserCursor(null)
  }, [activeTool, eraserMode])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTextTarget(event.target)) return
      const ctrl = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (event.code === 'Space') {
        event.preventDefault()
        spacePressedRef.current = true
        return
      }
      if (ctrl && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        setHistory((current) => undoHistory(current))
        return
      }
      if (ctrl && (key === 'y' || (event.shiftKey && key === 'z'))) {
        event.preventDefault()
        setHistory((current) => redoHistory(current))
        return
      }
      if (ctrl && key === 'c') {
        event.preventDefault()
        copySelected()
        return
      }
      if (ctrl && key === 'a') {
        event.preventDefault()
        setSelectedIds(documentRef.current.layers.filter((layer) => layer.type !== 'raster').map((layer) => layer.id))
        setPixelSelection(null)
        return
      }
      if (ctrl && key === 'd') {
        event.preventDefault()
        setSelectedIds([])
        setPixelSelection(null)
        return
      }
      if (ctrl && key === 'j') {
        event.preventDefault()
        duplicateSelected()
        return
      }
      if (ctrl && key === 's') {
        event.preventDefault()
        if (event.shiftKey) void exportPng()
        else exportProject()
        return
      }
      if (ctrl && key === '0') {
        event.preventDefault()
        fitViewToCanvas()
        return
      }
      if (ctrl && key === '1') {
        event.preventDefault()
        setView({ scale: 1, x: 24, y: 24 })
        return
      }
      if (key === 'v') {
        setActiveTool('select')
        return
      }
      if (key === 'm') {
        setActiveTool('marquee')
        return
      }
      if (key === 'u') {
        setActiveTool('shape')
        return
      }
      if (key === 'b') {
        setActiveTool('brush')
        return
      }
      if (key === 'p') {
        setActiveTool('pencil')
        return
      }
      if (key === 'e') {
        setActiveTool('eraser')
        return
      }
      if (key === 'i') {
        setActiveTool('eyedropper')
        return
      }
      if (key === '[') {
        event.preventDefault()
        nudgeBrushSize(-2)
        return
      }
      if (key === ']') {
        event.preventDefault()
        nudgeBrushSize(2)
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteSelected()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') spacePressedRef.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  })

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isEditableTextTarget(event.target)) return
      const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) => item.type.startsWith('image/'))
      if (imageItem) {
        const file = imageItem.getAsFile()
        if (file) {
          event.preventDefault()
          void pasteImageFile(file)
        }
        return
      }
      if (hasInternalClipboard()) {
        event.preventDefault()
        pasteClipboard()
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  function canvasPointFromEvent(event: ReactPointerEvent<HTMLElement>): Point {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: clamp((event.clientX - rect.left) * (canvas.width / rect.width), 0, canvas.width),
      y: clamp((event.clientY - rect.top) * (canvas.height / rect.height), 0, canvas.height),
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    updateEraserCursor(event)
    if (event.button === 1 || event.button === 2 || (event.button === 0 && spacePressedRef.current)) {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = {
        kind: 'pan',
        start: { x: event.clientX, y: event.clientY },
        view,
      }
      return
    }

    if (event.button !== 0 || !canvasRef.current) return
    const point = snapPoint(canvasPointFromEvent(event), gridSize, snapToGrid)
    event.currentTarget.setPointerCapture(event.pointerId)

    if (activeTool === 'marquee') {
      const start = canvasPointFromEvent(event)
      dragRef.current = { kind: 'marquee', start }
      setDraftPixelSelection(selectionFromDrag(start, start, document.canvas))
      setSelectedIds([])
      return
    }

    if (activeTool === 'shape') {
      setPixelSelection(null)
      dragRef.current = { kind: 'draw-shape', start: point }
      setDraftShape(createDraftShape(point, point, event.shiftKey))
      return
    }

    if (activeTool === 'pencil' || activeTool === 'brush' || (activeTool === 'eraser' && eraserMode === 'raster')) {
      if (!activeRasterLayer || activeRasterLayer.locked || !activeRasterLayer.visible) return
      dragRef.current = {
        kind: 'paint',
        last: point,
        layerId: activeRasterLayer.id,
        original: cloneDocument(document),
      }
      drawPaintDab(point, activeRasterLayer.id)
      return
    }

    if (activeTool === 'eraser' && eraserMode === 'object') {
      const hit = findTopLayerAtPoint(document.layers, point)
      if (hit && hit.id === activeLayer?.id && !hit.locked) {
        const next = { ...document, layers: document.layers.filter((layer) => layer.id !== hit.id) }
        commitDocument(next)
        setSelectedIds([])
      }
      return
    }

    if (activeTool === 'eyedropper') {
      pickColor(point)
      return
    }

    const handle = selectionBounds ? hitResizeHandle(point, selectionBounds) : null
    if (selectionBounds && handle) {
      dragRef.current = {
        kind: 'resize',
        handle,
        bounds: selectionBounds,
        original: cloneDocument(document),
        ids: [...selectedIds],
      }
      return
    }
    if (selectionBounds && hitRotateHandle(point, selectionBounds)) {
      const center = {
        x: selectionBounds.x + selectionBounds.width / 2,
        y: selectionBounds.y + selectionBounds.height / 2,
      }
      dragRef.current = {
        kind: 'rotate',
        center,
        startAngle: Math.atan2(point.y - center.y, point.x - center.x),
        original: cloneDocument(document),
        ids: [...selectedIds],
      }
      return
    }

    const hit = findTopLayerAtPoint(document.layers, point)
    if (hit) {
      setActiveLayerId(hit.id)
      const nextSelection = event.shiftKey
        ? selectedIds.includes(hit.id)
          ? selectedIds.filter((id) => id !== hit.id)
          : [...selectedIds, hit.id]
        : selectedIds.includes(hit.id)
          ? selectedIds
          : [hit.id]
      setSelectedIds(nextSelection)
      dragRef.current = {
        kind: 'move',
        start: point,
        original: cloneDocument(document),
        ids: nextSelection,
      }
      return
    }

    setSelectedIds([])
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    updateEraserCursor(event)
    const drag = dragRef.current
    if (!drag) return
    event.preventDefault()
    if (drag.kind === 'pan') {
      setView({
        scale: drag.view.scale,
        x: drag.view.x + event.clientX - drag.start.x,
        y: drag.view.y + event.clientY - drag.start.y,
      })
      return
    }

    const point = snapPoint(canvasPointFromEvent(event), gridSize, snapToGrid)
    if (drag.kind === 'marquee') {
      setDraftPixelSelection(selectionFromDrag(drag.start, canvasPointFromEvent(event), document.canvas))
      return
    }
    if (drag.kind === 'draw-shape') {
      setDraftShape(createDraftShape(drag.start, point, event.shiftKey))
      return
    }
    if (drag.kind === 'paint') {
      drawPaintLine(drag.last, point, drag.layerId)
      dragRef.current = { ...drag, last: point }
      return
    }
    if (drag.kind === 'move') {
      const dx = point.x - drag.start.x
      const dy = point.y - drag.start.y
      replacePresent(moveLayers(drag.original, drag.ids, dx, dy))
      return
    }
    if (drag.kind === 'resize') {
      replacePresent(resizeLayers(drag.original, drag.ids, drag.bounds, drag.handle, point))
      return
    }
    if (drag.kind === 'rotate') {
      const angle = Math.atan2(point.y - drag.center.y, point.x - drag.center.x)
      replacePresent(rotateLayers(drag.original, drag.ids, radiansToDegrees(angle - drag.startAngle)))
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    if (drag.kind === 'draw-shape') {
      if (draftShape) {
        const layer = draftShape.width < 4 || draftShape.height < 4
          ? createShapeLayer(nextId('shape'), shapeChoice.kind, {
            x: draftShape.x,
            y: draftShape.y,
            width: 96,
            height: 96,
          }, shapePatch())
          : draftShape
        commitDocument({ ...document, layers: [...document.layers, layer] })
        setSelectedIds([layer.id])
        setActiveLayerId(layer.id)
        setActiveTool('select')
      }
      setDraftShape(null)
      return
    }
    if (drag.kind === 'marquee') {
      const finalSelection = selectionFromDrag(drag.start, canvasPointFromEvent(event), documentRef.current.canvas)
      const nextSelection = finalSelection.width >= 1 && finalSelection.height >= 1
        ? finalSelection
        : null
      setPixelSelection(nextSelection)
      setDraftPixelSelection(null)
      return
    }
    if (drag.kind === 'move' || drag.kind === 'resize' || drag.kind === 'rotate') {
      commitFromOriginal(drag.original, documentRef.current)
      return
    }
    if (drag.kind === 'paint') {
      const canvas = rasterCanvasesRef.current.get(drag.layerId)
      if (!canvas) return
      const dataUrl = canvas.toDataURL('image/png')
      const next = {
        ...documentRef.current,
        layers: documentRef.current.layers.map((layer) =>
          layer.id === drag.layerId && layer.type === 'raster'
            ? { ...layer, dataUrl }
            : layer,
        ),
      }
      rasterSourceRef.current.set(drag.layerId, dataUrl)
      commitFromOriginal(drag.original, next)
    }
  }

  function createDraftShape(start: Point, end: Point, constrainSquare: boolean): ShapeLayer {
    const bounds = constrainSquare ? squareBoundsFromDrag(start, end) : normalizeRect(start, end)
    return createShapeLayer(nextId('shape'), shapeChoice.kind, bounds, shapePatch())
  }

  function shapePatch(): Partial<ShapeLayer> {
    return {
      ...shapeDefaults,
      sides: shapeChoice.sides ?? (shapeChoice.kind === 'triangle' ? 3 : 5),
      name: shapeChoice.label,
    }
  }

  function drawPaintLine(from: Point, to: Point, layerId: string) {
    const canvas = ensureRasterCanvas(layerId)
    const ctx = getContext(canvas, false)
    ctx.save()
    configurePaintContext(ctx)
    if (activeTool === 'eraser') {
      drawEraserLine(ctx, from, to)
    } else {
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
    }
    ctx.restore()
    setRenderNonce((value) => value + 1)
  }

  function drawPaintDab(point: Point, layerId: string) {
    const canvas = ensureRasterCanvas(layerId)
    const ctx = getContext(canvas, false)
    ctx.save()
    configurePaintContext(ctx)
    const size = activeTool === 'pencil' ? pencilSize : activeTool === 'eraser' ? eraserSize : brushSize
    if (activeTool === 'eraser') {
      drawEraserDab(ctx, point)
    } else {
      ctx.beginPath()
      ctx.arc(point.x, point.y, Math.max(0.5, size / 2), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    setRenderNonce((value) => value + 1)
  }

  function drawEraserLine(ctx: CanvasRenderingContext2D, from: Point, to: Point) {
    if (eraserShape === 'circle') {
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
      return
    }

    const distance = Math.hypot(to.x - from.x, to.y - from.y)
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, eraserSize * 0.35)))
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps
      drawEraserDab(ctx, {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      })
    }
  }

  function drawEraserDab(ctx: CanvasRenderingContext2D, point: Point) {
    if (eraserShape === 'square') {
      const half = eraserSize / 2
      ctx.fillRect(point.x - half, point.y - half, eraserSize, eraserSize)
      return
    }
    ctx.beginPath()
    ctx.arc(point.x, point.y, Math.max(0.5, eraserSize / 2), 0, Math.PI * 2)
    ctx.fill()
  }

  function configurePaintContext(ctx: CanvasRenderingContext2D) {
    if (activeTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.globalAlpha = 1
      ctx.strokeStyle = '#000000'
      ctx.fillStyle = '#000000'
      ctx.lineWidth = eraserSize
      ctx.lineCap = eraserShape === 'circle' ? 'round' : 'square'
      ctx.lineJoin = eraserShape === 'circle' ? 'round' : 'miter'
      return
    }
    const isPencil = activeTool === 'pencil'
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = isPencil ? 1 : brushOpacity
    ctx.strokeStyle = brushColor
    ctx.fillStyle = brushColor
    ctx.lineWidth = isPencil ? pencilSize : brushSize
    ctx.lineCap = isPencil ? 'square' : 'round'
    ctx.lineJoin = isPencil ? 'miter' : 'round'
    ctx.shadowBlur = isPencil ? 0 : Math.max(0, (1 - brushHardness) * brushSize * 0.45)
    ctx.shadowColor = brushColor
  }

  function pickColor(point: Point) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = getContext(canvas, false)
    const pixel = ctx.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data
    const color = hexFromPixel(pixel)
    setShapeDefaults((current) => ({ ...current, fill: color }))
    setBrushColor(color.hex)
    addRecentColor(color.hex)
  }

  function moveLayers(original: DrawingDocument, ids: string[], dx: number, dy: number): DrawingDocument {
    return {
      ...original,
      layers: original.layers.map((layer) => {
        if (!ids.includes(layer.id) || layer.type === 'raster') return layer
        const x = snapValue(layer.x + dx, gridSize, snapToGrid)
        const y = snapValue(layer.y + dy, gridSize, snapToGrid)
        return { ...layer, x, y }
      }),
    }
  }

  function resizeLayers(
    original: DrawingDocument,
    ids: string[],
    bounds: Bounds,
    handle: ResizeHandle,
    point: Point,
  ): DrawingDocument {
    const nextBounds = resizeBounds(bounds, handle, point)
    const scaleX = nextBounds.width / Math.max(1, bounds.width)
    const scaleY = nextBounds.height / Math.max(1, bounds.height)
    return {
      ...original,
      layers: original.layers.map((layer) => {
        if (!ids.includes(layer.id) || layer.type === 'raster') return layer
        return {
          ...layer,
          x: nextBounds.x + (layer.x - bounds.x) * scaleX,
          y: nextBounds.y + (layer.y - bounds.y) * scaleY,
          width: Math.max(4, layer.width * scaleX),
          height: Math.max(4, layer.height * scaleY),
        }
      }),
    }
  }

  function rotateLayers(original: DrawingDocument, ids: string[], deltaDegrees: number): DrawingDocument {
    return {
      ...original,
      layers: original.layers.map((layer) => {
        if (!ids.includes(layer.id) || layer.type === 'raster') return layer
        return { ...layer, rotation: layer.rotation + deltaDegrees }
      }),
    }
  }

  function updateSelectedObjects(patch: ObjectPatch) {
    if (selectedIds.length === 0) return
    commitDocument({
      ...document,
      layers: document.layers.map((layer) => {
        if (!selectedIds.includes(layer.id) || layer.type === 'raster') return layer
        return { ...layer, ...patch }
      }),
    })
  }

  function updateSelectedShapes(patch: Partial<ShapeLayer>) {
    const selectedShapeIds = selectedLayers.filter((layer) => layer.type === 'shape').map((layer) => layer.id)
    if (selectedShapeIds.length === 0) {
      setShapeDefaults((current) => ({ ...current, ...patch }))
      if (patch.fill?.hex) addRecentColor(patch.fill.hex)
      if (patch.stroke?.hex) addRecentColor(patch.stroke.hex)
      return
    }
    commitDocument({
      ...document,
      layers: document.layers.map((layer) => (
        selectedShapeIds.includes(layer.id) && layer.type === 'shape'
          ? { ...layer, ...patch }
          : layer
      )),
    })
    if (patch.fill?.hex) addRecentColor(patch.fill.hex)
    if (patch.stroke?.hex) addRecentColor(patch.stroke.hex)
  }

  function updateLayer(id: string, patch: Partial<DrawingLayer>) {
    commitDocument({
      ...document,
      layers: document.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } as DrawingLayer : layer)),
    })
  }

  function reorderLayer(id: string, direction: 1 | -1) {
    const index = document.layers.findIndex((layer) => layer.id === id)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= document.layers.length) return
    const layers = [...document.layers]
    const [layer] = layers.splice(index, 1)
    layers.splice(nextIndex, 0, layer)
    commitDocument({ ...document, layers })
  }

  function getActiveDocumentLayer(current: DrawingDocument = documentRef.current): DrawingLayer | null {
    return current.layers.find((layer) => layer.id === activeLayerIdRef.current)
      ?? current.layers.find((layer) => layer.type === 'raster')
      ?? current.layers[0]
      ?? null
  }

  function currentPixelSelectionBounds(): Bounds | null {
    const selection = pixelSelectionRef.current
    if (!selection) return null
    return clampSelectionToCanvas(selection, documentRef.current.canvas)
  }

  function renderLayerToCanvas(layer: DrawingLayer, current: DrawingDocument): HTMLCanvasElement {
    const output = createCanvas(current.canvas.width, current.canvas.height)
    const ctx = getContext(output, false)
    renderDocument(ctx, {
      ...current,
      canvas: { ...current.canvas, transparent: true },
      layers: [layer],
    }, {
      rasterCanvases: rasterCanvasesRef.current,
      imageCache: imageCacheRef.current,
    })
    return output
  }

  function deleteSelected() {
    if (pixelSelectionRef.current) {
      deletePixelSelection()
      return
    }
    const ids = selectedIdsRef.current
    if (ids.length === 0) return
    const current = documentRef.current
    commitDocument({ ...current, layers: current.layers.filter((layer) => !ids.includes(layer.id) || layer.type === 'raster') })
    setSelectedIds([])
    setActiveLayerId(current.layers.find((layer) => !ids.includes(layer.id))?.id ?? null)
  }

  function copySelected(): boolean {
    if (pixelSelectionRef.current) return copyPixelSelection()
    const ids = selectedIdsRef.current
    const layers = documentRef.current.layers
      .filter((layer) => ids.includes(layer.id) && layer.type !== 'raster')
      .map((layer) => cloneDocument(layer))
    clipboardRef.current = { kind: 'layers', layers }
    return layers.length > 0
  }

  function copyPixelSelection(): boolean {
    const bounds = currentPixelSelectionBounds()
    const current = documentRef.current
    const layer = getActiveDocumentLayer(current)
    if (!bounds || !layer || !layer.visible) return false
    const source = renderLayerToCanvas(layer, current)
    const output = createCanvas(bounds.width, bounds.height)
    getContext(output, false).drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height)
    clipboardRef.current = {
      kind: 'pixels',
      dataUrl: output.toDataURL('image/png'),
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    }
    return true
  }

  function deletePixelSelection(): boolean {
    const bounds = currentPixelSelectionBounds()
    const current = documentRef.current
    const layer = getActiveDocumentLayer(current)
    if (!bounds || !layer || !layer.visible || layer.locked) return false

    if (layer.type === 'raster') {
      const original = cloneDocument(current)
      const canvas = ensureRasterCanvas(layer.id)
      getContext(canvas, false).clearRect(bounds.x, bounds.y, bounds.width, bounds.height)
      const dataUrl = canvas.toDataURL('image/png')
      const next = {
        ...current,
        layers: current.layers.map((item) =>
          item.id === layer.id && item.type === 'raster'
            ? { ...item, dataUrl }
            : item,
        ),
      }
      rasterSourceRef.current.set(layer.id, dataUrl)
      commitFromOriginal(original, next)
      return true
    }

    const output = renderLayerToCanvas(layer, current)
    getContext(output, false).clearRect(bounds.x, bounds.y, bounds.width, bounds.height)
    const rasterizedLayer: ImageLayer = {
      id: layer.id,
      name: `${layer.name} 픽셀`,
      type: 'image',
      visible: layer.visible,
      locked: layer.locked,
      opacity: 1,
      dataUrl: output.toDataURL('image/png'),
      x: 0,
      y: 0,
      width: current.canvas.width,
      height: current.canvas.height,
      rotation: 0,
    }
    imageCacheRef.current.delete(layer.id)
    imageSourceRef.current.delete(layer.id)
    commitDocument({
      ...current,
      layers: current.layers.map((item) => (item.id === layer.id ? rasterizedLayer : item)),
    })
    setSelectedIds([rasterizedLayer.id])
    setActiveLayerId(rasterizedLayer.id)
    return true
  }

  function hasInternalClipboard(): boolean {
    const clipboard = clipboardRef.current
    return clipboard.kind === 'pixels' || clipboard.layers.length > 0
  }

  function pasteClipboard() {
    const clipboard = clipboardRef.current
    if (clipboard.kind === 'pixels') {
      const layer: ImageLayer = {
        id: nextId('image'),
        name: '영역 붙여넣기',
        type: 'image',
        visible: true,
        locked: false,
        opacity: 1,
        dataUrl: clipboard.dataUrl,
        x: clipboard.x,
        y: clipboard.y,
        width: clipboard.width,
        height: clipboard.height,
        rotation: 0,
      }
      const current = documentRef.current
      commitDocument({ ...current, layers: [...current.layers, layer] })
      setSelectedIds([layer.id])
      setActiveLayerId(layer.id)
      setPixelSelection(null)
      return
    }
    if (clipboard.layers.length === 0) return
    const copies = clipboard.layers.map((layer) => ({
      ...cloneDocument(layer),
      id: nextId(layer.type),
      name: `${layer.name} 복사`,
      x: 'x' in layer ? layer.x + 24 : 0,
      y: 'y' in layer ? layer.y + 24 : 0,
    })) as DrawingLayer[]
    const current = documentRef.current
    commitDocument({ ...current, layers: [...current.layers, ...copies] })
    setSelectedIds(copies.map((layer) => layer.id))
    setActiveLayerId(copies.at(-1)?.id ?? activeLayerIdRef.current)
  }

  function duplicateSelected() {
    if (copySelected()) pasteClipboard()
  }

  function alignSelected(mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') {
    const bounds = getSelectionBounds(document.layers, selectedIds)
    if (!bounds) return
    commitDocument({
      ...document,
      layers: document.layers.map((layer) => {
        if (!selectedIds.includes(layer.id) || layer.type === 'raster') return layer
        if (mode === 'left') return { ...layer, x: bounds.x }
        if (mode === 'center') return { ...layer, x: bounds.x + bounds.width / 2 - layer.width / 2 }
        if (mode === 'right') return { ...layer, x: bounds.x + bounds.width - layer.width }
        if (mode === 'top') return { ...layer, y: bounds.y }
        if (mode === 'middle') return { ...layer, y: bounds.y + bounds.height / 2 - layer.height / 2 }
        return { ...layer, y: bounds.y + bounds.height - layer.height }
      }),
    })
  }

  function distributeSelected(axis: 'x' | 'y') {
    const objects = selectedObjects(document, selectedIds)
    if (objects.length < 3) return
    const sorted = [...objects].sort((a, b) => axis === 'x' ? a.x - b.x : a.y - b.y)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const spanStart = axis === 'x' ? first.x : first.y
    const spanEnd = axis === 'x' ? last.x + last.width : last.y + last.height
    const totalSize = sorted.reduce((sum, layer) => sum + (axis === 'x' ? layer.width : layer.height), 0)
    const gap = (spanEnd - spanStart - totalSize) / (sorted.length - 1)
    let cursor = spanStart
    const positions = new Map<string, number>()
    for (const layer of sorted) {
      positions.set(layer.id, cursor)
      cursor += (axis === 'x' ? layer.width : layer.height) + gap
    }
    commitDocument({
      ...document,
      layers: document.layers.map((layer) => {
        const position = positions.get(layer.id)
        if (position == null || layer.type === 'raster') return layer
        return axis === 'x' ? { ...layer, x: position } : { ...layer, y: position }
      }),
    })
  }

  function commitCanvasPatch(patch: Partial<DrawingDocument['canvas']>) {
    commitDocument({ ...document, canvas: { ...document.canvas, ...patch } })
  }

  async function importImage(file: File | undefined | null) {
    if (!file) return
    try {
      const { loaded, imageLayer } = await imageLayerFromFile(file)
      const next = createEmptyDocument(loaded.width, loaded.height)
      addDocumentTab(file.name.replace(/\.[^./\\]+$/, '') || '이미지', { ...next, layers: [imageLayer, ...next.layers] }, imageLayer.id)
      URL.revokeObjectURL(loaded.url)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function pasteImageFile(file: File) {
    try {
      const { loaded, imageLayer } = await imageLayerFromFile(file)
      const next = {
        ...documentRef.current,
        layers: [...documentRef.current.layers, imageLayer],
      }
      commitDocument(next)
      setSelectedIds([imageLayer.id])
      setActiveLayerId(imageLayer.id)
      setPixelSelection(null)
      URL.revokeObjectURL(loaded.url)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function imageLayerFromFile(file: File): Promise<{ loaded: Awaited<ReturnType<typeof loadImageFromFile>>; imageLayer: ImageLayer }> {
    const [loaded, dataUrl] = await Promise.all([loadImageFromFile(file), readFileAsDataUrl(file)])
    return {
      loaded,
      imageLayer: {
        id: nextId('image'),
        name: file.name.replace(/\.[^./\\]+$/, '') || '이미지',
        type: 'image',
        visible: true,
        locked: false,
        opacity: 1,
        dataUrl,
        x: 0,
        y: 0,
        width: loaded.width,
        height: loaded.height,
        rotation: 0,
      },
    }
  }

  async function importProject(file: File | undefined | null) {
    if (!file) return
    try {
      const text = await file.text()
      const next = parseDrawingProject(text)
      addDocumentTab(file.name.replace(/\.[^./\\]+$/, '') || 'JSON 프로젝트', next)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function newProject() {
    addDocumentTab(`캔버스 ${tabs.length + 1}`, createEmptyDocument())
  }

  function documentWithCurrentRaster(): DrawingDocument {
    return {
      ...document,
      layers: document.layers.map((layer) => {
        if (layer.type !== 'raster') return layer
        const canvas = rasterCanvasesRef.current.get(layer.id)
        return { ...layer, dataUrl: canvas ? canvas.toDataURL('image/png') : layer.dataUrl }
      }),
    }
  }

  async function exportPng() {
    const output = createCanvas(document.canvas.width, document.canvas.height)
    const ctx = getContext(output, false)
    renderDocument(ctx, documentWithCurrentRaster(), {
      rasterCanvases: rasterCanvasesRef.current,
      imageCache: await imageCacheForExport(document),
    })
    const blob = await canvasToBlob(output, 'image/png')
    downloadBlob(blob, 'image-editor.png')
  }

  function exportProject() {
    const blob = new Blob([serializeDrawingProject(documentWithCurrentRaster())], {
      type: 'application/json',
    })
    downloadBlob(blob, 'image-editor-project.json')
  }

  async function imageCacheForExport(current: DrawingDocument): Promise<Map<string, HTMLImageElement>> {
    const cache = new Map(imageCacheRef.current)
    for (const layer of current.layers) {
      if (layer.type === 'image' && !cache.has(layer.id)) {
        cache.set(layer.id, await loadImageElement(layer.dataUrl))
      }
    }
    return cache
  }

  const styleSource = firstShape ?? shapeDefaults

  return (
    <ToolShell tool={tool}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white/80 p-2 dark:border-slate-800 dark:bg-slate-950/60">
          {TOOL_BUTTONS.map(({ mode, label, icon }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setActiveTool(mode)}
              aria-label={label}
              title={label}
              className={`flex h-9 w-9 items-center justify-center rounded-md text-base ${activeTool === mode ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              {icon}
            </button>
          ))}
          <div className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-800" />
          <button type="button" aria-label="되돌리기" title="되돌리기" onClick={() => setHistory((current) => undoHistory(current))} disabled={history.past.length === 0} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-base disabled:opacity-40 dark:border-slate-700">
            ↶
          </button>
          <button type="button" aria-label="다시 실행" title="다시 실행" onClick={() => setHistory((current) => redoHistory(current))} disabled={history.future.length === 0} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-base disabled:opacity-40 dark:border-slate-700">
            ↷
          </button>
          <button type="button" aria-label="새 캔버스" title="새 캔버스" onClick={newProject} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-base dark:border-slate-700">
            ＋
          </button>
          <FileButton accept="image/*" label="이미지 불러오기" icon="▧" onFile={importImage} />
          <FileButton accept="application/json,.json" label="JSON 열기" icon="{}" onFile={importProject} />
          <button type="button" aria-label="JSON 저장" title="JSON 저장" onClick={exportProject} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-xs dark:border-slate-700">
            ⤓
          </button>
          <button type="button" aria-label="PNG 내보내기" title="PNG 내보내기" onClick={exportPng} className="flex h-9 w-9 items-center justify-center rounded-md bg-indigo-600 text-base font-medium text-white hover:bg-indigo-500">
            ⇩
          </button>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white/80 p-1 dark:border-slate-800 dark:bg-slate-950/60">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex max-w-56 shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-sm ${
                tab.id === activeTab.id
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200'
                  : 'border-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <button type="button" onClick={() => activateTab(tab.id)} className="truncate">
                {tab.name}
              </button>
              {tabs.length > 1 && (
                <button type="button" onClick={() => closeTab(tab.id)} aria-label={`${tab.name} 닫기`} className="rounded px-1 text-slate-400 hover:text-red-500">
                  x
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns }}>
          <aside className="space-y-3">
            <SidebarHeader title="레이어/도구" collapsed={leftCollapsed} side="left" onToggle={() => setLeftCollapsed((value) => !value)} />
            {!leftCollapsed && (
              <>
            <Panel title="캔버스">
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="W" value={document.canvas.width} min={1} max={8192} onChange={(value) => commitCanvasPatch({ width: value })} />
                <NumberField label="H" value={document.canvas.height} min={1} max={8192} onChange={(value) => commitCanvasPatch({ height: value })} />
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={document.canvas.transparent} onChange={(event) => commitCanvasPatch({ transparent: event.target.checked })} />
                투명 배경
              </label>
              {!document.canvas.transparent && (
                <ColorField label="배경" value={document.canvas.background} onChange={(value) => commitCanvasPatch({ background: value })} />
              )}
            </Panel>

            <Panel title="레이어">
              <p className="mb-2 truncate text-xs text-slate-500">
                활성: {activeLayer?.name ?? '없음'}
              </p>
              <div className="space-y-1">
                {[...document.layers].reverse().map((layer) => {
                  const isActiveLayer = activeLayer?.id === layer.id
                  const isObjectSelected = selectedIds.includes(layer.id)
                  return (
                  <div
                    key={layer.id}
                    className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                      isActiveLayer
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                        : isObjectSelected
                          ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/30'
                          : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveLayerId(layer.id)
                        setSelectedIds(layer.type === 'raster' ? [] : [layer.id])
                      }}
                      className="min-w-0 flex-1 truncate text-left"
                    >
                      <span className="mr-1 text-slate-400">{layerIcon(layer)}</span>
                      {layer.name}
                    </button>
                    <IconButton label={layer.visible ? '숨기기' : '표시'} onClick={() => updateLayer(layer.id, { visible: !layer.visible } as Partial<DrawingLayer>)}>
                      {layer.visible ? '◉' : '○'}
                    </IconButton>
                    <IconButton label={layer.locked ? '잠금 해제' : '잠금'} onClick={() => updateLayer(layer.id, { locked: !layer.locked } as Partial<DrawingLayer>)}>
                      {layer.locked ? '◆' : '◇'}
                    </IconButton>
                    <IconButton label="위로" onClick={() => reorderLayer(layer.id, 1)}>↑</IconButton>
                    <IconButton label="아래로" onClick={() => reorderLayer(layer.id, -1)}>↓</IconButton>
                  </div>
                  )
                })}
              </div>
            </Panel>

            <Panel title="도구 옵션">
              {activeTool === 'shape' && (
                <div className="grid grid-cols-2 gap-2">
                  {SHAPE_OPTIONS.map((option) => (
                    <button
                      key={`${option.kind}-${option.sides ?? 0}`}
                      type="button"
                      onClick={() => setShapeChoice(option)}
                      className={`rounded-md border px-2 py-1.5 text-sm ${shapeChoice === option ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200' : 'border-slate-300 dark:border-slate-700'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
              {activeTool === 'brush' && (
                <div className="space-y-3">
                  <ColorField label="색상" value={brushColor} onChange={(value) => { setBrushColor(value); addRecentColor(value) }} />
                  <RangeField label="크기" value={brushSize} min={1} max={160} onChange={setBrushSize} />
                  <RangeField label="투명도" value={brushOpacity} min={0.05} max={1} step={0.05} onChange={setBrushOpacity} />
                  <RangeField label="경도" value={brushHardness} min={0} max={1} step={0.05} onChange={setBrushHardness} />
                </div>
              )}
              {activeTool === 'pencil' && (
                <div className="space-y-3">
                  <ColorField label="색상" value={brushColor} onChange={(value) => { setBrushColor(value); addRecentColor(value) }} />
                  <RangeField label="크기" value={pencilSize} min={1} max={24} onChange={setPencilSize} />
                </div>
              )}
              {activeTool === 'eraser' && (
                <div className="space-y-3">
                  <RangeField label="크기" value={eraserSize} min={1} max={180} onChange={setEraserSize} />
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['circle', '원형', '○'],
                      ['square', '사각형', '□'],
                    ] as const).map(([shape, label, icon]) => (
                      <button
                        key={shape}
                        type="button"
                        onClick={() => setEraserShape(shape)}
                        className={`flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-sm ${eraserShape === shape ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200' : 'border-slate-300 dark:border-slate-700'}`}
                      >
                        <span aria-hidden="true">{icon}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['raster', 'object'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setEraserMode(mode)}
                        className={`rounded-md border px-2 py-1.5 text-sm ${eraserMode === mode ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200' : 'border-slate-300 dark:border-slate-700'}`}
                      >
                        {mode === 'raster' ? '픽셀 지우기' : '오브젝트 삭제'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Panel>

            <Panel title="보기">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={showGrid} onChange={(event) => setGridEnabled(event.target.checked)} />
                  그리드
                </label>
                <label className={`flex items-center gap-2 text-sm ${showGrid ? '' : 'text-slate-400'}`}>
                  <input type="checkbox" checked={showGrid && snapToGrid} disabled={!showGrid} onChange={(event) => setSnapToGrid(event.target.checked)} />
                  자석
                </label>
                <RangeField label="격자" value={gridSize} min={4} max={128} step={4} onChange={setGridSize} />
                <button type="button" onClick={fitViewToCanvas} className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700">
                  화면 맞춤
                </button>
                <p className="text-xs text-slate-500">캔버스 위에서 Ctrl+휠로 확대/축소합니다.</p>
              </div>
            </Panel>
              </>
            )}
          </aside>

          <main
            ref={viewportRef}
            onContextMenu={(event) => event.preventDefault()}
            className="checkerboard relative h-[calc(100vh-260px)] min-h-[560px] overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800"
          >
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={() => setEraserCursor(null)}
              className="absolute touch-none select-none"
              style={{
                transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
                transformOrigin: '0 0',
                width: document.canvas.width,
                height: document.canvas.height,
              }}
            >
              <canvas
                ref={canvasRef}
                className="block shadow-md outline outline-1 outline-slate-500 [image-rendering:pixelated] dark:outline-slate-300"
                style={{ width: document.canvas.width, height: document.canvas.height }}
              />
            </div>
            {eraserCursor && (
              <div
                data-eraser-cursor="true"
                className={`pointer-events-none absolute border border-red-500 bg-red-500/10 ${eraserShape === 'circle' ? 'rounded-full' : 'rounded-none'}`}
                style={{
                  left: eraserCursor.x,
                  top: eraserCursor.y,
                  width: Math.max(4, eraserSize * view.scale),
                  height: Math.max(4, eraserSize * view.scale),
                  transform: 'translate(-50%, -50%)',
                }}
              />
            )}
            <div className="pointer-events-none absolute right-3 top-3 rounded bg-slate-950/70 px-2 py-1 text-xs font-medium text-white">
              {Math.round(view.scale * 100)}%
            </div>
          </main>

          <aside className="space-y-3">
            <SidebarHeader title="속성" collapsed={rightCollapsed} side="right" onToggle={() => setRightCollapsed((value) => !value)} />
            {!rightCollapsed && (
              <>
            <Panel title="선택 속성">
              {selectedLayers.length === 0 ? (
                <p className="text-sm text-slate-500">선택한 오브젝트가 없습니다. 도형 속성은 새 도형 기본값으로 적용됩니다.</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-500">{selectedLayers.length}개 선택됨</p>
                  {selectedLayers.length === 1 && (
                    <div className="grid grid-cols-2 gap-2">
                      <NumberField label="X" value={selectedLayers[0].x} onChange={(value) => updateSelectedObjects({ x: value })} />
                      <NumberField label="Y" value={selectedLayers[0].y} onChange={(value) => updateSelectedObjects({ y: value })} />
                      <NumberField label="W" value={selectedLayers[0].width} min={1} onChange={(value) => updateSelectedObjects({ width: value })} />
                      <NumberField label="H" value={selectedLayers[0].height} min={1} onChange={(value) => updateSelectedObjects({ height: value })} />
                    </div>
                  )}
                  <RangeField label="회전" value={selectedLayers[0].rotation} min={-180} max={180} onChange={(value) => updateSelectedObjects({ rotation: value })} />
                  <RangeField label="불투명도" value={selectedLayers[0].opacity} min={0} max={1} step={0.05} onChange={(value) => updateSelectedObjects({ opacity: value })} />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={duplicateSelected} className="rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-700">복제</button>
                    <button type="button" onClick={deleteSelected} className="rounded-md border border-red-300 px-2 py-1 text-sm text-red-600 dark:border-red-900">삭제</button>
                  </div>
                </div>
              )}
              <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                <ShapeStylePanel
                  styleSource={styleSource}
                  hasShape={Boolean(firstShape)}
                  recentColors={recentColors}
                  onPatch={updateSelectedShapes}
                  onSwap={() => updateSelectedShapes({ fill: styleSource.stroke, stroke: styleSource.fill })}
                />
              </div>
            </Panel>

            <Panel title="정렬">
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['left', '좌'],
                  ['center', '중'],
                  ['right', '우'],
                  ['top', '상'],
                  ['middle', '중앙'],
                  ['bottom', '하'],
                ].map(([mode, label]) => (
                  <button key={mode} type="button" onClick={() => alignSelected(mode as Parameters<typeof alignSelected>[0])} className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-40 dark:border-slate-700" disabled={selectedLayers.length < 2}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => distributeSelected('x')} disabled={selectedLayers.length < 3} className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-40 dark:border-slate-700">가로 분배</button>
                <button type="button" onClick={() => distributeSelected('y')} disabled={selectedLayers.length < 3} className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-40 dark:border-slate-700">세로 분배</button>
              </div>
            </Panel>

            <button
              type="button"
              onClick={() => setShowShortcuts((value) => !value)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white/80 p-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              <span aria-hidden="true">⌨</span>
              단축키
            </button>
            {showShortcuts && (
              <Panel title="단축키">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
                  <Shortcut keys="V" label="선택" />
                  <Shortcut keys="M" label="영역 선택" />
                  <Shortcut keys="U" label="도형" />
                  <Shortcut keys="B/P" label="브러쉬/연필" />
                  <Shortcut keys="E/I" label="지우개/스포이드" />
                  <Shortcut keys="Shift+Drag" label="정비율 도형" />
                  <Shortcut keys="Ctrl+Wheel" label="줌" />
                  <Shortcut keys="Ctrl+0 / 1" label="맞춤 / 100%" />
                  <Shortcut keys="Ctrl+A/D" label="전체선택/해제" />
                  <Shortcut keys="Ctrl+J" label="복제" />
                  <Shortcut keys="[ / ]" label="브러쉬 크기" />
                  <Shortcut keys="Space/우클릭" label="팬" />
                  <Shortcut keys="Ctrl+S" label="JSON 저장" />
                </div>
              </Panel>
            )}
              </>
            )}
          </aside>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </ToolShell>
  )
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, gridSize: number) {
  ctx.save()
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.28)'
  ctx.lineWidth = 1
  for (let x = 0; x <= width; x += gridSize) {
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, height)
    ctx.stroke()
  }
  for (let y = 0; y <= height; y += gridSize) {
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(width, y + 0.5)
    ctx.stroke()
  }
  ctx.restore()
}

function selectionFromDrag(start: Point, end: Point, canvas: DrawingDocument['canvas']): PixelSelection {
  const bounds = normalizeRect(start, end)
  const left = clamp(bounds.x, 0, canvas.width)
  const top = clamp(bounds.y, 0, canvas.height)
  const right = clamp(bounds.x + bounds.width, 0, canvas.width)
  const bottom = clamp(bounds.y + bounds.height, 0, canvas.height)
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  }
}

function clampSelectionToCanvas(selection: PixelSelection, canvas: DrawingDocument['canvas']): Bounds | null {
  const left = clamp(Math.floor(selection.x), 0, canvas.width)
  const top = clamp(Math.floor(selection.y), 0, canvas.height)
  const right = clamp(Math.ceil(selection.x + selection.width), 0, canvas.width)
  const bottom = clamp(Math.ceil(selection.y + selection.height), 0, canvas.height)
  const width = right - left
  const height = bottom - top
  if (width < 1 || height < 1) return null
  return { x: left, y: top, width, height }
}

function drawPixelSelection(ctx: CanvasRenderingContext2D, selection: PixelSelection | null) {
  if (!selection || selection.width <= 0 || selection.height <= 0) return
  ctx.save()
  ctx.fillStyle = 'rgba(37, 99, 235, 0.08)'
  ctx.fillRect(selection.x, selection.y, selection.width, selection.height)
  ctx.lineWidth = 1
  ctx.setLineDash([5, 4])
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.95)'
  ctx.strokeRect(selection.x + 0.5, selection.y + 0.5, selection.width, selection.height)
  ctx.lineDashOffset = 4
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
  ctx.strokeRect(selection.x + 0.5, selection.y + 0.5, selection.width, selection.height)
  ctx.restore()
}

function drawSelection(ctx: CanvasRenderingContext2D, document: DrawingDocument, ids: string[]) {
  const bounds = getSelectionBounds(document.layers, ids)
  if (!bounds) return
  ctx.save()
  ctx.strokeStyle = '#2563eb'
  ctx.lineWidth = 1.5
  ctx.setLineDash([6, 4])
  ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
  ctx.setLineDash([])
  for (const point of handlePoints(bounds)) {
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#2563eb'
    ctx.fillRect(point.x - HANDLE_SIZE / 2, point.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
    ctx.strokeRect(point.x - HANDLE_SIZE / 2, point.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
  }
  const rotate = rotateHandlePoint(bounds)
  ctx.beginPath()
  ctx.arc(rotate.x, rotate.y, HANDLE_SIZE / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(bounds.x + bounds.width / 2, bounds.y)
  ctx.lineTo(rotate.x, rotate.y)
  ctx.stroke()
  ctx.restore()
}

function handlePoints(bounds: Bounds): Array<Point & { handle: ResizeHandle }> {
  return [
    { handle: 'nw', x: bounds.x, y: bounds.y },
    { handle: 'ne', x: bounds.x + bounds.width, y: bounds.y },
    { handle: 'sw', x: bounds.x, y: bounds.y + bounds.height },
    { handle: 'se', x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ]
}

function rotateHandlePoint(bounds: Bounds): Point {
  return { x: bounds.x + bounds.width / 2, y: bounds.y - ROTATE_HANDLE_OFFSET }
}

function hitResizeHandle(point: Point, bounds: Bounds): ResizeHandle | null {
  return handlePoints(bounds).find((handle) => Math.abs(point.x - handle.x) <= HANDLE_SIZE && Math.abs(point.y - handle.y) <= HANDLE_SIZE)?.handle ?? null
}

function hitRotateHandle(point: Point, bounds: Bounds): boolean {
  const handle = rotateHandlePoint(bounds)
  return Math.hypot(point.x - handle.x, point.y - handle.y) <= HANDLE_SIZE
}

function resizeBounds(bounds: Bounds, handle: ResizeHandle, point: Point): Bounds {
  const left = handle.includes('w') ? point.x : bounds.x
  const right = handle.includes('e') ? point.x : bounds.x + bounds.width
  const top = handle.includes('n') ? point.y : bounds.y
  const bottom = handle.includes('s') ? point.y : bounds.y + bounds.height
  const x = Math.min(left, right)
  const y = Math.min(top, bottom)
  return {
    x,
    y,
    width: Math.max(4, Math.abs(right - left)),
    height: Math.max(4, Math.abs(bottom - top)),
  }
}

function squareBoundsFromDrag(start: Point, end: Point): Bounds {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const size = Math.max(Math.abs(dx), Math.abs(dy))
  const x2 = start.x + Math.sign(dx || 1) * size
  const y2 = start.y + Math.sign(dy || 1) * size
  return normalizeRect(start, { x: x2, y: y2 })
}

function layerIcon(layer: DrawingLayer): string {
  if (layer.type === 'raster') return '✎'
  if (layer.type === 'image') return '▧'
  return '◇'
}

function SidebarHeader({
  title,
  collapsed,
  side,
  onToggle,
}: {
  title: string
  collapsed: boolean
  side: 'left' | 'right'
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white/80 p-2 dark:border-slate-800 dark:bg-slate-950/60">
      {!collapsed && <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>}
      <button
        type="button"
        onClick={onToggle}
        className="flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-sm dark:border-slate-700"
        aria-label={collapsed ? `${title} 펼치기` : `${title} 접기`}
      >
        {collapsed ? (side === 'left' ? '›' : '‹') : side === 'left' ? '‹' : '›'}
      </button>
    </div>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-300 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      {children}
    </button>
  )
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <>
      <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        {keys}
      </kbd>
      <span>{label}</span>
    </>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/60">
      <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>
      {children}
    </section>
  )
}

function FileButton({ accept, label, icon, onFile }: { accept: string; label: string; icon?: ReactNode; onFile: (file: File | undefined | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => inputRef.current?.click()}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-sm dark:border-slate-700"
      >
        {icon ?? label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          onFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />
    </>
  )
}

function NumberField({ label, value, min = -8192, max = 8192, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-xs text-slate-500">
      {label}
      <input
        type="number"
        value={Math.round(value)}
        min={min}
        max={max}
        onChange={(event) => onChange(clamp(Number(event.target.value) || 0, min, max))}
        className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:text-slate-100"
      />
    </label>
  )
}

function RangeField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-xs text-slate-500">
      <span className="flex justify-between gap-2">
        <span>{label}</span>
        <span>{Number(value.toFixed(2))}</span>
      </span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 w-full" />
    </label>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function ShapeStylePanel({
  styleSource,
  hasShape,
  recentColors,
  onPatch,
  onSwap,
}: {
  styleSource: ShapeDefaults | ShapeLayer
  hasShape: boolean
  recentColors: string[]
  onPatch: (patch: Partial<ShapeLayer>) => void
  onSwap: () => void
}) {
  const fill = styleSource.fill
  const fillStyle = styleSource.fillStyle ?? 'solid'
  const fill2 = styleSource.fill2 ?? fill
  const gradientAngle = styleSource.gradientAngle ?? 0
  const stroke = styleSource.stroke
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{hasShape ? '도형 스타일' : '새 도형 기본값'}</p>
        <button type="button" onClick={onSwap} className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700">
          색상 교체
        </button>
      </div>
      <ColorField label="내부 색상" value={fill.hex} onChange={(hex) => onPatch({ fill: { ...fill, hex } })} />
      <RangeField label="내부 투명도" value={fill.alpha} min={0} max={1} step={0.05} onChange={(alpha) => onPatch({ fill: { ...fill, alpha } })} />
      <label className="block text-xs text-slate-500">
        채우기 색상
        <select value={fillStyle} onChange={(event) => onPatch({ fillStyle: event.target.value as FillStyle })} className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700">
          <option value="solid">단색</option>
          <option value="linear-gradient">선형 그라데이션</option>
          <option value="radial-gradient">원형 그라데이션</option>
        </select>
      </label>
      {fillStyle !== 'solid' && (
        <>
          <ColorField label="그라데이션 색상" value={fill2.hex} onChange={(hex) => onPatch({ fill2: { ...fill2, hex } })} />
          <RangeField label="그라데이션 투명도" value={fill2.alpha} min={0} max={1} step={0.05} onChange={(alpha) => onPatch({ fill2: { ...fill2, alpha } })} />
          {fillStyle === 'linear-gradient' && (
            <RangeField label="그라데이션 각도" value={gradientAngle} min={-180} max={180} onChange={(gradientAngle) => onPatch({ gradientAngle })} />
          )}
        </>
      )}
      <ColorField label="테두리 색상" value={stroke.hex} onChange={(hex) => onPatch({ stroke: { ...stroke, hex } })} />
      <RangeField label="테두리 투명도" value={stroke.alpha} min={0} max={1} step={0.05} onChange={(alpha) => onPatch({ stroke: { ...stroke, alpha } })} />
      <RangeField label="테두리 두께" value={styleSource.strokeWidth} min={0} max={64} onChange={(strokeWidth) => onPatch({ strokeWidth })} />
      <RangeField label="라운드" value={styleSource.cornerRadius} min={0} max={240} onChange={(cornerRadius) => onPatch({ cornerRadius })} />
      {'kind' in styleSource && (styleSource.kind === 'polygon' || styleSource.kind === 'star') && (
        <label className="block text-xs text-slate-500">
          꼭짓점 수
          <select value={styleSource.sides} onChange={(event) => onPatch({ sides: Number(event.target.value) })} className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700">
            {[5, 6, 7, 8].map((sides) => (
              <option key={sides} value={sides}>{sides}</option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-xs text-slate-500">
        Fill 방식
        <select value={styleSource.fillMode} onChange={(event) => onPatch({ fillMode: event.target.value as ShapeLayer['fillMode'] })} className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700">
          <option value="full">전체</option>
          <option value="radial">피자 조각</option>
          <option value="horizontal">가로</option>
          <option value="vertical">세로</option>
        </select>
      </label>
      <RangeField label="Fill 양" value={styleSource.fillAmount} min={0} max={1} step={0.01} onChange={(fillAmount) => onPatch({ fillAmount })} />
      <RangeField label="Fill 시작 각도" value={styleSource.fillStartAngle} min={-180} max={180} onChange={(fillStartAngle) => onPatch({ fillStartAngle })} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={styleSource.fillClockwise} onChange={(event) => onPatch({ fillClockwise: event.target.checked })} />
        시계 방향
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={styleSource.fillReverse} onChange={(event) => onPatch({ fillReverse: event.target.checked })} />
        선형 Fill 반전
      </label>
      <div className="flex flex-wrap gap-1">
        {recentColors.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={color}
            onClick={() => onPatch({ fill: { ...fill, hex: color } })}
            className="h-6 w-6 rounded border border-slate-300 dark:border-slate-700"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  )
}
