import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const isImageEditor = location.pathname === '/image-editor'

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Header />
      <main className={isImageEditor ? 'flex-1 w-full px-3 py-6' : 'flex-1 mx-auto w-full max-w-6xl px-4 py-8'}>
        {children}
      </main>
      <Footer />
    </div>
  )
}
