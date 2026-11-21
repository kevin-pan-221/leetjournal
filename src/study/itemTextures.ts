import type { StudyItem } from './types'

const armor = new Set(['helmet', 'chestplate', 'leggings', 'boots'])
const tools = new Set(['sword', 'pickaxe'])
const armorMaterials = new Set(['leather', 'chainmail', 'iron', 'diamond'])
const toolMaterials = new Set(['wooden', 'iron', 'diamond'])

// Minecraft's default undyed leather tint (0xA06540), applied to layer 0 only.
export const LEATHER_TINT = [160, 101, 64] as const

export function itemTextures(item: Pick<StudyItem, 'kind' | 'material'>) {
  if (!(armor.has(item.kind) && armorMaterials.has(item.material)) &&
      !(tools.has(item.kind) && toolMaterials.has(item.material))) return null
  const name = `${item.material}_${item.kind}`
  return {
    base: `/minecraft/items/${name}.png`,
    overlay: item.material === 'leather' ? `/minecraft/items/${name}_overlay.png` : null,
    tint: item.material === 'leather' ? LEATHER_TINT : null,
  }
}
