import * as THREE from 'three'
import { atlasBox } from './atlasBox.ts'

/** Remove the upward cap; side walls and the floor retain their atlas UVs. */
function openTop(geometry: THREE.BoxGeometry, inward = false) {
  const indices = Array.from(geometry.getIndex()!.array)
  indices.splice(12, 6) // BoxGeometry's +Y face.
  if (inward) {
    for (let i = 0; i < indices.length; i += 3)
      [indices[i], indices[i + 2]] = [indices[i + 2], indices[i]]
    const normals = geometry.getAttribute('normal')
    for (let i = 0; i < normals.count; i++)
      normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i))
  }
  geometry.setIndex(indices)
  geometry.clearGroups()
  return geometry
}

/** Four top strips join the outer and inner walls without covering the opening. */
function chestRim() {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = []
  for (const [x0, x1, z0, z1] of [
    [-7, 7, -7, -6], [-7, 7, 6, 7], [-7, -6, -6, 6], [6, 7, -6, 6],
  ]) {
    const start = positions.length / 3
    for (const [x, z] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]]) {
      positions.push(x, 5, z)
      uvs.push((14 + x + 7) / 64, 1 - (19 + z + 7) / 64)
    }
    indices.push(start, start + 1, start + 2, start + 2, start + 1, start + 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Single chest: separate body, lid and latch mapped to the default 64px atlas. */
export function createChest(texture: THREE.Texture) {
  const group = new THREE.Group()
  group.name = 'minecraft-chest'
  group.userData.studyObject = 'chest'
  group.scale.setScalar(1 / 16)
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, side: THREE.DoubleSide })
  const interiorMaterial = material.clone()
  interiorMaterial.color.setHex(0x796249)
  const geometries: THREE.BufferGeometry[] = []
  const hinge = new THREE.Group()
  hinge.name = 'lid-hinge'
  hinge.position.set(0, 9, -7)
  group.add(hinge)
  let openness = 0, target = 0, from = 0, started = 0, duration = 0
  const parts = [
    { name: 'body', size: [14, 10, 14], uv: [0, 19], position: [0, 5, 0] },
    { name: 'lid', size: [14, 5, 14], uv: [0, 0], position: [0, 11.5, 0] },
    { name: 'latch', size: [2, 4, 1], uv: [0, 0], position: [0, 10, 7.5] },
  ] as const
  for (const part of parts) {
    const geometry = atlasBox([...part.size], [...part.uv], 64)
    // The lid exterior uses the second cap. The body's top is removed below.
    const uv = geometry.getAttribute('uv')
    for (let corner = 0; part.name !== 'body' && corner < 4; corner++) {
      const top = 8 + corner, bottom = 12 + corner
      const x = uv.getX(top), y = uv.getY(top)
      uv.setXY(top, uv.getX(bottom), uv.getY(bottom))
      uv.setXY(bottom, x, y)
    }
    geometries.push(geometry)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = part.name
    mesh.position.set(part.position[0], part.position[1], part.position[2])
    mesh.castShadow = mesh.receiveShadow = true
    if (part.name === 'body') {
      openTop(geometry)
      group.add(mesh)
      // One model-pixel wall/floor thickness. Interior faces point into the
      // cavity and meet the rim at y=10; the recessed floor sits at y=1.
      const insideGeometry = openTop(atlasBox([14, 10, 14], [0, 19], 64), true)
      insideGeometry.scale(12 / 14, 9 / 10, 12 / 14)
      insideGeometry.translate(0, 0.5, 0)
      const rimGeometry = chestRim()
      geometries.push(insideGeometry, rimGeometry)
      const inside = new THREE.Mesh(insideGeometry, interiorMaterial)
      inside.name = 'interior'
      const rim = new THREE.Mesh(rimGeometry, material)
      rim.name = 'rim'
      for (const surface of [inside, rim]) {
        surface.castShadow = surface.receiveShadow = true
        mesh.add(surface)
      }
    }
    else {
      mesh.position.sub(hinge.position)
      hinge.add(mesh)
    }
  }
  return {
    group,
    /** Returns whether another frame is needed; changes of direction never jump. */
    update(time: number, open: boolean, animate: boolean) {
      const desired = open ? 1 : 0
      if (!animate) {
        openness = target = desired
        duration = 0
      } else {
        if (duration > 0) {
          const progress = Math.min(1, Math.max(0, (time - started) / duration))
          openness = from + (target - from) * (1 - (1 - progress) ** 3)
          if (progress === 1) { openness = target; duration = 0 }
        }
        if (desired !== target) {
          from = openness
          target = desired
          started = time
          duration = 300 * Math.abs(target - from)
        }
      }
      hinge.rotation.x = -openness * Math.PI / 2
      return openness !== target
    },
    dispose() {
      geometries.forEach((geometry) => geometry.dispose())
      material.dispose()
      interiorMaterial.dispose()
      group.clear()
      // The shared room texture cache owns the atlas, not this model.
    },
  }
}
