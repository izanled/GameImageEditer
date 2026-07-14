import type { ComponentType } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Home from './pages/Home'
import ToolPlaceholder from './pages/ToolPlaceholder'
import BackgroundRemovalGuide from './pages/BackgroundRemovalGuide'
import { ALL_TOOLS } from './tools/registry'
import ImageEditorTool from './tools/image-editor/ImageEditorTool'
import ResizeTool from './tools/resize/ResizeTool'
import CanvasResizeTool from './tools/canvas-resize/CanvasResizeTool'
import CropTool from './tools/crop/CropTool'
import GridSliceTool from './tools/grid-slice/GridSliceTool'
import GifSplitTool from './tools/gif-split/GifSplitTool'
import BackgroundRemovalTool from './tools/background-removal/BackgroundRemovalTool'
import ChromaKeyTool from './tools/chroma-key/ChromaKeyTool'
import SpriteSheetTool from './tools/sprite-sheet/SpriteSheetTool'
import SheetEditorTool from './tools/sheet-editor/SheetEditorTool'
import CompressTool from './tools/compress/CompressTool'
import ColorAdjustTool from './tools/color-adjust/ColorAdjustTool'
import PaletteTool from './tools/palette/PaletteTool'
import ReplaceColorTool from './tools/replace-color/ReplaceColorTool'
import PixelateTool from './tools/pixelate/PixelateTool'

const COMPONENTS: Record<string, ComponentType> = {
  'image-editor': ImageEditorTool,
  'background-removal': BackgroundRemovalTool,
  'chroma-key': ChromaKeyTool,
  resize: ResizeTool,
  'canvas-resize': CanvasResizeTool,
  crop: CropTool,
  'sprite-sheet': SpriteSheetTool,
  'sheet-editor': SheetEditorTool,
  compress: CompressTool,
  'color-adjust': ColorAdjustTool,
  palette: PaletteTool,
  'replace-color': ReplaceColorTool,
  pixelate: PixelateTool,
  'grid-slice': GridSliceTool,
  'gif-split': GifSplitTool,
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/guide/background-removal" element={<BackgroundRemovalGuide />} />
        {ALL_TOOLS.map((tool) => {
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
