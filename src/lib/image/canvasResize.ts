export type Anchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right'

export const ANCHORS: Anchor[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
]

/**
 * Top-left position at which to draw an image of size (iw, ih) inside a canvas
 * of size (cw, ch), according to the anchor. Pure function (unit-tested).
 */
export function anchorOffset(
  anchor: Anchor,
  cw: number,
  ch: number,
  iw: number,
  ih: number,
): [number, number] {
  const x = anchor.includes('left')
    ? 0
    : anchor.includes('right')
      ? cw - iw
      : Math.round((cw - iw) / 2)
  const y = anchor.includes('top')
    ? 0
    : anchor.includes('bottom')
      ? ch - ih
      : Math.round((ch - ih) / 2)
  return [x, y]
}
