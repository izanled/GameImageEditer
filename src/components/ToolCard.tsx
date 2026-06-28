import { Link } from 'react-router-dom'
import type { ToolDef } from '../tools/registry'

export default function ToolCard({ tool }: { tool: ToolDef }) {
  return (
    <Link
      to={tool.path}
      className="group relative flex flex-col gap-2 rounded-xl border border-slate-200 p-5 transition hover:border-indigo-400 hover:shadow-md dark:border-slate-800 dark:hover:border-indigo-500"
    >
      {!tool.ready && (
        <span className="absolute right-3 top-3 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          준비 중
        </span>
      )}
      <div className="text-3xl">{tool.icon}</div>
      <div className="font-semibold">{tool.title}</div>
      <div className="text-sm text-slate-500 dark:text-slate-400">
        {tool.short}
      </div>
    </Link>
  )
}
