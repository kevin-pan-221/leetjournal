import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, UIEvent } from 'react'
import { api } from '../api'
import type { FocusContext } from '../domain'
import { errorMessage } from '../utils/errors'
import { buildContextualPrompt, parseQwenCommand } from '../utils/qwen'

export function useFocusNotebook(context: FocusContext | null, webviewLabel: string, obscured: boolean) {
  const [notes, setNotes] = useState(context?.attempt.notes ?? '')
  const [qwenRunning, setQwenRunning] = useState(false)
  const [qwenStatus, setQwenStatus] = useState('Preparing Qwen…')
  const [lastQwenBlock, setLastQwenBlock] = useState('')
  const [noteSaveFailed, setNoteSaveFailed] = useState(false)
  const notesRef = useRef(notes)
  const notesInputRef = useRef<HTMLTextAreaElement>(null)
  const followOutputRef = useRef(true)
  const requestRef = useRef(0)
  const runningRef = useRef(false)
  const stoppedRef = useRef(false)
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())

  const saveNotes = (attemptId: number, value: string) => {
    saveChainRef.current = saveChainRef.current
      .catch(() => {})
      .then(() => api.notes(attemptId, value))
      .then(() => setNoteSaveFailed(false))
      .catch(() => setNoteSaveFailed(true))
    return saveChainRef.current
  }

  useEffect(() => {
    setNotes(context?.attempt.notes ?? '')
    setLastQwenBlock('')
    setNoteSaveFailed(false)
    setQwenRunning(false)
    runningRef.current = false
    return () => {
      requestRef.current += 1
      if (runningRef.current) void api.stopQwen().catch(() => {})
    }
  }, [context?.attempt.id])

  useEffect(() => { notesRef.current = notes }, [notes])

  useEffect(() => {
    if (qwenRunning && followOutputRef.current && notesInputRef.current) {
      notesInputRef.current.scrollTop = notesInputRef.current.scrollHeight
    }
  }, [notes, qwenRunning])

  useEffect(() => {
    if (!context) return
    const timer = setTimeout(() => { void saveNotes(context.attempt.id, notes) }, 500)
    return () => clearTimeout(timer)
  }, [notes, context?.attempt.id])

  useEffect(() => {
    if (!context) return
    const attemptId = context.attempt.id
    return () => { void saveNotes(attemptId, notesRef.current) }
  }, [context?.attempt.id])

  const runQwen = async () => {
    if (!context) return
    const { attempt } = context
    const command = parseQwenCommand(notes)
    if (!command || runningRef.current || obscured) return
    const request = ++requestRef.current
    const current = () => requestRef.current === request
    runningRef.current = true
    stoppedRef.current = false
    followOutputRef.current = true
    setQwenRunning(true)
    setQwenStatus('Preparing Qwen…')
    setLastQwenBlock('')
    let block = ''
    const append = (text: string) => {
      if (!current()) return
      block += text
      notesRef.current += text
      setNotes(notesRef.current)
    }
    try {
      let prompt = command.question
      if (command.includeContext) {
        if (!webviewLabel) throw new Error('The LeetCode editor is still loading. Try @big-qwen again in a moment.')
        const code = await api.leetcodeEditorCode(webviewLabel)
        if (!current() || stoppedRef.current) return
        if (!code.trim()) throw new Error('LeetJournal could not read the current editor code. Click inside the LeetCode editor, then try @big-qwen again.')
        prompt = buildContextualPrompt(command, attempt.problem, code)
      }
      append('\n\nQwen: ')
      await api.askQwen(prompt, (token) => {
        if (!current() || stoppedRef.current) return
        setQwenStatus('Responding')
        append(token)
      })
      append(stoppedRef.current ? '[Stopped]\n' : '\n')
    } catch (error) {
      append(`\n\n[Qwen: ${errorMessage(error)}]\n`)
    } finally {
      if (current()) {
        setLastQwenBlock(block)
        runningRef.current = false
        setQwenRunning(false)
      }
    }
  }

  const stopQwen = async () => {
    stoppedRef.current = true
    setQwenStatus('Stopping…')
    try { await api.stopQwen() } catch {
      stoppedRef.current = false
      setQwenStatus('Couldn’t stop · retry')
    }
  }

  const canClearQwen = Boolean(lastQwenBlock && notes.includes(lastQwenBlock))
  const clearQwenOutput = () => setNotes((value) => {
    const start = value.lastIndexOf(lastQwenBlock)
    return start < 0 ? value : `${value.slice(0, start)}${value.slice(start + lastQwenBlock.length)}`.trimEnd()
  })

  const onNotesChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    notesRef.current = event.target.value
    setNotes(event.target.value)
  }

  const onNotesScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    const input = event.currentTarget
    followOutputRef.current = input.scrollHeight - input.scrollTop - input.clientHeight < 40
  }

  const onNotesKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const input = event.currentTarget
    if (event.key === 'Enter' && !event.shiftKey && input.selectionStart === input.value.length && parseQwenCommand(input.value)) {
      event.preventDefault()
      void runQwen()
    }
  }

  const retrySave = () => {
    if (context) void saveNotes(context.attempt.id, notes)
  }

  return {
    notes, notesInputRef, qwenRunning, qwenStatus, noteSaveFailed, canClearQwen,
    stopQwen, clearQwenOutput, retrySave, onNotesChange, onNotesScroll, onNotesKeyDown,
  }
}
