import { useEffect, useRef } from 'react'
import { basicSetup } from 'codemirror'
import { Compartment, EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { python } from '@codemirror/lang-python'

interface Props { value: string; readOnly: boolean; onChange: (code: string) => void; onRun: () => void; onSubmit?: () => void; onCursor?: (line: number, column: number) => void }
export function PythonEditor({ value, readOnly, onChange, onRun, onSubmit, onCursor }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const editable = useRef(new Compartment())
  const latest = useRef({ onChange, onRun, onSubmit, onCursor })
  latest.current = { onChange, onRun, onSubmit, onCursor }
  useEffect(() => {
    const editor = new EditorView({ parent: host.current!, state: EditorState.create({ doc: value, extensions: [
      basicSetup, python(), indentUnit.of('    '), EditorState.tabSize.of(4),
      editable.current.of(EditorState.readOnly.of(readOnly)),
      // Override basicSetup's Mod-Enter (insertBlankLine) before its default keymap.
      Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => { latest.current.onRun(); return true } },
        { key: "Mod-'", run: () => { latest.current.onSubmit?.(); return Boolean(latest.current.onSubmit) } }, indentWithTab])),
      EditorView.contentAttributes.of({ 'aria-label': 'Python code', 'aria-describedby': 'offline-editor-shortcuts', spellcheck: 'false' }),
      EditorState.changeFilter.of(transaction => transaction.newDoc.length <= 200_000),
      EditorView.updateListener.of(update => {
        if (update.docChanged) latest.current.onChange(update.state.doc.toString())
        if (update.selectionSet || update.docChanged) {
          const head = update.state.selection.main.head
          const line = update.state.doc.lineAt(head)
          latest.current.onCursor?.(line.number, head - line.from + 1)
        }
      }),
      EditorView.theme({
        '&': { height: '100%', fontSize: '13px', backgroundColor: '#fffefa' },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.65' },
        '.cm-content': { padding: '14px 0' },
        '.cm-gutters': { background: '#f8f6ef', color: '#9a978d', border: 'none' },
        '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#eeeee54d' },
        '&.cm-focused': { outline: 'none' },
        '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: '#dce4d0' },
      }),
    ] }) })
    view.current = editor
    return () => { view.current = null; editor.destroy() }
  }, [])
  useEffect(() => { const editor = view.current; if (editor && editor.state.doc.toString() !== value) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } }) }, [value])
  useEffect(() => { view.current?.dispatch({ effects: editable.current.reconfigure(EditorState.readOnly.of(readOnly)) }) }, [readOnly])
  return <div className="offline-code-editor" ref={host} />
}
