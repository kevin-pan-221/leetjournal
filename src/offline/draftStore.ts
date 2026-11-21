export interface Draft { code: string; tests: string }
interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

/** Write-ahead recovery plus serialized database writes, independent of React mounts. */
export function createDraftStore(write: (id: string, draft: Draft) => Promise<void>, storage: () => Storage) {
  const memory = new Map<string, Draft>()
  let queue: Promise<unknown> = Promise.resolve()
  const key = (id: string) => `leetjournal.offline.draft.v1.${id}`
  const recover = (id: string): Draft | null => {
    if (memory.has(id)) return memory.get(id)!
    try {
      const value = JSON.parse(storage().getItem(key(id)) ?? 'null')
      if (value && typeof value.code === 'string' && typeof value.tests === 'string') {
        memory.set(id, value)
        return value
      }
    } catch { /* The database remains the durable source when recovery is unavailable. */ }
    return null
  }
  const stage = (id: string, draft: Draft) => {
    memory.set(id, draft)
    try { storage().setItem(key(id), JSON.stringify(draft)); return true } catch { return false }
  }
  const save = (id: string, draft: Draft) => {
    // Stage is called synchronously while typing. Never stage an older queued flush.
    if (!memory.has(id)) stage(id, draft)
    const pending = memory.get(id)
    const request = queue.catch(() => {}).then(() => write(id, draft)).then(() => {
      if (memory.get(id) === pending && pending?.code === draft.code && pending.tests === draft.tests) {
        memory.delete(id)
        try { storage().removeItem(key(id)) } catch { /* A stale recovery copy is safe to retain. */ }
      }
    })
    queue = request
    return request
  }
  return { stage, recover, save, settled: () => queue.catch(() => {}) }
}
