import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import FirebaseAnalyticsTracker from './components/FirebaseAnalyticsTracker'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <FirebaseAnalyticsTracker />
      <App />
    </HashRouter>
  </StrictMode>,
)
