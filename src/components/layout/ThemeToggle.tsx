import { useTheme } from '../../store/themeStore'

export default function ThemeToggle() {
  const theme = useTheme((s) => s.theme)
  const toggle = useTheme((s) => s.toggle)
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="테마 전환"
      className="rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      {theme === 'dark' ? '☀️ 라이트' : '🌙 다크'}
    </button>
  )
}
