import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  logFeatureView,
  logPageView,
  logWebException,
  type FeatureViewParams,
} from '../lib/firebase'
import { ALL_TOOLS } from '../tools/registry'

let lastLoggedPagePath: string | undefined

type TrackedFeature = Omit<FeatureViewParams, 'pagePath'>

const GUIDE_FEATURES: Record<string, TrackedFeature> = {
  '/guide/background-removal': {
    featureId: 'background-removal-guide',
    featureType: 'guide',
    category: 'background',
    ready: true,
  },
}

function getErrorDescription(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }

  if (typeof error === 'string') {
    return error
  }

  return fallback
}

function getTrackedFeature(pathname: string): TrackedFeature {
  if (pathname === '/') {
    return {
      featureId: 'home',
      featureType: 'home',
      category: 'navigation',
      ready: true,
    }
  }

  const tool = ALL_TOOLS.find((item) => item.path === pathname)

  if (tool) {
    return {
      featureId: tool.id,
      featureType: 'tool',
      category: tool.category,
      ready: tool.ready,
    }
  }

  return (
    GUIDE_FEATURES[pathname] ?? {
      featureId: pathname.replace(/^\/+/, '').replace(/[^a-zA-Z0-9_/-]/g, '_') || 'unknown',
      featureType: 'unknown',
      category: 'unknown',
    }
  )
}

export default function FirebaseAnalyticsTracker() {
  const location = useLocation()

  useEffect(() => {
    const pagePath = `${location.pathname}${location.search}${location.hash}`

    if (lastLoggedPagePath === pagePath) {
      return
    }

    lastLoggedPagePath = pagePath
    void logPageView(pagePath, document.title)
    void logFeatureView({
      ...getTrackedFeature(location.pathname),
      pagePath,
    })
  }, [location.hash, location.pathname, location.search])

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      void logWebException(getErrorDescription(event.error, event.message || 'window.error'), true)
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      void logWebException(
        getErrorDescription(event.reason, 'unhandledrejection'),
        true,
      )
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return null
}
