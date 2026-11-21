import { useState } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { duplicateCaseDraft, readCaseDrafts, writeCaseDrafts } from './cases'
import type { CaseDraft } from './cases'
import type { MethodMetadata } from './types'

export function TestCases({ value, metadata, disabled, onChange, judged = false, customCompare = true }: { value: string; metadata: MethodMetadata; disabled: boolean; onChange: (value: string) => void; judged?: boolean; customCompare?: boolean }) {
  const cases = readCaseDrafts(value)
  const [selection, setSelection] = useState(0)
  const index = Math.min(selection, Math.max(0, (cases?.length ?? 1) - 1))
  if (!cases) return <div className="offline-case-fields"><p>These saved tests need repair. Use a JSON array with <code>args</code> and optional <code>expected</code>.</p><textarea aria-label="Repair test JSON" value={value} disabled={disabled} onChange={e => onChange(e.target.value)} /></div>
  const current = cases[index]
  const update = (change: Partial<CaseDraft>) => onChange(writeCaseDrafts(cases.map((c, i) => i === index ? { ...c, ...change } : c)))
  const add = () => {
    const next: CaseDraft = { args: metadata.params.map(p => p.type.includes('[]') || p.type.endsWith('Node') || p.type === 'json' ? '[]' : ['string','character','char'].includes(p.type) ? '""' : ['bool','boolean'].includes(p.type) ? 'false' : '0'), expected: '', unordered: false }
    if (metadata.return.type === 'void' && metadata.params.length) next.observe = 0
    onChange(writeCaseDrafts([...cases, next])); setSelection(cases.length)
  }
  return <>
    <nav className="offline-case-tabs" aria-label="Test cases">{cases.map((_, i) => <button key={i} aria-pressed={i === index} onClick={() => setSelection(i)}>Case {i + 1}</button>)}<button disabled={disabled || cases.length >= 20} aria-label="Add test case" title="Add test case" onClick={add}><Plus size={14} /></button></nav>
    {!current ? <p>No cases yet. Add one to test your solution.</p> : <div className="offline-case-fields">
      {metadata.params.map((param, i) => <label key={i}><span>{param.name} <small>{param.type}</small></span><textarea rows={1} aria-label={`Case ${index + 1} ${param.name}`} value={current.args[i] ?? ''} spellCheck={false} disabled={disabled} onChange={e => update({ args: metadata.params.map((_, n) => n === i ? e.target.value : current.args[n] ?? '') })} /></label>)}
      {customCompare && <label><span>Compare <small>return value or changed input</small></span><select aria-label="Compare output" value={current.observe ?? 'return'} disabled={disabled} onChange={e => update({ observe: e.target.value === 'return' ? undefined : Number(e.target.value) })}><option value="return">Return value{metadata.return.type === 'void' ? ' (none for this method)' : ''}</option>{metadata.params.map((p,i) => <option key={i} value={i}>{p.name} after execution</option>)}</select></label>}
      <label><span>Expected output <small>optional</small></span><textarea rows={1} aria-label={`Case ${index + 1} expected output`} value={current.expected} placeholder="Leave empty to inspect output" spellCheck={false} disabled={disabled} onChange={e => update({ expected: e.target.value })} /></label>
      <div className="offline-case-options"><label><input type="checkbox" checked={current.unordered} disabled={disabled} onChange={e => update({ unordered: e.target.checked })} />Ignore outer array order{judged ? ' (Submit applies the problem’s own rules)' : ''}</label><div><button disabled={disabled || cases.length >= 20} aria-label={`Duplicate case ${index + 1}`} onClick={() => { onChange(writeCaseDrafts(duplicateCaseDraft(cases, index))); setSelection(index + 1) }}><Copy size={13} />Duplicate</button><button disabled={disabled} aria-label={`Remove case ${index + 1}`} onClick={() => { onChange(writeCaseDrafts(cases.filter((_, i) => i !== index))); setSelection(Math.max(0,index - 1)) }}><Trash2 size={13} />Remove</button></div></div>
      <small className="offline-field-help">Use JSON values: [1,2], "text", true, null. Your test inputs save as you type.</small>
    </div>}
  </>
}
