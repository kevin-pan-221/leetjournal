import * as THREE from 'three'
import type { StudyItem } from './types'
import { atlasBox } from './atlasBox.ts'

type Triple = [number, number, number]
type UV = [number, number]

// Pixel-center grip in the shared 16px sword/pickaxe handle. Translate the
// silhouette around this point before posing it, not around the image center.
export const TOOL_GRIP: UV = [3.5, 12.5]
export function heldToolGeometry() {
  const size = 13
  const geometry = new THREE.PlaneGeometry(size, size)
  geometry.translate((8 - TOOL_GRIP[0]) * size / 16, (TOOL_GRIP[1] - 8) * size / 16, 0)
  return geometry
}

interface Options {
  onTextureLoad: () => void
  enchant: (piece: THREE.Object3D) => void
  // Injection keeps geometry/lifecycle tests independent of a browser or GPU.
  loadTexture?: (path: string, ready: () => void) => THREE.Texture
}

export function createArmorStand({ onTextureLoad, enchant, loadTexture }: Options) {
  const group = new THREE.Group()
  group.name = 'minecraft-armor-stand'
  group.userData.studyObject = 'stand'
  group.scale.setScalar(0.0675)
  const equipment = new THREE.Group()
  group.add(equipment)
  const equipmentRoots = [equipment]
  const arms = new Map<number, { armor: THREE.Group; hand: THREE.Group }>()
  const textures = new Map<string, THREE.Texture>()
  const materials = new Map<string, THREE.MeshStandardMaterial>()
  const geometries = new Set<THREE.BufferGeometry>()
  const loader = loadTexture ?? ((path, ready) => new THREE.TextureLoader().load(path, ready))
  let disposed = false

  function texture(path: string) {
    const cached = textures.get(path)
    if (cached) return cached
    const value = loader(path, () => {
      if (!disposed) onTextureLoad()
    })
    value.colorSpace = THREE.SRGBColorSpace
    value.magFilter = value.minFilter = THREE.NearestFilter
    value.generateMipmaps = false
    textures.set(path, value)
    return value
  }
  function material(path: string, leather = false) {
    const key = `${path}:${leather}`
    let value = materials.get(key)
    if (!value) {
      value = new THREE.MeshStandardMaterial({
        map: texture(path), color: leather ? 0xa06540 : 0xffffff,
        alphaTest: 0.1, side: THREE.DoubleSide, roughness: 0.8,
      })
      materials.set(key, value)
    }
    return value
  }
  function box(parent: THREE.Object3D, size: Triple, position: Triple, uv: UV,
    mat: THREE.MeshStandardMaterial, inflate = 0, atlasHeight = 32) {
    const geometry = atlasBox(size, uv, atlasHeight, inflate)
    geometries.add(geometry)
    const mesh = new THREE.Mesh(geometry, mat)
    mesh.position.set(...position)
    mesh.castShadow = mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  const wood = material('/minecraft/equipment/armor_stand.png')
  const stick = (size: Triple, position: Triple, uv: UV) => box(group, size, position, uv, wood, 0, 64)
  // A slab, two legs, two body struts, shoulder/waist crossbars, and neck peg.
  // Coordinates use model pixels: feet at 1, shoulders at 23, head at 29.
  stick([12, 1, 12], [0, 0.5, 0], [0, 32])
  stick([2, 11, 2], [-1.9, 6.5, 0], [0, 16])
  stick([2, 11, 2], [1.9, 6.5, 0], [0, 16])
  stick([2, 7, 2], [-2, 17.5, 0], [16, 0])
  stick([2, 7, 2], [2, 17.5, 0], [48, 16])
  stick([8, 2, 2], [0, 14, 0], [0, 48])
  stick([12, 3, 3], [0, 23.5, 0], [0, 26])
  stick([2, 7, 2], [0, 28.5, 0], [0, 0])
  for (const side of [-1, 1]) {
    // Shoulder is the common parent of the wooden arm, sleeve and hand socket.
    // Changing the pose therefore cannot detach armor or a held item's grip.
    const arm = new THREE.Group()
    arm.name = side === -1 ? 'right-arm' : 'left-arm'
    arm.position.set(side * 6, 25, 0)
    arm.rotation.set(-0.15, 0, side * 0.09)
    group.add(arm)
    box(arm, [2, 12, 2], [0, -6, 0], [24, 0], wood, 0, 64)
    const armor = new THREE.Group()
    const hand = new THREE.Group()
    hand.name = side === -1 ? 'right-hand' : 'left-hand'
    hand.position.set(0, -10.5, 0)
    arm.add(armor, hand)
    arms.set(side, { armor, hand })
    equipmentRoots.push(armor, hand)
  }

  function clearEquipment() {
    const old = new Set<THREE.BufferGeometry>()
    equipmentRoots.forEach((root) => {
      root.traverse((child) => { if (child instanceof THREE.Mesh) old.add(child.geometry) })
      root.clear()
    })
    old.forEach((geometry) => { geometry.dispose(); geometries.delete(geometry) })
  }
  function update(items: StudyItem[]) {
    clearEquipment()
    for (const item of items) {
      const piece = new THREE.Group()
      piece.name = `${item.material}-${item.kind}`
      equipment.add(piece)
      const enchantedParts = [piece]
      if (item.kind === 'sword' || item.kind === 'pickaxe') {
        if (!['wooden', 'iron', 'diamond'].includes(item.material)) continue
        // Main-hand sword / off-hand pickaxe, pivoting through the handle.
        const side = item.kind === 'sword' ? -1 : 1
        arms.get(side)!.hand.add(piece)
        // Rest the working end downward and slightly outward, clear of the
        // sleeve. The mirrored off-hand uses the same handle-centered pose.
        piece.rotation.set(0.15, side * 0.15, side * 2.65)
        const geometry = heldToolGeometry()
        geometries.add(geometry)
        const mesh = new THREE.Mesh(geometry, material(`/minecraft/items/${item.material}_${item.kind}.png`))
        if (side === 1) mesh.scale.x = -1
        mesh.castShadow = true
        piece.add(mesh)
      } else {
        if (!['leather', 'chainmail', 'iron', 'diamond'].includes(item.material)) continue
        const layer = item.kind === 'leggings' ? 'humanoid_leggings' : 'humanoid'
        const mat = material(`/minecraft/equipment/${layer}_${item.material}.png`, item.material === 'leather')
        const overlay = item.material === 'leather'
          ? material(`/minecraft/equipment/${layer}_leather_overlay.png`) : null
        const armor = (size: Triple, pos: Triple, uv: UV, inflate = 1, parent = piece) => {
          const mesh = box(parent, size, pos, uv, mat, inflate)
          if (overlay) {
            const detail = new THREE.Mesh(mesh.geometry, overlay)
            detail.scale.setScalar(1.001)
            detail.userData.noGlint = true
            mesh.add(detail)
          }
          return mesh
        }
        if (item.kind === 'helmet') armor([8, 8, 8], [0, 29, 0], [0, 0])
        if (item.kind === 'chestplate') {
          armor([8, 12, 4], [0, 19, 0], [16, 16])
          for (const side of [-1, 1]) {
            const sleeve = new THREE.Group()
            sleeve.name = `${item.material}-sleeve-${side}`
            arms.get(side)!.armor.add(sleeve)
            armor([4, 12, 4], [0, -6, 0], [40, 16], 1, sleeve)
            enchantedParts.push(sleeve)
          }
        }
        if (item.kind === 'leggings') {
          armor([8, 12, 4], [0, 19, 0], [16, 16], 0.5)
          armor([4, 12, 4], [-2, 7, 0], [0, 16], 0.5)
          armor([4, 12, 4], [2, 7, 0], [0, 16], 0.5)
        }
        if (item.kind === 'boots') {
          armor([4, 12, 4], [-2, 7, 0], [0, 16])
          armor([4, 12, 4], [2, 7, 0], [0, 16])
        }
      }
      if (item.enchantments.length) enchantedParts.forEach(enchant)
    }
  }
  return {
    group, update,
    dispose() {
      disposed = true
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
      textures.forEach((t) => t.dispose())
      geometries.clear(); materials.clear(); textures.clear()
      group.clear()
    },
  }
}
