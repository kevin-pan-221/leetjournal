import { api } from '../api'
import { createDraftStore } from './draftStore'

const store = createDraftStore((id, draft) => api.saveOfflineDraft(id, draft.code, draft.tests), () => localStorage)
export const stageDraft = store.stage
export function saveDraft(id: string, code: string, tests: string) {
  return store.save(id, { code, tests })
}
export async function readSavedProblem(id: string) {
  await store.settled()
  const saved = await api.offlineProblem(id)
  const recovery = store.recover(id)
  return saved && recovery ? { ...saved, ...recovery, draftRecovered: true } : saved
}
