const catRight = `${import.meta.env.BASE_URL}_footer-cat-1.png`
const catLeft = `${import.meta.env.BASE_URL}_footer-cat-2.png`

export default function Footer() {
  return (
    <footer className="relative border-t border-slate-200 dark:border-slate-800">
      <img
        src={catLeft}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute bottom-0 left-0 h-20 w-auto -scale-x-100 select-none sm:h-28"
      />
      <img
        src={catRight}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute bottom-0 right-0 h-20 w-auto select-none sm:h-28"
      />
      <div className="px-16 py-3 text-center text-sm text-slate-500 sm:px-32">
        <p className="mt-1">© 2026 고양이성공단 · 숙빠 · 아리아빠</p>
      </div>
    </footer>
  )
}
