import { useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { ItemSprite } from './ItemSprite'
import { inventoryItems, type InventoryFilter } from './inventory'
import { itemName, roman, type StudyState } from './types'

export function EquipmentInventory({
  state,
  selectedId,
  busy,
  onSelect,
}: {
  state: StudyState
  selectedId: number | undefined
  busy: boolean
  onSelect: (id: number) => void
}) {
  const [filter, setFilter] = useState<InventoryFilter>('all')
  const [limit, setLimit] = useState(24)
  const items = inventoryItems(state.items, filter)
  return (
    <section className="study-collection" aria-label="Equipment collection">
      <div className="study-collection-header">
        <h3>
          Your collection <small>{state.items.length}</small>
        </h3>
        <div
          className="study-inventory-filters"
          role="group"
          aria-label="Filter equipment"
        >
          {(['all', 'armor', 'tools'] as const).map((value) => (
            <button
              key={value}
              disabled={busy}
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value)
                setLimit(24)
              }}
            >
              {value === 'all' ? 'All' : value === 'armor' ? 'Armor' : 'Tools'}
            </button>
          ))}
        </div>
      </div>
      <div className="study-inventory">
        {items.slice(0, limit).map((item) => {
          const equipped = state.equipped[item.kind] === item.id
          const details = item.enchantments
            .map((e) => `${e.name} ${roman(e.level)}`)
            .join(', ')
          return (
            <button
              key={item.id}
              disabled={busy}
              aria-pressed={selectedId === item.id}
              aria-label={`${itemName(item)} #${item.id + 1}${equipped ? ', equipped' : ''}${details ? `, ${details}` : ''}`}
              title={`${itemName(item)}${details ? ` · ${details}` : ''}${equipped ? ' · Equipped' : ''}`}
              className={item.enchantments.length ? 'enchanted' : ''}
              onClick={() => onSelect(item.id)}
            >
              <ItemSprite item={item} />
              <span className="study-inventory-name">
                {item.material}
                <br />
                {item.kind}
              </span>
              {equipped && (
                <Check
                  className="study-equipped-mark"
                  size={13}
                  aria-hidden="true"
                />
              )}
              {!!item.enchantments.length && (
                <Sparkles
                  className="study-enchanted-mark"
                  size={12}
                  aria-hidden="true"
                />
              )}
            </button>
          )
        })}
      </div>
      {!items.length && (
        <p className="study-inventory-empty">
          No {filter === 'tools' ? 'tools' : 'armor'} earned yet. Your next
          unlock is shown below.
        </p>
      )}
      {items.length > limit && (
        <button className="study-more" onClick={() => setLimit((n) => n + 24)}>
          Show more ({items.length - limit} remaining)
        </button>
      )}
    </section>
  )
}
