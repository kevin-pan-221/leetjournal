import type { SurfaceLayout, SurfaceReport } from './geometry'

/** One owner and one in-flight layout per cached native surface. */
export class SurfaceController {
  private sequence = 0
  private lease = 0
  private suspended = false
  private pending: { sequence: number; layout: SurfaceLayout | null } | null = null
  private running: Promise<void> | null = null
  private last = ''
  report: SurfaceReport | null = null
  private send: (sequence: number, layout: SurfaceLayout | null) => Promise<SurfaceReport>

  constructor(send: (sequence: number, layout: SurfaceLayout | null) => Promise<SurfaceReport>) { this.send = send }
  attach() { this.suspended = false; this.last = ''; return ++this.lease }
  detach(lease: number) { if (lease === this.lease) return this.hide(); return Promise.resolve() }
  publish(lease: number, layout: SurfaceLayout | null, force = false) {
    if (lease !== this.lease || this.suspended) return Promise.resolve()
    return this.enqueue(layout, force)
  }
  hide() { this.suspended = true; return this.enqueue(null, true) }

  private enqueue(layout: SurfaceLayout | null, force: boolean) {
    const key = JSON.stringify(layout)
    if (!force && key === this.last) return this.running ?? Promise.resolve()
    this.last = key
    this.pending = { sequence: ++this.sequence, layout }
    if (!this.running) this.running = this.drain()
    return this.running
  }

  private async drain() {
    // Assign running before send can synchronously fail; release it in the same
    // continuation that consumes the final update, without a finally-chain gap.
    await Promise.resolve()
    try {
      while (this.pending) {
        const update = this.pending
        this.pending = null
        try {
          this.report = await this.send(update.sequence, update.layout)
          // A native resize may reject a stale DOM viewport. Allow the next
          // layout event to retry even if the CSS measurement is unchanged.
          if (update.layout && !this.report.visible) this.last = ''
        } catch (error) {
          this.last = ''
          // A queued hide must still run if an older geometry update failed.
          if (!this.pending) throw error
        }
      }
    } finally { this.running = null }
  }
}
