import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SurfaceController } from '../src/browser/SurfaceController.ts'
import { geometryError } from '../src/browser/geometry.ts'

test('coalesces resize bursts and makes the final hide win', async () => {
  const sent = [], pending = []
  const surface = new SurfaceController((sequence,layout) => new Promise(resolve=>{sent.push({sequence,layout}); pending.push(resolve)}))
  const lease = surface.attach()
  surface.publish(lease,{rect:{x:1}})
  await Promise.resolve()
  surface.publish(lease,{rect:{x:2}})
  surface.publish(lease,{rect:{x:3}})
  const hidden = surface.hide()
  pending.shift()({sequence:1,visible:true,actual:null})
  await Promise.resolve()
  assert.equal(sent.length,2)
  assert.equal(sent[1].layout,null)
  pending.shift()({sequence:4,visible:false,actual:null})
  await hidden
  assert.equal(surface.report.visible,false)
})

test('publishing as an in-flight send resolves never strands the final update', async () => {
  const sent=[]
  let resolveFirst
  const first=new Promise(resolve=>{resolveFirst=resolve})
  const surface=new SurfaceController(async(sequence,layout)=>{
    sent.push(layout.rect.x)
    if(sequence===1) await first
    return {sequence,visible:true,actual:null}
  })
  const lease=surface.attach()
  const initial=surface.publish(lease,{rect:{x:1}})
  await Promise.resolve()
  resolveFirst()
  await Promise.resolve()
  await Promise.resolve()
  await surface.publish(lease,{rect:{x:2}})
  await initial
  assert.deepEqual(sent,[1,2])
  assert.equal(surface.report.sequence,2)
})

test('a queued hide runs even if the preceding layout fails', async () => {
  let rejectFirst
  const sent=[]
  const surface=new SurfaceController((sequence,layout)=>{
    sent.push(layout)
    if(layout) return new Promise((_,reject)=>{rejectFirst=reject})
    return Promise.resolve({sequence,visible:false,actual:null})
  })
  const lease=surface.attach()
  surface.publish(lease,{rect:{x:1}})
  await Promise.resolve()
  const hidden=surface.hide()
  rejectFirst(Error('transient failure'))
  await hidden
  assert.equal(sent.length,2)
  assert.equal(surface.report.visible,false)
})

test('old mounts cannot hide or move a newly attached cached surface', async () => {
  const sent=[]
  const surface=new SurfaceController(async(sequence,layout)=>{sent.push(layout);return {sequence,visible:!!layout,actual:null}})
  const old=surface.attach(), current=surface.attach()
  await surface.publish(current,{rect:{x:10}})
  await surface.detach(old)
  await surface.publish(old,{rect:{x:99}})
  assert.equal(sent.length,1)
  assert.equal(surface.report.visible,true)
})

test('unchanged geometry is deduplicated but native resize can force a commit', async () => {
  let count=0
  const surface=new SurfaceController(async(sequence)=>({sequence,visible:!!++count,actual:null}))
  const lease=surface.attach(), layout={rect:{x:0}}
  await surface.publish(lease,layout); await surface.publish(lease,layout)
  assert.equal(count,1)
  await surface.publish(lease,layout,true)
  assert.equal(count,2)
  assert.equal(geometryError({x:0,y:0,width:100,height:100},{x:.5,y:0,width:100,height:100}),.5)
})
