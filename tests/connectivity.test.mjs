import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createConnectivityMonitor } from '../src/offline/connectivity.ts'

function fixture(probe) {
  const pending = new Set()
  const states = []
  const monitor = createConnectivityMonitor({probe,publish:state=>states.push(state),schedule:(fn,ms)=>{
    const task={fn,ms}; pending.add(task); return ()=>pending.delete(task)
  }})
  const fire = async () => {
    const task = [...pending][0]
    assert.ok(task,'a check should be scheduled')
    pending.delete(task); task.fn()
    await new Promise(resolve=>setImmediate(resolve))
  }
  return {monitor,pending,states,fire}
}

test('online startup defers one lightweight check and never polls after success', async () => {
  let calls=0
  const f=fixture(async()=>{calls++;return true})
  f.monitor.check(5000)
  assert.equal(calls,0)
  assert.equal([...f.pending][0].ms,5000)
  await f.fire()
  assert.equal(calls,1); assert.deepEqual(f.states,[true]); assert.equal(f.pending.size,0)
})

test('a failed probe needs confirmation; a transient failure never opens offline mode', async () => {
  const results=[false,true,false,false]
  const f=fixture(async()=>results.shift())
  f.monitor.check(); await f.fire()
  assert.deepEqual(f.states,[])
  assert.equal([...f.pending][0].ms,1000)
  await f.fire(); assert.deepEqual(f.states,[true])
  f.monitor.check(); await f.fire(); await f.fire()
  assert.deepEqual(f.states,[true,false]); assert.equal(f.pending.size,0)
})

test('disconnect is immediate, cancels delayed checks, and ignores old replies', async () => {
  let resolve
  const f=fixture(()=>new Promise(done=>{resolve=done}))
  f.monitor.check(5000); f.monitor.disconnected()
  assert.deepEqual(f.states,[false]); assert.equal(f.pending.size,0)
  f.monitor.check(); await f.fire(); f.monitor.disconnected()
  resolve(true); await new Promise(done=>setImmediate(done))
  assert.deepEqual(f.states,[false,false])
})

test('cleanup cancels work, reconnect supersedes old checks, and IPC failure is not offline', async () => {
  const replies=[]
  const f=fixture(()=>new Promise((resolve,reject)=>replies.push({resolve,reject})))
  f.monitor.check(); await f.fire()
  f.monitor.check(); await f.fire()
  replies[0].resolve(false); replies[1].resolve(true)
  await new Promise(done=>setImmediate(done))
  assert.deepEqual(f.states,[true]); assert.equal(f.pending.size,0)
  f.monitor.check(); await f.fire(); replies[2].reject(Error('IPC unavailable'))
  await new Promise(done=>setImmediate(done)); assert.deepEqual(f.states,[true])
  f.monitor.check(); f.monitor.dispose(); f.monitor.check()
  assert.equal(f.pending.size,0)
})

test('unmount while a confirmation is in flight cannot update the workspace', async () => {
  let resolve
  let calls=0
  const f=fixture(()=>++calls===1 ? Promise.resolve(false) : new Promise(done=>{resolve=done}))
  f.monitor.check(); await f.fire(); await f.fire(); f.monitor.dispose()
  resolve(false); await new Promise(done=>setImmediate(done))
  assert.deepEqual(f.states,[])
})
