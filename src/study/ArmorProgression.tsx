import { ItemSprite } from './ItemSprite'
import type { StudyItem } from './types'

const armorKinds = new Set(['helmet', 'chestplate', 'leggings', 'boots'])
export function ArmorProgression({ items }: { items: StudyItem[] }) {
  return (
    <section className="study-armor-progression" aria-label="Armor progression">
      <h3>Your armor journey</h3>
      <div className="study-armor-tiers">
        {['leather', 'chainmail', 'iron', 'diamond'].map((material) => {
          const owned = new Set(
            items
              .filter((i) => i.material === material && armorKinds.has(i.kind))
              .map((i) => i.kind),
          ).size
          return (
            <div
              key={material}
              className={
                owned === 4 ? 'complete' : owned ? 'in-progress' : 'locked'
              }
            >
              <ItemSprite
                item={{
                  id: -1,
                  kind: 'chestplate',
                  material,
                  enchantments: [],
                  earnedAt: '',
                }}
              />
              <strong>{material}</strong>
              <small>
                {material === 'leather' ? 'Starter set' : `${owned} / 4 earned`}
              </small>
              <span className="study-tier-pips" aria-hidden="true">
                {Array.from({ length: 4 }, (_, i) => (
                  <i key={i} className={i < owned ? 'earned' : ''} />
                ))}
              </span>
            </div>
          )
        })}
      </div>
      <p className="study-footnote">
        One piece per 100 lifetime XP. Unlocks are permanent.
      </p>
    </section>
  )
}
