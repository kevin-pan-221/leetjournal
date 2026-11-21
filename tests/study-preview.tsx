// Isolated design/interaction fixture. No production database or session writes.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import StudyPage from '../src/study/StudyPage'
import type { StudyState } from '../src/study/types'
import { Sidebar } from '../src/components/Sidebar'
import '../src/styles.css'
import '../src/extras.css'
import '../src/sidebar.css'

const kinds = [
  'helmet',
  'chestplate',
  'leggings',
  'boots',
  'sword',
  'pickaxe',
] as const
const fixture: StudyState = {
  xp: 1395,
  lifetimeXp: 2200,
  level: 30,
  levelProgress: 0,
  levelSize: 112,
  crystals: 20,
  shelves: 15,
  solvedProblems: 75,
  revision: 0,
  nextReward: { kind: 'leggings', material: 'diamond', xpRequired: 100 },
  equipped: Object.fromEntries(kinds.map((k, i) => [k, i])),
  items: kinds.map((kind, id) => ({
    id,
    kind,
    material: id === 0 ? 'diamond' : 'iron',
    enchantments: [],
    earnedAt: '2026-10-08',
  })),
  offers: [
    { slot: 0, requiredLevel: 6, levelCost: 1, crystalCost: 1, glyphSeed: 31 },
    {
      slot: 1,
      requiredLevel: 15,
      levelCost: 2,
      crystalCost: 2,
      glyphSeed: 128,
    },
    {
      slot: 2,
      requiredLevel: 30,
      levelCost: 3,
      crystalCost: 3,
      glyphSeed: 225,
    },
  ],
}
function Preview() {
  const [state, setState] = useState(fixture),
    [animate, setAnimate] = useState(true),
    [message, setMessage] = useState(
      'Isolated fixture · not your practice data',
    )
  return (
    <>
      <style>{`.study-page { height: calc(100dvh - 36px); }`}</style>
      {new URLSearchParams(location.search).has('unobstructed') && (
        <style>{`.study-dialog, .study-dialog::backdrop { opacity: 0 !important; }`}</style>
      )}
      <div style={{ padding: 8, fontSize: 12, background: '#e3e6d8' }}>
        <span>{message}</span> ·{' '}
        <button onClick={() => setState(fixture)}>Advanced</button>{' '}
        <button
          onClick={() =>
            setState({
              ...fixture,
              xp: 0,
              lifetimeXp: 0,
              level: 0,
              crystals: 0,
              levelSize: 7,
              shelves: 0,
              solvedProblems: 0,
              items: fixture.items.slice(0, 4).map((i) => ({
                ...i,
                material: 'leather',
                enchantments: [],
                earnedAt: 'Starter equipment',
              })),
              equipped: Object.fromEntries(
                kinds.slice(0, 4).map((k, i) => [k, i]),
              ),
              nextReward: {
                kind: 'boots',
                material: 'chainmail',
                xpRequired: 100,
              },
              offers: fixture.offers.map((o, index) => ({
                ...o,
                requiredLevel: [1, 3, 6][index],
              })),
            })
          }
        >
          New user
        </button>{' '}
        <button
          onClick={() =>
            setState({
              ...fixture,
              lifetimeXp: 150,
              items: [
                ...fixture.items
                  .slice(0, 4)
                  .map((i) => ({ ...i, material: 'leather' })),
                {
                  id: 6,
                  kind: 'boots',
                  material: 'chainmail',
                  enchantments: [],
                  earnedAt: '2026-10-09',
                },
              ],
              equipped: Object.fromEntries(
                kinds.slice(0, 4).map((kind, id) => [kind, id]),
              ),
              nextReward: {
                kind: 'helmet',
                material: 'chainmail',
                xpRequired: 50,
              },
            })
          }
        >
          Earned upgrade
        </button>{' '}
        <button
          onClick={() =>
            setState({
              ...fixture,
              items: fixture.items.map((i) => ({
                ...i,
                material: i.id < 4 ? 'chainmail' : 'iron',
                enchantments:
                  i.id < 4 ? [{ name: 'Protection', level: 2 }] : [],
              })),
            })
          }
        >
          Enchanted chainmail
        </button>{' '}
        <button onClick={() => setAnimate(!animate)}>
          Motion {animate ? 'on' : 'off'}
        </button>
      </div>
      <div className="app-shell">
        <Sidebar
          page="study"
          name="Preview"
          hidden={false}
          collapsed={false}
          onToggle={() => {}}
          onNavigate={() => setMessage('Navigation selected')}
        />
        <main>
          <StudyPage
            state={state}
            onChange={setState}
            active={null}
            animate={animate}
            onStart={() => setMessage('Problem selection opened')}
            onReturn={() => {}}
            transport={{
              enchant: async (id, slot, revision) => {
                if (revision !== state.revision)
                  throw new Error('Already enchanted')
                return {
                  ...state,
                  level: state.level - slot - 1,
                  crystals: state.crystals - slot - 1,
                  revision: revision + 1,
                  items: state.items.map((i) =>
                    i.id === id
                      ? {
                          ...i,
                          enchantments: [
                            {
                              name:
                                i.kind === 'helmet'
                                  ? 'Protection'
                                  : 'Unbreaking',
                              level: 3,
                            },
                          ],
                        }
                      : i,
                  ),
                }
              },
              equip: async (id) => ({
                ...state,
                equipped: {
                  ...state.equipped,
                  [state.items.find((i) => i.id === id)!.kind]: id,
                },
              }),
            }}
          />
        </main>
      </div>
    </>
  )
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>,
)
