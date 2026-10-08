import type { PlayerAction } from './api'

interface Pending {
  action: PlayerAction
  resolve: (accepted: boolean) => void
  reject: (error: unknown) => void
}

/** Serialize native controls, retaining only the latest waiting seek.
 * Transport commands are never merged or retried (next must mean next once).
 */
export class SpotifyCommandQueue {
  private pending: Pending[] = []
  busy = false
  private send: (action: PlayerAction) => Promise<void>
  constructor(send: (action: PlayerAction) => Promise<void>) { this.send = send }

  enqueue(action: PlayerAction): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const last = this.pending.at(-1)
      if (action.type === 'seek' && last?.action.type === 'seek') {
        this.pending.pop()!.resolve(false)
      }
      this.pending.push({ action, resolve, reject })
      if (!this.busy) void this.drain()
    })
  }

  private async drain() {
    this.busy = true
    try {
      let next: Pending | undefined
      while ((next = this.pending.shift())) {
        try { await this.send(next.action); next.resolve(true) }
        catch (error) { next.reject(error) }
      }
    } finally { this.busy = false }
  }
}
