import type { ComponentType } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Home from './pages/Home'
import ToolPlaceholder from './pages/ToolPlaceholder'
import BackgroundRemovalGuide from './pages/BackgroundRemovalGuide'
import { TOOLS } from './tools/registry'
import ResizeTool from './tools/resize/ResizeTool'
import CanvasResizeTool from './tools/canvas-resize/CanvasResizeTool'
import CropTool from './tools/crop/CropTool'
import GridSliceTool from './tools/grid-slice/GridSliceTool'
import BackgroundRemovalTool from './tools/background-removal/BackgroundRemovalTool'
import ChromaKeyTool from './tools/chroma-key/ChromaKeyTool'
import SpriteSheetTool from './tools/sprite-sheet/SpriteSheetTool'
import SheetEditorTool from './tools/sheet-editor/SheetEditorTool'
import CompressTool from './tools/compress/CompressTool'

const COMPONENTS: Record<string, ComponentType> = {
  'background-removal': BackgroundRemovalTool,
  'chroma-key': ChromaKeyTool,
  resize: ResizeTool,
  'canvas-resize': CanvasResizeTool,
  crop: CropTool,
  'sprite-sheet': SpriteSheetTool,
  'sheet-editor': SheetEditorTool,
  compress: CompressTool,
  'grid-slice': GridSliceTool,
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/guide/background-removal" element={<BackgroundRemovalGuide />} />
        {TOOLS.map((tool) => {
          const Tool = COMPONENTS[tool.id]
          return (
            <Route
              key={tool.id}
              path={tool.path}
              element={Tool ? <Tool /> : <ToolPlaceholder tool={tool} />}
            />
          )
        })}
        <Route path="*" element={<Home />} />
      </Routes>
    </Layout>
  )
}
