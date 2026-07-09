import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  initializeAnalytics,
  isSupported,
  logEvent,
  type Analytics,
  type EventParams,
} from 'firebase/analytics'

const firebaseConfig = {
  apiKey: 'AIzaSyCZPZQtAR85Hs6hmPgHSzuVAbGm-HK1FW0',
  authDomain: 'gameimageediter.firebaseapp.com',
  projectId: 'gameimageediter',
  storageBucket: 'gameimageediter.firebasestorage.app',
  messagingSenderId: '1054503898978',
  appId: '1:1054503898978:web:a0f69e2b2d354f844f663b',
  measurementId: 'G-YEBZWYMZ7Y',
}

export const firebaseApp: FirebaseApp =
  getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig)

let analyticsPromise: Promise<Analytics | null> | undefined

export function getFirebaseAnalytics(): Promise<Analytics | null> {
  analyticsPromise ??= isSupported()
    .then((supported) =>
      supported
        ? initializeAnalytics(firebaseApp, {
            config: {
              send_page_view: false,
            },
          })
        : null,
    )
    .catch((error: unknown) => {
      if (import.meta.env.DEV) {
        console.warn('[firebase] Analytics is not available in this environment.', error)
      }
      return null
    })

  return analyticsPromise
}

export async function logAnalyticsEvent(name: string, params?: EventParams) {
  const analytics = await getFirebaseAnalytics()

  if (!analytics) {
    return
  }

  logEvent(analytics, name, params)
}

export function logPageView(pagePath: string, pageTitle: string) {
  return logAnalyticsEvent('page_view', {
    page_location: window.location.href,
    page_path: pagePath,
    page_title: pageTitle,
  })
}

export interface FeatureViewParams {
  featureId: string
  featureType: 'home' | 'tool' | 'guide' | 'unknown'
  pagePath: string
  category?: string
  ready?: boolean
}

export function logFeatureView({
  featureId,
  featureType,
  pagePath,
  category,
  ready,
}: FeatureViewParams) {
  const params: EventParams = {
    feature_id: featureId,
    feature_type: featureType,
    feature_category: category ?? 'uncategorized',
    page_location: window.location.href,
    page_path: pagePath,
  }

  if (ready !== undefined) {
    params.feature_ready = String(ready)
  }

  return logAnalyticsEvent('feature_view', params)
}

// Firebase Crashlytics does not provide a Web SDK. Track browser errors as GA4 exception events.
export function logWebException(description: string, fatal = false) {
  return logAnalyticsEvent('exception', {
    description,
    fatal,
  })
}
