import { useState } from 'react'
import { Link } from 'react-router-dom'
import ToolCard from '../components/ToolCard'
import { TOOLS, CATEGORIES, PRIMARY_TOOLS } from '../tools/registry'

type ViewMode = 'large' | 'small'

const CATEGORY_LEFT_COLOR: Record<string, string> = {
  background: 'border-l-blue-400 dark:border-l-blue-500',
  editing: 'border-l-teal-400 dark:border-l-teal-500',
  color: 'border-l-amber-400 dark:border-l-amber-500',
  sprite: 'border-l-pink-400 dark:border-l-pink-500',
}

export default function Home() {
  const [view, setView] = useState<ViewMode>(() => {
    return (localStorage.getItem('home-view') as ViewMode) ?? 'large'
  })

  const toggle = (v: ViewMode) => {
    setView(v)
    localStorage.setItem('home-view', v)
  }

  const primaryTool = PRIMARY_TOOLS[0]

  return (
    <div>
      <section className="py-8 text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">
          게임 개발용 이미지 툴킷
        </h1>
        <p className="mt-3 text-slate-500 dark:text-slate-400">
          누끼 · 자르기 · 리사이즈 · 캔버스 · 그리드 분할. 모두 브라우저에서,
          업로드 없이.
        </p>
      </section>

      {primaryTool && (
        <section className="mb-10">
          <Link
            to={primaryTool.path}
            className="group block rounded-lg border border-indigo-200 bg-white p-6 transition hover:border-indigo-400 hover:shadow-sm dark:border-indigo-900/70 dark:bg-slate-950"
          >
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-500">
                  단독 메뉴
                </p>
                <h2 className="text-2xl font-bold text-slate-950 dark:text-slate-50">
                  {primaryTool.title}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                  도형, 브러쉬, 지우개, 레이어, 색상, 투명도, 내보내기를 한 화면에서 편집
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition group-hover:bg-indigo-500">
                이미지 편집 시작
              </span>
            </div>
          </Link>
        </section>
      )}

      <div className="mb-6 flex justify-end">
        <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
          <button
            onClick={() => toggle('small')}
            className={`rounded-md px-3 py-1 text-sm transition ${
              view === 'small'
                ? 'bg-indigo-500 text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            작게
          </button>
          <button
            onClick={() => toggle('large')}
            className={`rounded-md px-3 py-1 text-sm transition ${
              view === 'large'
                ? 'bg-indigo-500 text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            크게
          </button>
        </div>
      </div>

      {view === 'large' ? (
        <div className="space-y-10">
          {CATEGORIES.map((cat) => {
            const tools = TOOLS.filter((t) => t.category === cat.id)
            return (
              <section key={cat.id}>
                <div className="mb-4 border-b border-slate-200 pb-2 dark:border-slate-800">
                  <h2 className="text-lg font-semibold">{cat.label}</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {cat.description}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {tools.map((tool) => (
                    <ToolCard key={tool.id} tool={tool} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CATEGORIES.map((cat) => {
            const tools = TOOLS.filter((t) => t.category === cat.id)
            return (
              <div
                key={cat.id}
                className={`rounded-xl border-t border-r border-b border-l-4 border-slate-200 p-5 dark:border-slate-700 ${CATEGORY_LEFT_COLOR[cat.id]}`}
              >
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                  {tools.length}개 도구
                </p>
                <h2 className="mb-0.5 text-base font-semibold">{cat.label}</h2>
                <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
                  {cat.description}
                </p>
                <ul className="space-y-0.5">
                  {tools.map((tool) => (
                    <li key={tool.id}>
                      <Link
                        to={tool.path}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-base transition hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <span className="text-lg leading-none">{tool.icon}</span>
                        <span className="text-slate-700 dark:text-slate-300">{tool.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
