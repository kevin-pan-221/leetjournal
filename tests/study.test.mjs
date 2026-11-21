import test from 'node:test'
import assert from 'node:assert/strict'
import { glyphs, itemName, roman } from '../src/study/types.ts'
import { fitStudyCamera } from '../src/study/camera.ts'
import { PerspectiveCamera, Raycaster, Vector3 } from 'three'
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, Texture } from 'three'
import { createEnchantmentGlint } from '../src/study/enchantmentGlint.ts'
import { inventoryItems, enchantmentShortfall } from '../src/study/inventory.ts'
import { itemTextures, LEATHER_TINT } from '../src/study/itemTextures.ts'
import { readFileSync } from 'node:fs'
import { createArmorStand, heldToolGeometry, TOOL_GRIP } from '../src/study/armorStand.ts'
import { atlasBox as armorBox } from '../src/study/atlasBox.ts'
import { createChest } from '../src/study/chest.ts'
import { makeTextures, TEXTURE_ASSETS } from '../src/study/textures.ts'
import { createEnchantingTable } from '../src/study/enchantingTable.ts'
import { createEnchantingParticles, ENCHANTING_GLYPHS } from '../src/study/enchantingParticles.ts'

test('enchanting particles use all 26 default glyphs, vary per journey, respect motion and release resources', () => {
  let readyCount = 0, texturesDisposed = 0
  const callbacks = []
  const particles = createEnchantingParticles({
    origins: [[-3, 0.5, -2.7], [-2, 0.5, -2.7]], target: [-0.35, 1.5, 0.1],
    onLoad: () => readyCount++,
    loadTexture(path, ready) {
      assert.ok(ENCHANTING_GLYPHS.includes(path))
      const png = readFileSync(new URL(`../public${path}`, import.meta.url))
      assert.equal(png.readUInt32BE(16), 8)
      assert.equal(png.readUInt32BE(20), 8)
      callbacks.push(ready)
      const texture = new Texture()
      texture.addEventListener('dispose', () => texturesDisposed++)
      return texture
    },
  })
  assert.equal(callbacks.length, 26)
  callbacks.forEach((ready) => ready())
  assert.equal(readyCount, 26)
  particles.update(1000, true, 0, 0)
  assert.ok(particles.group.children.every((sprite) => !sprite.visible))
  particles.update(1000, true, 2, 0)
  assert.equal(particles.group.children.filter((sprite) => sprite.visible).length, 2)
  const [first, second] = particles.group.children
  assert.notEqual(first.material.map, second.material.map)
  const glyph = first.material.map
  particles.update(5500, true, 2, 0)
  assert.notEqual(first.material.map, glyph)
  particles.update(1000, false, 2, 0)
  const staticPosition = second.position.clone(), staticGlyph = second.material.map
  particles.update(9000, false, 2, 0)
  assert.deepEqual(second.position, staticPosition)
  assert.equal(second.material.map, staticGlyph)
  particles.update(0, true, 2, 1)
  assert.equal(particles.group.children.filter((sprite) => sprite.visible).length, 14)
  assert.equal(first.material.opacity, 0)
  let materialsDisposed = 0
  particles.group.children.forEach((sprite) => sprite.material.addEventListener('dispose', () => materialsDisposed++))
  particles.dispose()
  callbacks.forEach((ready) => ready())
  assert.equal(readyCount, 26)
  assert.equal(texturesDisposed, 26)
  assert.equal(materialsDisposed, 14)
  assert.equal(particles.group.children.length, 0)
})

test('furniture uses bundled vanilla atlases, caches loads and ignores late callbacks after disposal', () => {
  let readyCount = 0
  const callbacks = []
  const cache = makeTextures(() => readyCount++, (path, ready) => {
    callbacks.push(ready)
    const png = readFileSync(new URL(`../public${path}`, import.meta.url))
    const book = path.includes('_book')
    const size = path.includes('chest') || book ? 64 : 16
    assert.equal(png.readUInt32BE(16), size)
    assert.equal(png.readUInt32BE(20), book ? 32 : size)
    return new Texture()
  })
  for (const name of Object.keys(TEXTURE_ASSETS)) assert.equal(cache.get(name), cache.get(name))
  assert.equal(callbacks.length, 7)
  callbacks.forEach((ready) => ready())
  assert.equal(readyCount, 7)
  const chest = createChest(cache.get('chest_atlas'))
  assert.deepEqual(chest.group.children.map((part) => part.name), ['lid-hinge', 'body'])
  const body = chest.group.getObjectByName('body')
  assert.equal(body.geometry.getAttribute('uv').getY(16), 1 - 33 / 64)
  assert.equal(body.geometry.parameters.depth, 14)
  assert.equal(chest.group.scale.x, 1 / 16)
  assert.equal(chest.group.getObjectByName('lid').geometry.getAttribute('uv').getX(8), 28 / 64)
  let disposed = 0
  chest.group.traverse((part) => {
    if (part instanceof Mesh) part.geometry.addEventListener('dispose', () => disposed++)
  })
  chest.dispose()
  assert.equal(disposed, 5)
  cache.dispose()
  callbacks.forEach((ready) => ready())
  assert.equal(readyCount, 7)
})

test('chest lid and latch hinge together, reverse smoothly, and snap with reduced motion', () => {
  const chest = createChest(new Texture())
  const hinge = chest.group.getObjectByName('lid-hinge')
  const lid = chest.group.getObjectByName('lid'), latch = chest.group.getObjectByName('latch')
  assert.equal(chest.group.userData.studyObject, 'chest')
  assert.equal(lid.parent, hinge)
  assert.equal(latch.parent, hinge)
  assert.equal(chest.group.getObjectByName('body').parent, chest.group)
  assert.equal(chest.update(0, true, true), true)
  assert.equal(chest.update(150, true, true), true)
  assert.ok(hinge.rotation.x < 0 && hinge.rotation.x > -Math.PI / 2)
  const beforeReverse = hinge.rotation.x
  chest.update(150, false, true)
  assert.equal(hinge.rotation.x, beforeReverse)
  assert.equal(chest.update(500, false, true), false)
  assert.equal(Math.abs(hinge.rotation.x), 0)
  chest.update(500, true, true)
  assert.equal(chest.update(800, true, true), false)
  assert.equal(hinge.rotation.x, -Math.PI / 2)
  const openLatch = latch.getWorldPosition(new Vector3())
  assert.ok(openLatch.y > 20 / 16)
  assert.equal(chest.update(900, false, false), false)
  assert.equal(Math.abs(hinge.rotation.x), 0)
  assert.equal(chest.update(900, true, false), false)
  assert.equal(hinge.rotation.x, -Math.PI / 2)
  chest.dispose()
})

test('open chest has an unobstructed cavity, recessed floor and solid rim', () => {
  const chest = createChest(new Texture())
  chest.update(0, true, false)
  chest.group.updateMatrixWorld(true)
  const ray = new Raycaster(new Vector3(0, 2, 0), new Vector3(0, -1, 0))
  const center = ray.intersectObject(chest.group, true)[0]
  assert.equal(center.object.name, 'interior')
  assert.ok(Math.abs(center.point.y - 1 / 16) < 1e-6)
  ray.ray.origin.set(6.5 / 16, 2, 0)
  const edge = ray.intersectObject(chest.group, true)[0]
  assert.equal(edge.object.name, 'rim')
  assert.ok(Math.abs(edge.point.y - 10 / 16) < 1e-6)
  ray.ray.origin.set(0, 5 / 16, 0)
  ray.ray.direction.set(1, 0, 0)
  const wall = ray.intersectObject(chest.group, true)[0]
  assert.equal(wall.object.name, 'interior')
  assert.ok(Math.abs(wall.point.x - 6 / 16) < 1e-6)
  chest.update(0, false, false)
  chest.group.updateMatrixWorld(true)
  ray.ray.origin.set(0, 2, 0)
  ray.ray.direction.set(0, -1, 0)
  assert.equal(ray.intersectObject(chest.group, true)[0].object.name, 'lid')
  chest.dispose()
})

test('enchanting table crops side UVs and keeps animated book pieces on the same clickable model', () => {
  const texture = new Texture()
  const table = createEnchantingTable({ top: texture, side: texture, bottom: texture, book: texture })
  assert.equal(table.group.userData.studyObject, 'table')
  const base = table.group.getObjectByName('table-base')
  assert.equal(base.geometry.parameters.height / base.geometry.parameters.width, 12 / 16)
  const uv = base.geometry.getAttribute('uv')
  assert.equal(uv.getY(0), 12 / 16)
  assert.equal(uv.getY(8), 1)
  assert.equal(table.page.parent, table.book)
  assert.equal(table.left.parent, table.book)
  assert.equal(table.right.parent, table.book)
  assert.equal(table.book.parent, table.group)
  let disposed = 0
  table.group.traverse((part) => {
    if (part instanceof Mesh) part.geometry.addEventListener('dispose', () => disposed++)
  })
  let textureDisposed = false
  texture.addEventListener('dispose', () => textureDisposed = true)
  table.dispose()
  assert.equal(disposed, 7)
  assert.equal(textureDisposed, false)
  assert.equal(table.group.children.length, 0)
})

test('tools pivot at a handle pixel and stay in the hand through arm and stand poses', () => {
  const geometry = heldToolGeometry()
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox
  const grip = new Vector3(
    bounds.min.x + (bounds.max.x - bounds.min.x) * TOOL_GRIP[0] / 16,
    bounds.max.y - (bounds.max.y - bounds.min.y) * TOOL_GRIP[1] / 16,
    0,
  )
  assert.ok(grip.length() < 1e-6)
  geometry.dispose()
  const stand = createArmorStand({ onTextureLoad() {}, enchant() {}, loadTexture: () => new Texture() })
  const items = ['sword', 'pickaxe', 'chestplate'].map((kind, id) => ({ id, kind, material: 'iron', enchantments: [], earnedAt: '' }))
  stand.update(items)
  stand.group.position.set(2, 1, -3)
  stand.group.rotation.y = 0.65
  for (const [kind, side] of [['sword', 'right'], ['pickaxe', 'left']]) {
    const arm = stand.group.getObjectByName(`${side}-arm`)
    const hand = stand.group.getObjectByName(`${side}-hand`)
    const tool = stand.group.getObjectByName(`iron-${kind}`)
    assert.equal(tool.parent, hand)
    arm.rotation.set(-0.4, 0.15, 0.3)
    stand.group.updateMatrixWorld(true)
    assert.ok(tool.children[0].localToWorld(grip.clone()).distanceTo(hand.getWorldPosition(new Vector3())) < 1e-6)
  }
  const sleeve = stand.group.getObjectByName('iron-sleeve--1')
  assert.equal(sleeve.parent.parent.name, 'right-arm')
  const oldTool = stand.group.getObjectByName('iron-sword').children[0]
  let disposed = 0
  oldTool.geometry.addEventListener('dispose', () => disposed++)
  stand.update([])
  assert.equal(disposed, 1)
  assert.equal(stand.group.getObjectByName('iron-sword'), undefined)
  assert.equal(stand.group.getObjectByName('iron-sleeve--1'), undefined)
  assert.equal(stand.group.getObjectByName('right-hand').children.length, 0)
  stand.dispose()
})

test('worn armor atlases and the wooden stand texture are bundled at native dimensions', () => {
  for (const layer of ['humanoid', 'humanoid_leggings']) {
    for (const material of ['leather', 'leather_overlay', 'chainmail', 'iron', 'diamond']) {
      const png = readFileSync(new URL(`../public/minecraft/equipment/${layer}_${material}.png`, import.meta.url))
      assert.equal(png.readUInt32BE(16), 64)
      assert.equal(png.readUInt32BE(20), 32)
    }
  }
  const stand = readFileSync(new URL('../public/minecraft/equipment/armor_stand.png', import.meta.url))
  assert.equal(stand.readUInt32BE(16), 64)
  assert.equal(stand.readUInt32BE(20), 64)
})

test('armor cuboids use per-face atlas regions independently of inflation', () => {
  const geometry = armorBox([8, 8, 8], [0, 0], 32, 1)
  assert.equal(geometry.parameters.width, 10)
  const uv = geometry.getAttribute('uv')
  assert.equal(uv.getX(16), 8 / 64) // front, not the whole repeated atlas
  assert.equal(uv.getY(16), 1 - 8 / 32)
  assert.equal(uv.getX(17), 16 / 64)
  assert.equal(uv.getY(18), 1 - 16 / 32)
  for (const value of uv.array) assert.ok(value >= 0 && value <= 1)
  geometry.dispose()
})

test('stand rebuilds only equipped gear and disposes old geometry and cached resources', () => {
  const loaded = new Map()
  const enchanted = []
  const stand = createArmorStand({
    onTextureLoad() {},
    enchant(piece) { enchanted.push(piece.name) },
    loadTexture(path) {
      const texture = new Texture()
      loaded.set(path, texture)
      return texture
    },
  })
  const item = { id: 1, kind: 'helmet', material: 'iron', enchantments: [], earnedAt: '' }
  stand.update([item])
  assert.ok(loaded.has('/minecraft/equipment/humanoid_iron.png'))
  const oldHelmet = stand.group.getObjectByName('iron-helmet').children[0]
  let oldDisposed = 0
  oldHelmet.geometry.addEventListener('dispose', () => oldDisposed++)
  stand.update([{ ...item, kind: 'leggings', material: 'leather', enchantments: [{ name: 'Protection', level: 1 }] }])
  assert.equal(oldDisposed, 1)
  assert.equal(stand.group.getObjectByName('iron-helmet'), undefined)
  assert.ok(loaded.has('/minecraft/equipment/humanoid_leggings_leather.png'))
  assert.ok(loaded.has('/minecraft/equipment/humanoid_leggings_leather_overlay.png'))
  assert.deepEqual(enchanted, ['leather-leggings'])
  const worn = stand.group.getObjectByName('leather-leggings').children[0]
  assert.equal(worn.material.color.getHex(), 0xa06540)
  assert.equal(worn.material.alphaTest, 0.1)
  assert.equal(worn.children[0].material.color.getHex(), 0xffffff)
  assert.equal(worn.children[0].userData.noGlint, true)
  let disposedTextures = 0
  loaded.forEach((t) => t.addEventListener('dispose', () => disposedTextures++))
  stand.dispose()
  assert.equal(disposedTextures, loaded.size)
  assert.equal(stand.group.children.length, 0)
})

test('subtle enchantment glint masks helmet and chainmail openings', () => {
  const glint = createEnchantmentGlint()
  const mask = new Texture()
  const geometry = new BoxGeometry()
  const material = new MeshBasicMaterial({ map: mask, alphaTest: 0.1 })
  const piece = new Group()
  const surface = new Mesh(geometry, material)
  piece.add(surface)
  glint.attach(piece)
  const overlay = surface.children[0]
  assert.ok(overlay.material.opacity <= 0.35)
  assert.equal(overlay.userData.noGlint, true)
  const shader = { uniforms: {}, vertexShader: '#include <uv_vertex>', fragmentShader: '#include <alphatest_fragment>' }
  overlay.material.onBeforeCompile(shader)
  assert.equal(shader.uniforms.armorMask.value, mask)
  assert.match(shader.fragmentShader, /armorAlpha < 0.1\) discard/)
  assert.match(shader.vertexShader, /vArmorUv = uv/)
  glint.dispose()
  geometry.dispose(); material.dispose(); mask.dispose()
})

test('all supported gear uses bundled 16px Minecraft item textures', () => {
  const checkPng = (path) => {
    const png = readFileSync(new URL(`../public${path}`, import.meta.url))
    assert.deepEqual([...png.subarray(0, 8)], [137,80,78,71,13,10,26,10])
    assert.equal(png.readUInt32BE(16), 16)
    assert.equal(png.readUInt32BE(20), 16)
  }
  for (const material of ['leather', 'chainmail', 'iron', 'diamond', 'wooden']) {
    for (const kind of ['helmet', 'chestplate', 'leggings', 'boots', 'sword', 'pickaxe']) {
      const tool = kind === 'sword' || kind === 'pickaxe'
      const supported = tool ? ['wooden', 'iron', 'diamond'].includes(material) : material !== 'wooden'
      const textures = itemTextures({ kind, material })
      if (!supported) { assert.equal(textures, null); continue }
      assert.equal(textures.base, `/minecraft/items/${material}_${kind}.png`)
      checkPng(textures.base)
      if (material === 'leather') {
        assert.deepEqual(textures.tint, LEATHER_TINT)
        checkPng(textures.overlay)
      } else {
        assert.equal(textures.overlay, null)
        assert.equal(textures.tint, null)
      }
    }
  }
  assert.deepEqual(LEATHER_TINT, [160, 101, 64])
  assert.equal(itemTextures({ kind: 'helmet', material: '../untrusted' }), null)
})

test('inventory filters retain owned items in newest-first order without mutating state', () => {
  const items = [
    { id: 1, kind: 'helmet' },
    { id: 2, kind: 'sword' },
    { id: 3, kind: 'boots' },
    { id: 4, kind: 'pickaxe' },
  ]
  assert.deepEqual(
    inventoryItems(items, 'all').map((i) => i.id),
    [4, 3, 2, 1],
  )
  assert.deepEqual(
    inventoryItems(items, 'armor').map((i) => i.id),
    [3, 1],
  )
  assert.deepEqual(
    inventoryItems(items, 'tools').map((i) => i.id),
    [4, 2],
  )
  assert.deepEqual(
    items.map((i) => i.id),
    [1, 2, 3, 4],
  )
  assert.deepEqual(inventoryItems([], 'tools'), [])
})

test('enchanting shows exactly the missing requirement, not the levels spent', () => {
  const offer = { requiredLevel: 30, levelCost: 3, crystalCost: 3 }
  assert.equal(enchantmentShortfall(30, 3, offer), '')
  assert.equal(
    enchantmentShortfall(27, 3, offer),
    'To enchant, reach level 30.',
  )
  assert.equal(
    enchantmentShortfall(30, 1, offer),
    'To enchant, earn 2 more lapis.',
  )
  assert.equal(
    enchantmentShortfall(27, 1, offer),
    'To enchant, reach level 30 and earn 2 more lapis.',
  )
})

test('enchantment glint follows only selected equipment surfaces and retains their textures', () => {
  const glint = createEnchantmentGlint()
  const piece = new Group()
  const geometry = new BoxGeometry(1, 1, 1)
  const base = new MeshBasicMaterial({ color: '#a67642' })
  const helmet = new Mesh(geometry, base)
  const unenchanted = new Mesh(geometry, base)
  piece.add(helmet)
  glint.attach(piece)
  assert.equal(helmet.material, base)
  assert.equal(helmet.children.length, 1)
  assert.equal(unenchanted.children.length, 0)
  const overlay = helmet.children[0]
  assert.equal(overlay.geometry, helmet.geometry)
  assert.equal(overlay.material.transparent, true)
  assert.equal(overlay.material.depthWrite, false)
  const texture = overlay.material.map
  assert.ok(new Set(texture.image.data).size > 3)
  glint.update(1000, true)
  const first = texture.offset.clone()
  glint.update(2000, true)
  assert.equal(texture.offset.equals(first), false)
  glint.update(1000, false)
  const still = texture.offset.clone()
  glint.update(2000, false)
  assert.equal(texture.offset.equals(still), true)
  let disposed = 0
  texture.addEventListener('dispose', () => disposed++)
  overlay.material.addEventListener('dispose', () => disposed++)
  glint.dispose()
  assert.equal(disposed, 2)
  geometry.dispose()
  base.dispose()
})

test('offer glyphs are stable decoration, not an enchantment hint', () => {
  assert.equal(glyphs(31), glyphs(31))
  assert.notEqual(glyphs(31), glyphs(128))
  assert.equal(/[a-z]/i.test(glyphs(31)), false)
})
test('equipment names and ranks are readable', () => {
  assert.equal(
    itemName({ material: 'diamond', kind: 'helmet' }),
    'Diamond helmet',
  )
  assert.equal(roman(4), 'IV')
})
test('in-room framing keeps interactive furniture visible across aspect ratios', () => {
  for (const [width, height] of [
    [1200, 590],
    [700, 440],
    [400, 440],
    [320, 340],
  ]) {
    const camera = new PerspectiveCamera(43, 1, 0.1, 60)
    fitStudyCamera(camera, width, height)
    for (const [x, y, z] of [
      [-0.35, 1.3, 0.1],
      [-2.6, 0.7, 1.8],
      [2.35, 2.3, 0.15],
      [-3, 1, -2.7],
    ]) {
      const p = new Vector3(x, y, z).project(camera)
      assert.ok(
        Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1,
        `${width}x${height}: interactive furniture clipped`,
      )
    }
  }
})
