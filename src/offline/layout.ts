export const splitLimits = {
  description: { min: 25, max: 65, initial: 40 },
  tests: { min: 18, max: 60, initial: 36 },
} as const
export type SplitPanel = keyof typeof splitLimits

export function clampSplit(panel: SplitPanel, value: number) {
  const { min, max, initial } = splitLimits[panel]
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : initial
}
export function readSplit(panel: SplitPanel) {
  try {
    const raw = localStorage.getItem(`leetjournal.offline.layout.${panel}`)
    return raw === null ? splitLimits[panel].initial : clampSplit(panel, Number(raw))
  } catch { return splitLimits[panel].initial }
}
export function saveSplit(panel: SplitPanel, value: number) {
  try { localStorage.setItem(`leetjournal.offline.layout.${panel}`, String(clampSplit(panel, value))) }
  catch { /* Layout still works when browser storage is unavailable. */ }
}
