export interface SurfaceRect { x: number; y: number; width: number; height: number }
export interface SurfaceLayout {
  rect: SurfaceRect
  viewportWidth: number
  viewportHeight: number
  devicePixelRatio: number
  radius: number
  inset: number
  borderWidth: number
  borderColor: number[]
  background: number[]
}
export interface SurfaceReport { sequence: number; visible: boolean; actual: SurfaceRect | null }

function color(value: string): number[] {
  const values = value.match(/[\d.]+/g)?.map(Number) ?? []
  if (values.length < 3) throw new Error('Browser frame requires an RGB color')
  return [values[0] / 255, values[1] / 255, values[2] / 255, values[3] ?? 1]
}

export function measureSurface(element: HTMLElement): SurfaceLayout | null {
  const r = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  const borderWidth = parseFloat(style.borderTopWidth) || 0
  const inset = borderWidth + (parseFloat(style.paddingTop) || 0)
  // Never create a 1px native browser for a hidden/prewarming slot.
  if (r.width <= inset * 2 || r.height <= inset * 2 || r.bottom <= 0 || r.right <= 0
    || r.top >= innerHeight || r.left >= innerWidth || style.visibility === 'hidden') return null
  return {
    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    viewportWidth: innerWidth, viewportHeight: innerHeight, devicePixelRatio,
    radius: parseFloat(style.borderTopLeftRadius) || 0, inset, borderWidth,
    borderColor: color(style.borderTopColor), background: color(style.backgroundColor),
  }
}

export function geometryError(expected: SurfaceRect, actual: SurfaceRect): number {
  return Math.max(...(['x', 'y', 'width', 'height'] as const).map(key => Math.abs(expected[key] - actual[key])))
}
