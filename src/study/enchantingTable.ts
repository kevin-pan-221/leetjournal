import * as THREE from 'three'
import { atlasBox } from './atlasBox.ts'

interface TableTextures {
  top: THREE.Texture
  side: THREE.Texture
  bottom: THREE.Texture
  book: THREE.Texture
}

export function createEnchantingTable(textures: TableTextures) {
  const group = new THREE.Group()
  group.name = 'minecraft-enchanting-table'
  group.userData.studyObject = 'table'
  const material = (map: THREE.Texture) => new THREE.MeshStandardMaterial({
    map, roughness: 0.85, side: THREE.DoubleSide, alphaTest: 0.1,
  })
  const top = material(textures.top), side = material(textures.side)
  const bottom = material(textures.bottom), bookMaterial = material(textures.book)
  const geometries: THREE.BufferGeometry[] = []
  // Vanilla block model: 16×12×16, side UVs [0,4,16,16].
  const geometry = new THREE.BoxGeometry(1.3, 1.3 * 12 / 16, 1.3)
  geometries.push(geometry)
  const uv = geometry.getAttribute('uv')
  for (const face of [0, 1, 4, 5])
    for (let corner = 0; corner < 4; corner++) {
      const index = face * 4 + corner
      uv.setY(index, uv.getY(index) * 12 / 16)
    }
  const base = new THREE.Mesh(geometry, [side, side, top, bottom, side, side])
  base.name = 'table-base'
  base.position.y = 1.3 * 6 / 16
  base.castShadow = base.receiveShadow = true
  group.add(base)

  const book = new THREE.Group(), left = new THREE.Group(), right = new THREE.Group()
  book.name = 'floating-book'
  book.scale.setScalar(0.075)
  book.position.y = 1.32
  book.rotation.y = -0.15
  left.rotation.z = 0.2
  right.rotation.z = -0.2
  book.add(left, right)
  group.add(book)
  function part(parent: THREE.Group, name: string, size: [number, number, number],
    origin: [number, number], x: number, y: number) {
    const geometry = atlasBox(size, origin)
    // Book atlas is laid out upright; rotate it onto the horizontal book.
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(x, y, 0)
    geometries.push(geometry)
    const mesh = new THREE.Mesh(geometry, bookMaterial)
    mesh.name = name
    mesh.castShadow = mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  part(left, 'left-cover', [6, 10, 0], [0, 0], -3, 0)
  part(right, 'right-cover', [6, 10, 0], [16, 0], 3, 0)
  part(book, 'spine', [2, 10, 0], [12, 0], 0, -0.1)
  part(left, 'left-pages', [5, 8, 1], [0, 10], -2.5, 0.6)
  part(right, 'right-pages', [5, 8, 1], [12, 10], 2.5, 0.6)
  const page = new THREE.Group()
  page.name = 'turning-page'
  page.position.y = 1.2
  book.add(page)
  part(page, 'page', [5, 8, 0], [24, 10], 2.5, 0)

  return {
    group, book, left, right, page,
    dispose() {
      geometries.forEach((geometry) => geometry.dispose())
      ;[top, side, bottom, bookMaterial].forEach((material) => material.dispose())
      group.clear()
      // Atlas lifetime belongs to the room's shared texture cache.
    },
  }
}
