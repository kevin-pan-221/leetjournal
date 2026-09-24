import type { Problem } from '../domain'

interface QwenCommand {
  question: string
  includeContext: boolean
}

export function parseQwenCommand(notes: string): QwenCommand | null {
  const lineStart = notes.lastIndexOf('\n') + 1
  const match = notes.slice(lineStart).trim().match(/^@(big-)?qwen\s+(.+)$/i)
  if (!match) return null
  return {
    question: match[2].trim(),
    includeContext: Boolean(match[1]),
  }
}

export function buildContextualPrompt(command: QwenCommand, problem: Problem, code: string): string {
  const currentCode = code.trim()
  const codeLimit = 24_000
  return [
    'Be concise. Give hints, not a full solution, unless asked.',
    `Problem: ${problem.title}`,
    `Code:\n${currentCode.slice(0, codeLimit)}${currentCode.length > codeLimit ? '\n[Code truncated]' : ''}`,
    `Question: ${command.question}`,
  ].join('\n\n')
}
