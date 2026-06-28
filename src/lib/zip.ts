import JSZip from 'jszip'
import { downloadBlob } from './image/export'

export interface ZipEntry {
  name: string
  blob: Blob
}

export async function downloadZip(entries: ZipEntry[], zipName: string): Promise<void> {
  const zip = new JSZip()
  for (const entry of entries) {
    zip.file(entry.name, entry.blob)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, zipName)
}
