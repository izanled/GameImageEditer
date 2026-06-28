function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path
}

export interface HealthResult {
  ok: boolean
  info?: Record<string, unknown>
  error?: string
}

/** Ping the local background-removal module's /health endpoint. */
export async function checkLocalHealth(baseUrl: string): Promise<HealthResult> {
  try {
    const res = await fetch(joinUrl(baseUrl, '/health'), { method: 'GET' })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const info = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: true, info }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Send an image to the local module and get back the cut-out (transparent PNG). */
export async function removeBackgroundLocal(
  baseUrl: string,
  file: Blob,
): Promise<Blob> {
  const fd = new FormData()
  fd.append('file', file, 'image.png')
  const res = await fetch(joinUrl(baseUrl, '/remove-bg'), {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`로컬 모듈 오류: HTTP ${res.status} ${detail}`.trim())
  }
  const blob = await res.blob()
  if (!blob.type.startsWith('image/')) {
    throw new Error('로컬 모듈이 이미지를 반환하지 않았습니다.')
  }
  return blob
}
