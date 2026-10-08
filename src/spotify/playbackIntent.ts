import type { Playback } from './api'

/** Acknowledgement does not mean Spotify's read API has caught up yet.
 * Protect only the latest play/pause intent, until confirmed or for at most
 * two seconds after acknowledgement. Never resend playback commands here.
 */
export class PlaybackIntent {
  private pending: { id: number; track: string; playing: boolean; until: number } | null = null

  begin(id: number, playback: Playback, playing: boolean) {
    this.pending = { id, track: this.trackKey(playback), playing, until: Infinity }
  }

  acknowledge(id: number, now: number) {
    if (this.pending?.id === id) this.pending.until = now + 2000
  }

  clear(id?: number) {
    if (id === undefined || this.pending?.id === id) this.pending = null
  }

  shouldDefer(playback: Playback, now: number): boolean {
    const intent = this.pending
    if (!intent) return false
    if (!playback.running || !playback.item || this.trackKey(playback) !== intent.track
      || playback.is_playing === intent.playing || now >= intent.until) {
      this.pending = null
      return false
    }
    return true
  }

  private trackKey(playback: Playback) {
    return JSON.stringify([playback.item?.url, playback.item?.name, playback.item?.artist])
  }
}
