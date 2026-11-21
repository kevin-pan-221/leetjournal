import * as THREE from 'three'

/** Transparent pixel streaks, mapped onto equipment surfaces, never the stand. */
export function createEnchantmentGlint() {
  const size = 32
  const pixels = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const band = (x + y * 2) % 16
      const offset = (y * size + x) * 4
      pixels.set([140, 76, 220, band < 3 ? 110 : band < 6 ? 45 : 8], offset)
    }
  const texture = new THREE.DataTexture(pixels, size, size)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = texture.minFilter = THREE.NearestFilter
  texture.needsUpdate = true
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    toneMapped: false,
  })
  const maskedMaterials = new Map<THREE.Texture, THREE.MeshBasicMaterial>()
  function surfaceMaterial(surface: THREE.Mesh) {
    const base = surface.material as THREE.MeshStandardMaterial
    if (!base.map) return material
    let masked = maskedMaterials.get(base.map)
    if (!masked) {
      masked = material.clone()
      const mask = base.map
      masked.onBeforeCompile = (shader) => {
        shader.uniforms.armorMask = { value: mask }
        shader.vertexShader = 'varying vec2 vArmorUv;\n' + shader.vertexShader
        shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvArmorUv = uv;')
        shader.fragmentShader = 'uniform sampler2D armorMask;\nvarying vec2 vArmorUv;\n' + shader.fragmentShader
        shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>',
          'float armorAlpha = texture2D(armorMask, vArmorUv).a;\nif (armorAlpha < 0.1) discard;\ndiffuseColor.a *= armorAlpha;\n#include <alphatest_fragment>')
      }
      masked.customProgramCacheKey = () => 'armor-alpha-glint-v1'
      maskedMaterials.set(mask, masked)
    }
    return masked
  }
  return {
    attach(piece: THREE.Object3D) {
      // Collect first: adding children inside traverse would visit the overlays.
      const surfaces: THREE.Mesh[] = []
      piece.traverse((child) => {
        if (child instanceof THREE.Mesh && !child.userData.noGlint) surfaces.push(child)
      })
      for (const surface of surfaces) {
        const layer = new THREE.Mesh(surface.geometry, surfaceMaterial(surface))
        layer.name = 'enchantment-glint'
        layer.userData.noGlint = true
        layer.raycast = () => {}
        layer.renderOrder = 1
        surface.add(layer)
      }
    },
    update(time: number, moving: boolean) {
      texture.offset.set(
        moving ? (time / 8500) % 1 : 0.2,
        moving ? (time / 13000) % 1 : 0.35,
      )
    },
    dispose() {
      texture.dispose()
      material.dispose()
      maskedMaterials.forEach((m) => m.dispose())
      maskedMaterials.clear()
    },
  }
}
