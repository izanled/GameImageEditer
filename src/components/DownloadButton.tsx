import type { ReactNode } from 'react'

interface Props {
  onClick: () => void
  disabled?: boolean
  children?: ReactNode
}

export default function DownloadButton({ onClick, disabled, children }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children ?? '다운로드'}
    </button>
  )
}
