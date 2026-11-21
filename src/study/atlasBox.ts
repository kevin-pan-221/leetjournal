import * as THREE from 'three'

/** Minecraft cuboid UV layout; dimensions stay in model pixels before scaling. */
export function atlasBox(size: [number, number, number], origin: [number, number], atlasHeight = 32, inflate = 0) {
  const [w, h, d] = size
  const [u, v] = origin
  const geometry = new THREE.BoxGeometry(w + 2 * inflate, h + 2 * inflate, d + 2 * inflate)
  // BoxGeometry faces: +X, -X, +Y, -Y, +Z (front), -Z.
  const faces = [
    [u + d + w, v + d, d, h], [u, v + d, d, h],
    [u + d, v, w, d], [u + d + w, v, w, d],
    [u + d, v + d, w, h], [u + 2 * d + w, v + d, w, h],
  ]
  const uv = geometry.getAttribute('uv')
  faces.forEach(([x, y, width, height], face) => {
    const points = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]]
    points.forEach(([px, py], corner) => uv.setXY(face * 4 + corner, px / 64, 1 - py / atlasHeight))
  })
  return geometry
}
