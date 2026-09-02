import {lazy,Suspense,useEffect,useState} from 'react'
import {BookOpen,Check,ChevronRight,Flame,Leaf,LockKeyhole,Pause,Play,Sprout} from 'lucide-react'
import type {FocusContext,GardenStage,GardenState,Problem} from './api'

const GardenWorld=lazy(()=>import('./GardenWorld').then(module=>({default:module.GardenWorld})))

const stages:{id:GardenStage;name:string;range:string;asset:string}[]=[
  {id:'openField',name:'Open Field',range:'0–10',asset:'/garden/open-field.png'},
  {id:'youngGrove',name:'Young Grove',range:'11–30',asset:'/garden/young-grove.png'},
  {id:'meadow',name:'Meadow',range:'31–60',asset:'/garden/meadow.png'},
  {id:'homestead',name:'Homestead',range:'61–90',asset:'/garden/homestead.png'},
  {id:'valley',name:'Valley',range:'91–120',asset:'/garden/valley.png'},
  {id:'countryside',name:'Countryside',range:'121–150',asset:'/garden/countryside.png'},
]
const stageIndex=(stage:GardenStage)=>stages.findIndex(item=>item.id===stage)
export const gardenAsset=(stage:GardenStage)=>stages[stageIndex(stage)].asset
export const gardenStageName=(stage:GardenStage)=>stages[stageIndex(stage)].name
const vitalityCopy={thriving:['Thriving','Recent practice keeps everything full of life.'],calm:['Calm','A quiet day in a peaceful place.'],needsCare:['Needs care','A little attention will bring back more activity.']} as const

function AmbientWorld({state,animate}:{state:GardenState;animate:boolean}){return <div className="ambient-world" aria-hidden="true"><Suspense fallback={null}><GardenWorld asset={gardenAsset(state.currentStage)} vitality={state.vitality} animate={animate}/></Suspense><div className="garden-light"/></div>}

export function GardenPage({state,active,animate,onStart,onReturn,onReviews}:{state:GardenState;active:FocusContext|null;animate:boolean;onStart:(problem:Problem)=>void;onReturn:()=>void;onReviews:()=>void}){
  const [now,setNow]=useState(Date.now())
  useEffect(()=>{if(!active)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[active?.attempt.id])
  const current=stageIndex(state.currentStage),vitality=vitalityCopy[state.vitality],attempt=active?.attempt
  const elapsed=attempt?Math.max(0,Math.floor((now-new Date(attempt.startedAt).getTime()-(attempt.pausedAt?now-new Date(attempt.pausedAt).getTime():0))/1000)-attempt.pausedSeconds):0
  const elapsedLabel=`${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`
  return <div className={`garden-page vitality-${state.vitality} ${animate?'garden-motion-enabled':'garden-motion-disabled'}`} style={{'--garden-image':`url("${gardenAsset(state.currentStage)}")`} as React.CSSProperties}>
    <AmbientWorld state={state} animate={animate}/>
    <header className="garden-title"><span><Leaf size={16}/>Your garden</span><h1>{gardenStageName(state.currentStage)}</h1><p>{state.uniqueProblemsPracticed} of 150 places practiced</p></header>
    <div className="garden-streak"><Flame size={17}/><b>{state.currentStreak}</b><span>day streak</span></div>
    <section className={`garden-today glass-card ${attempt?'garden-session-live':''}`}>
      {attempt?<><div className="garden-session-heading"><span className="garden-label"><i className={attempt.pausedAt?'paused':''}/>{attempt.pausedAt?'Session paused':'Focus in progress'}</span><time>{elapsedLabel}</time></div><h2>{attempt.problem.title}</h2><p><b>{attempt.problem.difficulty}</b> · {attempt.problem.category}</p><button onClick={onReturn}><Play size={15} fill="currentColor"/>{attempt.pausedAt?'Resume session':'Return to session'}<ChevronRight size={15}/></button>{state.todayProblem.id!==attempt.problem.id&&<div className="garden-up-next"><span>Up next</span><b>{state.todayProblem.title}</b></div>}</>:<><span className="garden-label"><Sprout size={14}/>Today</span><h2>{state.todayProblem.title}</h2><p><b>{state.todayProblem.difficulty}</b> · {state.todayProblem.category}</p><button onClick={()=>onStart(state.todayProblem)}><Play size={15} fill="currentColor"/>Start focus</button></>}
    </section>
    <section className="garden-reviews glass-card"><span className="garden-label">Reviews due</span><b>{state.reviewsDue}</b><p>{state.reviewsDue===1?'problem is ready':'problems are ready'}</p><button onClick={onReviews}>View reviews <ChevronRight size={14}/></button></section>
    <section className="garden-week glass-card"><span className="garden-label">This week</span><div>{['M','T','W','T','F','S','S'].map((day,index)=><span key={index}><small>{day}</small><i className={state.week[index]?'done':''}>{state.week[index]?<Check size={11}/>:null}</i></span>)}</div><p>{state.weeklyDaysCompleted} / 7 days practiced</p></section>
    <section className="garden-vitality glass-card"><i/><div><b>{vitality[0]}</b><span>{vitality[1]}</span></div></section>
    {state.recentTakeaway&&<section className="garden-takeaway glass-card"><span className="garden-label"><BookOpen size={13}/>Recent takeaway</span><p>“{state.recentTakeaway.length>110?`${state.recentTakeaway.slice(0,110)}…`:state.recentTakeaway}”</p></section>}
    <details className="garden-progress glass-card"><summary><span><Leaf size={14}/>World progress</span><b>{gardenStageName(state.currentStage)}</b><ChevronRight size={16}/></summary><div className="stage-strip">{stages.map((stage,index)=><article className={`${index===current?'current':''} ${index>current?'locked':''}`} key={stage.id}><div style={{backgroundImage:`url("${stage.asset}")`}}>{index<current?<Check size={14}/>:index>current?<LockKeyhole size={13}/>:<span/>}</div><b>{stage.name}</b><small>{stage.range} problems</small></article>)}</div></details>
  </div>
}

export function GardenFocus({context,garden,animate,onPause,onWorkspace,onFinish}:{context:FocusContext|null;garden:GardenState;animate:boolean;onPause:()=>void;onWorkspace:()=>void;onFinish:()=>void}){
  const [now,setNow]=useState(Date.now())
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[])
  if(!context)return null
  const a=context.attempt,started=new Date(a.startedAt).getTime(),pauseExtra=a.pausedAt?now-new Date(a.pausedAt).getTime():0,seconds=Math.max(0,Math.floor((now-started-pauseExtra)/1000)-a.pausedSeconds),remaining=Math.max(0,context.targetMinutes*60-seconds),time=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`
  return <div className={`garden-focus vitality-${garden.vitality} ${animate?'garden-motion-enabled':'garden-motion-disabled'}`} style={{'--garden-image':`url("${gardenAsset(garden.currentStage)}")`} as React.CSSProperties}>
    <AmbientWorld state={garden} animate={animate}/><div className="garden-focus-shade"/>
    <section className="garden-focus-card"><span><Leaf size={15}/>Focus in {gardenStageName(garden.currentStage)}</span><h1>{a.problem.title}</h1><p>{a.problem.difficulty} · {a.problem.category}</p><time>{time}</time><small>{a.pausedAt?'The timer is resting':'A quiet step at a time'}</small><div><button className="garden-focus-pause" onClick={onPause}>{a.pausedAt?<Play size={17}/>:<Pause size={17}/>} {a.pausedAt?'Resume':'Pause'}</button><button className="garden-focus-open" onClick={onWorkspace}>Open focus session <ChevronRight size={16}/></button></div><button className="garden-focus-finish" onClick={onFinish}><Check size={15}/>Finish & reflect</button></section>
  </div>
}
