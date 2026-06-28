import { Link } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import PreviewBgPicker from './PreviewBgPicker'

export default function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold">
          <span>🎮</span>
          <span>게임 이미지 툴킷</span>
        </Link>
        <div className="flex items-center gap-3">
          <PreviewBgPicker />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
