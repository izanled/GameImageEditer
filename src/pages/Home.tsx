import ToolCard from '../components/ToolCard'
import { TOOLS } from '../tools/registry'

export default function Home() {
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </div>
  )
}
