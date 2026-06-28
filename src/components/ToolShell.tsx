import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ToolDef } from '../tools/registry'

interface Props {
  tool: ToolDef
  children: ReactNode
}

export default function ToolShell({ tool, children }: Props) {
  return (
    <div>
      <Link to="/" className="text-sm text-indigo-500 hover:underline">
        ← 홈
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <span className="text-3xl">{tool.icon}</span>
        <div>
          <h1 className="text-2xl font-bold">{tool.title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {tool.description}
          </p>
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </div>
  )
}
