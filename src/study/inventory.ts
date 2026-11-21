import type { StudyItem, StudyOffer } from './types'

export type InventoryFilter = 'all' | 'armor' | 'tools'
export function inventoryItems(items: StudyItem[], filter: InventoryFilter) {
  return items
    .filter((item) => {
      const tool = item.kind === 'sword' || item.kind === 'pickaxe'
      return filter === 'all' || (filter === 'tools' ? tool : !tool)
    })
    .slice()
    .reverse()
}

export function enchantmentShortfall(
  level: number,
  lapis: number,
  offer: StudyOffer,
) {
  const missing = []
  if (level < offer.requiredLevel)
    missing.push(`reach level ${offer.requiredLevel}`)
  if (lapis < offer.crystalCost)
    missing.push(`earn ${offer.crystalCost - lapis} more lapis`)
  return missing.length ? `To enchant, ${missing.join(' and ')}.` : ''
}
