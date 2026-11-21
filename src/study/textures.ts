import * as THREE from 'three'
export type TextureName =
  | 'oak_planks'
  | 'oak_log'
  | 'woven_rug'
  | 'stone_bricks'
  | 'bookshelf'
  | 'bookshelf_oak'
  | 'chest_atlas'
  | 'enchanting_book'
  | 'empty_bookshelf'
  | 'obsidian'
  | 'diamond_block'
  | 'iron_block'
  | 'gold_block'
  | 'enchanting_table_top'
  | 'enchanting_table_side'
  | 'enchanting_table_bottom'

export const TEXTURE_ASSETS = {
  bookshelf: '/minecraft/blocks/bookshelf.png',
  bookshelf_oak: '/minecraft/blocks/oak_planks.png',
  chest_atlas: '/minecraft/furniture/chest.png',
  enchanting_book: '/minecraft/furniture/enchanting_table_book.png',
  enchanting_table_top: '/minecraft/blocks/enchanting_table_top.png',
  enchanting_table_side: '/minecraft/blocks/enchanting_table_side.png',
  enchanting_table_bottom: '/minecraft/blocks/enchanting_table_bottom.png',
} as const satisfies Partial<Record<TextureName, string>>

function isBundledTexture(name: TextureName): name is keyof typeof TEXTURE_ASSETS {
  return Object.hasOwn(TEXTURE_ASSETS, name)
}

// Original room tiles complement bundled game assets; everything works offline.
export function tileCanvas(name: Exclude<TextureName, keyof typeof TEXTURE_ASSETS>): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 16
  canvas.height = 16
  const c = canvas.getContext('2d')!
  let seed = Array.from(name).reduce((s, ch) => s + ch.charCodeAt(0), 17)
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const rgb = (r: number, g: number, b: number) => `rgb(${r},${g},${b})`
  const base =
    name === 'obsidian'
      ? [32, 23, 43]
      : name === 'stone_bricks'
        ? [104, 103, 94]
        : name === 'diamond_block'
          ? [53, 191, 185]
          : name === 'iron_block'
            ? [169, 170, 157]
            : name === 'gold_block'
              ? [206, 164, 55]
              : [139, 101, 55]
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const n = Math.floor(noise() * 28) - 14
      c.fillStyle = rgb(base[0] + n, base[1] + n, base[2] + n)
      c.fillRect(x, y, 1, 1)
    }
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color
    c.fillRect(x, y, w, h)
  }
  if (name === 'woven_rug') {
    rect(0, 0, 16, 16, '#493351')
    rect(1, 1, 14, 14, '#b89757')
    rect(2, 2, 12, 12, '#392b49')
    for (let y = 3; y < 13; y++)
      for (let x = 3; x < 13; x++) {
        const distance = Math.abs(x - 7.5) + Math.abs(y - 7.5)
        if (distance < 4) rect(x, y, 1, 1, distance < 2 ? '#bdaa71' : '#715078')
        else if ((x + y) % 3 === 0) rect(x, y, 1, 1, '#4c385e')
      }
    for (let x = 0; x < 16; x += 2) {
      rect(x, 0, 1, 1, '#dbc58b')
      rect(x, 15, 1, 1, '#dbc58b')
    }
  }
  if (name === 'oak_planks' || name === 'oak_log') {
    for (let y = 0; y < 16; y += 4) {
      rect(0, y, 16, 1, '#674721')
      rect((y * 3) % 16, y, 1, 4, '#6e4d2e')
      rect(2, y + 1, 9, 1, '#ab834c')
    }
    if (name === 'oak_log')
      for (let x = 0; x < 16; x += 4) rect(x, 0, 1, 16, '#513921')
  }
  if (name === 'stone_bricks') {
    for (let y = 0; y < 16; y += 8) {
      rect(0, y, 16, 1, '#454842')
      rect(y === 0 ? 7 : 1, y, 1, 8, '#55564b')
      rect(0, y + 1, 16, 1, '#828476')
    }
  }
  if (name === 'empty_bookshelf') {
    rect(1, 2, 14, 12, '#352d23')
    rect(0, 7, 16, 1, '#ac7c43')
    rect(0, 14, 16, 2, '#815527')
  }
  return canvas
}

export function makeTextures(onLoad = () => {}, load = (path: string, ready: () => void) => new THREE.TextureLoader().load(path, ready)) {
  const textures = new Map<TextureName, THREE.Texture>()
  let disposed = false
  return {
    get(name: TextureName) {
      let texture = textures.get(name)
      if (texture) return texture
      const ready = () => { if (!disposed) onLoad() }
      texture = isBundledTexture(name) ? load(TEXTURE_ASSETS[name], ready)
        : new THREE.CanvasTexture(tileCanvas(name))
      texture.colorSpace = THREE.SRGBColorSpace
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestMipmapNearestFilter
      textures.set(name, texture)
      return texture
    },
    dispose() {
      disposed = true
      textures.forEach((t) => t.dispose())
      textures.clear()
    },
  }
}
