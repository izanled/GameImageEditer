import type { UndoRedo } from '../hooks/useUndoRedo'

interface Props {
  onSwap: () => void
  history: UndoRedo
}

const btn =
  'rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800'

/** Swap original/result order + undo/redo buttons shown above tool previews. */
export default function PreviewControls({ onSwap, history }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={onSwap} className={btn} title="원본과 결과의 위아래 위치를 바꿉니다">
        ⇅ 원본/결과 위치 바꾸기
      </button>
      <button
        type="button"
        onClick={history.undo}
        disabled={!history.canUndo}
        className={btn}
        title="실행취소 (Ctrl+Z)"
      >
        ↶ 실행취소
      </button>
      <button
        type="button"
        onClick={history.redo}
        disabled={!history.canRedo}
        className={btn}
        title="다시 실행 (Ctrl+Y)"
      >
        ↷ 다시 실행
      </button>
    </div>
  )
}
