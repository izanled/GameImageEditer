import { Link } from 'react-router-dom'
import type { ToolDef } from '../tools/registry'

export default function ToolPlaceholder({ tool }: { tool: ToolDef }) {
  return (
    <div className="py-16 text-center">
      <div className="mb-4 text-5xl">{tool.icon}</div>
      <h1 className="text-2xl font-bold">{tool.title}</h1>
      <p className="mx-auto mt-2 max-w-md text-slate-500 dark:text-slate-400">
        {tool.description}
      </p>
      <p className="mt-6 inline-block rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        준비 중입니다
      </p>
      <div className="mt-8">
        <Link to="/" className="text-indigo-500 hover:underline">
          ← 홈으로
        </Link>
      </div>
    </div>
  )
}
