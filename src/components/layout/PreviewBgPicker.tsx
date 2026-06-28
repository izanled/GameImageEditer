import { usePreviewBg, type PreviewBg } from '../../store/previewBgStore'

const OPTIONS: { value: PreviewBg; label: string; className: string }[] = [
  { value: 'transparent', label: '투명(체크)', className: 'checker-swatch' },
  { value: 'navy', label: '네이비', className: 'bg-[#172554]' },
  { value: 'ivory', label: '아이보리', className: 'bg-[#f8f4e3]' },
  { value: 'white', label: '흰색', className: 'bg-white' },
  { value: 'black', label: '블랙', className: 'bg-black' },
]

export default function PreviewBgPicker() {
  const previewBg = usePreviewBg((s) => s.previewBg)
  const setPreviewBg = usePreviewBg((s) => s.setPreviewBg)
  return (
    <div className="flex items-center gap-1" role="group" aria-label="미리보기 배경색">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setPreviewBg(o.value)}
          aria-label={`미리보기 배경: ${o.label}`}
          aria-pressed={previewBg === o.value}
          title={o.label}
          className={`h-6 w-6 rounded border ${o.className} ${
            previewBg === o.value
              ? 'border-blue-500 ring-2 ring-blue-500'
              : 'border-slate-300 dark:border-slate-600'
          }`}
        />
      ))}
    </div>
  )
}
