export type ItemKind =
  'helmet' | 'chestplate' | 'leggings' | 'boots' | 'sword' | 'pickaxe'
export interface StudyItem {
  id: number
  kind: ItemKind
  material: string
  enchantments: { name: string; level: number }[]
  earnedAt: string
}
export interface StudyOffer {
  slot: number
  requiredLevel: number
  levelCost: number
  crystalCost: number
  glyphSeed: number
}
export interface StudyState {
  xp: number
  lifetimeXp: number
  level: number
  levelProgress: number
  levelSize: number
  crystals: number
  shelves: number
  solvedProblems: number
  revision: number
  items: StudyItem[]
  equipped: Partial<Record<ItemKind, number>>
  offers: StudyOffer[]
  nextReward: { kind: ItemKind; material: string; xpRequired: number }
}
export const roman = (n: number) =>
  ['', 'I', 'II', 'III', 'IV', 'V'][n] ?? String(n)
export const itemName = (item: Pick<StudyItem, 'kind' | 'material'>) =>
  `${item.material[0].toUpperCase()}${item.material.slice(1)} ${item.kind}`
export type StudyObject = 'table' | 'stand' | 'chest' | 'shelves'

// Decorative, original glyphs. They deliberately reveal nothing about the result.
export function glyphs(seed: number) {
  const marks = ['⌁', '⋔', '⏃', '⊣', '⋮', '⍙', '⊐', '⋏', '⊓', '⍜', '⎎', '⋇']
  let x = seed >>> 0
  return Array.from({ length: 13 }, () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    return marks[x % marks.length]
  }).join(' ')
}
