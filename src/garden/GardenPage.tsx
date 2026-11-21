import { useState } from 'react'
import { ArrowRight, Leaf, Play } from 'lucide-react'
import type { FocusContext, GardenState } from '../domain'
import { DeskPlant } from './DeskPlant'
import { PLANT_NAMES, STAGE_NAMES, type GardenGrowth } from './growth'

interface GardenPageProps {
  state: GardenState
  growth: GardenGrowth
  active: FocusContext | null
  animate: boolean
  onStart: () => void
  onReturn: () => void
}

export function GardenPage({ state, growth, active, animate, onStart, onReturn }: GardenPageProps) {
  const [selected, setSelected] = useState<number | null>(null)
  const [visible, setVisible] = useState(12)
  const selectedPlant = state.plants.find(plant => plant.id === selected)
  const newest = state.plants.at(-1)
  const watered = newest && Date.now() - Date.parse(newest.grownAt) < 30_000
  const sessionKind = active?.attempt.isReview ? 'review' : 'focus'
  return (
    <div className={`desk-garden page ${animate ? 'desk-motion' : ''}`}>
      <header className="desk-heading"><div><span className="desk-eyebrow"><Leaf size={14} /> A little time, a little growth</span><h1>Your garden</h1><p>A quiet record of the time you’ve put in.</p></div></header>
      <section className="desk-scene" aria-label={`${growth.name}, ${STAGE_NAMES[growth.stage].toLowerCase()} stage`}>
        <div className="desk-window" aria-hidden="true"><div className="desk-cloud cloud-a" /><div className="desk-cloud cloud-b" /><div className="desk-hills" /><div className="desk-window-bars" /></div>
        <div className="desk-sunlight" aria-hidden="true" />
        <div className="desk-hero-pot"><DeskPlant stage={growth.stage} variety={growth.plantIndex} animate={animate} />
          {watered && animate && <div key={newest.id} className="desk-water" aria-hidden="true"><i /><i /><i /></div>}
        </div>
        <div className="desk-sill" aria-hidden="true" />
        <span className="desk-scene-label">{growth.name} · {STAGE_NAMES[growth.stage]}</span>
      </section>
      <section className="desk-growth" aria-label="Plant growth">
        <div className="desk-growth-copy"><h2>{growth.blooming ? 'A bloom to keep.' : 'Small steps take root.'}</h2><p>{growth.blooming ? 'Finish or end your session to add it to the shelf. Extra time carries over.' : `${growth.minutesToNext} more focus ${growth.minutesToNext === 1 ? 'minute' : 'minutes'} until ${STAGE_NAMES[growth.stage + 1].toLowerCase()}.`}</p>
          <div className="desk-growth-track" role="progressbar" aria-label="Current plant" aria-valuenow={Math.floor(growth.percent)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${growth.percent}%` }} /></div>
          <div className="desk-growth-stages">{STAGE_NAMES.map((name, i) => <span className={i <= growth.stage ? 'reached' : ''} key={name}>{name}</span>)}</div>
        </div>
        <button className="primary finish" onClick={active ? onReturn : onStart}><Play size={16} fill="currentColor" />{active ? `${active.attempt.pausedAt ? 'Resume' : 'Return to'} ${sessionKind} session` : 'Start focus session'}</button>
      </section>
      <section className="desk-collection" aria-labelledby="shelf-title">
        <header><h2 id="shelf-title">Your shelf <span>{state.plants.length}</span></h2><p>25 minutes per growth step. Short sessions and reviews count.</p></header>
        {state.plants.length === 0 ? <div className="desk-empty-shelf"><Leaf size={22} /><p>Your first bloom will live here.</p><span>Take breaks. Nothing withers while you’re away.</span></div> : <>
          <div className="desk-shelf-grid">{state.plants.slice(-visible).reverse().map(plant => <button key={plant.id} className={`desk-keepsake ${selected === plant.id ? 'selected' : ''}`} aria-expanded={selected === plant.id} aria-controls="plant-memory" onClick={() => setSelected(selected === plant.id ? null : plant.id)}>
            <DeskPlant stage={3} variety={plant.id} animate={false} /><span>{PLANT_NAMES[plant.id % PLANT_NAMES.length]} <small>#{plant.id + 1}</small></span>
          </button>)}</div>
          <div id="plant-memory">{selectedPlant && <section className="desk-memory"><div><h3>{PLANT_NAMES[selectedPlant.id % PLANT_NAMES.length]} #{selectedPlant.id + 1}</h3><p>Saved {new Date(selectedPlant.grownAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} · 75 minutes of practice</p></div><ul>{selectedPlant.problems.map(title => <li key={title}>{title}</li>)}</ul><button onClick={() => setSelected(null)} aria-label="Close plant details">Close</button></section>}</div>
          {visible < state.plants.length && <button className="desk-more" onClick={() => setVisible(count => count + 12)}>Show more plants <ArrowRight size={14} /></button>}
        </>}
      </section>
    </div>
  )
}
