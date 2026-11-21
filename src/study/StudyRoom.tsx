import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { StudyObject, StudyState } from './types'
import { makeTextures, type TextureName } from './textures'
import { fitStudyCamera } from './camera'
import { createEnchantmentGlint } from './enchantmentGlint'
import { createArmorStand } from './armorStand'
import { createChest } from './chest'
import { createEnchantingTable } from './enchantingTable'
import { createEnchantingParticles } from './enchantingParticles'

interface Props {
  state: StudyState
  animate: boolean
  activeObject: StudyObject | null
  onSelect: (object: StudyObject) => void
  reveal: number
}

export function StudyRoom({ state, animate, activeObject, onSelect, reveal }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const latest = useRef({ state, animate, activeObject, onSelect, reveal })
  latest.current = { state, animate, activeObject, onSelect, reveal }
  const [error, setError] = useState('')
  useEffect(() => {
    const element = host.current
    if (!element) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        powerPreference: 'low-power',
      })
    } catch {
      setError(
        '3D is unavailable on this device. Your inventory and enchanting still work below.',
      )
      return
    }
    setError('')
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.35
    renderer.domElement.setAttribute(
      'aria-label',
      'A textured block study with an enchanting table, bookshelves and equipped armor stand',
    )
    renderer.domElement.setAttribute('role', 'img')
    element.append(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#1c1b24')
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 60)
    camera.position.set(5.8, 5.2, 9.8)
    camera.lookAt(0, 1.45, -0.4)
    let disposed = false,
      frame = 0,
      lastFrame = 0,
      dirty = true,
      inside = true,
      lastEquipment = '',
      lastReveal = 0,
      burstStart = -10000
    const textures = makeTextures(() => { dirty = true; schedule() })
    let hoveredObject: StudyObject | null = null
    let lastEquipmentState: StudyState | null = null
    const geometry = new THREE.BoxGeometry(1, 1, 1),
      materials = new Map<string, THREE.MeshStandardMaterial>()
    const mat = (key: string) => {
      let m = materials.get(key)
      if (m) return m
      m = new THREE.MeshStandardMaterial(
        key.startsWith('#')
          ? { color: key, roughness: 0.88 }
          : { map: textures.get(key as TextureName), roughness: 0.93 },
      )
      materials.set(key, m)
      return m
    }
    const hitObjects: THREE.Object3D[] = []
    function block(
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      material: string | THREE.Material[],
      parent: THREE.Object3D = scene,
      hit?: StudyObject,
    ) {
      const mesh = new THREE.Mesh(
        geometry,
        Array.isArray(material) ? material : mat(material),
      )
      mesh.position.set(x, y, z)
      mesh.scale.set(w, h, d)
      mesh.castShadow = true
      mesh.receiveShadow = true
      parent.add(mesh)
      if (hit) {
        mesh.userData.studyObject = hit
        hitObjects.push(mesh)
      }
      return mesh
    }
    scene.add(new THREE.HemisphereLight('#c5cfec', '#74513a', 1.65))
    const sun = new THREE.DirectionalLight('#ffe2af', 3)
    sun.position.set(-3, 7, 4)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.left = -7
    sun.shadow.camera.right = 7
    sun.shadow.camera.top = 7
    sun.shadow.camera.bottom = -7
    sun.shadow.normalBias = 0.04
    scene.add(sun)
    const glow = new THREE.PointLight('#bf82ff', 5, 5, 2)
    glow.position.set(0, 2.1, 0.1)
    scene.add(glow)
    for (let x = -4; x <= 4; x++)
      for (let z = -3; z <= 7; z++)
        block(
          x,
          -0.25,
          z,
          1,
          0.5,
          1,
          (x + z) % 3 === 0 ? 'stone_bricks' : 'oak_planks',
        )
    for (let x = -4; x <= 4; x++)
      for (let y = 0; y < 4; y++)
        block(
          x,
          y + 0.5,
          -3.5,
          1,
          1,
          0.45,
          y === 0 ? 'stone_bricks' : 'oak_planks',
        )
    for (let z = -3; z <= 7; z++) {
      for (let y = 0; y < 4; y++) {
        block(-4.5, y + 0.5, z, 0.45, 1, 1, 'stone_bricks')
        block(4.5, y + 0.5, z, 0.45, 1, 1, 'stone_bricks')
      }
      for (let x = -4; x <= 4; x++) block(x, 4.3, z, 1, 0.4, 1, 'oak_planks')
    }
    for (const x of [-4, 0, 4]) block(x, 2, -3.18, 0.3, 4, 0.35, 'oak_log')
    block(0, 4, -3.25, 9.3, 0.35, 0.6, 'oak_log')
    block(-4.3, 3.5, -0.5, 0.4, 0.35, 6.5, 'oak_log')
    for (const z of [-1.3, 1.6, 4.5])
      block(0, 4.03, z, 9, 0.25, 0.28, 'oak_log')
    // A woven inlay anchors the table without adding another HUD or panel.
    block(-0.35, 0.02, 0.55, 3.65, 0.035, 3.4, 'woven_rug')
    // Stepped sill and a moonlit opening keep the room legible without a dark roof.
    block(2.5, 2.6, -3.22, 1.5, 1.7, 0.15, '#233851')
    block(2.5, 1.65, -3.05, 1.85, 0.2, 0.4, 'oak_log')
    block(2.5, 2.6, -3.03, 0.1, 1.7, 0.1, 'oak_log')
    block(2.5, 2.6, -3.03, 1.5, 0.1, 0.1, 'oak_log')
    block(2.9, 3.1, -3.1, 0.25, 0.25, 0.08, '#e9dca1')
    const moonlight = new THREE.PointLight('#8eaaff', 3, 5)
    moonlight.position.set(2.5, 2.6, -2.5)
    scene.add(moonlight)
    const shelfGroup = new THREE.Group()
    scene.add(shelfGroup)
    const shelfPositions: Array<[number, number, number]> = []
    for (let layer = 0; layer < 3; layer++)
      for (let x = -3; x <= 1; x++) shelfPositions.push([x, layer + 0.5, -2.7])
    const shelfMeshes = shelfPositions.map(([x, y, z]) =>
      block(
        x,
        y,
        z,
        0.96,
        0.96,
        0.7,
        [
          mat('bookshelf'),
          mat('bookshelf'),
          mat('bookshelf_oak'),
          mat('bookshelf_oak'),
          mat('bookshelf'),
          mat('bookshelf'),
        ],
        shelfGroup,
        'shelves',
      ),
    )
    // Empty shelves remain real wooden furniture; their colored volumes arrive with progress.
    const emptyFront = mat('empty_bookshelf')
    const table = createEnchantingTable({
      top: textures.get('enchanting_table_top'), side: textures.get('enchanting_table_side'),
      bottom: textures.get('enchanting_table_bottom'), book: textures.get('enchanting_book'),
    })
    table.group.position.set(-0.35, 0, 0.1)
    scene.add(table.group)
    hitObjects.push(table.group)
    const { book, left, right, page } = table
    const glint = createEnchantmentGlint()
    const stand = createArmorStand({
      enchant: glint.attach,
      onTextureLoad: () => { dirty = true; schedule() },
    })
    stand.group.position.set(2.35, 0, 0.15)
    stand.group.rotation.y = -0.2
    scene.add(stand.group)
    function updateEquipment() {
      stand.update(latest.current.state.items.filter(
        (i) => latest.current.state.equipped[i.kind] === i.id,
      ))
    }
    const lanternMaterial = new THREE.MeshStandardMaterial({
      color: '#ffcb6e',
      emissive: '#ffc458',
      emissiveIntensity: 2,
    })
    const lanternLights: THREE.PointLight[] = []
    for (const x of [-3.65, 3.7]) {
      block(x, 3.1, -2.5, 0.28, 0.38, 0.28, [
        lanternMaterial,
        lanternMaterial,
        lanternMaterial,
        lanternMaterial,
        lanternMaterial,
        lanternMaterial,
      ])
      block(x, 3.33, -2.5, 0.4, 0.08, 0.4, '#453b2c')
      block(x, 2.87, -2.5, 0.4, 0.08, 0.4, '#453b2c')
      const light = new THREE.PointLight('#ffd089', 4, 6)
      light.position.set(x, 3, -2)
      scene.add(light)
      lanternLights.push(light)
      block(x, 3.65, -2.5, 0.05, 0.55, 0.05, '#49413e')
    }
    const chest = createChest(textures.get('chest_atlas'))
    chest.group.position.set(-2.6, 0.03, 1.8)
    scene.add(chest.group)
    hitObjects.push(chest.group)
    const particles = createEnchantingParticles({
      origins: shelfPositions, target: [-0.35, 1.5, 0.1],
      onLoad: () => { dirty = true; schedule() },
    })
    scene.add(particles.group)
    const ray = new THREE.Raycaster(),
      pointer = new THREE.Vector2()
    const hitAt = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      ray.setFromCamera(pointer, camera)
      const hit = ray.intersectObjects(
        [...hitObjects.filter((object) => object.visible), stand.group], true,
      )[0]
      let target: THREE.Object3D | null = hit?.object ?? null
      while (target && !target.userData.studyObject) target = target.parent
      return target?.userData.studyObject as StudyObject | undefined
    }
    const onClick = (event: PointerEvent) => {
      if (event.button !== 0) return
      const object = hitAt(event)
      if (object) latest.current.onSelect(object)
    }
    const onHover = (event: PointerEvent) => {
      const object = hitAt(event)
      renderer.domElement.style.cursor = object ? 'pointer' : 'default'
      if (hoveredObject !== (object ?? null)) {
        hoveredObject = object ?? null
        dirty = true
        schedule()
      }
    }
    const onLeave = () => {
      hoveredObject = null
      dirty = true
      schedule()
    }
    renderer.domElement.addEventListener('pointerup', onClick)
    renderer.domElement.addEventListener('pointermove', onHover)
    renderer.domElement.addEventListener('pointerleave', onLeave)
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    let chestMoving = false
    function render(time: number) {
      frame = 0
      if (disposed || document.hidden || !inside) return
      const motionAllowed = latest.current.animate && !media.matches
      const moving = motionAllowed && !latest.current.activeObject
      if (time - lastFrame >= 33 || dirty) {
        // Ambient effects pause behind dialogs, but a short lid transition can
        // finish. It stops scheduling frames as soon as the chest settles.
        chestMoving = chest.update(time, latest.current.activeObject === 'chest', motionAllowed)
        const { state: current, reveal: nextReveal } = latest.current
        if (current !== lastEquipmentState) {
          const key = JSON.stringify(
            current.items.filter((i) => current.equipped[i.kind] === i.id),
          )
          if (key !== lastEquipment) {
            updateEquipment()
            lastEquipment = key
          }
          lastEquipmentState = current
        }
        shelfMeshes.forEach((mesh, index) => {
          mesh.visible = index < Math.max(1, current.shelves)
          for (const face of [0, 1, 4, 5])
            (mesh.material as THREE.Material[])[face] =
              index < current.shelves ? mat('bookshelf') : emptyFront
        })
        if (nextReveal !== lastReveal) {
          lastReveal = nextReveal
          burstStart = time
        }
        const burst = Math.max(0, 1 - (time - burstStart) / 1500)
        book.position.y =
          1.32 + (moving ? Math.sin(time / 900) * 0.05 : 0) + burst * 0.18
        page.rotation.z = moving ? Math.sin(time / 2400) * 0.6 : 0
        const open = hoveredObject === 'table' ? 0.38 : 0.2
        left.rotation.z = open + burst * 0.5
        right.rotation.z = -open - burst * 0.5
        glow.intensity =
          3 + (moving ? Math.sin(time / 1200) * 0.6 : 0) + burst * 7
        glint.update(time, moving)
        lanternLights.forEach((light, i) => {
          light.intensity = moving ? 4 + Math.sin(time / 700 + i * 2) * 0.18 : 4
        })
        particles.update(time, moving, current.shelves, burst)
        renderer.render(scene, camera)
        dirty = false
        lastFrame = time
      }
      if (moving || chestMoving) schedule()
    }
    function schedule() {
      if (!disposed && !frame && !document.hidden && inside)
        frame = requestAnimationFrame(render)
    }
    const resize = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect()
      if (!width || !height) return
      renderer.setSize(width, height)
      fitStudyCamera(camera, width, height)
      dirty = true
      schedule()
    })
    resize.observe(element)
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame)
        frame = 0
      } else {
        dirty = true
        schedule()
      }
    }
    document.addEventListener('visibilitychange', visibility)
    const observer = new IntersectionObserver(([entry]) => {
      inside = entry.isIntersecting
      if (inside) {
        dirty = true
        schedule()
      } else {
        cancelAnimationFrame(frame)
        frame = 0
      }
    })
    observer.observe(element)
    const refresh = () => {
      dirty = true
      schedule()
    }
    media.addEventListener('change', refresh)
    // Event from React updates avoids an idle polling loop when motion is disabled.
    element.addEventListener('study-update', refresh)
    schedule()
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      resize.disconnect()
      observer.disconnect()
      document.removeEventListener('visibilitychange', visibility)
      media.removeEventListener('change', refresh)
      element.removeEventListener('study-update', refresh)
      renderer.domElement.removeEventListener('pointerup', onClick)
      renderer.domElement.removeEventListener('pointermove', onHover)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      textures.dispose()
      geometry.dispose()
      materials.forEach((m) => m.dispose())
      glint.dispose()
      stand.dispose()
      chest.dispose()
      table.dispose()
      lanternMaterial.dispose()
      particles.dispose()
      sun.shadow.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
  }, [])
  useEffect(() => {
    host.current?.dispatchEvent(new Event('study-update'))
  }, [state, animate, activeObject, reveal])
  return (
    <div className="study-room" ref={host}>
      {error && (
        <div className="study-render-error" role="status">
          {error}
        </div>
      )}
      {/* Keep keyboard/screen-reader access and a no-WebGL fallback without
          displaying a shortcut dock over the room during pointer use. */}
      <nav className={`study-room-access${error ? ' fallback' : ''}`} aria-label="Room objects">
        <button onClick={() => onSelect('table')}>Enchant</button>
        <button onClick={() => onSelect('stand')}>Equipment</button>
        <button onClick={() => onSelect('chest')}>Chest</button>
        <button onClick={() => onSelect('shelves')}>Bookshelves</button>
      </nav>
    </div>
  )
}
