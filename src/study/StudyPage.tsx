import { useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  Check,
  LockKeyhole,
  Play,
  Sparkles,
} from 'lucide-react'
import { api } from '../api'
import type { FocusContext } from '../domain'
import { errorMessage } from '../utils/errors'
import { ItemSprite } from './ItemSprite'
import { LapisIcon } from './LapisIcon'
import { StudyRoom } from './StudyRoom'
import { StudyDialog } from './StudyDialog'
import { ArmorProgression } from './ArmorProgression'
import { EquipmentInventory } from './EquipmentInventory'
import { RewardProgress } from './RewardProgress'
import { enchantmentShortfall } from './inventory'
import {
  glyphs,
  itemName,
  roman,
  type StudyItem,
  type StudyObject,
  type StudyState,
} from './types'
import './study.css'

export interface StudyService {
  read?: () => Promise<StudyState>
  enchant: (
    itemId: number,
    slot: number,
    revision: number,
  ) => Promise<StudyState>
  equip: (itemId: number) => Promise<StudyState>
}
const service: StudyService = {
  read: api.study,
  enchant: api.enchantStudy,
  equip: api.equipStudy,
}
interface Props {
  state: StudyState
  onChange: (state: StudyState) => void
  active: FocusContext | null
  animate: boolean
  onStart: () => void
  onReturn: () => void
  transport?: StudyService
}

export default function StudyPage({
  state,
  onChange,
  active,
  animate,
  onStart,
  onReturn,
  transport = service,
}: Props) {
  const [selectedObject, setObject] = useState<StudyObject | null>(null)
  // Chest and armor stand share equipment UI, but only the chest opens its lid.
  const object = selectedObject === 'chest' ? 'stand' : selectedObject
  const [itemId, setItemId] = useState(
    state.items.find((i) => !i.enchantments.length)?.id ?? 0,
  )
  const [slot, setSlot] = useState(0)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const [reveal, setReveal] = useState(0)
  const [receipt, setReceipt] = useState<StudyItem | null>(null)
  const [equippedMessage, setEquippedMessage] = useState('')
  const resultRef = useRef<HTMLDivElement>(null)
  const equippedRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (receipt) resultRef.current?.focus()
  }, [receipt])
  useEffect(() => {
    if (equippedMessage) equippedRef.current?.focus()
  }, [equippedMessage])
  const item = state.items.find((i) => i.id === itemId) ?? state.items[0]
  const wearing = item
    ? state.items.find((i) => i.id === state.equipped[item.kind])
    : undefined
  const offer = state.offers[slot]
  const canEnchant =
    item &&
    !item.enchantments.length &&
    offer &&
    state.level >= offer.requiredLevel &&
    state.crystals >= offer.crystalCost
  const chooseObject = (next: StudyObject) => {
    if (next === 'table' && item?.enchantments.length) {
      const unenchanted = state.items.find((i) => !i.enchantments.length)
      if (unenchanted) setItemId(unenchanted.id)
    }
    setObject(next)
    setError('')
    setEquippedMessage('')
  }
  const closeObject = () => {
    setObject(null)
    setReceipt(null)
  }
  const act = async (action: 'enchant' | 'equip') => {
    if (busyRef.current || !item) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const next =
        action === 'enchant'
          ? await transport.enchant(item.id, slot, state.revision)
          : await transport.equip(item.id)
      onChange(next)
      if (action === 'enchant') {
        setReceipt(next.items.find((i) => i.id === item.id) ?? null)
        setReveal((n) => n + 1)
      } else {
        setEquippedMessage(`${itemName(item)} equipped on your stand.`)
      }
    } catch (e) {
      setError(errorMessage(e))
      // A committed purchase may have lost its IPC response. Reconcile instead
      // of leaving the old wallet/offers on screen or blindly retrying payment.
      if (transport.read) {
        try {
          onChange(await transport.read())
        } catch {
          /* Keep the original error visible. */
        }
      }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  const session = active?.attempt.isReview ? 'review' : 'focus'
  return (
    <div className="study-page">
      <header className="study-heading">
        <div className="study-wallet" aria-label="Enchanting resources">
          <span>
            <b>{state.level}</b> levels
          </span>
          <span>
            <LapisIcon />
            <b>{state.crystals}</b> lapis
          </span>
        </div>
      </header>
      <div className="study-layout">
        <section className="study-scene-shell" aria-label="Enchanting room">
          <StudyRoom
            state={state}
            animate={animate}
            activeObject={selectedObject}
            reveal={reveal}
            onSelect={chooseObject}
          />
          <div className="study-level-meter">
            <span>Level {state.level}</span>
            <div
              role="progressbar"
              aria-label="Experience toward next level"
              aria-valuenow={state.levelProgress}
              aria-valuemin={0}
              aria-valuemax={state.levelSize}
            >
              <i
                style={{
                  width: `${(state.levelProgress / state.levelSize) * 100}%`,
                }}
              />
            </div>
            <small>
              {state.levelProgress} / {state.levelSize} XP
            </small>
          </div>
        </section>
        {object && (
          <StudyDialog
            variant={object}
            motion={animate}
            busy={busy}
            onClose={closeObject}
            title={
              object === 'table'
                ? 'Enchanting table'
                : object === 'stand'
                  ? 'Equipment'
                  : 'Bookshelves'
            }
          >
            {object === 'shelves' ? (
              <>
                <div className="study-shelf-count">
                  <BookOpen />
                  <b>
                    {state.shelves}
                    <small> / 15</small>
                  </b>
                </div>
                <h3>
                  {state.shelves === 15
                    ? 'A complete enchanting library'
                    : 'Knowledge gives the table power'}
                </h3>
                <p>
                  Solve five different problems to add one bookshelf. Finish
                  your reflection with “Solved” or “Easy” to count a solve.
                </p>
                <p>
                  {state.shelves === 15
                    ? 'Your table can offer level 30 enchantments.'
                    : `${5 - (state.solvedProblems % 5)} more ${5 - (state.solvedProblems % 5) === 1 ? 'solve' : 'solves'} until the next shelf.`}
                </p>
                <div className="study-facts">
                  <span>
                    Problems solved<b>{state.solvedProblems}</b>
                  </span>
                  <span>
                    Lifetime XP<b>{state.lifetimeXp}</b>
                  </span>
                </div>
                <p className="study-footnote">
                  First solve: 20 XP + 1 lapis. Successful review: 10 XP + 1
                  lapis, once per problem per day. Time alone earns nothing.
                </p>
                <p className="study-footnote">
                  Bookshelves and collected gear never disappear when you spend
                  XP or take a break.
                </p>
              </>
            ) : !state.items.length ? (
              <div className="study-empty-inventory">
                <div className="study-slot">
                  <LockKeyhole size={26} />
                </div>
                <h3>Your first piece is waiting to be earned</h3>
                <p>
                  Solve problems to earn your{' '}
                  {itemName(state.nextReward).toLowerCase()}. It unlocks in{' '}
                  {state.nextReward.xpRequired} XP.
                </p>
                <p>
                  Start with leather armor, then earn chainmail, iron and
                  diamond upgrades by solving problems. Each 100 lifetime XP
                  unlocks another piece.
                </p>
                <button
                  className="study-primary"
                  onClick={() => {
                    closeObject()
                    ;(active ? onReturn : onStart)()
                  }}
                >
                  {active ? 'Return to session' : 'Start practicing'}
                </button>
              </div>
            ) : (
              <>
                {object === 'table' && (
                  <label className="study-item-select">
                    {object === 'table' ? 'Place an item' : 'Inspect an item'}
                    <select
                      disabled={busy}
                      value={item?.id ?? 0}
                      onChange={(e) => {
                        setItemId(Number(e.target.value))
                        setReceipt(null)
                        setError('')
                        setEquippedMessage('')
                      }}
                    >
                      {state.items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {itemName(i)} #{i.id + 1}
                          {i.enchantments.length ? ' · enchanted' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {item && (
                  <div
                    className={`study-selected-item ${receipt?.id === item.id ? 'just-enchanted' : ''}`}
                  >
                    <div
                      className={`study-slot ${item.enchantments.length ? 'enchanted' : ''}`}
                    >
                      <ItemSprite item={item} />
                    </div>
                    <div>
                      <strong>{itemName(item)}</strong>
                      <small>
                        {state.equipped[item.kind] === item.id
                          ? 'Equipped on your stand'
                          : item.enchantments.length
                            ? 'Enchanted'
                            : 'Unenchanted'}
                      </small>
                      {object === 'stand' &&
                        wearing &&
                        wearing.id !== item.id && (
                          <small>
                            Currently wearing: {itemName(wearing)}
                            {wearing.enchantments.length ? ' · enchanted' : ''}
                          </small>
                        )}
                    </div>
                  </div>
                )}
                {receipt && receipt.id === item?.id && (
                  <div
                    className="study-reveal"
                    role="status"
                    ref={resultRef}
                    tabIndex={-1}
                  >
                    <Sparkles size={18} />
                    <strong>Enchantment revealed</strong>
                  </div>
                )}
                {!!item?.enchantments.length && (
                  <ul className="study-enchantments">
                    {item.enchantments.map((e) => (
                      <li key={e.name}>
                        {e.name} {roman(e.level)}
                      </li>
                    ))}
                  </ul>
                )}
                {object === 'table' && !item?.enchantments.length && (
                  <>
                    <div className="study-table-wallet">
                      <span>
                        <b>{state.level}</b> levels available
                      </span>
                      <span>
                        <LapisIcon />
                        <b>{state.crystals}</b> lapis
                      </span>
                    </div>
                    <div className="study-table-power">
                      {state.shelves} bookshelves · choose a hidden enchantment
                    </div>
                    <div
                      className="study-offers"
                      role="group"
                      aria-label="Hidden enchantment offers"
                    >
                      {state.offers.map((o) => {
                        const locked =
                          state.level < o.requiredLevel ||
                          state.crystals < o.crystalCost
                        return (
                          <button
                            key={o.slot}
                            className={locked ? 'locked' : ''}
                            aria-pressed={slot === o.slot}
                            disabled={busy}
                            onClick={() => setSlot(o.slot)}
                            aria-label={`Option ${o.slot + 1}. Requires level ${o.requiredLevel}. Costs ${o.levelCost} levels and ${o.crystalCost} lapis.${locked ? ' Not yet affordable.' : ''}`}
                          >
                            <span className="study-runes" aria-hidden="true">
                              {glyphs(o.glyphSeed)}
                            </span>
                            <b>{o.requiredLevel}</b>
                          </button>
                        )
                      })}
                    </div>
                    {offer && (
                      <div className="study-cost">
                        <span>
                          Requires level <b>{offer.requiredLevel}</b>
                        </span>
                        <span>
                          Spends{' '}
                          <b>
                            {offer.levelCost}{' '}
                            {offer.levelCost === 1 ? 'level' : 'levels'} +{' '}
                            {offer.crystalCost} lapis
                          </b>
                        </span>
                      </div>
                    )}
                    <button
                      className="study-primary"
                      disabled={busy || !canEnchant}
                      onClick={() => void act('enchant')}
                    >
                      {busy ? 'Enchanting…' : 'Enchant item'}
                    </button>
                    {!canEnchant && (
                      <p className="study-footnote">
                        {offer
                          ? enchantmentShortfall(
                              state.level,
                              state.crystals,
                              offer,
                            )
                          : ''}{' '}
                        Earn 1 lapis with each rewarded solve or successful review.
                      </p>
                    )}
                    <p className="study-footnote">
                      Names are revealed after enchanting. Your item is kept.
                    </p>
                  </>
                )}
                {item &&
                  state.equipped[item.kind] !== item.id &&
                  (object === 'stand' || item.enchantments.length > 0) && (
                    <button
                      className="study-primary"
                      disabled={busy}
                      onClick={() => void act('equip')}
                    >
                      {busy ? 'Saving…' : 'Equip on stand'}
                    </button>
                  )}
                {equippedMessage && (
                  <p
                    className="study-equipped-feedback"
                    role="status"
                    ref={equippedRef}
                    tabIndex={-1}
                  >
                    <Check size={15} />
                    {equippedMessage}{' '}
                    <button onClick={closeObject}>View in room</button>
                  </p>
                )}
                {object === 'table' && !!item?.enchantments.length && (
                  <p className="study-footnote">
                    Choose another earned item to use the table.
                  </p>
                )}
                {object === 'stand' && (
                  <>
                    <ArmorProgression items={state.items} />
                    <EquipmentInventory
                      state={state}
                      selectedId={item?.id}
                      busy={busy}
                      onSelect={(id) => {
                        setItemId(id)
                        setReceipt(null)
                        setError('')
                        setEquippedMessage('')
                      }}
                    />
                    <RewardProgress reward={state.nextReward} />
                  </>
                )}
              </>
            )}
            {error && (
              <p className="study-error" role="alert">
                {error}
              </p>
            )}
          </StudyDialog>
        )}
      </div>
      <section className="study-bottom">
        <RewardProgress reward={state.nextReward} />
        <button className="primary" onClick={active ? onReturn : onStart}>
          <Play size={16} />
          {active
            ? `${active.attempt.pausedAt ? 'Resume' : 'Return to'} ${session} session`
            : 'Start focus session'}
        </button>
      </section>
    </div>
  )
}
