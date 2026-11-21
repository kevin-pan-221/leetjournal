import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { loadPyodide } from 'pyodide'
import { examplesFromText, parseMetadata, parseTests } from '../src/offline/tests.ts'
import { createDraftStore } from '../src/offline/draftStore.ts'
import { caseDraft, duplicateCaseDraft, readCaseDrafts, writeCaseDrafts } from '../src/offline/cases.ts'
import { firstResultToInspect, summarizeResults, validResults } from '../src/offline/results.ts'
import { clampSplit, readSplit, saveSplit } from '../src/offline/layout.ts'
import { latestBookProgress } from '../src/offline/bookProgress.ts'

test('book progress does not rewind after delayed command responses or navigation', () => {
  const current = {bookId:'neetcode-150',revision:4,status:'running',savedIds:['a','b']}
  assert.equal(latestBookProgress(current,{...current,revision:2,savedIds:[]}),current)
  assert.equal(latestBookProgress(current,null),current)
  const completed = {...current,revision:5,status:'completed'}
  assert.equal(latestBookProgress(current,completed),completed)
  assert.equal(latestBookProgress(null,current),current)
})

const metadata = {name:'twoSum', params:[{name:'nums',type:'integer[]'},{name:'target',type:'integer'}],return:{type:'integer[]'}}
test('workspace splits stay usable, persist separately, and tolerate unavailable storage', () => {
  assert.equal(clampSplit('description',-100),25)
  assert.equal(clampSplit('description',100),65)
  assert.equal(clampSplit('tests',Infinity),36)
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage')
  try {
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:memoryStorage()})
    assert.equal(readSplit('description'),40)
    saveSplit('description',48); saveSplit('tests',29)
    assert.equal(readSplit('description'),48); assert.equal(readSplit('tests'),29)
    localStorage.setItem('leetjournal.offline.layout.description','bad')
    assert.equal(readSplit('description'),40)
    Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('Unavailable')}})
    assert.equal(readSplit('description'),40); assert.doesNotThrow(()=>saveSplit('tests',20))
  } finally {
    if(previous) Object.defineProperty(globalThis,'localStorage',previous)
    else delete globalThis.localStorage
  }
})
test('metadata refuses custom judges and non-callable problems', () => {
  assert.deepEqual(parseMetadata(JSON.stringify(metadata)), metadata)
  assert.ok(parseMetadata(JSON.stringify({...metadata, return:{type:'void'}})))
  for (const value of ['bad', '{}', JSON.stringify({...metadata, systemdesign:true}), JSON.stringify({...metadata, manual:true}), JSON.stringify({...metadata, return:{type:'Node'}})]) assert.equal(parseMetadata(value),null)
  assert.equal(parseMetadata(JSON.stringify({...metadata,params:[{name:{},type:'integer'}]})),null)
  assert.equal(parseMetadata(JSON.stringify({...metadata,params:[{type:'integer'}]})),null)
})
test('real NeetCode metadata normalizes generic lists and arrays of nodes', () => {
  for (const [raw, expected] of [['list<list<integer>>','integer[][]'],['list<string>','string[]'],['ListNode[]','ListNode[]'],['list<TreeNode>','TreeNode[]']]) {
    assert.equal(parseMetadata(JSON.stringify({...metadata,return:{type:raw}})).return.type,expected)
  }
  const lists = parseMetadata(JSON.stringify({name:'mergeKLists',params:[{name:'lists',type:'ListNode[]'}],return:{type:'ListNode'}}))
  assert.equal(lists.params[0].type,'ListNode[]')
  for (const type of ['list<Node>','list<>','list<integer,string>','list<integer','void[]','integer'+'[]'.repeat(10)]) {
    assert.equal(parseMetadata(JSON.stringify({...metadata,return:{type}})),null)
  }
})
test('examples retain JSON argument grouping and never invent expected answers', () => {
  assert.deepEqual(examplesFromText('[2,7,11,15]\n9\n[3,2,4]\n6', 'Output: [0,1]\nOutput: [1,2]\n',2), [
    {args:[[2,7,11,15],9],expected:[0,1]}, {args:[[3,2,4],6],expected:[1,2]},
  ])
  assert.deepEqual(examplesFromText('3', 'No parseable output',1),[{args:[3]}])
  assert.deepEqual(examplesFromText('bad','Output: true',1),[])
  assert.deepEqual(examplesFromText('[1,2]', 'Output:\n[\n 1,\n 2\n]\nExplanation: works',1),[{args:[[1,2]],expected:[1,2]}])
})
test('custom tests enforce bounds and arity', () => {
  assert.equal(parseTests('[{"args":[1],"expected":2}]',1).length,1)
  for (const value of ['bad','[]','[{}]','[{"args":[]}]','[{"args":[1],"unordered":"true"}]',JSON.stringify(Array(21).fill({args:[1]}))]) assert.throws(()=>parseTests(value,1))
  assert.throws(()=>parseTests('[{"args":[1e999]}]',1),/infinite/)
  const nested = '['.repeat(45) + '0' + ']'.repeat(45)
  assert.throws(()=>parseTests(`[{"args":[${nested}]}]`,1),/nesting/)
})

test('bundled Python executes examples, reports errors, captures output and converts nodes', async () => {
  const python = await loadPyodide({ indexURL: new URL('../node_modules/pyodide/',import.meta.url).pathname })
  const harness = await readFile(new URL('../public/offline-harness.py',import.meta.url),'utf8')
  const run = async (code, tests, meta = metadata) => {
    python.globals.set('_offline_payload', JSON.stringify({code, tests,metadata:meta}))
    await python.runPythonAsync(harness)
    return JSON.parse(python.globals.get('_offline_result'))
  }
  const rows = await run('class Solution:\n def twoSum(self, nums, target):\n  print("hello")\n  return [0,1]', [
    {args:[[2,7],9],expected:[0,1]}, {args:[[2,7],9],expected:[1,0]}, {args:[[2,7],9]}, {args:[[2,7],9],expected:[1,0],unordered:true},
  ])
  const grouping = parseMetadata(JSON.stringify({name:'groupAnagrams',params:[{name:'strs',type:'string[]'}],return:{type:'list<list<string>>'}}))
  const groups = await run('class Solution:\n def groupAnagrams(self, strs):\n  groups = defaultdict(list)\n  for s in strs: groups[tuple(sorted(s))].append(s)\n  return groups.values()', [{args:[['eat','tea','tan']],expected:[['eat','tea'],['tan']]}],grouping)
  assert.equal(groups[0].status,'passed')
  const merging = parseMetadata(JSON.stringify({name:'mergeKLists',params:[{name:'lists',type:'ListNode[]'}],return:{type:'ListNode'}}))
  const merged = await run('class Solution:\n def mergeKLists(self, lists):\n  values = []\n  for node in lists:\n   while node:\n    values.append(node.val)\n    node = node.next\n  head = None\n  for value in sorted(values, reverse=True): head = ListNode(value, head)\n  return head', [{args:[[[1,4],[2,3],[]]],expected:[1,2,3,4]},{args:[[]],expected:[]}],merging)
  assert.deepEqual(merged.map(r=>r.status),['passed','passed'])
  assert.deepEqual(rows.map(r=>r.status),['passed','different','output','passed'])
  assert.equal(rows[0].stdout,'hello\n')
  assert.equal((await run('class Solution:\n def twoSum(self,*args):\n  raise ValueError("nope")',[{args:[[],0]}]))[0].status,'error')
  const single = type => ({name:'identity',params:[{name:'node',type}],return:{type}})
  for (const type of ['ListNode','TreeNode']) {
    const value = type === 'TreeNode' ? [1,null,2,3] : [1,2,3]
    assert.equal((await run('class Solution:\n def identity(self,node):\n  return node',[{args:[value],expected:value}],single(type)))[0].status,'passed')
  }
  assert.equal((await run('class Solution:\n def twoSum(self,*args):\n  print("x"*20000)\n  return []',[{args:[[],0]}]))[0].stdout.length,4000)
  const syntax = (await run('syntax !!!',[{args:[[],0]}]))[0]
  assert.equal(syntax.status,'error'); assert.match(syntax.error,/line 1/)
  const syntaxRows = await run('syntax !!!',[{args:[[],0]},{args:[[],1]}])
  assert.deepEqual(syntaxRows.map(row=>row.index),[0,1]); assert.ok(validResults(syntaxRows,2))
  const isolated = await run('state=[]\nclass Solution:\n def twoSum(self,*args):\n  state.append(1)\n  return state',[{args:[[],0],expected:[1]},{args:[[],0],expected:[1]}])
  assert.deepEqual(isolated.map(r=>r.status),['passed','passed'])
  const typed = await run('class Solution:\n def twoSum(self,*args):\n  return [True]',[{args:[[],0],expected:[1]}])
  assert.equal(typed[0].status,'different')
  const modulo = await run('class Solution:\n def twoSum(self,*args):\n  return pow(2,10,100)',[{args:[[],0],expected:24}],{...metadata,return:{type:'integer'}})
  assert.equal(modulo[0].status,'passed')
  const mutation = await run('class Solution:\n def reverse(self,nums):\n  nums.reverse()',[{args:[[1,2]],expected:[2,1],observe:0}],{name:'reverse',params:[{name:'nums',type:'integer[]'}],return:{type:'void'}})
  assert.equal(mutation[0].status,'passed'); assert.ok(mutation[0].durationMs >= 0)
  const runtime = await run('class Solution:\n def twoSum(self,*args):\n  return 1/0',[{args:[[],0]}])
  assert.match(runtime[0].error, /line 3/); assert.match(runtime[0].error, /ZeroDivisionError/)
})

test('case forms preserve unfinished input without silently changing it', () => {
  const draft = caseDraft({args:[[1,2], 'hello'],expected:null})
  assert.deepEqual(draft.args,['[1,2]','"hello"'])
  draft.args[0] = '[1,'
  const serialized = writeCaseDrafts([draft])
  assert.deepEqual(readCaseDrafts(serialized),[JSON.parse(JSON.stringify(draft))])
  assert.throws(()=>parseTests(serialized,2),/Case 1, argument 1/)
  assert.equal(readCaseDrafts('not json'),null)
  assert.throws(()=>parseTests('[{"args":[1],"observe":8}]',1))
  assert.throws(()=>parseTests('[{"args":[1],"observe":-1}]',1))
})

test('duplicating a case preserves comparison settings and isolates its inputs', () => {
  const source = [{args:['[1,'],expected:'[2]',unordered:true,observe:0}]
  const copies = duplicateCaseDraft(source,0)
  assert.equal(copies.length,2); assert.deepEqual(copies[1],source[0])
  copies[1].args[0]='[9]'
  assert.equal(source[0].args[0],'[1,')
  assert.equal(duplicateCaseDraft(source,9),source)
  const full=Array(20).fill(source[0]); assert.equal(duplicateCaseDraft(full,0),full)
})

test('results distinguish output-only cases, select failures, and reject incomplete runs', () => {
  const row=(index,status)=>({index,status,stdout:'',durationMs:1,...(status==='error'?{error:'Oops'}:{})})
  const rows=[row(0,'passed'),row(1,'output'),row(2,'different'),row(3,'error')]
  assert.equal(summarizeResults(rows),'1 / 2 match expected · 1 runtime error · 1 output-only case')
  assert.equal(summarizeResults([row(0,'output')]),'1 output-only case')
  assert.equal(firstResultToInspect(rows),2)
  assert.equal(firstResultToInspect([row(0,'passed')]),0)
  assert.ok(validResults(rows,4))
  assert.ok(!validResults(rows,5))
  assert.ok(!validResults([row(0,'passed'),row(0,'passed')],2))
  assert.ok(!validResults([{...row(0,'passed'),durationMs:Infinity}],1))
  assert.ok(!validResults([{...row(0,'passed'),stdout:'x'.repeat(4001)}],1))
  assert.ok(validResults([{...row(0,'passed'),stdout:'🌱'.repeat(4000)}],1))
  assert.ok(!validResults([{...row(0,'error'),error:undefined}],1))
})

function memoryStorage() {
  const values = new Map()
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}
}
test('draft writes are ordered and an old acknowledgement cannot clear newer recovery', async () => {
  const storage = memoryStorage(); const saved=[]; let release
  const store = createDraftStore(async (_id,draft)=>{ saved.push(draft.code); if(saved.length===1) await new Promise(r=>{release=r}) },()=>storage)
  const first={code:'old',tests:'[]'}, second={code:'new',tests:'[]'}
  store.stage('p',first); const writing=store.save('p',first)
  await new Promise(r=>setImmediate(r))
  store.stage('p',second); const next=store.save('p',second)
  release(); await writing
  assert.equal(store.recover('p').code,'new')
  await next; assert.equal(store.recover('p'),null); assert.deepEqual(saved,['old','new'])
})
test('failed saves survive a remount and restart and remain isolated by problem', async () => {
  const storage=memoryStorage(); const original={code:'unsaved',tests:'[incomplete'}
  const store=createDraftStore(async()=>{throw Error('disk unavailable')},()=>storage)
  store.stage('p',original); await assert.rejects(store.save('p',original))
  const reopened=createDraftStore(async()=>{},()=>storage)
  assert.deepEqual(reopened.recover('p'),original); assert.equal(reopened.recover('other'),null)
  await reopened.save('p',original); assert.equal(reopened.recover('p'),null)
})
test('storage denial does not prevent database saves or in-memory recovery', async () => {
  const store=createDraftStore(async()=>{},()=>{throw Error('quota')})
  const draft={code:'saved',tests:''}; assert.equal(store.stage('p',draft),false)
  assert.deepEqual(store.recover('p'),draft); await store.save('p',draft); assert.equal(store.recover('p'),null)
})
