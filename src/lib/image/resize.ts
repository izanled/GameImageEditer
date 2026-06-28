/**
 * Given a source size and one changed dimension, compute the other dimension
 * so the aspect ratio is preserved. Pure function (unit-tested).
 */
export function lockedDimension(
  srcW: number,
  srcH: number,
  changed: 'width' | 'height',
  value: number,
): number {
  if (srcW <= 0 || srcH <= 0) return value
  if (changed === 'width') return Math.max(1, Math.round((value * srcH) / srcW))
  return Math.max(1, Math.round((value * srcW) / srcH))
}
