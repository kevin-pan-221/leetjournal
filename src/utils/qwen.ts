import type { Problem } from '../domain'

interface QwenCommand {
  question: string
  includeContext: boolean
  precedingNotes: string
}

export function parseQwenCommand(notes: string): QwenCommand | null {
  const lineStart = notes.lastIndexOf('\n') + 1
  const match = notes.slice(lineStart).trim().match(/^@(big-)?qwen\s+(.+)$/i)
  if (!match) return null
  return {
    question: match[2].trim(),
    includeContext: Boolean(match[1]),
    precedingNotes: notes.slice(0, lineStart).trim(),
  }
}

export function buildContextualPrompt(command: QwenCommand, problem: Problem, code: string): string {
  return [
    'You are a concise coding coach helping with the current LeetCode problem. Use the supplied context, but do not reveal a complete solution unless the user explicitly asks for one.',
    '',
    `Problem: ${problem.title}`,
    `Category: ${problem.category}`,
    `Difficulty: ${problem.difficulty}`,
    `URL: ${problem.leetcodeUrl}`,
    '',
    'Session notes:',
    command.precedingNotes || '(none)',
    '',
    'Current editor code:',
    '--- CODE START ---',
    code.slice(0, 24_000),
    '--- CODE END ---',
    '',
    `Question: ${command.question}`,
  ].join('\n')
}
