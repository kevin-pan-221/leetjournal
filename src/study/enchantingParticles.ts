import * as THREE from 'three'

export const ENCHANTING_GLYPHS = Array.from('abcdefghijklmnopqrstuvwxyz',
  (letter) => `/minecraft/particles/sga_${letter}.png`)

type Point = readonly [number, number, number]
interface Options {
  origins: readonly Point[]
  target: Point
  onLoad: () => void
  loadTexture?: (path: string, ready: () => void) => THREE.Texture
}

/** Default SGA sprites; bounded allocation with a fresh glyph on each journey. */
export function createEnchantingParticles({ origins, target, onLoad, loadTexture }: Options) {
  const group = new THREE.Group()
  group.name = 'enchanting-glyphs'
  let disposed = false
  const load = loadTexture ?? ((path, ready) => new THREE.TextureLoader().load(path, ready))
  const textures = ENCHANTING_GLYPHS.map((path) => {
    const texture = load(path, () => { if (!disposed) onLoad() })
    texture.colorSpace = THREE.SRGBColorSpace
    texture.magFilter = texture.minFilter = THREE.NearestFilter
    texture.generateMipmaps = false
    return texture
  })
  const sprites = Array.from({ length: 14 }, (_, index) => {
    const material = new THREE.SpriteMaterial({
      map: textures[index], transparent: true, opacity: 0,
      depthWrite: false, toneMapped: false,
    })
    const sprite = new THREE.Sprite(material)
    sprite.scale.setScalar(0.16)
    sprite.visible = false
    group.add(sprite)
    return sprite
  })
  return {
    group,
    update(time: number, moving: boolean, shelves: number, burst: number) {
      const count = Math.min(origins.length, Math.max(0, Math.floor(shelves)))
      sprites.forEach((sprite, index) => {
        sprite.visible = origins.length > 0 && index < Math.max(count, burst > 0 ? sprites.length : 0)
        if (!sprite.visible) return
        const t = (moving ? time / 4500 : 0) + index / sprites.length
        const progress = t % 1
        const origin = origins[index % Math.max(1, count)]
        const glyph = (index * 7 + Math.floor(t) * 11) % textures.length
        sprite.material.map = textures[glyph]
        sprite.material.opacity = 0.8 * Math.min(1, progress / 0.12, (1 - progress) / 0.16)
        sprite.position.set(
          origin[0] * (1 - progress) + target[0] * progress,
          origin[1] * (1 - progress) + target[1] * progress + Math.sin(progress * Math.PI) * 0.7,
          origin[2] * (1 - progress) + target[2] * progress,
        )
      })
    },
    dispose() {
      disposed = true
      sprites.forEach((sprite) => sprite.material.dispose())
      textures.forEach((texture) => texture.dispose())
      group.clear()
    },
  }
}
