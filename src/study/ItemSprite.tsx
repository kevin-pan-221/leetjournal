import { useEffect, useRef } from 'react'
import type { StudyItem } from './types'
import { itemTextures } from './itemTextures'

// The finite set of bundled images is shared by inventory, tier and reward icons.
const images = new Map<string, Promise<HTMLImageElement>>()
function loadImage(src: string) {
  let image = images.get(src)
  if (!image) {
    image = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => {
        images.delete(src)
        reject(new Error(`Unable to load item texture: ${src}`))
      }
      img.src = src
    })
    images.set(src, image)
  }
  return image
}

export function ItemSprite({ item }: { item: StudyItem }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const enchanted = item.enchantments.length > 0
  useEffect(() => {
    const c = canvas.current?.getContext('2d')
    if (!c) return
    let cancelled = false
    c.clearRect(0, 0, 16, 16)
    const textures = itemTextures(item)
    const unavailable = () => {
      if (cancelled) return
      c.clearRect(0, 0, 16, 16)
      c.fillStyle = '#756391'
      c.font = '14px monospace'
      c.textAlign = 'center'
      c.fillText('?', 8, 13)
    }
    if (!textures) {
      unavailable()
      return
    }
    void Promise.all([
      loadImage(textures.base),
      textures.overlay ? loadImage(textures.overlay) : null,
    ]).then(([base, overlay]) => {
      if (cancelled) return
      c.imageSmoothingEnabled = false
      c.drawImage(base, 0, 0, 16, 16)
      if (textures.tint) {
        const pixels = c.getImageData(0, 0, 16, 16)
        for (let i = 0; i < pixels.data.length; i += 4) {
          for (let channel = 0; channel < 3; channel++) {
            pixels.data[i + channel] = Math.round(pixels.data[i + channel] * textures.tint[channel] / 255)
          }
        }
        c.putImageData(pixels, 0, 0)
      }
      if (overlay) c.drawImage(overlay, 0, 0, 16, 16)
      if (enchanted) {
        // Preserve the real item's silhouette and detail beneath the glint.
        c.save()
        c.globalCompositeOperation = 'source-atop'
        c.fillStyle = '#9d73f055'
        for (let y = -10; y < 20; y += 4) {
          c.beginPath()
          c.moveTo(0, y)
          c.lineTo(16, y + 9)
          c.lineTo(16, y + 10.5)
          c.lineTo(0, y + 1.5)
          c.fill()
        }
        c.restore()
      }
    }).catch(unavailable)
    return () => { cancelled = true }
  }, [item.kind, item.material, enchanted])
  return <canvas className="study-item-sprite" ref={canvas} width={16} height={16} aria-hidden="true" />
}
